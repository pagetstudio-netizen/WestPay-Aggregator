import * as React from "react"
import { CheckCircle2, XCircle, Info, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Animations ───────────────────────────────────────────────────────────────
const ANIM = `
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.91) translateY(10px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);    }
}
`

// ─── Modal Toast ──────────────────────────────────────────────────────────────
// Remplace les petits bandeaux de coin — affiche un modal centré.

interface ModalToastProps {
  open: boolean
  variant?: "default" | "destructive" | "success"
  title?: React.ReactNode
  description?: React.ReactNode
  onDismiss: () => void
}

export function ModalToast({ open, variant = "default", title, description, onDismiss }: ModalToastProps) {
  const btnRef = React.useRef<HTMLButtonElement>(null)

  // Focus sur le bouton dès l'ouverture
  React.useEffect(() => {
    if (open) { setTimeout(() => btnRef.current?.focus(), 50) }
  }, [open])

  // Fermeture sur Échap
  React.useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss() }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [open, onDismiss])

  if (!open) return null

  const isSuccess = variant === "success"
  const isError = variant === "destructive"

  const Icon = isSuccess ? CheckCircle2 : isError ? XCircle : Info
  const iconColor = isSuccess ? "text-green-500" : isError ? "text-red-500" : "text-blue-500"
  const iconBg = isSuccess ? "bg-green-50" : isError ? "bg-red-50" : "bg-blue-50"
  const btnLabel = isSuccess ? "Super !" : isError ? "OK" : "Compris !"

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : "Notification"}
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
    >
      <style>{ANIM}</style>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        style={{ backdropFilter: "blur(2px)" }}
        onClick={onDismiss}
      />
      {/* Card */}
      <div
        className="relative bg-white rounded-[28px] px-8 py-9 w-full max-w-[320px] text-center shadow-2xl"
        style={{ animation: "modalIn 0.18s ease-out" }}
      >
        {/* Icône */}
        <div className={cn("mx-auto mb-5 w-[72px] h-[72px] rounded-[20px] flex items-center justify-center", iconBg)}>
          <Icon className={cn("w-9 h-9", iconColor)} strokeWidth={2.2} />
        </div>
        {/* Titre */}
        {title && <h3 className="text-[19px] font-bold text-gray-900 mb-1.5 leading-snug">{title}</h3>}
        {/* Description */}
        {description && (
          <p className="text-[13.5px] text-gray-500 mb-7 leading-relaxed">{description}</p>
        )}
        {!description && title && <div className="mb-7" />}
        {/* Bouton */}
        <button
          ref={btnRef}
          onClick={onDismiss}
          className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.97] text-white rounded-full py-[14px] font-semibold text-[15px] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
        >
          {btnLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
// Remplace window.confirm() — usage : `if (await showConfirm("...")) { ... }`
// Thread-safe : si une confirmation est déjà ouverte, elle est annulée avant d'en ouvrir une nouvelle.

interface ConfirmState {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
}

const _confirmListeners: Array<(s: ConfirmState) => void> = []
let _confirmState: ConfirmState = { open: false, title: "" }
let _confirmResolver: ((v: boolean) => void) | null = null

function _setConfirmState(next: ConfirmState) {
  _confirmState = next
  _confirmListeners.forEach((l) => l({ ...next }))
}

/** Remplace window.confirm() — retourne Promise<boolean>. Thread-safe. */
export async function showConfirm(
  title: string,
  options?: {
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: "default" | "destructive"
  }
): Promise<boolean> {
  // Annule la confirmation précédente si elle est encore en attente
  if (_confirmResolver) {
    _confirmResolver(false)
    _confirmResolver = null
  }

  return new Promise((resolve) => {
    _confirmResolver = resolve
    _setConfirmState({ open: true, title, ...options })
  })
}

export function ConfirmModal() {
  const [state, setState] = React.useState<ConfirmState>(_confirmState)
  const confirmBtnRef = React.useRef<HTMLButtonElement>(null)
  const cancelBtnRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    _confirmListeners.push(setState)
    return () => {
      const i = _confirmListeners.indexOf(setState)
      if (i > -1) _confirmListeners.splice(i, 1)
    }
  }, [])

  // Focus initial sur bouton annuler (plus sûr pour les actions destructives)
  React.useEffect(() => {
    if (state.open) { setTimeout(() => cancelBtnRef.current?.focus(), 50) }
  }, [state.open])

  // Fermeture sur Échap = annulation
  React.useEffect(() => {
    if (!state.open) return
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") handle(false) }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [state.open])

  const handle = (result: boolean) => {
    _setConfirmState({ ..._confirmState, open: false })
    _confirmResolver?.(result)
    _confirmResolver = null
  }

  if (!state.open) return null

  const isDestructive = state.variant === "destructive"

  return (
    // z-index 9999 > ModalToast (9998) pour toujours s'afficher au-dessus
    <div
      role="dialog"
      aria-modal="true"
      aria-label={state.title}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
    >
      <style>{ANIM}</style>
      <div
        className="absolute inset-0 bg-black/40"
        style={{ backdropFilter: "blur(2px)" }}
        onClick={() => handle(false)}
      />
      <div
        className="relative bg-white rounded-[28px] px-8 py-9 w-full max-w-[320px] text-center shadow-2xl"
        style={{ animation: "modalIn 0.18s ease-out" }}
      >
        {/* Icône */}
        <div className={cn(
          "mx-auto mb-5 w-[72px] h-[72px] rounded-[20px] flex items-center justify-center",
          isDestructive ? "bg-red-50" : "bg-amber-50"
        )}>
          <AlertTriangle
            className={cn("w-9 h-9", isDestructive ? "text-red-500" : "text-amber-500")}
            strokeWidth={2.2}
          />
        </div>
        <h3 className="text-[19px] font-bold text-gray-900 mb-1.5 leading-snug">{state.title}</h3>
        {state.message && (
          <p className="text-[13.5px] text-gray-500 mb-7 leading-relaxed">{state.message}</p>
        )}
        {!state.message && <div className="mb-7" />}
        <div className="flex flex-col gap-3">
          <button
            ref={confirmBtnRef}
            onClick={() => handle(true)}
            className={cn(
              "w-full text-white rounded-full py-[14px] font-semibold text-[15px] transition-all duration-150 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2",
              isDestructive
                ? "bg-red-600 hover:bg-red-700 focus:ring-red-400"
                : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-400"
            )}
          >
            {state.confirmLabel ?? "Confirmer"}
          </button>
          <button
            ref={cancelBtnRef}
            onClick={() => handle(false)}
            className="w-full bg-gray-100 hover:bg-gray-200 active:scale-[0.97] text-gray-700 rounded-full py-[14px] font-semibold text-[15px] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            {state.cancelLabel ?? "Annuler"}
          </button>
        </div>
      </div>
    </div>
  )
}
