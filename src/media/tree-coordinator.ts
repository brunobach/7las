import type { TreeAssignment } from "@/media/protocol"

export type NodeMetrics = {
  nodeId: string
  sessionId: string
  treeEpoch: number
  at: number
  rttMs: number | null
  jitterMs: number | null
  packetLossPct: number | null
  incomingBitrate: number | null
  outgoingBitrate: number | null
  availableOutgoingBitrate: number | null
  framesPerSecond: number | null
  freezeCount: number
  qualityLimitationReason: string | null
  activeChildren: number
  relayEnabled: boolean
  relaySlots: number
  route: "direct" | "turn" | "unknown"
}

export type JoinNode = {
  nodeId: string
  relayEnabled: boolean
  relaySlots: number
}

type TreeNode = JoinNode & {
  parentId: string | null
  stable: boolean
  metrics: NodeMetrics | null
  lastMigrationAt: number
  epoch: number
}

const COOLDOWN_MS = 30_000
const HYSTERESIS = 0.8

export class TreeCoordinator {
  readonly hostId: string
  readonly sessionId: string
  readonly directSlots: number
  readonly targetBitrate: number
  readonly nodes = new Map<string, TreeNode>()
  private epoch = 0
  private migrating: string | null = null

  constructor(hostId: string, sessionId: string, directSlots = 2, targetBitrate = 8_000_000) {
    this.hostId = hostId
    this.sessionId = sessionId
    this.directSlots = directSlots
    this.targetBitrate = targetBitrate
    this.nodes.set(hostId, { nodeId: hostId, parentId: null, relayEnabled: true, relaySlots: directSlots, stable: true, metrics: null, lastMigrationAt: 0, epoch: 0 })
  }

  get treeEpoch(): number {
    return this.epoch
  }

  getAssignments(): TreeAssignment[] {
    return Array.from(this.nodes.values()).filter((node) => node.parentId).map((node) => this.assignmentFor(node, "join"))
  }

  addNode(input: JoinNode, now = Date.now()): TreeAssignment | null {
    if (this.nodes.has(input.nodeId)) throw new Error("O participante já está na árvore.")
    this.nodes.set(input.nodeId, { ...input, parentId: null, stable: false, metrics: null, lastMigrationAt: 0, epoch: 0 })
    const parent = this.chooseParent(input.nodeId, now, false, false)
    if (!parent) return null
    return this.assign(input.nodeId, parent, "join", now)
  }

  /** Reenvia a atribuição atual de um nó (com a época em que foi atribuído). */
  assignmentOf(nodeId: string): TreeAssignment | null {
    const node = this.nodes.get(nodeId)
    return node?.parentId ? this.assignmentFor(node, "recovery") : null
  }

  recoverNode(nodeId: string, now = Date.now()): TreeAssignment | null {
    return this.move(nodeId, now, "recovery", true)
  }

  updateMetrics(nodeId: string, metrics: NodeMetrics, stable: boolean): void {
    const node = this.nodes.get(nodeId)
    if (!node || metrics.nodeId !== nodeId || metrics.sessionId !== this.sessionId || metrics.treeEpoch < (node.metrics?.treeEpoch ?? -1) || metrics.at < (node.metrics?.at ?? 0)) return
    node.metrics = metrics
    node.stable = stable
    node.relayEnabled = metrics.relayEnabled
    node.relaySlots = metrics.relaySlots
  }

  setRelay(nodeId: string, enabled: boolean, slots: number, now = Date.now()): TreeAssignment[] {
    const node = this.nodes.get(nodeId)
    if (!node || nodeId === this.hostId) return []
    node.relayEnabled = enabled
    node.relaySlots = slots
    if (enabled) return []
    return this.childrenOf(nodeId).map((child) => this.move(child.nodeId, now, "drain", true)).filter((item): item is TreeAssignment => item !== null)
  }

  removeNode(nodeId: string, now = Date.now()): TreeAssignment[] {
    if (nodeId === this.hostId) throw new Error("O host não pode ser removido da própria árvore.")
    const children = this.childrenOf(nodeId)
    const assignments = children.map((child) => this.move(child.nodeId, now, "recovery", true)).filter((item): item is TreeAssignment => item !== null)
    this.nodes.delete(nodeId)
    return assignments
  }

  rebalance(now = Date.now()): TreeAssignment[] {
    if (this.migrating) return []
    const candidates = Array.from(this.nodes.values()).filter((node) => node.nodeId !== this.hostId && node.parentId).sort((a, b) => a.nodeId.localeCompare(b.nodeId))
    for (const node of candidates) {
      const assignment = this.move(node.nodeId, now, "rebalance", false)
      if (assignment) {
        this.migrating = node.nodeId
        break
      }
    }
    return this.migrating ? [this.assignmentFor(this.nodes.get(this.migrating)!, "rebalance")] : []
  }

  completeMigration(nodeId: string): void {
    if (this.migrating === nodeId) this.migrating = null
  }

  wouldCreateCycle(childId: string, parentId: string): boolean {
    if (childId === parentId || !this.nodes.has(childId) || !this.nodes.has(parentId)) return true
    let cursor: string | null = parentId
    const visited = new Set<string>()
    while (cursor) {
      if (cursor === childId || visited.has(cursor)) return true
      visited.add(cursor)
      cursor = this.nodes.get(cursor)?.parentId ?? null
    }
    return false
  }

  score(nodeId: string): number {
    const node = this.nodes.get(nodeId)
    if (!node) return Number.POSITIVE_INFINITY
    const metrics = node.metrics
    const depth = this.depthOf(nodeId)
    if (!metrics) return nodeId === this.hostId ? 0.15 : 1
    const rtt = Math.min((metrics.rttMs ?? 250) / 250, 1)
    const loss = Math.min((metrics.packetLossPct ?? 3) / 3, 1)
    const jitter = Math.min((metrics.jitterMs ?? 50) / 50, 1)
    const upload = metrics.availableOutgoingBitrate && metrics.availableOutgoingBitrate > 0 ? Math.min((metrics.outgoingBitrate ?? 0) / metrics.availableOutgoingBitrate, 1) : 1
    return 0.4 * rtt + 0.25 * loss + 0.15 * jitter + 0.1 * upload + 0.1 * (depth / 2)
  }

  private move(childId: string, now: number, reason: TreeAssignment["reason"], recovery: boolean): TreeAssignment | null {
    const node = this.nodes.get(childId)
    if (!node) return null
    const parent = this.chooseParent(childId, now, recovery, true)
    if (!parent || parent === node.parentId) return null
    return this.assign(childId, parent, reason, now)
  }

  private assign(childId: string, parentId: string, reason: TreeAssignment["reason"], now: number): TreeAssignment {
    if (this.wouldCreateCycle(childId, parentId)) throw new Error("A atribuição criaria um ciclo.")
    const depth = this.depthOf(parentId) + 1
    if (depth > 2) throw new Error("A atribuição excede a profundidade máxima.")
    const node = this.nodes.get(childId)!
    node.parentId = parentId
    node.lastMigrationAt = now
    this.epoch += 1
    node.epoch = this.epoch
    return this.assignmentFor(node, reason)
  }

  private assignmentFor(node: TreeNode, reason: TreeAssignment["reason"]): TreeAssignment {
    const parentId = node.parentId!
    return {
      type: "tree.assign",
      sessionId: this.sessionId,
      treeEpoch: node.epoch,
      childId: node.nodeId,
      parentId,
      parentTrysteroId: parentId,
      depth: this.depthOf(node.nodeId) as 1 | 2,
      reason,
      expiresAt: Date.now() + 60_000,
    }
  }

  private chooseParent(childId: string, now: number, recovery: boolean, respectStability: boolean): string | null {
    const node = this.nodes.get(childId)
    if (!node) return null
    if (!recovery && respectStability && now - node.lastMigrationAt < COOLDOWN_MS) return node.parentId
    const currentScore = node.parentId ? this.score(node.parentId) : Number.POSITIVE_INFINITY
    const candidates = Array.from(this.nodes.values()).filter((candidate) => {
      if (candidate.nodeId === childId || this.wouldCreateCycle(childId, candidate.nodeId)) return false
      const isHost = candidate.nodeId === this.hostId
      if (this.depthOf(candidate.nodeId) >= 2) return false
      if (!isHost && (!candidate.relayEnabled || !candidate.stable || !this.eligibleRelay(candidate))) return false
      const capacity = isHost ? this.directSlots : candidate.relaySlots
      const used = this.childrenOf(candidate.nodeId).length
      return used < capacity || (isHost && recovery)
    }).sort((a, b) => this.score(a.nodeId) - this.score(b.nodeId) || a.nodeId.localeCompare(b.nodeId))
    const best = candidates[0]
    if (!best) return null
    if (!recovery && respectStability && node.parentId && this.parentHealthy(node.parentId) && this.score(best.nodeId) > currentScore * HYSTERESIS) return node.parentId
    return best.nodeId
  }

  private parentHealthy(nodeId: string): boolean {
    const node = this.nodes.get(nodeId)
    if (!node) return false
    if (nodeId === this.hostId) return true
    return node.stable && this.eligibleRelay(node)
  }

  private eligibleRelay(node: TreeNode): boolean {
    const metrics = node.metrics
    if (!metrics || metrics.packetLossPct === null || metrics.rttMs === null || metrics.jitterMs === null) return false
    if (metrics.packetLossPct >= 3 || metrics.qualityLimitationReason === "cpu") return false
    if (metrics.availableOutgoingBitrate !== null && metrics.availableOutgoingBitrate < this.targetBitrate * 1.25) return false
    return true
  }

  private childrenOf(parentId: string): TreeNode[] {
    return Array.from(this.nodes.values()).filter((node) => node.parentId === parentId)
  }

  private depthOf(nodeId: string): number {
    let depth = 0
    let cursor = this.nodes.get(nodeId)
    const visited = new Set<string>()
    while (cursor?.parentId) {
      if (visited.has(cursor.nodeId)) throw new Error("A árvore contém um ciclo.")
      visited.add(cursor.nodeId)
      depth += 1
      cursor = this.nodes.get(cursor.parentId)
      if (depth > 2) return depth
    }
    return depth
  }
}
