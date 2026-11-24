import { describe, expect, it } from "vitest"
import { isRoomInvite } from "@/lib/inbox"

const invite = {
  type: "room-invite",
  fromName: "Ana",
  fromAvatar: 42,
  fromKey: "Fx08Ug0IGt9vX_l_l43FGGs5KomjZ_yFQdvVumck9_I",
  invite: "abcdefghijABCDEFGHIJ12~abcdefghijABCDEFGHIJ12",
}

describe("convite direto", () => {
  it("aceita o avatar do remetente e mantém compatibilidade com convites antigos", () => {
    expect(isRoomInvite(invite)).toBe(true)
    expect(isRoomInvite({ ...invite, fromAvatar: undefined })).toBe(true)
  })

  it("recusa avatar ou identidade inválidos", () => {
    expect(isRoomInvite({ ...invite, fromAvatar: -1 })).toBe(false)
    expect(isRoomInvite({ ...invite, fromName: " " })).toBe(false)
    expect(isRoomInvite({ ...invite, fromKey: "curta" })).toBe(false)
  })
})
