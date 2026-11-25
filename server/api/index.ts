import { attachDatabasePool } from "@neon/functions"
import { compare, hash } from "bcryptjs"
import { Hono } from "hono"
import { createRemoteJWKSet, jwtVerify } from "jose"
import { Pool } from "pg"
import { cleanDisplayName, cleanRoomCode, cleanRoomName, isMediaInvite, isUsername, normalizeUsername } from "./validation.js"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
attachDatabasePool(pool)
const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL!))
const issuer = new URL(process.env.NEON_AUTH_BASE_URL!).origin

type Variables = { userId: string }
const app = new Hono<{ Variables: Variables }>()

app.use("*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", c.req.header("Origin") ?? "*")
  c.header("Access-Control-Allow-Headers", "Authorization, Content-Type")
  c.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
  c.header("Access-Control-Max-Age", "86400")
  c.header("Vary", "Origin")
  if (c.req.method === "OPTIONS") return c.body(null, 204)
  await next()
})

app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next()
  const authorization = c.req.header("Authorization")
  if (!authorization?.toLowerCase().startsWith("bearer ")) return c.json({ error: "Sessão inválida." }, 401)
  let userId: string
  try {
    const { payload } = await jwtVerify(authorization.slice(7), jwks, { issuer })
    if (!payload.sub) return c.json({ error: "Sessão inválida." }, 401)
    userId = payload.sub
  } catch {
    return c.json({ error: "Sua sessão expirou. Entre novamente." }, 401)
  }
  c.set("userId", userId)
  const username = `user_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`
  await pool.query(
    `INSERT INTO sevenlas.profiles (id, username, display_name)
     VALUES ($1, $2, 'Novo usuário') ON CONFLICT (id) DO NOTHING`,
    [userId, username],
  )
  return next()
})

app.get("/health", (c) => c.json({ ok: true }))

app.get("/bootstrap", async (c) => {
  const userId = c.get("userId")
  const [profile, rooms, friends] = await Promise.all([
    pool.query(`SELECT id, username, display_name AS "displayName", avatar_seed AS "avatarSeed" FROM sevenlas.profiles WHERE id = $1`, [userId]),
    pool.query(
      `SELECT r.id, r.code, r.name, r.owner_id AS "ownerId", m.role,
              r.media_invite AS "mediaInvite", r.media_host_id AS "mediaHostId",
              r.password_hash IS NOT NULL AS "passwordProtected",
              (SELECT count(*) FROM sevenlas.room_presence p
               WHERE p.room_id = r.id AND p.updated_at > now() - interval '45 seconds')::int AS "onlineCount",
              (SELECT count(*) FROM sevenlas.room_presence p
               WHERE p.room_id = r.id AND p.sharing AND p.updated_at > now() - interval '45 seconds')::int AS "sharingCount"
       FROM sevenlas.room_members m
       JOIN sevenlas.rooms r ON r.id = m.room_id
       WHERE m.user_id = $1
       ORDER BY r.updated_at DESC`,
      [userId],
    ),
    pool.query(
      `SELECT p.id AS "friendId", p.username, p.display_name AS "displayName",
              p.avatar_seed AS "avatarSeed", f.created_at AS "createdAt"
       FROM sevenlas.friendships f
       JOIN sevenlas.profiles p ON p.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
       WHERE f.user_id = $1 OR f.friend_id = $1
       ORDER BY p.display_name`,
      [userId],
    ),
  ])
  return c.json({ profile: profile.rows[0], rooms: rooms.rows, friends: friends.rows })
})

app.patch("/me", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const username = normalizeUsername(body.username)
  const displayName = cleanDisplayName(body.displayName)
  const avatarSeed = body.avatarSeed
  if (!isUsername(username)) return c.json({ error: "Use um nick de 3 a 20 caracteres: letras, números ou _." }, 400)
  if (!displayName) return c.json({ error: "Digite um nome para exibir." }, 400)
  if (!Number.isInteger(avatarSeed) || avatarSeed < 0) return c.json({ error: "Avatar inválido." }, 400)
  const result = await pool.query(
    `UPDATE sevenlas.profiles SET username = $2, display_name = $3, avatar_seed = $4, updated_at = now()
     WHERE id = $1 RETURNING id, username, display_name AS "displayName", avatar_seed AS "avatarSeed"`,
    [c.get("userId"), username, displayName, avatarSeed],
  )
  return c.json({ profile: result.rows[0] })
})

app.post("/rooms", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const name = cleanRoomName(body.name)
  const password = typeof body.password === "string" ? body.password : ""
  if (!name) return c.json({ error: "Dê um nome para a sala." }, 400)
  if (password && (password.length < 6 || password.length > 128)) return c.json({ error: "A senha precisa ter entre 6 e 128 caracteres." }, 400)
  const passwordHash = password ? await hash(password, 12) : null
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const room = await client.query(
      `INSERT INTO sevenlas.rooms (owner_id, name, password_hash) VALUES ($1, $2, $3) RETURNING id, code, name, owner_id AS "ownerId"`,
      [c.get("userId"), name, passwordHash],
    )
    await client.query("INSERT INTO sevenlas.room_members (room_id, user_id, role) VALUES ($1, $2, 'owner')", [room.rows[0].id, c.get("userId")])
    await client.query("COMMIT")
    return c.json({ room: { ...room.rows[0], role: "owner", onlineCount: 0, sharingCount: 0, mediaInvite: null, mediaHostId: null, passwordProtected: Boolean(passwordHash) } }, 201)
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

app.get("/rooms/:code", async (c) => {
  const code = cleanRoomCode(c.req.param("code"))
  const userId = c.get("userId")
  const room = await pool.query(
    `SELECT r.id, r.code, r.name, r.owner_id AS "ownerId", m.role,
            r.media_invite AS "mediaInvite", r.media_host_id AS "mediaHostId",
            r.password_hash IS NOT NULL AS "passwordProtected",
            (SELECT count(*) FROM sevenlas.room_presence p
             WHERE p.room_id = r.id AND p.updated_at > now() - interval '45 seconds')::int AS "onlineCount",
            (SELECT count(*) FROM sevenlas.room_presence p
             WHERE p.room_id = r.id AND p.sharing AND p.updated_at > now() - interval '45 seconds')::int AS "sharingCount"
     FROM sevenlas.rooms r
     JOIN sevenlas.room_members m ON m.room_id = r.id AND m.user_id = $2
     WHERE r.code = $1`,
    [code, userId],
  )
  if (!room.rowCount) return c.json({ error: "Você não participa dessa sala." }, 403)
  const members = await pool.query(
    `SELECT p.id, p.username, p.display_name AS "displayName", p.avatar_seed AS "avatarSeed",
            m.role, pr.sharing, pr.updated_at AS "lastSeen",
            (pr.updated_at > now() - interval '45 seconds') AS online
     FROM sevenlas.room_members m
     JOIN sevenlas.profiles p ON p.id = m.user_id
     LEFT JOIN sevenlas.room_presence pr ON pr.room_id = m.room_id AND pr.user_id = m.user_id
     WHERE m.room_id = $1 ORDER BY m.role, p.display_name`,
    [room.rows[0].id],
  )
  return c.json({ room: { ...room.rows[0], members: members.rows } })
})

app.post("/rooms/:code/join", async (c) => {
  const code = cleanRoomCode(c.req.param("code"))
  const userId = c.get("userId")
  const room = await pool.query("SELECT id, password_hash FROM sevenlas.rooms WHERE code = $1", [code])
  if (!room.rowCount) return c.json({ error: "Sala não encontrada. Confira o código." }, 404)
  const member = await pool.query("SELECT 1 FROM sevenlas.room_members WHERE room_id = $1 AND user_id = $2", [room.rows[0].id, userId])
  if (!member.rowCount) {
    const body = await c.req.json().catch(() => ({}))
    const password = typeof body.password === "string" ? body.password : ""
    if (room.rows[0].password_hash && (!password || !await compare(password, room.rows[0].password_hash))) {
      return c.json({ error: "Senha da sala incorreta." }, 403)
    }
    await pool.query("INSERT INTO sevenlas.room_members (room_id, user_id) VALUES ($1, $2)", [room.rows[0].id, userId])
  }
  return c.json({ joined: true })
})

app.patch("/rooms/:code/session", async (c) => {
  const code = cleanRoomCode(c.req.param("code"))
  const userId = c.get("userId")
  const body = await c.req.json().catch(() => ({}))
  if (body.invite !== null && !isMediaInvite(body.invite)) return c.json({ error: "Convite de transmissão inválido." }, 400)
  const room = await pool.query(
    `SELECT r.id, r.owner_id, r.media_host_id FROM sevenlas.rooms r
     JOIN sevenlas.room_members m ON m.room_id = r.id AND m.user_id = $2 WHERE r.code = $1`,
    [code, userId],
  )
  if (!room.rowCount) return c.json({ error: "Você não participa dessa sala." }, 403)
  if (body.invite === null && room.rows[0].owner_id !== userId && room.rows[0].media_host_id !== userId) {
    return c.json({ error: "Só quem abriu a transmissão pode encerrá-la." }, 403)
  }
  await pool.query(
    `UPDATE sevenlas.rooms SET media_invite = $2, media_host_id = $3, media_updated_at = now(), updated_at = now() WHERE id = $1`,
    [room.rows[0].id, body.invite, body.invite ? userId : null],
  )
  return c.json({ saved: true })
})

app.post("/rooms/:code/members", async (c) => {
  const code = cleanRoomCode(c.req.param("code"))
  const body = await c.req.json().catch(() => ({}))
  const username = normalizeUsername(body.username)
  const room = await pool.query("SELECT id FROM sevenlas.rooms WHERE code = $1 AND owner_id = $2", [code, c.get("userId")])
  if (!room.rowCount) return c.json({ error: "Só o dono da sala pode convidar pessoas." }, 403)
  const profile = await pool.query("SELECT id FROM sevenlas.profiles WHERE username = $1", [username])
  if (!profile.rowCount) return c.json({ error: "Nenhuma conta usa esse nick." }, 404)
  await pool.query("INSERT INTO sevenlas.room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [room.rows[0].id, profile.rows[0].id])
  return c.json({ added: true }, 201)
})

app.delete("/rooms/:code/members/:userId", async (c) => {
  const code = cleanRoomCode(c.req.param("code"))
  const target = c.req.param("userId")
  if (target === c.get("userId")) return c.json({ error: "Você é o dono e não pode ser removido." }, 400)
  const room = await pool.query("SELECT id FROM sevenlas.rooms WHERE code = $1 AND owner_id = $2", [code, c.get("userId")])
  if (!room.rowCount) return c.json({ error: "Só o dono da sala pode remover pessoas." }, 403)
  await pool.query("DELETE FROM sevenlas.room_members WHERE room_id = $1 AND user_id = $2 AND role <> 'owner'", [room.rows[0].id, target])
  return c.json({ removed: true })
})

app.delete("/rooms/:code", async (c) => {
  const result = await pool.query("DELETE FROM sevenlas.rooms WHERE code = $1 AND owner_id = $2", [cleanRoomCode(c.req.param("code")), c.get("userId")])
  if (!result.rowCount) return c.json({ error: "Só o dono pode excluir a sala." }, 403)
  return c.json({ deleted: true })
})

app.post("/rooms/:code/presence", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const code = cleanRoomCode(c.req.param("code"))
  const userId = c.get("userId")
  const room = await pool.query(
    `SELECT r.id FROM sevenlas.rooms r JOIN sevenlas.room_members m ON m.room_id = r.id AND m.user_id = $2 WHERE r.code = $1`,
    [code, userId],
  )
  if (!room.rowCount) return c.json({ error: "Você não participa dessa sala." }, 403)
  await pool.query(
    `INSERT INTO sevenlas.room_presence (room_id, user_id, sharing) VALUES ($1, $2, $3)
     ON CONFLICT (room_id, user_id) DO UPDATE SET sharing = EXCLUDED.sharing, updated_at = now()`,
    [room.rows[0].id, userId, body.sharing === true],
  )
  return c.body(null, 204)
})

app.delete("/rooms/:code/presence", async (c) => {
  await pool.query(
    `DELETE FROM sevenlas.room_presence WHERE user_id = $2 AND room_id IN
       (SELECT id FROM sevenlas.rooms WHERE code = $1)`,
    [cleanRoomCode(c.req.param("code")), c.get("userId")],
  )
  return c.body(null, 204)
})

app.get("/friends", async (c) => {
  const result = await pool.query(
    `SELECT p.id AS "friendId", p.username, p.display_name AS "displayName", p.avatar_seed AS "avatarSeed", f.created_at AS "createdAt"
     FROM sevenlas.friendships f
     JOIN sevenlas.profiles p ON p.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
     WHERE f.user_id = $1 OR f.friend_id = $1 ORDER BY p.display_name`,
    [c.get("userId")],
  )
  return c.json({ friends: result.rows })
})

app.post("/friends", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const username = normalizeUsername(body.username)
  const userId = c.get("userId")
  const profile = await pool.query("SELECT id FROM sevenlas.profiles WHERE username = $1", [username])
  if (!profile.rowCount) return c.json({ error: "Nenhuma conta usa esse nick." }, 404)
  const friendId = profile.rows[0].id
  if (friendId === userId) return c.json({ error: "Esse é o seu próprio nick." }, 400)
  const pair = userId < friendId ? [userId, friendId] : [friendId, userId]
  await pool.query("INSERT INTO sevenlas.friendships (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", pair)
  return c.json({ added: true }, 201)
})

app.delete("/friends/:userId", async (c) => {
  const userId = c.get("userId")
  const friendId = c.req.param("userId")
  const pair = userId < friendId ? [userId, friendId] : [friendId, userId]
  await pool.query("DELETE FROM sevenlas.friendships WHERE user_id = $1 AND friend_id = $2", pair)
  return c.body(null, 204)
})

app.notFound((c) => c.json({ error: "Rota não encontrada." }, 404))
app.onError((error, c) => {
  const cause = error as { code?: string }
  if (cause.code === "23505") return c.json({ error: "Esse nick já está em uso." }, 409)
  console.error("7las API", error.message)
  return c.json({ error: "Não foi possível concluir a operação." }, 500)
})

export default app
