"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// One short status line at a time, such as "Link copied". The live region is
// always mounted so screen readers hear each new message.
const DURATION_MS = 6000;

const ToastContext = createContext<(message: string) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function Toaster({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; at: number } | null>(
    null,
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const show = useCallback(
    (message: string) => setToast({ message, at: Date.now() }),
    [],
  );

  return (
    <ToastContext value={show}>
      {children}
      <div
        role="status"
        className="pointer-events-none fixed inset-x-5 bottom-5 z-10 mx-auto flex max-w-[480px] justify-center"
      >
        {toast && (
          <p
            key={toast.at}
            className="m-0 border-2 border-fg bg-bg px-4 py-3 text-secondary font-medium text-fg"
          >
            {toast.message}
          </p>
        )}
      </div>
    </ToastContext>
  );
}
