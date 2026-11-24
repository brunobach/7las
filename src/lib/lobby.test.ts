import { describe, expect, it } from "vitest"
import { findShortCode, formatCodeInput, formatShortCode, isLobbyMessage, newShortCode, shortCodeMessage } from "@/lib/lobby"

describe("código curto da sala de espera", () => {
  it("gera 8 caracteres sem letras ambíguas", () => {
    for (let i = 0; i < 200; i++) expect(newShortCode()).toMatch(/^[2-9A-HJ-KMNP-Z]{8}$/)
  })

  it("encontra o código digitado, com hífen, minúsculo ou dentro da mensagem", () => {
    const code = newShortCode()
    expect(findShortCode(code)).toBe(code)
    expect(findShortCode(formatShortCode(code).toLowerCase())).toBe(code)
    expect(findShortCode(` ${code.slice(0, 4)} ${code.slice(4)} `)).toBe(code)
    expect(findShortCode(shortCodeMessage(code))).toBe(code)
  })

  it("recusa textos que não são código", () => {
    expect(findShortCode("abc")).toBeNull()
    expect(findShortCode("OOOO-1111")).toBeNull()
    expect(findShortCode("Vem ver minha tela")).toBeNull()
  })

  it("valida mensagens da sala de espera", () => {
    expect(isLobbyMessage({ type: "knock", name: "Ana" })).toBe(true)
    expect(isLobbyMessage({ type: "knock", name: " " })).toBe(false)
    expect(isLobbyMessage({ type: "knock", name: "x".repeat(41) })).toBe(false)
    expect(isLobbyMessage({ type: "deny", reason: "full" })).toBe(true)
    expect(isLobbyMessage({ type: "admit", invite: 42 })).toBe(false)
    expect(isLobbyMessage(null)).toBe(false)
  })
})

describe("campo do código", () => {
  it("coloca o hífen sozinho depois do 4º caractere", () => {
    expect(formatCodeInput("kx7p")).toBe("KX7P")
    expect(formatCodeInput("kx7p4")).toBe("KX7P-4")
    expect(formatCodeInput("KX7P42QM")).toBe("KX7P-42QM")
    expect(formatCodeInput("kx7p 42qm")).toBe("KX7P-42QM")
  })

  it("deixa apagar o hífen sem travar", () => {
    expect(formatCodeInput("KX7P-")).toBe("KX7P")
  })

  it("não mexe em mensagem ou convite completo colado", () => {
    const message = "Vem ver minha tela! Código KX7P-42QM"
    expect(formatCodeInput(message)).toBe(message)
    const full = "abcdefghijABCDEFGHIJ12~abcdefghijABCDEFGHIJ12"
    expect(formatCodeInput(full)).toBe(full)
  })
})
