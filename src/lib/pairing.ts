import { newShortCode, openCodeRoom } from "@/lib/lobby"
import type { AppSettings, Friend } from "@/types"

/**
 * Adicionar amigo com código curto (XXXX-XXXX), sem servidor.
 *
 * Quem mostra o código abre uma sala temporária derivada dele; quem digita entra nela e os dois
 * trocam nome e chave pública. Os DOIS lados salvam o outro como amigo.
 * O código vale por 15 minutos ou até a janela de adicionar amigo ser fechada.
 */

const CODE_TTL_MS = 15 * 60_000
const SEND_INTERVAL_MS = 2_000
const FIND_TIMEOUT_MS = 25_000

type FriendCard = { type: "friend-card"; name: string; publicKey: string }

export function isFriendCard(value: unknown): value is FriendCard {
  const card = value as FriendCard
  return typeof card === "object" && card !== null && card.type === "friend-card"
    && typeof card.name === "string" && card.name.trim().length > 0 && card.name.length <= 40
    && typeof card.publicKey === "string" && card.publicKey.length >= 16 && card.publicKey.length <= 128
}

/** Mesmo amigo, mesmo id: adicionar de novo só atualiza o nome. */
async function friendIdOf(publicKey: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`7las-friend:${publicKey}`)))
  return Array.from(hash.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function toFriend(card: FriendCard): Promise<Friend> {
  const friendId = await friendIdOf(card.publicKey)
  return {
    friendId,
    displayName: card.name.trim(),
    avatarSeed: Array.from(friendId).reduce((sum, char) => sum + char.charCodeAt(0), 0),
    publicKey: card.publicKey,
    createdAt: Date.now(),
  }
}

function ownCard(settings: AppSettings, publicKey: string): FriendCard {
  return { type: "friend-card", name: settings.displayName.trim().slice(0, 40), publicKey }
}

/** Lado de quem mostra o código. `onPaired` é chamado para cada pessoa que digitar o código. */
export class FriendCodeHost {
  readonly code: string
  readonly expiresAt: number
  private room: Awaited<ReturnType<typeof openCodeRoom>> | null = null
  private closed = false
  private timer: number | undefined

  private constructor(code: string) {
    this.code = code
    this.expiresAt = Date.now() + CODE_TTL_MS
  }

  static async open(settings: AppSettings, publicKey: string, onPaired: (friend: Friend) => void, onExpire: () => void): Promise<FriendCodeHost> {
    const host = new FriendCodeHost(newShortCode())
    const room = await openCodeRoom("friend", host.code, settings)
    host.room = room
    const paired = new Set<string>()
    const action = room.makeAction<FriendCard>("friend")
    action.onMessage((card, { userId }) => {
      if (host.closed || !isFriendCard(card) || card.publicKey === publicKey) return
      // Responde sempre (a resposta pode ter se perdido), mas só avisa uma vez por pessoa.
      void action.send(ownCard(settings, publicKey), { target: userId }).catch(() => undefined)
      if (paired.has(card.publicKey)) return
      paired.add(card.publicKey)
      void toFriend(card).then(onPaired)
    })
    host.timer = window.setTimeout(() => {
      void host.close()
      onExpire()
    }, CODE_TTL_MS)
    return host
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    window.clearTimeout(this.timer)
    await this.room?.leave().catch(() => undefined)
  }
}

/** Lado de quem digita o código. Resolve com o amigo quando o outro lado responde. */
export async function pairWithCode(code: string, settings: AppSettings, publicKey: string, signal?: AbortSignal): Promise<Friend> {
  const room = await openCodeRoom("friend", code, settings)
  const action = room.makeAction<FriendCard>("friend")
  return new Promise<Friend>((resolve, reject) => {
    let done = false
    const finish = (error: Error | null, card?: FriendCard) => {
      if (done) return
      done = true
      window.clearInterval(repeat)
      window.clearTimeout(timeout)
      signal?.removeEventListener("abort", onAbort)
      void room.leave().catch(() => undefined)
      if (error) reject(error)
      else void toFriend(card!).then(resolve, reject)
    }
    const send = () => {
      for (const userId of Object.keys(room.getUsers())) {
        void action.send(ownCard(settings, publicKey), { target: userId }).catch(() => undefined)
      }
    }
    const onAbort = () => finish(new Error("Cancelado."))
    signal?.addEventListener("abort", onAbort)
    action.onMessage((card) => {
      if (isFriendCard(card) && card.publicKey !== publicKey) finish(null, card)
    })
    room.onUserJoin(send)
    const repeat = window.setInterval(send, SEND_INTERVAL_MS)
    const timeout = window.setTimeout(() => finish(new Error("Não encontramos esse código. Confira se digitou certo e se seu amigo ainda está com a janela “Adicionar amigo” aberta.")), FIND_TIMEOUT_MS)
    if (signal?.aborted) onAbort()
  })
}
