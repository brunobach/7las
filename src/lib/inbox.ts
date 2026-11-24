import { isAvatarSeed, validAvatarSeed } from "@/lib/avatar"
import { openCodeRoom } from "@/lib/lobby"
import type { AppSettings, Friend } from "@/types"

/**
 * Caixa de entrada de convites, sem servidor.
 *
 * Enquanto o 7las está aberto (inclusive na bandeja), cada pessoa fica numa sala derivada da própria
 * chave pública. Só amigos conhecem essa chave (ela é trocada ao adicionar amigo), então só eles
 * conseguem chamar você para uma sala. Convites de quem não está na sua lista são ignorados.
 */

const DELIVERY_TIMEOUT_MS = 15_000
const SEND_INTERVAL_MS = 2_000

type RoomInvite = { type: "room-invite"; fromName: string; fromAvatar?: number; fromKey: string; invite: string }
type Ack = { type: "ack" }
type InboxMessage = RoomInvite | Ack

export type ReceivedInvite = { id: string; fromName: string; fromAvatar: number; fromKey: string; invite: string; at: number }

export function isRoomInvite(value: unknown): value is RoomInvite {
  const item = value as RoomInvite
  return typeof item === "object" && item !== null && item.type === "room-invite"
    && typeof item.fromName === "string" && item.fromName.trim().length > 0 && item.fromName.length <= 40
    && (item.fromAvatar === undefined || isAvatarSeed(item.fromAvatar))
    && typeof item.fromKey === "string" && item.fromKey.length >= 16 && item.fromKey.length <= 128
    && typeof item.invite === "string" && item.invite.length <= 128
}

export class Inbox {
  private room: Awaited<ReturnType<typeof openCodeRoom>> | null = null
  private closed = false

  static async open(settings: AppSettings, publicKey: string, isFriend: (publicKey: string) => boolean, onInvite: (invite: ReceivedInvite) => void): Promise<Inbox> {
    const inbox = new Inbox()
    const room = await openCodeRoom("inbox", publicKey, settings)
    inbox.room = room
    const seen = new Set<string>()
    const action = room.makeAction<InboxMessage>("inbox")
    action.onMessage((message, { userId }) => {
      if (inbox.closed || !isRoomInvite(message) || !isFriend(message.fromKey)) return
      void action.send({ type: "ack" }, { target: userId }).catch(() => undefined)
      // O mesmo convite chega várias vezes até a confirmação: mostra só uma.
      const key = `${message.fromKey}:${message.invite}`
      if (seen.has(key)) return
      seen.add(key)
      onInvite({ id: crypto.randomUUID(), fromName: message.fromName.trim(), fromAvatar: validAvatarSeed(message.fromAvatar, message.fromKey), fromKey: message.fromKey, invite: message.invite, at: Date.now() })
    })
    return inbox
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.room?.leave().catch(() => undefined)
  }
}

export class InviteError extends Error {
  readonly reason: "offline" | "cancelled"
  constructor(reason: InviteError["reason"], message: string) {
    super(message)
    this.reason = reason
  }
}

/** Chama um amigo para a sala. Resolve quando o app dele confirma que recebeu. */
export async function sendRoomInvite(friend: Friend, settings: AppSettings, publicKey: string, invite: string, signal?: AbortSignal): Promise<void> {
  const room = await openCodeRoom("inbox", friend.publicKey, settings)
  const action = room.makeAction<InboxMessage>("inbox")
  const message: RoomInvite = { type: "room-invite", fromName: settings.displayName.trim().slice(0, 40), fromAvatar: settings.avatarSeed, fromKey: publicKey, invite }
  return new Promise<void>((resolve, reject) => {
    let done = false
    const finish = (error: InviteError | null) => {
      if (done) return
      done = true
      window.clearInterval(repeat)
      window.clearTimeout(timeout)
      signal?.removeEventListener("abort", onAbort)
      void room.leave().catch(() => undefined)
      if (error) reject(error)
      else resolve()
    }
    const send = () => {
      for (const userId of Object.keys(room.getUsers())) void action.send(message, { target: userId }).catch(() => undefined)
    }
    const onAbort = () => finish(new InviteError("cancelled", "Cancelado."))
    signal?.addEventListener("abort", onAbort)
    action.onMessage((reply) => {
      if ((reply as Ack)?.type === "ack") finish(null)
    })
    room.onUserJoin(send)
    const repeat = window.setInterval(send, SEND_INTERVAL_MS)
    const timeout = window.setTimeout(() => finish(new InviteError("offline", `${friend.displayName} não está com o 7las aberto agora.`)), DELIVERY_TIMEOUT_MS)
    if (signal?.aborted) onAbort()
  })
}
