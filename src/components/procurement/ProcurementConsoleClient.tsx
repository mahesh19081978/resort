'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  ShoppingCart,
  Truck,
  ReceiptText,
  DollarSign,
  Users,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Building2,
  Package,
} from 'lucide-react';
import { ProcurementKpis } from './ProcurementKpis';
import {
  CreatePrModal,
  CreatePoModal,
  CreateGrnModal,
  CreateBillModal,
  CreatePaymentModal,
  CreateVendorModal,
  LookupItem,
  LookupStore,
  LookupVendor,
} from './ProcurementModals';
import {
  getProcurementDashboardDataAction,
  getPurchaseRequestsAction,
  getPurchaseOrdersAction,
  getGoodsReceiptsAction,
  getPurchaseBillsAction,
  getVendorPaymentsAction,
  getVendorsAction,
  createPurchaseRequestAction,
  submitPurchaseRequestAction,
  approvePurchaseRequestAction,
  rejectPurchaseRequestAction,
  createPurchaseOrderAction,
  issuePurchaseOrderAction,
  createAndFinalizeGrnAction,
  createPurchaseBillAction,
  verifyPurchaseBillAction,
  createVendorPaymentAction,
  createVendorAction,
} from '@/actions/procurement';

type ProcurementTab = 'overview' | 'requests' | 'orders' | 'grn' | 'bills' | 'payments' | 'vendors';

export default function ProcurementConsoleClient() {
  const [activeTab, setActiveTab] = useState<ProcurementTab>('overview');
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Lookups & KPIs
  const [kpis, setKpis] = useState<any>({
    pendingRequestsCount: 0,
    openOrdersCount: 0,
    grnThisMonthCount: 0,
    unpaidBillsCount: 0,
    totalOutstandingPayables: '0.00',
    totalPaidThisMonth: '0.00',
    activeVendorsCount: 0,
  });
  const [lookupItems, setLookupItems] = useState<LookupItem[]>([]);
  const [lookupStores, setLookupStores] = useState<LookupStore[]>([]);
  const [lookupVendors, setLookupVendors] = useState<LookupVendor[]>([]);

  // Tab Data Lists
  const [requests, setRequests] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [grns, setGrns] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [vendorsList, setVendorsList] = useState<any[]>([]);

  // Modal States
  const [isPrModalOpen, setIsPrModalOpen] = useState(false);
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);
  const [isGrnModalOpen, setIsGrnModalOpen] = useState(false);
  const [selectedPoForGrn, setSelectedPoForGrn] = useState<any>(null);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);

  // Load Dashboard Data
  const refreshDashboard = async () => {
    try {
      const res = await getProcurementDashboardDataAction();
      if (res.success) {
        setKpis(res.kpis);
        setLookupItems(res.items as any);
        setLookupStores(res.stores as any);
        setLookupVendors(res.vendors as any);
      }
    } catch (err: any) {
      console.error('Failed to load dashboard data', err);
    }
  };

  // Load Specific Tab Data
  const loadTabData = async (tab: ProcurementTab) => {
    try {
      if (tab === 'requests') {
        const res = await getPurchaseRequestsAction();
        if (res.success) setRequests(res.requests || []);
      } else if (tab === 'orders') {
        const res = await getPurchaseOrdersAction();
        if (res.success) setOrders(res.orders || []);
      } else if (tab === 'grn') {
        const res = await getGoodsReceiptsAction();
        if (res.success) setGrns(res.receipts || []);
      } else if (tab === 'bills') {
        const res = await getPurchaseBillsAction();
        if (res.success) setBills(res.bills || []);
      } else if (tab === 'payments') {
        const res = await getVendorPaymentsAction();
        if (res.success) setPayments(res.payments || []);
      } else if (tab === 'vendors') {
        const res = await getVendorsAction();
        if (res.success) setVendorsList(res.vendors || []);
      }
    } catch (err: any) {
      console.error('Failed to load tab data', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([refreshDashboard(), loadTabData(activeTab)]).finally(() => setLoading(false));
  }, [activeTab]);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // HANDLERS
  const handleCreatePr = async (data: any) => {
    setActionLoading(true);
    try {
      const res = await createPurchaseRequestAction(data);
      if (res.success) {
        showFeedback('success', `Purchase Request created successfully!`);
        setIsPrModalOpen(false);
        refreshDashboard();
        loadTabData(activeTab);
      } else {
        showFeedback('error', res.error || 'Failed to create PR');
      }
    } catch (err: any) {
      showFeedback('error', err.message || 'Error creating PR');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitPr = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await submitPurchaseRequestAction(id);
      if (res.success) {
        showFeedback('success', 'PR submitted for approval.');
        refreshDashboard();
        loadTabData(activeTab);
      } else {
        showFeedback('error', res.error || 'Failed to submit PR');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprovePr = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await approvePurchaseRequestAction(id);
      if (res.success) {
        showFeedback('success', 'PR approved successfully! PO can now be issued.');
        refreshDashboard();
        loadTabData(activeTab);
      } else {
        showFeedback('error', res.error || 'Failed to approve PR');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreatePo = async (data: any) => {
    setActionLoading(true);
    try {
      const res = await createPurchaseOrderAction(data);
      if (res.success) {
        showFeedback('success', `Purchase Order issued successfully!`);
        setIsPoModalOpen(false);
        refreshDashboard();
        loadTabData(activeTab);
      } else {
        showFeedback('error', res.error || 'Failed to issue PO');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleIssuePo = async (poId: string) => {
    setActionLoading(true);
    try {
      const res = await issuePurchaseOrderAction(poId);
      if (res.success) {
        showFeedback('success', 'Purchase Order marked as ISSUED.');
        refreshDashboard();
        loadTabData(activeTab);
      } else {
        showFeedback('error', res.error || 'Failed to issue PO');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenGrnModal = (po: any) => {
    setSelectedPoForGrn(po);
    setIsGrnModalOpen(true);
  };

  const handleCreateGrn = async (data: any) => {
    setActionLoading(true);
    try {
      const res = await createAndFinalizeGrnAction(data);
      if (res.success && 'stockMovementsCount' in res) {
        showFeedback(
          'success',
          `GRN finalized! Stock updated for accepted items (${res.stockMovementsCount} movement records posted).`
        );
        setIsGrnModalOpen(false);
        refreshDashboard();
        loadTabData(activeTab);
      } else if (res.success) {
        showFeedback('success', 'GRN finalized! Stock updated for accepted items.');
        setIsGrnModalOpen(false);
        refreshDashboard();
        loadTabData(activeTab);
      } else {
        showFeedback('error', res.error || 'Failed to finalize GRN');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateBill = async (data: any) => {
    setActionLoading(true);
    try {
      const res = await createPurchaseBillAction(data);
      if (res.success) {
        showFeedback('success', `Purchase Bill recorded in payables successfully!`);
        setIsBillModalOpen(false);
        refreshDashboard();
        loadTabData(activeTab);
      } else {
        showFeedback('error', res.error || 'Failed to record bill');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyBill = async (billId: string) => {
    setActionLoading(true);
    try {
      const res = await verifyPurchaseBillAction(billId);
      if (res.success) {
        showFeedback('success', 'Purchase bill verified for payment release.');
        refreshDashboard();
        loadTabData(activeTab);
      } else {
        showFeedback('error', res.error || 'Failed to verify bill');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreatePayment = async (data: any) => {
    setActionLoading(true);
    try {
      const res = await createVendorPaymentAction(data);
      if (res.success) {
        showFeedback('success', `Payment disbursed and allocated across bills successfully!`);
        setIsPaymentModalOpen(false);
        refreshDashboard();
        loadTabData(activeTab);
      } else {
        showFeedback('error', res.error || 'Failed to disburse payment');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateVendor = async (data: any) => {
    setActionLoading(true);
    try {
      const res = await createVendorAction(data);
      if (res.success) {
        showFeedback('success', `Vendor registered successfully!`);
        setIsVendorModalOpen(false);
        refreshDashboard();
        loadTabData(activeTab);
      } else {
        showFeedback('error', res.error || 'Failed to register vendor');
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Procurement & Payables</h1>
          <p className="text-xs text-resort-stone mt-1">
            End-to-end purchasing lifecycle: PR → Approval → PO → GRN & Stock Posting → Purchase Bill → Payment Allocation.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsPrModalOpen(true)}
            className="text-xs bg-amber-700 hover:bg-amber-800 text-white shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> New PR
          </Button>

          <Button
            size="sm"
            onClick={() => setIsPoModalOpen(true)}
            className="text-xs bg-blue-700 hover:bg-blue-800 text-white shadow-sm"
          >
            <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Issue PO
          </Button>

          <Button
            size="sm"
            onClick={() => setIsBillModalOpen(true)}
            className="text-xs bg-purple-700 hover:bg-purple-800 text-white shadow-sm"
          >
            <ReceiptText className="w-3.5 h-3.5 mr-1" /> Enter Bill
          </Button>

          <Button
            size="sm"
            onClick={() => setIsPaymentModalOpen(true)}
            className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm"
          >
            <DollarSign className="w-3.5 h-3.5 mr-1" /> Pay Vendor
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsVendorModalOpen(true)}
            className="text-xs border-resort-sand text-resort-charcoal hover:bg-resort-sand/20"
          >
            <Building2 className="w-3.5 h-3.5 mr-1" /> Add Vendor
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <ProcurementKpis kpis={kpis} />

      {/* Feedback Banner */}
      {message && (
        <div
          className={`p-3 rounded-md text-xs font-medium border flex items-center justify-between transition-all ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-stone-400 hover:text-stone-700 font-bold ml-4">
            ×
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-resort-sand/60 overflow-x-auto space-x-1 pb-px">
        {[
          { id: 'overview', label: 'Overview & Flow', icon: ShieldCheck },
          { id: 'requests', label: `Purchase Requests (${kpis.pendingRequestsCount})`, icon: FileText },
          { id: 'orders', label: `Purchase Orders (${kpis.openOrdersCount})`, icon: ShoppingCart },
          { id: 'grn', label: 'Goods Receipts (GRN)', icon: Truck },
          { id: 'bills', label: `Bills & Payables (${kpis.unpaidBillsCount})`, icon: ReceiptText },
          { id: 'payments', label: 'Vendor Payments', icon: DollarSign },
          { id: 'vendors', label: `Vendors (${kpis.activeVendorsCount})`, icon: Users },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ProcurementTab)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-amber-700 text-amber-900 bg-amber-50/50'
                  : 'border-transparent text-resort-stone hover:text-resort-charcoal hover:border-resort-sand'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-700' : 'text-resort-stone'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}
      {loading ? (
        <div className="p-12 text-center text-xs text-resort-stone">Loading procurement data...</div>
      ) : (
        <div>
          {/* 1. OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 border-resort-sand bg-white/70 shadow-sm">
                <CardContent className="p-5 space-y-4">
                  <h2 className="font-serif text-base font-bold text-resort-charcoal">Procurement Architecture & Pipeline</h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-center">
                    <div className="p-3 bg-amber-50/60 rounded border border-amber-200/50">
                      <div className="text-amber-800 font-bold text-xs uppercase tracking-wide">1. Request & Approvals</div>
                      <p className="text-[11px] text-resort-stone mt-1">Department indent with strict budget & approval checks.</p>
                    </div>
                    <div className="p-3 bg-blue-50/60 rounded border border-blue-200/50">
                      <div className="text-blue-800 font-bold text-xs uppercase tracking-wide">2. Purchase Order</div>
                      <p className="text-[11px] text-resort-stone mt-1">Commercial order sent to vendor. Zero stock impact.</p>
                    </div>
                    <div className="p-3 bg-emerald-50/60 rounded border border-emerald-200/50">
                      <div className="text-emerald-800 font-bold text-xs uppercase tracking-wide">3. GRN & Inspection</div>
                      <p className="text-[11px] text-resort-stone mt-1">Stock ledger posted ONLY for accepted quantities.</p>
                    </div>
                    <div className="p-3 bg-purple-50/60 rounded border border-purple-200/50">
                      <div className="text-purple-800 font-bold text-xs uppercase tracking-wide">4. Bill & Payment</div>
                      <p className="text-[11px] text-resort-stone mt-1">3-way match validation with atomic payment allocation.</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-resort-sand/40">
                    <h3 className="text-xs font-semibold text-resort-charcoal mb-2">System Integrity Invariants</h3>
                    <ul className="text-xs text-resort-stone space-y-1.5 list-disc pl-4">
                      <li><strong>Financial Precision:</strong> All currency calculations are executed strictly in Decimal arithmetic.</li>
                      <li><strong>Stock Authority:</strong> PO issuance NEVER increases inventory; stock movements occur purely upon GRN finalization.</li>
                      <li><strong>Quality Assurance:</strong> Damaged and rejected deliveries are logged on the GRN document with reasons and excluded from active inventory.</li>
                      <li><strong>Payable Safety:</strong> Partial or full payments are validated to never exceed outstanding bill balances.</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-resort-sand bg-white/70 shadow-sm">
                <CardContent className="p-5 space-y-4">
                  <h2 className="font-serif text-base font-bold text-resort-charcoal">Quick Workflow Launch</h2>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsPrModalOpen(true)}
                      className="w-full justify-start text-xs border-resort-sand"
                    >
                      <FileText className="w-4 h-4 mr-2 text-amber-700" /> Draft Purchase Request
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsPoModalOpen(true)}
                      className="w-full justify-start text-xs border-resort-sand"
                    >
                      <ShoppingCart className="w-4 h-4 mr-2 text-blue-700" /> Issue Purchase Order
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsBillModalOpen(true)}
                      className="w-full justify-start text-xs border-resort-sand"
                    >
                      <ReceiptText className="w-4 h-4 mr-2 text-purple-700" /> Enter Vendor Bill
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsPaymentModalOpen(true)}
                      className="w-full justify-start text-xs border-resort-sand"
                    >
                      <DollarSign className="w-4 h-4 mr-2 text-emerald-700" /> Record Disbursed Payment
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 2. REQUESTS TAB */}
          {activeTab === 'requests' && (
            <Card className="border-resort-sand bg-white shadow-sm overflow-hidden">
              <div className="p-3 border-b border-resort-sand/50 flex justify-between items-center bg-resort-ivory/20">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-resort-charcoal">Purchase Requests</h3>
                <Button size="sm" onClick={() => setIsPrModalOpen(true)} className="h-7 text-xs bg-amber-700 hover:bg-amber-800 text-white">
                  <Plus className="w-3.5 h-3.5 mr-1" /> New Request
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-resort-charcoal">
                  <thead className="bg-resort-ivory/40 text-resort-stone uppercase font-medium border-b border-resort-sand/40">
                    <tr>
                      <th className="p-3">PR Number</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Items</th>
                      <th className="p-3">Est. Amount</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-resort-sand/20">
                    {requests.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-resort-stone">
                          No purchase requests found. Click "New Request" to create one.
                        </td>
                      </tr>
                    ) : (
                      requests.map((r) => (
                        <tr key={r.id} className="hover:bg-resort-ivory/30">
                          <td className="p-3 font-semibold text-amber-900">{r.requestNumber}</td>
                          <td className="p-3">{r.department}</td>
                          <td className="p-3">
                            <span className="font-medium">{r.items?.length || 0} items</span>
                            <div className="text-[11px] text-resort-stone truncate max-w-xs">
                              {r.items?.map((i: any) => `${i.item.name} (${i.quantity})`).join(', ')}
                            </div>
                          </td>
                          <td className="p-3 font-medium">₹{r.totalEstimatedCost}</td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase ${
                                r.status === 'APPROVED'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : r.status === 'SUBMITTED'
                                  ? 'bg-blue-50 text-blue-800 border-blue-300'
                                  : r.status === 'REJECTED'
                                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                                  : 'bg-stone-50 text-stone-700 border-stone-300'
                              }`}
                            >
                              {r.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-resort-stone">{new Date(r.createdAt).toLocaleDateString()}</td>
                          <td className="p-3 text-right space-x-1.5">
                            {r.status === 'DRAFT' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSubmitPr(r.id)}
                                disabled={actionLoading}
                                className="h-6 text-[10px] border-blue-300 text-blue-800 hover:bg-blue-50"
                              >
                                Submit
                              </Button>
                            )}
                            {r.status === 'SUBMITTED' && (
                              <Button
                                size="sm"
                                onClick={() => handleApprovePr(r.id)}
                                disabled={actionLoading}
                                className="h-6 text-[10px] bg-emerald-700 hover:bg-emerald-800 text-white"
                              >
                                Approve
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* 3. ORDERS TAB */}
          {activeTab === 'orders' && (
            <Card className="border-resort-sand bg-white shadow-sm overflow-hidden">
              <div className="p-3 border-b border-resort-sand/50 flex justify-between items-center bg-resort-ivory/20">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-resort-charcoal">Purchase Orders</h3>
                <Button size="sm" onClick={() => setIsPoModalOpen(true)} className="h-7 text-xs bg-blue-700 hover:bg-blue-800 text-white">
                  <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Issue PO
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-resort-charcoal">
                  <thead className="bg-resort-ivory/40 text-resort-stone uppercase font-medium border-b border-resort-sand/40">
                    <tr>
                      <th className="p-3">PO Number</th>
                      <th className="p-3">Vendor</th>
                      <th className="p-3">Items / Progress</th>
                      <th className="p-3">Total Amount</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Delivery Date</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-resort-sand/20">
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-resort-stone">
                          No purchase orders found. Click "Issue PO" to create one.
                        </td>
                      </tr>
                    ) : (
                      orders.map((po) => (
                        <tr key={po.id} className="hover:bg-resort-ivory/30">
                          <td className="p-3 font-semibold text-blue-900">{po.poNumber}</td>
                          <td className="p-3">
                            <div className="font-medium text-resort-charcoal">{po.vendor.name}</div>
                            <div className="text-[11px] text-resort-stone">{po.vendor.companyName}</div>
                          </td>
                          <td className="p-3">
                            <span className="font-medium">{po.items?.length || 0} lines</span>
                            <div className="text-[10px] text-resort-stone">
                              Recv Progress: {po.items?.reduce((s: number, i: any) => s + parseFloat(i.receivedQuantity || 0), 0)} /{' '}
                              {po.items?.reduce((s: number, i: any) => s + parseFloat(i.orderedQuantity || 0), 0)} units
                            </div>
                          </td>
                          <td className="p-3 font-semibold text-resort-charcoal">₹{po.totalAmount}</td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase ${
                                po.status === 'FULLY_RECEIVED'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : po.status === 'PARTIALLY_RECEIVED'
                                  ? 'bg-blue-50 text-blue-800 border-blue-300'
                                  : po.status === 'ISSUED'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-stone-50 text-stone-700 border-stone-300'
                              }`}
                            >
                              {po.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-resort-stone">
                            {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="p-3 text-right space-x-1.5">
                            {po.status === 'DRAFT' && (
                              <Button
                                size="sm"
                                onClick={() => handleIssuePo(po.id)}
                                disabled={actionLoading}
                                className="h-6 text-[10px] bg-blue-700 hover:bg-blue-800 text-white"
                              >
                                Issue PO
                              </Button>
                            )}
                            {['ISSUED', 'PARTIALLY_RECEIVED'].includes(po.status) && (
                              <Button
                                size="sm"
                                onClick={() => handleOpenGrnModal(po)}
                                disabled={actionLoading}
                                className="h-6 text-[10px] bg-emerald-700 hover:bg-emerald-800 text-white"
                              >
                                Receive Goods (GRN)
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* 4. GRN TAB */}
          {activeTab === 'grn' && (
            <Card className="border-resort-sand bg-white shadow-sm overflow-hidden">
              <div className="p-3 border-b border-resort-sand/50 bg-resort-ivory/20">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-resort-charcoal">Goods Receipt Notes (GRN)</h3>
                <p className="text-[11px] text-resort-stone mt-0.5">
                  Inspection records posting real physical inventory stock into warehouse accounts.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-resort-charcoal">
                  <thead className="bg-resort-ivory/40 text-resort-stone uppercase font-medium border-b border-resort-sand/40">
                    <tr>
                      <th className="p-3">GRN #</th>
                      <th className="p-3">Linked PO</th>
                      <th className="p-3">Store Location</th>
                      <th className="p-3">Inspection Summary</th>
                      <th className="p-3">Received By</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-resort-sand/20">
                    {grns.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-resort-stone">
                          No Goods Receipt Notes generated yet. Issue a PO and click "Receive Goods (GRN)".
                        </td>
                      </tr>
                    ) : (
                      grns.map((g) => (
                        <tr key={g.id} className="hover:bg-resort-ivory/30">
                          <td className="p-3 font-semibold text-emerald-900">{g.grnNumber}</td>
                          <td className="p-3 font-medium text-blue-900">{g.purchaseOrder?.poNumber || 'Direct GRN'}</td>
                          <td className="p-3">
                            {g.store?.name} ({g.store?.code})
                          </td>
                          <td className="p-3">
                            <div className="text-[11px] text-resort-charcoal">
                              Accepted: <span className="font-bold text-emerald-700">{g.items?.reduce((s: number, i: any) => s + parseFloat(i.acceptedQuantity || 0), 0)}</span> |{' '}
                              Rejected: <span className="font-bold text-rose-700">{g.items?.reduce((s: number, i: any) => s + parseFloat(i.rejectedQuantity || 0), 0)}</span> |{' '}
                              Damaged: <span className="font-bold text-amber-700">{g.items?.reduce((s: number, i: any) => s + parseFloat(i.damagedQuantity || 0), 0)}</span>
                            </div>
                          </td>
                          <td className="p-3 text-resort-stone">{g.receivedBy?.name || 'Staff'}</td>
                          <td className="p-3 text-resort-stone">{new Date(g.receivedAt).toLocaleDateString()}</td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-300">
                              {g.status}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* 5. BILLS & PAYABLES TAB */}
          {activeTab === 'bills' && (
            <Card className="border-resort-sand bg-white shadow-sm overflow-hidden">
              <div className="p-3 border-b border-resort-sand/50 flex justify-between items-center bg-resort-ivory/20">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-resort-charcoal">Purchase Bills & Accounts Payable</h3>
                <Button size="sm" onClick={() => setIsBillModalOpen(true)} className="h-7 text-xs bg-purple-700 hover:bg-purple-800 text-white">
                  <ReceiptText className="w-3.5 h-3.5 mr-1" /> Enter Bill
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-resort-charcoal">
                  <thead className="bg-resort-ivory/40 text-resort-stone uppercase font-medium border-b border-resort-sand/40">
                    <tr>
                      <th className="p-3">Internal Bill #</th>
                      <th className="p-3">Vendor Invoice #</th>
                      <th className="p-3">Vendor</th>
                      <th className="p-3">Total Amount</th>
                      <th className="p-3">Balance Due</th>
                      <th className="p-3">Due Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-resort-sand/20">
                    {bills.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-resort-stone">
                          No purchase bills recorded. Click "Enter Bill" to register a vendor invoice.
                        </td>
                      </tr>
                    ) : (
                      bills.map((b) => (
                        <tr key={b.id} className="hover:bg-resort-ivory/30">
                          <td className="p-3 font-semibold text-purple-900">{b.billNumber}</td>
                          <td className="p-3 font-bold text-resort-charcoal">{b.vendorBillNo}</td>
                          <td className="p-3">{b.vendor?.name}</td>
                          <td className="p-3 font-medium">₹{b.totalAmount}</td>
                          <td className="p-3 font-bold text-rose-700">₹{b.balanceDue}</td>
                          <td className="p-3 text-resort-stone">{new Date(b.dueDate).toLocaleDateString()}</td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase ${
                                b.status === 'PAID'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : b.status === 'PARTIALLY_PAID'
                                  ? 'bg-blue-50 text-blue-800 border-blue-300'
                                  : 'bg-rose-50 text-rose-800 border-rose-300'
                              }`}
                            >
                              {b.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-right space-x-1.5">
                            {b.status === 'PENDING_VERIFICATION' && (
                              <Button
                                size="sm"
                                onClick={() => handleVerifyBill(b.id)}
                                disabled={actionLoading}
                                className="h-6 text-[10px] bg-purple-700 hover:bg-purple-800 text-white"
                              >
                                Verify
                              </Button>
                            )}
                            {parseFloat(b.balanceDue) > 0 && (
                              <Button
                                size="sm"
                                onClick={() => setIsPaymentModalOpen(true)}
                                className="h-6 text-[10px] bg-emerald-700 hover:bg-emerald-800 text-white"
                              >
                                Pay
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* 6. PAYMENTS TAB */}
          {activeTab === 'payments' && (
            <Card className="border-resort-sand bg-white shadow-sm overflow-hidden">
              <div className="p-3 border-b border-resort-sand/50 flex justify-between items-center bg-resort-ivory/20">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-resort-charcoal">Vendor Payments & Allocations</h3>
                <Button size="sm" onClick={() => setIsPaymentModalOpen(true)} className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white">
                  <DollarSign className="w-3.5 h-3.5 mr-1" /> Record Payment
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-resort-charcoal">
                  <thead className="bg-resort-ivory/40 text-resort-stone uppercase font-medium border-b border-resort-sand/40">
                    <tr>
                      <th className="p-3">Payment #</th>
                      <th className="p-3">Vendor</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Method / UTR</th>
                      <th className="p-3">Allocated Bills</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-resort-sand/20">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-resort-stone">
                          No payments recorded yet. Click "Record Payment" to disburse funds against bills.
                        </td>
                      </tr>
                    ) : (
                      payments.map((p) => (
                        <tr key={p.id} className="hover:bg-resort-ivory/30">
                          <td className="p-3 font-semibold text-emerald-900">{p.paymentNumber}</td>
                          <td className="p-3">{p.vendor?.name}</td>
                          <td className="p-3 font-bold text-emerald-700">₹{p.amount}</td>
                          <td className="p-3">
                            <span className="font-medium">{p.paymentMethod}</span>
                            {p.transactionReference && (
                              <div className="text-[10px] text-resort-stone">Ref: {p.transactionReference}</div>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="text-[11px] text-resort-charcoal font-medium">
                              {p.allocations?.map((a: any) => `${a.purchaseBill?.vendorBillNo || 'Bill'} (₹${a.amountAllocated})`).join(', ')}
                            </div>
                          </td>
                          <td className="p-3 text-resort-stone">{new Date(p.paymentDate).toLocaleDateString()}</td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-300">
                              {p.status}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* 7. VENDORS TAB */}
          {activeTab === 'vendors' && (
            <Card className="border-resort-sand bg-white shadow-sm overflow-hidden">
              <div className="p-3 border-b border-resort-sand/50 flex justify-between items-center bg-resort-ivory/20">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-resort-charcoal">Vendor Directory</h3>
                <Button size="sm" onClick={() => setIsVendorModalOpen(true)} className="h-7 text-xs bg-resort-charcoal hover:bg-black text-white">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Onboard Vendor
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-resort-charcoal">
                  <thead className="bg-resort-ivory/40 text-resort-stone uppercase font-medium border-b border-resort-sand/40">
                    <tr>
                      <th className="p-3">Code</th>
                      <th className="p-3">Vendor / Entity</th>
                      <th className="p-3">Contact & Phone</th>
                      <th className="p-3">GSTIN / PAN</th>
                      <th className="p-3">Total Billed</th>
                      <th className="p-3">Outstanding</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-resort-sand/20">
                    {vendorsList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-resort-stone">
                          No vendors found. Click "Onboard Vendor" to register your first supplier.
                        </td>
                      </tr>
                    ) : (
                      vendorsList.map((v) => (
                        <tr key={v.id} className="hover:bg-resort-ivory/30">
                          <td className="p-3 font-semibold text-resort-charcoal">{v.vendorCode}</td>
                          <td className="p-3">
                            <div className="font-bold text-resort-charcoal">{v.name}</div>
                            <div className="text-[11px] text-resort-stone">{v.companyName}</div>
                          </td>
                          <td className="p-3">
                            <div>{v.phone}</div>
                            {v.contactPerson && <div className="text-[10px] text-resort-stone">{v.contactPerson}</div>}
                          </td>
                          <td className="p-3 text-[11px] font-mono">
                            <div>GST: {v.gstin || 'Unregistered'}</div>
                            {v.pan && <div>PAN: {v.pan}</div>}
                          </td>
                          <td className="p-3 font-medium">₹{v.totalBilled}</td>
                          <td className="p-3 font-bold text-rose-700">₹{v.totalOutstanding}</td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                v.isActive
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-stone-50 text-stone-700 border-stone-300'
                              }`}
                            >
                              {v.isActive ? 'ACTIVE' : 'INACTIVE'}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* DIALOG MODALS */}
      <CreatePrModal
        isOpen={isPrModalOpen}
        onClose={() => setIsPrModalOpen(false)}
        items={lookupItems}
        onSubmit={handleCreatePr}
        loading={actionLoading}
      />

      <CreatePoModal
        isOpen={isPoModalOpen}
        onClose={() => setIsPoModalOpen(false)}
        vendors={lookupVendors}
        items={lookupItems}
        onSubmit={handleCreatePo}
        loading={actionLoading}
      />

      <CreateGrnModal
        isOpen={isGrnModalOpen}
        onClose={() => {
          setIsGrnModalOpen(false);
          setSelectedPoForGrn(null);
        }}
        purchaseOrder={selectedPoForGrn}
        stores={lookupStores}
        onSubmit={handleCreateGrn}
        loading={actionLoading}
      />

      <CreateBillModal
        isOpen={isBillModalOpen}
        onClose={() => setIsBillModalOpen(false)}
        vendors={lookupVendors}
        purchaseOrders={orders}
        onSubmit={handleCreateBill}
        loading={actionLoading}
      />

      <CreatePaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        vendors={lookupVendors}
        unpaidBills={bills}
        onSubmit={handleCreatePayment}
        loading={actionLoading}
      />

      <CreateVendorModal
        isOpen={isVendorModalOpen}
        onClose={() => setIsVendorModalOpen(false)}
        onSubmit={handleCreateVendor}
        loading={actionLoading}
      />
    </div>
  );
}