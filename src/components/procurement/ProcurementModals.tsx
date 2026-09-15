'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, X } from 'lucide-react';

export interface LookupItem {
  id: string;
  name: string;
  code: string;
  standardCost: string;
  baseUnit: {id: string; name: string;
    code: string;
  };
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
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: LookupItem[];
  onSubmit: (data: any) => Promise<void>;
  loading: boolean;
}) {
  const [department, setDepartment] = useState('F&B');
  const [notes, setNotes] = useState('');
  const [prItems, setPrItems] = useState<Array<{itemId: string; quantity: number; estimatedCost: number; notes: string;}>>([
    { itemId: items[0]?.id || '', quantity: 1, estimatedCost: parseFloat(items[0]?.standardCost || '0'), notes: '' },
  ]);

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
              {prItems.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-resort-ivory/40 rounded border border-resort-sand/30">
                  <div className="flex-1">
                    <select
                      value={row.itemId}
                      onChange={(e) => handleItemChange(idx, e.target.value)}
                      className="w-full border border-resort-sand rounded p-1.5 text-xs bg-white"
                    >
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.code} - {i.name} ({i.baseUnit.code})
                        </option>
                      ))}
                    </select>
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
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;

  vendors: LookupVendor[];
  items: LookupItem[];
  onSubmit: (data: any) => Promise<void>;
  loading: boolean;
}) {
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [poItems, setPoItems] = useState<Array<{itemId: string; orderedQuantity: number; unitPrice: number; taxRate: number}>>([
    { itemId: items[0]?.id || '', orderedQuantity: 1, unitPrice: parseFloat(items[0]?.standardCost || '0'), taxRate: 0 },
  ]);

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
      expectedDate: expectedDate || undefined,
      notes: notes || undefined,
      items: poItems,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-3zl w-full p-6 shadow-xl max-h-[90vh] flex flex-col border border-resort-sand">
        <div className="flex justify-between items-center pb-3 border-b border-resort-sand/50">
          <div>
            <h3 className="font-serif text-lg font-bold text-resort-charcoal">Issue Purchase Order (PO)</h3>
            <p className="text-xs text-resort-stone">Creates legally binding order. Note: Inventory is NOT updated until GRN.</p>
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
          const rem = Math.max(0, parseFloat(i.remainingQuantity || '0'));
          return {
            itemId: i.itemId,
            itemName: i.item.name,
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
      items: grnItems.map((row) => ({
        itemId: row.itemId,
        receivedQuantity: row.receivedQuantity,
        acceptedQuantity: row.acceptedQuantity,
        rejectedQuantity: row.rejectedQuantity,
        damagedQuantity: row.damagedQuantity,
        rejectionReason: row.rejectionReason || undefined,
        unitPrice: row.unitPrice,
      })),
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
              Vendor: {purchaseOrder.vendor.name}. Stock will be incremented ONLY for Accepted quantities.
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
                    <span className="text-resort-stone">Remaining on PO: {row.remainingQty}</span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[10px] text-resort-stone">Received Qty</Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={row.receivedQuantity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = [...grnItems];
                          updated[idx].receivedQuantity = val;
                          updated[idx].acceptedQuantity = Math.max(
                            0,
                            val - updated[idx].rejectedQuantity - updated[idx].damagedQuantity
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
                        step="any"
                        value={row.acceptedQuantity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = [...grnItems];
                          updated[idx].acceptedQuantity = val;
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
                          updated[idx].acceptedQuantity = Math.max(
                            0,
                            updated[idx].receivedQuantity - val - updated[idx].damagedQuantity
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
                          updated[idx].acceptedQuantity = Math.max(
                            0,
                            updated[idx].receivedQuantity - updated[idx].rejectedQuantity - val
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
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  vendors: LookupVendor[];
  unpaidBills: any[];
  onSubmit: (data: any) => Promise<void>;
  loading: boolean;
}) {
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [transactionReference, setTransactionReference] = useState('');
  const [notes, setNotes] = useState('');
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const vendorBills = unpaidBills.filter((b) => b.vendorId === vendorId && parseFloat(b.balanceDue) > 0);
  const totalAllocated = Object.values(allocations).reduce((a, b) => a + (b || 0), 0);

  if (!isOpen) return null;

  const handleAllocationChange = (billId: string, val: number, maxBalance: number) => {
    const clamped = Math.min(Math.max(0, val), maxBalance);
    setAllocations({
      ...allocations,
      [billId]: clamped,
    });
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
            <h3 className="font-serif text-lg font-bold text-resort-charcoal">Record Vendor Payment</h3>
            <p className="text-xs text-resort-stone">Applies atomic payment against outstanding vendor bills.</p>
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
                  setAllocations({});
                }}
                className="w-full mt-1 border border-resort-sand rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.companyName})
                  </option>
                ))}
              </select>
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

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-resort-charcoal uppercase tracking-wider">
              Allocate Across Outstanding Bills ({vendorBills.length})
            </Label>

            {vendorBills.length === 0 ? (
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
                {loading ? 'Recording...' : 'Disburse & Record Payment'}
              </Button>
            </div>
          </div>
        </form>
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
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  vendors: LookupVendor[];
  purchaseOrders: any[];
  onSubmit: (data: any) => Promise<void>;
  loading: boolean;
}) {
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [vendorBillNo, setVendorBillNo] = useState('');
  const [poId, setPoId] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [subtotal, setSubtotal] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  const vendorPos = purchaseOrders.filter(
    (po) => po.vendorId === vendorId && ['ISSUED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED'].includes(po.status)
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

          <div>
            <Label className="text-xs font-medium text-resort-charcoal">Linked Purchase Order (Optional)</Label>
            <select
              value={poId}
              onChange={(e) => handlePoSelect(e.target.value)}
              className="w-full mt-1 border border-resort-sand rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="">-- Standalone Invoice / Direct Bill --</option>
              {vendorPos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.poNumber} (Status: {p.status} - Total: ₹{p.totalAmount})
                </option>
              ))}
            </select>
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



