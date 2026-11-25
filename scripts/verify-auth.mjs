import { randomBytes } from "node:crypto"
import { createAuthClient } from "@neon/auth"
import { BetterAuthVanillaAdapter } from "@neon/auth/vanilla/adapters"

const authUrl = "https://ep-old-boat-bb8svd20.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth"
const apiUrl = "https://br-noisy-boat-bbh1ond6-api.compute.c-15.us-east-1.aws.neon.tech"
const suffix = Date.now().toString(36)
const email = `7las-teste-${suffix}@example.com`
const password = randomBytes(18).toString("base64url")
const username = `teste_${suffix.slice(-8)}`
const cookies = new Map()
const auth = createAuthClient(authUrl, { adapter: BetterAuthVanillaAdapter({ fetchOptions: {
  headers: { Origin: "http://localhost:5173" },
  onRequest: (context) => {
    const cookie = Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; ")
    if (cookie) context.headers.set("Cookie", cookie)
    return context
  },
  onResponse: (context) => {
    for (const header of context.response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(";")
      const [name, value] = pair.split("=")
      if (attributes.some((item) => /max-age=0/i.test(item.trim())) || !value) cookies.delete(name)
      else cookies.set(name, value)
    }
  },
} }) })
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const api = async (path, token, options = {}) => {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  })
  const data = response.status === 204 ? null : await response.json()
  assert(response.ok, `API ${path}: ${data?.error ?? response.status}`)
  return data
}

try {
  const { data: signedUp, error: signUpError } = await auth.signUp.email({ email, password, name: "Teste 7las", callbackURL: "http://localhost:5173" })
  assert(!signUpError && signedUp?.user, `Cadastro: ${signUpError?.message ?? "sem usuário"}`)
  const userId = signedUp.user.id

  const { data: session, error: sessionError } = await auth.getSession()
  assert(!sessionError && session?.user?.id === userId, `Sessão após cadastro: ${sessionError?.message ?? "usuário não corresponde"}`)

  const token = session.session.token
  assert(token, "Token de sessão ausente")

  await api("/me", token, { method: "PATCH", body: JSON.stringify({ username, displayName: "Teste 7las", avatarSeed: 42 }) })
  const bootstrap = await api("/bootstrap", token)
  assert(bootstrap.profile.id === userId && bootstrap.profile.username === username, "Perfil lido pela API não corresponde ao usuário")

  const created = await api("/rooms", token, { method: "POST", body: JSON.stringify({ name: "Sala de validação", password: "teste-seguro" }) })
  const details = await api(`/rooms/${created.room.code}`, token)
  assert(details.room.members.length === 1 && details.room.passwordProtected, "Sala persistida não foi recuperada corretamente")
  await api(`/rooms/${created.room.code}`, token, { method: "DELETE" })

  await auth.signOut()
  const { data: signedIn, error: signInError } = await auth.signIn.email({ email, password, callbackURL: "http://localhost:5173" })
  assert(!signInError && signedIn?.user?.id === userId, `Login: ${signInError?.message ?? "usuário não corresponde"}`)
  const { data: restored } = await auth.getSession()
  assert(restored?.user?.id === userId, "Sessão restaurada não corresponde ao usuário")

  let wrongPasswordRejected = false
  try {
    const { error: wrongPassword } = await auth.signIn.email({ email, password: "senha-incorreta" })
    wrongPasswordRejected = Boolean(wrongPassword)
  } catch {
    wrongPasswordRejected = true
  }
  assert(wrongPasswordRejected, "Senha incorreta foi aceita")
  await auth.signOut()

  console.log(JSON.stringify({ signUp: true, getSession: true, signInAfterSignOut: true, wrongPasswordRejected: true, protectedApi: true, roomPersisted: true, userId, email }, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
