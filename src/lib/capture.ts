import { MODES } from "@/lib/tuning"
import type { QualityMode } from "@/types"

declare class CaptureController {
  setFocusBehavior(behavior: "focus-captured-surface" | "no-focus-change"): void
}

export const canShare = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia)

/**
 * Abre o seletor do Windows. Com `withAudio`, pede também o som do computador
 * (o Windows só entrega som ao compartilhar uma tela inteira, com "Compartilhar áudio do sistema" marcado).
 */
export async function captureScreen(controller?: CaptureController, withAudio = false): Promise<MediaStream> {
  const options = {
    video: { frameRate: { ideal: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    // Som de jogo/vídeo: sem os filtros de voz, que cortam música e efeitos.
    audio: withAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48_000 } : false,
    systemAudio: withAudio ? "include" : "exclude",
    // Não captura o som que o próprio 7las toca (as telas dos amigos), para não fazer eco.
    restrictOwnAudio: true,
    suppressLocalAudioPlayback: false,
    controller,
    surfaceSwitching: "include",
    selfBrowserSurface: "exclude",
    monitorTypeSurfaces: "include",
  } as DisplayMediaStreamOptions
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia(options)
  } catch (error) {
    if (!withAudio || !(error instanceof DOMException) || !["NotReadableError", "OverconstrainedError"].includes(error.name)) throw error
    stream = await navigator.mediaDevices.getDisplayMedia({ ...options, audio: false, systemAudio: "exclude" } as DisplayMediaStreamOptions)
  }
  for (const track of stream.getAudioTracks()) track.contentHint = "music"
  return stream
}

export function applyContentHint(track: MediaStreamTrack | undefined, mode: QualityMode): void {
  if (track) track.contentHint = MODES[mode].hint
}

export function newCaptureController() {
  if (typeof CaptureController === "undefined") return undefined
  const controller = new CaptureController()
  return {
    controller,
    stayHere: () => {
      try {
        controller.setFocusBehavior("no-focus-change")
      } catch {
        return
      }
    },
  }
}
