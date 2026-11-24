import { useMemo } from "react"
import { cn } from "cn"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { avatarPaths } from "@/lib/avatar"

const SIZES = {
  sm: "size-8",
  default: "size-10",
  lg: "size-12",
  xl: "size-16",
}

export function UserAvatar({ seed, name, size = "default", className }: {
  seed: number
  name: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const paths = useMemo(() => avatarPaths(seed), [seed])
  return (
    <Avatar className={cn("rounded-lg", SIZES[size], className)}>
      <AvatarFallback className="overflow-hidden rounded-lg bg-transparent p-0">
        <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className="size-full" role="img" aria-label={`Avatar de ${name}`}>
          {paths.map(([color, path]) => <path key={color} fill={color} d={path} />)}
        </svg>
      </AvatarFallback>
    </Avatar>
  )
}
