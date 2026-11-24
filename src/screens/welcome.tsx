import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { RefreshIcon } from "@hugeicons/core-free-icons"
import { Logo } from "@/components/logo"
import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { randomAvatarSeed } from "@/lib/avatar"
import { hasRealName } from "@/types"
import type { AppSettings } from "@/types"

export function WelcomeScreen({ settings, onSave }: { settings: AppSettings; onSave: (name: string, avatarSeed: number) => Promise<void> }) {
  const [name, setName] = useState("")
  const [avatarSeed, setAvatarSeed] = useState(settings.avatarSeed)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const submit = async () => {
    const trimmed = name.trim()
    if (!hasRealName(trimmed)) {
      setError(trimmed ? "Escolha um nome que seus amigos reconheçam." : "Digite seu nome para continuar.")
      return
    }
    setSaving(true)
    setError("")
    try {
      await onSave(trimmed, avatarSeed)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setSaving(false)
    }
  }

  return (
    <div className="flex h-svh items-center justify-center bg-background p-7">
      <form className="app-enter flex w-full max-w-sm flex-col gap-8" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <Logo />
        <div className="flex flex-col items-center gap-4 text-center">
          <UserAvatar seed={avatarSeed} name={name || "você"} size="xl" />
          <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarSeed(randomAvatarSeed())}>
            <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />Sortear outro avatar
          </Button>
        </div>
        <div>
          <h1 className="text-xl font-medium tracking-[-0.025em]">Como seus amigos te chamam?</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Seu nome e sua criatura aparecem nas salas e nos pedidos para entrar. Você pode mudar os dois depois.</p>
        </div>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="welcome-name">Seu nome</FieldLabel>
            <Input
              id="welcome-name"
              autoFocus
              autoComplete="nickname"
              maxLength={40}
              placeholder="Ex.: Ana"
              value={name}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "welcome-error" : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {error && <p id="welcome-error" className="text-sm text-destructive">{error}</p>}
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={saving}>{saving && <Spinner data-icon="inline-start" />}Entrar no 7las</Button>
      </form>
    </div>
  )
}
