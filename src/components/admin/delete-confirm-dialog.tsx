'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  entityName: string;
  dependencies?: string[];
  isPending?: boolean;
  error?: string | null;
}

export function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  entityName,
  dependencies = [],
  isPending = false,
  error = null,
}: DeleteConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.showModal();
      requestAnimationFrame(() => setIsAnimating(true));
    } else {
      setIsAnimating(false);
      dialog.close();
    }
  }, [open]);

  const handleClose = () => {
    if (isPending) return;
    setIsAnimating(false);
    setTimeout(() => onClose(), 150);
  };

  const isBlocked = dependencies.length > 0;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      className="backdrop:bg-black/50 rounded-lg border border-resort-sand shadow-xl p-0 w-full max-w-md"
      aria-labelledby="delete-dialog-title"
    >
      <div
        className={`transition-all duration-150 ${isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isBlocked ? 'bg-amber-50' : 'bg-red-50'}`}>
                <AlertTriangle className={`h-5 w-5 ${isBlocked ? 'text-amber-600' : 'text-red-600'}`} />
              </div>
              <div>
                <h2 id="delete-dialog-title" className="text-sm font-semibold text-resort-charcoal">
                  {isBlocked ? `Cannot Delete ${title}` : `Delete ${title}?`}
                </h2>
                <p className="text-xs text-resort-stone mt-0.5 font-mono">{entityName}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={isPending}
              className="text-resort-stone hover:text-resort-charcoal disabled:opacity-50"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {isBlocked ? (
            <div className="space-y-3">
              <p className="text-xs text-resort-charcoal">
                This {title.toLowerCase()} has dependent records that must be preserved:
              </p>
              <ul className="space-y-1.5">
                {dependencies.map((dep, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span className="text-resort-charcoal">{dep}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-resort-stone italic">
                Delete is blocked to protect data integrity.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-resort-charcoal">
                This action cannot be undone. The record will be permanently removed.
              </p>
              {error && (
                <div className="rounded bg-red-50 border border-red-200 p-3">
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-resort-sand bg-resort-ivory/30">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={isPending}
          >
            {isBlocked ? 'Close' : 'Cancel'}
          </Button>
          {!isBlocked && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onConfirm}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
            >
              {isPending ? (
                <>
                  <Spinner className="h-3 w-3" />
                  Deleting...
                </>
              ) : (
                'Delete Permanently'
              )}
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
