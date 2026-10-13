import { useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = "success") => {
        const id = Math.random().toString(36).slice(2);
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return { toasts, showToast, removeToast };
}

const icons: Record<ToastType, string> = {
    success: "✓",
    error: "✕",
    info: "ℹ",
    warning: "⚠",
};

const colors: Record<ToastType, string> = {
    success: "toast-success",
    error: "toast-error",
    info: "toast-info",
    warning: "toast-warning",
};

interface ToastContainerProps {
    toasts: Toast[];
    removeToast: (id: string) => void;
}

export function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
    return (
        <div className="toast-container" aria-live="polite" aria-atomic="false">
            {toasts.map((t) => (
                <div key={t.id} className={`toast-item ${colors[t.type]}`}>
                    <span className="toast-icon">{icons[t.type]}</span>
                    <span className="toast-message">{t.message}</span>
                    <button
                        type="button"
                        className="toast-close"
                        onClick={() => removeToast(t.id)}
                        aria-label="Dismiss"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}
