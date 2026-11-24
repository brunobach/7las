import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/sora"
import "@fontsource-variable/figtree"
import "@fontsource/martian-mono/400.css"
import "./index.css"
import App from "./App"
import { ToastWindow } from "@/screens/toast-window"
import { TooltipProvider } from "@/components/ui/tooltip"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      {window.location.hash === "#toast" ? <ToastWindow /> : <App />}
    </TooltipProvider>
  </StrictMode>,
)
