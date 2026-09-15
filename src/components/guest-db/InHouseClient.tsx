'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentlyStayingAction, postGuestChargeAction } from '@/actions/guest-db';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Bed, Users, CreditCard, Receipt, PlusCircle, X,
  AlertTriangle, Clock, TrendingUp, DollarSign, Filter,
} from 'lucide-react';

interface InHouseRoom {
  stayId: string;
  stayNumber: string;
  guestName: string;
  guestId: string;
  phone: string;
  email: string | null;
  roomNumber: string;
  roomTypeName: string;
  roomFloor: string | null;
  building: string | null;
  actualCheckIn: string;
  expectedCheckOut: string;
  nights: number;
  nightsRemaining: number;
  folioBalance: string;
  totalPaid: string;
  outstandingBalance: string;
  reservationNumber: string | null;
  bookingSource: string | null;
  isOverdue: boolean;
  isLongStay: boolean;
  hasOutstandingBalance: boolean;
  lastPaymentDate: string | null;
  lastPaymentMethod: string | null;
}

interface InHouseSummary {
  totalInHouse: number;
  arrivalsToday: number;
  departuresToday: number;
  overdueCheckouts: number;
  totalFolioBalance: string;
  totalOutstanding: string;
}

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  return '\u20B9' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatINRAmount(amount: string): string {
  const num = parseFloat(amount);
  return '\u20B9' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export function InHouseClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rooms, setRooms] = useState<InHouseRoom[]>([]);
  const [summary, setSummary] = useState<InHouseSummary | null>(null);
  const [showPostCharge, setShowPostCharge] = useState<string | null>(null);
  const [chargeForm, setChargeForm] = useState({ description: '', amount: '' });
  const [chargeResult, setChargeResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const loadData = (status?: string) => {
    startTransition(async () => {
      const result = await getCurrentlyStayingAction({ status: status || statusFilter });
      setRooms(result.rooms);
      setSummary(result.summary);
    });
  };

  useEffect(() => { loadData(); }, []);

  const handleFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    loadData(newStatus);
  };

  const openPostCharge = (stayId: string) => {
    setShowPostCharge(stayId);
    setChargeResult(null);
    setChargeForm({ description: '', amount: '' });
  };

  const submitCharge = async () => {
    if (!showPostCharge || !chargeForm.description || !chargeForm.amount) return;

    try {
      await postGuestChargeAction({
        stayId: showPostCharge,
        description: chargeForm.description,
        amount: parseFloat(chargeForm.amount),
      });
      setChargeResult({ success: true });
      setTimeout(() => {
        setShowPostCharge(null);
        loadData();
      }, 1500);
    } catch (err: any) {
      setChargeResult({ success: false, error: err.message || 'Failed to post charge' });
    }
  };

  if (isPending && rooms.length === 0) {
    return <div className="text-center py-12 text-neutral-500 text-sm">Loading in-house guests...</div>;
  }

  return (
    <div>
      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-white border border-resort-sand/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Bed className="h-3.5 w-3.5 text-resort-forest" />
              <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">In House</span>
            </div>
            <div className="text-xl font-bold text-resort-charcoal">{summary.totalInHouse}</div>
          </div>
          <div className="bg-white border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-[10px] font-medium text-blue-600 uppercase tracking-wider">Arrivals Today</span>
            </div>
            <div className="text-xl font-bold text-blue-700">{summary.arrivalsToday}</div>
          </div>
          <div className="bg-white border border-amber-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-[10px] font-medium text-amber-600 uppercase tracking-wider">Departures Today</span>
            </div>
            <div className="text-xl font-bold text-amber-700">{summary.departuresToday}</div>
          </div>
          <div className={`bg-white border rounded-lg p-3 ${summary.overdueCheckouts > 0 ? 'border-red-200' : 'border-neutral-200'}`}>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className={`h-3.5 w-3.5 ${summary.overdueCheckouts > 0 ? 'text-red-600' : 'text-neutral-400'}`} />
              <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Overdue</span>
            </div>
            <div className={`text-xl font-bold ${summary.overdueCheckouts > 0 ? 'text-red-700' : 'text-neutral-700'}`}>{summary.overdueCheckouts}</div>
          </div>
          <div className="bg-white border border-resort-sand/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-red-600" />
              <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Outstanding</span>
            </div>
            <div className="text-lg font-bold text-red-700">{formatINR(summary.totalOutstanding)}</div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-4">
        {[
          { value: 'all', label: 'All' },
          { value: 'arrivals_today', label: 'Arrivals Today' },
          { value: 'departures_today', label: 'Departures Today' },
          { value: 'long_stay', label: 'Long Stay (7+)' },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleFilterChange(opt.value)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              statusFilter === opt.value
                ? 'bg-resort-forest text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Room Cards */}
      {rooms.length === 0 ? (
        <div className="text-center py-12">
          <Bed className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-neutral-500">No in-house guests</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <Card
              key={room.stayId}
              className={`border-resort-sand/60 transition-colors hover:border-resort-forest/30 ${
                room.isOverdue ? 'border-red-300 bg-red-50/20' : ''
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-mono text-lg font-bold text-resort-forest">{room.roomNumber}</div>
                    <div className="text-xs text-neutral-500">{room.roomTypeName}</div>
                    {room.roomFloor && (
                      <div className="text-[10px] text-neutral-400">Floor {room.roomFloor}{room.building ? `, ${room.building}` : ''}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-neutral-700">{room.stayNumber}</div>
                    {room.isOverdue && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-red-600 font-medium mt-0.5">
                        <AlertTriangle className="h-2.5 w-2.5" /> Overdue
                      </span>
                    )}
                    {room.isLongStay && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-600 font-medium mt-0.5">
                        <Clock className="h-2.5 w-2.5" /> Long Stay
                      </span>
                    )}
                  </div>
                </div>

                <div className="mb-3">
                  <div className="text-sm font-medium text-resort-charcoal">{room.guestName}</div>
                  {room.phone && <div className="text-[10px] text-neutral-500">{room.phone}</div>}
                </div>

                <div className="space-y-1 text-xs mb-3">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Check-in</span>
                    <span>{formatDate(room.actualCheckIn)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Checkout</span>
                    <span className={room.isOverdue ? 'text-red-600 font-medium' : ''}>{formatDate(room.expectedCheckOut)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Nights</span>
                    <span>{room.nights} ({room.nightsRemaining} remaining)</span>
                  </div>
                  {room.reservationNumber && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Reservation</span>
                      <span className="font-mono text-[10px]">{room.reservationNumber}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-neutral-100 pt-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Folio Balance</span>
                    <span className="font-medium">{formatINRAmount(room.folioBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Paid</span>
                    <span className="font-medium text-emerald-600">{formatINRAmount(room.totalPaid)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Outstanding</span>
                    <span className={room.hasOutstandingBalance ? 'text-red-600' : 'text-emerald-600'}>
                      {formatINRAmount(room.outstandingBalance)}
                    </span>
                  </div>
                  {room.lastPaymentDate && (
                    <div className="flex justify-between text-[10px]">
                      <span className="text-neutral-400">Last Payment</span>
                      <span className="text-neutral-400">{formatDate(room.lastPaymentDate)} via {room.lastPaymentMethod}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={() => openPostCharge(room.stayId)}
                    variant="outline"
                    size="sm"
                    className="flex-1 text-[10px]"
                  >
                    <PlusCircle className="h-3 w-3 mr-1" />
                    Post Charge
                  </Button>
                  <Button
                    onClick={() => router.push(`/admin/guests/${room.guestId}/stays/${room.stayId}`)}
                    variant="outline"
                    size="sm"
                    className="flex-1 text-[10px]"
                  >
                    <Receipt className="h-3 w-3 mr-1" />
                    View Bill
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Post Charge Modal */}
      {showPostCharge && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-resort-charcoal">Post Ad-Hoc Charge</h3>
              <button onClick={() => setShowPostCharge(null)} className="text-neutral-400 hover:text-neutral-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-neutral-600 uppercase tracking-wider mb-1">Description</label>
                <Input
                  value={chargeForm.description}
                  onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })}
                  placeholder="e.g. Minibar consumption, Extra bed, etc."
                  className="text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-neutral-600 uppercase tracking-wider mb-1">Amount (INR)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={chargeForm.amount}
                  onChange={(e) => setChargeForm({ ...chargeForm, amount: e.target.value })}
                  placeholder="0.00"
                  className="text-xs"
                />
              </div>

              {chargeResult && (
                <div className={`text-xs p-2 rounded ${chargeResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {chargeResult.success ? 'Charge posted successfully!' : chargeResult.error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={() => setShowPostCharge(null)} variant="outline" size="sm" className="flex-1 text-xs">
                  Cancel
                </Button>
                <Button
                  onClick={submitCharge}
                  disabled={!chargeForm.description || !chargeForm.amount}
                  size="sm"
                  className="flex-1 text-xs bg-resort-forest text-white hover:bg-resort-forest/90"
                >
                  Post Charge
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
