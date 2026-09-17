'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, X, PackagePlus, Loader2 } from 'lucide-react';
import { createQuickInventoryItemAction } from '@/actions/procurement';

export interface LookupItem {
  id: string;
  name: string;
  code: string;
  standardCost: string;
  baseUnit: {
    id: string;
    name: string;
    code: string;
  };
}

export interface LookupCategory {
  id: string;
  name: string;
  code: string;
}

export interface LookupUnit {
  id: string;
  name: string;
  code: string;
}

export interface LookupStore {
  id: string;
  name: string;
  code: string;
  department: string | null;
}

export interface LookupVendor {
  id: string;
  name: string;
  companyName: string;
  vendorCode: string;
}

export function CreatePrModal({
  isOpen,
  onClose,
  items,
  categories = [],
  units = [],
  onSubmit,
  onItemCreated,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: LookupItem[];
  categories?: LookupCategory[];
  units?: LookupUnit[];
  onSubmit: (data: any) => Promise<void>;
  onItemCreated?: (item: LookupItem) => void;
  loading: boolean;
}) {
  const [department, setDepartment] = useState('F&B');
  const [notes, setNotes] = useState('');
  const [prItems, setPrItems] = useState<Array<{itemId: string; quantity: number; estimatedCost: number; notes: string;}>>([
    { itemId: items[0]?.id || '', quantity: 1, estimatedCost: parseFloat(items[0]?.standardCost || '0'), notes: '' },
  ]);

  // Quick item creation state
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [activeRowForQuickCreate, setActiveRowForQuickCreate] = useState<number>(0);
  const [quickName, setQuickName] = useState('');
  const [quickCategoryId, setQuickCategoryId] = useState('');
  const [quickUnitId, setQuickUnitId] = useState('');
  const [quickCost, setQuickCost] = useState('');
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSuccessMessage, setQuickSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const addItemRow = () => {
    setPrItems([...prItems, { itemId: items[0]?.id || '', quantity: 1, estimatedCost: parseFloat(items[0]?.standardCost || '0'), notes: '' }]);
  };

  const removeItemRow = (index: number) => {
    if (prItems.length === 1) return;
    setPrItems(prItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, itemId: string) => {
    const item = items.find((i: any) => i.id === itemId);
    const updated = [...prItems];
    updated[index] = {
      ...updated[index],
      itemId,
      estimatedCost: item ? parseFloat(item.standardCost) : 0,
    };
    setPrItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ department, notes, items: prItems });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 shadow-xl max-h-[90vh] flex flex-col border border-resort-sand">
        <div className="flex justify-between items-center pb-3 border-b border-resort-sand/50">
          <h3 className="font-serif text-lg font-bold text-resort-charcoal">Create Purchase Request</h3>
          <button onClick={onClose} className="text-resort-stone hover:text-resort-charcoal"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto py-4 flex-1">
          <div>
            <Label className="text-xs font-medium text-resort-charcoal">Requesting Department</Label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full mt-1 border border-resort-sand rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="F&B">Food & Beverage (Kitchen / Bar)</option>
              <option value="Housekeeping">Housekeeping & Linen</option>
              <option value="Maintenance">Engineering & Maintenance</option>
              <option value="Front Office">Front Desk & Operations</option>
              <option value="Spa">Wellness & Spa</option>
              <option value="General">General & Administrative</option>
            </select>
          </div>

          <div>
            <Label className="text-xs font-medium text-resort-charcoal">Justification / Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for procurement request..."
              className="mt-1 text-sm border-resort-sand"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-semibold text-resort-charcoal uppercase tracking-wider">Requested Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItemRow} className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add Item
              </Button>
            </div>

            <div className="space-y-2">
              {quickSuccessMessage && (
                <div className="p-2 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded flex items-center justify-between">
                  <span>{quickSuccessMessage}</span>
                  <button type="button" onClick={() => setQuickSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {prItems.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-resort-ivory/40 rounded border border-resort-sand/30">
                  <div className="flex-1 flex items-center gap-1.5">
                    <select
                      value={row.itemId}
                      onChange={(e) => handleItemChange(idx, e.target.value)}
                      className="w-full border border-resort-sand rounded p-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.code} - {i.name} ({i.baseUnit.code})
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setActiveRowForQuickCreate(idx);
                        setQuickName('');
                        setQuickCategoryId(categories[0]?.id || '');
                        setQuickUnitId(units[0]?.id || '');
                        setQuickCost('');
                        setQuickError(null);
                        setShowQuickCreate(true);
                      }}
                      className="h-7 px-2 text-[11px] whitespace-nowrap bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 flex items-center gap-1"
                      title="Create a new catalog item if not in the list"
                    >
                      <PackagePlus className="w-3.5 h-3.5 text-amber-700" />
                      + New
                    </Button>
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min="0.01"
                      step="any"
                      value={row.quantity}
                      onChange={(e) => {
                        const updated = [...prItems];
                        updated[idx].quantity = parseFloat(e.target.value) || 0;
                        setPrItems(updated);
                      }}
                      placeholder="Qty"
                      className="h-8 text-xs border-resort-sand bg-white"
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.estimatedCost}
                      onChange={(e) => {
                        const updated = [...prItems];
                        updated[idx].estimatedCost = parseFloat(e.target.value) || 0;
                        setPrItems(updated);
                      }}
                      placeholder="Est Cost"
                      className="h-8 text-xs border-resort-sand bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItemRow(idx)}
                    disabled={prItems.length === 1}
                    className="p-1 text-resort-stone hover:text-rose-600 disabled:opacity-30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* QUICK ITEM CREATION INLINE MODAL / SUB-FORM */}
          {showQuickCreate && (
            <div className="p-4 bg-amber-50/60 rounded-lg border border-amber-300 shadow-sm space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-amber-200">
                <div className="flex items-center gap-1.5">
                  <PackagePlus className="w-4 h-4 text-amber-700" />
                  <span className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                    Add New Inventory Item
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickCreate(false)}
                  disabled={quickSubmitting}
                  className="text-amber-800 hover:text-amber-950"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {quickError && (
                <div className="p-2 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded">
                  {quickError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-[11px] font-semibold text-resort-charcoal">
                    Item Name <span className="text-rose-600">*</span>
                  </Label>
                  <Input
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder="e.g. King Size Cotton Bedsheet, Hand Towel"
                    className="mt-1 text-xs border-resort-sand bg-white h-8"
                    disabled={quickSubmitting}
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-semibold text-resort-charcoal">
                    Category <span className="text-rose-600">*</span>
                  </Label>
                  <select
                    value={quickCategoryId}
                    onChange={(e) => setQuickCategoryId(e.target.value)}
                    className="w-full mt-1 border border-resort-sand rounded p-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    disabled={quickSubmitting}
                  >
                    {categories.length === 0 ? (
                      <option value="">No categories configured</option>
                    ) : (
                      categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <Label className="text-[11px] font-semibold text-resort-charcoal">
                    Base Unit <span className="text-rose-600">*</span>
                  </Label>
                  <select
                    value={quickUnitId}
                    onChange={(e) => setQuickUnitId(e.target.value)}
                    className="w-full mt-1 border border-resort-sand rounded p-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    disabled={quickSubmitting}
                  >
                    {units.length === 0 ? (
                      <option value="">No units configured</option>
                    ) : (
                      units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.code})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="col-span-2">
                  <Label className="text-[11px] font-semibold text-resort-charcoal">
                    Estimated Standard Cost
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={quickCost}
                    onChange={(e) => setQuickCost(e.target.value)}
                    placeholder="₹ 0.00"
                    className="mt-1 text-xs border-resort-sand bg-white h-8"
                    disabled={quickSubmitting}
                  />
                  <p className="text-[10px] text-resort-stone mt-1">
                    Optional. Used as the initial catalog cost estimate; actual purchasing/GRN costing follows the normal procurement workflow.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-amber-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowQuickCreate(false)}
                  disabled={quickSubmitting}
                  className="h-7 text-xs bg-white hover:bg-amber-100"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={quickSubmitting || !quickName.trim()}
                  onClick={async () => {
                    setQuickError(null);
                    if (!quickName.trim()) {
                      setQuickError('Item name is required');
                      return;
                    }
                    const selectedCat = quickCategoryId || categories[0]?.id;
                    if (!selectedCat) {
                      setQuickError('Please select a category');
                      return;
                    }
                    const selectedUnit = quickUnitId || units[0]?.id;
                    if (!selectedUnit) {
                      setQuickError('Please select a unit');
                      return;
                    }

                    setQuickSubmitting(true);
                    try {
                      const res = await createQuickInventoryItemAction({
                        name: quickName.trim(),
                        categoryId: selectedCat,
                        unitId: selectedUnit,
                        standardCost: quickCost !== '' ? parseFloat(quickCost) : undefined,
                      });

                      if (!res.success) {
                        setQuickError(res.error || 'Failed to create inventory item');
                        setQuickSubmitting(false);
                        return;
                      }

                      const created = res.item as LookupItem;
                      // 1. Notify parent console to append to items list
                      if (onItemCreated) {
                        onItemCreated(created);
                      }

                      // 2. Select in the active PR item row
                      const updated = [...prItems];
                      if (updated[activeRowForQuickCreate]) {
                        updated[activeRowForQuickCreate] = {
                          ...updated[activeRowForQuickCreate],
                          itemId: created.id,
                          estimatedCost: parseFloat(created.standardCost || '0'),
                        };
                        setPrItems(updated);
                      }

                      // 3. Close sub-form and show feedback
                      setShowQuickCreate(false);
                      setQuickSuccessMessage(`Inventory item "${created.name}" created and added to this request.`);
                      setTimeout(() => setQuickSuccessMessage(null), 6000);
                    } catch (err: any) {
                      setQuickError(err.message || 'Error creating item');
                    } finally {
                      setQuickSubmitting(false);
                    }
                  }}
                  className="h-7 text-xs bg-amber-800 hover:bg-amber-900 text-white flex items-center gap-1.5"
                >
                  {quickSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  {quickSubmitting ? 'Creating...' : 'Create Item'}
                </Button>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-resort-sand/50 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="text-xs bg-amber-700 hover:bg-amber-800 text-white">
              {loading ? 'Creating...' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
export function CreatePoModal({
  isOpen,
  onClose,
  vendors,
  items,
  initialPr,
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  vendors: LookupVendor[];
  items: LookupItem[];
  initialPr?: any;
  onSubmit: (data: any) => Promise<void>;
  loading: boolean;
}) {
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [poItems, setPoItems] = useState<Array<{itemId: string; orderedQuantity: number; unitPrice: number; taxRate: number}>>([
    { itemId: items[0]?.id || '', orderedQuantity: 1, unitPrice: parseFloat(items[0]?.standardCost || '0'), taxRate: 0 },
  ]);

  // When initialPr changes or modal opens, sync form state
  React.useEffect(() => {
    if (isOpen) {
      if (initialPr && initialPr.items && initialPr.items.length > 0) {
        setPoItems(
          initialPr.items.map((pi: any) => ({
            itemId: pi.itemId,
            orderedQuantity: parseFloat(pi.quantity) || 1,
            unitPrice: pi.estimatedCost ? parseFloat(pi.estimatedCost) : (pi.item?.standardCost ? parseFloat(pi.item.standardCost) : 0),
            taxRate: 0,
          }))
        );
        if (initialPr.notes) {
          setNotes(`Ref: ${initialPr.requestNumber} - ${initialPr.notes}`);
        } else {
          setNotes(`Ref PR: ${initialPr.requestNumber}`);
        }
      } else {
        setPoItems([
          { itemId: items[0]?.id || '', orderedQuantity: 1, unitPrice: parseFloat(items[0]?.standardCost || '0'), taxRate: 0 },
        ]);
        setNotes('');
      }
      if (vendors.length > 0 && !vendorId) {
        setVendorId(vendors[0].id);
      }
    }
  }, [isOpen, initialPr]);

  if (!isOpen) return null;

  const addItemRow = () => {
    setPoItems([...poItems, { itemId: items[0]?.id || '', orderedQuantity: 1, unitPrice: parseFloat(items[0]?.standardCost || '0'), taxRate: 0 }]);
  };

  const removeItemRow = (index: number) => {
    if (poItems.length === 1) return;
    setPoItems(poItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, itemId: string) => {
    const item = items.find((i: any) => i.id === itemId);
    const updated = [...poItems];
    updated[index] = {
      ...updated[index],
      itemId,
      unitPrice: item ? parseFloat(item.standardCost) : 0,
    };
    setPoItems(updated);
  };

  const calculateTotal = () => {
    return poItems.reduce((sum, row) => {
      const line = row.orderedQuantity * row.unitPrice * (1 + row.taxRate / 100);
      return sum + line;
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      vendorId,
      requestId: initialPr?.id || undefined,
      expectedDate: expectedDate || undefined,
      notes: notes || undefined,
      items: poItems,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 shadow-xl max-h-[90vh] flex flex-col border border-resort-sand">
        <div className="flex justify-between items-center pb-3 border-b border-resort-sand/50">
          <div>
            <h3 className="font-serif text-lg font-bold text-resort-charcoal">
              Issue Purchase Order (PO)
            </h3>
            {initialPr ? (
              <p className="text-xs text-amber-800 font-medium">
                Creating PO linked to approved PR: <span className="font-semibold">{initialPr.requestNumber}</span> ({initialPr.department})
              </p>
            ) : (
              <p className="text-xs text-resort-stone">Creates legally binding order. Note: Inventory is NOT updated until GRN.</p>
            )}
          </div>
          <button onClick={onClose} className="text-resort-stone hover:text-resort-charcoal"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto py-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Select Vendor *</Label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full mt-1 border border-resort-sand rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.vendorCode} - {v.name} ({v.companyName})
                  </option>
                ))}
              </select>
            </div>


            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Expected Delivery Date</Label>
              <Input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="mt-1 text-sm border-resort-sand"
              />
            </div>
          </div>


          <div>
            <Label className="text-xs font-medium text-resort-charcoal">Terms / Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery terms, contact person instructions..."
              className="mt-1 text-sm border-resort-sand"
            />
          </div>


          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-semibold text-resort-charcoal uppercase tracking-wider">Ordered Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItemRow} className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add Line
              </Button>
            </div>

            <div className="space-y-2">
              {poItems.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 p-2 bg-resort-ivory/40 rounded border border-resort-sand/30 items-center">
                  <div className="col-span-5">
                    <select
                      value={row.itemId}
                      onChange={(e) => handleItemChange(idx, e.target.value)}
                      className="w-full border border-resort-sand rounded p-1.5 text-xs bg-white"
                    >
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.code} - {i.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="0.01"
                      step="any"
                      value={row.orderedQuantity}
                      onChange={(e) => {
                        const updated = [...poItems];
                        updated[idx].orderedQuantity = parseFloat(e.target.value) || 0;
                        setPoItems(updated);
                      }}
                      placeholder="Qty"
                      className="h-8 text-xs border-resort-sand bg-white"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.unitPrice}
                      onChange={(e) => {
                        const updated = [...poItems];
                        updated[idx].unitPrice = parseFloat(e.target.value) || 0;
                        setPoItems(updated);
                      }}
                      placeholder="Price"
                      className="h-8 text-xs border-resort-sand bg-white"
                     />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={row.taxRate}
                      onChange={(e) => {
                        const updated = [...poItems];
                        updated[idx].taxRate = parseFloat(e.target.value) || 0;
                        setPoItems(updated);
                      }}
                      placeholder="Tax %"
                      className="h-8 text-xs border-resort-sand bg-white"
                    />
                  </div>
                  <div className="col-span-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      disabled={poItems.length === 1}
                      className="p-1 text-resort-stone hover:text-rose-600 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-resort-sand/50">
            <div className="text-sm text-resort-charcoal">
              Estimated Grand Total: <span className="font-bold text-base">₹{calculateTotal().toFixed(2)}</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="text-xs bg-blue-700 hover:bg-blue-800 text-white">
                {loading ? 'Creating...' : 'Issue Purchase Order'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 3. Create GRN Modal
// ----------------------------------------------------------------------
export function CreateGrnModal({
  isOpen,
  onClose,
  purchaseOrder,
  stores,
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrder: any;
  stores: LookupStore[];
  onSubmit: (data: any) => Promise<void>;
  loading: boolean;
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id || '');
  const [challanNumber, setChallanNumber] = useState('');
  const [challanDate, setChallanDate] = useState('');
  const [notes, setNotes] = useState('');

  const [grnItems, setGrnItems] = useState<
    Array<{
      itemId: string;
      itemName: string;
      orderedQty: number;
      previouslyReceivedQty: number;
      remainingQty: number;
      unitPrice: number;
      receivedQuantity: number;
      acceptedQuantity: number;
      rejectedQuantity: number;
      damagedQuantity: number;
      rejectionReason: string;
    }>
  >([]);

  React.useEffect(() => {
    if (purchaseOrder?.items) {
      setGrnItems(
        purchaseOrder.items.map((i: any) => {
          const ord = parseFloat(i.orderedQuantity || '0');
          const prevRecv = parseFloat(i.receivedQuantity || '0');
          const rem = Math.max(0, parseFloat(i.outstandingQuantity ?? i.remainingQuantity ?? (ord - prevRecv).toString()));
          return {
            itemId: i.itemId,
            itemName: i.itemName || i.item?.name || 'Item',
            orderedQty: ord,
            previouslyReceivedQty: prevRecv,
            remainingQty: rem,
            unitPrice: parseFloat(i.unitPrice || '0'),
            receivedQuantity: rem,
            acceptedQuantity: rem,
            rejectedQuantity: 0,
            damagedQuantity: 0,
            rejectionReason: '',
          };
        })
      );
    }
  }, [purchaseOrder]);

  if (!isOpen || !purchaseOrder) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      poId: purchaseOrder.id,
      storeId,
      challanNumber: challanNumber || undefined,
      challanDate: challanDate || undefined,
      notes: notes || undefined,
      items: grnItems.map((row) => {
        const acc = Number(row.acceptedQuantity) || 0;
        const rej = Number(row.rejectedQuantity) || 0;
        const dam = Number(row.damagedQuantity) || 0;
        const total = acc + rej + dam;
        return {
          itemId: row.itemId,
          receivedQuantity: total,
          acceptedQuantity: acc,
          rejectedQuantity: rej,
          damagedQuantity: dam,
          rejectionReason: row.rejectionReason || undefined,
          unitPrice: row.unitPrice,
        };
      }),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full p-6 shadow-xl max-h-[90vh] flex flex-col border border-resort-sand">
        <div className="flex justify-between items-center pb-3 border-b border-resort-sand/50">
          <div>
            <h3 className="font-serif text-lg font-bold text-resort-charcoal">
              Receive Goods (GRN) - {purchaseOrder.poNumber}
            </h3>
            <p className="text-xs text-resort-stone">
              Vendor: {purchaseOrder.vendor?.name || 'Vendor'}. Stock will be incremented ONLY for Accepted quantities.
            </p>
          </div>
          <button onClick={onClose} className="text-resort-stone hover:text-resort-charcoal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto py-4 flex-1">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Receiving Store / Warehouse *</Label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full mt-1 border border-resort-sand rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                required
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name} ({s.department || 'General'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Delivery Challan #</Label>
              <Input
                value={challanNumber}
                onChange={(e) => setChallanNumber(e.target.value)}
                placeholder="DC-12345"
                className="mt-1 text-sm border-resort-sand"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Challan Date</Label>
              <Input
                type="date"
                value={challanDate}
                onChange={(e) => setChallanDate(e.target.value)}
                className="mt-1 text-sm border-resort-sand"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-resort-charcoal uppercase tracking-wider">
              Inspection & Quantities
            </Label>

            <div className="space-y-3">
              {grnItems.map((row, idx) => (
                <div key={idx} className="p-3 bg-resort-ivory/40 rounded border border-resort-sand/30 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-resort-charcoal">{row.itemName}</span>
                    <div className="text-resort-stone space-x-2">
                      <span>Ordered: <strong className="text-resort-charcoal">{row.orderedQty}</strong></span>
                      <span>|</span>
                      <span>Already Recv: <strong className="text-blue-700">{row.previouslyReceivedQty}</strong></span>
                      <span>|</span>
                      <span>Remaining: <strong className="text-amber-700">{row.remainingQty}</strong></span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[10px] text-resort-stone">Receive Now (Max {row.remainingQty})</Label>
                      <Input
                        type="number"
                        min="0"
                        max={row.remainingQty}
                        step="any"
                        value={row.receivedQuantity}
                        onChange={(e) => {
                          const inputVal = parseFloat(e.target.value) || 0;
                          const clampedVal = Math.min(Math.max(0, inputVal), row.remainingQty);
                          const updated = [...grnItems];
                          updated[idx].receivedQuantity = clampedVal;
                          updated[idx].acceptedQuantity = Math.max(
                            0,
                            clampedVal - updated[idx].rejectedQuantity - updated[idx].damagedQuantity
                          );
                          setGrnItems(updated);
                        }}
                        className="h-8 text-xs border-resort-sand bg-white"
                      />
                    </div>

                    <div>
                      <Label className="text-[10px] text-emerald-700 font-semibold">Accepted (Stocked)</Label>
                      <Input
                        type="number"
                        min="0"
                        max={row.remainingQty}
                        step="any"
                        value={row.acceptedQuantity}
                        onChange={(e) => {
                          const inputVal = parseFloat(e.target.value) || 0;
                          const clampedVal = Math.min(Math.max(0, inputVal), row.remainingQty);
                          const updated = [...grnItems];
                          updated[idx].acceptedQuantity = clampedVal;
                          // Automatically update receivedQuantity to match total accounted (accepted + rejected + damaged)
                          updated[idx].receivedQuantity = Math.min(
                            row.remainingQty,
                            clampedVal + updated[idx].rejectedQuantity + updated[idx].damagedQuantity
                          );
                          setGrnItems(updated);
                        }}
                        className="h-8 text-xs border-emerald-300 bg-white"
                      />
                    </div>

                    <div>
                      <Label className="text-[10px] text-rose-700">Rejected Qty</Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={row.rejectedQuantity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = [...grnItems];
                          updated[idx].rejectedQuantity = val;
                          // Keep receivedQuantity in sync with sum
                          updated[idx].receivedQuantity = Math.min(
                            row.remainingQty,
                            updated[idx].acceptedQuantity + val + updated[idx].damagedQuantity
                          );
                          setGrnItems(updated);
                        }}
                        className="h-8 text-xs border-rose-300 bg-white"
                      />
                    </div>

                    <div>
                      <Label className="text-[10px] text-amber-700">Damaged Qty</Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={row.damagedQuantity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = [...grnItems];
                          updated[idx].damagedQuantity = val;
                          // Keep receivedQuantity in sync with sum
                          updated[idx].receivedQuantity = Math.min(
                            row.remainingQty,
                            updated[idx].acceptedQuantity + updated[idx].rejectedQuantity + val
                          );
                          setGrnItems(updated);
                        }}
                        className="h-8 text-xs border-amber-300 bg-white"
                      />
                    </div>
                  </div>

                  {(row.rejectedQuantity > 0 || row.damagedQuantity > 0) && (
                    <div>
                      <Input
                        placeholder="Reason for rejection / damage..."
                        value={row.rejectionReason}
                        onChange={(e) => {
                          const updated = [...grnItems];
                          updated[idx].rejectionReason = e.target.value;
                          setGrnItems(updated);
                        }}
                        className="h-7 text-xs border-rose-200 bg-white"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-resort-sand/50 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white">
              {loading ? 'Processing...' : 'Finalize GRN & Post Stock'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 4. Create Vendor Payment Modal
// ----------------------------------------------------------------------
export function CreatePaymentModal({
  isOpen,
  onClose,
  vendors,
  unpaidBills,
  initialVendorId,
  prefilledBill,
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  vendors: LookupVendor[];
  unpaidBills: any[];
  initialVendorId?: string;
  prefilledBill?: any | null;
  onSubmit: (data: any) => Promise<void>;
  loading: boolean;
}) {
  const [vendorId, setVendorId] = useState(initialVendorId || vendors[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [transactionReference, setTransactionReference] = useState('');
  const [notes, setNotes] = useState('');
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  // When modal opens, snap vendor + pre-fill allocation for the specific bill if provided
  useEffect(() => {
    if (isOpen) {
      const vid = initialVendorId || vendors[0]?.id || '';
      setVendorId(vid);
      if (prefilledBill) {
        // Pre-fill the full balance due for the specific bill
        setAllocations({ [prefilledBill.id]: parseFloat(prefilledBill.balanceDue) });
      } else {
        setAllocations({});
      }
    }
  }, [isOpen, initialVendorId, prefilledBill]);

  // BUG FIX: use b.vendor?.id (not b.vendorId which is undefined on bill objects)
  const vendorBills = unpaidBills.filter(
    (b) => (b.vendor?.id ?? b.vendorId) === vendorId && parseFloat(b.balanceDue) > 0
  );
  const totalAllocated = Object.values(allocations).reduce((a, b) => a + (b || 0), 0);

  if (!isOpen) return null;

  const handleAllocationChange = (billId: string, val: number, maxBalance: number) => {
    const clamped = Math.min(Math.max(0, val), maxBalance);
    setAllocations({ ...allocations, [billId]: clamped });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const allocArray = Object.entries(allocations)
      .filter(([_, amt]) => amt > 0)
      .map(([purchaseBillId, amountAllocated]) => ({ purchaseBillId, amountAllocated }));

    if (allocArray.length === 0) {
      alert('Please allocate payment to at least one bill.');
      return;
    }

    await onSubmit({
      vendorId,
      amount: totalAllocated,
      paymentMethod,
      transactionReference: transactionReference || undefined,
      notes: notes || undefined,
      allocations: allocArray,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 shadow-xl max-h-[90vh] flex flex-col border border-resort-sand">
        <div className="flex justify-between items-center pb-3 border-b border-resort-sand/50">
          <div>
            <h3 className="font-serif text-lg font-bold text-resort-charcoal">
              {prefilledBill ? `Pay Bill — ${prefilledBill.vendorBillNo}` : 'Record Vendor Payment'}
            </h3>
            <p className="text-xs text-resort-stone">
              {prefilledBill
                ? 'Confirm payment details for this bill.'
                : 'Applies atomic payment against outstanding vendor bills.'}
            </p>
          </div>
          <button onClick={onClose} className="text-resort-stone hover:text-resort-charcoal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto py-4 flex-1">

          {/* Focused bill summary banner (shown when paying a specific bill) */}
          {prefilledBill && (
            <div className="p-3 bg-emerald-50 rounded border border-emerald-200 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">Bill Being Paid</div>
              <div className="flex justify-between text-xs">
                <span className="text-resort-stone">Internal Bill #</span>
                <span className="font-semibold text-resort-charcoal">{prefilledBill.billNumber}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-resort-stone">Vendor Invoice #</span>
                <span className="font-bold text-resort-charcoal">{prefilledBill.vendorBillNo}</span>
              </div>
              {prefilledBill.po && (
                <div className="flex justify-between text-xs">
                  <span className="text-resort-stone">Linked PO</span>
                  <span className="font-medium text-indigo-700">{prefilledBill.po.poNumber}</span>
                </div>
              )}
              <div className="flex justify-between text-xs border-t border-emerald-200 pt-1.5 mt-1">
                <span className="text-resort-stone">Total Invoice</span>
                <span className="font-medium">₹{prefilledBill.totalAmount}</span>
              </div>
              <div className="flex justify-between text-sm font-bold">
                <span className="text-rose-700">Balance Due</span>
                <span className="text-rose-700">₹{prefilledBill.balanceDue}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Vendor *</Label>
              {prefilledBill ? (
                /* Read-only vendor display when paying a specific bill */
                <div className="mt-1 border border-resort-sand/60 rounded-md p-2 text-sm bg-resort-ivory/40 text-resort-charcoal font-medium">
                  {prefilledBill.vendor?.name} ({prefilledBill.vendor?.companyName})
                </div>
              ) : (
                <select
                  value={vendorId}
                  onChange={(e) => { setVendorId(e.target.value); setAllocations({}); }}
                  className="w-full mt-1 border border-resort-sand rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.companyName})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Payment Method *</Label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full mt-1 border border-resort-sand rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="BANK_TRANSFER">Bank Transfer / NEFT / RTGS</option>
                <option value="UPI">UPI / QR Code</option>
                <option value="CARD">Corporate Debit/Credit Card</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CASH">Petty Cash</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Transaction Ref / UTR #</Label>
              <Input
                value={transactionReference}
                onChange={(e) => setTransactionReference(e.target.value)}
                placeholder="UTR20260315..."
                className="mt-1 text-sm border-resort-sand"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Notes / Memo</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Cleared via HDFC Current A/c"
                className="mt-1 text-sm border-resort-sand"
              />
            </div>
          </div>

          {/* Allocation section — focused single-bill or full list */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-resort-charcoal uppercase tracking-wider">
              {prefilledBill ? 'Payment Amount' : `Allocate Across Outstanding Bills (${vendorBills.length})`}
            </Label>

            {prefilledBill ? (
              /* Single-bill focused allocation */
              <div className="flex items-center justify-between p-3 bg-resort-ivory/40 rounded border border-resort-sand/30">
                <div>
                  <div className="text-xs font-bold text-resort-charcoal">
                    {prefilledBill.vendorBillNo} ({prefilledBill.billNumber})
                  </div>
                  <div className="text-[11px] text-resort-stone">
                    Balance Due: <span className="text-rose-700 font-semibold">₹{prefilledBill.balanceDue}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAllocations({ [prefilledBill.id]: parseFloat(prefilledBill.balanceDue) })}
                    className="h-7 text-[10px]"
                  >
                    Pay Full
                  </Button>
                  <Input
                    type="number"
                    min="0"
                    max={parseFloat(prefilledBill.balanceDue)}
                    step="0.01"
                    value={allocations[prefilledBill.id] || ''}
                    onChange={(e) =>
                      handleAllocationChange(prefilledBill.id, parseFloat(e.target.value) || 0, parseFloat(prefilledBill.balanceDue))
                    }
                    placeholder="0.00"
                    className="w-28 h-8 text-xs text-right border-resort-sand bg-white"
                  />
                </div>
              </div>
            ) : vendorBills.length === 0 ? (
              <p className="text-xs text-resort-stone italic p-3 bg-resort-ivory/50 rounded">
                No unpaid bills found for this vendor.
              </p>
            ) : (
              <div className="space-y-2">
                {vendorBills.map((bill) => {
                  const balance = parseFloat(bill.balanceDue);
                  return (
                    <div
                      key={bill.id}
                      className="flex items-center justify-between p-2.5 bg-resort-ivory/40 rounded border border-resort-sand/30"
                    >
                      <div>
                        <div className="text-xs font-bold text-resort-charcoal">
                          {bill.vendorBillNo} ({bill.billNumber})
                        </div>
                        <div className="text-[11px] text-resort-stone">
                          Total: ₹{bill.totalAmount} | Balance: <span className="text-rose-700 font-semibold">₹{bill.balanceDue}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAllocationChange(bill.id, balance, balance)}
                          className="h-7 text-[10px]"
                        >
                          Pay Full
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          max={balance}
                          step="0.01"
                          value={allocations[bill.id] || ''}
                          onChange={(e) =>
                            handleAllocationChange(bill.id, parseFloat(e.target.value) || 0, balance)
                          }
                          placeholder="0.00"
                          className="w-28 h-8 text-xs text-right border-resort-sand bg-white"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-resort-sand/50">
            <div className="text-sm text-resort-charcoal">
              Total Payment: <span className="font-bold text-base text-emerald-700">₹{totalAllocated.toFixed(2)}</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || totalAllocated <= 0}
                className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
              >
                {loading
                  ? 'Recording...'
                  : prefilledBill
                  ? `Confirm Payment — ₹${totalAllocated.toFixed(2)}`
                  : 'Disburse & Record Payment'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 4b. Purchase Bill Detail Modal (Read-Only)
// ----------------------------------------------------------------------
export function PurchaseBillDetailModal({
  isOpen,
  onClose,
  bill,
  onPay,
}: {
  isOpen: boolean;
  onClose: () => void;
  bill: any | null;
  onPay?: (bill: any) => void;
}) {
  if (!isOpen || !bill) return null;

  const statusColors: Record<string, string> = {
    RECEIVED: 'bg-blue-50 text-blue-800 border-blue-300',
    PENDING_VERIFICATION: 'bg-amber-50 text-amber-800 border-amber-300',
    VERIFIED: 'bg-indigo-50 text-indigo-800 border-indigo-300',
    PARTIALLY_PAID: 'bg-sky-50 text-sky-800 border-sky-300',
    PAID: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    OVERDUE: 'bg-rose-50 text-rose-800 border-rose-300',
    CANCELLED: 'bg-gray-100 text-gray-500 border-gray-300',
  };

  const balanceDue = parseFloat(bill.balanceDue);
  const totalAmount = parseFloat(bill.totalAmount);
  const paidAmount = parseFloat(bill.paidAmount);
  const paidPct = totalAmount > 0 ? Math.min(100, (paidAmount / totalAmount) * 100) : 0;

  const fmt = (val: string | number) =>
    `₹${parseFloat(String(val)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full shadow-xl max-h-[90vh] flex flex-col border border-resort-sand">
        {/* Header */}
        <div className="flex justify-between items-start p-5 border-b border-resort-sand/50 bg-resort-ivory/30">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-lg font-bold text-resort-charcoal">
                Purchase Bill — {bill.billNumber}
              </h3>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase ${
                  statusColors[bill.status] || 'bg-gray-100 text-gray-600 border-gray-300'
                }`}
              >
                {bill.status.replace(/_/g, ' ')}
              </span>
              {bill.isOverdue && balanceDue > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded border uppercase bg-rose-50 text-rose-800 border-rose-300">
                  OVERDUE
                </span>
              )}
            </div>
            <p className="text-xs text-resort-stone mt-0.5">Read-only view — confirm details before payment</p>
          </div>
          <button onClick={onClose} className="text-resort-stone hover:text-resort-charcoal mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Vendor + Invoice Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-resort-stone">Vendor</h4>
              <div>
                <div className="text-sm font-bold text-resort-charcoal">{bill.vendor?.name}</div>
                <div className="text-xs text-resort-stone">{bill.vendor?.companyName}</div>
                {bill.vendor?.paymentTermsDays != null && (
                  <div className="text-xs text-resort-stone mt-0.5">
                    Credit Terms: {bill.vendor.paymentTermsDays} days
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-resort-stone">Invoice Details</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-resort-stone">Vendor Invoice #</span>
                  <span className="font-bold text-resort-charcoal">{bill.vendorBillNo}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-resort-stone">Bill Date</span>
                  <span className="font-medium">{new Date(bill.billDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-resort-stone">Due Date</span>
                  <span className={`font-medium ${bill.isOverdue && balanceDue > 0 ? 'text-rose-700 font-bold' : ''}`}>
                    {new Date(bill.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Linked Documents */}
          {(bill.po || bill.grn) && (
            <div className="p-3 bg-indigo-50/40 rounded border border-indigo-100 space-y-1">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 mb-2">Linked Documents</h4>
              {bill.po && (
                <div className="flex justify-between text-xs">
                  <span className="text-resort-stone">Purchase Order</span>
                  <span className="font-semibold text-indigo-800">{bill.po.poNumber}</span>
                </div>
              )}
              {bill.grn && (
                <div className="flex justify-between text-xs">
                  <span className="text-resort-stone">Goods Receipt (GRN)</span>
                  <span className="font-semibold text-indigo-800">{bill.grn.grnNumber}</span>
                </div>
              )}
            </div>
          )}

          {/* Amount Breakdown */}
          <div className="border border-resort-sand rounded overflow-hidden">
            <div className="p-2.5 bg-resort-ivory/40 border-b border-resort-sand/50">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-resort-stone">Amount Breakdown</h4>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-resort-stone">Subtotal</span>
                <span className="font-medium">{fmt(bill.subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-resort-stone">Tax (GST / VAT)</span>
                <span className="font-medium">{fmt(bill.taxAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-resort-sand/50 pt-2 mt-1">
                <span className="text-resort-charcoal">Total Invoice Amount</span>
                <span className="text-resort-charcoal">{fmt(bill.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-resort-stone">Amount Paid</span>
                <span className="font-medium text-emerald-700">{fmt(bill.paidAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-resort-sand/50 pt-2 mt-1">
                <span className={balanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'}>Balance Due</span>
                <span className={balanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'}>{fmt(bill.balanceDue)}</span>
              </div>

              {/* Payment progress bar */}
              {totalAmount > 0 && (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-resort-stone mb-1">
                    <span>Payment Progress</span>
                    <span>{paidPct.toFixed(0)}% paid</span>
                  </div>
                  <div className="w-full h-2 bg-resort-sand/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${paidPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payment History */}
          {bill.allocations && bill.allocations.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-resort-stone mb-2">
                Payment History ({bill.allocations.length})
              </h4>
              <div className="space-y-1.5">
                {bill.allocations.map((alloc: any, i: number) => (
                  <div
                    key={alloc.id || i}
                    className="flex items-center justify-between p-2.5 bg-emerald-50/40 rounded border border-emerald-100"
                  >
                    <div>
                      <div className="text-xs font-semibold text-resort-charcoal">{alloc.paymentNumber}</div>
                      <div className="text-[10px] text-resort-stone">
                        {new Date(alloc.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {' · '}
                        {alloc.paymentMethod?.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">{fmt(alloc.amountAllocated)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bill.allocations?.length === 0 && (
            <p className="text-xs text-resort-stone italic">No payments recorded yet for this bill.</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-resort-sand/50 flex justify-between items-center bg-resort-ivory/20">
          <Button variant="outline" onClick={onClose} className="text-xs border-resort-sand">
            Close
          </Button>
          {balanceDue > 0 && onPay && (
            <Button
              onClick={() => { onClose(); onPay(bill); }}
              className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              Pay This Bill — {fmt(bill.balanceDue)} Due
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 5. Create Purchase Bill Modal
// ----------------------------------------------------------------------
export function CreateBillModal({
  isOpen,
  onClose,
  vendors,
  purchaseOrders,
  goodsReceipts = [],
  initialPo,
  initialGrn,
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  vendors: LookupVendor[];
  purchaseOrders: any[];
  goodsReceipts?: any[];
  initialPo?: any;
  initialGrn?: any;
  onSubmit: (data: any) => Promise<void>;
  loading: boolean;
}) {
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [vendorBillNo, setVendorBillNo] = useState('');
  const [poId, setPoId] = useState('');
  const [grnId, setGrnId] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [subtotal, setSubtotal] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  // Sync state when modal opens with initialPo or initialGrn
  React.useEffect(() => {
    if (isOpen) {
      if (initialGrn) {
        setVendorId(initialGrn.vendorId || initialGrn.vendor?.id || vendors[0]?.id || '');
        setGrnId(initialGrn.id);
        const linkedPoId = initialGrn.poId || initialGrn.po?.id || '';
        setPoId(linkedPoId);
        
        // Try calculating total from GRN items or PO
        const calcSub = initialGrn.items?.reduce(
          (sum: number, it: any) => sum + (parseFloat(it.acceptedQuantity || 0) * parseFloat(it.unitPrice || 0)),
          0
        ) || 0;
        setSubtotal(calcSub);
        setTaxAmount(0);
        setTotalAmount(calcSub);
      } else if (initialPo) {
        setVendorId(initialPo.vendorId || initialPo.vendor?.id || vendors[0]?.id || '');
        setPoId(initialPo.id);
        setGrnId('');
        const sub = parseFloat(initialPo.subtotal || '0');
        const tax = parseFloat(initialPo.taxAmount || '0');
        const tot = parseFloat(initialPo.totalAmount || '0');
        setSubtotal(sub);
        setTaxAmount(tax);
        setTotalAmount(tot);
      } else {
        setVendorId(vendors[0]?.id || '');
        setVendorBillNo('');
        setPoId('');
        setGrnId('');
        setSubtotal(0);
        setTaxAmount(0);
        setTotalAmount(0);
      }
    }
  }, [isOpen, initialPo, initialGrn]);

  const vendorPos = purchaseOrders.filter(
    (po) => po.vendorId === vendorId && ['ISSUED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED'].includes(po.status)
  );

  const vendorGrns = goodsReceipts.filter(
    (grn) => grn.vendorId === vendorId || grn.vendor?.id === vendorId
  );

  const handlePoSelect = (selectedPoId: string) => {
    setPoId(selectedPoId);
    const selected = purchaseOrders.find((p) => p.id === selectedPoId);
    if (selected) {
      const sub = parseFloat(selected.subtotal || '0');
      const tax = parseFloat(selected.taxAmount || '0');
      const tot = parseFloat(selected.totalAmount || '0');
      setSubtotal(sub);
      setTaxAmount(tax);
      setTotalAmount(tot);
    }
  };

  const handleGrnSelect = (selectedGrnId: string) => {
    setGrnId(selectedGrnId);
    const selected = goodsReceipts.find((g) => g.id === selectedGrnId);
    if (selected) {
      if (selected.poId || selected.po?.id) {
        setPoId(selected.poId || selected.po?.id);
      }
      const calcSub = selected.items?.reduce(
        (sum: number, it: any) => sum + (parseFloat(it.acceptedQuantity || 0) * parseFloat(it.unitPrice || 0)),
        0
      ) || 0;
      setSubtotal(calcSub);
      setTaxAmount(0);
      setTotalAmount(calcSub);
    }
  };

  const handleSubtotalChange = (val: number) => {
    setSubtotal(val);
    setTotalAmount(val + taxAmount);
  };

  const handleTaxChange = (val: number) => {
    setTaxAmount(val);
    setTotalAmount(subtotal + val);
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      vendorId,
      vendorBillNo,
      poId: poId || undefined,
      grnId: grnId || undefined,
      billDate,
      dueDate,
      subtotal,
      taxAmount,
      totalAmount,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-xl w-full p-6 shadow-xl max-h-[90vh] flex flex-col border border-resort-sand">
        <div className="flex justify-between items-center pb-3 border-b border-resort-sand/50">
          <div>
            <h3 className="font-serif text-lg font-bold text-resort-charcoal">Enter Purchase Bill</h3>
            <p className="text-xs text-resort-stone">
              Registers vendor invoice in accounts payable with balance tracking.
            </p>
          </div>
          <button onClick={onClose} className="text-resort-stone hover:text-resort-charcoal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto py-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Vendor *</Label>
              <select
                value={vendorId}
                onChange={(e) => {
                  setVendorId(e.target.value);
                  setPoId('');
                }}
                className="w-full mt-1 border border-resort-sand rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                required
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.companyName})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Vendor Invoice / Bill # *</Label>
              <Input
                value={vendorBillNo}
                onChange={(e) => setVendorBillNo(e.target.value)}
                placeholder="INV-2026-0089"
                className="mt-1 text-sm border-resort-sand"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Linked Goods Receipt (GRN)</Label>
              <select
                value={grnId}
                onChange={(e) => handleGrnSelect(e.target.value)}
                className="w-full mt-1 border border-resort-sand rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="">-- Direct PO / Non-GRN Bill --</option>
                {grnId && !vendorGrns.some((g) => g.id === grnId) && (
                  <option key={grnId} value={grnId}>
                    {initialGrn?.grnNumber || 'Selected GRN'} {initialGrn?.po?.poNumber ? `(PO: ${initialGrn.po.poNumber})` : ''}
                  </option>
                )}
                {vendorGrns.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.grnNumber} {g.po?.poNumber ? `(PO: ${g.po.poNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Linked Purchase Order (PO)</Label>
              <select
                value={poId}
                onChange={(e) => handlePoSelect(e.target.value)}
                className="w-full mt-1 border border-resort-sand rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="">-- Standalone Invoice / Direct Bill --</option>
                {poId && !vendorPos.some((p) => p.id === poId) && (
                  <option key={poId} value={poId}>
                    {initialPo?.poNumber || initialGrn?.po?.poNumber || (goodsReceipts.find((g) => g.id === grnId)?.po?.poNumber) || 'Linked PO'}
                  </option>
                )}
                {vendorPos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.poNumber} (Status: {p.status} - Total: ₹{p.totalAmount})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Bill / Invoice Date *</Label>
              <Input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="mt-1 text-sm border-resort-sand"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Due Date *</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 text-sm border-resort-sand"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 p-3 bg-resort-ivory/40 rounded border border-resort-sand/30">
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Subtotal (₹) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={subtotal}
                onChange={(e) => handleSubtotalChange(parseFloat(e.target.value) || 0)}
                className="mt-1 text-sm border-resort-sand bg-white"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Tax (₹)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={taxAmount}
                onChange={(e) => handleTaxChange(parseFloat(e.target.value) || 0)}
                className="mt-1 text-sm border-resort-sand bg-white"
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-resort-charcoal">Total Amount (₹) *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(parseFloat(e.target.value) || 0)}
                className="mt-1 text-sm font-bold border-purple-300 bg-white"
                required
              />
            </div>
          </div>

          <div className="pt-3 border-t border-resort-sand/50 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="text-xs bg-purple-700 hover:bg-purple-800 text-white">
              {loading ? 'Creating...' : 'Record Purchase Bill'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 6. Create Vendor Modal
// ----------------------------------------------------------------------
export function CreateVendorModal({
  isOpen,
  onClose,
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      name,
      companyName,
      contactPerson: contactPerson || undefined,
      phone,
      email: email || undefined,
      address: address || undefined,
      gstin: gstin || undefined,
      pan: pan || undefined,
      paymentTermsDays,
      bankName: bankName || undefined,
      bankAccountNumber: bankAccountNumber || undefined,
      bankIfsc: bankIfsc || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 shadow-xl max-h-[90vh] flex flex-col border border-resort-sand">
        <div className="flex justify-between items-center pb-3 border-b border-resort-sand/50">
          <div>
            <h3 className="font-serif text-lg font-bold text-resort-charcoal">Onboard New Vendor</h3>
            <p className="text-xs text-resort-stone">
              System generates a unique sequential VND number with statutory tax details.
            </p>
          </div>
          <button onClick={onClose} className="text-resort-stone hover:text-resort-charcoal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto py-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Trade / Display Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fresh Valley Farms"
                className="mt-1 text-sm border-resort-sand"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Registered Company Name *</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Fresh Valley Agro LLP"
                className="mt-1 text-sm border-resort-sand"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Phone Number *</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="mt-1 text-sm border-resort-sand"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Contact Person</Label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Mr. Rajesh Kumar"
                className="mt-1 text-sm border-resort-sand"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Email Address</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="accounts@vendor.com"
                className="mt-1 text-sm border-resort-sand"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-resort-charcoal">Registered Business Address</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Plot No 42, MIDC Industrial Area..."
              className="mt-1 text-sm border-resort-sand"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">GSTIN</Label>
              <Input
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="27ABCDE1234F1Z5"
                className="mt-1 text-sm border-resort-sand uppercase"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">PAN</Label>
              <Input
                value={pan}
                onChange={(e) => setPan(e.target.value)}
                placeholder="ABCDE1234F"
                className="mt-1 text-sm border-resort-sand uppercase"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Credit Terms (Days)</Label>
              <Input
                type="number"
                min="0"
                max="365"
                value={paymentTermsDays}
                onChange={(e) => setPaymentTermsDays(parseInt(e.target.value) || 0)}
                className="mt-1 text-sm border-resort-sand"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 p-3 bg-resort-ivory/40 rounded border border-resort-sand/30">
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Bank Name</Label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="HDFC Bank"
                className="mt-1 text-sm border-resort-sand bg-white"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">Bank Account #</Label>
              <Input
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="50200012345678"
                className="mt-1 text-sm border-resort-sand bg-white"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-resort-charcoal">IFSC Code</Label>
              <Input
                value={bankIfsc}
                onChange={(e) => setBankIfsc(e.target.value)}
                placeholder="HDFC0001234"
                className="mt-1 text-sm border-resort-sand bg-white uppercase"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-resort-sand/50 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="text-xs bg-resort-charcoal hover:bg-black text-white">
              {loading ? 'Creating...' : 'Register Vendor'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 7. Purchase Order Details & Reconciliation Modal
// ----------------------------------------------------------------------
export function PurchaseOrderDetailModal({
  isOpen,
  onClose,
  details,
  loading,
  onReceiveGoods,
  onEnterBill,
}: {
  isOpen: boolean;
  onClose: () => void;
  details: any;
  loading: boolean;
  onReceiveGoods?: (po: any) => void;
  onEnterBill?: (po: any, grn?: any) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full p-6 shadow-xl max-h-[92vh] flex flex-col border border-resort-sand">
        <div className="flex justify-between items-center pb-3 border-b border-resort-sand/50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-lg font-bold text-resort-charcoal">
                Purchase Order Details - {details?.poNumber || '...'}
              </h3>
              {details && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-blue-50 text-blue-800 border border-blue-200">
                  {details.status}
                </span>
              )}
            </div>
            <p className="text-xs text-resort-stone">
              Vendor: {details?.vendor?.name} ({details?.vendor?.companyName}) • Created:{' '}
              {details?.createdAt ? new Date(details.createdAt).toLocaleDateString() : 'N/A'}
            </p>
          </div>
          <button onClick={onClose} className="text-resort-stone hover:text-resort-charcoal">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading || !details ? (
          <div className="flex-1 flex items-center justify-center py-12 text-resort-stone text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading reconciliation...
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto py-4 flex-1">
            {/* 1. Reconciliation Summary Cards */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 bg-resort-ivory/50 rounded border border-resort-sand/40">
                <div className="text-[10px] uppercase font-semibold text-resort-stone">Ordered vs Recv</div>
                <div className="text-sm font-bold text-resort-charcoal mt-1">
                  {details.receivedQty} / {details.orderedQty}
                </div>
                <div className="text-[11px] text-amber-700 font-medium">
                  Remaining: {details.remainingReceivable}
                </div>
              </div>

              <div className="p-3 bg-resort-ivory/50 rounded border border-resort-sand/40">
                <div className="text-[10px] uppercase font-semibold text-resort-stone">PO Total Value</div>
                <div className="text-sm font-bold text-resort-charcoal mt-1">₹{details.poTotalAmount}</div>
                <div className="text-[11px] text-resort-stone">Commercial commitment</div>
              </div>

              <div className="p-3 bg-resort-ivory/50 rounded border border-resort-sand/40">
                <div className="text-[10px] uppercase font-semibold text-resort-stone">Billed vs Unbilled</div>
                <div className="text-sm font-bold text-purple-900 mt-1">₹{details.billedAmount}</div>
                <div className="text-[11px] text-resort-stone">Unbilled: ₹{details.unbilledAmount}</div>
              </div>

              <div className="p-3 bg-resort-ivory/50 rounded border border-resort-sand/40">
                <div className="text-[10px] uppercase font-semibold text-resort-stone">Paid vs Outstanding</div>
                <div className="text-sm font-bold text-emerald-800 mt-1">₹{details.paidAmount}</div>
                <div className="text-[11px] text-rose-700 font-medium">Due: ₹{details.outstandingPayable}</div>
              </div>
            </div>

            {/* 2. PO Line Items */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-resort-charcoal uppercase tracking-wider">
                Order Line Items
              </h4>
              <div className="border border-resort-sand/50 rounded overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-resort-ivory/60 text-resort-stone font-medium">
                    <tr>
                      <th className="p-2">Item</th>
                      <th className="p-2">Ordered</th>
                      <th className="p-2">Received</th>
                      <th className="p-2">Remaining</th>
                      <th className="p-2 text-right">Unit Price</th>
                      <th className="p-2 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-resort-sand/30">
                    {details.items?.map((it: any) => (
                      <tr key={it.id}>
                        <td className="p-2 font-medium text-resort-charcoal">{it.itemName} ({it.itemCode})</td>
                        <td className="p-2">{it.orderedQuantity} {it.unitName}</td>
                        <td className="p-2 text-emerald-800 font-medium">{it.receivedQuantity} {it.unitName}</td>
                        <td className="p-2 text-amber-700 font-medium">{it.remainingReceivable} {it.unitName}</td>
                        <td className="p-2 text-right">₹{it.unitPrice}</td>
                        <td className="p-2 text-right font-semibold">₹{it.lineTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Deliveries / Goods Receipts */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-semibold text-resort-charcoal uppercase tracking-wider">
                  Deliveries & Goods Receipts ({details.deliveries?.length || 0})
                </h4>
                {['ISSUED', 'PARTIALLY_RECEIVED'].includes(details.status) && onReceiveGoods && (
                  <Button
                    size="sm"
                    onClick={() => onReceiveGoods(details)}
                    className="h-6 text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white"
                  >
                    Receive Another Batch
                  </Button>
                )}
              </div>
              {details.deliveries?.length === 0 ? (
                <div className="p-4 bg-stone-50 rounded border border-dashed border-resort-sand text-center text-xs text-resort-stone">
                  No deliveries recorded yet.
                </div>
              ) : (
                <div className="border border-resort-sand/50 rounded overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-resort-ivory/60 text-resort-stone font-medium">
                      <tr>
                        <th className="p-2">GRN #</th>
                        <th className="p-2">Date</th>
                        <th className="p-2">Store</th>
                        <th className="p-2">Accepted Qty</th>
                        <th className="p-2">Challan #</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Linked Bill</th>
                        <th className="p-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-resort-sand/30">
                      {details.deliveries.map((del: any) => (
                        <tr key={del.id}>
                          <td className="p-2 font-semibold text-emerald-900">{del.grnNumber}</td>
                          <td className="p-2 text-resort-stone">{new Date(del.receivedDate).toLocaleDateString()}</td>
                          <td className="p-2">{del.storeName}</td>
                          <td className="p-2 font-bold text-emerald-700">{del.acceptedQuantity}</td>
                          <td className="p-2 text-resort-stone">{del.challanNumber || 'N/A'}</td>
                          <td className="p-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-300">
                              {del.status}
                            </span>
                          </td>
                          <td className="p-2">
                            {del.linkedBills?.length > 0 ? (
                              <span className="text-purple-800 font-medium">
                                {del.linkedBills.map((b: any) => b.billNumber).join(', ')}
                              </span>
                            ) : (
                              <span className="text-stone-400 italic">Not Billed</span>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            {del.linkedBills?.length === 0 && onEnterBill && (
                              <Button
                                size="sm"
                                onClick={() => onEnterBill(details, del)}
                                className="h-5 text-[10px] bg-purple-700 hover:bg-purple-800 text-white"
                              >
                                Enter Bill
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 4. Vendor Bills */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-semibold text-resort-charcoal uppercase tracking-wider">
                  Vendor Bills ({details.bills?.length || 0})
                </h4>
                {onEnterBill && (
                  <Button
                    size="sm"
                    onClick={() => onEnterBill(details)}
                    className="h-6 text-[11px] bg-purple-700 hover:bg-purple-800 text-white"
                  >
                    Enter Bill
                  </Button>
                )}
              </div>
              {details.bills?.length === 0 ? (
                <div className="p-4 bg-stone-50 rounded border border-dashed border-resort-sand text-center text-xs text-resort-stone">
                  No vendor bills registered against this PO yet.
                </div>
              ) : (
                <div className="border border-resort-sand/50 rounded overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-resort-ivory/60 text-resort-stone font-medium">
                      <tr>
                        <th className="p-2">Bill #</th>
                        <th className="p-2">Invoice #</th>
                        <th className="p-2">GRN Ref</th>
                        <th className="p-2">Bill Date</th>
                        <th className="p-2">Due Date</th>
                        <th className="p-2">Amount</th>
                        <th className="p-2">Paid</th>
                        <th className="p-2">Balance Due</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-resort-sand/30">
                      {details.bills.map((b: any) => (
                        <tr key={b.id}>
                          <td className="p-2 font-semibold text-purple-900">{b.billNumber}</td>
                          <td className="p-2 font-medium">{b.vendorBillNo}</td>
                          <td className="p-2 text-emerald-800">{b.grnNumber || 'Consolidated / Direct'}</td>
                          <td className="p-2 text-resort-stone">{new Date(b.billDate).toLocaleDateString()}</td>
                          <td className="p-2 text-resort-stone">{new Date(b.dueDate).toLocaleDateString()}</td>
                          <td className="p-2 font-bold text-resort-charcoal">₹{b.totalAmount}</td>
                          <td className="p-2 text-emerald-800">₹{b.paidAmount}</td>
                          <td className="p-2 font-bold text-rose-700">₹{b.balanceDue}</td>
                          <td className="p-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-800 border border-purple-200">
                              {b.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-resort-sand/50 flex justify-end">
          <Button type="button" variant="outline" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}



