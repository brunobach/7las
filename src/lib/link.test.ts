import { describe, expect, it } from "vitest"
import { inviteMessage, newSecret, parseSessionInvite, sessionInviteCode } from "@/lib/link"

describe("convite de sessão", () => {
  const invite = { secret: newSecret(), hostId: newSecret() }
  const code = sessionInviteCode(invite)

  it("aceita o código puro, link com # e a mensagem inteira", () => {
    expect(parseSessionInvite(code)).toEqual(invite)
    expect(parseSessionInvite(`7las://entrar#${code}`)).toEqual(invite)
    expect(parseSessionInvite(inviteMessage(code))).toEqual(invite)
  })

  it("rejeita códigos incompletos ou com partes extras", () => {
    expect(() => parseSessionInvite(code.slice(0, -1))).toThrow()
    expect(() => parseSessionInvite(`${code}~extra`)).toThrow()
    expect(() => parseSessionInvite("qualquer texto")).toThrow()
  })
})
