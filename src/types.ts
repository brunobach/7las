export type AppView = "home" | "room" | "settings"
export type QualityMode = "sharp" | "smooth"
export type AudioMode = "none" | "process" | "system_except_discord" | "system"

export type AppSettings = {
  displayName: string
  avatarSeed: number
  roomName: string
  startWithWindows: boolean
  closeToTray: boolean
  globalShortcut: string
  mode: QualityMode
  audioMode: AudioMode
  audioTargetExecutable: string | null
  audioTargetWindowTitle: string | null
  relayEnabled: boolean
  relaySlots: number
  maxDirectSlots: number
  turnUrl: string
  turnUsername: string
  turnPassword: string
  /** Mostrar no perfil do Discord que está no 7las (sem o código da sala). */
  discordPresence: boolean
  /** Botão "Entrar na sala" no status do Discord, com o código curto da sala. */
  discordJoinButton: boolean
}

/** Som junto com a tela: "system" liga, "none" desliga (os outros modos eram do áudio nativo antigo). */
export function wantsAudio(settings: Pick<AppSettings, "audioMode">): boolean {
  return settings.audioMode !== "none"
}

/** Nome padrão antes do primeiro acesso. Não serve como nome de verdade: os amigos veriam "Você". */
export const PLACEHOLDER_NAME = "Você"

export function hasRealName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length > 0 && trimmed.toLocaleLowerCase("pt-BR") !== PLACEHOLDER_NAME.toLocaleLowerCase("pt-BR")
}

export const DEFAULT_SETTINGS: AppSettings = {
  displayName: "Você",
  avatarSeed: 0,
  roomName: "Sala dos amigos",
  startWithWindows: false,
  closeToTray: true,
  globalShortcut: "Ctrl+Shift+S",
  mode: "smooth",
  audioMode: "none",
  audioTargetExecutable: null,
  audioTargetWindowTitle: null,
  relayEnabled: false,
  relaySlots: 1,
  maxDirectSlots: 2,
  turnUrl: "",
  turnUsername: "",
  turnPassword: "",
  discordPresence: false,
  discordJoinButton: false,
}

export type Friend = {
  friendId: string
  displayName: string
  username?: string
  avatarSeed: number
  publicKey: string
  createdAt: number
}

export type Profile = {
  id: string
  username: string
  displayName: string
  avatarSeed: number
}

export type RoomSummary = {
  id: string
  code: string
  name: string
  ownerId: string
  role: "owner" | "member"
  mediaInvite: string | null
  mediaHostId: string | null
  passwordProtected: boolean
  onlineCount: number
  sharingCount: number
}

export type RoomMember = {
  id: string
  username: string
  displayName: string
  avatarSeed: number
  role: "owner" | "member"
  sharing: boolean | null
  lastSeen: string | null
  online: boolean | null
}

export type RoomDetails = RoomSummary & { members: RoomMember[] }

export type Bootstrap = {
  profile: Profile
  rooms: RoomSummary[]
  friends: Array<Omit<Friend, "publicKey" | "createdAt"> & { createdAt: string }>
}

export type SharingState = {
  live: boolean
  sessionId: string | null
  viewerCount: number
  directOutputs: number
}

export type SessionNotice = {
  tone: "info" | "error" | "success"
  title: string
  description?: string
} | null
