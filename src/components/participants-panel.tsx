import { HugeiconsIcon } from "@hugeicons/react"
import { UserGroupIcon } from "@hugeicons/core-free-icons"
import { UserAvatar } from "@/components/user-avatar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Participant } from "@/media/media-session"

const MAX_VIEWERS = 4

function statusOf(participant: Participant): { label: string; tone: "live" | "ok" | "wait" } {
  if (participant.role === "host") return participant.sharing === false ? { label: "Dono da sala · sem compartilhar", tone: "wait" } : { label: "Compartilhando a tela", tone: "live" }
  if (participant.sharing) return { label: "Compartilhando a tela", tone: "live" }
  if (participant.watching === true) return { label: "Assistindo", tone: "ok" }
  if (participant.watching === false) return { label: "Sem vídeo no momento", tone: "wait" }
  return { label: participant.self ? "Conectando ao vídeo" : "Na sala", tone: "wait" }
}

export function ParticipantsPanel({ participants }: { participants: Participant[] }) {
  const viewers = participants.filter((item) => item.role === "viewer").length
  return (
    <Card className="border-border/60 ring-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={UserGroupIcon} className="size-5 text-muted-foreground" />
          Na sala
        </CardTitle>
        <CardDescription>
          {viewers === 0 ? "Ninguém entrou ainda." : `${viewers} de ${MAX_VIEWERS} lugares ocupados`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1" aria-label="Pessoas na sala">
          {participants.map((participant) => {
            const status = statusOf(participant)
            return (
              <li key={participant.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-secondary/50">
                <div className="relative">
                  <UserAvatar seed={participant.avatar} name={participant.name} size="sm" />
                  <span
                    aria-hidden
                    className={
                      "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card " +
                      (status.tone === "live" ? "bg-live" : status.tone === "ok" ? "bg-success" : "bg-muted-foreground")
                    }
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {participant.name}
                    {participant.self && <span className="font-normal text-muted-foreground"> (você)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{status.label}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
