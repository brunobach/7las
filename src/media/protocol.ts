export type TreeAssignment = {
  type: "tree.assign"
  sessionId: string
  treeEpoch: number
  childId: string
  parentId: string
  parentTrysteroId: string
  depth: 1 | 2
  reason: "join" | "recovery" | "rebalance" | "drain"
  expiresAt: number
}

export type StreamMetadata = {
  kind: "screen"
  sessionId: string
  originHostId: string
  parentId: string
  treeEpoch: number
}

export function isTreeAssignment(value: unknown): value is TreeAssignment {
  const item = value as TreeAssignment
  return typeof item === "object" && item !== null && item.type === "tree.assign" && typeof item.sessionId === "string" && Number.isInteger(item.treeEpoch) && item.treeEpoch >= 0 && typeof item.childId === "string" && typeof item.parentId === "string" && typeof item.parentTrysteroId === "string" && (item.depth === 1 || item.depth === 2) && ["join", "recovery", "rebalance", "drain"].includes(item.reason) && typeof item.expiresAt === "number"
}

export function isStreamMetadata(value: unknown): value is StreamMetadata {
  const item = value as StreamMetadata
  return typeof item === "object" && item !== null && item.kind === "screen" && typeof item.sessionId === "string" && typeof item.originHostId === "string" && typeof item.parentId === "string" && Number.isInteger(item.treeEpoch)
}

export function acceptsStream(metadata: unknown, expected: Omit<StreamMetadata, "kind" | "treeEpoch">, lastEpoch: number): metadata is StreamMetadata {
  return isStreamMetadata(metadata) && metadata.sessionId === expected.sessionId && metadata.originHostId === expected.originHostId && metadata.parentId === expected.parentId && metadata.treeEpoch >= lastEpoch
}

/** Tela de um convidado: vai direto dele para cada pessoa da sala, fora da árvore do host. */
export type GuestStreamMetadata = {
  kind: "guest-screen"
  sessionId: string
  ownerId: string
}

export function isGuestStreamMetadata(value: unknown): value is GuestStreamMetadata {
  const item = value as GuestStreamMetadata
  return typeof item === "object" && item !== null && item.kind === "guest-screen" && typeof item.sessionId === "string" && typeof item.ownerId === "string"
}
