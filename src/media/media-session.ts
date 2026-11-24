import { validAvatarSeed } from "@/lib/avatar"
import { applyContentHint, captureScreen, newCaptureController } from "@/lib/capture"
import { LobbyHost, type KnockRequest } from "@/lib/lobby"
import { newSecret, parseSessionInvite, sessionInviteCode, type SessionInvite } from "@/lib/link"
import { detectHardware, setPeerMode } from "@/lib/peer"
import { enterRoom, type RoomSession } from "@/lib/room"
import type { AppSettings, QualityMode } from "@/types"
import { IncomingStream } from "@/media/incoming-stream"
import { collectMetrics } from "@/media/metrics"
import { OutgoingStream } from "@/media/outgoing-stream"
import { acceptsStream, isGuestStreamMetadata, isTreeAssignment, type GuestStreamMetadata, type TreeAssignment } from "@/media/protocol"
import { RelayNode } from "@/media/relay-node"
import { TreeCoordinator, type NodeMetrics } from "@/media/tree-coordinator"

export type SessionStatus = "connecting" | "waiting" | "live" | "reconnecting" | "ended"
export type ViewerInfo = {
  id: string
  name: string
  avatar: number
  parentId: string | null
  relayEnabled: boolean
  children: string[]
  bitrate: number | null
  route: "direct" | "turn" | "unknown"
}
export type Participant = {
  id: string
  name: string
  avatar: number
  role: "host" | "viewer"
  self: boolean
  watching: boolean | null
  /** Só para o host: se a tela está sendo compartilhada agora. */
  sharing?: boolean
}
type Hello = { sessionId: string; hasVideo: boolean }
/** Uma tela que pode aparecer no palco: a do host ou a de um convidado. */
export type StageScreen = {
  id: string
  name: string
  avatar: number
  stream: MediaStream
  self: boolean
  host: boolean
}
export const MAX_VIEWERS = 4
const HELLO_INTERVAL_MS = 4_000
const REPUBLISH_AFTER_MS = 8_000
/** Verificação de presença: quem some sem avisar (app recarregado, travado, sem rede) sai da sala. */
const PRESENCE_INTERVAL_MS = 3_000
const PRESENCE_TIMEOUT_MS = 2_500
const PRESENCE_MAX_MISSES = 4

export class MediaSession {
  readonly role: "host" | "viewer"
  readonly hostId: string
  readonly selfId: string
  readonly invite: SessionInvite
  out: MediaStream | null
  status: SessionStatus = "connecting"
  error: string | null = null

  private screen: MediaStream | null = null
  private incoming = new IncomingStream()
  private assignment: TreeAssignment | null = null
  private coordinator: TreeCoordinator | null = null
  private outputs = new Map<string, OutgoingStream>()
  private relay: RelayNode | null = null
  private offs: (() => void)[] = []
  private stopped = false
  private lastEpoch = -1
  private metricsTimer: number | undefined
  private helloTimer: number | undefined
  private presenceTimer: number | undefined
  private presenceMisses = new Map<string, number>()
  /** Pessoas que ainda constam na conexão mas não respondem mais: tratadas como fora da sala. */
  private gone = new Set<string>()
  private hostSeen = false
  /** Convidado: a própria tela e para quem ela está sendo enviada. */
  private guestScreen: MediaStream | null = null
  private guestTargets = new Set<string>()
  /** Telas de outros convidados recebidas diretamente. */
  private guestStreams = new Map<string, MediaStream>()
  private pendingAssignments: TreeAssignment[] = []
  private pendingStreams = new Map<string, { stream: MediaStream; metadata: unknown }>()
  private outputStartedAt = new Map<string, number>()
  private lobby: LobbyHost | null = null
  private session: RoomSession
  private settings: AppSettings
  private onChange: () => void
  private onEnd: () => void

  private constructor(
    session: RoomSession,
    role: "host" | "viewer",
    hostId: string,
    selfId: string,
    invite: SessionInvite,
    settings: AppSettings,
    onChange: () => void,
    onEnd: () => void,
  ) {
    this.session = session
    this.settings = settings
    this.onChange = onChange
    this.onEnd = onEnd
    this.role = role
    this.hostId = hostId
    this.selfId = selfId
    this.invite = invite
    this.out = null
  }

  /**
   * Host: abre a sala (e o código curto) sem capturar a tela.
   * A tela entra depois com `startSharing`. `onCaptureEnd` avisa quando o Windows encerra a captura.
   */
  static async startHost(settings: AppSettings, onChange: () => void, onCaptureEnd: () => void, onKnock?: (request: KnockRequest) => void): Promise<MediaSession> {
    setPeerMode(settings.mode)
    await detectHardware()
    const secret = newSecret()
    let session: RoomSession | null = null
    try {
      session = await enterRoom(secret, undefined, settings)
      const { userId } = await session.room.getSelf()
      const media = new MediaSession(session, "host", userId, userId, { secret, hostId: userId }, settings, onChange, onCaptureEnd)
      media.sessionId = crypto.randomUUID()
      media.coordinator = new TreeCoordinator(userId, media.sessionId, settings.maxDirectSlots, settings.mode === "sharp" ? 6_000_000 : 8_000_000)
      media.setup()
      await media.setProfile()
      media.status = "live"
      await media.publishLive(true)
      // Sem a sala de espera ainda dá para convidar com o código completo, então uma falha aqui não derruba a sala.
      media.lobby = await LobbyHost.open(media.inviteCode, settings, () => media.viewerCount >= MAX_VIEWERS, (request) => {
        if (request) onKnock?.(request)
        media.onChange()
      }).catch(() => null)
      media.startPresence()
      media.onChange()
      return media
    } catch (error) {
      await session?.room.leave().catch(() => undefined)
      throw error
    }
  }

  /** Host: abre o seletor do Windows e começa a enviar a tela para quem já está na sala. */
  async startSharing(withAudio = false): Promise<void> {
    if (this.role === "viewer") return this.startGuestSharing(withAudio)
    if (this.out || this.stopped) return
    const controller = newCaptureController()
    const screen = await captureScreen(controller?.controller, withAudio)
    controller?.stayHere()
    this.beginSharing(screen)
  }

  /** Host: começa a enviar uma captura já feita para quem está na sala. */
  private beginSharing(screen: MediaStream): void {
    if (this.stopped) {
      for (const track of screen.getTracks()) track.stop()
      return
    }
    applyContentHint(screen.getVideoTracks()[0], this.settings.mode)
    this.screen = screen
    this.out = new MediaStream(screen.getTracks())
    this.watchCaptureEnd()
    void this.publishLive(true).catch(() => undefined)
    for (const nodeId of this.coordinator?.nodes.keys() ?? []) {
      const assignment = nodeId === this.hostId ? null : this.coordinator!.assignmentOf(nodeId)
      if (assignment?.parentId === this.hostId) this.applyHostAssignment(assignment, false)
    }
    this.onChange()
  }

  /** Host: para de enviar a tela, mas mantém a sala aberta e as pessoas dentro. */
  async stopSharing(): Promise<void> {
    if (this.role === "viewer") return this.stopGuestSharing()
    if (!this.out) return
    for (const output of this.outputs.values()) output.close()
    this.outputs.clear()
    this.outputStartedAt.clear()
    for (const track of this.out.getTracks()) track.stop()
    this.out = null
    this.screen = null
    if (!this.stopped) await this.publishLive(true).catch(() => undefined)
    this.onChange()
  }

  /** Se a minha tela está indo com som. */
  get sharingAudio(): boolean {
    const own = this.role === "host" ? this.out : this.guestScreen
    return Boolean(own?.getAudioTracks().some((track) => track.readyState === "live"))
  }

  /** Se eu estou compartilhando a minha tela (host ou convidado). */
  get sharing(): boolean {
    return this.role === "host" ? Boolean(this.out) : Boolean(this.guestScreen)
  }

  /** Se o host está compartilhando a tela dele. */
  get hostSharing(): boolean {
    if (this.role === "host") return Boolean(this.out)
    const state = this.session.live.get()
    return state.live && state.sharing !== false
  }

  /** Todas as telas da sala, com a do host primeiro. */
  get screens(): StageScreen[] {
    const nameOf = (id: string) => (this.session.profiles.has(id) ? this.session.profiles.get(id).name : "") || "Convidado"
    const avatarOf = (id: string, self = false) => validAvatarSeed(self ? this.settings.avatarSeed : this.session.profiles.has(id) ? this.session.profiles.get(id).avatar : 0, id)
    const list: StageScreen[] = []
    const hostStream = this.role === "host" ? this.out : this.incoming.stream
    if (hostStream && this.hostSharing) {
      const hostName = this.role === "host" ? this.settings.displayName : this.session.live.get().hostName || nameOf(this.hostId)
      list.push({ id: this.hostId, name: hostName, avatar: avatarOf(this.hostId, this.role === "host"), stream: hostStream, self: this.role === "host", host: true })
    }
    if (this.guestScreen) list.push({ id: this.selfId, name: this.settings.displayName, avatar: this.settings.avatarSeed, stream: this.guestScreen, self: true, host: false })
    for (const [id, stream] of this.guestStreams) {
      if (!this.gone.has(id)) list.push({ id, name: nameOf(id), avatar: avatarOf(id), stream, self: false, host: false })
    }
    return list
  }

  /** Convidado: compartilha a própria tela direto com cada pessoa da sala. */
  private async startGuestSharing(withAudio: boolean): Promise<void> {
    if (this.guestScreen || this.stopped) return
    const controller = newCaptureController()
    const screen = await captureScreen(controller?.controller, withAudio)
    controller?.stayHere()
    if (this.stopped) {
      for (const track of screen.getTracks()) track.stop()
      return
    }
    applyContentHint(screen.getVideoTracks()[0], this.settings.mode)
    this.guestScreen = screen
    const video = screen.getVideoTracks()[0]
    video?.addEventListener("ended", () => {
      // Encerrado pela barra do Windows: só para a tela do convidado, ele continua na sala.
      if (this.guestScreen === screen) void this.stopGuestSharing()
    }, { once: true })
    await this.setProfile().catch(() => undefined)
    for (const id of this.presentUsers()) this.sendGuestScreen(id)
    this.onChange()
  }

  private async stopGuestSharing(): Promise<void> {
    const screen = this.guestScreen
    if (!screen) return
    this.guestScreen = null
    for (const id of this.guestTargets) this.session.room.removeStream(screen, { target: id })
    this.guestTargets.clear()
    for (const track of screen.getTracks()) track.stop()
    if (!this.stopped) await this.setProfile().catch(() => undefined)
    this.onChange()
  }

  private sendGuestScreen(userId: string): void {
    if (!this.guestScreen || userId === this.selfId || this.guestTargets.has(userId)) return
    this.guestTargets.add(userId)
    const metadata: GuestStreamMetadata = { kind: "guest-screen", sessionId: this.sessionId, ownerId: this.selfId }
    void this.session.room.addStream(this.guestScreen, { target: userId, metadata }).catch(() => this.guestTargets.delete(userId))
  }

  private setProfile(): Promise<void> {
    const relay = this.role === "viewer"
    return this.session.profiles.set({
      name: this.settings.displayName,
      avatar: this.settings.avatarSeed,
      relayEnabled: relay && this.settings.relayEnabled,
      relaySlots: relay ? this.settings.relaySlots : 0,
      sharing: Boolean(this.guestScreen),
    })
  }

  static async watch(code: string, settings: AppSettings, onChange: () => void, onEnd: () => void): Promise<MediaSession> {
    const invite = parseSessionInvite(code)
    setPeerMode(settings.mode)
    const session = await enterRoom(invite.secret, invite.hostId, settings)
    try {
      const { userId } = await session.room.getSelf()
      const media = new MediaSession(session, "viewer", invite.hostId, userId, invite, settings, onChange, onEnd)
      media.relay = new RelayNode(session, invite.hostId, "")
      media.setup()
      await media.setProfile()
      media.startMetrics()
      media.startHello()
      media.startPresence()
      media.onChange()
      return media
    } catch (error) {
      await session.room.leave().catch(() => undefined)
      throw error
    }
  }

  private sessionId = ""

  get id(): string {
    return this.sessionId
  }

  get inviteCode(): string {
    return sessionInviteCode(this.invite)
  }

  get stream(): MediaStream | null {
    return this.role === "host" ? this.out : this.incoming.stream
  }

  get parentId(): string | null {
    return this.assignment?.parentId ?? null
  }

  get parentName(): string | null {
    if (!this.parentId) return null
    if (this.parentId === this.hostId) return this.session.live.get().hostName || "Origem"
    return this.session.profiles.get(this.parentId).name || "Retransmissão"
  }

  get childIds(): string[] {
    return this.relay?.activeChildren ?? []
  }

  get viewers(): ViewerInfo[] {
    if (!this.coordinator) return []
    return Array.from(this.coordinator.nodes.values()).filter((node) => node.nodeId !== this.hostId).map((node) => ({
      id: node.nodeId,
      name: this.session.profiles.has(node.nodeId) ? this.session.profiles.get(node.nodeId).name : "Conectando…",
      avatar: validAvatarSeed(this.session.profiles.has(node.nodeId) ? this.session.profiles.get(node.nodeId).avatar : 0, node.nodeId),
      parentId: node.parentId,
      relayEnabled: node.relayEnabled,
      children: Array.from(this.coordinator!.nodes.values()).filter((child) => child.parentId === node.nodeId).map((child) => child.nodeId),
      bitrate: node.metrics?.incomingBitrate ?? null,
      route: node.metrics?.route ?? "unknown",
    }))
  }

  get participants(): Participant[] {
    const nameOf = (id: string) => (this.session.profiles.has(id) ? this.session.profiles.get(id).name : "") || "Entrando…"
    const avatarOf = (id: string, self = false) => validAvatarSeed(self ? this.settings.avatarSeed : this.session.profiles.has(id) ? this.session.profiles.get(id).avatar : 0, id)
    const hostName = this.role === "host" ? this.settings.displayName : this.session.live.get().hostName || nameOf(this.hostId)
    const host: Participant = { id: this.hostId, name: hostName || "Anfitrião", avatar: avatarOf(this.hostId, this.role === "host"), role: "host", self: this.role === "host", watching: null, sharing: this.hostSharing }
    const others = this.presentUsers()
      .filter((id) => id !== this.hostId)
      .map((id): Participant => {
        const self = id === this.selfId
        const fps = this.coordinator?.nodes.get(id)?.metrics?.framesPerSecond
        const watching = self ? this.status === "live" : this.role === "host" && typeof fps === "number" ? fps > 0 : null
        const sharing = self ? Boolean(this.guestScreen) : this.guestStreams.has(id)
        return { id, name: self ? this.settings.displayName : nameOf(id), avatar: avatarOf(id, self), role: "viewer", self, watching, sharing }
      })
    if (this.role === "viewer" && !others.some((item) => item.self)) {
      others.push({ id: this.selfId, name: this.settings.displayName, avatar: this.settings.avatarSeed, role: "viewer", self: true, watching: this.status === "live", sharing: Boolean(this.guestScreen) })
    }
    others.sort((a, b) => Number(b.self) - Number(a.self) || a.name.localeCompare(b.name))
    return [host, ...others]
  }

  get viewerCount(): number {
    return this.presentUsers().filter((id) => id !== this.hostId).length
  }

  private presentUsers(): string[] {
    return Object.keys(this.session.room.getUsers()).filter((id) => !this.gone.has(id))
  }

  /** Código curto da sala de espera (8 caracteres), ou null se ela não abriu. */
  get shortCode(): string | null {
    return this.lobby?.code ?? null
  }

  get knocks(): KnockRequest[] {
    return this.lobby?.pending ?? []
  }

  admit(id: string): void {
    this.lobby?.admit(id)
  }

  deny(id: string): void {
    this.lobby?.deny(id)
  }

  /** Aceita quem está esperando, por ordem de chegada, até lotar a sala. Retorna os aceitos. */
  admitAll(): KnockRequest[] {
    const free = Math.max(0, MAX_VIEWERS - this.viewerCount)
    const admitted = this.knocks.slice(0, free)
    for (const request of admitted) this.admit(request.id)
    return admitted
  }

  get directOutputs(): number {
    return this.role === "host" ? this.outputs.size : this.childIds.length
  }

  get uploadBitrate(): number | null {
    const values = this.viewers.map((viewer) => viewer.bitrate).filter((value): value is number => value !== null)
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null
  }

  get mode(): QualityMode {
    return this.settings.mode
  }

  setMode(mode: QualityMode): void {
    this.settings = { ...this.settings, mode }
    if (this.screen) applyContentHint(this.screen.getVideoTracks()[0], mode)
    setPeerMode(mode)
    this.onChange()
  }

  updateSettings(settings: AppSettings): void {
    this.settings = settings
    if (this.stopped) return
    void this.setProfile().catch(() => undefined)
    if (this.role === "host") void this.publishLive(this.status !== "ended").catch(() => undefined)
    this.onChange()
  }

  async changeSource(withAudio = false): Promise<void> {
    if (this.role !== "host" || !this.out) return
    const controller = newCaptureController()
    const next = await captureScreen(controller?.controller, withAudio)
    controller?.stayHere()
    const oldVideo = this.out.getVideoTracks()[0]
    const newVideo = next.getVideoTracks()[0]
    if (!oldVideo || !newVideo) {
      for (const track of next.getTracks()) track.stop()
      throw new Error("A nova fonte não contém vídeo.")
    }
    const oldAudio = this.out.getAudioTracks()[0]
    const newAudio = next.getAudioTracks()[0]
    if (Boolean(oldAudio) !== Boolean(newAudio)) {
      // O som entrou ou saiu: reabre o envio para todos com a nova captura (leva um instante).
      await this.stopSharing()
      this.beginSharing(next)
      return
    }
    applyContentHint(newVideo, this.settings.mode)
    await this.session.room.replaceTrack(oldVideo, newVideo)
    this.out.removeTrack(oldVideo)
    this.out.addTrack(newVideo)
    oldVideo.stop()
    if (oldAudio && newAudio) {
      await this.session.room.replaceTrack(oldAudio, newAudio)
      this.out.removeTrack(oldAudio)
      this.out.addTrack(newAudio)
      oldAudio.stop()
    }
    this.screen = next
    this.watchCaptureEnd()
    this.onChange()
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    if (this.presenceTimer !== undefined) window.clearInterval(this.presenceTimer)
    if (this.metricsTimer !== undefined) window.clearInterval(this.metricsTimer)
    if (this.helloTimer !== undefined) window.clearInterval(this.helloTimer)
    this.pendingStreams.clear()
    for (const off of this.offs) off()
    for (const output of this.outputs.values()) output.close()
    this.outputs.clear()
    this.relay?.close()
    await this.lobby?.close()
    if (this.role === "host") await this.publishLive(false).catch(() => undefined)
    if (this.out) for (const track of this.out.getTracks()) track.stop()
    this.out = null
    for (const track of this.guestScreen?.getTracks() ?? []) track.stop()
    this.guestScreen = null
    this.guestStreams.clear()
    await this.session.room.leave().catch(() => undefined)
    this.status = "ended"
    this.incoming.clear()
    this.onChange()
  }

  /**
   * Fechamento imediato (janela fechando/recarregando): não dá tempo de esperar o `stop()` assíncrono,
   * então encerramos as conexões já. O outro lado vê a conexão fechar e tira a pessoa da sala na hora.
   */
  closeNow(): void {
    if (this.stopped) return
    for (const track of this.out?.getTracks() ?? []) track.stop()
    for (const track of this.guestScreen?.getTracks() ?? []) track.stop()
    for (const peer of Object.values(this.session.room.getPeers())) {
      try {
        peer.connection?.close()
      } catch {
        // já fechada
      }
    }
    void this.stop()
  }

  async getConnections(): Promise<RTCPeerConnection[]> {
    return Object.values(this.session.room.getPeers()).flatMap((peer) => peer.connection ? [peer.connection] : [])
  }

  private setup(): void {
    const assignments = this.session.room.makeAction<TreeAssignment>("tree")
    const metrics = this.session.room.makeAction<NodeMetrics>("metrics")
    const hello = this.session.room.makeAction<Hello>("hello")
    this.offs.push(
      hello.onMessage((message, context) => this.handleHello(message, context.userId)),
      assignments.onMessage((assignment, context) => void this.handleAssignment(assignment, context.userId)),
      metrics.onMessage((report, context) => this.handleMetrics(report, context.userId)),
      this.session.room.onPeerStream((stream, context) => void this.receiveStream(stream, context.userId, context.metadata)),
      this.session.live.onChange((state, context) => {
        if (this.role === "host" || context.userId !== this.hostId || state.originHostId !== this.hostId) return
        const sessionChanged = this.sessionId !== state.sessionId
        this.sessionId = state.sessionId
        if (this.relay && sessionChanged) {
          this.relay.close()
          this.relay = new RelayNode(this.session, this.hostId, state.sessionId)
        }
        if (state.live && state.sessionId) this.flushPendingAssignments()
        if (state.live && state.sharing === false && this.status !== "ended") {
          // O host parou de compartilhar, mas a sala continua: espera a tela voltar.
          this.incoming.clear()
          this.pendingStreams.clear()
          this.status = "waiting"
        } else if (state.live && this.status === "waiting") {
          this.status = "connecting"
        }
        if (!state.live) {
          this.status = "ended"
          this.incoming.clear()
          this.relay?.close()
          if (this.helloTimer !== undefined) window.clearInterval(this.helloTimer)
          this.onEnd()
        }
        this.onChange()
      }, { replay: true }),
      this.session.profiles.onChange(() => {
        if (this.role === "host") this.syncHostTree()
        for (const id of this.guestStreams.keys()) {
          if (this.session.profiles.has(id) && this.session.profiles.get(id).sharing === false) this.guestStreams.delete(id)
        }
        this.onChange()
      }),
      this.session.room.onUserJoin(({ userId }) => {
        if (this.role === "host") this.syncHostTree()
        this.sendGuestScreen(userId)
        this.onChange()
      }),
      this.session.room.onUserLeave(({ userId }) => {
        this.presenceMisses.delete(userId)
        this.gone.delete(userId)
        if (this.role === "viewer" && userId === this.hostId && this.status !== "ended") this.status = "reconnecting"
        this.forgetUser(userId)
      }),
      this.session.room.onError((error) => {
        if (error.code === "peer-connect-failed") this.error = "A conexão direta falhou. Verifique a configuração TURN nas duas redes."
        if (error.code === "banned") this.status = "ended"
        this.onChange()
      }),
    )
  }

  private syncHostTree(): void {
    if (!this.coordinator) return
    const users = this.presentUsers().filter((id) => id !== this.hostId).sort()
    if (users.length > MAX_VIEWERS) {
      this.error = "A sala atingiu o limite de quatro espectadores."
      return
    }
    for (const nodeId of users) {
      const profile = this.session.profiles.has(nodeId) ? this.session.profiles.get(nodeId) : { relayEnabled: false, relaySlots: 0 }
      if (!this.coordinator.nodes.has(nodeId)) {
        const assignment = this.coordinator.addNode({ nodeId, relayEnabled: profile.relayEnabled, relaySlots: profile.relaySlots }) ?? this.coordinator.recoverNode(nodeId)
        if (assignment) this.applyHostAssignment(assignment)
      } else {
        const assignments = this.coordinator.setRelay(nodeId, profile.relayEnabled, profile.relaySlots)
        for (const assignment of assignments) this.applyHostAssignment(assignment)
      }
    }
    for (const assignment of this.coordinator.rebalance()) this.applyHostAssignment(assignment)
  }

  private applyHostAssignment(assignment: TreeAssignment, broadcast = true): void {
    if (broadcast) void this.session.room.makeAction<TreeAssignment>("tree").send(assignment).catch(() => undefined)
    if (assignment.parentId === this.hostId) {
      // Sem tela ainda: a pessoa já fica com seu lugar na árvore e recebe o vídeo quando o host compartilhar.
      if (!this.out) {
        this.onChange()
        return
      }
      const output = new OutgoingStream(this.session, this.out, assignment.childId, {
        kind: "screen",
        sessionId: this.sessionId,
        originHostId: this.hostId,
        parentId: this.hostId,
        treeEpoch: assignment.treeEpoch,
      })
      this.outputs.get(assignment.childId)?.close()
      this.outputs.set(assignment.childId, output)
      this.outputStartedAt.set(assignment.childId, Date.now())
      void output.publish().catch(() => {
        this.error = "Não foi possível publicar mídia para um espectador."
        this.onChange()
      })
    } else {
      const previous = this.outputs.get(assignment.childId)
      if (previous) window.setTimeout(() => {
        const current = this.coordinator?.nodes.get(assignment.childId)
        if (current?.parentId !== this.hostId) {
          previous.close()
          this.outputs.delete(assignment.childId)
          this.onChange()
        }
      }, 10_000)
    }
    this.onChange()
  }

  private async handleAssignment(assignment: TreeAssignment, senderId: string): Promise<void> {
    if (this.role !== "viewer" || senderId !== this.hostId || !isTreeAssignment(assignment)) return
    // A atribuição pode chegar antes do estado "live" (que traz o sessionId). Antes ela era
    // descartada e nunca reenviada, deixando o espectador preso em "Aguardando atribuição".
    if (!this.sessionId) {
      this.pendingAssignments = [...this.pendingAssignments.slice(-15), assignment]
      return
    }
    if (assignment.sessionId !== this.sessionId || assignment.treeEpoch < this.lastEpoch || assignment.expiresAt < Date.now()) return
    if (assignment.parentId !== this.selfId) this.relay?.remove(assignment.childId)
    if (assignment.parentId === this.selfId && this.settings.relayEnabled) await this.relay?.assign(assignment.childId, assignment.treeEpoch)
    if (assignment.childId !== this.selfId) return
    if (assignment.parentTrysteroId !== assignment.parentId || assignment.childId === assignment.parentId) return
    this.assignment = assignment
    this.lastEpoch = assignment.treeEpoch
    this.status = !this.hostSharing ? "waiting" : this.incoming.stream ? "reconnecting" : "connecting"
    this.onChange()
    const buffered = this.pendingStreams.get(assignment.parentId)
    if (buffered) void this.receiveStream(buffered.stream, assignment.parentId, buffered.metadata)
  }

  private flushPendingAssignments(): void {
    const pending = this.pendingAssignments
    this.pendingAssignments = []
    for (const assignment of pending) void this.handleAssignment(assignment, this.hostId)
  }

  private startPresence(): void {
    this.presenceTimer = window.setInterval(() => void this.checkPresence(), PRESENCE_INTERVAL_MS)
  }

  private async checkPresence(): Promise<void> {
    if (this.stopped) return
    const ids = Object.keys(this.session.room.getUsers()).filter((id) => id !== this.selfId)
    for (const id of this.presenceMisses.keys()) if (!ids.includes(id)) this.presenceMisses.delete(id)
    for (const id of this.gone) if (!ids.includes(id)) this.gone.delete(id)
    // Espectador: depois de ver o host uma vez, ele precisa continuar respondendo, mesmo que suma da lista
    // (ex.: recarregou o app e nunca mais volta para esta sala).
    if (ids.includes(this.hostId)) this.hostSeen = true
    if (this.role === "viewer" && this.hostSeen && !ids.includes(this.hostId) && this.status !== "ended") ids.push(this.hostId)
    await Promise.all(ids.map(async (id) => {
      const alive = Object.keys(this.session.room.getUsers()).includes(id) && await Promise.race([
        this.session.room.ping(id).then(() => true, () => false),
        new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), PRESENCE_TIMEOUT_MS)),
      ])
      if (this.stopped) return
      if (alive) {
        this.presenceMisses.delete(id)
        if (this.gone.delete(id)) {
          if (this.role === "host") this.syncHostTree()
          this.onChange()
        }
        return
      }
      const misses = (this.presenceMisses.get(id) ?? 0) + 1
      this.presenceMisses.set(id, misses)
      if (misses >= PRESENCE_MAX_MISSES && !this.gone.has(id)) {
        this.gone.add(id)
        this.handleGone(id)
      }
    }))
  }

  /** Alguém parou de responder: age como se tivesse saído da sala. */
  private handleGone(userId: string): void {
    if (this.role === "viewer" && userId === this.hostId) {
      if (this.status === "ended") return
      this.status = "ended"
      this.error = null
      this.incoming.clear()
      this.relay?.close()
      if (this.helloTimer !== undefined) window.clearInterval(this.helloTimer)
      this.onEnd()
      this.onChange()
      return
    }
    this.forgetUser(userId)
  }

  private forgetUser(userId: string): void {
    if (this.role === "host" && this.coordinator) {
      const next = this.coordinator.removeNode(userId)
      for (const assignment of next) this.applyHostAssignment(assignment)
      this.outputs.get(userId)?.close()
      this.outputs.delete(userId)
      this.outputStartedAt.delete(userId)
    } else if (userId === this.parentId) {
      this.status = "reconnecting"
    }
    this.pendingStreams.delete(userId)
    this.guestStreams.delete(userId)
    this.guestTargets.delete(userId)
    this.onChange()
  }

  /** Espectador: enquanto não recebe vídeo, pede ao host que reenvie a atribuição. */
  private startHello(): void {
    const send = () => {
      if (this.stopped || this.status === "live" || this.status === "ended" || !this.sessionId) return
      void this.session.room.makeAction<Hello>("hello").send({ sessionId: this.sessionId, hasVideo: Boolean(this.incoming.stream) }, { target: this.hostId }).catch(() => undefined)
    }
    this.helloTimer = window.setInterval(send, HELLO_INTERVAL_MS)
    window.setTimeout(send, 1_000)
  }

  /** Host: um espectador sem atribuição/vídeo pede reenvio. */
  private handleHello(message: Hello, senderId: string): void {
    if (this.role !== "host" || !this.coordinator || typeof message?.sessionId !== "string" || message.sessionId !== this.sessionId) return
    if (!this.coordinator.nodes.has(senderId)) this.syncHostTree()
    const assignment = this.coordinator.assignmentOf(senderId)
    if (!assignment) return
    void this.session.room.makeAction<TreeAssignment>("tree").send(assignment, { target: senderId }).catch(() => undefined)
    const startedAt = this.outputStartedAt.get(senderId) ?? 0
    if (!message.hasVideo && assignment.parentId === this.hostId && Date.now() - startedAt > REPUBLISH_AFTER_MS) {
      this.applyHostAssignment(assignment, false)
    }
  }

  private async receiveStream(stream: MediaStream, senderId: string, metadata: unknown): Promise<void> {
    if (isGuestStreamMetadata(metadata)) {
      // O sessionId do espectador pode ainda não ter chegado; nesse caso aceitamos pelo dono do stream.
      if (metadata.ownerId !== senderId || (this.sessionId && metadata.sessionId && metadata.sessionId !== this.sessionId)) return
      this.guestStreams.set(senderId, stream)
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (this.guestStreams.get(senderId) === stream) {
          this.guestStreams.delete(senderId)
          this.onChange()
        }
      }, { once: true })
      this.onChange()
      return
    }
    if (this.role !== "viewer") return
    // O stream pode chegar antes da atribuição: guarda para usar quando ela chegar.
    this.pendingStreams.set(senderId, { stream, metadata })
    if (!this.assignment || senderId !== this.assignment.parentId) return
    const expected = { sessionId: this.sessionId, originHostId: this.hostId, parentId: this.assignment.parentId }
    if (!acceptsStream(metadata, expected, this.lastEpoch)) return
    if (!(await this.firstFrame(stream))) return
    if (this.assignment?.parentId !== senderId) return
    this.pendingStreams.delete(senderId)
    this.incoming.transition(stream)
    this.relay?.setIncoming(stream)
    this.status = "live"
    this.error = null
    this.onChange()
  }

  private handleMetrics(report: NodeMetrics, senderId: string): void {
    if (this.role !== "host" || !this.coordinator || senderId !== report.nodeId || report.sessionId !== this.sessionId) return
    this.coordinator.updateMetrics(senderId, report, (report.framesPerSecond ?? 0) > 0)
    this.coordinator.completeMigration(senderId)
    for (const assignment of this.coordinator.rebalance()) this.applyHostAssignment(assignment)
    this.onChange()
  }

  private startMetrics(): void {
    this.metricsTimer = window.setInterval(() => void this.reportMetrics(), 5_000)
    window.setTimeout(() => void this.reportMetrics(), 1_500)
  }

  private async reportMetrics(): Promise<void> {
    if (!this.assignment || this.stopped) return
    const peer = Object.values(this.session.room.getPeers()).find((item) => item.userId === this.assignment?.parentId)?.connection
    if (!peer) return
    const report = await collectMetrics(peer, {
      nodeId: this.selfId,
      sessionId: this.sessionId,
      treeEpoch: this.lastEpoch,
      activeChildren: this.childIds.length,
      relayEnabled: this.settings.relayEnabled,
      relaySlots: this.settings.relaySlots,
    })
    await this.session.room.makeAction<NodeMetrics>("metrics").send(report, { target: this.hostId }).catch(() => undefined)
  }

  private async publishLive(live: boolean): Promise<void> {
    await this.session.live.set({ live, sessionId: this.sessionId, originHostId: this.hostId, hostName: this.settings.displayName, sharing: live && Boolean(this.out) })
  }

  private watchCaptureEnd(): void {
    const video = this.screen?.getVideoTracks()[0]
    video?.addEventListener("ended", () => {
      if (this.screen?.getVideoTracks()[0] !== video) return
      // Encerrado pela barra do Windows: para só a tela, a sala continua aberta.
      void this.stopSharing().then(this.onEnd)
    }, { once: true })
  }

  private firstFrame(stream: MediaStream): Promise<boolean> {
    const track = stream.getVideoTracks()[0]
    if (!track || track.readyState !== "live") return Promise.resolve(false)
    return new Promise((resolve) => {
      const video = document.createElement("video")
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      const timeout = window.setTimeout(() => {
        cleanup()
        resolve(false)
      }, 10_000)
      const cleanup = () => {
        window.clearTimeout(timeout)
        video.pause()
        video.srcObject = null
      }
      video.onloadeddata = () => {
        cleanup()
        resolve(true)
      }
      void video.play().catch(() => {
        cleanup()
        resolve(false)
      })
    })
  }
}
