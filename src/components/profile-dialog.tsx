import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { RefreshIcon } from "@hugeicons/core-free-icons"
import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { randomAvatarSeed } from "@/lib/avatar"
import { hasRealName } from "@/types"
import type { AppSettings, Profile } from "@/types"

export function ProfileDialog({ open, onOpenChange, settings, profile, onSave }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: AppSettings
  profile: Profile
  onSave: (settings: AppSettings, username: string) => Promise<void>
}) {
  const [name, setName] = useState(settings.displayName)
  const [username, setUsername] = useState(profile.username)
  const [avatarSeed, setAvatarSeed] = useState(settings.avatarSeed)
  const [choices, setChoices] = useState<number[]>(() => [settings.avatarSeed, ...Array.from({ length: 7 }, randomAvatarSeed)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const save = async () => {
    if (!hasRealName(name)) {
      setError("Digite um nome que seus amigos reconheçam.")
      return
    }
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      setError("O nick precisa ter de 3 a 20 letras, números ou _.")
      return
    }
    setSaving(true)
    try {
      await onSave({ ...settings, displayName: name.trim(), avatarSeed }, username)
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Seu perfil no 7las</DialogTitle>
          <DialogDescription>Esse nome e essa criatura aparecem para seus amigos e para quem estiver na sala.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); void save() }}>
          <FieldGroup>
            <div className="flex items-center gap-4 rounded-xl border border-border bg-background p-4">
              <UserAvatar seed={avatarSeed} name={name || "você"} size="xl" />
              <div className="min-w-0">
                <p className="truncate font-medium">{name || "Seu nome"}</p>
                <p className="text-sm text-muted-foreground">Seu avatar acompanha você em todas as salas.</p>
              </div>
            </div>
            <Field>
              <FieldLabel htmlFor="profile-name">Seu nome</FieldLabel>
              <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} autoComplete="nickname" aria-invalid={Boolean(error)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-username">Nick único</FieldLabel>
              <Input id="profile-username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} minLength={3} maxLength={20} autoComplete="username" aria-invalid={Boolean(error)} />
            </Field>
            <Field>
              <FieldLabel>Escolha sua criatura</FieldLabel>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
                {choices.map((seed, index) => (
                  <label key={seed} className="cursor-pointer rounded-xl focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
                    <input className="peer sr-only" type="radio" name="avatar" value={seed} checked={avatarSeed === seed} onChange={() => setAvatarSeed(seed)} aria-label={`Avatar ${index + 1}`} />
                    <UserAvatar seed={seed} name={`opção ${index + 1}`} size="lg" className="size-full ring-1 ring-transparent transition-transform peer-checked:ring-foreground peer-hover:-translate-y-0.5" />
                  </label>
                ))}
              </div>
            </Field>
            <Button type="button" variant="ghost" className="self-start" onClick={() => setChoices([avatarSeed, ...Array.from({ length: 7 }, randomAvatarSeed)])}>
              <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />Mais criaturas
            </Button>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar perfil"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
