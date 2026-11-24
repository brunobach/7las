import { joinRoom, roles } from "trystero"
import { roomName } from "@/lib/link"
import { TunedPeerConnection } from "@/lib/peer"
import type { AppSettings } from "@/types"

const APP_ID = "brunobach/7las-desktop"

export type ParticipantProfile = {
  name: string
  avatar: number
  relayEnabled: boolean
  relaySlots: number
  /** Convidado compartilhando a própria tela. */
  sharing?: boolean
}

export type LiveState = {
  live: boolean
  sessionId: string
  originHostId: string
  hostName: string
  /** Sala aberta mas sem tela sendo enviada. Ausente = compartilhando (versões antigas). */
  sharing?: boolean
}

export function isParticipantProfile(value: unknown): value is ParticipantProfile {
  const profile = value as ParticipantProfile
  return typeof profile === "object" && profile !== null && typeof profile.name === "string" && profile.name.length <= 40 && Number.isInteger(profile.avatar) && typeof profile.relayEnabled === "boolean" && Number.isInteger(profile.relaySlots) && profile.relaySlots >= 0 && profile.relaySlots <= 1 && (profile.sharing === undefined || typeof profile.sharing === "boolean")
}

export function isLiveState(value: unknown): value is LiveState {
  const state = value as LiveState
  return typeof state === "object" && state !== null && typeof state.live === "boolean" && typeof state.sessionId === "string" && typeof state.originHostId === "string" && typeof state.hostName === "string" && (state.sharing === undefined || typeof state.sharing === "boolean")
}

export async function enterRoom(secret: string, hostId: string | undefined, settings: AppSettings) {
  const base = await roomName(secret)
  const room = joinRoom({
    appId: APP_ID,
    password: secret,
    identity: hostId ? "local" : "none",
    rtcPolyfill: TunedPeerConnection,
    turnConfig: settings.turnUrl ? [{ urls: settings.turnUrl, username: settings.turnUsername || undefined }] : undefined,
    use: [roles(hostId ? {} : { selfAsAdmin: true })],
  }, hostId ? `${base}~${hostId}` : base)
  const live = room.makeState<LiveState>("live", { live: false, sessionId: "", originHostId: "", hostName: "" }, { validate: isLiveState })
  const profiles = room.makeUserState<ParticipantProfile>("profile", { name: "", avatar: 0, relayEnabled: false, relaySlots: 0 }, { validate: isParticipantProfile })
  return { room, live, profiles }
}

export type RoomSession = Awaited<ReturnType<typeof enterRoom>>
