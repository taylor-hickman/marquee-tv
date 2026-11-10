"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "./cn";

// Sheet and Dialog sit on the native <dialog>: showModal gives the focus trap,
// Escape and the inert page behind. Closing by Escape, by a click on the scrim
// or by `open` turning false all end in onClose.
type ModalProps = {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
};

function Modal({
  open,
  onClose,
  label,
  children,
  className,
}: ModalProps & { className: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "max-h-none max-w-none bg-bg p-0 text-fg backdrop:bg-scrim",
        className,
      )}
    >
      {children}
    </dialog>
  );
}

// Rises from the bottom edge, as the handoff sheet does.
export function Sheet(props: ModalProps) {
  return (
    <Modal
      {...props}
      className="inset-x-0 top-auto bottom-0 mx-auto mb-0 max-h-[85dvh] w-full max-w-[640px] border-0 border-t-2 border-fg sm:border-x-2"
    >
      <div className="px-5 pt-5 pb-7">
        <div aria-hidden="true" className="mx-auto mb-4 h-1 w-12 bg-fg" />
        {props.children}
      </div>
    </Modal>
  );
}

// Centred, for a question that needs an answer before going on.
export function Dialog(props: ModalProps) {
  return (
    <Modal
      {...props}
      className="m-auto w-[min(100%-2.5rem,480px)] border-2 border-fg"
    >
      <div className="p-6">{props.children}</div>
    </Modal>
  );
}
