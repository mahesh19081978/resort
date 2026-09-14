'use client';

import { useState, useEffect, useCallback } from 'react';
import { getServicesAction, saveServiceAction, deleteServiceAction, getTaxesAction } from '@/actions/settings';
import { SettingsTabNav } from '@/components/admin/settings/SettingsTabNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DeleteConfirmDialog } from '@/components/admin/delete-confirm-dialog';
import { Plus, RefreshCw } from 'lucide-react';

type Service = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  basePrice: string;
  isChargeable: boolean;
  isActive: boolean;
  taxId: string | null;
  tax: { id: string; name: string; code: string; rate: string; scope: string } | null;
};

type Tax = {
  id: string;
  name: string;
  code: string;
  rate: string;
  scope: string;
  isActive: boolean;
};

export default function ServicesSettingsPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [svcResult, taxResult] = await Promise.all([
      getServicesAction(),
      getTaxesAction(),
    ]);
    if (svcResult.success) {
      setServices(svcResult.data || []);
    } else {
      setError(svcResult.error || 'Failed to load services');
    }
    if (taxResult.success) {
      setTaxes(taxResult.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setIsDeleting(true);
    const result = await deleteServiceAction(deleteTarget.id);
    setIsDeleting(false);
    if (result.success) {
      setDeleteTarget(null);
      fetchData();
    } else {
      setDeleteError(result.error || 'Failed to delete');
    }
  };

  return (
    <div className="space-y-6">
      <SettingsTabNav />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-resort-charcoal">Service Management</h2>
          <p className="text-xs text-resort-stone">
            Configure chargeable services and assign tax rules. Each service can have an explicit tax assignment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setEditingService(null); setShowForm(true); }}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Add Service
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-resort-stone text-xs">Loading services...</div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-xs text-red-600 mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchData} className="text-xs">Retry</Button>
            </div>
          ) : services.length === 0 ? (
            <div className="p-8 text-center text-resort-stone text-xs">
              No services configured. Add a service to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-resort-sand bg-resort-ivory/50">
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Code</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Name</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-resort-charcoal">Base Price</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-resort-charcoal">Tax Assignment</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-resort-charcoal">Status</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-resort-charcoal">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-resort-sand/50">
                  {services.map((svc) => (
                    <tr key={svc.id} className="hover:bg-resort-ivory/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-resort-charcoal">{svc.code}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-resort-charcoal">{svc.name}</div>
                        {svc.description && (
                          <div className="text-[10px] text-resort-stone mt-0.5">{svc.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-resort-charcoal">
                        ₹{Number(svc.basePrice).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3">
                        {svc.tax ? (
                          <Badge variant="success">
                            {svc.tax.code} — {Number(svc.tax.rate).toFixed(1)}%
                          </Badge>
                        ) : (
                          <Badge variant="warning">No tax assigned</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {svc.isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setEditingService(svc); setShowForm(true); }}
                            className="text-xs"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setDeleteTarget(svc); setDeleteError(null); }}
                            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <ServiceForm
          service={editingService}
          taxes={taxes}
          onClose={() => { setShowForm(false); setEditingService(null); }}
          onSaved={() => { setShowForm(false); setEditingService(null); fetchData(); }}
        />
      )}

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onClose={() => { setDeleteTarget(null); setDeleteError(null); }}
        onConfirm={handleDeleteConfirm}
        title="Service"
        entityName={deleteTarget ? `${deleteTarget.code} — ${deleteTarget.name}` : ''}
        isPending={isDeleting}
        error={deleteError}
      />
    </div>
  );
}

function ServiceForm({
  service,
  taxes,
  onClose,
  onSaved,
}: {
  service: Service | null;
  taxes: Tax[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    id: service?.id || '',
    name: service?.name || '',
    code: service?.code || '',
    description: service?.description || '',
    basePrice: service?.basePrice || '',
    isChargeable: service?.isChargeable ?? true,
    isActive: service?.isActive ?? true,
    taxId: service?.taxId || '',
  });

  const serviceTaxes = taxes.filter((t) => t.scope === 'SERVICE' && t.isActive);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);
    const result = await saveServiceAction({
      ...form,
      basePrice: parseFloat(form.basePrice) || 0,
      taxId: form.taxId || null,
    });
    setIsPending(false);
    if (result.success) {
      onSaved();
    } else {
      setError(result.error || 'Failed to save service');
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
            {service ? 'Edit Service' : 'Create Service'}
          </h2>

          {error && (
            <div className="rounded bg-red-50 border border-red-200 p-3">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Service Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Abhyanga Ayurvedic Full Body Massage"
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
                  placeholder="e.g. SVC-SPA-01"
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs font-mono text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Base Price (₹) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.basePrice}
                  onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
                  placeholder="e.g. 3200"
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

            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Tax Assignment
              </label>
              <select
                value={form.taxId}
                onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
              >
                <option value="">— Use scope-based SERVICE tax fallback —</option>
                {serviceTaxes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name} ({Number(t.rate).toFixed(1)}%)
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-resort-stone mt-0.5">
                If no tax is assigned, the system will use the active SERVICE-scope tax.
              </p>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isChargeable}
                  onChange={(e) => setForm({ ...form, isChargeable: e.target.checked })}
                  className="rounded border-resort-sand text-resort-forest focus:ring-resort-gold"
                />
                <span className="text-xs font-semibold text-resort-charcoal">Chargeable</span>
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
            {isPending ? 'Saving...' : service ? 'Update Service' : 'Create Service'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
