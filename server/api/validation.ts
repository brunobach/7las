export function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function isUsername(value: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(value)
}

export function cleanDisplayName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 40) : ""
}

export function cleanRoomName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 50) : ""
}

export function cleanRoomCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 10) : ""
}

export function isMediaInvite(value: unknown): value is string {
  return typeof value === "string" && /^[0-9A-Za-z]{22}~[0-9A-Za-z]{22}$/.test(value)
}
