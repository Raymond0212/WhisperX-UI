import React from "react";

export function ToastViewport({ toasts }) {
  if (toasts.length === 0) return null;

  return (
    <aside className="toast-viewport" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id} role="status">
          {toast.text}
        </div>
      ))}
    </aside>
  );
}
