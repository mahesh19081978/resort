'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardList,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Building2,
  Boxes,
  ArrowLeftRight,
  X,
  AlertCircle,
  FileCheck,
} from 'lucide-react';
import {
  getStockRequestsAction,
  getStockRequestLookupDataAction,
  createStockRequestAction,
  submitStockRequestAction,
  approveStockRequestAction,
  rejectStockRequestAction,
  cancelStockRequestAction,
  issueAndTransferStockAction,
} from '@/actions/inventory';
import {
  CreateStockRequestModal,
  ApproveStockRequestModal,
  RejectStockRequestModal,
  IssueStockRequestModal,
  StockRequestLookupItem,
  StockRequestLookupStore,
} from './StockRequestModals';
import Link from 'next/link';

type TabType = 'ALL' | 'MY_REQUESTS' | 'SUBMITTED' | 'APPROVED' | 'FULFILLED' | 'REJECTED' | 'CANCELLED';

export function StockRequestsConsoleClient() {
  const [activeTab, setActiveTab] = useState<TabType>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Lookups & Data
  const [requests, setRequests] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);
  const [lookupItems, setLookupItems] = useState<StockRequestLookupItem[]>([]);
  const [lookupStores, setLookupStores] = useState<StockRequestLookupStore[]>([]);
  const [centralStockMap, setCentralStockMap] = useState<Record<string, string>>({});

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedRequestForDetail, setSelectedRequestForDetail] = useState<any>(null);
  const [selectedRequestForApprove, setSelectedRequestForApprove] = useState<any>(null);
  const [selectedRequestForReject, setSelectedRequestForReject] = useState<any>(null);
  const [selectedRequestForIssue, setSelectedRequestForIssue] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [lookupsRes, requestsRes] = await Promise.all([
        getStockRequestLookupDataAction(),
        getStockRequestsAction({ take: 100 }),
      ]);

      if (lookupsRes.success && lookupsRes.data) {
        const data: any = lookupsRes.data;
        setCurrentUser(data.currentUser);
        setLookupItems(data.items);
        setLookupStores(data.stores);
        setCentralStockMap(data.centralStockMap);
      }

      if (requestsRes.success && requestsRes.data) {
        const data: any = requestsRes.data;
        setRequests(data.requests);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load stock requests' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered requests
  const filteredRequests = requests.filter((r) => {
    // Tab filter
    if (activeTab === 'MY_REQUESTS') {
      if (r.requestedById !== currentUser?.id) return false;
    } else if (activeTab === 'SUBMITTED') {
      if (r.status !== 'SUBMITTED') return false;
    } else if (activeTab === 'APPROVED') {
      if (r.status !== 'APPROVED' && r.status !== 'PARTIALLY_APPROVED') return false;
    } else if (activeTab === 'FULFILLED') {
      if (r.status !== 'FULFILLED') return false;
    } else if (activeTab === 'REJECTED') {
      if (r.status !== 'REJECTED') return false;
    } else if (activeTab === 'CANCELLED') {
      if (r.status !== 'CANCELLED') return false;
    }

    // Department filter
    if (selectedDepartment !== 'ALL' && r.department !== selectedDepartment) {
      return false;
    }

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchNum = r.requestNumber.toLowerCase().includes(q);
      const matchDept = r.department.toLowerCase().includes(q);
      const matchStore = r.destinationStore?.name?.toLowerCase().includes(q);
      const matchUser = r.requestedBy?.name?.toLowerCase().includes(q);
      const matchItem = r.items?.some((it: any) => it.inventoryItem?.name?.toLowerCase().includes(q));
      if (!matchNum && !matchDept && !matchStore && !matchUser && !matchItem) return false;
    }

    return true;
  });

  // Action handlers
  const handleCreate = async (data: any) => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await createStockRequestAction(data);
      if (!res.success) throw new Error(res.error);
      setMessage({ type: 'success', text: `Stock Request #${res.data.requestNumber} created successfully!` });
      setIsCreateOpen(false);
      await loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to create stock request' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitDraft = async (requestId: string) => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await submitStockRequestAction(requestId);
      if (!res.success) throw new Error(res.error);
      setMessage({ type: 'success', text: `Request #${res.data.requestNumber} submitted for Store approval.` });
      setSelectedRequestForDetail(null);
      await loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to submit stock request' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (data: any) => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await approveStockRequestAction(data);
      if (!res.success) throw new Error(res.error);
      setMessage({
        type: 'success',
        text: `Request #${res.data.requestNumber} approved with status [${res.data.status}]. Ready for warehouse issue.`,
      });
      setSelectedRequestForApprove(null);
      setSelectedRequestForDetail(null);
      await loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to approve stock request' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (data: any) => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await rejectStockRequestAction(data);
      if (!res.success) throw new Error(res.error);
      setMessage({ type: 'success', text: `Request #${res.data.requestNumber} rejected.` });
      setSelectedRequestForReject(null);
      setSelectedRequestForDetail(null);
      await loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to reject stock request' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (requestId: string) => {
    if (!confirm('Are you sure you want to cancel this stock request?')) return;
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await cancelStockRequestAction({ requestId, reason: 'Cancelled by user' });
      if (!res.success) throw new Error(res.error);
      setMessage({ type: 'success', text: `Request #${res.data.requestNumber} cancelled.` });
      setSelectedRequestForDetail(null);
      await loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to cancel stock request' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleIssue = async (data: any) => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await issueAndTransferStockAction(data);
      if (!res.success) throw new Error(res.error);
      setMessage({
        type: 'success',
        text: `Internal Issue & Handover complete! Stock transfer #${res.data.transfer.transferNumber} received, destination stock updated, and request fulfilled.`,
      });
      setSelectedRequestForIssue(null);
      setSelectedRequestForDetail(null);
      await loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to issue/transfer stock' });
    } finally {
      setActionLoading(false);
    }
  };

  const canApproveOrIssue =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'STORE_MANAGER';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/admin/inventory" className="text-xs text-resort-stone hover:underline">
              ← Inventory Ledger
            </Link>
            <span className="text-xs text-resort-stone">•</span>
            <span className="text-xs font-semibold text-resort-forest">Stock Requests Console</span>
          </div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal mt-1">
            Department Stock Requests & Store Issue
          </h1>
          <p className="text-xs text-resort-stone mt-1">
            Manage internal raw material replenishment between Central Warehouse and Department Stores (Kitchen, Bar, Housekeeping, Maintenance, Garden).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-resort-forest hover:bg-resort-forest/90 text-white text-xs font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" /> New Stock Request
          </Button>
        </div>
      </div>

      {/* Alert banner */}
      {message && (
        <div
          className={`p-3 rounded-md text-xs flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-stone-400 hover:text-stone-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs and Filter Bar */}
      <Card className="border-border bg-white">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'ALL', label: 'All Requests' },
                  { id: 'MY_REQUESTS', label: 'My Requests' },
                  { id: 'SUBMITTED', label: 'Pending Approval' },
                  { id: 'APPROVED', label: 'Approved (To Issue)' },
                  { id: 'FULFILLED', label: 'Fulfilled' },
                  { id: 'REJECTED', label: 'Rejected' },
                  { id: 'CANCELLED', label: 'Cancelled' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-resort-forest text-white shadow-xs'
                      : 'text-resort-stone hover:text-resort-charcoal hover:bg-stone-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-resort-stone font-medium">Department:</span>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="px-2.5 py-1 text-xs border rounded-md bg-white text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-forest"
              >
                <option value="ALL">All Departments</option>
                <option value="Kitchen">Kitchen</option>
                <option value="Bar">Bar</option>
                <option value="Housekeeping">Housekeeping</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Garden">Garden</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-resort-stone" />
              <Input
                placeholder="Search by request #, department, store, requester, or item name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card className="border-border bg-white shadow-xs">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-stone-50/70 text-resort-stone uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Request #</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Destination Store</th>
                  <th className="py-3 px-4">Requester</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-resort-stone">
                      Loading stock requests...
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-resort-stone italic">
                      No stock requests found matching the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((req) => {
                    const isDraft = req.status === 'DRAFT';
                    const isSubmitted = req.status === 'SUBMITTED';
                    const isApproved = req.status === 'APPROVED' || req.status === 'PARTIALLY_APPROVED';
                    const isFulfilled = req.status === 'FULFILLED';
                    const isRejected = req.status === 'REJECTED';
                    const isCancelled = req.status === 'CANCELLED';

                    return (
                      <tr key={req.id} className="hover:bg-resort-sand/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-resort-charcoal">
                          <button
                            onClick={() => setSelectedRequestForDetail(req)}
                            className="hover:underline text-resort-forest"
                          >
                            {req.requestNumber}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-semibold text-resort-charcoal">{req.department}</td>
                        <td className="py-3 px-4 text-resort-stone">
                          {req.destinationStore?.name}
                          <span className="font-mono text-[10px] block text-stone-400">
                            {req.destinationStore?.code}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-resort-stone">
                          {req.requestedBy?.name}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-medium">{req.items.length} items</span>
                          <span className="text-[10px] text-resort-stone block truncate max-w-[140px]">
                            {req.items.map((i: any) => i.inventoryItem?.name).join(', ')}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className={
                              isFulfilled
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                                : isApproved
                                ? 'bg-blue-50 text-blue-700 border-blue-200 text-[10px]'
                                : isSubmitted
                                ? 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                                : isRejected || isCancelled
                                ? 'bg-rose-50 text-rose-700 border-rose-200 text-[10px]'
                                : 'bg-stone-100 text-stone-700 text-[10px]'
                            }
                          >
                            {req.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-resort-stone">
                          {new Date(req.createdAt).toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isDraft && req.requestedById === currentUser?.id && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSubmitDraft(req.id)}
                                disabled={actionLoading}
                                className="h-7 text-[11px] border-amber-500 text-amber-700 hover:bg-amber-50"
                              >
                                Submit
                              </Button>
                            )}

                            {isSubmitted && canApproveOrIssue && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => setSelectedRequestForApprove(req)}
                                  className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-medium"
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedRequestForReject(req)}
                                  className="h-7 text-[11px] border-rose-400 text-rose-700 hover:bg-rose-50"
                                >
                                  Reject
                                </Button>
                              </>
                            )}

                            {isApproved && canApproveOrIssue && (
                              <Button
                                size="sm"
                                onClick={() => setSelectedRequestForIssue(req)}
                                className="h-7 text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white font-medium shadow-xs"
                              >
                                Issue / Handover
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedRequestForDetail(req)}
                              className="h-7 text-[11px] text-resort-stone hover:text-resort-charcoal"
                            >
                              Details
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Request Detail Drawer / Modal */}
      {selectedRequestForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 shadow-xl max-h-[90vh] flex flex-col border border-border">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <div>
                <h2 className="text-lg font-serif font-bold text-resort-charcoal">
                  Stock Request #{selectedRequestForDetail.requestNumber}
                </h2>
                <p className="text-xs text-resort-stone">
                  Department: <span className="font-semibold">{selectedRequestForDetail.department}</span> • Target
                  Store: <span className="font-semibold">{selectedRequestForDetail.destinationStore?.name}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedRequestForDetail(null)}
                className="text-resort-stone hover:text-resort-charcoal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-stone-50 rounded-md">
                <div>
                  <span className="text-resort-stone">Source Warehouse:</span>
                  <p className="font-medium text-resort-charcoal">{selectedRequestForDetail.sourceStore?.name}</p>
                </div>
                <div>
                  <span className="text-resort-stone">Destination Store:</span>
                  <p className="font-medium text-resort-charcoal">{selectedRequestForDetail.destinationStore?.name}</p>
                </div>
                <div>
                  <span className="text-resort-stone">Requested By:</span>
                  <p className="font-medium text-resort-charcoal">
                    {selectedRequestForDetail.requestedBy?.name} ({selectedRequestForDetail.requestedBy?.email})
                  </p>
                </div>
                <div>
                  <span className="text-resort-stone">Status:</span>
                  <p className="font-semibold text-resort-charcoal">{selectedRequestForDetail.status}</p>
                </div>
                {selectedRequestForDetail.reason && (
                  <div className="col-span-2">
                    <span className="text-resort-stone">Reason / Justification:</span>
                    <p className="text-resort-charcoal italic">{selectedRequestForDetail.reason}</p>
                  </div>
                )}
                {selectedRequestForDetail.rejectionReason && (
                  <div className="col-span-2 p-2 bg-rose-50 border border-rose-200 rounded text-rose-900">
                    <span className="font-semibold">Rejection Reason:</span>
                    <p className="mt-0.5">{selectedRequestForDetail.rejectionReason}</p>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div>
                <h3 className="font-semibold text-resort-charcoal uppercase text-[11px] tracking-wider mb-2">
                  Line Items ({selectedRequestForDetail.items.length})
                </h3>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-stone-50 border-b text-resort-stone uppercase text-[10px]">
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-3 text-right">Requested</th>
                        <th className="py-2 px-3 text-right">Approved</th>
                        <th className="py-2 px-3 text-right">Unit</th>
                        <th className="py-2 px-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {selectedRequestForDetail.items.map((it: any) => (
                        <tr key={it.id}>
                          <td className="py-2 px-3 font-medium text-resort-charcoal">
                            {it.inventoryItem?.name}
                            <span className="font-mono text-[10px] block text-stone-400">
                              {it.inventoryItem?.code}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold">
                            {parseFloat(it.requestedQty.toString())}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-blue-700">
                            {parseFloat(it.approvedQty.toString())}
                          </td>
                          <td className="py-2 px-3 text-right text-resort-stone">{it.unit?.code}</td>
                          <td className="py-2 px-3 text-resort-stone italic">{it.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Linked Transfers */}
              {selectedRequestForDetail.transfers && selectedRequestForDetail.transfers.length > 0 && (
                <div className="pt-2">
                  <h3 className="font-semibold text-resort-charcoal uppercase text-[11px] tracking-wider mb-2">
                    Fulfillment Transfer Handover
                  </h3>
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                    {selectedRequestForDetail.transfers.map((tr: any) => (
                      <div key={tr.id} className="flex justify-between items-center text-xs">
                        <div>
                          <p className="font-mono font-bold text-emerald-950">{tr.transferNumber}</p>
                          <p className="text-[10px] text-emerald-800">
                            Status: <span className="font-semibold">{tr.status}</span> • Handover executed on premises
                          </p>
                        </div>
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-900 border-emerald-300">
                          Handover Received
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-4 flex justify-between items-center">
              <div>
                {(selectedRequestForDetail.status === 'DRAFT' ||
                  selectedRequestForDetail.status === 'SUBMITTED') &&
                  (selectedRequestForDetail.requestedById === currentUser?.id || canApproveOrIssue) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleCancel(selectedRequestForDetail.id)}
                      disabled={actionLoading}
                      className="text-xs text-rose-600 hover:bg-rose-50"
                    >
                      Cancel Request
                    </Button>
                  )}
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedRequestForDetail(null)}
                  className="text-xs"
                >
                  Close
                </Button>

                {selectedRequestForDetail.status === 'DRAFT' &&
                  selectedRequestForDetail.requestedById === currentUser?.id && (
                    <Button
                      onClick={() => handleSubmitDraft(selectedRequestForDetail.id)}
                      disabled={actionLoading}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                    >
                      Submit for Approval
                    </Button>
                  )}

                {selectedRequestForDetail.status === 'SUBMITTED' && canApproveOrIssue && (
                  <Button
                    onClick={() => {
                      setSelectedRequestForApprove(selectedRequestForDetail);
                    }}
                    disabled={actionLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                  >
                    Approve Request
                  </Button>
                )}

                {(selectedRequestForDetail.status === 'APPROVED' ||
                  selectedRequestForDetail.status === 'PARTIALLY_APPROVED') &&
                  canApproveOrIssue && (
                    <Button
                      onClick={() => {
                        setSelectedRequestForIssue(selectedRequestForDetail);
                      }}
                      disabled={actionLoading}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                    >
                      Issue / Handover
                    </Button>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateStockRequestModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        items={lookupItems}
        centralStockMap={centralStockMap}
        onSubmit={handleCreate}
        loading={actionLoading}
      />

      <ApproveStockRequestModal
        isOpen={!!selectedRequestForApprove}
        onClose={() => setSelectedRequestForApprove(null)}
        request={selectedRequestForApprove}
        centralStockMap={centralStockMap}
        onSubmit={handleApprove}
        loading={actionLoading}
      />

      <RejectStockRequestModal
        isOpen={!!selectedRequestForReject}
        onClose={() => setSelectedRequestForReject(null)}
        request={selectedRequestForReject}
        onSubmit={handleReject}
        loading={actionLoading}
      />

      <IssueStockRequestModal
        isOpen={!!selectedRequestForIssue}
        onClose={() => setSelectedRequestForIssue(null)}
        request={selectedRequestForIssue}
        centralStockMap={centralStockMap}
        onSubmit={handleIssue}
        loading={actionLoading}
      />
    </div>
  );
}
