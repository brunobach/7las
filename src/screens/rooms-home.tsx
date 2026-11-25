import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, ArrowRight01Icon, Copy01Icon, Delete01Icon, Link01Icon, LockIcon, Login03Icon, MoreHorizontalIcon, ScreenShareIcon, Tick02Icon, UserAdd01Icon, UserGroupIcon } from "@hugeicons/core-free-icons"
import { UserAvatar } from "@/components/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { formatRoomCode, friendInviteUrl, normalizeRoomCode, parseRoomCode, roomInviteUrl } from "@/lib/link"
import type { Friend, Profile, RoomSummary } from "@/types"

type Props = {
  profile: Profile
  rooms: RoomSummary[]
  friends: Friend[]
  busy: boolean
  joinRequest?: { code: string; nonce: number } | null
  onCreate: (name: string, password?: string) => Promise<void>
  onJoin: (code: string, password?: string) => Promise<void>
  onOpen: (room: RoomSummary) => Promise<void>
  onDelete: (room: RoomSummary) => Promise<void>
  onAddFriend: (username: string) => Promise<void>
  onRemoveFriend: (friend: Friend) => Promise<void>
}

export function RoomsHome(props: Props) {
  const live = props.rooms.filter((room) => room.sharingCount > 0)
  return (
    <div className="mx-auto grid w-full max-w-[1280px] grid-cols-[minmax(0,1fr)_300px] items-start gap-7 p-8 max-[1050px]:grid-cols-1 max-[700px]:p-5">
      <div className="flex min-w-0 flex-col gap-7">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-sm text-muted-foreground">Olá, {props.profile.displayName.split(" ")[0]}.</p>
            <h1 className="font-heading text-3xl font-medium tracking-[-0.05em]">Suas salas</h1>
            <p className="mt-2 text-sm text-muted-foreground">Entre com um clique ou abra uma transmissão para todo mundo.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <JoinDialog key={props.joinRequest?.nonce ?? "manual"} request={props.joinRequest} busy={props.busy} onJoin={props.onJoin} />
            <CreateDialog busy={props.busy} onCreate={props.onCreate} />
          </div>
        </section>

        {live.length > 0 && (
          <section aria-labelledby="live-rooms">
            <div className="mb-3 flex items-center gap-2"><span className="size-2 rounded-full bg-live" /><h2 id="live-rooms" className="text-sm font-medium">Ao vivo agora</h2><span className="text-xs text-muted-foreground">{live.length} {live.length === 1 ? "sala" : "salas"}</span></div>
            <div className="grid grid-cols-2 gap-3 max-[700px]:grid-cols-1">
              {live.map((room) => <LiveRoom key={room.id} room={room} busy={props.busy} onOpen={props.onOpen} />)}
            </div>
          </section>
        )}

        <section aria-labelledby="all-rooms">
          <div className="mb-3 flex items-center justify-between"><h2 id="all-rooms" className="text-sm font-medium">Todas as salas</h2><span className="text-xs text-muted-foreground">{props.rooms.length} no total</span></div>
          {props.rooms.length ? (
            <div className="grid grid-cols-2 gap-3 max-[700px]:grid-cols-1">
              {props.rooms.map((room) => <RoomCard key={room.id} room={room} busy={props.busy} onOpen={props.onOpen} onDelete={props.onDelete} />)}
            </div>
          ) : (
            <Empty className="border-border/70 bg-card/40 py-12">
              <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={UserGroupIcon} /></EmptyMedia><EmptyTitle>Crie a primeira sala</EmptyTitle><EmptyDescription>Ela fica salva na sua conta. Convide seus amigos uma vez e entre sempre pelo mesmo lugar.</EmptyDescription></EmptyHeader>
              <EmptyContent><CreateDialog busy={props.busy} onCreate={props.onCreate} /></EmptyContent>
            </Empty>
          )}
        </section>
      </div>
      <FriendsPanel {...props} />
    </div>
  )
}

function LiveRoom({ room, busy, onOpen }: { room: RoomSummary; busy: boolean; onOpen: (room: RoomSummary) => Promise<void> }) {
  return (
    <button type="button" className="group flex items-center gap-4 rounded-xl border border-live/20 bg-live/[0.035] p-4 text-left transition-transform hover:-translate-y-0.5" onClick={() => void onOpen(room)} disabled={busy}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-live/10 text-live"><HugeiconsIcon icon={ScreenShareIcon} className="size-5" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{room.name}</span><span className="mt-1 block text-xs text-muted-foreground">{room.sharingCount} {room.sharingCount === 1 ? "tela sendo compartilhada" : "telas sendo compartilhadas"}</span></span>
      <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function RoomCard({ room, busy, onOpen, onDelete }: { room: RoomSummary; busy: boolean; onOpen: (room: RoomSummary) => Promise<void>; onDelete: (room: RoomSummary) => Promise<void> }) {
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const copy = () => void navigator.clipboard.writeText(roomInviteUrl(room.code)).then(() => {
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  })
  return (
    <>
    <Card className="group gap-0 border-border/60 bg-card/50 py-0 ring-0 transition-colors hover:border-border">
      <CardHeader className="px-5 pt-5">
        <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-border bg-background"><HugeiconsIcon icon={UserGroupIcon} className="size-4 text-muted-foreground" /></div>
        <CardTitle className="truncate text-base">{room.name}</CardTitle>
        <CardDescription className="flex items-center gap-2 font-mono text-[11px] tracking-wider">{formatRoomCode(room.code)}{room.passwordProtected && <HugeiconsIcon icon={LockIcon} className="size-3" />}</CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Opções de ${room.name}`} />}><HugeiconsIcon icon={MoreHorizontalIcon} /></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup><DropdownMenuItem onClick={copy}><HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} />{copied ? "Link copiado" : "Copiar convite"}</DropdownMenuItem></DropdownMenuGroup>
              {room.role === "owner" && <><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}><HugeiconsIcon icon={Delete01Icon} />Excluir sala</DropdownMenuItem></DropdownMenuGroup></>}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="px-5 pt-5">
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${room.onlineCount ? "bg-success" : "bg-muted-foreground/40"}`} />{room.onlineCount} online</span><span>·</span><span>{room.role === "owner" ? "Sua sala" : "Convidado"}</span></div>
      </CardContent>
      <CardFooter className="px-5 pt-4 pb-5">
        <Button variant={room.sharingCount ? "default" : "secondary"} className="w-full" disabled={busy} onClick={() => void onOpen(room)}>
          {busy ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={room.mediaInvite ? Login03Icon : ScreenShareIcon} data-icon="inline-start" />}
          {room.mediaInvite ? "Entrar na sala" : "Abrir sala"}
        </Button>
      </CardFooter>
    </Card>
    <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <DialogContent>
        <DialogHeader><DialogTitle>Excluir “{room.name}”?</DialogTitle><DialogDescription>A sala e todos os acessos serão removidos. Essa ação não pode ser desfeita.</DialogDescription></DialogHeader>
        {deleteError && <FieldError>{deleteError}</FieldError>}
        <DialogFooter><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button><Button variant="destructive" disabled={deleting} onClick={() => {
          setDeleting(true)
          setDeleteError("")
          void onDelete(room).then(() => setConfirmDelete(false)).catch((reason) => setDeleteError(reason instanceof Error ? reason.message : String(reason))).finally(() => setDeleting(false))
        }}>{deleting && <Spinner data-icon="inline-start" />}Excluir sala</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

function FriendsPanel({ profile, friends, onAddFriend, onRemoveFriend }: Pick<Props, "profile" | "friends" | "onAddFriend" | "onRemoveFriend">) {
  const [username, setUsername] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const add = async () => {
    setBusy(true)
    setError("")
    try {
      await onAddFriend(username)
      setUsername("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/35 p-5 max-[1050px]:w-full">
      <div className="flex items-center justify-between"><div><h2 className="text-sm font-medium">Amigos</h2><p className="mt-1 text-xs text-muted-foreground">Encontre pelo nick único.</p></div><Badge variant="secondary">{friends.length}</Badge></div>
      <form onSubmit={(event) => { event.preventDefault(); void add() }}>
        <FieldGroup>
          <Field data-invalid={Boolean(error)}><FieldLabel htmlFor="friend-username" className="sr-only">Nick do amigo</FieldLabel><Input id="friend-username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="@nick_do_amigo" maxLength={20} aria-invalid={Boolean(error)} /><FieldError>{error}</FieldError></Field>
          <Button type="submit" variant="outline" size="sm" disabled={busy || username.length < 3}>{busy ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={UserAdd01Icon} data-icon="inline-start" />}Adicionar amigo</Button>
        </FieldGroup>
      </form>
      {friends.length > 0 ? <ul className="flex flex-col gap-1" aria-label="Lista de amigos">{friends.map((friend) => (
        <li key={friend.friendId} className="group flex items-center gap-2.5 rounded-lg px-1 py-2">
          <UserAvatar seed={friend.avatarSeed} name={friend.displayName} size="sm" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{friend.displayName}</p><p className="truncate text-[11px] text-muted-foreground">@{friend.username}</p></div>
          <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" aria-label={`Remover ${friend.displayName}`} onClick={() => void onRemoveFriend(friend)}><HugeiconsIcon icon={Delete01Icon} /></Button>
        </li>
      ))}</ul> : <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs leading-5 text-muted-foreground">Seus amigos aparecem aqui.</p>}
      <Button variant="ghost" size="sm" className="mt-2 justify-start px-1 text-muted-foreground" onClick={() => {
        void navigator.clipboard.writeText(friendInviteUrl(profile.username)).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}><HugeiconsIcon icon={copied ? Tick02Icon : Link01Icon} data-icon="inline-start" />{copied ? "Convite copiado" : "Convidar para o 7las"}</Button>
    </aside>
  )
}

function CreateDialog({ busy, onCreate }: { busy: boolean; onCreate: Props["onCreate"] }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const submit = async () => {
    setSaving(true)
    setError("")
    try {
      await onCreate(name, password || undefined)
      setName("")
      setPassword("")
      setOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button /> }><HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />Criar sala</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Uma sala para chamar de sua</DialogTitle><DialogDescription>O acesso fica salvo. Adicione uma senha se quiser controlar quem entra pelo link.</DialogDescription></DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); void submit() }}><FieldGroup>
          <Field><FieldLabel htmlFor="new-room-name">Nome da sala</FieldLabel><Input id="new-room-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Sala dos amigos" maxLength={50} required autoFocus /></Field>
          <Field data-invalid={Boolean(error)}><FieldLabel htmlFor="new-room-password">Senha <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel><Input id="new-room-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" minLength={6} autoComplete="new-password" /><FieldDescription>Você pode compartilhar o link só com quem conhece.</FieldDescription><FieldError>{error}</FieldError></Field>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving || busy || !name.trim()}>{saving && <Spinner data-icon="inline-start" />}Criar e abrir sala</Button></DialogFooter>
        </FieldGroup></form>
      </DialogContent>
    </Dialog>
  )
}

function JoinDialog({ busy, onJoin, request }: { busy: boolean; onJoin: Props["onJoin"]; request?: Props["joinRequest"] }) {
  const [open, setOpen] = useState(Boolean(request))
  const [code, setCode] = useState(request ? formatRoomCode(request.code) : "")
  const [password, setPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const submit = async () => {
    setSaving(true)
    setError("")
    try {
      await onJoin(parseRoomCode(code), password || undefined)
      setCode("")
      setPassword("")
      setOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}><HugeiconsIcon icon={Login03Icon} data-icon="inline-start" />Entrar com código</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Entrar em uma sala</DialogTitle><DialogDescription>Cole o link ou digite o código. Se a sala tiver senha, ela será pedida aqui.</DialogDescription></DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); void submit() }}><FieldGroup>
          <Field><FieldLabel htmlFor="join-room-code">Código da sala</FieldLabel><Input id="join-room-code" value={code} onChange={(event) => setCode(formatRoomCode(normalizeRoomCode(event.target.value)))} onPaste={(event) => { const pasted = event.clipboardData.getData("text"); if (pasted.includes("http")) { event.preventDefault(); setCode(formatRoomCode(parseRoomCode(pasted))) } }} placeholder="A1B2C-3D4E5" className="font-mono tracking-widest uppercase" required autoFocus /></Field>
          <Field data-invalid={Boolean(error)}><FieldLabel htmlFor="join-room-password">Senha <span className="font-normal text-muted-foreground">(se houver)</span></FieldLabel><Input id="join-room-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" /><FieldError>{error}</FieldError></Field>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving || busy || parseRoomCode(code).length !== 10}>{saving && <Spinner data-icon="inline-start" />}Entrar na sala</Button></DialogFooter>
        </FieldGroup></form>
      </DialogContent>
    </Dialog>
  )
}
