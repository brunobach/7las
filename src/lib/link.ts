const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const ID = /^[0-9A-Za-z]{22}$/

export type SessionInvite = { secret: string; hostId: string }

export function newSecret(): string {
  let output = ""
  while (output.length < 22) {
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
      if (byte < 248 && output.length < 22) output += BASE62[byte % 62]
    }
  }
  return output
}

export async function roomName(secret: string): Promise<string> {
  const data = new TextEncoder().encode(`7las:${secret}`)
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data))
  return Array.from(hash.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

const EMBEDDED = /(?:^|[^0-9A-Za-z~])([0-9A-Za-z]{22})~([0-9A-Za-z]{22})(?![0-9A-Za-z~])/

/** Aceita o código puro, um link com `#código` ou a mensagem de convite inteira colada. */
export function parseSessionInvite(value: string): SessionInvite {
  const match = EMBEDDED.exec(value.trim())
  if (!match || !ID.test(match[1]) || !ID.test(match[2])) {
    throw new Error("Esse convite está incompleto ou não é válido. Peça para quem está compartilhando copiar o convite de novo.")
  }
  return { secret: match[1], hostId: match[2] }
}

export function sessionInviteCode(invite: SessionInvite): string {
  return `${invite.secret}~${invite.hostId}`
}

export function inviteMessage(code: string): string {
  return `Vem ver minha tela no 7las! Abra o app, clique em "Entrar com convite" e cole esta mensagem.\n\n${code}`
}
