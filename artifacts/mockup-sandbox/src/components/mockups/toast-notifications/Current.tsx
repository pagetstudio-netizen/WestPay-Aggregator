import * as React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import "./_group.css";

const ANIM = `
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.91) translateY(10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes modalBackdropIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`;

function useModalEnvironment(
  open: boolean,
  initialFocusRef: React.RefObject<HTMLButtonElement | null>,
) {
  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => initialFocusRef.current?.focus(), 30);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open, initialFocusRef]);
}

function stopEvent(event: React.SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function CurrentModalToast({
  open,
  variant = "default",
  title,
  description,
  onDismiss,
}: {
  open: boolean;
  variant?: "default" | "destructive" | "success";
  title?: React.ReactNode;
  description?: React.ReactNode;
  onDismiss: () => void;
}) {
  const btnRef = React.useRef<HTMLButtonElement>(null);
  useModalEnvironment(open, btnRef);

  React.useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onDismiss]);

  if (!open || typeof document === "undefined") return null;

  const isSuccess = variant === "success";
  const isError = variant === "destructive";
  const Icon = isSuccess ? CheckCircle2 : isError ? XCircle : Info;
  const iconColor = isSuccess ? "text-green-500" : isError ? "text-red-500" : "text-blue-500";
  const iconBg = isSuccess ? "bg-green-50" : isError ? "bg-red-50" : "bg-blue-50";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : "Notifications"}
      className="fixed inset-0 z-[2147483646] flex items-center justify-center p-4"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <style>{ANIM}</style>
      <div
        className="absolute inset-0 bg-black/40"
        style={{
          backdropFilter: "blur(2px)",
          animation: "modalBackdropIn 0.15s ease-out",
        }}
        onClick={(event) => {
          stopEvent(event);
          onDismiss();
        }}
        onPointerDown={stopEvent}
      />
      <div
        className="relative w-full max-w-[320px] rounded-[28px] bg-white px-8 py-9 text-center shadow-2xl"
        style={{ animation: "modalIn 0.18s ease-out" }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div
          className={`mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-[20px] ${iconBg}`}
        >
          <Icon className={`h-9 w-9 ${iconColor}`} strokeWidth={2.2} />
        </div>
        {title && (
          <h3 className="mb-1.5 text-[19px] font-bold leading-snug text-gray-900">{title}</h3>
        )}
        {description && (
          <p className="mb-7 text-[13.5px] leading-relaxed text-gray-500">{description}</p>
        )}
        {!description && title && <div className="mb-7" />}
        <button
          type="button"
          ref={btnRef}
          onClick={(event) => {
            stopEvent(event);
            onDismiss();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          className="w-full rounded-full bg-blue-600 py-[14px] text-[15px] font-semibold text-white transition-all duration-150 hover:bg-blue-700 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
        >
          Confirmer
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function Current() {
  return (
    <main className="min-h-screen bg-[#293349]">
      <CurrentModalToast
        open
        title="Notification"
        description="Veuillez saisir vos informations de connexion lorsque vous y êtes invité."
        onDismiss={() => undefined}
      />
    </main>
  );
}
