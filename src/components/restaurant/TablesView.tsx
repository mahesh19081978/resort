'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  openTableSessionAction,
  closeTableSessionAction,
  addTablesToSessionAction,
  generateRestaurantBillAction,
  recordBillPaymentAction,
  postBillToRoomChargeAction,
} from '@/actions/restaurant';
import {
  Users,
  Clock,
  AlertCircle,
  Plus,
  CheckCircle2,
  ChevronRight,
  Utensils,
  Receipt,
  CreditCard,
  BedDouble,
  Eye,
  FileCheck,
  X,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

export interface InhouseStayOption {
  id: string;
  stayNumber: string;
  guestName: string;
  roomId: string;
  roomNumber: string;
}

export interface TableSessionItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  status: string;
  notes?: string | null;
}

export interface TableSessionBill {
  id: string;
  billNumber: string;
  status: string;
  totalAmount: number;
  totalPaid: number;
  outstanding: number;
}

export interface TableItem {
  id: string;
  tableNumber: string;
  capacity: number;
  section: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'JOINED' | 'BLOCKED';
  currentSession?: {
    id: string;
    sessionCode: string;
    paxCount: number;
    guestName?: string | null;
    openedAt: string;
    orderCount: number;
    tables: { id: string; tableNumber: string }[];
    orders: { id: string; orderNumber: string; status: string }[];
    items: TableSessionItem[];
    bills: TableSessionBill[];
    totals: {
      subtotal: number;
      taxTotal: number;
      grandTotal: number;
    };
  } | null;
}

export function TablesView({
  restaurantId,
  tables,
  inhouseStays = [],
}: {
  restaurantId: string;
  tables: TableItem[];
  inhouseStays?: InhouseStayOption[];
}) {
  const [selectedSection, setSelectedSection] = useState<string>('ALL');
  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [targetTable, setTargetTable] = useState<TableItem | null>(null);
  const [paxCount, setPaxCount] = useState<number>(2);
  const [guestName, setGuestName] = useState<string>('');
  const [selectedMultiTables, setSelectedMultiTables] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // View Bill Modal state
  const [viewBillTable, setViewBillTable] = useState<TableItem | null>(null);

  // Settlement Modal state
  const [settleTable, setSettleTable] = useState<TableItem | null>(null);
  const [settleTab, setSettleTab] = useState<'PAY' | 'ROOM_CHARGE'>('PAY');
  const [payMethod, setPayMethod] = useState<string>('CASH');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payRef, setPayRef] = useState<string>('');
  const [selectedStayId, setSelectedStayId] = useState<string>(inhouseStays[0]?.id || '');
  const [settleSuccessMsg, setSettleSuccessMsg] = useState<string | null>(null);

  const sections = ['ALL', ...Array.from(new Set(tables.map((t) => t.section)))];

  const filteredTables = selectedSection === 'ALL'
    ? tables
    : tables.filter((t) => t.section === selectedSection);

  const availableTables = tables.filter((t) => t.status === 'AVAILABLE');

  const handleOpenClick = (table: TableItem) => {
    setTargetTable(table);
    setSelectedMultiTables([table.id]);
    setPaxCount(table.capacity);
    setGuestName('');
    setErrorMsg(null);
    setOpenModalOpen(true);
  };

  const handleOpenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('restaurantId', restaurantId);
    selectedMultiTables.forEach((id) => formData.append('tableIds', id));
    formData.append('paxCount', String(paxCount));
    if (guestName) formData.append('guestName', guestName);

    const res = await openTableSessionAction(null, formData);
    setIsSubmitting(false);

    if (res.success) {
      setOpenModalOpen(false);
      window.location.reload();
    } else {
      setErrorMsg(res.error || 'Failed to open session');
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to close this table session? Ensure all bills are settled.')) {
      return;
    }
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    const res = await closeTableSessionAction(null, formData);
    if (res.success) {
      window.location.reload();
    } else {
      alert(res.error || 'Failed to close session');
    }
  };

  // Open Settle Modal
  const handleOpenSettleModal = (table: TableItem) => {
    setSettleTable(table);
    setSettleTab('PAY');
    setPayMethod('CASH');
    setPayRef('');
    setErrorMsg(null);
    setSettleSuccessMsg(null);

    const activeBill = table.currentSession?.bills.find(
      (b) => b.status === 'ISSUED' || b.status === 'DRAFT'
    );
    const defaultAmount = activeBill
      ? activeBill.outstanding
      : (table.currentSession?.totals.grandTotal || 0);

    setPayAmount(defaultAmount);
    if (inhouseStays.length > 0) {
      setSelectedStayId(inhouseStays[0].id);
    }
  };

  // Generate Bill & Open Settlement
  const handleGenerateBillClick = async (table: TableItem) => {
    const session = table.currentSession;
    if (!session || session.orders.length === 0) {
      alert('No orders placed yet for this table. Please place an order in POS first.');
      return;
    }

    const latestOrder = session.orders[0];
    const existingBill = session.bills.find(
      (b) => b.status === 'ISSUED' || b.status === 'DRAFT'
    );

    if (existingBill) {
      // Bill already exists, directly open settlement
      handleOpenSettleModal(table);
      return;
    }

    // Generate bill for the latest active order
    setIsSubmitting(true);
    setErrorMsg(null);
    const formData = new FormData();
    formData.append('orderId', latestOrder.id);
    const res = await generateRestaurantBillAction(null, formData);
    setIsSubmitting(false);

    if (res.success) {
      window.location.reload();
    } else {
      alert(res.error || 'Failed to generate restaurant bill.');
    }
  };

  // Settle via Direct Payment (Cash, Card, UPI)
  const handleSettlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleTable || !settleTable.currentSession) return;

    let targetBill = settleTable.currentSession.bills.find(
      (b) => b.status === 'ISSUED' || b.status === 'DRAFT'
    );

    setIsSubmitting(true);
    setErrorMsg(null);

    // If bill does not exist yet, generate it first
    if (!targetBill) {
      const latestOrder = settleTable.currentSession.orders[0];
      if (!latestOrder) {
        setIsSubmitting(false);
        setErrorMsg('No orders found for this table session.');
        return;
      }
      const genFormData = new FormData();
      genFormData.append('orderId', latestOrder.id);
      const genRes = await generateRestaurantBillAction(null, genFormData);
      if (!genRes.success || !genRes.data) {
        setIsSubmitting(false);
        setErrorMsg(genRes.error || 'Failed to generate bill prior to settlement.');
        return;
      }
      targetBill = (genRes.data as { bill: { id: string } }).bill as any;
    }

    if (!targetBill) {
      setIsSubmitting(false);
      setErrorMsg('No bill available to settle.');
      return;
    }

    const payFormData = new FormData();
    payFormData.append('billId', targetBill.id);
    payFormData.append('amount', String(payAmount));
    payFormData.append('method', payMethod);
    if (payRef) payFormData.append('transactionReference', payRef);
    payFormData.append('autoCloseSession', 'true');

    const payRes = await recordBillPaymentAction(null, payFormData);
    setIsSubmitting(false);

    if (payRes.success) {
      setSettleSuccessMsg('Payment collected! Table is now available for the next guest.');
      setTimeout(() => {
        setSettleTable(null);
        window.location.reload();
      }, 1200);
    } else {
      setErrorMsg(payRes.error || 'Payment settlement failed.');
    }
  };

  // Settle via Room Transfer (Charge to Guest Room Folio)
  const handleRoomChargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleTable || !settleTable.currentSession) return;

    const chosenStay = inhouseStays.find((s) => s.id === selectedStayId);
    if (!chosenStay) {
      setErrorMsg('Please select a valid in-house guest room.');
      return;
    }

    let targetBill = settleTable.currentSession.bills.find(
      (b) => b.status === 'ISSUED' || b.status === 'DRAFT'
    );

    setIsSubmitting(true);
    setErrorMsg(null);

    // If bill does not exist yet, generate it first
    if (!targetBill) {
      const latestOrder = settleTable.currentSession.orders[0];
      if (!latestOrder) {
        setIsSubmitting(false);
        setErrorMsg('No orders found for this table session.');
        return;
      }
      const genFormData = new FormData();
      genFormData.append('orderId', latestOrder.id);
      const genRes = await generateRestaurantBillAction(null, genFormData);
      if (!genRes.success || !genRes.data) {
        setIsSubmitting(false);
        setErrorMsg(genRes.error || 'Failed to generate bill prior to room charge.');
        return;
      }
      targetBill = (genRes.data as { bill: { id: string } }).bill as any;
    }

    if (!targetBill) {
      setIsSubmitting(false);
      setErrorMsg('No bill available to transfer to room.');
      return;
    }

    const roomFormData = new FormData();
    roomFormData.append('billId', targetBill.id);
    roomFormData.append('stayId', chosenStay.id);
    roomFormData.append('roomId', chosenStay.roomId);
    roomFormData.append(
      'notes',
      `Transferred from Table ${settleTable.tableNumber} by guest request`
    );
    roomFormData.append('autoCloseSession', 'true');

    const chargeRes = await postBillToRoomChargeAction(null, roomFormData);
    setIsSubmitting(false);

    if (chargeRes.success) {
      setSettleSuccessMsg(
        `Transferred to Room ${chosenStay.roomNumber}! Table is now available for the next guest.`
      );
      setTimeout(() => {
        setSettleTable(null);
        window.location.reload();
      }, 1200);
    } else {
      setErrorMsg(chargeRes.error || 'Failed to post charge to guest room.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics & Section Filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-4 rounded-lg border border-resort-sand">
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
          {sections.map((sec) => (
            <button
              key={sec}
              onClick={() => setSelectedSection(sec)}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                selectedSection === sec
                  ? 'bg-resort-forest text-resort-ivory font-semibold'
                  : 'bg-resort-sand/40 text-resort-charcoal hover:bg-resort-sand'
              )}
            >
              {sec}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            <span className="text-resort-stone font-medium">
              Available ({tables.filter((t) => t.status === 'AVAILABLE').length})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
            <span className="text-resort-stone font-medium">
              Occupied ({tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'JOINED').length})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            <span className="text-resort-stone font-medium">
              Reserved ({tables.filter((t) => t.status === 'RESERVED').length})
            </span>
          </div>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredTables.map((table) => {
          const isAvailable = table.status === 'AVAILABLE';
          const isOccupied = table.status === 'OCCUPIED' || table.status === 'JOINED';
          const session = table.currentSession;

          return (
            <Card
              key={table.id}
              className={cn(
                'relative border transition-all hover:shadow-md',
                isAvailable && 'border-emerald-200 bg-emerald-50/20',
                isOccupied && 'border-amber-300 bg-amber-50/20',
                table.status === 'RESERVED' && 'border-blue-200 bg-blue-50/20'
              )}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-lg font-bold text-resort-charcoal">
                        {table.tableNumber}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider',
                          isAvailable && 'bg-emerald-100 text-emerald-800',
                          isOccupied && 'bg-amber-100 text-amber-800',
                          table.status === 'RESERVED' && 'bg-blue-100 text-blue-800'
                        )}
                      >
                        {table.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-resort-stone mt-0.5">{table.section}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-resort-stone font-medium bg-white px-2 py-1 rounded border border-resort-sand/60">
                    <Users className="w-3 h-3" />
                    <span>{table.capacity}</span>
                  </div>
                </div>

                {/* Active Session Details */}
                {isOccupied && session ? (
                  <div className="p-2.5 bg-white rounded border border-amber-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-resort-charcoal font-medium">
                      <span>{session.guestName || 'Guest Party'}</span>
                      <span className="text-amber-800 font-mono text-[11px] font-semibold">
                        {session.sessionCode}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-resort-stone">
                      <span>Pax: {session.paxCount}</span>
                      <span>Orders: {session.orderCount}</span>
                    </div>
                    {session.tables.length > 1 && (
                      <div className="text-[10px] text-indigo-700 bg-indigo-50 p-1 rounded font-medium">
                        Joined: {session.tables.map((t) => t.tableNumber).join(', ')}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-emerald-700 font-medium">
                    Ready for Guests
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 border-t border-resort-sand/60 flex flex-col gap-2">
                  {isAvailable && (
                    <Button
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => handleOpenClick(table)}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Open Table
                    </Button>
                  )}

                  {isOccupied && session && (
                    <>
                      <div className="grid grid-cols-2 gap-1.5 w-full">
                        <Link
                          href={`/admin/restaurant/pos?tableSessionId=${session.id}&tableNumber=${table.tableNumber}`}
                          className="w-full"
                        >
                          <Button size="sm" variant="outline" className="w-full text-xs h-8 px-2">
                            <Utensils className="w-3 h-3 mr-1 text-resort-forest" /> POS
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs h-8 px-2 bg-amber-50/50 border-amber-200 text-amber-900 hover:bg-amber-100/60"
                          onClick={() => setViewBillTable(table)}
                        >
                          <Eye className="w-3 h-3 mr-1 text-amber-700" /> View Bill
                        </Button>
                      </div>

                      <div className="flex items-center gap-1.5 w-full">
                        {session.bills.some((b) => b.status === 'ISSUED' || b.status === 'DRAFT') ? (
                          <Button
                            size="sm"
                            className="flex-1 text-xs h-8 bg-emerald-700 hover:bg-emerald-800 text-white"
                            onClick={() => handleOpenSettleModal(table)}
                          >
                            <CreditCard className="w-3 h-3 mr-1" /> Settle Bill
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="flex-1 text-xs h-8 bg-resort-forest text-white"
                            onClick={() => handleGenerateBillClick(table)}
                            disabled={isSubmitting}
                          >
                            <Receipt className="w-3 h-3 mr-1" /> Generate Bill
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-8 px-2 text-resort-stone hover:text-red-700 hover:bg-red-50"
                          title="Close Session Manually"
                          onClick={() => handleCloseSession(session.id)}
                        >
                          Close
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modal 1: View Bill Modal with Item Statuses */}
      {viewBillTable && viewBillTable.currentSession && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg border border-resort-sand w-full max-w-lg p-6 space-y-4 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-resort-sand pb-3">
              <div>
                <h2 className="font-serif text-lg font-bold text-resort-charcoal">
                  Table {viewBillTable.tableNumber} — Ordered Items & Bill Preview
                </h2>
                <p className="text-xs text-resort-stone">
                  Session: {viewBillTable.currentSession.sessionCode} • Guest: {viewBillTable.currentSession.guestName || 'Walk-In Party'} ({viewBillTable.currentSession.paxCount} Pax)
                </p>
              </div>
              <button
                onClick={() => setViewBillTable(null)}
                className="text-resort-stone hover:text-resort-charcoal p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Item List with live preparation status */}
            <div className="overflow-y-auto flex-1 divide-y divide-resort-sand/60 pr-1">
              {viewBillTable.currentSession.items.length === 0 ? (
                <div className="py-8 text-center text-xs text-resort-stone">
                  No items ordered yet for this session. Use the POS button to add dishes.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-resort-sand bg-resort-sand/20 font-semibold text-resort-charcoal">
                      <th className="p-2">Item</th>
                      <th className="p-2 text-center">Status</th>
                      <th className="p-2 text-center">Qty</th>
                      <th className="p-2 text-right">Price</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-resort-sand/60">
                    {viewBillTable.currentSession.items.map((item) => (
                      <tr key={item.id} className="hover:bg-resort-sand/10">
                        <td className="p-2">
                          <span className="font-semibold text-resort-charcoal">{item.name}</span>
                          {item.notes && (
                            <p className="text-[10px] text-amber-800 italic">{item.notes}</p>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <span
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider',
                              item.status === 'SERVED' && 'bg-emerald-100 text-emerald-800',
                              item.status === 'READY' && 'bg-blue-100 text-blue-800',
                              item.status === 'PREPARING' && 'bg-amber-100 text-amber-800',
                              item.status === 'SENT' && 'bg-purple-100 text-purple-800',
                              item.status === 'PENDING' && 'bg-gray-100 text-gray-700'
                            )}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="p-2 text-center font-mono font-bold">{item.quantity}</td>
                        <td className="p-2 text-right">{formatCurrency(item.unitPrice)}</td>
                        <td className="p-2 text-right font-bold text-resort-forest">
                          {formatCurrency(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Bill Summary Footer */}
            <div className="pt-3 border-t border-resort-sand space-y-2 bg-resort-sand/10 p-3 rounded text-xs">
              <div className="flex justify-between text-resort-stone">
                <span>Subtotal:</span>
                <span className="font-medium">{formatCurrency(viewBillTable.currentSession.totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-resort-stone">
                <span>GST / Taxes:</span>
                <span className="font-medium">{formatCurrency(viewBillTable.currentSession.totals.taxTotal)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-resort-charcoal pt-1 border-t border-resort-sand">
                <span>Estimated Grand Total:</span>
                <span className="text-resort-forest text-base">
                  {formatCurrency(viewBillTable.currentSession.totals.grandTotal)}
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-between gap-2 border-t border-resort-sand">
              <Link
                href={`/admin/restaurant/pos?tableSessionId=${viewBillTable.currentSession.id}&tableNumber=${viewBillTable.tableNumber}`}
              >
                <Button size="sm" variant="outline" className="text-xs">
                  <Utensils className="w-3.5 h-3.5 mr-1" /> Add More Items (POS)
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setViewBillTable(null)}
                  className="text-xs"
                >
                  Close
                </Button>
                <Button
                  size="sm"
                  className="text-xs bg-resort-forest text-white"
                  onClick={() => {
                    const tbl = viewBillTable;
                    setViewBillTable(null);
                    handleOpenSettleModal(tbl);
                  }}
                >
                  <Receipt className="w-3.5 h-3.5 mr-1" /> Proceed to Bill & Settlement
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Final Bill & Settlement Modal (Cash/Card/UPI or Transfer to Room) */}
      {settleTable && settleTable.currentSession && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg border border-resort-sand w-full max-w-md p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-resort-sand pb-3">
              <div>
                <h3 className="font-serif font-bold text-base text-resort-charcoal">
                  Collect Bill & Settle — Table {settleTable.tableNumber}
                </h3>
                <p className="text-xs text-resort-stone">
                  Session: {settleTable.currentSession.sessionCode} • {settleTable.currentSession.guestName || 'Guest'}
                </p>
              </div>
              <button
                onClick={() => setSettleTable(null)}
                className="text-resort-stone hover:text-resort-charcoal p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 text-red-800 rounded border border-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {settleSuccessMsg && (
              <div className="p-3 bg-emerald-50 text-emerald-800 rounded border border-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span className="font-medium">{settleSuccessMsg}</span>
              </div>
            )}

            {/* Method Toggle: Pay at Restaurant vs Transfer to Room Folio */}
            <div className="flex items-center gap-2 border-b border-resort-sand pb-3">
              <button
                type="button"
                onClick={() => setSettleTab('PAY')}
                className={cn(
                  'flex-1 py-2 rounded text-xs font-bold border transition-colors flex items-center justify-center gap-1.5',
                  settleTab === 'PAY'
                    ? 'bg-resort-forest text-white border-resort-forest'
                    : 'bg-white text-resort-charcoal border-resort-sand hover:bg-resort-sand/20'
                )}
              >
                <CreditCard className="w-3.5 h-3.5" /> Pay at Restaurant
              </button>
              <button
                type="button"
                onClick={() => setSettleTab('ROOM_CHARGE')}
                className={cn(
                  'flex-1 py-2 rounded text-xs font-bold border transition-colors flex items-center justify-center gap-1.5',
                  settleTab === 'ROOM_CHARGE'
                    ? 'bg-resort-forest text-white border-resort-forest'
                    : 'bg-white text-resort-charcoal border-resort-sand hover:bg-resort-sand/20'
                )}
              >
                <BedDouble className="w-3.5 h-3.5" /> Transfer to Room
              </button>
            </div>

            {/* TAB A: Pay at Restaurant (Cash, UPI, Card) */}
            {settleTab === 'PAY' && (
              <form onSubmit={handleSettlePaymentSubmit} className="space-y-4 text-xs">
                <div className="p-3 bg-resort-sand/20 rounded border border-resort-sand/60 space-y-1">
                  <div className="flex justify-between text-resort-stone">
                    <span>Total Bill Amount:</span>
                    <span className="font-bold text-resort-forest text-sm">
                      {formatCurrency(settleTable.currentSession.totals.grandTotal)}
                    </span>
                  </div>
                  <p className="text-[11px] text-resort-stone">
                    Once bill is collected, table {settleTable.tableNumber} will immediately become available for the next guest.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">Payment Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-resort-sand rounded text-xs focus:ring-1 focus:ring-resort-forest focus:outline-none"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI / QR Code</option>
                    <option value="CREDIT_CARD">Credit Card</option>
                    <option value="DEBIT_CARD">Debit Card</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">Amount to Collect (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border border-resort-sand rounded text-xs font-mono font-bold focus:ring-1 focus:ring-resort-forest focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">
                    Transaction / Reference # (Optional)
                  </label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="e.g., UPI Ref, Card approval code"
                    className="w-full px-3 py-2 border border-resort-sand rounded text-xs focus:ring-1 focus:ring-resort-forest focus:outline-none"
                  />
                </div>

                <div className="pt-3 border-t border-resort-sand flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSettleTable(null)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    {isSubmitting ? 'Collecting...' : 'Collect & Free Table'}
                  </Button>
                </div>
              </form>
            )}

            {/* TAB B: Transfer Bill to Guest Room Folio */}
            {settleTab === 'ROOM_CHARGE' && (
              <form onSubmit={handleRoomChargeSubmit} className="space-y-4 text-xs">
                <div className="p-3 bg-indigo-50 rounded border border-indigo-200 text-indigo-950 space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>Amount to Charge to Room:</span>
                    <span className="font-mono text-sm">
                      {formatCurrency(settleTable.currentSession.totals.grandTotal)}
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-800">
                    Bill will post directly to the guest's folio ledger. Table {settleTable.tableNumber} will immediately become available for the next guest.
                  </p>
                </div>

                {inhouseStays.length === 0 ? (
                  <div className="p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded text-xs">
                    No active in-house stays currently checked in. Please choose "Pay at Restaurant" or check in a reservation first.
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="font-semibold text-resort-charcoal">Select In-House Room</label>
                    <select
                      value={selectedStayId}
                      onChange={(e) => setSelectedStayId(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-resort-sand rounded text-xs focus:ring-1 focus:ring-resort-forest focus:outline-none"
                    >
                      {inhouseStays.map((stay) => (
                        <option key={stay.id} value={stay.id}>
                          Room {stay.roomNumber} — {stay.guestName} ({stay.stayNumber})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="pt-3 border-t border-resort-sand flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSettleTable(null)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || inhouseStays.length === 0}
                    className="bg-indigo-700 hover:bg-indigo-800 text-white"
                  >
                    <BedDouble className="w-3.5 h-3.5 mr-1" />
                    {isSubmitting ? 'Transferring...' : 'Transfer to Room & Free Table'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Open Dining Session */}
      {openModalOpen && targetTable && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg border border-resort-sand w-full max-w-md p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-resort-sand pb-3">
              <h2 className="font-serif text-lg font-bold text-resort-charcoal">
                Open Dining Session — Table {targetTable.tableNumber}
              </h2>
              <button
                onClick={() => setOpenModalOpen(false)}
                className="text-resort-stone hover:text-resort-charcoal"
              >
                ?
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 text-red-800 rounded border border-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleOpenSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Guest Name / Party (Optional)</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g., Mr. Sharma or VIP Table"
                  className="w-full px-3 py-2 border border-resort-sand rounded text-xs focus:ring-1 focus:ring-resort-forest focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Guest Count (Pax)</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={paxCount}
                  onChange={(e) => setPaxCount(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 border border-resort-sand rounded text-xs focus:ring-1 focus:ring-resort-forest focus:outline-none"
                />
              </div>

              {/* Optional Table Joining */}
              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">
                  Join Additional Tables (Optional)
                </label>
                <p className="text-[11px] text-resort-stone">
                  Select extra available physical tables to group logically under this single session.
                </p>
                <div className="max-h-32 overflow-y-auto border border-resort-sand rounded p-2 grid grid-cols-3 gap-1 bg-resort-sand/10">
                  {availableTables
                    .filter((t) => t.id !== targetTable.id)
                    .map((t) => {
                      const isSelected = selectedMultiTables.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedMultiTables(selectedMultiTables.filter((id) => id !== t.id));
                            } else {
                              setSelectedMultiTables([...selectedMultiTables, t.id]);
                            }
                          }}
                          className={cn(
                            'p-1.5 rounded text-[11px] font-medium border text-center transition-colors',
                            isSelected
                              ? 'bg-resort-forest text-white border-resort-forest font-bold'
                              : 'bg-white border-resort-sand text-resort-charcoal hover:bg-resort-sand/40'
                          )}
                        >
                          {t.tableNumber} ({t.capacity}p)
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="pt-3 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpenModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Opening Session...' : 'Confirm & Open'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
