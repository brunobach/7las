import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerScreenShareIcon, Copy01Icon, Logout03Icon, RefreshIcon, ScreenShareIcon, StopIcon, Tick02Icon, Upload01Icon, UserGroupIcon } from "@hugeicons/core-free-icons"
import { cn } from "cn"
import { AudioToggle } from "@/components/audio-toggle"
import { InviteFriends } from "@/components/invite-friends"
import { ParticipantsPanel } from "@/components/participants-panel"
import { ScreenStage, useTheaterMode } from "@/components/screen-stage"
import { TreeVisual } from "@/components/tree-visual"
import { UserAvatar } from "@/components/user-avatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { inviteMessage } from "@/lib/link"
import { formatShortCode, shortCodeMessage } from "@/lib/lobby"
import type { MediaSession } from "@/media/media-session"
import { wantsAudio } from "@/types"
import type { AppSettings, Friend, QualityMode, SessionNotice } from "@/types"

export function RoomScreen({ session, settings, friends, onInviteFriend, onAudioChange, starting, onStart, onShare, onStopSharing, onClose, onMode, onNotice, acceptShortcut }: {
  session: MediaSession | null
  settings: AppSettings
  friends: Friend[]
  onInviteFriend: (friend: Friend, signal?: AbortSignal) => Promise<void>
  onAudioChange: (enabled: boolean) => void
  starting: boolean
  onStart: () => void
  onShare: () => void
  onStopSharing: () => void
  onClose: () => void
  onMode: (mode: QualityMode) => void
  onNotice: (notice: SessionNotice) => void
  acceptShortcut: string | null
}) {
  const [copied, setCopied] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [theater, setTheater] = useTheaterMode()

  if (!session || session.role !== "host") {
    return (
      <div className="flex min-h-full items-center justify-center p-7">
        <Empty className="max-w-lg border border-border bg-card/40">
          <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={ComputerScreenShareIcon} /></EmptyMedia><EmptyTitle>Nenhuma sala aberta</EmptyTitle><EmptyDescription>Crie uma sala para chamar seus amigos. Você compartilha a tela quando quiser.</EmptyDescription></EmptyHeader>
          <EmptyContent><Button disabled={starting} onClick={onStart}>{starting ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={UserGroupIcon} data-icon="inline-start" />}{starting ? "Abrindo a sala…" : "Criar sala"}</Button></EmptyContent>
        </Empty>
      </div>
    )
  }

  const changeSource = async () => {
    setSwitching(true)
    try {
      await session.changeSource(wantsAudio(settings))
      onNotice({ tone: "success", title: "Fonte trocada" })
    } catch (reason) {
      // Fechar o seletor do Windows não é um erro de conexão: só avisamos e seguimos com a fonte atual.
      if (reason instanceof DOMException && reason.name === "NotAllowedError") {
        onNotice({ tone: "info", title: "Fonte mantida", description: "Você fechou o seletor; a transmissão continua com a mesma tela." })
      } else {
        onNotice({ tone: "error", title: "Não foi possível trocar a fonte", description: reason instanceof Error ? reason.message : String(reason) })
      }
    } finally {
      setSwitching(false)
    }
  }

  const shortCode = session.shortCode
  const copyInvite = () => void navigator.clipboard.writeText(shortCode ? shortCodeMessage(shortCode) : inviteMessage(session.inviteCode)).then(() => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  })

  const viewers = session.viewerCount
  const sharing = session.sharing

  return (
    <div className={cn("mx-auto flex w-full flex-col gap-5 p-7 pb-10", theater ? "max-w-[1600px]" : "max-w-[1180px]")}>
      <section className="app-enter flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><h1 className="font-heading text-2xl font-medium tracking-[-0.04em]">{settings.roomName}</h1>{sharing ? <Badge><span className="size-1.5 rounded-full bg-live" />Ao vivo</Badge> : <Badge variant="secondary">Sala aberta</Badge>}</div>
          <p className="mt-1.5 text-sm text-muted-foreground">{viewers === 0 ? "Esperando seus amigos entrarem" : `${viewers} ${viewers === 1 ? "pessoa" : "pessoas"} na sala${sharing ? "" : " · sua tela ainda não está sendo mostrada"}`}</p>
        </div>
        <div className="flex gap-2">
          {sharing ? (
            <>
              <Button variant="outline" disabled={switching} onClick={() => void changeSource()}><HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />Trocar tela</Button>
              <Button variant="outline" onClick={onStopSharing}><HugeiconsIcon icon={StopIcon} data-icon="inline-start" />Parar de compartilhar</Button>
            </>
          ) : (
            <>
              <AudioToggle enabled={wantsAudio(settings)} onChange={onAudioChange} />
              <Button onClick={onShare}><HugeiconsIcon icon={ScreenShareIcon} data-icon="inline-start" />Compartilhar tela</Button>
            </>
          )}
          <Button variant="destructive" onClick={onClose}><HugeiconsIcon icon={Logout03Icon} data-icon="inline-start" />Fechar sala</Button>
        </div>
      </section>
      {session.error && <Alert variant="destructive"><AlertTitle>Problema na conexão</AlertTitle><AlertDescription>{session.error}</AlertDescription></Alert>}
      <div className={cn("items-start gap-5", theater ? "flex flex-col" : "grid grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]")}>
        <div className="w-full min-w-0">
          <ScreenStage
            screens={session.screens}
            theater={theater}
            onTheaterChange={setTheater}
            empty={(
              <div className="flex size-full flex-col items-center justify-center gap-4 p-6 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card/80" aria-hidden><HugeiconsIcon icon={ComputerScreenShareIcon} className="size-6" /></span>
                <div>
                  <p className="font-heading text-lg font-medium tracking-[-0.03em]">Ninguém está compartilhando ainda</p>
                  <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{viewers === 0 ? "Chame seus amigos com o código. Quando quiser, comece a compartilhar." : "Seus amigos já estão na sala. Qualquer um pode compartilhar a tela, inclusive você."}</p>
                </div>
                <Button onClick={onShare}><HugeiconsIcon icon={ScreenShareIcon} data-icon="inline-start" />Compartilhar tela</Button>
              </div>
            )}
            toolbar={(
              <div className="flex items-center gap-5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><HugeiconsIcon icon={UserGroupIcon} className="size-4" />{viewers} de 4 na sala</span>
                {sharing && <span className="flex items-center gap-1.5 tabular-nums"><HugeiconsIcon icon={Upload01Icon} className="size-4" />{session.uploadBitrate === null ? "Medindo envio…" : `${(session.uploadBitrate / 1_000_000).toFixed(1)} Mbps de envio`}</span>}
              </div>
            )}
          />
        </div>
        <div className={cn("gap-5", theater ? "grid w-full grid-cols-2 items-start max-[860px]:grid-cols-1" : "flex flex-col")}>
          {session.knocks.length > 0 && (
            <Card className="border-primary/50 ring-0" aria-live="polite">
              <CardHeader><CardTitle>Querem entrar</CardTitle><CardDescription>Só aceite quem você conhece.{acceptShortcut && <> Mesmo com o 7las minimizado, <kbd className="rounded border border-border bg-secondary px-1 font-mono text-[11px] text-foreground">{acceptShortcut}</kbd> aceita todos.</>}</CardDescription></CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {session.knocks.map((request) => (
                    <li key={request.id} className="flex items-center gap-2">
                      <UserAvatar seed={request.avatar} name={request.name} size="sm" />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{request.name}</p>
                      <Button size="sm" variant="ghost" onClick={() => session.deny(request.id)}>Recusar</Button>
                      <Button size="sm" onClick={() => session.admit(request.id)}>Aceitar</Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card className="border-border/60 ring-0">
            <CardHeader><CardTitle>Chamar amigos</CardTitle><CardDescription>{shortCode ? "Mande este código. Quando alguém pedir para entrar, você aceita aqui." : "Envie o convite por mensagem. Quem receber clica em “Entrar com convite” e cola."}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {shortCode && <p className="text-center font-mono text-3xl font-medium tracking-[0.12em] tabular-nums select-all" aria-label={`Código ${shortCode.split("").join(" ")}`}>{formatShortCode(shortCode)}</p>}
              <Button onClick={copyInvite}><HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} data-icon="inline-start" />{copied ? "Convite copiado" : "Copiar convite"}</Button>
              {!shortCode && <p className="truncate font-mono text-[11px] text-muted-foreground" title={session.inviteCode}>{session.inviteCode}</p>}
              <InviteFriends friends={friends} inRoom={(friend) => session.participants.some((person) => !person.self && person.name === friend.displayName)} onInvite={onInviteFriend} />
            </CardContent>
          </Card>
          <ParticipantsPanel participants={session.participants} />
          <Card className="border-border/60 ring-0">
            <CardHeader><CardTitle>Qualidade</CardTitle><CardDescription>Nitidez para texto e código, fluidez para jogos e vídeos.</CardDescription></CardHeader>
            <CardContent><ToggleGroup className="w-full" variant="outline" value={[session.mode]} onValueChange={(value) => value[0] && onMode(value[0] as QualityMode)}><ToggleGroupItem className="flex-1" value="sharp">Nítido · 30 fps</ToggleGroupItem><ToggleGroupItem className="flex-1" value="smooth">Fluido · 60 fps</ToggleGroupItem></ToggleGroup></CardContent>
          </Card>
        </div>
      </div>
      <details className="group rounded-xl border border-border/60 bg-card/40 px-5 py-4">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground select-none group-open:text-foreground">Detalhes da conexão</summary>
        <p className="mt-2 mb-4 text-xs text-muted-foreground">Seu computador envia o vídeo direto para até duas pessoas. Se alguém permitir, ajuda repassando para outra.</p>
        <TreeVisual settings={settings} viewers={session.viewers} live={session.status === "live"} />
      </details>
    </div>
  )
}
