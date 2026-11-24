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
