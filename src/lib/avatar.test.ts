import { describe, expect, it } from "vitest"
import { avatarPaths, avatarSeedFromString, isAvatarSeed, validAvatarSeed } from "@/lib/avatar"

describe("avatar em pixel art", () => {
  it("desenha exatamente o mesmo avatar para a mesma semente", () => {
    expect(avatarPaths(42)).toEqual(avatarPaths(42))
    expect(avatarPaths(42)).not.toEqual(avatarPaths(43))
  })

  it("gera variedade entre usuários", () => {
    const drawings = Array.from({ length: 100 }, (_, seed) => JSON.stringify(avatarPaths(seed + 1)))
    expect(new Set(drawings).size).toBeGreaterThan(95)
  })

  it("mantém uma semente válida e recupera valores ausentes", () => {
    expect(validAvatarSeed(123, "ana")).toBe(123)
    expect(validAvatarSeed(0, "ana")).toBe(avatarSeedFromString("ana"))
    expect(validAvatarSeed(undefined, "ana")).toBe(avatarSeedFromString("ana"))
    expect(isAvatarSeed(0xffffffff)).toBe(true)
    expect(isAvatarSeed(-1)).toBe(false)
  })
})
