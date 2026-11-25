import type { RoomSession } from "@/lib/room"
import type { StreamMetadata } from "@/media/protocol"
import { OutgoingStream } from "@/media/outgoing-stream"

export class RelayNode {
  private outputs = new Map<string, OutgoingStream>()
  private pending = new Map<string, number>()
  private incoming: MediaStream | null = null

  private session: RoomSession
  private originHostId: string
  private sessionId: string

  constructor(session: RoomSession, originHostId: string, sessionId: string) {
    this.session = session
    this.originHostId = originHostId
    this.sessionId = sessionId
  }

  get activeChildren(): string[] {
    return Array.from(this.outputs.keys())
  }

  setIncoming(stream: MediaStream): void {
    this.incoming = stream
    for (const [childId, epoch] of this.pending) void this.assign(childId, epoch)
  }

  async assign(childId: string, treeEpoch: number): Promise<void> {
    this.pending.set(childId, treeEpoch)
    if (!this.incoming) return
    this.outputs.get(childId)?.close()
    const metadata: StreamMetadata = { kind: "screen", sessionId: this.sessionId, originHostId: this.originHostId, parentId: (await this.session.room.getSelf()).userId, treeEpoch }
    const output = new OutgoingStream(this.session, this.incoming, childId, metadata)
    this.outputs.set(childId, output)
    await output.publish()
  }

  remove(childId: string): void {
    this.pending.delete(childId)
    this.outputs.get(childId)?.close()
    this.outputs.delete(childId)
  }

  close(): void {
    for (const output of this.outputs.values()) output.close()
    this.outputs.clear()
    this.pending.clear()
    this.incoming = null
  }
}
