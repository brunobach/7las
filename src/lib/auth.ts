import { createAuthClient } from "@neon/auth"

const authUrl = import.meta.env.VITE_NEON_AUTH_URL?.replace(/\/$/, "")
export const authConfigured = Boolean(authUrl)
export const authClient = authUrl ? createAuthClient(authUrl) : null

export type Account = { id: string; email: string; name: string }

function message(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return new Error(error.message)
  return new Error(fallback)
}

export async function getAccount(): Promise<Account | null> {
  if (!authClient) return null
  const { data, error } = await authClient.getSession()
  if (error) throw message(error, "Não foi possível restaurar sua sessão.")
  return data?.user ?? null
}

export async function signIn(email: string, password: string): Promise<Account> {
  if (!authClient) throw new Error("O login ainda não foi configurado.")
  const { data, error } = await authClient.signIn.email({ email, password })
  if (error) throw message(error, "Email ou senha incorretos.")
  if (!data.user) throw new Error("Não foi possível entrar.")
  return data.user
}

export async function signUp(email: string, password: string, name: string): Promise<Account> {
  if (!authClient) throw new Error("O cadastro ainda não foi configurado.")
  const { data, error } = await authClient.signUp.email({ email, password, name })
  if (error) throw message(error, "Não foi possível criar sua conta.")
  if (!data.user) throw new Error("Não foi possível criar sua conta.")
  return data.user
}

export async function signOut(): Promise<void> {
  if (!authClient) return
  const { error } = await authClient.signOut()
  if (error) throw message(error, "Não foi possível sair da conta.")
}

export async function accessToken(): Promise<string> {
  if (!authClient) throw new Error("O login ainda não foi configurado.")
  const client = authClient as unknown as { token: () => Promise<{ data: { token: string } | null; error: unknown }> }
  const { data, error } = await client.token()
  if (error || !data?.token) throw message(error, "Não foi possível autenticar a conexão.")
  return data.token
}
