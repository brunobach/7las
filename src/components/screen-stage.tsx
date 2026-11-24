import { useEffect, useRef, useState, type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { FullScreenIcon, PictureInPictureIcon, RectangularIcon } from "@hugeicons/core-free-icons"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { StageScreen } from "@/media/media-session"

const THEATER_KEY = "7las:theater"

/** Modo teatro lembrado neste computador (só conveniência; funciona sem storage). */
export function useTheaterMode(): [boolean, (next: boolean) => void] {
  const [theater, setTheater] = useState(() => {
    try {
      return localStorage.getItem(THEATER_KEY) === "1"
    } catch {
      return false
    }
  })
  const update = (next: boolean) => {
    setTheater(next)
    try {
      localStorage.setItem(THEATER_KEY, next ? "1" : "0")
    } catch {
      // sem storage: vale só nesta sessão
    }
  }
  return [theater, update]
}

function StageVideo({ stream, muted, volume, className }: { stream: MediaStream; muted: boolean; volume?: number; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (element.srcObject !== stream) element.srcObject = stream
    void element.play().catch(() => {
      element.muted = true
      void element.play().catch(() => undefined)
    })
  }, [stream])
  useEffect(() => {
    if (!ref.current) return
    ref.current.muted = muted
    if (volume !== undefined) ref.current.volume = volume
  }, [muted, volume])
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />
}

function screenLabel(screen: StageScreen): string {
  return screen.self ? "Sua tela" : `Tela de ${screen.name}`
}

/**
 * Palco com todas as telas compartilhadas na sala: uma em destaque, as outras em miniatura.
 * O modo teatro (tecla T) alarga o palco ocupando a largura toda, como no YouTube.
 */
export function ScreenStage({ screens, theater, onTheaterChange, empty, toolbar, muted = false, volume }: {
  screens: StageScreen[]
  theater: boolean
  onTheaterChange: (next: boolean) => void
  empty: ReactNode
  toolbar?: ReactNode
  muted?: boolean
  volume?: number
}) {
  const stage = useRef<HTMLDivElement>(null)
  const [chosenId, setChosenId] = useState<string | null>(null)
  // Se a tela escolhida sumir, volta para a primeira (a do host, quando houver).
  const focused = screens.find((screen) => screen.id === chosenId) ?? screens[0] ?? null
  const others = screens.filter((screen) => screen !== focused)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "t" || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable='true']")) return
      onTheaterChange(!theater)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [theater, onTheaterChange])

  const pictureInPicture = () => {
    const video = stage.current?.querySelector("video")
    void video?.requestPictureInPicture().catch(() => undefined)
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={stage} className="app-enter-media overflow-hidden rounded-2xl border border-border bg-[#090a0b]">
        <div className={cn("relative w-full", theater ? "aspect-video max-h-[calc(100svh-230px)]" : "aspect-video")}>
          {focused ? (
            <>
              <StageVideo key={focused.id} stream={focused.stream} muted={muted || focused.self} volume={volume} className="size-full object-contain" />
              <div className="absolute top-3 left-3"><Badge variant={focused.host ? "default" : "secondary"}>{focused.host && <span className="size-1.5 rounded-full bg-primary-foreground" />}{screenLabel(focused)}</Badge></div>
            </>
          ) : empty}
        </div>
        <div className="flex items-center gap-3 border-t border-border bg-card px-4 py-2.5">
          {toolbar}
          <div className="ml-auto flex gap-1">
            <Tooltip>
              <TooltipTrigger render={<Button variant={theater ? "secondary" : "ghost"} size="icon-sm" aria-pressed={theater} aria-label={theater ? "Sair do modo teatro" : "Modo teatro"} onClick={() => onTheaterChange(!theater)} />}>
                <HugeiconsIcon icon={RectangularIcon} />
              </TooltipTrigger>
              <TooltipContent>{theater ? "Sair do modo teatro (T)" : "Modo teatro (T)"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Janela flutuante" disabled={!focused} onClick={pictureInPicture} />}>
                <HugeiconsIcon icon={PictureInPictureIcon} />
              </TooltipTrigger>
              <TooltipContent>Janela flutuante</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Tela cheia" disabled={!focused} onClick={() => void stage.current?.requestFullscreen().catch(() => undefined)} />}>
                <HugeiconsIcon icon={FullScreenIcon} />
              </TooltipTrigger>
              <TooltipContent>Tela cheia</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
      {others.length > 0 && (
        <ul className="flex gap-3 overflow-x-auto pb-1" aria-label="Outras telas compartilhadas">
          {others.map((screen) => (
            <li key={screen.id} className="w-48 shrink-0">
              <button
                type="button"
                className="group block w-full overflow-hidden rounded-xl border border-border bg-[#090a0b] text-left outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setChosenId(screen.id)}
                aria-label={`Ver ${screenLabel(screen).toLowerCase()} em destaque`}
              >
                <div className="aspect-video w-full"><StageVideo stream={screen.stream} muted className="size-full object-contain" /></div>
                <p className="truncate border-t border-border bg-card px-2.5 py-1.5 text-xs font-medium">{screenLabel(screen)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
