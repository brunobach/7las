import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { InformationCircleIcon } from "@hugeicons/core-free-icons"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ACCEPT_SHORTCUT } from "@/lib/desktop"
import { hasRealName } from "@/types"
import type { AppSettings } from "@/types"

export function SettingsScreen({ settings, onSave }: { settings: AppSettings; onSave: (settings: AppSettings) => Promise<void> }) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const patch = (value: Partial<AppSettings>) => setDraft((current) => ({ ...current, ...value }))

  const save = async () => {
    setError("")
    if (!draft.displayName.trim() || !draft.roomName.trim()) {
      setError("Preencha seu nome e o nome da sala.")
      return
    }
    if (!hasRealName(draft.displayName)) {
      setError("Escolha um nome que seus amigos reconheçam.")
      return
    }
    if (!/^(Ctrl|Alt|Shift)(\+(Ctrl|Alt|Shift))*\+[A-Z0-9]$/.test(draft.globalShortcut)) {
      setError("Use um atalho como Ctrl+Shift+S, com uma letra ou número ao final.")
      return
    }
    if (draft.globalShortcut === ACCEPT_SHORTCUT) {
      setError(`${ACCEPT_SHORTCUT} já é usado para aceitar pedidos de entrada. Escolha outro atalho.`)
      return
    }
    setSaving(true)
    try {
      await onSave({ ...draft, displayName: draft.displayName.trim(), roomName: draft.roomName.trim() })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5 p-7 pb-10">
      <section className="app-enter">
        <h1 className="font-heading text-2xl font-medium tracking-[-0.04em]">Configurações do aplicativo</h1>
        <p className="mt-2 text-sm text-muted-foreground">Capture, atalhos e rede ficam salvos neste computador.</p>
      </section>
      <Tabs defaultValue="general" className="gap-5">
        <TabsList className="h-11 p-1">
          <TabsTrigger value="general" className="px-4">Geral</TabsTrigger>
          <TabsTrigger value="media" className="px-4">Áudio e vídeo</TabsTrigger>
          <TabsTrigger value="network" className="px-4">Rede e relay</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <Card className="border-border/60 ring-0">
            <CardHeader><CardTitle>Identidade e Windows</CardTitle><CardDescription>Seu perfil acompanha os convites; a chave privada nunca sai do armazenamento protegido.</CardDescription></CardHeader>
            <CardContent>
              <FieldSet>
                <FieldGroup>
                  <div className="grid grid-cols-2 gap-4">
                    <Field><FieldLabel htmlFor="display-name">Seu nome</FieldLabel><Input id="display-name" maxLength={40} value={draft.displayName} onChange={(event) => patch({ displayName: event.target.value })} /></Field>
                    <Field><FieldLabel htmlFor="room-name">Nome da sala</FieldLabel><Input id="room-name" maxLength={40} value={draft.roomName} onChange={(event) => patch({ roomName: event.target.value })} /></Field>
                  </div>
                  <Field><FieldLabel htmlFor="shortcut">Atalho para compartilhar</FieldLabel><Input id="shortcut" className="font-mono" value={draft.globalShortcut} onChange={(event) => patch({ globalShortcut: event.target.value })} /><FieldDescription>O atalho abre o seletor do Windows; nenhuma tela é capturada sem sua ação.</FieldDescription></Field>
                  <Field orientation="horizontal"><FieldContent><FieldLabel htmlFor="close-tray">Fechar para a bandeja</FieldLabel><FieldDescription>Mantém a transmissão ativa quando a janela for fechada.</FieldDescription></FieldContent><Switch id="close-tray" checked={draft.closeToTray} onCheckedChange={(checked) => patch({ closeToTray: checked })} /></Field>
                  <Field orientation="horizontal"><FieldContent><FieldLabel htmlFor="autostart">Abrir no login do Windows</FieldLabel><FieldDescription>O aplicativo inicia ao entrar na sua conta.</FieldDescription></FieldContent><Switch id="autostart" checked={draft.startWithWindows} onCheckedChange={(checked) => patch({ startWithWindows: checked })} /></Field>
                </FieldGroup>
              </FieldSet>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="media">
          <Card className="border-border/60 ring-0">
            <CardHeader><CardTitle>Captura de mídia</CardTitle><CardDescription>Text prioriza detalhes; Motion prioriza movimento. Os limites são aplicados a cada saída WebRTC.</CardDescription></CardHeader>
            <CardContent>
              <FieldGroup>
                <Field><FieldLabel>Modo de qualidade</FieldLabel><ToggleGroup variant="outline" value={[draft.mode]} onValueChange={(value) => value[0] && patch({ mode: value[0] as AppSettings["mode"] })}><ToggleGroupItem value="sharp">Text · 30 fps</ToggleGroupItem><ToggleGroupItem value="smooth">Motion · 60 fps</ToggleGroupItem></ToggleGroup><FieldDescription>Até {draft.mode === "sharp" ? "6" : "8"} Mbps por saída, sujeito à rede.</FieldDescription></Field>
                <Field orientation="horizontal"><FieldContent><FieldLabel htmlFor="share-audio">Compartilhar o som junto</FieldLabel><FieldDescription>Leva o som do computador (jogo, vídeo, música) junto com a tela. O microfone nunca é enviado.</FieldDescription></FieldContent><Switch id="share-audio" checked={draft.audioMode !== "none"} onCheckedChange={(checked) => patch({ audioMode: checked ? "system" : "none" })} /></Field>
                <Alert><HugeiconsIcon icon={InformationCircleIcon} /><AlertTitle>Como o som funciona</AlertTitle><AlertDescription>O Windows só envia som quando você escolhe uma <strong>tela inteira</strong> no seletor e deixa marcado “Compartilhar áudio do sistema”. Janelas sozinhas vão sem som.</AlertDescription></Alert>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="network">
          <Card className="border-border/60 ring-0">
            <CardHeader><CardTitle>Conexões e retransmissão</CardTitle><CardDescription>STUN é usado por padrão. TURN ajuda em redes restritivas e exige um servidor configurado por você.</CardDescription></CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="grid grid-cols-2 gap-4">
                  <Field><FieldLabel htmlFor="turn-url">Endereço TURN</FieldLabel><Input id="turn-url" value={draft.turnUrl} onChange={(event) => patch({ turnUrl: event.target.value })} placeholder="turns:turn.seudominio.com:5349" /></Field>
                  <Field><FieldLabel htmlFor="turn-user">Usuário TURN</FieldLabel><Input id="turn-user" autoComplete="off" value={draft.turnUsername} onChange={(event) => patch({ turnUsername: event.target.value })} /></Field>
                </div>
                <Field orientation="horizontal"><FieldContent><FieldLabel htmlFor="relay">Permitir retransmissão</FieldLabel><FieldDescription>Seu computador pode encaminhar a mídia recebida, usando upload e processamento.</FieldDescription></FieldContent><Switch id="relay" checked={draft.relayEnabled} onCheckedChange={(checked) => patch({ relayEnabled: checked })} /></Field>
                <Field><FieldLabel htmlFor="relay-slots">Saídas quando for relay</FieldLabel><Select value={String(draft.relaySlots)} onValueChange={(value) => patch({ relaySlots: Number(value) })} disabled={!draft.relayEnabled}><SelectTrigger id="relay-slots" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="1">1 espectador</SelectItem></SelectGroup></SelectContent></Select><FieldDescription>O host decide os filhos. Um relay nunca escolhe destinatários por conta própria.</FieldDescription></Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {error && <Alert variant="destructive"><AlertTitle>Não foi possível salvar</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex justify-end"><Button size="lg" disabled={saving} onClick={() => void save()}>{saving && <Spinner data-icon="inline-start" />}Salvar configurações</Button></div>
    </div>
  )
}
