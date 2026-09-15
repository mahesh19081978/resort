'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { investigateStayByDateAction } from '@/actions/guest-db';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Calendar, ArrowUpRight, DoorOpen, DoorClosed, Users,
  TrendingUp, DollarSign, Clock, Search, Filter, X,
} from 'lucide-react';

interface InvestigationResult {
  guestId: string;
  guestName: string;
  phone: string;
  email: string | null;
  stayId: string;
  stayNumber: string;
  reservationNumber: string | null;
  roomNumber: string;
  roomTypeName: string;
  actualCheckIn: string;
  expectedCheckOut: string;
  actualCheckOut: string | null;
  status: string;
  folioBalance: string;
  totalPaid: string;
  matchedActivity: string;
}

interface InvestigationSummary {
  checkIns: number;
  checkOuts: number;
  staying: number;
  totalRecords: number;
  totalRevenue: string;
  totalOutstanding: string;
  averageStayDuration: number;
}

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  if (num >= 10000000) return '\u20B9' + (num / 10000000).toFixed(1) + 'Cr';
  if (num >= 100000) return '\u20B9' + (num / 100000).toFixed(1) + 'L';
  return '\u20B9' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatINRAmount(amount: string): string {
  const num = parseFloat(amount);
  return '\u20B9' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    CHECKED_OUT: 'bg-neutral-50 text-neutral-600 ring-neutral-500/20',
    EARLY_CHECKOUT: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${variants[status] || 'bg-neutral-50 text-neutral-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function StayInvestigationClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dateFrom, setDateFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [results, setResults] = useState<InvestigationResult[]>([]);
  const [summary, setSummary] = useState<InvestigationSummary | null>(null);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const handleSearch = () => {
    if (!dateFrom) return;

    startTransition(async () => {
      try {
        const result = await investigateStayByDateAction({
          dateFrom,
          dateTo: dateTo || undefined,
          roomNumber: roomNumber || undefined,
          status: statusFilter,
        });

        setResults(result.results);
        setSummary(result.summary);
        setDateRange(result.dateRange);
        setSearched(true);
      } catch (error) {
        setResults([]);
        setSummary(null);
        setSearched(true);
      }
    });
  };

  return (
    <div>
      {/* Search Controls */}
      <div className="bg-white border border-resort-sand/60 rounded-lg p-4 mb-6">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] font-semibold text-neutral-600 uppercase tracking-wider mb-1">Date From</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-sm" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] font-semibold text-neutral-600 uppercase tracking-wider mb-1">Date To (Optional)</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-sm" />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium transition-colors ${
              showFilters ? 'bg-resort-forest text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            More Filters
          </button>
          <Button
            onClick={handleSearch}
            disabled={isPending || !dateFrom}
            className="bg-resort-forest text-white hover:bg-resort-forest/90"
          >
            {isPending ? 'Investigating...' : 'Investigate'}
          </Button>
        </div>

        {showFilters && (
          <div className="flex items-end gap-4 mt-3 pt-3 border-t border-neutral-200">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[10px] font-semibold text-neutral-600 uppercase tracking-wider mb-1">Room Number</label>
              <Input
                placeholder="e.g. A-101"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[10px] font-semibold text-neutral-600 uppercase tracking-wider mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="checked_out">Checked Out</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <button
              onClick={() => { setRoomNumber(''); setStatusFilter('all'); }}
              className="text-[10px] text-neutral-500 hover:text-red-600 flex items-center gap-1 pb-2"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DoorOpen className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Check-ins</span>
              </div>
              <div className="text-xl font-bold text-emerald-700">{summary.checkIns}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DoorClosed className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Check-outs</span>
              </div>
              <div className="text-xl font-bold text-amber-700">{summary.checkOuts}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-3.5 w-3.5 text-resort-forest" />
                <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">In-House</span>
              </div>
              <div className="text-xl font-bold text-resort-forest">{summary.staying}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-resort-gold" />
                <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Revenue</span>
              </div>
              <div className="text-lg font-bold text-resort-charcoal">{formatINR(summary.totalRevenue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-red-600" />
                <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Outstanding</span>
              </div>
              <div className="text-lg font-bold text-red-700">{formatINR(summary.totalOutstanding)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results */}
      {isPending && (
        <div className="text-center py-12 text-neutral-500 text-sm">Investigating...</div>
      )}

      {!isPending && searched && results.length === 0 && (
        <div className="text-center py-12">
          <Calendar className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-neutral-500">No stays found for the selected period</p>
          <p className="text-xs text-neutral-400 mt-1">
            {dateRange && `${formatDate(dateRange.from)}${dateRange.from !== dateRange.to ? ` to ${formatDate(dateRange.to)}` : ''}`}
          </p>
        </div>
      )}

      {!isPending && results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-neutral-500">
              {results.length} record{results.length !== 1 ? 's' : ''} found
              {dateRange && ` for ${formatDate(dateRange.from)}${dateRange.from !== dateRange.to ? ` to ${formatDate(dateRange.to)}` : ''}`}
            </span>
          </div>

          <div className="bg-white border border-resort-sand/60 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider">Guest</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider">Room</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider">Stay</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider">Check-in</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider">Checkout</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider text-right">Bill</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider">Activity</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.stayId} className="border-b border-neutral-100 hover:bg-neutral-50/50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-resort-charcoal">{r.guestName}</div>
                      <div className="text-neutral-500 text-[10px]">{r.phone}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono font-semibold text-resort-forest">{r.roomNumber}</span>
                      <div className="text-neutral-500 text-[10px]">{r.roomTypeName}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px]">{r.stayNumber}</td>
                    <td className="px-4 py-2.5 text-[10px]">{formatDateTime(r.actualCheckIn)}</td>
                    <td className="px-4 py-2.5 text-[10px]">
                      {r.actualCheckOut ? formatDateTime(r.actualCheckOut) : (
                        <span className="text-neutral-400">Expected {formatDate(r.expectedCheckOut)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatINRAmount(r.folioBalance)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] text-neutral-600 bg-neutral-50 px-1.5 py-0.5 rounded">{r.matchedActivity}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => router.push(`/admin/guests/${r.guestId}`)}
                          className="text-[10px] text-resort-forest hover:underline font-medium"
                        >
                          Profile
                        </button>
                        <span className="text-neutral-300">|</span>
                        <button
                          onClick={() => router.push(`/admin/guests/${r.guestId}/stays/${r.stayId}`)}
                          className="text-[10px] text-resort-gold hover:underline font-medium"
                        >
                          Stay
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
