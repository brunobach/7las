import { describe, expect, it } from "vitest"
import { TreeCoordinator, type NodeMetrics } from "@/media/tree-coordinator"

function metrics(nodeId: string, overrides: Partial<NodeMetrics> = {}): NodeMetrics {
  return {
    nodeId,
    sessionId: "session",
    treeEpoch: 1,
    at: 10_000,
    rttMs: 30,
    jitterMs: 5,
    packetLossPct: 0.2,
    incomingBitrate: 4_000_000,
    outgoingBitrate: 0,
    availableOutgoingBitrate: 20_000_000,
    framesPerSecond: 60,
    freezeCount: 0,
    qualityLimitationReason: null,
    activeChildren: 0,
    relayEnabled: true,
    relaySlots: 1,
    route: "direct",
    ...overrides,
  }
}

function readyTree(): TreeCoordinator {
  const tree = new TreeCoordinator("host", "session")
  expect(tree.addNode({ nodeId: "A", relayEnabled: true, relaySlots: 1 })?.parentId).toBe("host")
  expect(tree.addNode({ nodeId: "B", relayEnabled: true, relaySlots: 1 })?.parentId).toBe("host")
  tree.updateMetrics("A", metrics("A"), true)
  tree.updateMetrics("B", metrics("B"), true)
  return tree
}

describe("TreeCoordinator", () => {
  it("forma Host → A/B → C/D com duas saídas no host", () => {
    const tree = readyTree()
    expect(tree.addNode({ nodeId: "C", relayEnabled: false, relaySlots: 0 })?.parentId).toBe("A")
    expect(tree.addNode({ nodeId: "D", relayEnabled: false, relaySlots: 0 })?.parentId).toBe("B")
    expect(tree.getAssignments().filter((node) => node.parentId === "host")).toHaveLength(2)
    expect(tree.getAssignments().find((node) => node.childId === "C")?.depth).toBe(2)
  })

  it("nunca atribui filhos sem consentimento", () => {
    const tree = new TreeCoordinator("host", "session")
    tree.addNode({ nodeId: "A", relayEnabled: false, relaySlots: 0 })
    tree.addNode({ nodeId: "B", relayEnabled: false, relaySlots: 0 })
    const assignment = tree.addNode({ nodeId: "C", relayEnabled: false, relaySlots: 0 })
    expect(assignment).toBeNull()
    expect(tree.nodes.get("A")?.parentId).toBe("host")
  })

  it("rejeita relay saturado mesmo com menor RTT", () => {
    const tree = readyTree()
    tree.updateMetrics("A", metrics("A", { rttMs: 1, packetLossPct: 4 }), true)
    const assignment = tree.addNode({ nodeId: "C", relayEnabled: false, relaySlots: 0 })
    expect(assignment?.parentId).toBe("B")
  })

  it("rejeita headroom abaixo de 1,25 vezes o bitrate alvo", () => {
    const tree = readyTree()
    tree.updateMetrics("A", metrics("A", { availableOutgoingBitrate: 8_000_000 }), true)
    expect(tree.addNode({ nodeId: "C", relayEnabled: false, relaySlots: 0 })?.parentId).toBe("B")
  })

  it("prefere o host quando faltam métricas confiáveis", () => {
    const tree = new TreeCoordinator("host", "session")
    tree.addNode({ nodeId: "A", relayEnabled: true, relaySlots: 1 })
    expect(tree.addNode({ nodeId: "B", relayEnabled: false, relaySlots: 0 })?.parentId).toBe("host")
  })

  it("detecta ciclos e ancestrais", () => {
    const tree = readyTree()
    tree.addNode({ nodeId: "C", relayEnabled: true, relaySlots: 1 })
    expect(tree.wouldCreateCycle("A", "C")).toBe(true)
    expect(tree.wouldCreateCycle("A", "A")).toBe(true)
    expect(tree.wouldCreateCycle("C", "B")).toBe(false)
  })

  it("aplica cooldown de 30 segundos em otimizações", () => {
    const tree = readyTree()
    tree.addNode({ nodeId: "C", relayEnabled: false, relaySlots: 1 }, 100_000)
    tree.updateMetrics("B", metrics("B", { rttMs: 1 }), true)
    expect(tree.rebalance(110_000)).toHaveLength(0)
  })

  it("recupera filhos quando um relay sai", () => {
    const tree = readyTree()
    tree.addNode({ nodeId: "C", relayEnabled: false, relaySlots: 0 })
    const assignments = tree.removeNode("A")
    expect(assignments[0]?.childId).toBe("C")
    expect(assignments[0]?.parentId).toBe("B")
    expect(assignments[0]?.reason).toBe("recovery")
  })

  it("reenvia a atribuição com a época em que o nó foi atribuído", () => {
    const tree = new TreeCoordinator("host", "session", 2)
    const first = tree.addNode({ nodeId: "A", relayEnabled: false, relaySlots: 0 }, 0)
    tree.addNode({ nodeId: "B", relayEnabled: false, relaySlots: 0 }, 0)
    const resent = tree.assignmentOf("A")
    expect(resent?.parentId).toBe("host")
    expect(resent?.treeEpoch).toBe(first?.treeEpoch)
    expect(tree.treeEpoch).toBeGreaterThan(resent!.treeEpoch)
    expect(tree.assignmentOf("missing")).toBeNull()
  })
})
