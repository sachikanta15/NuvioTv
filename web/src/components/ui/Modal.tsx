import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { IconButton } from "./IconButton";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Hide the default max-width constraint for wide dialogs. */
  wide?: boolean;
}

const SIZES = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-2xl" } as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  wide,
}: ModalProps) {
  const ref = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cn(
          // Mobile: bottom sheet. Desktop: centred dialog.
          "glass-strong relative flex w-full flex-col overflow-hidden shadow-lift",
          "max-h-[92dvh] animate-slide-up rounded-t-panel-lg",
          "sm:max-h-[88vh] sm:animate-scale-in sm:rounded-panel",
          wide ? "sm:max-w-5xl" : SIZES[size],
        )}
      >
        {/* Drag handle on the bottom-sheet presentation. */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {(title || description) && (
          <header className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold sm:text-lg">{title}</h2>}
              {description && (
                <p className="mt-1 text-sm text-text-secondary">{description}</p>
              )}
            </div>
            <IconButton label="Close" onClick={onClose} size="sm">
              <X size={18} />
            </IconButton>
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
        {footer && (
          <footer className="flex items-center justify-end gap-3 border-t border-white/8 px-5 py-4 pb-safe sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
