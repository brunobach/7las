import { findShortCode } from "@/lib/lobby"

/** Esquema registrado no Windows. "7las://" não serve: o nome de um esquema não pode começar com número. */
export const DEEP_LINK_SCHEME = "sevenlas"

/** Lê `sevenlas://entrar/KX7P42QM` (ou `?codigo=`) e devolve o código curto, ou null. */
export function joinCodeFromUrl(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== `${DEEP_LINK_SCHEME}:`) return null
  const action = (url.hostname || url.pathname.replace(/^\/+/, "").split("/")[0]).toLowerCase()
  if (action !== "entrar") return null
  const fromQuery = url.searchParams.get("codigo")
  const fromPath = url.pathname.split("/").filter(Boolean).pop() ?? ""
  return findShortCode(fromQuery ?? fromPath)
}

export type AppDeepLink =
  | { type: "room"; code: string }
  | { type: "friend"; username: string }
  | { type: "legacy"; code: string }

export function parseAppDeepLink(value: string): AppDeepLink | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== `${DEEP_LINK_SCHEME}:`) return null
  const action = (url.hostname || url.pathname.replace(/^\/+/, "").split("/")[0]).toLowerCase()
  const tail = url.pathname.split("/").filter(Boolean).pop() ?? ""
  if (action === "amigo") {
    const username = (url.searchParams.get("nick") ?? tail).toLowerCase()
    return /^[a-z0-9_]{3,20}$/.test(username) ? { type: "friend", username } : null
  }
  if (action !== "entrar") return null
  const roomCode = (url.searchParams.get("sala") ?? "").toUpperCase()
  if (/^[A-F0-9]{10}$/.test(roomCode)) return { type: "room", code: roomCode }
  const rawCode = url.searchParams.get("codigo") ?? tail
  if (/^[A-F0-9]{10}$/i.test(rawCode.replaceAll("-", ""))) return { type: "room", code: rawCode.replaceAll("-", "").toUpperCase() }
  const legacy = findShortCode(rawCode)
  return legacy ? { type: "legacy", code: legacy } : null
}
