'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getGuestProfileAction, getGuestPhotoAction, getGuestDocumentAction } from '@/actions/guest-db';
import { Button } from '@/components/ui/button';
import {
  User, Phone, Mail, MapPin, Calendar, CreditCard, Bed,
  FileText, Camera, Download, ChevronRight, Star, AlertTriangle,
  TrendingUp, Clock, DollarSign, Receipt, ArrowLeft, Building,
  Layers, DoorOpen, ExternalLink, Shield, Info,
} from 'lucide-react';

interface GuestProfileData {
  guest: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
    alternatePhone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    dateOfBirth: string | null;
    nationality: string | null;
    vip: boolean;
    blacklisted: boolean;
    notes: string | null;
    createdAt: string;
    stayCount: number;
    totalSpent: string;
    totalPaid: string;
    outstandingBalance: string;
    averageStayDuration: number;
    totalRoomNights: number;
    lastStayDate: string | null;
    lastStayRoom: string | null;
  };
  photo: { id: string; hasData: boolean; mimeType: string; capturedAt: string } | null;
  documents: Array<{
    id: string;
    documentType: string;
    maskedDocumentNumber: string;
    verificationStatus: string;
    uploadedAt: string;
    verifiedAt: string | null;
    verifiedByName: string | null;
  }>;
  stays: Array<{
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
    nights: number;
  }>;
  upcomingBookings: Array<{
    reservationId: string;
    reservationNumber: string;
    checkInDate: string;
    checkOutDate: string;
    roomTypeName: string;
    status: string;
    totalAmount: string;
    advancePaid: string;
    nights: number;
    source: string;
  }>;
  financialSummary: {
    totalBilled: string;
    totalPaid: string;
    outstandingBalance: string;
    averageBillPerStay: string;
    highestBill: string;
    lowestBill: string;
    totalTaxPaid: string;
    totalRefunds: string;
  };
}

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  return '\u20B9' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatINRAmount(amount: string): string {
  const num = parseFloat(amount);
  return '\u20B9' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function nightsBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function StatusBadge({ status, size = 'sm' }: { status: string; size?: 'xs' | 'sm' }) {
  const sizeClass = size === 'xs' ? 'text-[9px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5';
  const variants: Record<string, string> = {
    ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    CHECKED_OUT: 'bg-neutral-100 text-neutral-600 ring-neutral-400/20',
    EARLY_CHECKOUT: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    CANCELLED: 'bg-red-50 text-red-700 ring-red-600/20',
    PENDING: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    CONFIRMED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${sizeClass} ${variants[status] || 'bg-neutral-100 text-neutral-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function VerificationBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    VERIFIED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    PENDING: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    REJECTED: 'bg-red-50 text-red-700 ring-red-600/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-medium ring-1 ring-inset ${variants[status] || 'bg-neutral-100 text-neutral-600'}`}>
      {status}
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white border border-resort-sand/60 rounded-lg px-4 py-3 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3.5 w-3.5 ${accent || 'text-resort-forest'}`} />
        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className="text-base font-bold text-resort-charcoal truncate">{value}</div>
    </div>
  );
}

function GuestPhotoComponent({ photoData, photo, onCapture, isSensitive }: {
  photoData: string | null;
  photo: GuestProfileData['photo'];
  onCapture: () => void;
  isSensitive: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  if (!photo) {
    return (
      <div className="w-full aspect-[3/4] bg-neutral-50 rounded-lg border border-resort-sand/60 flex flex-col items-center justify-center text-neutral-400">
        <User className="h-10 w-10 mb-2 text-neutral-300" />
        <span className="text-[10px]">No photograph</span>
      </div>
    );
  }

  if (!photoData) {
    if (!isSensitive) {
      return (
        <div className="w-full aspect-[3/4] bg-neutral-50 rounded-lg border border-resort-sand/60 flex flex-col items-center justify-center text-neutral-400">
          <Shield className="h-8 w-8 mb-2 text-neutral-300" />
          <span className="text-[10px] font-medium">Photo protected</span>
          <span className="text-[9px] text-neutral-300 mt-0.5">Requires sensitive permission</span>
        </div>
      );
    }
    return (
      <button
        onClick={onCapture}
        className="w-full aspect-[3/4] bg-neutral-50 rounded-lg border border-resort-sand/60 flex flex-col items-center justify-center text-neutral-500 hover:bg-neutral-100 transition-colors"
      >
        <Camera className="h-8 w-8 mb-2 text-neutral-400" />
        <span className="text-[10px] font-medium">Load Photo</span>
      </button>
    );
  }

  return (
    <div className="w-full">
      <div className="w-full aspect-[3/4] rounded-lg overflow-hidden border border-resort-sand/60 bg-neutral-100">
        {!imgError ? (
          <img
            src={photoData}
            alt="Guest photograph"
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400">
            <Camera className="h-8 w-8 mb-2" />
            <span className="text-[10px]">Unable to load</span>
          </div>
        )}
      </div>
      <p className="text-[10px] text-neutral-400 mt-1.5 text-center">
        Captured {formatDate(photo.capturedAt)}
      </p>
    </div>
  );
}

export function GuestProfileClient() {
  const router = useRouter();
  const params = useParams();
  const guestId = params.guestId as string;
  const [isPending, startTransition] = useTransition();
  const [profile, setProfile] = useState<GuestProfileData | null>(null);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'stays' | 'upcoming' | 'documents' | 'financial'>('overview');
  const [hasSensitiveAccess, setHasSensitiveAccess] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const result = await getGuestProfileAction({ guestId });
      setProfile(result.profile);
      setHasSensitiveAccess(result.hasSensitiveAccess);

      if (result.hasSensitiveAccess && result.profile.photo) {
        try {
          const photo = await getGuestPhotoAction(guestId);
          if (photo) {
            setPhotoData(`data:${photo.mimeType};base64,${photo.fileDataBase64}`);
          }
        } catch {
          // insufficient permissions or no photo
        }
      }
    });
  }, [guestId]);

  const loadPhoto = async () => {
    try {
      const photo = await getGuestPhotoAction(guestId);
      if (photo) {
        setPhotoData(`data:${photo.mimeType};base64,${photo.fileDataBase64}`);
      }
    } catch {
      // insufficient permissions or no photo
    }
  };

  const loadDocument = async (docId: string) => {
    try {
      const doc = await getGuestDocumentAction(guestId, docId);
      if (doc) {
        const link = window.document.createElement('a');
        link.href = `data:${doc.mimeType};base64,${doc.fileDataBase64}`;
        link.download = doc.fileName;
        link.click();
      }
    } catch {
      // insufficient permissions
    }
  };

  if (isPending && !profile) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-resort-forest/30 border-t-resort-forest rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-neutral-500">Loading guest profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <div className="text-center py-24 text-neutral-500 text-sm">Guest not found</div>;
  }

  const { guest, photo, documents, stays, upcomingBookings, financialSummary } = profile;

  const currentStay = stays.find((s) => s.status === 'ACTIVE' || s.status === 'CHECKED_OUT' && !s.actualCheckOut);
  const latestStay = stays[0];
  const displayStay = currentStay || latestStay;

  const guestStatus = currentStay
    ? 'IN HOUSE'
    : upcomingBookings.length > 0
      ? 'UPCOMING'
      : stays.length > 0
        ? 'CHECKED OUT'
        : 'NO STAY';

  const statusColor: Record<string, string> = {
    'IN HOUSE': 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
    'UPCOMING': 'bg-blue-100 text-blue-800 ring-blue-600/20',
    'CHECKED OUT': 'bg-neutral-100 text-neutral-600 ring-neutral-400/20',
    'NO STAY': 'bg-neutral-100 text-neutral-500 ring-neutral-400/20',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* Small photo thumbnail in header */}
          <div className="hidden sm:block flex-shrink-0">
            <div className="w-16 h-16 rounded-lg overflow-hidden border border-resort-sand/60 bg-neutral-100">
              {photoData ? (
                <img src={photoData} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="h-7 w-7 text-neutral-300" />
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-serif text-2xl font-bold text-resort-charcoal">
                {guest.firstName} {guest.lastName}
              </h1>
              {guest.vip && <Star className="h-5 w-5 text-amber-500 fill-amber-500" />}
              {guest.blacklisted && <AlertTriangle className="h-5 w-5 text-red-500" />}
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${statusColor[guestStatus]}`}>
                {guestStatus}
              </span>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              Guest since {formatDate(guest.createdAt)} &middot; {guest.stayCount} stay{guest.stayCount !== 1 ? 's' : ''} &middot; {guest.totalRoomNights} room night{guest.totalRoomNights !== 1 ? 's' : ''}
            </p>
            {displayStay && (
              <p className="text-xs text-neutral-400 mt-0.5">
                {currentStay ? `Currently in Room ${displayStay.roomNumber}` : `Last stay: Room ${displayStay.roomNumber}`}
                {displayStay.roomTypeName && ` \u00B7 ${displayStay.roomTypeName}`}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button onClick={() => window.print()} variant="outline" size="sm" className="text-xs">
            <Download className="h-3.5 w-3.5 mr-1" />
            Download Report
          </Button>
          {currentStay && (
            <Button
              variant="primary"
              size="sm"
              className="text-xs"
              onClick={() => router.push(`/admin/guests/${guestId}/stays/${currentStay.stayId}`)}
            >
              <DoorOpen className="h-3.5 w-3.5 mr-1" />
              View Current Stay
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-resort-sand/60" />

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard icon={Receipt} label="Total Billed" value={formatINRAmount(financialSummary.totalBilled)} />
        <KpiCard icon={CreditCard} label="Total Paid" value={formatINRAmount(financialSummary.totalPaid)} accent="text-emerald-600" />
        <KpiCard
          icon={DollarSign}
          label="Outstanding"
          value={formatINRAmount(financialSummary.outstandingBalance)}
          accent={parseFloat(financialSummary.outstandingBalance) > 0 ? 'text-red-600' : 'text-neutral-500'}
        />
        <KpiCard icon={TrendingUp} label="Avg Bill / Stay" value={formatINRAmount(financialSummary.averageBillPerStay)} />
        <KpiCard icon={Clock} label="Avg Duration" value={`${guest.averageStayDuration} nights`} />
      </div>

      {/* Tabs */}
      <div className="border-b border-neutral-200">
        <nav className="flex gap-0 -mb-px" role="tablist">
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'stays', label: `Stay History (${stays.length})` },
            { key: 'upcoming', label: `Upcoming (${upcomingBookings.length})` },
            { key: 'documents', label: `Documents (${documents.length})` },
            { key: 'financial', label: 'Bills & Orders' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-resort-forest text-resort-forest'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content Area: 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: Main Content */}
        <div className="min-w-0 space-y-5">

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <>
              {/* Current Stay Card */}
              {currentStay ? (
                <div className="border border-emerald-200 rounded-lg bg-emerald-50/40 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <DoorOpen className="h-4 w-4 text-emerald-700" />
                    <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Current Stay</h3>
                    <StatusBadge status={currentStay.status} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-neutral-500 block mb-0.5">Stay</span>
                      <span className="font-mono font-semibold text-resort-forest">{currentStay.stayNumber}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block mb-0.5">Room</span>
                      <span className="font-semibold">{currentStay.roomNumber}</span>
                      <span className="text-neutral-400 block">{currentStay.roomTypeName}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block mb-0.5">Check-in</span>
                      <span className="font-semibold">{formatDate(currentStay.actualCheckIn)}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block mb-0.5">Expected Checkout</span>
                      <span className="font-semibold">{formatDate(currentStay.expectedCheckOut)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-emerald-200/60">
                    <div className="flex gap-4 text-xs">
                      <span className="text-neutral-500">Paid: <span className="font-semibold text-resort-charcoal">{formatINRAmount(currentStay.totalPaid)}</span></span>
                      <span className="text-neutral-500">Balance: <span className={`font-semibold ${parseFloat(currentStay.folioBalance) > 0 ? 'text-red-600' : 'text-neutral-700'}`}>{formatINRAmount(currentStay.folioBalance)}</span></span>
                      <span className="text-neutral-500">{currentStay.nights} night{currentStay.nights !== 1 ? 's' : ''}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[10px]"
                      onClick={() => router.push(`/admin/guests/${guestId}/stays/${currentStay.stayId}`)}
                    >
                      Open Stay <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              ) : latestStay ? (
                <div className="border border-neutral-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Bed className="h-4 w-4 text-neutral-500" />
                    <h3 className="text-xs font-bold text-neutral-600 uppercase tracking-wider">Latest Stay</h3>
                    <StatusBadge status={latestStay.status} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-neutral-500 block mb-0.5">Stay</span>
                      <span className="font-mono font-semibold text-resort-forest">{latestStay.stayNumber}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block mb-0.5">Room</span>
                      <span className="font-semibold">{latestStay.roomNumber}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block mb-0.5">Check-in</span>
                      <span className="font-semibold">{formatDate(latestStay.actualCheckIn)}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block mb-0.5">{latestStay.actualCheckOut ? 'Checked Out' : 'Expected'}</span>
                      <span className="font-semibold">{formatDate(latestStay.actualCheckOut || latestStay.expectedCheckOut)}</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Recent Activity (timeline-style from stay data) */}
              {stays.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-neutral-600 uppercase tracking-wider mb-3">Recent Activity</h3>
                  <div className="space-y-0">
                    {stays.slice(0, 5).flatMap((stay, idx) => {
                      const events: Array<{ date: string; label: string; stayNum: string }> = [];
                      events.push({
                        date: stay.actualCheckIn,
                        label: stay.status === 'ACTIVE' ? 'Checked in' : 'Stay completed',
                        stayNum: stay.stayNumber,
                      });
                      if (stay.actualCheckOut) {
                        events.push({ date: stay.actualCheckOut, label: 'Checked out', stayNum: stay.stayNumber });
                      }
                      return events.map((ev, i) => ({ ...ev, key: `${idx}-${i}` }));
                    }).slice(0, 8).map((ev, idx, arr) => (
                      <div key={ev.key} className="flex gap-3 text-xs">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-resort-forest/60 mt-1.5 flex-shrink-0" />
                          {idx < arr.length - 1 && <div className="w-px flex-1 bg-neutral-200 my-1" />}
                        </div>
                        <div className="pb-4">
                          <span className="text-neutral-500">{formatDate(ev.date)}</span>
                          <span className="text-resort-charcoal font-medium ml-2">{ev.label}</span>
                          <span className="text-neutral-400 ml-1.5 font-mono text-[10px]">{ev.stayNum}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* STAY HISTORY TAB */}
          {activeTab === 'stays' && (
            <div className="space-y-3">
              {stays.length === 0 ? (
                <div className="text-center py-12 text-neutral-400 text-xs">No stays found</div>
              ) : (
                stays.map((stay) => (
                  <div
                    key={stay.stayId}
                    className="border border-neutral-200 rounded-lg p-4 hover:border-resort-forest/30 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/admin/guests/${guestId}/stays/${stay.stayId}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-resort-forest">{stay.stayNumber}</span>
                          <StatusBadge status={stay.status} size="xs" />
                          {stay.reservationNumber && (
                            <span className="text-[10px] text-neutral-400 font-mono">Res: {stay.reservationNumber}</span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-3 text-xs flex-wrap">
                          <span className="font-semibold text-resort-charcoal">Room {stay.roomNumber}</span>
                          {stay.roomTypeName && <span className="text-neutral-500">{stay.roomTypeName}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-neutral-600">
                          {formatDate(stay.actualCheckIn)} &rarr; {stay.actualCheckOut ? formatDate(stay.actualCheckOut) : <span className="text-emerald-600">Active</span>}
                        </div>
                        <div className="text-[10px] text-neutral-400 mt-0.5">{stay.nights} night{stay.nights !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-neutral-100">
                      <div className="flex gap-4 text-[10px]">
                        <span className="text-neutral-500">Billed: <span className="font-semibold text-resort-charcoal">{formatINRAmount(stay.totalPaid)}</span></span>
                        <span className="text-neutral-500">Balance: <span className={`font-semibold ${parseFloat(stay.folioBalance) > 0 ? 'text-red-600' : 'text-neutral-600'}`}>{formatINRAmount(stay.folioBalance)}</span></span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-resort-forest transition-colors" />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* UPCOMING TAB */}
          {activeTab === 'upcoming' && (
            <div className="space-y-3">
              {upcomingBookings.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                  <p className="text-xs text-neutral-400">No upcoming bookings</p>
                </div>
              ) : (
                upcomingBookings.map((booking) => (
                  <div key={booking.reservationId} className="border border-blue-200 rounded-lg p-4 bg-blue-50/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-blue-700">{booking.reservationNumber}</span>
                          <StatusBadge status={booking.status} size="xs" />
                          <span className="text-[10px] text-neutral-400">{booking.source}</span>
                        </div>
                        <div className="text-sm font-medium text-resort-charcoal">{booking.roomTypeName}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-neutral-600">
                          {formatDate(booking.checkInDate)} &rarr; {formatDate(booking.checkOutDate)}
                        </div>
                        <div className="text-[10px] text-neutral-400 mt-0.5">{booking.nights} night{booking.nights !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-blue-200/60 text-[10px]">
                      <span className="text-neutral-500">Total: <span className="font-semibold">{formatINRAmount(booking.totalAmount)}</span></span>
                      <span className="text-neutral-500">Advance: <span className="font-semibold">{formatINRAmount(booking.advancePaid)}</span></span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* DOCUMENTS TAB */}
          {activeTab === 'documents' && (
            <div className="space-y-3">
              {documents.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                  <p className="text-xs text-neutral-400">No documents on file</p>
                </div>
              ) : (
                documents.map((doc) => (
                  <div key={doc.id} className="border border-neutral-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-resort-charcoal">{doc.documentType.replace(/_/g, ' ')}</span>
                      <VerificationBadge status={doc.verificationStatus} />
                    </div>
                    <div className="text-sm font-mono text-neutral-600 mb-2">{doc.maskedDocumentNumber}</div>
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-neutral-400 space-y-0.5">
                        <div>Uploaded: {formatDate(doc.uploadedAt)}</div>
                        {doc.verifiedAt && <div>Verified by {doc.verifiedByName} on {formatDate(doc.verifiedAt)}</div>}
                      </div>
                      <Button onClick={() => loadDocument(doc.id)} variant="outline" size="sm" className="text-[10px]">
                        <FileText className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* BILLS & ORDERS TAB */}
          {activeTab === 'financial' && (
            <div className="space-y-4">
              {/* Financial Summary */}
              <div className="border border-neutral-200 rounded-lg p-4">
                <h3 className="text-xs font-bold text-neutral-600 uppercase tracking-wider mb-3">Financial Summary</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Total Billed</span>
                      <span className="font-semibold">{formatINRAmount(financialSummary.totalBilled)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Total Paid</span>
                      <span className="font-semibold text-emerald-700">{formatINRAmount(financialSummary.totalPaid)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Outstanding</span>
                      <span className={`font-semibold ${parseFloat(financialSummary.outstandingBalance) > 0 ? 'text-red-600' : ''}`}>
                        {formatINRAmount(financialSummary.outstandingBalance)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Highest Bill</span>
                      <span className="font-semibold">{formatINRAmount(financialSummary.highestBill)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Lowest Bill</span>
                      <span className="font-semibold">{formatINRAmount(financialSummary.lowestBill)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Total Tax Paid</span>
                      <span className="font-semibold">{formatINRAmount(financialSummary.totalTaxPaid)}</span>
                    </div>
                    {parseFloat(financialSummary.totalRefunds) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Total Refunds</span>
                        <span className="font-semibold text-amber-600">{formatINRAmount(financialSummary.totalRefunds)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Per-stay charges */}
              {stays.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-neutral-600 uppercase tracking-wider mb-3">Stay Charges</h3>
                  <div className="space-y-2">
                    {stays.map((stay) => (
                      <div
                        key={stay.stayId}
                        className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg text-xs hover:bg-neutral-50 cursor-pointer"
                        onClick={() => router.push(`/admin/guests/${guestId}/stays/${stay.stayId}`)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-resort-forest font-semibold">{stay.stayNumber}</span>
                          <span className="text-neutral-500">Room {stay.roomNumber}</span>
                          <StatusBadge status={stay.status} size="xs" />
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-neutral-500">Paid: <span className="font-semibold">{formatINRAmount(stay.totalPaid)}</span></span>
                          <span className="text-neutral-500">Balance: <span className={`font-semibold ${parseFloat(stay.folioBalance) > 0 ? 'text-red-600' : ''}`}>{formatINRAmount(stay.folioBalance)}</span></span>
                          <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Guest Photo */}
          <div className="border border-resort-sand/60 rounded-lg p-4 bg-white">
            <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-3">Guest Photo</h3>
            <GuestPhotoComponent
              photoData={photoData}
              photo={photo}
              onCapture={loadPhoto}
              isSensitive={hasSensitiveAccess}
            />
          </div>

          {/* Guest Identity */}
          <div className="border border-resort-sand/60 rounded-lg p-4 bg-white">
            <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-3">Guest Information</h3>
            <div className="space-y-2.5 text-xs">
              <InfoRow icon={User} label="Name" value={`${guest.firstName} ${guest.lastName}`} />
              <InfoRow icon={Phone} label="Phone" value={guest.phone} />
              {guest.email && <InfoRow icon={Mail} label="Email" value={guest.email} />}
              {guest.city && <InfoRow icon={MapPin} label="City" value={[guest.city, guest.state].filter(Boolean).join(', ')} />}
              {guest.country && <InfoRow icon={MapPin} label="Country" value={guest.country} />}
              {guest.nationality && <InfoRow icon={Info} label="Nationality" value={guest.nationality} />}
            </div>
          </div>

          {/* Current Accommodation (if in-house) */}
          {currentStay && (
            <div className="border border-emerald-200 rounded-lg p-4 bg-emerald-50/30">
              <h3 className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-3">Current Accommodation</h3>
              <div className="space-y-2.5 text-xs">
                <InfoRow icon={Bed} label="Room" value={currentStay.roomNumber} />
                {currentStay.roomTypeName && <InfoRow icon={Layers} label="Type" value={currentStay.roomTypeName} />}
                <InfoRow icon={Calendar} label="Check-in" value={formatDate(currentStay.actualCheckIn)} />
                <InfoRow icon={Calendar} label="Checkout" value={formatDate(currentStay.expectedCheckOut)} />
                <InfoRow icon={Clock} label="Duration" value={`${currentStay.nights} night${currentStay.nights !== 1 ? 's' : ''}`} />
              </div>
            </div>
          )}

          {/* Identity Documents */}
          {documents.length > 0 && (
            <div className="border border-resort-sand/60 rounded-lg p-4 bg-white">
              <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-3">Identity Documents</h3>
              <div className="space-y-2.5">
                {documents.map((doc) => (
                  <div key={doc.id} className="border border-neutral-200 rounded-md p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-resort-charcoal">{doc.documentType.replace(/_/g, ' ')}</span>
                      <VerificationBadge status={doc.verificationStatus} />
                    </div>
                    <div className="text-xs font-mono text-neutral-600 mb-1">{doc.maskedDocumentNumber}</div>
                    <div className="text-[9px] text-neutral-400 mb-1.5">
                      Uploaded: {formatDate(doc.uploadedAt)}
                      {doc.verifiedAt && <span> &middot; Verified: {formatDate(doc.verifiedAt)}</span>}
                    </div>
                    <Button onClick={() => loadDocument(doc.id)} variant="outline" size="sm" className="text-[9px] w-full h-7">
                      <FileText className="h-3 w-3 mr-1" />
                      View Document
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="border border-resort-sand/60 rounded-lg p-4 bg-white">
            <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {currentStay && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs w-full justify-start"
                  onClick={() => router.push(`/admin/guests/${guestId}/stays/${currentStay.stayId}`)}
                >
                  <DoorOpen className="h-3.5 w-3.5 mr-2" />
                  View Current Stay
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-xs w-full justify-start"
                onClick={() => window.print()}
              >
                <Download className="h-3.5 w-3.5 mr-2" />
                Download Guest Report
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs w-full justify-start"
                onClick={() => router.push('/admin/guests')}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-2" />
                Back to Guest Database
              </Button>
            </div>
          </div>

          {/* Notes */}
          {guest.notes && (
            <div className="border border-resort-sand/60 rounded-lg p-4 bg-white">
              <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Notes</h3>
              <p className="text-xs text-neutral-600 whitespace-pre-wrap">{guest.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-neutral-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="text-neutral-400 block text-[10px] uppercase tracking-wider">{label}</span>
        <span className="text-resort-charcoal font-medium">{value}</span>
      </div>
    </div>
  );
}
