import * as React from "react"
import { CheckCircle2, CircleHelp, XCircle } from "lucide-react"
import { ConfirmModal } from "@/components/ui/modal-toast"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

const DEFAULT_TOAST_DURATION_MS = 3200
const MAX_TOAST_VISIBLE_MS = 4000
const DISMISS_BUFFER_MS = 300
const MAX_TOAST_DURATION_MS = MAX_TOAST_VISIBLE_MS - DISMISS_BUFFER_MS

type ToastItem = ReturnType<typeof useToast>["toasts"][number]

function resolveToastDuration(duration?: number) {
  if (typeof duration !== "number" || Number.isNaN(duration)) {
    return DEFAULT_TOAST_DURATION_MS
  }

  return Math.min(Math.max(duration, 0), MAX_TOAST_DURATION_MS)
}

function ToastCard({
  toast,
  dismiss,
}: {
  toast: ToastItem
  dismiss: (toastId?: string) => void
}) {
  React.useEffect(() => {
    if (!toast.open) return

    // Radix pauses its own timer while focused or hovered. Leave time for the
    // exit animation and delayed removal so the card is gone within four seconds.
    const timeout = window.setTimeout(
      () => dismiss(toast.id),
      MAX_TOAST_DURATION_MS,
    )

    return () => window.clearTimeout(timeout)
  }, [dismiss, toast.id, toast.open])

  const Icon =
    toast.variant === "success"
      ? CheckCircle2
      : toast.variant === "destructive"
        ? XCircle
        : CircleHelp
  const iconStyle =
    toast.variant === "success"
      ? "bg-[#eef5e9] text-[#67936b]"
      : toast.variant === "destructive"
        ? "bg-[#fff0e9] text-[#ca7664]"
        : "bg-[#fff2b8] text-[#d4af0a]"

  return (
    <Toast
      key={toast.id}
      variant={toast.variant}
      open={toast.open}
      duration={resolveToastDuration(toast.duration)}
      onOpenChange={(open) => {
        if (!open) dismiss(toast.id)
      }}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconStyle}`}
      >
        <Icon className="h-[25px] w-[25px]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        {toast.title && <ToastTitle>{toast.title}</ToastTitle>}
        {toast.description && <ToastDescription>{toast.description}</ToastDescription>}
        {toast.action}
      </div>
    </Toast>
  )
}

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <>
      {/* Les confirmations explicites restent des modales séparées. */}
      <ConfirmModal />

      <ToastProvider duration={DEFAULT_TOAST_DURATION_MS}>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
        <ToastViewport />
      </ToastProvider>
    </>
  )
}
