import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Tick02Icon, UserAdd01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getPublicKey } from "@/lib/desktop"
import { findShortCode, formatCodeInput, formatShortCode } from "@/lib/lobby"
import { FriendCodeHost, pairWithCode } from "@/lib/pairing"
import type { AppSettings, Friend } from "@/types"

type Tab = "enter" | "show"

export function FriendsDialog({ settings, onAdd }: { settings: AppSettings; onAdd: (friend: Friend) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>("enter")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}><HugeiconsIcon icon={UserAdd01Icon} data-icon="inline-start" />Adicionar amigo</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar amigo</DialogTitle>
          <DialogDescription>Um de vocês mostra o código, o outro digita. Os dois ficam adicionados.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="enter">Tenho um código</TabsTrigger>
            <TabsTrigger value="show">Mostrar meu código</TabsTrigger>
          </TabsList>
          <TabsContent value="enter" className="pt-5">
            <EnterCode settings={settings} onAdd={async (friend) => {
              await onAdd(friend)
              setOpen(false)
            }} />
          </TabsContent>
          <TabsContent value="show" className="pt-5">
            {open && tab === "show" && <ShowCode settings={settings} onAdd={onAdd} />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function EnterCode({ settings, onAdd }: { settings: AppSettings; onAdd: (friend: Friend) => Promise<void> }) {
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const submit = async () => {
    const code = findShortCode(value)
    if (!code) {
      setError("O código tem 8 letras e números, como KX7P-42QM.")
      return
    }
    const controller = new AbortController()
    abort.current = controller
    setBusy(true)
    setError("")
    try {
      await onAdd(await pairWithCode(code, settings, await getPublicKey(), controller.signal))
      setValue("")
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível adicionar.")
    } finally {
      abort.current = null
      setBusy(false)
    }
  }

  if (busy) {
    return (
      <div className="flex flex-col items-center gap-3 py-3 text-center" role="status">
        <Spinner className="size-6" />
        <p className="text-sm font-medium">Procurando seu amigo…</p>
        <Button variant="outline" onClick={() => abort.current?.abort()}>Cancelar</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="friend-code" className="text-sm font-medium">Código do seu amigo</label>
      <Input
        id="friend-code"
        value={value}
        onChange={(event) => setValue(formatCodeInput(event.target.value))}
        onKeyDown={(event) => event.key === "Enter" && value.trim() && void submit()}
        placeholder="KX7P-42QM"
        autoComplete="off"
        spellCheck={false}
        className="h-12 text-center font-mono text-lg tracking-[0.15em] uppercase placeholder:tracking-[0.15em]"
        aria-invalid={!!error}
        aria-describedby={error ? "friend-code-error" : undefined}
      />
      {error && <p id="friend-code-error" className="text-sm text-destructive">{error}</p>}
      <Button disabled={!value.trim()} onClick={() => void submit()}><HugeiconsIcon icon={UserAdd01Icon} data-icon="inline-start" />Adicionar</Button>
    </div>
  )
}

function ShowCode({ settings, onAdd }: { settings: AppSettings; onAdd: (friend: Friend) => Promise<void> }) {
  const [code, setCode] = useState<string | null>(null)
  const [added, setAdded] = useState<string[]>([])
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const onAddRef = useRef(onAdd)
  useEffect(() => {
    onAddRef.current = onAdd
  }, [onAdd])

  // O código existe enquanto esta aba estiver aberta.
  useEffect(() => {
    let host: FriendCodeHost | null = null
    let cancelled = false
    void getPublicKey()
      .then((publicKey) => FriendCodeHost.open(settings, publicKey, (friend) => {
        setAdded((names) => [...names, friend.displayName])
        void onAddRef.current(friend)
      }, () => setError("O código expirou. Feche e abra de novo para gerar outro.")))
      .then((opened) => {
        if (cancelled) void opened.close()
        else {
          host = opened
          setCode(opened.code)
        }
      })
      .catch(() => setError("Não foi possível gerar o código. Confira sua conexão."))
    return () => {
      cancelled = true
      void host?.close()
    }
  }, [settings])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!code) return <div className="flex justify-center py-6"><Spinner className="size-6" /></div>

  const pretty = formatShortCode(code)
  const copy = () => void navigator.clipboard.writeText(`Me adiciona no 7las! Em “Adicionar amigo” → “Tenho um código”, digite ${pretty}`).then(() => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  })

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center font-mono text-3xl font-medium tracking-[0.12em] select-all" aria-label={`Código ${code.split("").join(" ")}`}>{pretty}</p>
      <Button onClick={copy}><HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} data-icon="inline-start" />{copied ? "Copiado" : "Copiar código"}</Button>
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Spinner className="size-4" />Deixe esta janela aberta até seu amigo digitar. Vale por 15 minutos.
      </p>
      {added.length > 0 && <p className="text-center text-sm font-medium" aria-live="polite">{added.join(", ")} {added.length === 1 ? "foi adicionado" : "foram adicionados"}.</p>}
    </div>
  )
}
