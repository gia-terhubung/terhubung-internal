'use client';

import { useState } from 'react';

// Generic confirmation modal for one-click state changes (cancel toggle,
// downgrade, reset, retry, quote transitions, moderation actions).
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Konfirmasi',
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col rounded-xl border border-border-color bg-bg-secondary shadow-2xl">
        <div className="border-b border-border-color p-5">
          <h2 className="text-lg font-bold text-text-primary">{title}</h2>
        </div>
        <div className="p-5 text-sm text-text-secondary">{message}</div>
        <div className="flex justify-end gap-3 border-t border-border-color p-5">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className={`rounded-lg px-5 py-2 text-sm font-bold disabled:opacity-50 ${
              danger
                ? 'bg-danger text-white hover:bg-danger-hover'
                : 'bg-brand text-brand-content hover:bg-brand-hover'
            }`}
          >
            {busy ? 'Memproses…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
