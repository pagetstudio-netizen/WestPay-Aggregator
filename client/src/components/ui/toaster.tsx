import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { AlertCircle, CheckCircle2, Info } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const icon =
          variant === "destructive" ? (
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          ) : variant === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
          ) : (
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          )

        return (
          <Toast key={id} variant={variant} {...props}>
            {icon}
            <div className="grid gap-0.5 flex-1 min-w-0">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
