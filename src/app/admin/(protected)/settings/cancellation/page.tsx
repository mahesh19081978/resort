'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCancellationPoliciesAction, saveCancellationPolicyAction } from '@/actions/settings';
import { SettingsTabNav } from '@/components/admin/settings/SettingsTabNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, RefreshCw, CalendarX } from 'lucide-react';

type CancellationPolicy = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  feeType: string;
  feeValue: string;
  maxFeeAmount: string | null;
  minFeeAmount: string | null;
  hoursBeforeCheckIn: number | null;
  ratePlanId: string | null;
  ratePlan: { id: string; name: string; code: string } | null;
  isDefault: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isActive: boolean;
};

const FEE_TYPE_LABELS: Record<string, string> = {
  PERCENTAGE: 'Percentage',
  FIXED_AMOUNT: 'Fixed Amount',
  FIRST_NIGHT: 'First Night',
  FULL_BOOKING: 'Full Booking',
};

function getPolicyStatus(policy: CancellationPolicy): { label: string; variant: 'success' | 'warning' | 'danger' | 'default' | 'outline' } {
  const now = new Date();
  const from = policy.effectiveFrom ? new Date(policy.effectiveFrom) : null;
  const to = policy.effectiveTo ? new Date(policy.effectiveTo) : null;

  if (!policy.isActive) return { label: 'Inactive', variant: 'outline' };
  if (from && from > now) return { label: 'Future', variant: 'warning' };
  if (to && to <= now) return { label: 'Expired', variant: 'danger' };
  return { label: 'Active', variant: 'success' };
}

export default function CancellationPoliciesPage() {
  const [policies, setPolicies] = useState<CancellationPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<CancellationPolicy | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getCancellationPoliciesAction();
    if (result.success) {
      setPolicies(result.data || []);
    } else {
      setError(result.error || 'Failed to load cancellation policies');
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
          <h2 className="text-lg font-semibold text-resort-charcoal">Cancellation Policies</h2>
          <p className="text-xs text-resort-stone">
            Configure cancellation fee types, windows, and rate-plan associations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setEditingPolicy(null); setShowForm(true); }}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Add Policy
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-resort-stone text-xs">Loading policies...</div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-xs text-red-600 mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchData} className="text-xs">Retry</Button>
            </div>
          ) : policies.length === 0 ? (
            <div className="p-8 text-center text-resort-stone text-xs">
              No cancellation policies configured. Add one to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-resort-sand bg-resort-ivory/50">
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Code</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Name</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Fee Type</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Fee Value</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Window</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Rate Plan</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-resort-charcoal">Status</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-resort-charcoal">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-resort-sand/50">
                  {policies.map((policy) => {
                    const status = getPolicyStatus(policy);
                    return (
                      <tr key={policy.id} className="hover:bg-resort-ivory/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-resort-charcoal">{policy.code}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-resort-charcoal flex items-center gap-2">
                            {policy.name}
                            {policy.isDefault && <Badge variant="default">Default</Badge>}
                          </div>
                          {policy.description && (
                            <div className="text-[10px] text-resort-stone mt-0.5">{policy.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">{FEE_TYPE_LABELS[policy.feeType] || policy.feeType}</Badge>
                        </td>
                        <td className="px-4 py-3 font-semibold text-resort-charcoal">
                          {policy.feeType === 'PERCENTAGE'
                            ? `${Number(policy.feeValue).toFixed(1)}%`
                            : policy.feeType === 'FIXED_AMOUNT'
                            ? `₹${Number(policy.feeValue).toLocaleString('en-IN')}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-resort-charcoal">
                          {policy.hoursBeforeCheckIn != null
                            ? `${policy.hoursBeforeCheckIn}h before check-in`
                            : 'No window'}
                        </td>
                        <td className="px-4 py-3">
                          {policy.ratePlan ? (
                            <Badge variant="secondary">{policy.ratePlan.code}</Badge>
                          ) : (
                            <span className="text-resort-stone">Global</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setEditingPolicy(policy); setShowForm(true); }}
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
        <CancellationPolicyForm
          policy={editingPolicy}
          onClose={() => { setShowForm(false); setEditingPolicy(null); }}
          onSaved={() => { setShowForm(false); setEditingPolicy(null); fetchData(); }}
        />
      )}
    </div>
  );
}

function CancellationPolicyForm({
  policy,
  onClose,
  onSaved,
}: {
  policy: CancellationPolicy | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    id: policy?.id || '',
    name: policy?.name || '',
    code: policy?.code || '',
    description: policy?.description || '',
    feeType: policy?.feeType || 'PERCENTAGE',
    feeValue: policy?.feeValue || '',
    maxFeeAmount: policy?.maxFeeAmount || '',
    minFeeAmount: policy?.minFeeAmount || '',
    hoursBeforeCheckIn: policy?.hoursBeforeCheckIn?.toString() || '',
    ratePlanId: policy?.ratePlanId || '',
    isDefault: policy?.isDefault ?? false,
    effectiveFrom: policy?.effectiveFrom ? policy.effectiveFrom.split('T')[0] : '',
    effectiveTo: policy?.effectiveTo ? policy.effectiveTo.split('T')[0] : '',
    isActive: policy?.isActive ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);
    const result = await saveCancellationPolicyAction({
      ...form,
      feeValue: parseFloat(form.feeValue) || 0,
      maxFeeAmount: form.maxFeeAmount ? parseFloat(form.maxFeeAmount) : null,
      minFeeAmount: form.minFeeAmount ? parseFloat(form.minFeeAmount) : null,
      hoursBeforeCheckIn: form.hoursBeforeCheckIn ? parseInt(form.hoursBeforeCheckIn) : null,
      ratePlanId: form.ratePlanId || null,
      effectiveFrom: form.effectiveFrom || null,
      effectiveTo: form.effectiveTo || null,
    });
    setIsPending(false);
    if (result.success) {
      onSaved();
    } else {
      setError(result.error || 'Failed to save policy');
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
            {policy ? 'Edit Cancellation Policy' : 'Create Cancellation Policy'}
          </h2>

          {error && (
            <div className="rounded bg-red-50 border border-red-200 p-3">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Standard Cancellation"
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Code *</label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. POL-STANDARD"
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs font-mono text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Fee Type *</label>
                <select
                  value={form.feeType}
                  onChange={(e) => setForm({ ...form, feeType: e.target.value })}
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                >
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED_AMOUNT">Fixed Amount</option>
                  <option value="FIRST_NIGHT">First Night</option>
                  <option value="FULL_BOOKING">Full Booking</option>
                </select>
              </div>
            </div>

            {(form.feeType === 'PERCENTAGE' || form.feeType === 'FIXED_AMOUNT') && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Fee Value *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={form.feeValue}
                    onChange={(e) => setForm({ ...form, feeValue: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Min Fee (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.minFeeAmount}
                    onChange={(e) => setForm({ ...form, minFeeAmount: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Max Fee (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.maxFeeAmount}
                    onChange={(e) => setForm({ ...form, maxFeeAmount: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Hours Before Check-In
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.hoursBeforeCheckIn}
                  onChange={(e) => setForm({ ...form, hoursBeforeCheckIn: e.target.value })}
                  placeholder="e.g. 24"
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional"
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>
            </div>

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

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  className="rounded border-resort-sand text-resort-forest focus:ring-resort-gold"
                />
                <span className="text-xs font-semibold text-resort-charcoal">Default Policy</span>
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
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-resort-sand bg-resort-ivory/30">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={isPending}>
            {isPending ? 'Saving...' : policy ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
