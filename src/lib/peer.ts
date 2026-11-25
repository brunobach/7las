import { MODES, pickCodec, stereoOpus } from "@/lib/tuning"
import type { QualityMode } from "@/types"

type Encoding = RTCRtpEncodingParameters & { codec?: RTCRtpCodec }
const peers = new Set<TunedPeerConnection>()
let currentMode: QualityMode = "smooth"
let hardware = new Set<string>()

export class TunedPeerConnection extends RTCPeerConnection {
  constructor(config?: RTCConfiguration) {
    super(config)
    peers.add(this)
    const settle = () => {
      if (this.connectionState === "closed" || this.connectionState === "failed") peers.delete(this)
      else if (this.connectionState === "connected" && this.signalingState === "stable") void tune(this)
    }
    this.addEventListener("connectionstatechange", settle)
    this.addEventListener("signalingstatechange", settle)
  }

  override setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    return super.setRemoteDescription(description.sdp ? { type: description.type, sdp: stereoOpus(description.sdp) } : description)
  }

  override close(): void {
    peers.delete(this)
    super.close()
  }
}

export function setPeerMode(mode: QualityMode): void {
  currentMode = mode
  for (const peer of peers) void tune(peer)
}

export async function detectHardware(): Promise<void> {
  const found = new Set<string>()
  await Promise.all(["video/AV1", "video/VP9", "video/H264"].map(async (contentType) => {
    try {
      const info = await navigator.mediaCapabilities.encodingInfo({
        type: "webrtc",
        video: { contentType, width: 1920, height: 1080, bitrate: 6_000_000, framerate: 60 },
      })
      if (info.supported && info.powerEfficient) found.add(contentType)
    } catch {
      return
    }
  }))
  hardware = found
}

async function tune(peer: RTCPeerConnection): Promise<void> {
  for (const sender of peer.getSenders()) {
    if (sender.track?.kind === "audio") {
      const params = sender.getParameters()
      const encoding = params.encodings[0]
      if (!encoding) continue
      encoding.maxBitrate = 128_000
      encoding.priority = "high"
      await sender.setParameters(params).catch(() => undefined)
      continue
    }
    if (sender.track?.kind !== "video") continue
    const params = sender.getParameters()
    const encoding = params.encodings[0] as Encoding | undefined
    if (!encoding) continue
    encoding.maxBitrate = MODES[currentMode].bitrate
    encoding.maxFramerate = MODES[currentMode].fps
    encoding.codec = pickCodec(params.codecs, hardware)
    try {
      await sender.setParameters(params)
    } catch {
      delete encoding.codec
      await sender.setParameters(params).catch(() => undefined)
    }
  }
}
