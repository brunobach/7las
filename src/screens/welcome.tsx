import { useState } from "react"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { hasRealName } from "@/types"

/** Primeiro acesso: pede o nome que os amigos vão ver na sala e nos pedidos para entrar. */
export function WelcomeScreen({ onSave }: { onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState("")
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
      await onSave(trimmed)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setSaving(false)
    }
  }

  return (
    <div className="flex h-svh items-center justify-center bg-background p-7">
      <form
        className="app-enter flex w-full max-w-sm flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Logo />
        <div>
          <h1 className="font-heading text-2xl font-medium tracking-[-0.04em]">Como seus amigos te chamam?</h1>
          <p className="mt-2 text-sm text-muted-foreground">Esse nome aparece para quem estiver na sala e quando você pedir para entrar. Dá para mudar depois nas configurações.</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="welcome-name" className="text-sm font-medium">Seu nome</label>
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
        </div>
        <Button type="submit" disabled={saving}>{saving && <Spinner data-icon="inline-start" />}Continuar</Button>
      </form>
    </div>
  )
}
