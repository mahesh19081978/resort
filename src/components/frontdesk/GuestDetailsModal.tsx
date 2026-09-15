'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addOccupantAction, removeOccupantAction, transferPrimaryGuestAction, getStayDetailAction } from '@/actions/frontdesk';
import type { StayDetailData } from '@/lib/guest-db/stay-detail';
import {
  X,
  User,
  Phone,
  Mail,
  Calendar,
  Clock,
  BedDouble,
  CreditCard,
  FileText,
  Loader2,
  AlertCircle,
  Receipt,
  UserPlus,
  Trash2,
  Crown,
  CheckCircle2,
} from 'lucide-react';

interface GuestDetailsModalProps {
  stayId: string;
  guestName: string;
  roomNumber: string;
  onClose: () => void;
}

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function maskIdNumber(idNumber: string): string {
  if (!idNumber || idNumber.length <= 4) return '****';
  return '****' + idNumber.slice(-4);
}

export function GuestDetailsModal({ stayId, guestName, roomNumber, onClose }: GuestDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<StayDetailData | null>(null);

  // Add occupant state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFirstName, setAddFirstName] = useState('');
  const [addLastName, setAddLastName] = useState('');
  const [addGender, setAddGender] = useState('MALE');
  const [addPhone, setAddPhone] = useState('');
  const [addIdType, setAddIdType] = useState('AADHAAR');
  const [addIdNumber, setAddIdNumber] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await getStayDetailAction(stayId);
      if (res.success && res.data) {
        setDetail(res.data);
      } else {
        setError(res.error || 'Failed to load guest details');
      }
      setLoading(false);
    } catch (e) {
      setError('Failed to load guest details');
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [stayId]);

  const handleAddOccupant = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError(null);

    const formData = new FormData();
    formData.append('stayId', stayId);
    formData.append('firstName', addFirstName.trim());
    formData.append('lastName', addLastName.trim());
    formData.append('gender', addGender);
    if (addPhone.trim()) formData.append('phone', addPhone.trim());
    formData.append('idDocumentType', addIdType);
    formData.append('idDocumentNumber', addIdNumber.trim());

    const res = await addOccupantAction(null, formData);

    setActionLoading(false);

    if (res.success) {
      setShowAddForm(false);
      setAddFirstName('');
      setAddLastName('');
      setAddPhone('');
      setAddIdNumber('');
      load();
    } else {
      setActionError(res.error || 'Failed to add occupant');
    }
  };

  const handleRemoveOccupant = async (stayGuestId: string, name: string) => {
    const reason = window.prompt(`Enter reason for removing ${name} from this stay:`);
    if (!reason || reason.trim().length === 0) return;

    setActionLoading(true);
    setActionError(null);

    const formData = new FormData();
    formData.append('stayId', stayId);
    formData.append('stayGuestId', stayGuestId);
    formData.append('reason', reason.trim());

    const res = await removeOccupantAction(null, formData);

    setActionLoading(false);

    if (res.success) {
      load();
    } else {
      setActionError(res.error || 'Failed to remove occupant');
    }
  };

  const handleTransferPrimary = async (targetStayGuestId: string, name: string) => {
    const confirmed = window.confirm(`Make ${name} the PRIMARY guest for this stay?`);
    if (!confirmed) return;

    setActionLoading(true);
    setActionError(null);

    const formData = new FormData();
    formData.append('stayId', stayId);
    formData.append('newPrimaryStayGuestId', targetStayGuestId);

    const res = await transferPrimaryGuestAction(null, formData);

    setActionLoading(false);

    if (res.success) {
      load();
    } else {
      setActionError(res.error || 'Failed to transfer primary guest');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto border-resort-sand bg-white shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-resort-sand">
          <div>
            <CardTitle className="text-lg font-serif text-resort-charcoal-text flex items-center gap-2">
              <User className="w-5 h-5 text-resort-forest" />
              {guestName}
            </CardTitle>
            <p className="text-xs text-resort-muted">Room {roomNumber} • Stay Details</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-resort-muted hover:text-resort-charcoal-text"
          >
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4 pt-4 text-xs">
          {loading && (
            <div className="flex items-center justify-center py-12 text-resort-muted">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading guest details...
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {actionError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {actionError}
            </div>
          )}

          {detail && (
            <>
              {/* Primary Guest & Room Info */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-resort-sand-light rounded-lg">
                <div className="space-y-2">
                  <div>
                    <span className="font-semibold text-resort-charcoal-text">Guest Name</span>
                    <span className="ml-1 text-resort-muted">{detail.primaryGuest.firstName} {detail.primaryGuest.lastName}</span>
                  </div>
                  {detail.primaryGuest.phone && (
                    <div className="flex items-center gap-1 text-resort-muted">
                      <Phone className="w-3 h-3" />
                      <span>{detail.primaryGuest.phone}</span>
                    </div>
                  )}
                  {detail.primaryGuest.email && (
                    <div className="flex items-center gap-1 text-resort-muted">
                      <Mail className="w-3 h-3" />
                      <span>{detail.primaryGuest.email}</span>
                    </div>
                  )}
                  <div>
                    <span className="font-semibold text-resort-charcoal-text">Status</span>
                    <Badge variant={detail.status === 'ACTIVE' ? 'success' : 'secondary'} className="ml-1 text-[10px]">
                      {detail.status}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  {detail.roomAssignments[0] && (
                    <>
                      <div>
                        <span className="font-semibold text-resort-charcoal-text">Room</span>
                        <span className="ml-1 text-resort-muted">{detail.roomAssignments[0].roomNumber}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-resort-charcoal-text">Room Type</span>
                        <span className="ml-1 text-resort-muted">{detail.roomAssignments[0].roomTypeName}</span>
                      </div>
                    </>
                  )}
                  <div>
                    <span className="font-semibold text-resort-charcoal-text">Active Occupants</span>
                    <span className="ml-1 text-resort-muted">
                      {detail.accompanyingGuests.filter((g) => g.isActive).length} guest(s)
                    </span>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-2 bg-resort-sand-light rounded">
                  <div className="flex items-center gap-1 text-resort-muted mb-1">
                    <Calendar className="w-3 h-3" /> Check-in
                  </div>
                  <span className="font-medium text-resort-charcoal-text">{formatDateTime(detail.actualCheckIn)}</span>
                </div>
                <div className="p-2 bg-resort-sand-light rounded">
                  <div className="flex items-center gap-1 text-resort-muted mb-1">
                    <Clock className="w-3 h-3" /> Expected Checkout
                  </div>
                  <span className="font-medium text-resort-charcoal-text">{formatDate(detail.expectedCheckOut)}</span>
                </div>
                <div className="p-2 bg-resort-sand-light rounded">
                  <div className="flex items-center gap-1 text-resort-muted mb-1">
                    <Clock className="w-3 h-3" /> Actual Checkout
                  </div>
                  <span className="font-medium text-resort-charcoal-text">
                    {detail.actualCheckOut ? formatDateTime(detail.actualCheckOut) : '—'}
                  </span>
                </div>
              </div>

              {/* All Stay Occupants Management */}
              <div className="space-y-2 pt-1 border-t border-resort-sand">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase font-semibold text-resort-muted tracking-wider">
                    Room Occupants ({detail.accompanyingGuests.filter((g) => g.isActive).length} Active)
                  </p>
                  {detail.status === 'ACTIVE' && !showAddForm && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] border-resort-sand text-resort-forest hover:bg-resort-sand-light"
                      onClick={() => setShowAddForm(true)}
                    >
                      <UserPlus className="w-3 h-3 mr-1" /> Add Occupant
                    </Button>
                  )}
                </div>

                {/* Inline Add Occupant Form */}
                {showAddForm && (
                  <form onSubmit={handleAddOccupant} className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-3">
                    <div className="font-semibold text-xs text-resort-charcoal">Add Occupant to Room</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px]">First Name *</Label>
                        <Input
                          value={addFirstName}
                          onChange={(e) => setAddFirstName(e.target.value)}
                          required
                          className="h-7 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Last Name *</Label>
                        <Input
                          value={addLastName}
                          onChange={(e) => setAddLastName(e.target.value)}
                          required
                          className="h-7 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Gender *</Label>
                        <select
                          value={addGender}
                          onChange={(e) => setAddGender(e.target.value)}
                          className="w-full h-7 rounded border border-neutral-300 bg-white px-2 text-xs"
                        >
                          <option value="MALE">Male</option>
                          <option value="FEMALE">Female</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[10px]">ID Type *</Label>
                        <select
                          value={addIdType}
                          onChange={(e) => setAddIdType(e.target.value)}
                          className="w-full h-7 rounded border border-neutral-300 bg-white px-2 text-xs"
                        >
                          <option value="AADHAAR">Aadhaar</option>
                          <option value="PASSPORT">Passport</option>
                          <option value="DRIVING_LICENSE">Driving License</option>
                          <option value="VOTER_ID">Voter ID</option>
                          <option value="PAN_CARD">PAN Card</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[10px]">ID Number *</Label>
                        <Input
                          value={addIdNumber}
                          onChange={(e) => setAddIdNumber(e.target.value)}
                          required
                          placeholder="Min 3 characters"
                          className="h-7 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Phone (Optional)</Label>
                        <Input
                          value={addPhone}
                          onChange={(e) => setAddPhone(e.target.value)}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setShowAddForm(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={actionLoading}
                        className="h-7 text-xs bg-resort-forest text-white hover:bg-resort-forest-light"
                      >
                        {actionLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        Save Occupant
                      </Button>
                    </div>
                  </form>
                )}

                {/* Occupants List */}
                <div className="divide-y divide-resort-sand/60 border border-resort-sand rounded-lg overflow-hidden">
                  {detail.accompanyingGuests.map((g) => {
                    const docs = g.documents && g.documents.length > 0 ? g.documents : [];
                    return (
                      <div
                        key={g.id}
                        className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                          !g.isActive ? 'bg-neutral-50 opacity-60' : 'bg-white'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-resort-charcoal text-sm">
                              {g.firstName} {g.lastName}
                            </span>
                            {g.gender && (
                              <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                                {g.gender}
                              </Badge>
                            )}
                            {g.isPrimary ? (
                              <Badge variant="success" className="text-[9px] py-0 px-1.5 flex items-center gap-0.5">
                                <Crown className="w-2.5 h-2.5" /> PRIMARY GUEST
                              </Badge>
                            ) : g.isActive ? (
                              <Badge variant="secondary" className="text-[9px] py-0 px-1 font-normal">
                                ADDITIONAL GUEST
                              </Badge>
                            ) : null}
                            {!g.isActive && (
                              <Badge variant="danger" className="text-[9px] py-0 px-1">
                                DEPARTED {g.leftAt ? `(${formatDate(g.leftAt)})` : ''}
                              </Badge>
                            )}
                          </div>

                          <div className="text-[11px] text-resort-muted flex items-center gap-3 flex-wrap">
                            {docs.length > 0 ? (
                              docs.map((d) => (
                                <span key={d.id} className="inline-flex items-center gap-1 bg-neutral-100 px-2 py-0.5 rounded text-neutral-800">
                                  <FileText className="w-3 h-3 text-neutral-500" />
                                  <span className="font-medium">{d.documentType.replace('_', ' ')}:</span>
                                  <span className="font-mono">{d.documentNumber}</span>
                                  <span className={`text-[9px] px-1 py-0.2 rounded font-medium ${
                                    d.verificationStatus === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {d.verificationStatus}
                                  </span>
                                </span>
                              ))
                            ) : (
                              <span className="italic text-neutral-400">No ID document registered</span>
                            )}
                            {g.phone && <span className="font-mono">Phone: {g.phone}</span>}
                            {g.removedReason && <span>• Reason: {g.removedReason}</span>}
                          </div>
                        </div>

                        {/* Occupant Actions */}
                        {detail.status === 'ACTIVE' && g.isActive && (
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                            {!g.isPrimary && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px] text-amber-700 hover:text-amber-800 hover:bg-amber-50 px-2"
                                  onClick={() => handleTransferPrimary(g.id, `${g.firstName} ${g.lastName}`)}
                                  disabled={actionLoading}
                                  title="Promote to Primary Guest"
                                >
                                  <Crown className="w-3 h-3 mr-1" /> Make Primary
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2"
                                  onClick={() => handleRemoveOccupant(g.id, `${g.firstName} ${g.lastName}`)}
                                  disabled={actionLoading}
                                  title="Remove Occupant from Stay"
                                >
                                  <Trash2 className="w-3 h-3 mr-1" /> Remove
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Financial Summary */}
              <div className="p-3 bg-resort-sand-light rounded-lg space-y-1.5">
                <p className="text-[10px] uppercase font-semibold text-resort-muted tracking-wider mb-2">Folio Summary</p>
                <div className="flex justify-between text-xs">
                  <span className="text-resort-muted">Total Charges</span>
                  <span className="font-mono font-medium text-resort-charcoal-text">{formatINR(detail.financialSummary.grossCharges)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-resort-muted">Total Paid</span>
                  <span className="font-mono font-semibold text-emerald-700">{formatINR(detail.financialSummary.totalPaid)}</span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-resort-sand">
                  <span className="font-semibold text-resort-charcoal-text">Balance</span>
                  <span className={`font-mono font-bold ${parseFloat(detail.financialSummary.outstandingBalance) > 0.01 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {formatINR(detail.financialSummary.outstandingBalance)}
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>

        <div className="p-4 pt-0 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs border-resort-sand"
          >
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
