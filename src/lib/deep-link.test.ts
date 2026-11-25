import { describe, expect, it } from "vitest"
import { joinCodeFromUrl, parseAppDeepLink } from "@/lib/deep-link"

describe("link sevenlas://", () => {
  it("lê o código do caminho ou do parâmetro", () => {
    expect(joinCodeFromUrl("sevenlas://entrar/KX7P42QM")).toBe("KX7P42QM")
    expect(joinCodeFromUrl("sevenlas://entrar/kx7p-42qm")).toBe("KX7P42QM")
    expect(joinCodeFromUrl("sevenlas://entrar?codigo=KX7P42QM")).toBe("KX7P42QM")
  })

  it("ignora outros esquemas, ações e códigos inválidos", () => {
    expect(joinCodeFromUrl("https://entrar/KX7P42QM")).toBeNull()
    expect(joinCodeFromUrl("sevenlas://sair/KX7P42QM")).toBeNull()
    expect(joinCodeFromUrl("sevenlas://entrar/0000")).toBeNull()
    expect(joinCodeFromUrl("não é link")).toBeNull()
  })

  it("reconhece salas persistentes e amigos por nick", () => {
    expect(parseAppDeepLink("sevenlas://entrar?sala=A1B2C3D4E5")).toEqual({ type: "room", code: "A1B2C3D4E5" })
    expect(parseAppDeepLink("sevenlas://entrar/a1b2c-3d4e5")).toEqual({ type: "room", code: "A1B2C3D4E5" })
    expect(parseAppDeepLink("sevenlas://amigo/bruno_bach")).toEqual({ type: "friend", username: "bruno_bach" })
    expect(parseAppDeepLink("sevenlas://amigo?nick=bruno_bach")).toEqual({ type: "friend", username: "bruno_bach" })
    expect(parseAppDeepLink("sevenlas://entrar/KX7P42QM")).toEqual({ type: "legacy", code: "KX7P42QM" })
  })
})
