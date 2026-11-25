import { accessToken } from "@/lib/auth"
import type { Bootstrap, Profile, RoomDetails, RoomSummary } from "@/types"

const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "")

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!baseUrl) throw new ApiError("A API ainda não foi configurada.", 503)
  const token = await accessToken()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  })
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new ApiError(data.error || "Não foi possível falar com o servidor.", response.status)
  return data as T
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

export const api = {
  bootstrap: () => request<Bootstrap>("/bootstrap"),
  saveProfile: (profile: Pick<Profile, "username" | "displayName" | "avatarSeed">) => request<{ profile: Profile }>("/me", json("PATCH", profile)),
  createRoom: (name: string, password?: string) => request<{ room: RoomSummary }>("/rooms", json("POST", { name, password })),
  room: (code: string) => request<{ room: RoomDetails }>(`/rooms/${encodeURIComponent(code)}`),
  joinRoom: (code: string, password?: string) => request<{ joined: true }>(`/rooms/${encodeURIComponent(code)}/join`, json("POST", { password })),
  setSession: (code: string, invite: string | null) => request<{ saved: true }>(`/rooms/${encodeURIComponent(code)}/session`, json("PATCH", { invite })),
  invite: (code: string, username: string) => request<{ added: true }>(`/rooms/${encodeURIComponent(code)}/members`, json("POST", { username })),
  removeMember: (code: string, userId: string) => request<{ removed: true }>(`/rooms/${encodeURIComponent(code)}/members/${encodeURIComponent(userId)}`, json("DELETE")),
  deleteRoom: (code: string) => request<{ deleted: true }>(`/rooms/${encodeURIComponent(code)}`, json("DELETE")),
  presence: (code: string, sharing: boolean) => request<void>(`/rooms/${encodeURIComponent(code)}/presence`, json("POST", { sharing })),
  clearPresence: (code: string) => request<void>(`/rooms/${encodeURIComponent(code)}/presence`, json("DELETE")),
  addFriend: (username: string) => request<{ added: true }>("/friends", json("POST", { username })),
  removeFriend: (userId: string) => request<void>(`/friends/${encodeURIComponent(userId)}`, json("DELETE")),
}
