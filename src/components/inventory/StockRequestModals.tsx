'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, X, AlertCircle } from 'lucide-react';

export interface StockRequestLookupItem {
  id: string;
  name: string;
  code: string;
  baseUnitId: string;
  baseUnit: { id: string; name: string; code: string };
}

export interface StockRequestLookupStore {
  id: string;
  name: string;
  code: string;
  department: string | null;
}

export const DEPARTMENT_STORE_PRESET: Record<string, string> = {
  Kitchen: 'Kitchen Pantry (STORE-KIT)',
  Bar: 'Bar Store (STORE-BAR)',
  Housekeeping: 'Housekeeping Store (STORE-HK)',
  Maintenance: 'Maintenance Store (STORE-MAINT)',
  Garden: 'Garden Store (STORE-GARDEN)',
};

/**
 * 1. Create Stock Request Modal
 */
export function CreateStockRequestModal({
  isOpen,
  onClose,
  items,
  centralStockMap,
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: StockRequestLookupItem[];
  centralStockMap: Record<string, string>;
  onSubmit: (data: {
    department: string;
    reason: string;
    submitImmediately: boolean;
    items: Array<{ itemId: string; requestedQty: number; notes?: string }>;
  }) => Promise<void>;
  loading: boolean;
}) {
  const [department, setDepartment] = useState<'Kitchen' | 'Bar' | 'Housekeeping' | 'Maintenance' | 'Garden'>('Kitchen');
  const [reason, setReason] = useState('');
  const [submitImmediately, setSubmitImmediately] = useState(true);
  const [reqItems, setReqItems] = useState<Array<{ itemId: string; requestedQty: number; notes: string }>>([
    { itemId: items[0]?.id || '', requestedQty: 1, notes: '' },
  ]);

  if (!isOpen) return null;

  const addItemRow = () => {
    if (items.length === 0) return;
    const availableItems = items.filter((it) => !reqItems.some((r) => r.itemId === it.id));
    const nextItem = availableItems[0] || items[0];
    setReqItems([...reqItems, { itemId: nextItem.id, requestedQty: 1, notes: '' }]);
  };

  const removeItemRow = (index: number) => {
    if (reqItems.length === 1) return;
    setReqItems(reqItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, itemId: string) => {
    const updated = [...reqItems];
    updated[index] = { ...updated[index], itemId };
    setReqItems(updated);
  };

  const handleQtyChange = (index: number, qty: number) => {
    const updated = [...reqItems];
    updated[index] = { ...updated[index], requestedQty: Math.max(0.0001, qty) };
    setReqItems(updated);
  };

  const handleNotesChange = (index: number, notes: string) => {
    const updated = [...reqItems];
    updated[index] = { ...updated[index], notes };
    setReqItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      department,
      reason,
      submitImmediately,
      items: reqItems,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 shadow-xl max-h-[90vh] flex flex-col border border-border">
        <div className="flex justify-between items-center border-b pb-3 mb-4">
          <div>
            <h2 className="text-lg font-serif font-bold text-resort-charcoal">Create Stock Request</h2>
            <p className="text-xs text-resort-stone">
              Request raw ingredients or materials from Central Store for your department store.
            </p>
          </div>
          <button onClick={onClose} className="text-resort-stone hover:text-resort-charcoal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-resort-charcoal">Requesting Department</Label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value as any)}
                className="w-full mt-1 px-3 py-2 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-resort-forest"
              >
                <option value="Kitchen">Kitchen</option>
                <option value="Bar">Bar</option>
                <option value="Housekeeping">Housekeeping</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Garden">Garden</option>
              </select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-resort-charcoal">Target Destination Store</Label>
              <input
                type="text"
                disabled
                value={DEPARTMENT_STORE_PRESET[department]}
                className="w-full mt-1 px-3 py-2 text-xs border rounded-md bg-stone-100 font-mono text-resort-charcoal"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-resort-charcoal">Purpose / Justification (Optional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Weekend banquet prep, low pantry reserve"
              className="text-xs mt-1"
            />
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-2">
              <Label className="text-xs font-semibold text-resort-charcoal">Requested Items</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItemRow}
                className="h-7 text-xs border-resort-forest text-resort-forest hover:bg-resort-forest/10"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
              </Button>
            </div>

            <div className="space-y-3">
              {reqItems.map((itemRow, index) => {
                const currentItem = items.find((i) => i.id === itemRow.itemId);
                const centralStock = currentItem ? centralStockMap[currentItem.id] || '0.00' : '0.00';

                return (
                  <div key={index} className="flex gap-2 items-start border p-2.5 rounded-md bg-stone-50/60">
                    <div className="flex-1">
                      <Label className="text-[10px] text-resort-stone">Item</Label>
                      <select
                        value={itemRow.itemId}
                        onChange={(e) => handleItemChange(index, e.target.value)}
                        className="w-full mt-0.5 px-2 py-1.5 text-xs border rounded bg-white"
                      >
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name} ({i.code})
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-resort-stone mt-1">
                        Central Store Available: <span className="font-mono font-medium">{centralStock}</span>{' '}
                        {currentItem?.baseUnit.code}
                      </p>
                    </div>

                    <div className="w-28">
                      <Label className="text-[10px] text-resort-stone">
                        Qty ({currentItem?.baseUnit.code || 'Unit'})
                      </Label>
                      <Input
                        type="number"
                        min="0.0001"
                        step="any"
                        value={itemRow.requestedQty}
                        onChange={(e) => handleQtyChange(index, parseFloat(e.target.value) || 0)}
                        className="mt-0.5 text-xs"
                      />
                    </div>

                    <div className="flex-1">
                      <Label className="text-[10px] text-resort-stone">Line Note</Label>
                      <Input
                        value={itemRow.notes}
                        onChange={(e) => handleNotesChange(index, e.target.value)}
                        placeholder="Urgent, specific batch, etc."
                        className="mt-0.5 text-xs"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={reqItems.length === 1}
                      onClick={() => removeItemRow(index)}
                      className="mt-5 p-1 text-rose-500 hover:text-rose-700 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="submitImmediately"
              checked={submitImmediately}
              onChange={(e) => setSubmitImmediately(e.target.checked)}
              className="rounded border-gray-300 text-resort-forest focus:ring-resort-forest"
            />
            <Label htmlFor="submitImmediately" className="text-xs text-resort-charcoal cursor-pointer">
              Submit immediately for Store Manager approval (unchecked saves as Draft)
            </Label>
          </div>

          <div className="border-t pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || reqItems.length === 0}
              className="bg-resort-forest hover:bg-resort-forest/90 text-white text-xs"
            >
              {loading ? 'Creating...' : submitImmediately ? 'Submit Request' : 'Save Draft'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * 2. Approve Stock Request Modal (Allows full or partial approval)
 */
export function ApproveStockRequestModal({
  isOpen,
  onClose,
  request,
  centralStockMap,
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  request: any;
  centralStockMap: Record<string, string>;
  onSubmit: (data: {
    requestId: string;
    items: Array<{ itemId: string; approvedQty: number }>;
    notes?: string;
  }) => Promise<void>;
  loading: boolean;
}) {
  const [approvals, setApprovals] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');

  React.useEffect(() => {
    if (request?.items) {
      const initial: Record<string, number> = {};
      for (const it of request.items) {
        initial[it.inventoryItemId] = parseFloat(it.requestedQty.toString());
      }
      setApprovals(initial);
    }
  }, [request]);

  if (!isOpen || !request) return null;

  const handleApprovedQtyChange = (itemId: string, maxQty: number, val: number) => {
    const clamped = Math.max(0, Math.min(maxQty, val));
    setApprovals({ ...approvals, [itemId]: clamped });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(approvals).map(([itemId, approvedQty]) => ({
      itemId,
      approvedQty,
    }));
    await onSubmit({
      requestId: request.id,
      items,
      notes: notes || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-xl w-full p-6 shadow-xl max-h-[90vh] flex flex-col border border-border">
        <div className="flex justify-between items-center border-b pb-3 mb-4">
          <div>
            <h2 className="text-lg font-serif font-bold text-resort-charcoal">
              Approve Request #{request.requestNumber}
            </h2>
            <p className="text-xs text-resort-stone">
              Department: <span className="font-semibold">{request.department}</span> • Store:{' '}
              <span className="font-semibold">{request.destinationStore?.name}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-resort-stone hover:text-resort-charcoal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
          <p className="text-xs text-resort-stone">
            Verify requested quantities against available Central Store stock. You may partially approve any item by
            reducing the approved quantity. Setting an item to 0 will not issue it.
          </p>

          <div className="space-y-3">
            {request.items.map((it: any) => {
              const centralStock = centralStockMap[it.inventoryItemId] || '0.00';
              const requestedNum = parseFloat(it.requestedQty.toString());
              const approvedNum = approvals[it.inventoryItemId] ?? requestedNum;

              return (
                <div key={it.id} className="p-3 border rounded-md bg-stone-50/60 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-resort-charcoal">{it.inventoryItem?.name}</p>
                      <p className="text-[10px] text-resort-stone font-mono">
                        Code: {it.inventoryItem?.code} • Central Stock: {centralStock} {it.unit?.code}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-resort-stone text-[11px]">Requested</p>
                      <p className="font-mono font-bold text-resort-charcoal">
                        {requestedNum} {it.unit?.code}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-1 border-t">
                    <Label className="text-[11px] font-semibold text-resort-charcoal shrink-0">Approved Qty:</Label>
                    <Input
                      type="number"
                      min="0"
                      max={requestedNum}
                      step="any"
                      value={approvedNum}
                      onChange={(e) =>
                        handleApprovedQtyChange(it.inventoryItemId, requestedNum, parseFloat(e.target.value) || 0)
                      }
                      className="text-xs font-mono font-semibold w-32"
                    />
                    <span className="text-xs text-resort-stone">{it.unit?.code}</span>
                    {approvedNum < requestedNum && (
                      <span className="text-[11px] text-amber-700 font-medium ml-auto">
                        Partial ({((approvedNum / requestedNum) * 100).toFixed(0)}%)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <Label className="text-xs font-semibold text-resort-charcoal">Approval Notes (Optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Partial quantity approved due to limited warehouse reserve"
              className="text-xs mt-1"
            />
          </div>

          <div className="border-t pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
            >
              {loading ? 'Approving...' : 'Confirm Approval'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * 3. Reject Stock Request Modal (Requires mandatory reason)
 */
export function RejectStockRequestModal({
  isOpen,
  onClose,
  request,
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  request: any;
  onSubmit: (data: { requestId: string; rejectionReason: string }) => Promise<void>;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');

  if (!isOpen || !request) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    await onSubmit({
      requestId: request.id,
      rejectionReason: reason.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl flex flex-col border border-border">
        <div className="flex justify-between items-center border-b pb-3 mb-4">
          <div>
            <h2 className="text-base font-serif font-bold text-rose-800">Reject Request #{request.requestNumber}</h2>
            <p className="text-xs text-resort-stone">
              Department: {request.department} ({request.destinationStore?.name})
            </p>
          </div>
          <button onClick={onClose} className="text-resort-stone hover:text-resort-charcoal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-resort-charcoal">
              Rejection Reason <span className="text-rose-600">*</span>
            </Label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="State clear operational reason for rejection (e.g. insufficient quota, alternative item available)..."
              className="w-full mt-1 px-3 py-2 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>

          <div className="border-t pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !reason.trim()}
              className="bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold"
            >
              {loading ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * 4. Issue & Handover Modal (Single atomic handover on premises)
 */
export function IssueStockRequestModal({
  isOpen,
  onClose,
  request,
  centralStockMap,
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  request: any;
  centralStockMap: Record<string, string>;
  onSubmit: (data: {
    requestId: string;
    remarks?: string;
    items?: Array<{ itemId: string; issuedQty: number; shortReason?: string }>;
  }) => Promise<void>;
  loading: boolean;
}) {
  const [issuedQuantities, setIssuedQuantities] = useState<Record<string, number>>({});
  const [shortReasons, setShortReasons] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState('');

  React.useEffect(() => {
    if (request?.items) {
      const initialQty: Record<string, number> = {};
      for (const it of request.items) {
        initialQty[it.inventoryItemId] = parseFloat(it.approvedQty.toString());
      }
      setIssuedQuantities(initialQty);
    }
  }, [request]);

  if (!isOpen || !request) return null;

  const handleQtyChange = (itemId: string, maxQty: number, val: number) => {
    const clamped = Math.max(0, Math.min(maxQty, val));
    setIssuedQuantities({ ...issuedQuantities, [itemId]: clamped });
  };

  const handleReasonChange = (itemId: string, reason: string) => {
    setShortReasons({ ...shortReasons, [itemId]: reason });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(issuedQuantities).map(([itemId, issuedQty]) => ({
      itemId,
      issuedQty,
      shortReason: shortReasons[itemId] || undefined,
    }));
    await onSubmit({
      requestId: request.id,
      remarks: remarks || undefined,
      items,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 shadow-xl max-h-[90vh] flex flex-col border border-border">
        <div className="flex justify-between items-center border-b pb-3 mb-4">
          <div>
            <h2 className="text-lg font-serif font-bold text-resort-charcoal">
              Issue & Handover #{request.requestNumber}
            </h2>
            <p className="text-xs text-resort-stone">
              From: <span className="font-semibold">{request.sourceStore?.name}</span> → To:{' '}
              <span className="font-semibold">{request.destinationStore?.name}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-resort-stone hover:text-resort-charcoal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-900 mb-4 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Same-Premises Internal Handover:</span>
            <p className="mt-0.5">
              Executing this action immediately decreases Central Store stock, increases{' '}
              {request.destinationStore?.name} stock, and completes the transfer without in-transit delay.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="space-y-3">
            {request.items.map((it: any) => {
              const centralStock = centralStockMap[it.inventoryItemId] || '0.00';
              const approvedNum = parseFloat(it.approvedQty.toString());
              const issuedNum = issuedQuantities[it.inventoryItemId] ?? approvedNum;
              const isShort = issuedNum < approvedNum;

              return (
                <div key={it.id} className="p-3 border rounded-md bg-stone-50/60 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-resort-charcoal">{it.inventoryItem?.name}</p>
                      <p className="text-[10px] text-resort-stone font-mono">
                        Available in Central: <span className="font-semibold">{centralStock}</span> {it.unit?.code}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-resort-stone text-[11px]">Approved</p>
                      <p className="font-mono font-bold text-resort-charcoal">
                        {approvedNum} {it.unit?.code}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-1 border-t">
                    <Label className="text-[11px] font-semibold text-resort-charcoal shrink-0">Issued Qty:</Label>
                    <Input
                      type="number"
                      min="0"
                      max={approvedNum}
                      step="any"
                      value={issuedNum}
                      onChange={(e) =>
                        handleQtyChange(it.inventoryItemId, approvedNum, parseFloat(e.target.value) || 0)
                      }
                      className="text-xs font-mono font-semibold w-32"
                    />
                    <span className="text-xs text-resort-stone">{it.unit?.code}</span>
                  </div>

                  {isShort && (
                    <div className="pt-1">
                      <Label className="text-[10px] text-amber-800 font-semibold">Short Issue Reason</Label>
                      <Input
                        value={shortReasons[it.inventoryItemId] || ''}
                        onChange={(e) => handleReasonChange(it.inventoryItemId, e.target.value)}
                        placeholder="e.g. Stock count variance at Central Store shelf"
                        className="text-xs mt-0.5 bg-amber-50/60 border-amber-300"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <Label className="text-xs font-semibold text-resort-charcoal">Handover Remarks (Optional)</Label>
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Received by Chef Rahul in person at Central Store"
              className="text-xs mt-1"
            />
          </div>

          <div className="border-t pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-resort-forest hover:bg-resort-forest/90 text-white text-xs font-semibold"
            >
              {loading ? 'Processing Handover...' : 'Complete Issue & Handover'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
