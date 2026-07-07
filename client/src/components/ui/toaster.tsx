import { useToast } from "@/hooks/use-toast"
import { ModalToast } from "@/components/ui/modal-toast"
import { ConfirmModal } from "@/components/ui/modal-toast"

export function Toaster() {
  const { toasts, dismiss } = useToast()

  // Affiche uniquement le toast le plus récent sous forme de modal centré
  const current = toasts.find((t) => t.open)

  return (
    <>
      {/* Modal de confirmation (showConfirm) */}
      <ConfirmModal />

      {/* Modal de notification (toast) */}
      {current && (
        <ModalToast
          open={true}
          variant={current.variant as "default" | "destructive" | "success" | undefined}
          title={current.title}
          description={current.description}
          onDismiss={() => dismiss(current.id)}
        />
      )}
    </>
  )
}
