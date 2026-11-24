import { HugeiconsIcon } from "@hugeicons/react"
import { VolumeHighIcon, VolumeOffIcon } from "@hugeicons/core-free-icons"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** Liga/desliga o som do computador junto com a tela, ao lado do botão de compartilhar. */
export function AudioToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Toggle variant="outline" pressed={enabled} onPressedChange={onChange} aria-label="Compartilhar o som junto" />}>
        <HugeiconsIcon icon={enabled ? VolumeHighIcon : VolumeOffIcon} data-icon="inline-start" />
        {enabled ? "Com som" : "Sem som"}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {enabled ? "O som do computador vai junto. Escolha uma tela inteira e marque “Compartilhar áudio do sistema”." : "Só a imagem será compartilhada."}
      </TooltipContent>
    </Tooltip>
  )
}
