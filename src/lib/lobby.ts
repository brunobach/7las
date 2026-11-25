import { joinRoom } from "trystero"
import { isAvatarSeed, validAvatarSeed } from "@/lib/avatar"
import { PUBLIC_APP_URL } from "@/lib/link"
import type { AppSettings } from "@/types"

/**
 * Sala de espera com código curto.
 *
 * O convite completo (segredo + hostId, ~45 caracteres) não cabe num código curto sem
 * perder segurança. Então o host abre uma sala temporária derivada de um código de 8
 * caracteres; quem tem o código "bate na porta" com seu nome e o host decide se aceita.
 * Só depois de aceito o espectador recebe o convite completo e entra na sala de verdade.
 *
 * O código sozinho não dá acesso: adivinhar um código ainda exige a aprovação do host.
 */

const APP_ID = "brunobach/7las-desktop"
// Sem 0/O, 1/I/L: fácil de ditar e de digitar.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
const CODE_LENGTH = 8
const CHAR = `[${ALPHABET}]`
const DASHED = new RegExp(`(?:^|[^0-9A-Z])(${CHAR}{4})-(${CHAR}{4})(?![0-9A-Z])`)
const PLAIN = new RegExp(`^${CHAR}{${CODE_LENGTH}}$`)
const KNOCK_INTERVAL_MS = 3_000
const FIND_HOST_TIMEOUT_MS = 25_000
const ANSWER_TIMEOUT_MS = 3 * 60_000
const MAX_PENDING = 6

export type LobbyMessage =
  | { type: "knock"; name: string; avatar?: number }
  | { type: "admit"; invite: string }
  | { type: "deny"; reason: "rejected" | "full" }

export type KnockRequest = { id: string; name: string; avatar: number; at: number }

export function isLobbyMessage(value: unknown): value is LobbyMessage {
  const item = value as LobbyMessage
  if (typeof item !== "object" || item === null) return false
  if (item.type === "knock") return typeof item.name === "string" && item.name.trim().length > 0 && item.name.length <= 40 && (item.avatar === undefined || isAvatarSeed(item.avatar))
  if (item.type === "admit") return typeof item.invite === "string" && item.invite.length <= 128
  if (item.type === "deny") return item.reason === "rejected" || item.reason === "full"
  return false
}

export function newShortCode(): string {
  let output = ""
  while (output.length < CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      // 248 = 31 * 8: descarta o resto para não enviesar o sorteio.
      if (byte < 248 && output.length < CODE_LENGTH) output += ALPHABET[byte % ALPHABET.length]
    }
  }
  return output
}

export function formatShortCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/**
 * Formata o campo enquanto a pessoa digita: maiúsculas e hífen automático depois do 4º caractere.
 * Texto colado que não parece um código (mensagem inteira, convite completo) fica como está.
 */
export function formatCodeInput(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^0-9A-Z]/g, "")
  if (/[^0-9A-Za-z\s-]/.test(raw) || compact.length > CODE_LENGTH) return raw
  return compact.length > 4 ? formatShortCode(compact) : compact
}

/** Encontra um código curto no texto colado (com hífen em qualquer lugar, ou o texto todo sem hífen). */
export function findShortCode(value: string): string | null {
  const upper = value.toUpperCase()
  const dashed = DASHED.exec(upper)
  if (dashed) return dashed[1] + dashed[2]
  const plain = upper.replace(/[\s-]/g, "")
  return PLAIN.test(plain) ? plain : null
}

export function shortCodeMessage(code: string): string {
  return `Vem ver minha tela no 7las: ${PUBLIC_APP_URL}/entrar/?codigo=${formatShortCode(code)}`
}

async function codeRoomName(seed: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)))
  return Array.from(hash.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** Sala temporária derivada de um código curto. `purpose` separa a sala de espera do pareamento de amigos. */
export async function openCodeRoom(purpose: "lobby" | "friend" | "inbox", code: string, settings: AppSettings) {
  const seed = `7las-${purpose}:${code}`
  return joinRoom({
    appId: APP_ID,
    password: seed,
    identity: "none",
    turnConfig: settings.turnUrl ? [{ urls: settings.turnUrl, username: settings.turnUsername || undefined, credential: settings.turnPassword || undefined }] : undefined,
  }, await codeRoomName(seed))
}

const openLobby = (code: string, settings: AppSettings) => openCodeRoom("lobby", code, settings)

/** Lado do host: recebe pedidos de entrada e responde. */
export class LobbyHost {
  readonly code: string
  private requests = new Map<string, KnockRequest>()
  private room: Awaited<ReturnType<typeof openLobby>> | null = null
  private closed = false
  private invite: string
  private isFull: () => boolean
  private onChange: (request?: KnockRequest) => void

  private constructor(code: string, invite: string, isFull: () => boolean, onChange: (request?: KnockRequest) => void) {
    this.code = code
    this.invite = invite
    this.isFull = isFull
    this.onChange = onChange
  }

  /** `onChange` recebe o pedido novo quando alguém bate na porta (para avisar o host). */
  static async open(invite: string, settings: AppSettings, isFull: () => boolean, onChange: (request?: KnockRequest) => void): Promise<LobbyHost> {
    const host = new LobbyHost(newShortCode(), invite, isFull, onChange)
    const room = await openLobby(host.code, settings)
    host.room = room
    const action = room.makeAction<LobbyMessage>("lobby")
    action.onMessage((message, { userId }) => {
      if (host.closed || !isLobbyMessage(message) || message.type !== "knock") return
      if (host.isFull()) {
        void action.send({ type: "deny", reason: "full" }, { target: userId }).catch(() => undefined)
        return
      }
      if (host.requests.has(userId)) return
      if (host.requests.size >= MAX_PENDING) return
      const request = { id: userId, name: message.name.trim(), avatar: validAvatarSeed(message.avatar, userId), at: Date.now() }
      host.requests.set(userId, request)
      host.onChange(request)
    })
    room.onUserLeave(({ userId }) => {
      if (host.requests.delete(userId)) host.onChange()
    })
    return host
  }

  get pending(): KnockRequest[] {
    return Array.from(this.requests.values()).sort((a, b) => a.at - b.at)
  }

  admit(id: string): void {
    this.answer(id, { type: "admit", invite: this.invite })
  }

  deny(id: string): void {
    this.answer(id, { type: "deny", reason: "rejected" })
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.requests.clear()
    await this.room?.leave().catch(() => undefined)
  }

  private answer(id: string, message: LobbyMessage): void {
    if (!this.room || !this.requests.delete(id)) return
    void this.room.makeAction<LobbyMessage>("lobby").send(message, { target: id }).catch(() => undefined)
    this.onChange()
  }
}

export class KnockError extends Error {
  readonly reason: "not-found" | "rejected" | "full" | "timeout" | "cancelled"
  constructor(reason: KnockError["reason"], message: string) {
    super(message)
    this.reason = reason
  }
}

/**
 * Lado do espectador: bate na porta e espera a resposta do host.
 * Resolve com o convite completo quando o host aceita.
 */
export async function knock(code: string, settings: AppSettings, signal?: AbortSignal): Promise<string> {
  const room = await openLobby(code, settings)
  const action = room.makeAction<LobbyMessage>("lobby")
  return new Promise<string>((resolve, reject) => {
    let answered = false
    let foundSomeone = false
    const finish = (error: KnockError | null, invite?: string) => {
      if (answered) return
      answered = true
      window.clearInterval(repeat)
      window.clearTimeout(findTimeout)
      window.clearTimeout(answerTimeout)
      signal?.removeEventListener("abort", onAbort)
      void room.leave().catch(() => undefined)
      if (error) reject(error)
      else resolve(invite!)
    }
    const send = () => {
      for (const userId of Object.keys(room.getUsers())) {
        void action.send({ type: "knock", name: settings.displayName.trim().slice(0, 40) || "Amigo", avatar: settings.avatarSeed }, { target: userId }).catch(() => undefined)
      }
    }
    const onAbort = () => finish(new KnockError("cancelled", "Pedido cancelado."))
    signal?.addEventListener("abort", onAbort)
    action.onMessage((message) => {
      if (!isLobbyMessage(message)) return
      if (message.type === "admit") finish(null, message.invite)
      else if (message.type === "deny") finish(message.reason === "full"
        ? new KnockError("full", "A sala está cheia (4 pessoas). Tente de novo quando alguém sair.")
        : new KnockError("rejected", "Seu pedido para entrar foi recusado."))
    })
    room.onUserJoin(() => {
      foundSomeone = true
      send()
    })
    const repeat = window.setInterval(send, KNOCK_INTERVAL_MS)
    const findTimeout = window.setTimeout(() => {
      if (!foundSomeone) finish(new KnockError("not-found", "Não encontramos uma transmissão com esse código. Confira se digitou certo e se a pessoa ainda está compartilhando."))
    }, FIND_HOST_TIMEOUT_MS)
    const answerTimeout = window.setTimeout(() => finish(new KnockError("timeout", "Ninguém respondeu ao seu pedido. Peça para a pessoa abrir o 7las e aceitar.")), ANSWER_TIMEOUT_MS)
    if (signal?.aborted) onAbort()
  })
}
