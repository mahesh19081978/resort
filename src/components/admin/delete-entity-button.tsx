'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { DeleteConfirmDialog } from './delete-confirm-dialog';

type ActionResponse = { success: boolean; data?: unknown; error?: string };

interface DeleteEntityButtonProps {
  entityId: string;
  entityName: string;
  entityType: string;
  dependencies?: string[];
  deleteAction: (prevState: ActionResponse | null, formData: FormData) => Promise<ActionResponse>;
  hasPermission?: boolean;
}

export function DeleteEntityButton({
  entityId,
  entityName,
  entityType,
  dependencies = [],
  deleteAction,
  hasPermission = true,
}: DeleteEntityButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!hasPermission) return null;

  const handleConfirm = () => {
    setError(null);
    const formData = new FormData();
    formData.set('entityId', entityId);

    startTransition(async () => {
      const result = await deleteAction(null, formData);
      if (result.success) {
        setDialogOpen(false);
        router.refresh();
      } else {
        setError(result.error || 'Delete failed. Please try again.');
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-50 border border-red-200 transition-colors"
        aria-label={`Delete ${entityName}`}
      >
        <Trash2 className="h-3 w-3" />
        Delete
      </button>

      <DeleteConfirmDialog
        open={dialogOpen}
        onClose={() => {
          if (!isPending) {
            setDialogOpen(false);
            setError(null);
          }
        }}
        onConfirm={handleConfirm}
        title={entityType}
        entityName={entityName}
        dependencies={dependencies}
        isPending={isPending}
        error={error}
      />
    </>
  );
}
