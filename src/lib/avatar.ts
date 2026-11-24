export const AVATAR_SIZE = 16

const BACKGROUND = "#141518"
const INK = "#101114"
const EYES = "#f4f4f2"
const PALETTES = [
  ["#ffd166", "#ef8354", "#9c4f3f"],
  ["#8ecae6", "#219ebc", "#235066"],
  ["#b7e4c7", "#52b788", "#2d6a4f"],
  ["#ffc8dd", "#ff8fa3", "#a44a5f"],
  ["#e9edc9", "#a3b18a", "#596647"],
  ["#f4f1de", "#e07a5f", "#813f36"],
] as const

export function isAvatarSeed(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff
}

export function randomAvatarSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] || 1
}

export function avatarSeedFromString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) || 1
}

export function validAvatarSeed(value: unknown, fallback: string): number {
  return isAvatarSeed(value) && value !== 0 ? value : avatarSeedFromString(fallback)
}

function generator(seed: number) {
  let state = seed >>> 0 || 0x9e3779b9
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}

export function avatarPaths(seed: number): [color: string, path: string][] {
  const random = generator(seed)
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]
  const palette = pick(PALETTES)
  const body = Array.from({ length: 12 }, () => Array<boolean>(12).fill(false))
  const shape = pick(["round", "tall", "wide"] as const)
  const base = shape === "wide" ? 5 : shape === "tall" ? 3 : 4

  for (let y = 0; y < 12; y++) {
    const edge = Math.min(y, 11 - y)
    const taper = edge === 0 ? 2 : edge === 1 ? 1 : 0
    const half = Math.max(2, Math.min(6, base - taper + (random() > 0.78 ? 1 : 0)))
    for (let x = 6 - half; x < 6 + half; x++) body[y][x] = true
  }

  const ears = pick(["none", "pointed", "antenna"] as const)
  if (ears === "pointed") {
    body[1][2] = body[1][9] = true
    body[0][2] = body[0][9] = true
  } else if (ears === "antenna") {
    body[1][4] = body[1][7] = true
    body[0][4] = body[0][7] = true
  }

  const pixels = Array<string>(AVATAR_SIZE * AVATAR_SIZE).fill(BACKGROUND)
  const at = (x: number, y: number) => (y + 2) * AVATAR_SIZE + x + 2
  const filled = (x: number, y: number) => body[y]?.[x] ?? false
  const set = (x: number, y: number, color: string) => {
    if (x >= -1 && x <= 12 && y >= -1 && y <= 12) pixels[at(x, y)] = color
  }

  for (let y = -1; y <= 12; y++) {
    for (let x = -1; x <= 12; x++) {
      if (!filled(x, y) && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) set(x, y, INK)
    }
  }
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      if (!filled(x, y)) continue
      const shade = Math.min(2, Math.floor(y / 4))
      const dithered = shade < 2 && (x + y) % 3 === 0
      set(x, y, palette[dithered ? shade + 1 : shade])
    }
  }

  const eyeY = pick([4, 5])
  const cyclops = random() < 0.2
  const closed = !cyclops && random() < 0.15
  const lookX = random() > 0.5 ? 1 : 0
  const lookY = random() > 0.5 ? 1 : 0
  const eyes = cyclops ? [5] : [3, 8]
  for (const eyeX of eyes) {
    if (closed) {
      set(eyeX, eyeY + 1, INK)
      set(eyeX + 1, eyeY + 1, INK)
      continue
    }
    for (let y = eyeY; y < eyeY + 2; y++) {
      for (let x = eyeX; x < eyeX + 2; x++) set(x, y, EYES)
    }
    set(eyeX + lookX, eyeY + lookY, INK)
  }
  if (random() < 0.55) {
    set(5, eyeY + 4, INK)
    set(6, eyeY + 4, INK)
  }

  const paths = new Map<string, string>()
  pixels.forEach((color, index) => {
    const x = index % AVATAR_SIZE
    const y = Math.floor(index / AVATAR_SIZE)
    paths.set(color, `${paths.get(color) ?? ""}M${x} ${y}h1v1h-1z`)
  })
  return Array.from(paths, ([color, path]) => [color, path])
}
