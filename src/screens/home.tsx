import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete01Icon, Login03Icon, ScreenShareIcon, UserGroupIcon } from "@hugeicons/core-free-icons"
import { FriendsDialog } from "@/components/friends-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatCodeInput } from "@/lib/lobby"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import type { AppSettings, Friend } from "@/types"

type JoinOptions = { signal?: AbortSignal; onWaiting?: () => void }

export type DiscordOption = { available: boolean; connected: boolean | null; onChange: (enabled: boolean) => void; onJoinButtonChange: (enabled: boolean) => void }

export function HomeScreen({ settings, discord, pendingJoin, friends, starting, onStart, onAddFriend, onRemoveFriend, onJoin }: {
  settings: AppSettings
  discord: DiscordOption
  /** Código vindo de um link sevenlas:// (botão do Discord): preenche e já pede para entrar. */
  pendingJoin: { code: string; nonce: number } | null
  friends: Friend[]
  starting: boolean
  onStart: () => void
  onAddFriend: (friend: Friend) => Promise<void>
  onRemoveFriend: (friendId: string) => Promise<void>
  onJoin: (invite: string, options?: JoinOptions) => Promise<void>
}) {
  const firstName = settings.displayName.trim().split(/\s+/)[0]
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 p-7">
      <section className="app-enter" aria-labelledby="home-title">
        <h1 id="home-title" className="font-heading text-[28px] leading-tight font-medium tracking-[-0.045em]">Oi, {firstName}. O que vamos fazer?</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">Crie uma sala para mostrar sua tela a até 4 amigos, ou entre na sala de alguém com o código que te mandaram.</p>
      </section>


      <div className="grid grid-cols-2 gap-5 max-[860px]:grid-cols-1">
        <ShareCard starting={starting} onStart={onStart} />
        <JoinCard key={pendingJoin?.nonce ?? "manual"} onJoin={onJoin} initialCode={pendingJoin?.code ?? ""} autoSubmit={Boolean(pendingJoin)} />
      </div>

      <Card className="border-border/60 ring-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={UserGroupIcon} className="size-5 text-muted-foreground" />Amigos</CardTitle>
          <CardDescription>Guarde quem você chama sempre para reconhecer na hora em que pedirem para entrar.</CardDescription>
          <CardAction><Badge variant="secondary">{friends.length} {friends.length === 1 ? "amigo" : "amigos"}</Badge></CardAction>
        </CardHeader>
        {friends.length > 0 && (
          <CardContent>
            <ul className="grid grid-cols-2 gap-2 max-[860px]:grid-cols-1" aria-label="Amigos">
              {friends.map((friend) => (
                <li key={friend.friendId} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/30 p-2.5">
                  <Avatar size="sm"><AvatarFallback>{friend.displayName.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{friend.displayName}</p>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remover ${friend.displayName}`} onClick={() => void onRemoveFriend(friend.friendId)}><HugeiconsIcon icon={Delete01Icon} /></Button>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
        <CardFooter className="border-t border-border pt-4">
          <FriendsDialog settings={settings} onAdd={onAddFriend} />
        </CardFooter>
      </Card>

      <DiscordCard enabled={settings.discordPresence} joinButton={settings.discordJoinButton} option={discord} />
    </div>
  )
}

const SHARE_STEPS = [
  "Crie a sala e mande o código para seus amigos.",
  "Aceite quem pedir para entrar.",
  "Compartilhe a tela quando todos estiverem prontos.",
]

function ShareCard({ starting, onStart }: { starting: boolean; onStart: () => void }) {
  return (
    <Card className="app-enter-media border-primary/40 ring-0">
      <CardHeader>
        <span className="mb-1 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-hidden><HugeiconsIcon icon={ScreenShareIcon} className="size-5" /></span>
        <CardTitle className="text-lg">Criar uma sala</CardTitle>
        <CardDescription>Uma sala só sua. Só entra quem você aceitar.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <ol className="flex flex-col gap-2.5">
          {SHARE_STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-sm">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-medium tabular-nums">{index + 1}</span>
              <span className="text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </CardContent>
      <CardFooter>
        <Button size="lg" className="h-11 w-full" disabled={starting} onClick={onStart}>
          {starting ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={UserGroupIcon} data-icon="inline-start" />}
          {starting ? "Abrindo a sala…" : "Criar sala"}
        </Button>
      </CardFooter>
    </Card>
  )
}

function JoinCard({ onJoin, initialCode, autoSubmit }: { onJoin: (invite: string, options?: JoinOptions) => Promise<void>; initialCode: string; autoSubmit: boolean }) {
  const [value, setValue] = useState(() => formatCodeInput(initialCode))
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState("")
  const abort = useRef<AbortController | null>(null)

  const join = async () => {
    if (!value.trim() || busy) return
    const controller = new AbortController()
    abort.current = controller
    setBusy(true)
    setError("")
    try {
      await onJoin(value, { signal: controller.signal, onWaiting: () => setWaiting(true) })
      setValue("")
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível entrar na sala.")
    } finally {
      abort.current = null
      setBusy(false)
      setWaiting(false)
    }
  }

  // Veio de um link: pede para entrar sozinho, uma vez.
  const joinRef = useRef(join)
  useEffect(() => {
    joinRef.current = join
  })
  useEffect(() => {
    if (!autoSubmit) return
    const timer = window.setTimeout(() => void joinRef.current(), 0)
    return () => window.clearTimeout(timer)
  }, [autoSubmit])

  return (
    <Card className="app-enter-media border-border/60 ring-0">
      <CardHeader>
        <span className="mb-1 flex size-11 items-center justify-center rounded-xl bg-secondary" aria-hidden><HugeiconsIcon icon={Login03Icon} className="size-5" /></span>
        <CardTitle className="text-lg">Entrar na sala de um amigo</CardTitle>
        <CardDescription>Digite o código que te mandaram. Pode colar a mensagem inteira.</CardDescription>
      </CardHeader>
      {waiting ? (
        <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-2 text-center" role="status">
          <Spinner className="size-6" />
          <div>
            <p className="text-sm font-medium">Esperando seu amigo aceitar</p>
            <p className="mt-1 text-sm text-muted-foreground">Ele vê seu nome e decide se você entra.</p>
          </div>
          <Button variant="outline" onClick={() => abort.current?.abort()}>Cancelar pedido</Button>
        </CardContent>
      ) : (
        <>
          <CardContent className="flex flex-1 flex-col gap-2">
            <label htmlFor="session-invite" className="text-sm font-medium">Código da sala</label>
            <Input
              id="session-invite"
              value={value}
              onChange={(event) => setValue(formatCodeInput(event.target.value))}
              onKeyDown={(event) => event.key === "Enter" && void join()}
              placeholder="KX7P-42QM"
              autoComplete="off"
              spellCheck={false}
              className="h-12 text-center font-mono text-lg tracking-[0.15em] uppercase placeholder:tracking-[0.15em]"
              aria-invalid={!!error}
              aria-describedby={error ? "session-invite-error" : undefined}
            />
            {error && <p id="session-invite-error" className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter>
            <Button size="lg" variant="secondary" className="h-11 w-full" disabled={busy || !value.trim()} onClick={() => void join()}>
              {busy && <Spinner data-icon="inline-start" />}Pedir para entrar
            </Button>
          </CardFooter>
        </>
      )}
    </Card>
  )
}

function DiscordCard({ enabled, joinButton, option }: { enabled: boolean; joinButton: boolean; option: DiscordOption }) {
  const status = !option.available
    ? "Indisponível nesta versão do app."
    : !enabled
      ? "Seus amigos do Discord veem no seu perfil quando você está no 7las."
      : option.connected === false
        ? "Ligado, mas o Discord não está aberto neste computador. Assim que abrir, o status aparece."
        : "Ligado. Seu perfil mostra “Jogando 7las” e, numa sala, quantas pessoas estão com você."
  const active = enabled && option.available
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card px-5 py-4">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="discord-presence" className="text-sm font-medium">Mostrar no Discord</label>
          <p className="mt-0.5 text-xs text-muted-foreground">{status}</p>
        </div>
        <Switch id="discord-presence" checked={active} disabled={!option.available} onCheckedChange={option.onChange} />
      </div>
      {active && (
        <div className="flex items-center gap-4 border-t border-border pt-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="discord-join" className="text-sm font-medium">Botão “Entrar na sala”</label>
            <p className="mt-0.5 text-xs text-muted-foreground">Quando você criar uma sala, quem olhar seu perfil pode pedir para entrar por um botão. Você ainda aceita cada pedido. O código da sala fica visível no link.</p>
          </div>
          <Switch id="discord-join" checked={joinButton} onCheckedChange={option.onJoinButtonChange} />
        </div>
      )}
    </div>
  )
}
