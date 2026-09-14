'use client';

import { useState, useEffect, useCallback } from 'react';
import { getServiceChargesAction, saveServiceChargeAction, getTaxesAction } from '@/actions/settings';
import { SettingsTabNav } from '@/components/admin/settings/SettingsTabNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, RefreshCw, CreditCard } from 'lucide-react';

type ServiceCharge = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  scope: string;
  rateType: string;
  rateValue: string;
  taxable: boolean;
  taxId: string | null;
  tax: { id: string; name: string; code: string; rate: string } | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isActive: boolean;
};

type Tax = {
  id: string;
  name: string;
  code: string;
  rate: string;
  scope: string;
  isActive: boolean;
};

const SCOPE_LABELS: Record<string, string> = {
  EXTRA_SERVICE: 'Extra Service',
  ROOM_SERVICE: 'Room Service',
  RESTAURANT: 'Restaurant',
  ALL: 'All',
};

function getChargeStatus(charge: ServiceCharge): { label: string; variant: 'success' | 'warning' | 'danger' | 'default' | 'outline' } {
  const now = new Date();
  const from = charge.effectiveFrom ? new Date(charge.effectiveFrom) : null;
  const to = charge.effectiveTo ? new Date(charge.effectiveTo) : null;

  if (!charge.isActive) return { label: 'Inactive', variant: 'outline' };
  if (from && from > now) return { label: 'Future', variant: 'warning' };
  if (to && to <= now) return { label: 'Expired', variant: 'danger' };
  return { label: 'Active', variant: 'success' };
}

export default function ServiceChargesPage() {
  const [charges, setCharges] = useState<ServiceCharge[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCharge, setEditingCharge] = useState<ServiceCharge | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [scResult, taxResult] = await Promise.all([
      getServiceChargesAction(),
      getTaxesAction(),
    ]);
    if (scResult.success) {
      setCharges(scResult.data || []);
    } else {
      setError(scResult.error || 'Failed to load service charges');
    }
    if (taxResult.success) {
      setTaxes(taxResult.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <SettingsTabNav />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-resort-charcoal">Service Charge Configuration</h2>
          <p className="text-xs text-resort-stone">
            Configure extra service charges, room service fees, and their tax linkage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setEditingCharge(null); setShowForm(true); }}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Add Service Charge
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-resort-stone text-xs">Loading service charges...</div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-xs text-red-600 mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchData} className="text-xs">Retry</Button>
            </div>
          ) : charges.length === 0 ? (
            <div className="p-8 text-center text-resort-stone text-xs">
              No service charges configured. Add one to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-resort-sand bg-resort-ivory/50">
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Code</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Name</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Scope</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Rate</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Tax</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-resort-charcoal">Status</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-resort-charcoal">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-resort-sand/50">
                  {charges.map((charge) => {
                    const status = getChargeStatus(charge);
                    return (
                      <tr key={charge.id} className="hover:bg-resort-ivory/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-resort-charcoal">{charge.code}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-resort-charcoal">{charge.name}</div>
                          {charge.description && (
                            <div className="text-[10px] text-resort-stone mt-0.5">{charge.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">{SCOPE_LABELS[charge.scope] || charge.scope}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-resort-charcoal">
                            {charge.rateType === 'PERCENTAGE'
                              ? `${Number(charge.rateValue).toFixed(2)}%`
                              : `₹${Number(charge.rateValue).toLocaleString('en-IN')}`}
                          </span>
                          <span className="text-[10px] text-resort-stone ml-1">
                            ({charge.rateType === 'PERCENTAGE' ? '%' : 'Fixed'})
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {charge.tax ? (
                            <Badge variant="success">{charge.tax.code}</Badge>
                          ) : charge.taxable ? (
                            <Badge variant="warning">Taxable (no tax)</Badge>
                          ) : (
                            <span className="text-resort-stone">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setEditingCharge(charge); setShowForm(true); }}
                            className="text-xs"
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <ServiceChargeForm
          charge={editingCharge}
          taxes={taxes}
          onClose={() => { setShowForm(false); setEditingCharge(null); }}
          onSaved={() => { setShowForm(false); setEditingCharge(null); fetchData(); }}
        />
      )}
    </div>
  );
}

function ServiceChargeForm({
  charge,
  taxes,
  onClose,
  onSaved,
}: {
  charge: ServiceCharge | null;
  taxes: Tax[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    id: charge?.id || '',
    name: charge?.name || '',
    code: charge?.code || '',
    description: charge?.description || '',
    scope: charge?.scope || 'EXTRA_SERVICE',
    rateType: charge?.rateType || 'PERCENTAGE',
    rateValue: charge?.rateValue || '',
    taxable: charge?.taxable ?? false,
    taxId: charge?.taxId || '',
    effectiveFrom: charge?.effectiveFrom ? charge.effectiveFrom.split('T')[0] : '',
    effectiveTo: charge?.effectiveTo ? charge.effectiveTo.split('T')[0] : '',
    isActive: charge?.isActive ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);
    const result = await saveServiceChargeAction({
      ...form,
      rateValue: parseFloat(form.rateValue) || 0,
      effectiveFrom: form.effectiveFrom || null,
      effectiveTo: form.effectiveTo || null,
      taxId: form.taxable ? (form.taxId || null) : null,
    });
    setIsPending(false);
    if (result.success) {
      onSaved();
    } else {
      setError(result.error || 'Failed to save service charge');
    }
  };

  return (
    <dialog
      open
      className="backdrop:bg-black/50 rounded-lg border border-resort-sand shadow-xl p-0 w-full max-w-lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="p-6 space-y-4">
          <h2 className="text-base font-semibold text-resort-charcoal">
            {charge ? 'Edit Service Charge' : 'Create Service Charge'}
          </h2>

          {error && (
            <div className="rounded bg-red-50 border border-red-200 p-3">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Extra Bed Charge"
                className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Code *</label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. SC-EXTRA-BED"
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs font-mono text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Scope *</label>
                <select
                  value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value })}
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                >
                  <option value="EXTRA_SERVICE">Extra Service</option>
                  <option value="ROOM_SERVICE">Room Service</option>
                  <option value="RESTAURANT">Restaurant</option>
                  <option value="ALL">All</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Rate Type *</label>
                <select
                  value={form.rateType}
                  onChange={(e) => setForm({ ...form, rateType: e.target.value })}
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                >
                  <option value="PERCENTAGE">Percentage (%)</option>
                  <option value="FIXED_AMOUNT">Fixed Amount (₹)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Rate Value *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.rateValue}
                  onChange={(e) => setForm({ ...form, rateValue: e.target.value })}
                  placeholder={form.rateType === 'PERCENTAGE' ? 'e.g. 10' : 'e.g. 500'}
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
                className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.taxable}
                  onChange={(e) => setForm({ ...form, taxable: e.target.checked, taxId: e.target.checked ? form.taxId : '' })}
                  className="rounded border-resort-sand text-resort-forest focus:ring-resort-gold"
                />
                <span className="text-xs font-semibold text-resort-charcoal">Taxable</span>
              </label>
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

            {form.taxable && (
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Tax</label>
                <select
                  value={form.taxId}
                  onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                >
                  <option value="">— Select tax —</option>
                  {taxes.filter((t) => t.isActive).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name} ({Number(t.rate).toFixed(1)}%)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Effective From</label>
                <input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Effective To</label>
                <input
                  type="date"
                  value={form.effectiveTo}
                  onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-resort-sand bg-resort-ivory/30">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={isPending}>
            {isPending ? 'Saving...' : charge ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
