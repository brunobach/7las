import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Call02Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { Friend } from "@/types"

type Status = { state: "calling" } | { state: "sent" } | { state: "failed"; message: string }

/** Lista de amigos com o botão "Chamar": o convite aparece no canto da tela do amigo. */
export function InviteFriends({ friends, inRoom, onInvite }: {
  friends: Friend[]
  /** Chaves públicas de quem já está na sala não aparecem para chamar. */
  inRoom: (friend: Friend) => boolean
  onInvite: (friend: Friend, signal?: AbortSignal) => Promise<void>
}) {
  const [status, setStatus] = useState<Record<string, Status>>({})
  const controllers = useRef(new Map<string, AbortController>())
  useEffect(() => {
    const current = controllers.current
    return () => current.forEach((controller) => controller.abort())
  }, [])

  const call = async (friend: Friend) => {
    const controller = new AbortController()
    controllers.current.set(friend.friendId, controller)
    setStatus((value) => ({ ...value, [friend.friendId]: { state: "calling" } }))
    try {
      await onInvite(friend, controller.signal)
      setStatus((value) => ({ ...value, [friend.friendId]: { state: "sent" } }))
    } catch (reason) {
      if (controller.signal.aborted) return
      setStatus((value) => ({ ...value, [friend.friendId]: { state: "failed", message: reason instanceof Error ? reason.message : "Não foi possível chamar." } }))
    } finally {
      controllers.current.delete(friend.friendId)
    }
  }

  const available = friends.filter((friend) => !inRoom(friend))
  if (!available.length) return null

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">Ou chame direto</p>
      <ul className="flex flex-col gap-1.5" aria-label="Chamar amigos">
        {available.map((friend) => {
          const current = status[friend.friendId]
          return (
            <li key={friend.friendId} className="flex items-center gap-2.5">
              <UserAvatar seed={friend.avatarSeed} name={friend.displayName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{friend.displayName}</p>
                {current?.state === "sent" && <p className="text-xs text-muted-foreground">Convite entregue</p>}
                {current?.state === "failed" && <p className="text-xs text-destructive">{current.message}</p>}
              </div>
              <Button size="sm" variant={current?.state === "sent" ? "ghost" : "outline"} disabled={current?.state === "calling"} onClick={() => void call(friend)}>
                {current?.state === "calling" ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={current?.state === "sent" ? Tick02Icon : Call02Icon} data-icon="inline-start" />}
                {current?.state === "calling" ? "Chamando…" : current?.state === "sent" ? "Chamar de novo" : "Chamar"}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
