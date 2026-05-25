import React from "react";

export function ToastViewport({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <aside className="toast-viewport" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <DismissibleToast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </aside>
  );
}

function DismissibleToast({ toast, onDismiss }) {
  const [dragX, setDragX] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const startXRef = React.useRef(0);

  function onPointerDown(event) {
    startXRef.current = event.clientX;
    setDragging(true);
  }

  function onPointerMove(event) {
    if (!dragging) return;
    setDragX(event.clientX - startXRef.current);
  }

  function onPointerUp() {
    const shouldDismiss = Math.abs(dragX) > 72;
    setDragging(false);
    setDragX(0);
    if (shouldDismiss) onDismiss(toast.id);
  }

  return (
    <div
      className="toast"
      role="status"
      onClick={() => onDismiss(toast.id)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ transform: `translateX(${dragX}px)` }}
    >
      <span className="toast-text">
          {toast.text}
      </span>
    </div>
  );
}
