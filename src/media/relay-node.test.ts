import { describe, expect, it, vi } from "vitest"
import type { RoomSession } from "@/lib/room"
import { RelayNode } from "@/media/relay-node"

function fakeSession() {
  const room = {
    addStream: vi.fn().mockResolvedValue(undefined),
    removeStream: vi.fn(),
    getSelf: vi.fn().mockResolvedValue({ userId: "relay" }),
  }
  return { room, session: { room } as unknown as RoomSession }
}

describe("retransmissão", () => {
  it("guarda a atribuição recebida antes do vídeo", async () => {
    const { room, session } = fakeSession()
    const relay = new RelayNode(session, "host", "session")
    await relay.assign("child", 1)
    expect(room.addStream).not.toHaveBeenCalled()
    relay.setIncoming({} as MediaStream)
    await vi.waitFor(() => expect(room.addStream).toHaveBeenCalledOnce())
    expect(room.addStream.mock.calls[0][1]).toMatchObject({ target: "child", metadata: { parentId: "relay", treeEpoch: 1 } })
  })

  it("descarta uma atribuição removida antes do vídeo chegar", async () => {
    const { room, session } = fakeSession()
    const relay = new RelayNode(session, "host", "session")
    await relay.assign("child", 1)
    relay.remove("child")
    relay.setIncoming({} as MediaStream)
    await Promise.resolve()
    expect(room.addStream).not.toHaveBeenCalled()
  })
})
