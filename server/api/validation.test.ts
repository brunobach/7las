import { describe, expect, it } from "vitest"
import { cleanDisplayName, cleanRoomCode, cleanRoomName, isMediaInvite, isUsername, normalizeUsername } from "./validation.js"

describe("validação da API", () => {
  it("normaliza nicks sem alterar o código da sala", () => {
    expect(normalizeUsername("  Bruno_Bach ")).toBe("bruno_bach")
    expect(isUsername("bruno_bach")).toBe(true)
    expect(isUsername("br")).toBe(false)
    expect(isUsername("nome-com-hifen")).toBe(false)
    expect(cleanRoomCode(" a1-b2 c3 d4 e5 f6 ")).toBe("A1B2C3D4E5")
  })

  it("limita os nomes exibidos", () => {
    expect(cleanDisplayName("  Bruno   Bach  ")).toBe("Bruno Bach")
    expect(cleanRoomName("  Sala    dos amigos ")).toBe("Sala dos amigos")
    expect(cleanDisplayName("x".repeat(50))).toHaveLength(40)
  })

  it("aceita apenas convites de mídia completos", () => {
    expect(isMediaInvite(`${"a".repeat(22)}~${"b".repeat(22)}`)).toBe(true)
    expect(isMediaInvite("ABC123")).toBe(false)
  })
})
