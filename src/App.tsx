import { useCallback, useEffect, useRef, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { AppShell } from "@/components/app-shell"
import { Logo } from "@/components/logo"
import { Notice } from "@/components/notice"
import { Spinner } from "@/components/ui/spinner"
import { addFriend, discordAvailable, updateDiscordPresence, type DiscordPresence, getPublicKey, getSettings, isTauri, listFriends, setAcceptShortcut, ACCEPT_SHORTCUT, removeFriend, saveSettings, setAutostart, showToast, showWindow, updateSharingState, updateShortcut, type ToastItem } from "@/lib/desktop"
import { Inbox, sendRoomInvite, type ReceivedInvite } from "@/lib/inbox"
import { joinCodeFromUrl } from "@/lib/deep-link"
import { installDesktopGuards } from "@/lib/desktop-guards"
import { findShortCode, knock } from "@/lib/lobby"
import { parseSessionInvite } from "@/lib/link"
import { MediaSession } from "@/media/media-session"
import { HomeScreen } from "@/screens/home"
import { RoomScreen } from "@/screens/room"
import { SettingsScreen } from "@/screens/settings"
import { ViewerScreen } from "@/screens/viewer"
import { WelcomeScreen } from "@/screens/welcome"
import { hasRealName, wantsAudio } from "@/types"
import type { AppSettings, AppView, Friend, QualityMode, SessionNotice } from "@/types"

type JoinOptions = { signal?: AbortSignal; onWaiting?: () => void }

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [friends, setFriends] = useState<Friend[]>([])
  const [view, setView] = useState<AppView>("home")
  const [session, setSession] = useState<MediaSession | null>(null)
  const [, setRevision] = useState(0)
  const [starting, setStarting] = useState(false)
  const [notice, setNotice] = useState<SessionNotice>(null)
  const [invites, setInvites] = useState<ReceivedInvite[]>([])
  const settingsRef = useRef(settings)
  const sessionRef = useRef(session)
  const friendsRef = useRef(friends)
  useEffect(() => {
    friendsRef.current = friends
  }, [friends])
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => installDesktopGuards(), [])

  // Fechar ou recarregar a janela: tenta avisar a sala na hora, em vez de deixar os outros esperando.
  useEffect(() => {
    const leave = () => sessionRef.current?.closeNow()
    window.addEventListener("pagehide", leave)
    return () => window.removeEventListener("pagehide", leave)
  }, [])

  const notify = useCallback((next: SessionNotice) => setNotice(next), [])
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    void Promise.all([getSettings(), listFriends()]).then(([loadedSettings, loadedFriends]) => {
      setSettings(loadedSettings)
      setFriends(loadedFriends)
    }).catch((reason) => notify({ tone: "error", title: "Não foi possível carregar os dados", description: String(reason) }))
  }, [notify])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 4500)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const stop = useCallback(async () => {
    const current = sessionRef.current
    if (!current) return
    await current.stop()
    setSession(null)
    setView(current.role === "viewer" ? "home" : "room")
    await updateSharingState({ live: false, sessionId: null, viewerCount: 0, directOutputs: 0 })
    notify({ tone: "info", title: current.role === "viewer" ? "Você saiu da sala" : "Sala fechada" })
  }, [notify])

  const start = useCallback(async () => {
    const currentSettings = settingsRef.current
    if (!currentSettings || starting || sessionRef.current) return
    setStarting(true)
    try {
      const next = await MediaSession.startHost(currentSettings, refresh, () => {
        notify({ tone: "info", title: "Você parou de compartilhar", description: "A sala continua aberta. Compartilhe de novo quando quiser." })
      }, (request) => {
        notify({ tone: "info", title: `${request.name} quer entrar`, description: "Aceite ou recuse na sua sala." })
        setView("room")
      })
      setSession(next)
      setView("room")
      notify({ tone: "success", title: "Sala criada", description: "Mande o código para seus amigos. Compartilhe a tela quando quiser." })
    } catch (reason) {
      notify({ tone: "error", title: "Não foi possível criar a sala", description: reason instanceof Error ? reason.message : String(reason) })
    } finally {
      setStarting(false)
    }
  }, [notify, refresh, starting])

  const share = useCallback(async () => {
    const current = sessionRef.current
    const currentSettings = settingsRef.current
    if (!current || current.status === "ended" || !currentSettings) return
    const withAudio = wantsAudio(currentSettings)
    try {
      await current.startSharing(withAudio)
      if (current.sharing) {
        if (withAudio && !current.sharingAudio) notify({ tone: "info", title: "Compartilhando sem som", description: "Para levar o som, escolha uma tela inteira e marque “Compartilhar áudio do sistema”." })
        else notify({ tone: "success", title: current.sharingAudio ? "Compartilhando tela e som" : "Compartilhando sua tela" })
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "NotAllowedError") {
        notify({ tone: "info", title: "Nada foi compartilhado", description: current.role === "host" ? "Você fechou o seletor. A sala continua aberta." : "Você fechou o seletor." })
      } else {
        notify({ tone: "error", title: "Não foi possível compartilhar", description: reason instanceof Error ? reason.message : String(reason) })
      }
    }
  }, [notify])

  const stopSharing = useCallback(async () => {
    const current = sessionRef.current
    if (!current?.sharing) return
    await current.stopSharing()
    notify({ tone: "info", title: "Você parou de compartilhar", description: current.role === "host" ? "A sala continua aberta e seus amigos continuam nela." : "Você continua na sala." })
  }, [notify])

  const setAudio = async (enabled: boolean) => {
    const current = settingsRef.current
    if (!current) return
    try {
      setSettings(await saveSettings({ ...current, audioMode: enabled ? "system" : "none" }))
    } catch (reason) {
      notify({ tone: "error", title: "Não foi possível salvar", description: reason instanceof Error ? reason.message : String(reason) })
    }
  }

  const join = async (text: string, options: JoinOptions = {}) => {
    const currentSettings = settingsRef.current
    if (!currentSettings) return
    if (sessionRef.current && sessionRef.current.status !== "ended") {
      throw new Error(sessionRef.current.role === "host" ? "Feche a sua sala antes de entrar na de outra pessoa." : "Saia da sala atual antes de entrar em outra.")
    }
    let code = text
    try {
      parseSessionInvite(text)
    } catch (invalidFull) {
      // Não é um convite completo: tenta o código curto e espera o host aceitar.
      const short = findShortCode(text)
      if (!short) throw new Error("Não reconhecemos esse código. Ele tem 8 letras e números, como KX7P-42QM.", { cause: invalidFull })
      options.onWaiting?.()
      code = await knock(short, currentSettings, options.signal)
    }
    if (sessionRef.current) await sessionRef.current.stop()
    const next = await MediaSession.watch(code, currentSettings, refresh, () => {
      notify({ tone: "info", title: "A sala foi fechada" })
      refresh()
    })
    setSession(next)
    setView("room")
  }

  useEffect(() => {
    joinRef.current = (text: string) => join(text)
  })

  // Link sevenlas://entrar/CÓDIGO (botão do Discord, página de convite): abre o app já pedindo para entrar.
  const [pendingJoin, setPendingJoin] = useState<{ code: string; nonce: number } | null>(null)
  useEffect(() => {
    if (!isTauri) return
    const handle = (urls: string[] | null) => {
      const code = urls?.map(joinCodeFromUrl).find((item): item is string => Boolean(item))
      if (!code) return
      void showWindow().catch(() => undefined)
      if (sessionRef.current && sessionRef.current.status !== "ended") {
        notify({ tone: "error", title: "Você já está numa sala", description: "Saia ou feche a sala atual para entrar em outra." })
        return
      }
      setView("home")
      setPendingJoin({ code, nonce: Date.now() })
    }
    let unlisten: (() => void) | undefined
    let cancelled = false
    void import("@tauri-apps/plugin-deep-link").then(async ({ getCurrent, onOpenUrl }) => {
      handle(await getCurrent().catch(() => null))
      const off = await onOpenUrl(handle)
      if (cancelled) off()
      else unlisten = off
    }).catch(() => undefined)
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [notify])

  // Atalho global para aceitar: só existe enquanto alguém está esperando na porta.
  const hasKnocks = session?.role === "host" && session.knocks.length > 0
  const [acceptShortcut, setAcceptShortcutActive] = useState(false)
  useEffect(() => {
    void setAcceptShortcut(hasKnocks).then(setAcceptShortcutActive).catch(() => setAcceptShortcutActive(false))
  }, [hasKnocks])

  // Caixa de entrada: amigos podem chamar você para a sala deles enquanto o 7las estiver aberto.
  const settingsReady = settings !== null && hasRealName(settings.displayName)
  useEffect(() => {
    const current = settingsRef.current
    if (!settingsReady || !current) return
    let inbox: Inbox | null = null
    let cancelled = false
    void getPublicKey()
      .then((publicKey) => Inbox.open(current, publicKey, (key) => friendsRef.current.some((friend) => friend.publicKey === key), (invite) => {
        setInvites((list) => [...list.filter((item) => item.fromKey !== invite.fromKey), invite])
        notify({ tone: "info", title: `${invite.fromName} te chamou para a sala`, description: "Clique em “Entrar” no aviso." })
      }))
      .then((opened) => {
        if (cancelled) void opened.close()
        else inbox = opened
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      void inbox?.close()
    }
  }, [settingsReady, notify])

  // Aviso próprio do 7las no canto da tela: pedidos para entrar (host) e convites de amigos.
  const knocks = session?.role === "host" ? session.knocks : []
  const toastItems: ToastItem[] = [
    ...knocks.map((request) => ({
      id: `knock:${request.id}`,
      title: `${request.name} quer entrar na sua sala`,
      body: acceptShortcut ? `Aperte ${ACCEPT_SHORTCUT} para aceitar de qualquer lugar.` : undefined,
      accept: "Aceitar",
      deny: "Recusar",
    })),
    ...invites.map((invite) => ({
      id: `invite:${invite.id}`,
      title: `${invite.fromName} te chamou para a sala`,
      body: "Entre para ver a tela e compartilhar a sua.",
      accept: "Entrar",
      deny: "Agora não",
    })),
  ]
  const toastKey = JSON.stringify(toastItems)
  const toastRef = useRef(toastItems)
  useEffect(() => {
    toastRef.current = JSON.parse(toastKey) as ToastItem[]
    void showToast(toastRef.current).catch(() => undefined)
  }, [toastKey])

  const invitesRef = useRef(invites)
  useEffect(() => {
    invitesRef.current = invites
  }, [invites])
  const joinRef = useRef<(text: string) => Promise<void>>(async () => undefined)

  const acceptInvite = useCallback(async (id: string) => {
    const invite = invitesRef.current.find((item) => item.id === id)
    setInvites((list) => list.filter((item) => item.id !== id))
    if (!invite) return
    await showWindow().catch(() => undefined)
    try {
      await joinRef.current(invite.invite)
      notify({ tone: "success", title: `Você entrou na sala de ${invite.fromName}` })
    } catch (reason) {
      notify({ tone: "error", title: "Não foi possível entrar", description: reason instanceof Error ? reason.message : String(reason) })
    }
  }, [notify])

  useEffect(() => {
    if (!isTauri) return
    const listeners = [
      listen("toast://ready", () => void showToast(toastRef.current).catch(() => undefined)),
      listen<{ id: string; accept: boolean }>("toast://answer", ({ payload }) => {
        const [kind, id] = [payload.id.slice(0, payload.id.indexOf(":")), payload.id.slice(payload.id.indexOf(":") + 1)]
        const current = sessionRef.current
        if (kind === "knock" && current?.role === "host") {
          if (payload.accept) current.admit(id)
          else current.deny(id)
        } else if (kind === "invite") {
          if (payload.accept) void acceptInvite(id)
          else setInvites((list) => list.filter((item) => item.id !== id))
        }
      }),
    ]
    return () => {
      void Promise.all(listeners).then((unlisteners) => unlisteners.forEach((unlisten) => unlisten()))
    }
  }, [acceptInvite])

  // Status no Discord: só com a opção ligada. Mostra onde a pessoa está, nunca o código da sala.
  const [discordReady, setDiscordReady] = useState(false)
  const [discordConnected, setDiscordConnected] = useState<boolean | null>(null)
  useEffect(() => {
    void discordAvailable().then(setDiscordReady)
  }, [])
  type PresenceInfo = Omit<DiscordPresence, "startedAt"> & { room: string }
  // Fora de sala: aparece "No início" (com a hora em que o app abriu), para a pessoa ver que funcionou.
  let presence: PresenceInfo | null = { room: "home", details: "No início", state: "Pronto para chamar os amigos", partySize: 1, partyMax: 5 }
  if (settings?.discordPresence && discordReady && session && session.status !== "ended") {
    const people = Math.max(1, session.participants.length)
    const hostName = session.participants.find((person) => person.role === "host")?.name ?? ""
    presence = session.role === "host"
      ? { room: session.inviteCode, details: "Na própria sala", state: session.sharing ? "Compartilhando a tela" : "Esperando os amigos", partySize: people, partyMax: 5, joinCode: settings.discordJoinButton && people < 5 ? session.shortCode : null }
      : { room: session.inviteCode, details: `Na sala de ${hostName}`, state: session.sharing ? "Compartilhando a tela" : session.status === "live" ? "Assistindo" : "Esperando a tela", partySize: people, partyMax: 5 }
  }
  const presenceKey = settings?.discordPresence && discordReady ? JSON.stringify(presence) : "off"
  // Hora de entrada na sala, para o "há 12 min" do Discord (muda só quando a sala muda).
  const presenceStart = useRef<{ room: string; at: number }>({ room: "", at: 0 })
  useEffect(() => {
    if (presenceKey === "off") {
      void updateDiscordPresence(null)
      return
    }
    const info = JSON.parse(presenceKey) as PresenceInfo | null
    if (!info) {
      void updateDiscordPresence(null).then(setDiscordConnected)
      return
    }
    if (presenceStart.current.room !== info.room) presenceStart.current = { room: info.room, at: Date.now() }
    void updateDiscordPresence({ details: info.details, state: info.state, partySize: info.partySize, partyMax: info.partyMax, joinCode: info.joinCode ?? null, startedAt: presenceStart.current.at }).then(setDiscordConnected)
  }, [presenceKey])

  const setDiscord = async (patch: Partial<Pick<AppSettings, "discordPresence" | "discordJoinButton">>) => {
    const current = settingsRef.current
    if (!current) return
    try {
      setSettings(await saveSettings({ ...current, ...patch }))
    } catch (reason) {
      notify({ tone: "error", title: "Não foi possível salvar", description: reason instanceof Error ? reason.message : String(reason) })
    }
  }

  const inviteFriend = useCallback(async (friend: Friend, signal?: AbortSignal) => {
    const current = sessionRef.current
    const currentSettings = settingsRef.current
    if (current?.role !== "host" || !currentSettings) return
    await sendRoomInvite(friend, currentSettings, await getPublicKey(), current.inviteCode, signal)
  }, [])

  useEffect(() => {
    if (!isTauri) return
    const listeners = [
      listen("shortcut://accept", () => {
        const current = sessionRef.current
        if (current?.role !== "host") return
        const admitted = current.admitAll()
        const names = admitted.map((request) => request.name).join(", ")
        if (current.knocks.length) notify({ tone: "info", title: "A sala lotou", description: names ? `${names} entrou. Os outros pedidos continuam esperando.` : "Não há lugar para mais ninguém agora." })
        else if (names) notify({ tone: "success", title: admitted.length === 1 ? `${names} pode entrar` : `${names} podem entrar` })
      }),
      listen("tray://share", () => {
        setView(sessionRef.current ? "room" : "home")
        if (!sessionRef.current) notify({ tone: "info", title: "Nenhuma sala aberta", description: "Clique em “Criar sala” e depois em “Compartilhar tela”." })
      }),
      listen("tray://room", () => setView("room")),
      listen("tray://settings", () => setView("settings")),
      // "Parar transmissão" na bandeja: o host para só a tela (a sala continua); o espectador sai.
      listen("tray://stop", () => void (sessionRef.current?.sharing ? stopSharing() : sessionRef.current?.role === "viewer" ? stop() : undefined)),
    ]
    return () => {
      void Promise.all(listeners).then((unlisteners) => unlisteners.forEach((unlisten) => unlisten()))
    }
  }, [notify, stop, stopSharing])

  useEffect(() => {
    void updateSharingState({
      live: session?.role === "host" ? session.sharing : session?.status === "live",
      sessionId: session?.id || null,
      viewerCount: session?.viewers.length ?? 0,
      directOutputs: session?.directOutputs ?? 0,
    }).catch(() => undefined)
  })

  if (!settings) {
    return <div className="flex h-svh flex-col items-center justify-center gap-5 bg-background"><Logo /><Spinner /><p className="text-sm text-muted-foreground">Abrindo sua sala</p></div>
  }

  if (!hasRealName(settings.displayName)) {
    return (
      <>
        <WelcomeScreen onSave={async (displayName) => setSettings(await saveSettings({ ...settings, displayName }))} />
        <Notice notice={notice} />
      </>
    )
  }

  const title = view === "home" ? "Início" : view === "settings" ? "Configurações" : session?.role === "viewer" ? "Assistindo" : "Sua sala"
  const subtitle = view === "home" ? settings.roomName : view === "settings" ? "Preferências deste computador" : session ? "Só entra quem você aceitar" : "Nenhuma sala aberta"

  return (
    <>
      <AppShell view={view} onView={setView} live={session?.role === "host" ? session.sharing : session?.status === "live"} displayName={settings.displayName} title={title} subtitle={subtitle}>
        {view === "home" && <HomeScreen settings={settings} discord={{ available: discordReady, connected: settings.discordPresence ? discordConnected : null, onChange: (enabled) => void setDiscord({ discordPresence: enabled }), onJoinButtonChange: (enabled) => void setDiscord({ discordJoinButton: enabled }) }} pendingJoin={pendingJoin} friends={friends} starting={starting} onStart={() => void start()} onJoin={join} onAddFriend={async (friend) => {
          setFriends(await addFriend(friend))
          notify({ tone: "success", title: `${friend.displayName} foi adicionado` })
        }} onRemoveFriend={async (friendId) => {
          setFriends(await removeFriend(friendId))
          notify({ tone: "info", title: "Amigo removido" })
        }} />}
        {view === "settings" && <SettingsScreen settings={settings} onSave={async (next) => {
          const saved = await saveSettings(next)
          await setAutostart(saved.startWithWindows)
          await updateShortcut(saved.globalShortcut)
          setSettings(saved)
          notify({ tone: "success", title: "Configurações salvas" })
        }} />}
        {view === "room" && (session?.role === "viewer" ? <ViewerScreen session={session} audio={wantsAudio(settings)} onAudioChange={(enabled) => void setAudio(enabled)} onStop={() => void stop()} onShare={() => void share()} onStopSharing={() => void stopSharing()} /> : <RoomScreen session={session} settings={settings} friends={friends} onInviteFriend={inviteFriend} onAudioChange={(enabled) => void setAudio(enabled)} starting={starting} onStart={() => void start()} onShare={() => void share()} onStopSharing={() => void stopSharing()} onClose={() => void stop()} onMode={(mode: QualityMode) => session?.setMode(mode)} onNotice={notify} acceptShortcut={acceptShortcut ? ACCEPT_SHORTCUT : null} />)}
      </AppShell>
      <Notice notice={notice} />
    </>
  )
}
