'use client';

import React, { useState, useTransition } from 'react';
import {
  createStoreAction,
  updateStoreAction,
  toggleStoreActiveAction,
  deleteStoreAction,
} from '@/actions/inventory';
import { Warehouse, Plus, Edit2, Trash2, Power, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface StoreSummary {
  id: string;
  name: string;
  code: string;
  department: string;
  isActive: boolean;
  activeStockCount: number;
  totalMovements: number;
}

export default function StoreManagementModal({
  stores,
}: {
  stores: StoreSummary[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  // Mode: 'list' | 'create' | 'edit'
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editStoreId, setEditStoreId] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [department, setDepartment] = useState('F&B');

  const commonDepartments = ['F&B', 'Kitchen', 'Bar', 'Housekeeping', 'Maintenance', 'Procurement', 'Front Desk', 'Spa', 'Garden', 'General'];

  const resetForm = () => {
    setName('');
    setCode('');
    setDepartment('F&B');
    setEditStoreId(null);
    setMode('list');
    setError(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setMode('create');
    setError(null);
    setSuccess(null);
  };

  const handleOpenEdit = (s: StoreSummary) => {
    setEditStoreId(s.id);
    setName(s.name);
    setCode(s.code);
    setDepartment(s.department);
    setMode('edit');
    setError(null);
    setSuccess(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      if (mode === 'create') {
        const res = await createStoreAction({ name, code, department });
        if (res.success) {
          setSuccess(`Store "${name}" created successfully.`);
          resetForm();
          router.refresh();
        } else {
          setError(res.error || 'Failed to create store.');
        }
      } else if (mode === 'edit' && editStoreId) {
        const res = await updateStoreAction({ storeId: editStoreId, name, department });
        if (res.success) {
          setSuccess(`Store updated successfully.`);
          resetForm();
          router.refresh();
        } else {
          setError(res.error || 'Failed to update store.');
        }
      }
    });
  };

  const handleToggle = (s: StoreSummary) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await toggleStoreActiveAction(s.id);
      if (res.success) {
        setSuccess(`Store status updated.`);
        router.refresh();
      } else {
        setError(res.error || 'Failed to toggle status.');
      }
    });
  };

  const handleDelete = (s: StoreSummary) => {
    if (!confirm(`Are you sure you want to permanently delete store "${s.name}"?`)) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await deleteStoreAction(s.id);
      if (res.success) {
        setSuccess(`Store "${s.name}" deleted.`);
        router.refresh();
      } else {
        setError(res.error || 'Failed to delete store.');
      }
    });
  };

  return (
    <>
      <button
        onClick={() => {
          setIsOpen(true);
          setMode('list');
          setError(null);
          setSuccess(null);
        }}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-white border border-border text-xs font-semibold text-resort-charcoal hover:bg-resort-sand/30 transition-colors shadow-sm"
      >
        <Warehouse className="w-4 h-4 text-resort-forest" />
        Manage Physical Stores
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-border max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-border flex justify-between items-center bg-stone-50/70">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-resort-forest/10 flex items-center justify-center text-resort-forest">
                  <Warehouse className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base text-resort-charcoal">
                    {mode === 'create'
                      ? 'Add New Physical Store'
                      : mode === 'edit'
                      ? 'Edit Physical Store'
                      : 'Physical Stores Management'}
                  </h3>
                  <p className="text-[11px] text-resort-stone">
                    Configure warehouse locations, kitchen pantries, and department storage.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alert Messages */}
            {error && (
              <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="mx-4 mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto flex-1">
              {mode === 'list' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-2">
                    <span className="text-xs text-resort-stone">
                      Total Stores: <span className="font-semibold text-resort-charcoal">{stores.length}</span>
                    </span>
                    <button
                      onClick={handleOpenCreate}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-resort-forest text-white text-xs font-semibold hover:bg-resort-forest/90 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Store
                    </button>
                  </div>

                  <div className="border border-border/80 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-stone-50 text-[10px] uppercase font-semibold text-stone-600 tracking-wider">
                          <th className="py-2.5 px-3">Store Name</th>
                          <th className="py-2.5 px-3">Code</th>
                          <th className="py-2.5 px-3">Dept</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {stores.map((s) => (
                          <tr key={s.id} className="hover:bg-stone-50/50">
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-resort-charcoal">{s.name}</div>
                              {s.code === 'STORE-MAIN' && (
                                <span className="text-[9px] bg-blue-50 text-blue-700 font-medium px-1 rounded">
                                  Default Warehouse
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-stone-600">{s.code}</td>
                            <td className="py-2.5 px-3 text-stone-600">{s.department}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  s.isActive
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-stone-100 text-stone-600 border border-stone-200'
                                }`}
                              >
                                {s.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => handleOpenEdit(s)}
                                  className="p-1 text-stone-600 hover:text-stone-900 rounded hover:bg-stone-100 transition-colors"
                                  title="Edit Name & Department"
                                  disabled={isPending}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {s.code !== 'STORE-MAIN' && (
                                  <>
                                    <button
                                      onClick={() => handleToggle(s)}
                                      className={`p-1 rounded transition-colors ${
                                        s.isActive
                                          ? 'text-amber-600 hover:bg-amber-50'
                                          : 'text-emerald-600 hover:bg-emerald-50'
                                      }`}
                                      title={s.isActive ? 'Deactivate Store' : 'Activate Store'}
                                      disabled={isPending}
                                    >
                                      <Power className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(s)}
                                      className={`p-1 rounded transition-colors ${
                                        s.activeStockCount > 0 || s.totalMovements > 0
                                          ? 'text-stone-300 cursor-not-allowed'
                                          : 'text-rose-600 hover:bg-rose-50'
                                      }`}
                                      title={
                                        s.activeStockCount > 0
                                          ? 'Cannot delete: holds stock'
                                          : s.totalMovements > 0
                                          ? 'Cannot delete: has ledger history'
                                          : 'Delete store'
                                      }
                                      disabled={isPending || s.activeStockCount > 0 || s.totalMovements > 0}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-[11px] text-stone-500 italic pt-2">
                    💡 Stores with historical ledger movements or active stock balances cannot be deleted to maintain audit integrity. You can toggle them inactive instead.
                  </p>
                </div>
              )}

              {(mode === 'create' || mode === 'edit') && (
                <form onSubmit={handleSave} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Store Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Spa & Wellness Store, Bakery Pantry"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-border rounded-md focus:outline-hidden focus:ring-1 focus:ring-resort-forest"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Store Code * {mode === 'edit' && <span className="font-normal text-stone-400">(immutable)</span>}
                    </label>
                    <input
                      type="text"
                      required
                      disabled={mode === 'edit'}
                      placeholder="e.g., STORE-SPA, STORE-BAKERY"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      className={`w-full px-3 py-2 font-mono text-xs border border-border rounded-md focus:outline-hidden focus:ring-1 focus:ring-resort-forest ${
                        mode === 'edit' ? 'bg-stone-100 cursor-not-allowed text-stone-500' : ''
                      }`}
                    />
                    {mode === 'create' && (
                      <p className="text-[10px] text-stone-400 mt-1">Unique identifier (e.g. STORE-SPA). Cannot be changed after creation.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Department *</label>
                    <div className="flex gap-2">
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="px-3 py-2 text-xs border border-border rounded-md bg-white focus:outline-hidden focus:ring-1 focus:ring-resort-forest"
                      >
                        {commonDepartments.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Or type custom department..."
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs border border-border rounded-md focus:outline-hidden focus:ring-1 focus:ring-resort-forest"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t border-border">
                    <button
                      type="button"
                      onClick={() => setMode('list')}
                      className="px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-stone-50 text-stone-700"
                    >
                      Back to List
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-1.5 text-xs font-semibold bg-resort-forest text-white rounded-md hover:bg-resort-forest/90 transition-colors shadow-xs disabled:opacity-50"
                    >
                      {isPending ? 'Saving...' : mode === 'create' ? 'Create Store' : 'Update Store'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
