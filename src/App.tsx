import { useCallback, useEffect, useRef, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { AppShell } from "@/components/app-shell"
import { Logo } from "@/components/logo"
import { Notice } from "@/components/notice"
import { RoomMembersPanel } from "@/components/room-members-panel"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError } from "@/lib/api"
import { getAccount, signOut, type Account } from "@/lib/auth"
import { discordAvailable, getSettings, isTauri, saveSettings, setAcceptShortcut, ACCEPT_SHORTCUT, setAutostart, showToast, showWindow, updateDiscordPresence, updateSharingState, updateShortcut, type ToastItem } from "@/lib/desktop"
import { installDesktopGuards } from "@/lib/desktop-guards"
import { parseAppDeepLink, type AppDeepLink } from "@/lib/deep-link"
import { knock } from "@/lib/lobby"
import { MediaSession } from "@/media/media-session"
import { AuthScreen } from "@/screens/auth"
import { RoomScreen } from "@/screens/room"
import { RoomsHome } from "@/screens/rooms-home"
import { SettingsScreen } from "@/screens/settings"
import { ViewerScreen } from "@/screens/viewer"
import { wantsAudio } from "@/types"
import type { AppSettings, AppView, Bootstrap, Friend, Profile, QualityMode, RoomDetails, RoomSummary, SessionNotice } from "@/types"

const mapData = (data: Bootstrap) => ({
  ...data,
  friends: data.friends.map((friend): Friend => ({ ...friend, publicKey: friend.friendId, createdAt: Date.parse(friend.createdAt) })),
})

export default function App() {
  const [account, setAccount] = useState<Account | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [activeRoom, setActiveRoom] = useState<RoomSummary | null>(null)
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null)
  const [view, setView] = useState<AppView>("home")
  const [session, setSession] = useState<MediaSession | null>(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<SessionNotice>(null)
  const [discordReady, setDiscordReady] = useState(false)
  const [acceptShortcutActive, setAcceptShortcutActive] = useState(false)
  const [presenceStartedAt] = useState(() => Date.now())
  const [pendingLink, setPendingLink] = useState<AppDeepLink | null>(null)
  const [joinRequest, setJoinRequest] = useState<{ code: string; nonce: number } | null>(null)
  const settingsRef = useRef(settings)
  const sessionRef = useRef(session)
  const activeRoomRef = useRef(activeRoom)
  const profileRef = useRef(profile)

  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { activeRoomRef.current = activeRoom }, [activeRoom])
  useEffect(() => { profileRef.current = profile }, [profile])
  useEffect(() => installDesktopGuards(), [])
  useEffect(() => {
    void getAccount().catch(() => null).then(setAccount).finally(() => setAuthLoading(false))
    void getSettings().then(setSettings).catch(() => undefined)
    void discordAvailable().then(setDiscordReady)
  }, [])

  const notify = useCallback((next: SessionNotice) => setNotice(next), [])
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 4500)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const refreshData = useCallback(async () => {
    const data = mapData(await api.bootstrap())
    setProfile(data.profile)
    setRooms(data.rooms)
    setFriends(data.friends)
    const current = settingsRef.current
    if (current && (current.displayName !== data.profile.displayName || current.avatarSeed !== data.profile.avatarSeed)) {
      setSettings({ ...current, displayName: data.profile.displayName, avatarSeed: data.profile.avatarSeed })
    }
    return data
  }, [])

  const refreshRoom = useCallback(async (code: string) => {
    const { room } = await api.room(code)
    setRoomDetails(room)
    setActiveRoom((current) => current?.code === code ? { ...current, ...room } : current)
    setRooms((list) => list.map((item) => item.code === code ? { ...item, ...room } : item))
    return room
  }, [])

  useEffect(() => {
    if (!account) return
    const timer = window.setTimeout(() => {
      void refreshData().catch((reason) => {
        if (reason instanceof ApiError && reason.status === 401) setAccount(null)
        else notify({ tone: "error", title: "Não foi possível carregar sua conta", description: reason instanceof Error ? reason.message : String(reason) })
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [account, notify, refreshData])

  useEffect(() => {
    if (!account || session) return
    const update = () => {
      if (document.visibilityState === "visible") void refreshData().catch(() => undefined)
    }
    const timer = window.setInterval(update, 20_000)
    return () => window.clearInterval(timer)
  }, [account, refreshData, session])

  const persistSettings = useCallback(async (next: AppSettings, nextUsername?: string) => {
    const saved = await saveSettings(next)
    const currentProfile = profileRef.current
    const username = nextUsername ?? currentProfile?.username
    if (currentProfile && username && (saved.displayName !== currentProfile.displayName || saved.avatarSeed !== currentProfile.avatarSeed || username !== currentProfile.username)) {
      const { profile: updated } = await api.saveProfile({ username, displayName: saved.displayName, avatarSeed: saved.avatarSeed })
      setProfile(updated)
    }
    setSettings(saved)
    sessionRef.current?.updateSettings(saved)
    return saved
  }, [])

  const clearRemoteSession = useCallback(async (current: MediaSession | null, room: RoomSummary | null) => {
    if (room) {
      if (current?.role === "host") await api.setSession(room.code, null).catch(() => undefined)
      await api.clearPresence(room.code).catch(() => undefined)
    }
  }, [])

  const stop = useCallback(async (goHome = true) => {
    const current = sessionRef.current
    const room = activeRoomRef.current
    if (current) await current.stop()
    await clearRemoteSession(current, room)
    setSession(null)
    setActiveRoom(null)
    setRoomDetails(null)
    if (goHome) setView("home")
    await updateSharingState({ live: false, sessionId: null, viewerCount: 0, directOutputs: 0 })
    if (account) await refreshData().catch(() => undefined)
  }, [account, clearRemoteSession, refreshData])

  const openRoom = useCallback(async (room: RoomSummary) => {
    const currentSettings = settingsRef.current
    if (!currentSettings || busy) return
    if (sessionRef.current && activeRoomRef.current?.code === room.code) {
      setView("room")
      return
    }
    setBusy(true)
    let next: MediaSession | null = null
    try {
      if (sessionRef.current) await stop(false)
      const details = await api.room(room.code)
      next = details.room.mediaInvite
        ? await MediaSession.watch(details.room.mediaInvite, currentSettings, refresh, () => {
            notify({ tone: "info", title: "A transmissão foi encerrada", description: "A sala continua salva e pode ser aberta novamente." })
            refresh()
          })
        : await MediaSession.startHost(currentSettings, refresh, () => {
            notify({ tone: "info", title: "Você parou de compartilhar", description: "A sala continua aberta." })
          }, () => setView("room"))
      if (next.role === "host") await api.setSession(room.code, next.inviteCode)
      setSession(next)
      setActiveRoom({ ...room, ...details.room, mediaInvite: next.inviteCode, mediaHostId: next.role === "host" ? profileRef.current?.id ?? null : details.room.mediaHostId })
      setRoomDetails({ ...details.room, mediaInvite: next.inviteCode })
      setView("room")
      notify({ tone: "success", title: next.role === "host" ? "Sala aberta" : `Você entrou em ${details.room.name}`, description: next.role === "host" ? "Compartilhe sua tela quando quiser. Qualquer pessoa da sala também pode compartilhar." : undefined })
    } catch (reason) {
      await next?.stop().catch(() => undefined)
      notify({ tone: "error", title: "Não foi possível abrir a sala", description: reason instanceof Error ? reason.message : String(reason) })
      setView("home")
      await refreshData().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }, [busy, notify, refresh, refreshData, stop])

  const createRoom = async (name: string, password?: string) => {
    const { room } = await api.createRoom(name, password)
    setRooms((list) => [room, ...list])
    await openRoom(room)
  }

  const joinRoom = useCallback(async (code: string, password?: string) => {
    try {
      await api.joinRoom(code, password)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 403) {
        setJoinRequest({ code, nonce: Date.now() })
        setView("home")
      }
      throw reason
    }
    const { room } = await api.room(code)
    setRooms((list) => [room, ...list.filter((item) => item.code !== room.code)])
    await openRoom(room)
  }, [openRoom])

  const joinLegacy = useCallback(async (shortCode: string) => {
    const currentSettings = settingsRef.current
    if (!currentSettings || busy) return
    setBusy(true)
    try {
      notify({ tone: "info", title: "Pedindo para entrar", description: "Seu amigo ainda precisa aceitar este convite antigo." })
      const invite = await knock(shortCode, currentSettings)
      if (sessionRef.current) await stop(false)
      const next = await MediaSession.watch(invite, currentSettings, refresh, () => {
        notify({ tone: "info", title: "A sala foi fechada" })
        refresh()
      })
      setSession(next)
      setActiveRoom(null)
      setRoomDetails(null)
      setView("room")
    } finally {
      setBusy(false)
    }
  }, [busy, notify, refresh, stop])

  const handleDeepLink = useCallback(async (link: AppDeepLink) => {
    if (link.type === "room") {
      await joinRoom(link.code)
      return
    }
    if (link.type === "friend") {
      await api.addFriend(link.username)
      await refreshData()
      notify({ tone: "success", title: "Amigo adicionado", description: `@${link.username} agora está na sua lista.` })
      return
    }
    await joinLegacy(link.code)
  }, [joinLegacy, joinRoom, notify, refreshData])

  useEffect(() => {
    if (!isTauri) return
    const handle = (urls: string[] | null) => {
      const link = urls?.map(parseAppDeepLink).find((item): item is AppDeepLink => Boolean(item))
      if (!link) return
      void showWindow().catch(() => undefined)
      setPendingLink(link)
    }
    let off: (() => void) | undefined
    let cancelled = false
    void import("@tauri-apps/plugin-deep-link").then(async ({ getCurrent, onOpenUrl }) => {
      handle(await getCurrent().catch(() => null))
      const unlisten = await onOpenUrl(handle)
      if (cancelled) unlisten()
      else off = unlisten
    }).catch(() => undefined)
    return () => {
      cancelled = true
      off?.()
    }
  }, [])

  useEffect(() => {
    if (!pendingLink || !account || !profile || busy) return
    const timer = window.setTimeout(() => {
      const link = pendingLink
      setPendingLink(null)
      void handleDeepLink(link).catch((reason) => notify({ tone: "error", title: "Não foi possível abrir o convite", description: reason instanceof Error ? reason.message : String(reason) }))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [account, busy, handleDeepLink, notify, pendingLink, profile])

  const share = useCallback(async () => {
    const current = sessionRef.current
    const currentSettings = settingsRef.current
    if (!current || !currentSettings || current.status === "ended") return
    const withAudio = wantsAudio(currentSettings)
    try {
      await current.startSharing(withAudio)
      if (current.sharing) {
        if (withAudio && !current.sharingAudio) notify({ tone: "info", title: "Compartilhando sem som", description: "No seletor do Windows, escolha uma tela inteira e marque “Compartilhar áudio do sistema”." })
        else notify({ tone: "success", title: current.sharingAudio ? "Tela e som compartilhados" : "Sua tela está ao vivo" })
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "NotAllowedError") notify({ tone: "info", title: "Nada foi compartilhado" })
      else notify({ tone: "error", title: "Não foi possível compartilhar", description: reason instanceof Error ? reason.message : String(reason) })
    }
  }, [notify])

  const stopSharing = useCallback(async () => {
    const current = sessionRef.current
    if (!current?.sharing) return
    await current.stopSharing()
    notify({ tone: "info", title: "Você parou de compartilhar", description: "Você continua na sala." })
  }, [notify])

  useEffect(() => {
    const leave = () => sessionRef.current?.closeNow()
    window.addEventListener("pagehide", leave)
    return () => window.removeEventListener("pagehide", leave)
  }, [])

  const sharing = Boolean(session?.sharing)
  useEffect(() => {
    if (!session || !activeRoom || session.status === "ended") return
    let cancelled = false
    const heartbeat = async () => {
      try {
        await api.presence(activeRoom.code, sharing)
        const { room } = await api.room(activeRoom.code)
        if (!cancelled) {
          setRoomDetails(room)
          setRooms((list) => list.map((item) => item.code === room.code ? { ...item, ...room } : item))
        }
      } catch (reason) {
        if (!cancelled && reason instanceof ApiError && (reason.status === 401 || reason.status === 403)) {
          notify({ tone: "info", title: "Seu acesso à sala foi encerrado" })
          await stop()
        }
      }
    }
    void heartbeat()
    const timer = window.setInterval(() => void heartbeat(), 20_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeRoom, notify, session, sharing, stop])

  const hasKnocks = session?.role === "host" && session.knocks.length > 0
  useEffect(() => {
    void setAcceptShortcut(hasKnocks).then(setAcceptShortcutActive).catch(() => setAcceptShortcutActive(false))
  }, [hasKnocks])
  const toastItems: ToastItem[] = session?.role === "host" ? session.knocks.map((request) => ({
    id: `knock:${request.id}`,
    title: `${request.name} quer entrar na sua sala`,
    avatar: request.avatar,
    body: acceptShortcutActive ? `Aperte ${ACCEPT_SHORTCUT} para aceitar de qualquer lugar.` : undefined,
    accept: "Aceitar",
    deny: "Recusar",
  })) : []
  const toastKey = JSON.stringify(toastItems)
  useEffect(() => { void showToast(JSON.parse(toastKey) as ToastItem[]).catch(() => undefined) }, [toastKey])

  useEffect(() => {
    if (!isTauri) return
    const listeners = [
      listen("toast://ready", () => void showToast(JSON.parse(toastKey) as ToastItem[]).catch(() => undefined)),
      listen<{ id: string; accept: boolean }>("toast://answer", ({ payload }) => {
        const current = sessionRef.current
        if (current?.role !== "host") return
        if (payload.accept) current.admit(payload.id.slice(payload.id.indexOf(":") + 1))
        else current.deny(payload.id.slice(payload.id.indexOf(":") + 1))
      }),
      listen("shortcut://accept", () => sessionRef.current?.role === "host" && sessionRef.current.admitAll()),
      listen("tray://share", () => sessionRef.current ? setView("room") : setView("home")),
      listen("tray://room", () => setView("room")),
      listen("tray://settings", () => setView("settings")),
      listen("tray://stop", () => void (sessionRef.current?.sharing ? stopSharing() : stop())),
    ]
    return () => { void Promise.all(listeners).then((items) => items.forEach((off) => off())) }
  }, [stop, stopSharing, toastKey])

  useEffect(() => {
    void updateSharingState({ live: session?.role === "host" ? session.sharing : session?.status === "live", sessionId: session?.id || null, viewerCount: session?.viewers.length ?? 0, directOutputs: session?.directOutputs ?? 0 }).catch(() => undefined)
  }, [session, revision])

  useEffect(() => {
    if (!settings?.discordPresence || !discordReady) {
      void updateDiscordPresence(null)
      return
    }
    void updateDiscordPresence(session && activeRoom ? {
      details: session.sharing ? "Compartilhando a tela" : `Em ${activeRoom.name}`,
      state: `${Math.max(1, session.participants.length)} na sala`,
      partySize: Math.max(1, session.participants.length),
      partyMax: 5,
      joinCode: null,
      startedAt: presenceStartedAt,
    } : { details: "No início", state: "Escolhendo uma sala", partySize: 1, partyMax: 5, startedAt: presenceStartedAt })
  }, [activeRoom, discordReady, presenceStartedAt, revision, session, settings?.discordPresence])

  const handleSignOut = async () => {
    await stop(false)
    await signOut()
    setAccount(null)
    setProfile(null)
    setRooms([])
    setFriends([])
    setView("home")
  }

  if (authLoading || !settings) return <div className="flex h-svh flex-col items-center justify-center gap-5 bg-background"><Logo /><Spinner /><p className="text-sm text-muted-foreground">Abrindo o 7las</p></div>
  if (!account) return <><AuthScreen onSuccess={async (next, warning) => { setAccount(next); if (warning) notify({ tone: "info", title: warning }) }} /><Notice notice={notice} /></>
  if (!profile) return <div className="flex h-svh flex-col items-center justify-center gap-5 bg-background"><Logo /><Spinner /><p className="text-sm text-muted-foreground">Carregando suas salas</p></div>

  const membersPanel = activeRoom && roomDetails ? <RoomMembersPanel profile={profile} room={roomDetails} onInvite={async (username) => {
    await api.invite(activeRoom.code, username)
    await refreshRoom(activeRoom.code)
    notify({ tone: "success", title: "Pessoa adicionada à sala" })
  }} onRemove={async (userId) => {
    await api.removeMember(activeRoom.code, userId)
    await refreshRoom(activeRoom.code)
    notify({ tone: "info", title: "Acesso removido" })
  }} /> : undefined

  return (
    <>
      <AppShell view={view} onView={setView} live={session?.role === "host" ? session.sharing : session?.status === "live"} settings={settings} profile={profile} onSave={async (next, username) => { await persistSettings(next, username) }} onSignOut={handleSignOut}>
        {view === "home" && <RoomsHome profile={profile} rooms={rooms} friends={friends} busy={busy} joinRequest={joinRequest} onCreate={createRoom} onJoin={joinRoom} onOpen={openRoom} onDelete={async (room) => {
          await api.deleteRoom(room.code)
          setRooms((list) => list.filter((item) => item.code !== room.code))
          notify({ tone: "info", title: "Sala excluída" })
        }} onAddFriend={async (username) => {
          await api.addFriend(username)
          await refreshData()
          notify({ tone: "success", title: "Amigo adicionado" })
        }} onRemoveFriend={async (friend) => {
          await api.removeFriend(friend.friendId)
          setFriends((list) => list.filter((item) => item.friendId !== friend.friendId))
        }} />}
        {view === "settings" && <SettingsScreen settings={settings} onSave={async (next) => {
          const saved = await persistSettings(next)
          await setAutostart(saved.startWithWindows)
          await updateShortcut(saved.globalShortcut)
          notify({ tone: "success", title: "Configurações salvas" })
        }} />}
        {view === "room" && !session && <div className="flex min-h-full items-center justify-center p-7"><Empty className="border-border bg-card/40"><EmptyHeader><EmptyTitle>Nenhuma transmissão aberta</EmptyTitle><EmptyDescription>Escolha uma sala salva no início. Ela continuará na sua conta quando você sair.</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={() => setView("home")}>Ver minhas salas</Button></EmptyContent></Empty></div>}
        {view === "room" && session?.role === "viewer" && <ViewerScreen session={session} audio={wantsAudio(settings)} onAudioChange={(enabled) => void persistSettings({ ...settings, audioMode: enabled ? "system" : "none" })} onStop={() => void stop()} onShare={() => void share()} onStopSharing={() => void stopSharing()} />}
        {view === "room" && session?.role === "host" && <RoomScreen session={session} settings={settings} room={activeRoom ?? undefined} membersPanel={membersPanel} friends={friends} onInviteFriend={async (friend) => { if (activeRoom && friend.username) { await api.invite(activeRoom.code, friend.username); await refreshRoom(activeRoom.code) } }} onAudioChange={(enabled) => void persistSettings({ ...settings, audioMode: enabled ? "system" : "none" })} starting={busy} onStart={() => setView("home")} onShare={() => void share()} onStopSharing={() => void stopSharing()} onClose={() => void stop()} onMode={(mode: QualityMode) => session.setMode(mode)} onNotice={notify} acceptShortcut={acceptShortcutActive ? ACCEPT_SHORTCUT : null} />}
      </AppShell>
      <Notice notice={notice} />
    </>
  )
}
