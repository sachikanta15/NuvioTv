import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useUi } from "@/store/ui";
import { cn } from "@/lib/cn";

const TONES = {
  info: { icon: Info, className: "border-white/10" },
  success: { icon: CheckCircle2, className: "border-[rgb(var(--nuvio-success)/0.5)]" },
  error: { icon: AlertCircle, className: "border-[rgb(var(--nuvio-error)/0.6)]" },
} as const;

export function Toasts() {
  const toasts = useUi((state) => state.toasts);
  const dismiss = useUi((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className={cn(
        "pointer-events-none fixed left-1/2 z-[200] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4",
        // Sit above the mobile tab bar, centred near the bottom on desktop.
        "bottom-[calc(76px+env(safe-area-inset-bottom,0px))] sm:bottom-6",
      )}
    >
      {toasts.map((toast) => {
        const tone = TONES[toast.tone];
        const Icon = tone.icon;
        return (
          <div
            key={toast.id}
            className={cn(
              "glass-strong pointer-events-auto flex animate-slide-up items-start gap-3 rounded-panel px-4 py-3 shadow-lift",
              tone.className,
            )}
          >
            <Icon
              size={18}
              className={cn(
                "mt-0.5 shrink-0",
                toast.tone === "success" && "text-[rgb(var(--nuvio-success))]",
                toast.tone === "error" && "text-[rgb(var(--nuvio-error))]",
                toast.tone === "info" && "text-[rgb(var(--nuvio-info))]",
              )}
            />
            <p className="flex-1 text-sm text-text-primary">{toast.message}</p>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="-mr-1 rounded-full p-1 text-text-tertiary transition-colors hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
