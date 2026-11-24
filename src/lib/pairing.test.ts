import { describe, expect, it } from "vitest"
import { isFriendCard } from "@/lib/pairing"

describe("cartão de amigo", () => {
  it("aceita nome e chave pública válidos", () => {
    expect(isFriendCard({ type: "friend-card", name: "Ana", publicKey: "Fx08Ug0IGt9vX_l_l43FGGs5KomjZ_yFQdvVumck9_I" })).toBe(true)
  })

  it("recusa nome vazio, nome longo ou chave estranha", () => {
    expect(isFriendCard({ type: "friend-card", name: "  ", publicKey: "Fx08Ug0IGt9vX_l_l43FGGs5" })).toBe(false)
    expect(isFriendCard({ type: "friend-card", name: "a".repeat(41), publicKey: "Fx08Ug0IGt9vX_l_l43FGGs5" })).toBe(false)
    expect(isFriendCard({ type: "friend-card", name: "Ana", publicKey: "curta" })).toBe(false)
    expect(isFriendCard({ type: "knock", name: "Ana" })).toBe(false)
  })
})
