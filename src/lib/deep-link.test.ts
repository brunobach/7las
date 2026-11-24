import { describe, expect, it } from "vitest"
import { joinCodeFromUrl } from "@/lib/deep-link"

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
})
