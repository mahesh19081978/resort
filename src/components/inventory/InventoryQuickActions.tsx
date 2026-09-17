'use client';

import React, { useState, useTransition } from 'react';
import {
  issueStockAction,
  adjustStockAction,
  createStockTransferAction,
  approveStockTransferAction,
  dispatchStockTransferAction,
  receiveStockTransferAction,
  performQuickStockCountAction,
  getOperationsLookupDataAction,
} from '@/actions/inventory';
import {
  Plus,
  ArrowRight,
  ArrowLeftRight,
  SlidersHorizontal,
  ClipboardList,
  Boxes,
  Warehouse,
  AlertCircle,
  CheckCircle2,
  X,
  Send,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export interface QuickActionPermissions {
  canRequest: boolean;
  canIssue: boolean;
  canTransfer: boolean;
  canCount: boolean;
  canAdjust: boolean;
  canManageStores: boolean;
}

interface ItemLookup {
  id: string;
  name: string;
  code: string;
  baseUnit: { id: string; name: string; code: string };
}

interface StoreLookup {
  id: string;
  name: string;
  code: string;
  department: string | null;
}

export default function InventoryQuickActions({
  permissions,
  onOpenManageStores,
}: {
  permissions: QuickActionPermissions;
  onOpenManageStores: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Active modal type: null | 'ISSUE' | 'TRANSFER' | 'COUNT' | 'ADJUST'
  const [activeModal, setActiveModal] = useState<'ISSUE' | 'TRANSFER' | 'COUNT' | 'ADJUST' | null>(null);

  // Lookups cache
  const [lookupsLoaded, setLookupsLoaded] = useState(false);
  const [items, setItems] = useState<ItemLookup[]>([]);
  const [stores, setStores] = useState<StoreLookup[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, Record<string, string>>>({});

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedDestStoreId, setSelectedDestStoreId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [department, setDepartment] = useState('Kitchen');
  const [reason, setReason] = useState('');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('OUT');

  const loadLookupsIfNeeded = async () => {
    if (lookupsLoaded) return;
    try {
      const res = await getOperationsLookupDataAction();
      if (res.success && res.data) {
        setItems(res.data.items);
        setStores(res.data.stores);
        setStockMap(res.data.stockMap);
        setLookupsLoaded(true);

        if (res.data.stores.length > 0) {
          setSelectedStoreId(res.data.stores[0].id);
          if (res.data.stores.length > 1) {
            setSelectedDestStoreId(res.data.stores[1].id);
          }
        }
        if (res.data.items.length > 0) {
          setSelectedItemId(res.data.items[0].id);
        }
      }
    } catch (e: any) {
      setError('Failed to load inventory lookups');
    }
  };

  const openModal = async (type: 'ISSUE' | 'TRANSFER' | 'COUNT' | 'ADJUST') => {
    setError(null);
    setSuccess(null);
    setQuantity(1);
    setReason('');
    setActiveModal(type);
    await loadLookupsIfNeeded();
  };

  const closeModal = () => {
    setActiveModal(null);
    setError(null);
    setSuccess(null);
  };

  const selectedItemObj = items.find((i) => i.id === selectedItemId);
  const currentOnHand = selectedStoreId && selectedItemId ? stockMap[selectedStoreId]?.[selectedItemId] || '0.00' : '0.00';

  // Handle Form Submissions
  const handleSubmitIssue = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await issueStockAction({
        storeId: selectedStoreId,
        itemId: selectedItemId,
        quantity: Number(quantity),
        department,
        remarks: reason || `Department Issue to [${department}]`,
      });
      if (res.success) {
        setSuccess('Stock issued successfully.');
        router.refresh();
        setTimeout(closeModal, 1200);
      } else {
        setError(res.error || 'Failed to issue stock.');
      }
    });
  };

  const handleSubmitTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStoreId === selectedDestStoreId) {
      setError('Source and Destination stores cannot be the same.');
      return;
    }
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      // 1. Create transfer
      const trfRes = await createStockTransferAction({
        sourceStoreId: selectedStoreId,
        destStoreId: selectedDestStoreId,
        notes: reason || 'Operational Transfer',
        items: [{ itemId: selectedItemId, requestedQty: Number(quantity) }],
      });
      if (!trfRes.success || !trfRes.data) {
        setError(trfRes.error || 'Failed to initiate transfer.');
        return;
      }

      const trfId = trfRes.data.id;
      // 2. Immediate auto-fulfillment workflow since on same resort premises
      await approveStockTransferAction({ transferId: trfId });
      await dispatchStockTransferAction({ transferId: trfId });
      const rcvRes = await receiveStockTransferAction({
        transferId: trfId,
        items: [{ itemId: selectedItemId, receivedQty: Number(quantity) }],
      });

      if (rcvRes.success) {
        setSuccess('Inter-store transfer completed and posted to ledger.');
        router.refresh();
        setTimeout(closeModal, 1200);
      } else {
        setError(rcvRes.error || 'Transfer dispatched but receipt pending.');
      }
    });
  };

  const handleSubmitAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Mandatory explanation reason is required for adjustments.');
      return;
    }
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await adjustStockAction({
        storeId: selectedStoreId,
        itemId: selectedItemId,
        direction,
        quantity: Number(quantity),
        reason: reason.trim(),
      });
      if (res.success) {
        setSuccess('Stock adjustment posted to ledger.');
        router.refresh();
        setTimeout(closeModal, 1200);
      } else {
        setError(res.error || 'Failed to adjust stock.');
      }
    });
  };

  const handleSubmitCount = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await performQuickStockCountAction({
        storeId: selectedStoreId,
        itemId: selectedItemId,
        actualCount: Number(quantity),
        notes: reason || 'Physical inventory reconciliation count',
      });
      if (res.success) {
        setSuccess('Physical count reconciled and adjustments posted.');
        router.refresh();
        setTimeout(closeModal, 1200);
      } else {
        setError(res.error || 'Failed to reconcile count.');
      }
    });
  };

  return (
    <>
      {/* Action Buttons Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {permissions.canRequest && (
          <Link
            href="/admin/inventory/requests"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-resort-forest text-white text-xs font-semibold hover:bg-resort-forest/90 transition-colors shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            + Stock Request
          </Link>
        )}

        {permissions.canIssue && (
          <button
            onClick={() => openModal('ISSUE')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-border text-xs font-semibold text-resort-charcoal hover:bg-stone-50 transition-colors shadow-2xs"
          >
            <Send className="w-3.5 h-3.5 text-resort-olive" />
            Issue Stock
          </button>
        )}

        {permissions.canTransfer && (
          <button
            onClick={() => openModal('TRANSFER')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-border text-xs font-semibold text-resort-charcoal hover:bg-stone-50 transition-colors shadow-2xs"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
            Transfer Stock
          </button>
        )}

        {permissions.canCount && (
          <button
            onClick={() => openModal('COUNT')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-border text-xs font-semibold text-resort-charcoal hover:bg-stone-50 transition-colors shadow-2xs"
          >
            <ClipboardList className="w-3.5 h-3.5 text-amber-600" />
            Stock Count
          </button>
        )}

        {permissions.canAdjust && (
          <button
            onClick={() => openModal('ADJUST')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-border text-xs font-semibold text-resort-charcoal hover:bg-stone-50 transition-colors shadow-2xs"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600" />
            Adjustment
          </button>
        )}

        {permissions.canManageStores && (
          <button
            onClick={onOpenManageStores}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-border text-xs font-semibold text-resort-charcoal hover:bg-stone-50 transition-colors shadow-2xs"
          >
            <Warehouse className="w-3.5 h-3.5 text-resort-forest" />
            Manage Physical Stores
          </button>
        )}
      </div>

      {/* Modal Dialog for Operations */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-border max-w-lg w-full overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-border flex justify-between items-center bg-stone-50/70">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-resort-forest/10 flex items-center justify-center text-resort-forest">
                  {activeModal === 'ISSUE' && <Send className="w-4 h-4" />}
                  {activeModal === 'TRANSFER' && <ArrowLeftRight className="w-4 h-4" />}
                  {activeModal === 'COUNT' && <ClipboardList className="w-4 h-4" />}
                  {activeModal === 'ADJUST' && <SlidersHorizontal className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base text-resort-charcoal">
                    {activeModal === 'ISSUE' && 'Department Stock Issue'}
                    {activeModal === 'TRANSFER' && 'Inter-Store Stock Transfer'}
                    {activeModal === 'COUNT' && 'Physical Stock Count Reconciliation'}
                    {activeModal === 'ADJUST' && 'Authoritative Stock Adjustment'}
                  </h3>
                  <p className="text-[11px] text-resort-stone">
                    {activeModal === 'ISSUE' && 'Issue inventory directly to kitchen, bar, or operations.'}
                    {activeModal === 'TRANSFER' && 'Transfer inventory between physical resort stores.'}
                    {activeModal === 'COUNT' && 'Record physical verified count and reconcile variance.'}
                    {activeModal === 'ADJUST' && 'Manually adjust stock balance with required audit reason.'}
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error / Success feedback */}
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

            {/* Form */}
            <form
              onSubmit={
                activeModal === 'ISSUE'
                  ? handleSubmitIssue
                  : activeModal === 'TRANSFER'
                  ? handleSubmitTransfer
                  : activeModal === 'ADJUST'
                  ? handleSubmitAdjust
                  : handleSubmitCount
              }
              className="p-4 space-y-3"
            >
              {/* Store Selector */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {activeModal === 'TRANSFER' ? 'Source Store *' : 'Store *'}
                </label>
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-border rounded-md bg-white focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
                  required
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Destination Store Selector (for Transfer only) */}
              {activeModal === 'TRANSFER' && (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Destination Store *</label>
                  <select
                    value={selectedDestStoreId}
                    onChange={(e) => setSelectedDestStoreId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-border rounded-md bg-white focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
                    required
                  >
                    {stores
                      .filter((s) => s.id !== selectedStoreId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Item Selector */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-stone-700">Inventory Item *</label>
                  <span className="text-[11px] text-stone-500">
                    On Hand: <strong className="text-resort-charcoal font-mono">{currentOnHand} {selectedItemObj?.baseUnit.code}</strong>
                  </span>
                </div>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-border rounded-md bg-white focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
                  required
                >
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({it.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Direction (for Adjustment only) */}
              {activeModal === 'ADJUST' && (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Adjustment Type *</label>
                  <div className="flex gap-3">
                    <label className="inline-flex items-center gap-1.5 text-xs text-stone-700">
                      <input
                        type="radio"
                        name="direction"
                        value="IN"
                        checked={direction === 'IN'}
                        onChange={() => setDirection('IN')}
                        className="text-resort-forest focus:ring-resort-forest"
                      />
                      Add Stock (IN)
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-stone-700">
                      <input
                        type="radio"
                        name="direction"
                        value="OUT"
                        checked={direction === 'OUT'}
                        onChange={() => setDirection('OUT')}
                        className="text-resort-forest focus:ring-resort-forest"
                      />
                      Reduce Stock (OUT)
                    </label>
                  </div>
                </div>
              )}

              {/* Quantity */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {activeModal === 'COUNT' ? 'Actual Physical Count *' : 'Quantity *'} (in {selectedItemObj?.baseUnit.code || 'units'})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-border rounded-md focus:ring-1 focus:ring-resort-forest focus:outline-hidden font-mono"
                />
              </div>

              {/* Department (for Issue only) */}
              {activeModal === 'ISSUE' && (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Target Department *</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-border rounded-md bg-white focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
                  >
                    <option value="Kitchen">Kitchen</option>
                    <option value="Bar">Bar</option>
                    <option value="Housekeeping">Housekeeping</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Front Desk">Front Desk</option>
                    <option value="Garden">Garden</option>
                    <option value="General Operations">General Operations</option>
                  </select>
                </div>
              )}

              {/* Remarks / Reason */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {activeModal === 'ADJUST' ? 'Reason / Explanation *' : 'Notes / Remarks'}
                </label>
                <input
                  type="text"
                  required={activeModal === 'ADJUST'}
                  placeholder={
                    activeModal === 'ADJUST'
                      ? 'e.g., Physical count discrepancy, packaging leak'
                      : 'Optional notes for audit trail'
                  }
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-border rounded-md focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
                />
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 pt-3 border-t border-border mt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-stone-50 text-stone-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-1.5 text-xs font-semibold bg-resort-forest text-white rounded-md hover:bg-resort-forest/90 transition-colors shadow-2xs disabled:opacity-50"
                >
                  {isPending ? 'Processing...' : 'Confirm & Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
