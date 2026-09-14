'use client';

import { useState, useTransition } from 'react';
import { saveTaxAction, deleteTaxAction } from '@/actions/settings';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DeleteConfirmDialog } from '@/components/admin/delete-confirm-dialog';

type Tax = {
  id: string;
  name: string;
  code: string;
  rate: string;
  scope: string;
  description: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isActive: boolean;
};

interface TaxFormProps {
  tax?: Tax | null;
  onClose: () => void;
  onSaved: () => void;
}

const SCOPE_LABELS: Record<string, string> = {
  ROOM: 'Room',
  RESTAURANT: 'Restaurant',
  SERVICE: 'Service',
  OTHER: 'Other',
};

function getTaxStatus(tax: Tax): { label: string; variant: 'success' | 'warning' | 'danger' | 'default' | 'outline' } {
  const now = new Date();
  const from = tax.effectiveFrom ? new Date(tax.effectiveFrom) : null;
  const to = tax.effectiveTo ? new Date(tax.effectiveTo) : null;

  if (!tax.isActive) return { label: 'Inactive', variant: 'outline' };
  if (from && from > now) return { label: 'Future', variant: 'warning' };
  if (to && to <= now) return { label: 'Expired', variant: 'danger' };
  return { label: 'Active', variant: 'success' };
}

export function TaxForm({ tax, onClose, onSaved }: TaxFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    id: tax?.id || '',
    name: tax?.name || '',
    code: tax?.code || '',
    rate: tax?.rate || '',
    scope: tax?.scope || 'SERVICE',
    description: tax?.description || '',
    effectiveFrom: tax?.effectiveFrom ? tax.effectiveFrom.split('T')[0] : '',
    effectiveTo: tax?.effectiveTo ? tax.effectiveTo.split('T')[0] : '',
    isActive: tax?.isActive ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveTaxAction({
        ...form,
        rate: parseFloat(form.rate) || 0,
        effectiveFrom: form.effectiveFrom || null,
        effectiveTo: form.effectiveTo || null,
      });
      if (result.success) {
        onSaved();
      } else {
        setError(result.error || 'Failed to save tax');
      }
    });
  };

  return (
    <dialog
      open
      className="backdrop:bg-black/50 rounded-lg border border-resort-sand shadow-xl p-0 w-full max-w-lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="p-6 space-y-4">
          <h2 className="text-base font-semibold text-resort-charcoal">
            {tax ? 'Edit Tax Configuration' : 'Create Tax Configuration'}
          </h2>

          {error && (
            <div className="rounded bg-red-50 border border-red-200 p-3">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Tax Name *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. General Service Tax"
                className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Code *
              </label>
              <input
                type="text"
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. GST_SVC_18"
                className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs font-mono text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold uppercase"
              />
              <p className="text-[10px] text-resort-stone mt-0.5">Letters, numbers, underscores only</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Rate (%) *
              </label>
              <input
                type="number"
                required
                min="0"
                max="100"
                step="0.01"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                placeholder="e.g. 18.00"
                className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Scope *
              </label>
              <select
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
                className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
              >
                <option value="ROOM">Room</option>
                <option value="RESTAURANT">Restaurant</option>
                <option value="SERVICE">Service</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Effective From
              </label>
              <input
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Effective To
              </label>
              <input
                type="date"
                value={form.effectiveTo}
                onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
                className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Description
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
                className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
              />
            </div>

            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="rounded border-resort-sand text-resort-forest focus:ring-resort-gold"
                />
                <span className="text-xs font-semibold text-resort-charcoal">Active</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-resort-sand bg-resort-ivory/30">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={isPending}>
            {isPending ? 'Saving...' : tax ? 'Update Tax' : 'Create Tax'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

export function TaxListItem({
  tax,
  onEdit,
  onDeleted,
}: {
  tax: Tax;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [showDelete, setShowDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const status = getTaxStatus(tax);

  const handleDelete = () => {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteTaxAction(tax.id);
      if (result.success) {
        setShowDelete(false);
        onDeleted();
      } else {
        setDeleteError(result.error || 'Failed to delete');
      }
    });
  };

  return (
    <>
      <div className="flex items-center justify-between py-3 px-4 border-b border-resort-sand/50 last:border-0 hover:bg-resort-ivory/30 transition-colors">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-resort-charcoal">{tax.name}</span>
              <Badge variant={status.variant}>{status.label}</Badge>
              <Badge variant="secondary">{SCOPE_LABELS[tax.scope] || tax.scope}</Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-resort-stone">
              <span className="font-mono">{tax.code}</span>
              <span className="font-semibold text-resort-forest">{Number(tax.rate).toFixed(2)}%</span>
              {tax.effectiveFrom && (
                <span>From: {new Date(tax.effectiveFrom).toLocaleDateString('en-IN')}</span>
              )}
              {tax.effectiveTo && (
                <span>To: {new Date(tax.effectiveTo).toLocaleDateString('en-IN')}</span>
              )}
            </div>
            {tax.description && (
              <p className="text-xs text-resort-stone mt-0.5">{tax.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-3">
          <Button variant="ghost" size="sm" onClick={onEdit} className="text-xs">
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDelete(true)}
            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            Delete
          </Button>
        </div>
      </div>

      <DeleteConfirmDialog
        open={showDelete}
        onClose={() => { setShowDelete(false); setDeleteError(null); }}
        onConfirm={handleDelete}
        title="Tax"
        entityName={`${tax.code} — ${tax.name}`}
        isPending={isPending}
        error={deleteError}
      />
    </>
  );
}

export { getTaxStatus, SCOPE_LABELS };
export type { Tax };
