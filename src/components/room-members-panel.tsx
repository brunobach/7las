import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Delete01Icon, LockIcon, Tick02Icon, UserAdd01Icon } from "@hugeicons/core-free-icons"
import { UserAvatar } from "@/components/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { roomInviteUrl } from "@/lib/link"
import type { Profile, RoomDetails } from "@/types"

export function RoomMembersPanel({ profile, room, onInvite, onRemove }: {
  profile: Profile
  room: RoomDetails
  onInvite: (username: string) => Promise<void>
  onRemove: (userId: string) => Promise<void>
}) {
  const [username, setUsername] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const invite = async () => {
    setBusy(true)
    setError("")
    try {
      await onInvite(username)
      setUsername("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="border-border/60 bg-card/50 ring-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">Pessoas da sala <Badge variant="secondary">{room.members.length}</Badge></CardTitle>
        <CardDescription>Quem participa pode voltar quando quiser. O dono pode remover acessos.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Button variant="outline" size="sm" onClick={() => {
          void navigator.clipboard.writeText(roomInviteUrl(room.code)).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
        }}><HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} data-icon="inline-start" />{copied ? "Link copiado" : "Copiar link da sala"}</Button>
        {room.role === "owner" && (
          <form onSubmit={(event) => { event.preventDefault(); void invite() }}>
            <FieldGroup>
              <Field data-invalid={Boolean(error)}><FieldLabel htmlFor="room-member-nick">Convidar pelo nick</FieldLabel><Input id="room-member-nick" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="nick_do_amigo" maxLength={20} aria-invalid={Boolean(error)} /><FieldError>{error}</FieldError></Field>
              <Button type="submit" variant="secondary" size="sm" disabled={busy || username.length < 3}>{busy ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={UserAdd01Icon} data-icon="inline-start" />}Adicionar à sala</Button>
            </FieldGroup>
          </form>
        )}
        <ul className="flex flex-col gap-1" aria-label="Membros salvos da sala">
          {room.members.map((member) => (
            <li key={member.id} className="group flex items-center gap-2.5 rounded-lg py-2">
              <div className="relative"><UserAvatar seed={member.avatarSeed} name={member.displayName} size="sm" /><span className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card ${member.online ? "bg-success" : "bg-muted-foreground/40"}`} /></div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.displayName}{member.id === profile.id && <span className="font-normal text-muted-foreground"> (você)</span>}</p><p className="truncate text-[11px] text-muted-foreground">@{member.username}{member.sharing && member.online ? " · compartilhando" : ""}</p></div>
              {member.role === "owner" ? <Badge variant="outline">Dono</Badge> : room.role === "owner" ? <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" aria-label={`Remover ${member.displayName}`} onClick={() => void onRemove(member.id)}><HugeiconsIcon icon={Delete01Icon} /></Button> : null}
            </li>
          ))}
        </ul>
        {room.passwordProtected && <p className="flex items-center gap-2 text-xs text-muted-foreground"><HugeiconsIcon icon={LockIcon} className="size-3.5" />Esta sala também pede senha ao entrar pelo link.</p>}
      </CardContent>
    </Card>
  )
}
