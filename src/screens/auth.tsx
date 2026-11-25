import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon, ScreenShareIcon, SecurityCheckIcon, UserGroupIcon } from "@hugeicons/core-free-icons"
import { Logo } from "@/components/logo"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { authConfigured, signIn, signUp, type Account } from "@/lib/auth"
import { avatarSeedFromString } from "@/lib/avatar"

export function AuthScreen({ onSuccess }: { onSuccess: (account: Account, warning?: string) => Promise<void> }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const submit = async () => {
    if (busy) return
    setError("")
    if (mode === "signup" && !/^[a-z0-9_]{3,20}$/.test(username)) {
      setError("O nick precisa ter de 3 a 20 letras, números ou _.")
      return
    }
    setBusy(true)
    try {
      const account = mode === "signin" ? await signIn(email.trim(), password) : await signUp(email.trim(), password, name.trim())
      let warning: string | undefined
      if (mode === "signup") {
        try {
          await api.saveProfile({ username, displayName: name.trim(), avatarSeed: avatarSeedFromString(account.id) })
        } catch {
          warning = "Sua conta foi criada. Revise seu nome e nick no perfil."
        }
      }
      await onSuccess(account, warning)
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : String(reason)
      if (/invalid.*(email|password)|credential/i.test(text)) setError("Email ou senha incorretos.")
      else if (/already|exist/i.test(text)) setError("Já existe uma conta com esse email ou nick.")
      else setError(text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="quiet-scrollbar grid min-h-svh overflow-y-auto bg-background lg:grid-cols-[minmax(0,1fr)_520px]">
      <section className="relative hidden min-h-svh flex-col justify-between overflow-hidden border-r border-border p-12 lg:flex xl:p-16">
        <Logo />
        <div className="relative z-10 max-w-xl">
          <Badge variant="secondary" className="mb-6 gap-2"><span className="size-1.5 rounded-full bg-success" />Suas salas, sempre no lugar</Badge>
          <h1 className="text-balance font-heading text-5xl font-medium leading-[1.08] tracking-[-0.055em] xl:text-6xl">Entre. Compartilhe. Pronto.</h1>
          <p className="mt-6 max-w-md text-lg leading-8 text-muted-foreground">Uma conta para encontrar seus amigos e abrir suas salas sem códigos temporários ou configuração complicada.</p>
          <div className="mt-10 grid max-w-md grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card/70 p-4"><HugeiconsIcon icon={UserGroupIcon} className="size-5 text-muted-foreground" /><p className="mt-4 text-sm font-medium">Várias telas ao mesmo tempo</p></div>
            <div className="rounded-xl border border-border bg-card/70 p-4"><HugeiconsIcon icon={SecurityCheckIcon} className="size-5 text-muted-foreground" /><p className="mt-4 text-sm font-medium">Acesso só para quem participa</p></div>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-28 -bottom-24 size-[440px] rounded-full border border-brand/10 bg-brand/[0.025]" aria-hidden />
        <p className="relative text-sm text-muted-foreground">Compartilhamento de tela para jogar e criar junto.</p>
      </section>

      <section className="flex min-h-svh items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-[400px]">
          <Logo className="mb-10 lg:hidden" />
          <div className="mb-7">
            <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-secondary"><HugeiconsIcon icon={ScreenShareIcon} className="size-5" /></span>
            <h2 className="font-heading text-3xl font-medium tracking-[-0.045em]">{mode === "signin" ? "Que bom ver você" : "Crie seu espaço"}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{mode === "signin" ? "Entre para abrir suas salas e ver quem está ao vivo." : "Seu nick é único e serve para seus amigos encontrarem você."}</p>
          </div>

          {!authConfigured && <Alert variant="destructive" className="mb-5"><AlertTitle>Configuração pendente</AlertTitle><AlertDescription>Defina o endereço público do Neon Auth para habilitar o login.</AlertDescription></Alert>}

          <Tabs value={mode} onValueChange={(value) => { setMode(value as typeof mode); setError("") }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
          </Tabs>

          <Card className="mt-4 border-border/70 bg-card/60 ring-0">
            <CardHeader className="sr-only"><CardTitle>{mode === "signin" ? "Entrar na conta" : "Criar conta"}</CardTitle><CardDescription>Use seu email e senha.</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
                <FieldGroup>
                  {mode === "signup" && (
                    <>
                      <Field data-invalid={Boolean(error) && !name.trim()}><FieldLabel htmlFor="auth-name">Seu nome</FieldLabel><Input id="auth-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} autoComplete="name" placeholder="Como seus amigos conhecem você" required /></Field>
                      <Field><FieldLabel htmlFor="auth-username">Nick único</FieldLabel><Input id="auth-username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} minLength={3} maxLength={20} autoComplete="username" placeholder="seu_nick" required /><FieldDescription>É assim que seus amigos vão encontrar você.</FieldDescription></Field>
                    </>
                  )}
                  <Field><FieldLabel htmlFor="auth-email">Email</FieldLabel><Input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="voce@email.com" required /></Field>
                  <Field data-invalid={Boolean(error)}><FieldLabel htmlFor="auth-password">Senha</FieldLabel><Input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="Pelo menos 8 caracteres" required aria-invalid={Boolean(error)} /><FieldError>{error}</FieldError></Field>
                  <Button type="submit" size="lg" className="mt-2 w-full" disabled={busy || !authConfigured}>
                    {busy ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-start" />}
                    {busy ? "Só um instante…" : mode === "signin" ? "Entrar no 7las" : "Criar minha conta"}
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
          <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">Sua sessão fica salva neste computador. O 7las não recebe sua senha.</p>
        </div>
      </section>
    </main>
  )
}
