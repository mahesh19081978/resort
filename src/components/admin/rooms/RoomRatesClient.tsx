'use client';

import React, { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Edit2,
  Power,
  Calendar,
  Sparkles,
  Eye,
  AlertCircle,
  TrendingDown,
  X,
  HelpCircle,
} from 'lucide-react';
import {
  AdminPageHeader,
  AdminCard,
  AdminKpiCard,
  AdminStatusBadge,
} from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  createRoomRateAction,
  updateRoomRateAction,
  toggleRoomRateStatusAction,
  previewRoomRatesAction,
} from '@/actions/pms';

export type RateType = 'WEEKEND' | 'SEASONAL' | 'FESTIVAL' | 'PROMOTION';

export interface RoomTypeOption {
  id: string;
  name: string;
  code: string;
  basePrice: string; // Serialized Decimal
}

export interface RatePlanOption {
  id: string;
  name: string;
  code: string;
}

export interface RoomRateRecord {
  id: string;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeCode: string;
  referencePrice: string; // RoomType.basePrice
  ratePlanId: string;
  ratePlanName: string;
  ratePlanCode: string;
  rateType: RateType;
  name: string | null;
  basePrice: string; // Selling price / rate per night
  extraAdultPrice: string;
  extraChildPrice: string;
  startDate: string | null; // ISO string
  endDate: string | null; // ISO string
  daysOfWeek: number[];
  priority: number;
  isActive: boolean;
  createdAt: string;
}

interface RoomRatesClientProps {
  initialRates: RoomRateRecord[];
  roomTypes: RoomTypeOption[];
  ratePlans: RatePlanOption[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Derives the temporal and operational status badge for a rate rule:
 * - ACTIVE (Current effective active rule)
 * - UPCOMING (Active rule with future startDate)
 * - EXPIRED (Active rule with passed endDate)
 * - INACTIVE (isActive = false)
 */
export function getRateStatus(rate: RoomRateRecord): {
  status: 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'INACTIVE';
  label: string;
} {
  if (!rate.isActive) {
    return { status: 'INACTIVE', label: 'Inactive' };
  }

  // Derive today's date strictly in Asia/Kolkata timezone
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? String(now.getFullYear());
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  const todayStr = `${y}-${m}-${d}`;

  if (rate.startDate) {
    const sStr = rate.startDate.split('T')[0];
    if (sStr > todayStr) {
      return { status: 'UPCOMING', label: 'Upcoming' };
    }
  }

  if (rate.endDate) {
    const eStr = rate.endDate.split('T')[0];
    if (eStr < todayStr) {
      return { status: 'EXPIRED', label: 'Expired' };
    }
  }

  return { status: 'ACTIVE', label: 'Current' };
}

export function RoomRatesClient({ initialRates, roomTypes, ratePlans }: RoomRatesClientProps) {
  const router = useRouter();
  const [rates, setRates] = useState<RoomRateRecord[]>(initialRates);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>('ALL');
  const [planFilter, setPlanFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal States
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<RoomRateRecord | null>(null);

  // Preview Modal States
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // Stats calculation
  const totalCount = rates.length;
  const activeCount = rates.filter((r) => r.isActive).length;
  const promoCount = rates.filter((r) => r.rateType === 'PROMOTION' && r.isActive).length;
  const weekendCount = rates.filter((r) => r.rateType === 'WEEKEND' && r.isActive).length;

  const filteredRates = useMemo(() => {
    return rates.filter((r) => {
      if (typeFilter !== 'ALL' && r.rateType !== typeFilter) return false;
      if (roomTypeFilter !== 'ALL' && r.roomTypeId !== roomTypeFilter) return false;
      if (planFilter !== 'ALL' && r.ratePlanId !== planFilter) return false;
      if (statusFilter !== 'ALL') {
        const { status } = getRateStatus(r);
        if (status !== statusFilter) return false;
      }
      return true;
    });
  }, [rates, typeFilter, roomTypeFilter, planFilter, statusFilter]);

  const handleOpenCreate = () => {
    setEditingRate(null);
    setFormModalOpen(true);
  };

  const handleOpenEdit = (rate: RoomRateRecord) => {
    setEditingRate(rate);
    setFormModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Room Rate Management"
        subtitle="Configure date-aware nightly selling rates, weekend rules, seasonal adjustments, and promotional offers."
        badge="Pricing Engine"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewModalOpen(true)}
              className="gap-1.5 text-xs border-resort-sand bg-white text-resort-charcoal hover:bg-resort-sand/20"
            >
              <Eye className="h-3.5 w-3.5 text-resort-forest" /> Rate Preview
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreate}
              className="gap-1.5 text-xs bg-resort-forest text-white hover:bg-resort-forest/90"
            >
              <Plus className="h-3.5 w-3.5" /> Create Rate Rule
            </Button>
          </div>
        }
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AdminKpiCard
          label="Total Rate Rules"
          value={totalCount}
          subtext="Configured override rules"
          variant="neutral"
        />
        <AdminKpiCard
          label="Active Rules"
          value={activeCount}
          subtext="Eligible for resolution"
          variant="forest"
        />
        <AdminKpiCard
          label="Active Promotions"
          value={promoCount}
          subtext="Promotional offer rules"
          variant="champagne"
        />
        <AdminKpiCard
          label="Weekend Rules"
          value={weekendCount}
          subtext="Weekend specific pricing"
          variant="olive"
        />
      </div>

      {/* Filters Bar */}
      <Card className="border border-resort-sand/80 shadow-2xs">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Rate Type Filter */}
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[10px] font-semibold text-resort-stone uppercase tracking-wider">
                Rate Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-8 text-xs rounded border border-resort-sand px-2 bg-white text-resort-charcoal focus:outline-hidden focus:ring-1 focus:ring-resort-forest"
              >
                <option value="ALL">All Rate Types</option>
                <option value="WEEKEND">Weekend</option>
                <option value="SEASONAL">Seasonal</option>
                <option value="FESTIVAL">Festival</option>
                <option value="PROMOTION">Promotion</option>
              </select>
            </div>

            {/* Room Type Filter */}
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-[10px] font-semibold text-resort-stone uppercase tracking-wider">
                Room Type
              </label>
              <select
                value={roomTypeFilter}
                onChange={(e) => setRoomTypeFilter(e.target.value)}
                className="h-8 text-xs rounded border border-resort-sand px-2 bg-white text-resort-charcoal focus:outline-hidden focus:ring-1 focus:ring-resort-forest"
              >
                <option value="ALL">All Room Types</option>
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Rate Plan Filter */}
            <div className="flex flex-col gap-1 min-w-[150px]">
              <label className="text-[10px] font-semibold text-resort-stone uppercase tracking-wider">
                Rate Plan
              </label>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="h-8 text-xs rounded border border-resort-sand px-2 bg-white text-resort-charcoal focus:outline-hidden focus:ring-1 focus:ring-resort-forest"
              >
                <option value="ALL">All Plans</option>
                {ratePlans.map((rp) => (
                  <option key={rp.id} value={rp.id}>
                    {rp.name} ({rp.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-[10px] font-semibold text-resort-stone uppercase tracking-wider">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 text-xs rounded border border-resort-sand px-2 bg-white text-resort-charcoal focus:outline-hidden focus:ring-1 focus:ring-resort-forest"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Current</option>
                <option value="UPCOMING">Upcoming</option>
                <option value="EXPIRED">Expired</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>

            {/* Reset Filters */}
            {(typeFilter !== 'ALL' || roomTypeFilter !== 'ALL' || planFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <div className="flex items-end pb-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTypeFilter('ALL');
                    setRoomTypeFilter('ALL');
                    setPlanFilter('ALL');
                    setStatusFilter('ALL');
                  }}
                  className="h-8 text-xs text-resort-stone hover:text-resort-charcoal"
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Rates Table */}
      <AdminCard
        title="Rate Rules Directory"
        subtitle="Priority sorted list of room rate overrides. Rules resolve dynamically according to tier, priority, and date bounds."
      >
        {filteredRates.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <Sparkles className="h-8 w-8 mx-auto text-resort-sand mb-3" />
            <h3 className="font-serif text-base font-bold text-resort-charcoal">No Room Rates Found</h3>
            <p className="text-xs text-resort-stone max-w-md mx-auto mt-1 mb-4">
              {totalCount === 0
                ? 'No override rate rules have been created yet. The canonical fallback price (RoomType.basePrice) applies to all nights.'
                : 'No rate rules match the selected filter criteria.'}
            </p>
            {totalCount === 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenCreate}
                className="gap-1.5 text-xs bg-resort-forest text-white hover:bg-resort-forest/90"
              >
                <Plus className="h-3.5 w-3.5" /> Create First Rate Rule
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-resort-sand/60 bg-resort-sand/20 text-[11px] font-semibold text-resort-stone uppercase tracking-wider">
                  <th className="py-3 px-4">Room Type & Plan</th>
                  <th className="py-3 px-4">Rate Name / Type</th>
                  <th className="py-3 px-4 text-right">Selling Price</th>
                  <th className="py-3 px-4 text-right">Rack Price</th>
                  <th className="py-3 px-4">Difference</th>
                  <th className="py-3 px-4">Date Range & Days</th>
                  <th className="py-3 px-4 text-center">Priority</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-resort-sand/40 font-normal">
                {filteredRates.map((rate) => {
                  const statusInfo = getRateStatus(rate);
                  const sellingNum = parseFloat(rate.basePrice);
                  const refNum = parseFloat(rate.referencePrice);
                  const diff = refNum - sellingNum;
                  const isDiscount = rate.rateType === 'PROMOTION' && diff > 0;

                  return (
                    <tr key={rate.id} className="hover:bg-resort-ivory/40 transition-colors">
                      {/* Room Type & Plan */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-resort-charcoal">{rate.roomTypeName}</div>
                        <div className="text-[11px] text-resort-stone flex items-center gap-1.5 mt-0.5">
                          <span className="font-semibold text-resort-forest bg-resort-forest/10 px-1 rounded text-[10px]">
                            {rate.ratePlanCode}
                          </span>
                          <span>{rate.ratePlanName}</span>
                        </div>
                      </td>

                      {/* Rate Name & Type */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-resort-charcoal">
                          {rate.name || <span className="text-resort-stone italic">Unnamed Rule</span>}
                        </div>
                        <div className="mt-1">
                          <RateTypeBadge type={rate.rateType} />
                        </div>
                      </td>

                      {/* Selling Price */}
                      <td className="py-3.5 px-4 text-right font-medium text-resort-charcoal text-sm">
                        ₹{parseFloat(rate.basePrice).toLocaleString('en-IN')}
                        <span className="text-[10px] text-resort-stone block font-normal">/ night</span>
                      </td>

                      {/* Rack / Reference Price */}
                      <td className="py-3.5 px-4 text-right text-resort-stone">
                        ₹{parseFloat(rate.referencePrice).toLocaleString('en-IN')}
                        <span className="text-[10px] block">Rack</span>
                      </td>

                      {/* Difference / Discount */}
                      <td className="py-3.5 px-4">
                        {isDiscount ? (
                          <div className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium">
                            <TrendingDown className="w-3 h-3" />
                            <span>Save ₹{diff.toLocaleString('en-IN')}</span>
                            <span className="text-[10px] text-emerald-600">
                              ({((diff / refNum) * 100).toFixed(0)}%)
                            </span>
                          </div>
                        ) : diff < 0 ? (
                          <div className="text-[11px] text-resort-stone">
                            +₹{(-diff).toLocaleString('en-IN')} vs rack
                          </div>
                        ) : (
                          <div className="text-[11px] text-resort-stone">Standard</div>
                        )}
                      </td>

                      {/* Date Range & Days */}
                      <td className="py-3.5 px-4">
                        <div className="text-[11px] text-resort-charcoal flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-resort-stone shrink-0" />
                          {rate.startDate && rate.endDate ? (
                            <span>
                              {rate.startDate.split('T')[0]} to {rate.endDate.split('T')[0]}
                            </span>
                          ) : rate.startDate ? (
                            <span>From {rate.startDate.split('T')[0]}</span>
                          ) : rate.endDate ? (
                            <span>Until {rate.endDate.split('T')[0]}</span>
                          ) : (
                            <span className="text-resort-stone">Always Effective</span>
                          )}
                        </div>
                        <div className="text-[10px] text-resort-stone mt-1">
                          {rate.daysOfWeek.length === 0 ? (
                            <span className="text-resort-forest">All Days</span>
                          ) : (
                            <span>{rate.daysOfWeek.map((d) => DAY_NAMES[d]).join(', ')}</span>
                          )}
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-4 text-center font-mono text-xs text-resort-charcoal">
                        {rate.priority}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <AdminStatusBadge status={statusInfo.status} label={statusInfo.label} />
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(rate)}
                            title="Edit Rate Rule"
                            className="h-7 w-7 p-0 text-resort-stone hover:text-resort-charcoal hover:bg-resort-sand/40"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <ToggleStatusButton
                            rate={rate}
                            onToggled={(updated) => {
                              setRates((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/* Create / Edit Modal */}
      {formModalOpen && (
        <RoomRateFormModal
          isOpen={formModalOpen}
          rate={editingRate}
          roomTypes={roomTypes}
          ratePlans={ratePlans}
          onClose={() => setFormModalOpen(false)}
          onSuccess={(savedRate) => {
            if (editingRate) {
              setRates((prev) => prev.map((r) => (r.id === savedRate.id ? savedRate : r)));
            } else {
              setRates((prev) => [savedRate, ...prev]);
            }
            setFormModalOpen(false);
            router.refresh();
          }}
        />
      )}

      {/* Preview Modal */}
      {previewModalOpen && (
        <RatePreviewModal
          isOpen={previewModalOpen}
          roomTypes={roomTypes}
          ratePlans={ratePlans}
          onClose={() => setPreviewModalOpen(false)}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------
// HELPER COMPONENTS
// ----------------------------------------------------

function RateTypeBadge({ type }: { type: RateType }) {
  const styles: Record<RateType, string> = {
    WEEKEND: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    SEASONAL: 'bg-amber-50 text-amber-800 border-amber-200',
    FESTIVAL: 'bg-rose-50 text-rose-800 border-rose-200',
    PROMOTION: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border ${styles[type]}`}
    >
      {type}
    </span>
  );
}

function ToggleStatusButton({
  rate,
  onToggled,
}: {
  rate: RoomRateRecord;
  onToggled: (updated: RoomRateRecord) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    startTransition(async () => {
      const res = await toggleRoomRateStatusAction({
        id: rate.id,
        isActive: !rate.isActive,
      });

      if (res.success && res.data) {
        onToggled({ ...rate, isActive: !rate.isActive });
      } else {
        alert(res.error || 'Failed to toggle rate status');
      }
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={handleToggle}
      title={rate.isActive ? 'Deactivate Rate Rule' : 'Activate Rate Rule'}
      className={`h-7 w-7 p-0 ${
        rate.isActive ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50' : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
      }`}
    >
      <Power className="h-3.5 w-3.5" />
    </Button>
  );
}

// ----------------------------------------------------
// CREATE / EDIT MODAL COMPONENT
// ----------------------------------------------------

interface RoomRateFormModalProps {
  isOpen: boolean;
  rate: RoomRateRecord | null;
  roomTypes: RoomTypeOption[];
  ratePlans: RatePlanOption[];
  onClose: () => void;
  onSuccess: (saved: RoomRateRecord) => void;
}

function RoomRateFormModal({
  isOpen,
  rate,
  roomTypes,
  ratePlans,
  onClose,
  onSuccess,
}: RoomRateFormModalProps) {
  const isEdit = !!rate;

  const [roomTypeId, setRoomTypeId] = useState(rate?.roomTypeId || (roomTypes[0]?.id ?? ''));
  const [ratePlanId, setRatePlanId] = useState(rate?.ratePlanId || (ratePlans[0]?.id ?? ''));
  const [rateType, setRateType] = useState<RateType>(rate?.rateType || 'WEEKEND');
  const [name, setName] = useState(rate?.name || '');
  const [basePrice, setBasePrice] = useState(rate?.basePrice || '');
  const [extraAdultPrice, setExtraAdultPrice] = useState(rate?.extraAdultPrice || '0');
  const [extraChildPrice, setExtraChildPrice] = useState(rate?.extraChildPrice || '0');
  const [startDate, setStartDate] = useState(rate?.startDate ? rate.startDate.split('T')[0] : '');
  const [endDate, setEndDate] = useState(rate?.endDate ? rate.endDate.split('T')[0] : '');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(rate?.daysOfWeek || []);
  const [priority, setPriority] = useState<number>(rate?.priority ?? 0);
  const [isActive, setIsActive] = useState<boolean>(rate?.isActive ?? true);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Find selected RoomType reference price
  const selectedRoomType = roomTypes.find((rt) => rt.id === roomTypeId);
  const refPriceNum = selectedRoomType ? parseFloat(selectedRoomType.basePrice) : 0;
  const sellingPriceNum = parseFloat(basePrice) || 0;
  const priceDiff = refPriceNum - sellingPriceNum;
  const hasDiscount = sellingPriceNum > 0 && refPriceNum > 0 && sellingPriceNum < refPriceNum;
  const discountPercent = hasDiscount ? ((priceDiff / refPriceNum) * 100).toFixed(1) : null;

  const toggleDay = (dayIndex: number) => {
    setDaysOfWeek((prev) => {
      if (prev.includes(dayIndex)) {
        return prev.filter((d) => d !== dayIndex);
      } else {
        return [...prev, dayIndex].sort((a, b) => a - b);
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload = {
      ...(isEdit && { id: rate!.id }),
      roomTypeId,
      ratePlanId,
      rateType,
      name: name.trim() || null,
      basePrice: parseFloat(basePrice),
      extraAdultPrice: parseFloat(extraAdultPrice) || 0,
      extraChildPrice: parseFloat(extraChildPrice) || 0,
      startDate: startDate || null,
      endDate: endDate || null,
      daysOfWeek,
      priority: parseInt(priority.toString(), 10) || 0,
      isActive,
    };

    startTransition(async () => {
      const res = isEdit
        ? await updateRoomRateAction(payload)
        : await createRoomRateAction(payload);

      if (res.success && res.data) {
        const saved = res.data as any;
        const selectedPlan = ratePlans.find((p) => p.id === ratePlanId);

        const record: RoomRateRecord = {
          id: saved.id,
          roomTypeId: saved.roomTypeId,
          roomTypeName: selectedRoomType?.name || '',
          roomTypeCode: selectedRoomType?.code || '',
          referencePrice: selectedRoomType?.basePrice || '0.00',
          ratePlanId: saved.ratePlanId,
          ratePlanName: selectedPlan?.name || '',
          ratePlanCode: selectedPlan?.code || '',
          rateType: saved.rateType,
          name: saved.name,
          basePrice: saved.basePrice.toString(),
          extraAdultPrice: saved.extraAdultPrice.toString(),
          extraChildPrice: saved.extraChildPrice.toString(),
          startDate: saved.startDate ? saved.startDate.toISOString() : null,
          endDate: saved.endDate ? saved.endDate.toISOString() : null,
          daysOfWeek: saved.daysOfWeek,
          priority: saved.priority,
          isActive: saved.isActive,
          createdAt: saved.createdAt ? saved.createdAt.toISOString() : new Date().toISOString(),
        };

        onSuccess(record);
      } else {
        setError(res.error || 'Failed to save rate rule');
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-lg border border-resort-sand shadow-xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-resort-sand/60 bg-resort-ivory/20">
          <div>
            <h2 className="font-serif text-lg font-bold text-resort-charcoal">
              {isEdit ? 'Edit Room Rate Rule' : 'Create Room Rate Rule'}
            </h2>
            <p className="text-xs text-resort-stone mt-0.5">
              Specify the nightly selling rate and applicability conditions.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-resort-stone hover:text-resort-charcoal hover:bg-resort-sand/40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {/* Row 1: Room Type & Rate Plan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Room Type <span className="text-rose-600">*</span>
              </label>
              <select
                value={roomTypeId}
                onChange={(e) => setRoomTypeId(e.target.value)}
                required
                className="w-full h-9 text-xs rounded border border-resort-sand px-3 bg-white text-resort-charcoal focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
              >
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name} (Rack: ₹{parseFloat(rt.basePrice).toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Rate Plan <span className="text-rose-600">*</span>
              </label>
              <select
                value={ratePlanId}
                onChange={(e) => setRatePlanId(e.target.value)}
                required
                className="w-full h-9 text-xs rounded border border-resort-sand px-3 bg-white text-resort-charcoal focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
              >
                {ratePlans.map((rp) => (
                  <option key={rp.id} value={rp.id}>
                    {rp.name} ({rp.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Rate Type & Rate Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Rate Type <span className="text-rose-600">*</span>
              </label>
              <select
                value={rateType}
                onChange={(e) => setRateType(e.target.value as RateType)}
                required
                className="w-full h-9 text-xs rounded border border-resort-sand px-3 bg-white text-resort-charcoal focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
              >
                <option value="WEEKEND">Weekend Rate</option>
                <option value="SEASONAL">Seasonal Rate</option>
                <option value="FESTIVAL">Festival Rate</option>
                <option value="PROMOTION">Promotional Offer Rate</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Rate Name <span className="text-resort-stone font-normal">(Optional Label)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Early Bird Diwali Special"
                maxLength={100}
                className="w-full h-9 text-xs rounded border border-resort-sand px-3 bg-white text-resort-charcoal focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
              />
            </div>
          </div>

          {/* Row 3: Price Concept (The ONLY editable rate price is Selling Price) */}
          <div className="bg-resort-sand/20 border border-resort-sand/60 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-resort-charcoal">Price Configuration</span>
              <span className="text-[11px] text-resort-stone flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-resort-forest" />
                Rack price is derived from RoomType
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Rate per Night (Selling Price) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-resort-stone">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                    required
                    placeholder="0.00"
                    className="w-full h-9 pl-7 pr-3 text-xs font-mono font-medium rounded border border-resort-sand bg-white text-resort-charcoal focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-stone mb-1">
                  Reference / Rack Price
                </label>
                <div className="h-9 px-3 flex items-center rounded border border-resort-sand/60 bg-resort-sand/30 text-xs font-mono text-resort-stone">
                  ₹{refPriceNum.toLocaleString('en-IN')} / night
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-stone mb-1">
                  Calculated Variance
                </label>
                <div className="h-9 px-3 flex items-center justify-between rounded border border-resort-sand/60 bg-resort-sand/30 text-xs">
                  {hasDiscount ? (
                    <span className="text-emerald-700 font-medium">
                      -₹{priceDiff.toLocaleString('en-IN')} ({discountPercent}%)
                    </span>
                  ) : sellingPriceNum > refPriceNum ? (
                    <span className="text-resort-charcoal font-medium">
                      +₹{(-priceDiff).toLocaleString('en-IN')} (Surge)
                    </span>
                  ) : (
                    <span className="text-resort-stone">Standard (0%)</span>
                  )}
                </div>
              </div>
            </div>

            {/* Extra Guest Pricing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-resort-sand/40">
              <div>
                <label className="block text-[11px] font-semibold text-resort-charcoal mb-1">
                  Extra Adult Price (per night)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-resort-stone">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={extraAdultPrice}
                    onChange={(e) => setExtraAdultPrice(e.target.value)}
                    className="w-full h-8 pl-7 pr-3 text-xs font-mono rounded border border-resort-sand bg-white text-resort-charcoal focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-resort-charcoal mb-1">
                  Extra Child Price (per night)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-resort-stone">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={extraChildPrice}
                    onChange={(e) => setExtraChildPrice(e.target.value)}
                    className="w-full h-8 pl-7 pr-3 text-xs font-mono rounded border border-resort-sand bg-white text-resort-charcoal focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Row 4: Calendar Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Start Date <span className="text-resort-stone font-normal">(Optional)</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-9 text-xs rounded border border-resort-sand px-3 bg-white text-resort-charcoal focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                End Date <span className="text-resort-stone font-normal">(Optional)</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-full h-9 text-xs rounded border border-resort-sand px-3 bg-white text-resort-charcoal focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
              />
            </div>
          </div>

          {/* Row 5: Days of Week Multi-select */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-resort-charcoal">
                Applicable Days of Week
              </label>
              <span className="text-[11px] text-resort-stone">
                {daysOfWeek.length === 0 ? 'Empty selection = Applies to ALL days' : `${daysOfWeek.length} days selected`}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {FULL_DAY_NAMES.map((dayName, idx) => {
                const selected = daysOfWeek.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                      selected
                        ? 'bg-resort-forest text-white border-resort-forest'
                        : 'bg-white text-resort-charcoal border-resort-sand hover:bg-resort-sand/30'
                    }`}
                  >
                    {dayName}
                  </button>
                );
              })}
              {daysOfWeek.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDaysOfWeek([])}
                  className="px-2.5 py-1.5 rounded text-xs text-resort-stone hover:text-resort-charcoal underline"
                >
                  Select All Days
                </button>
              )}
            </div>
          </div>

          {/* Row 6: Priority & Active Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-resort-sand/60">
            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Priority Rank <span className="text-resort-stone font-normal">(Higher integer wins)</span>
              </label>
              <input
                type="number"
                step="1"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                className="w-full h-9 text-xs font-mono rounded border border-resort-sand px-3 bg-white text-resort-charcoal focus:ring-1 focus:ring-resort-forest focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="isActiveRate"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded text-resort-forest border-resort-sand focus:ring-resort-forest"
              />
              <label htmlFor="isActiveRate" className="text-xs font-semibold text-resort-charcoal cursor-pointer">
                Active Rule (Eligible for rate resolution)
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-resort-sand/60">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs border-resort-sand text-resort-stone hover:text-resort-charcoal"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isPending}
              className="text-xs bg-resort-forest text-white hover:bg-resort-forest/90"
            >
              {isPending ? 'Saving...' : isEdit ? 'Update Rate Rule' : 'Create Rate Rule'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// RATE PREVIEW MODAL (CANONICAL RESOLVER VERIFICATION)
// ----------------------------------------------------

interface RatePreviewModalProps {
  isOpen: boolean;
  roomTypes: RoomTypeOption[];
  ratePlans: RatePlanOption[];
  onClose: () => void;
}

function RatePreviewModal({ isOpen, roomTypes, ratePlans, onClose }: RatePreviewModalProps) {
  const [roomTypeId, setRoomTypeId] = useState(roomTypes[0]?.id ?? '');
  const [ratePlanId, setRatePlanId] = useState(ratePlans[0]?.id ?? '');

  // Defaults: tomorrow to 5 nights later
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const checkout = new Date(tomorrow);
  checkout.setDate(checkout.getDate() + 5);

  const [checkInDate, setCheckInDate] = useState(tomorrow.toISOString().split('T')[0]);
  const [checkOutDate, setCheckOutDate] = useState(checkout.toISOString().split('T')[0]);

  const [previewData, setPreviewData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRunPreview = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await previewRoomRatesAction({
        roomTypeId,
        ratePlanId,
        checkInDate,
        checkOutDate,
      });

      if (res.success && res.data) {
        setPreviewData(res.data);
      } else {
        setError(res.error || 'Failed to simulate rate resolution');
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-lg border border-resort-sand shadow-xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-resort-sand/60 bg-resort-ivory/20">
          <div>
            <h2 className="font-serif text-lg font-bold text-resort-charcoal flex items-center gap-2">
              <Eye className="w-5 h-5 text-resort-forest" />
              Canonical Rate Preview
            </h2>
            <p className="text-xs text-resort-stone mt-0.5">
              Simulate stay pricing night-by-night through the authoritative server-side rate resolver.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-resort-stone hover:text-resort-charcoal hover:bg-resort-sand/40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-6">
          <form onSubmit={handleRunPreview} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-resort-charcoal mb-1">
                Room Type
              </label>
              <select
                value={roomTypeId}
                onChange={(e) => setRoomTypeId(e.target.value)}
                className="w-full h-8 text-xs rounded border border-resort-sand px-2 bg-white"
              >
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-resort-charcoal mb-1">
                Rate Plan
              </label>
              <select
                value={ratePlanId}
                onChange={(e) => setRatePlanId(e.target.value)}
                className="w-full h-8 text-xs rounded border border-resort-sand px-2 bg-white"
              >
                {ratePlans.map((rp) => (
                  <option key={rp.id} value={rp.id}>
                    {rp.code} - {rp.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-resort-charcoal mb-1">
                Check-In Date
              </label>
              <input
                type="date"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                required
                className="w-full h-8 text-xs rounded border border-resort-sand px-2 bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-resort-charcoal mb-1">
                Check-Out Date
              </label>
              <input
                type="date"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                min={checkInDate}
                required
                className="w-full h-8 text-xs rounded border border-resort-sand px-2 bg-white"
              />
            </div>

            <div>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isPending}
                className="w-full h-8 text-xs bg-resort-forest text-white hover:bg-resort-forest/90"
              >
                {isPending ? 'Simulating...' : 'Simulate Rates'}
              </Button>
            </div>
          </form>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-800">
              {error}
            </div>
          )}

          {/* Results Table */}
          {previewData && (
            <div className="space-y-4 pt-4 border-t border-resort-sand/60">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-resort-sand/20 p-3 rounded-lg border border-resort-sand/60">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-resort-stone">Total Nights</span>
                  <div className="font-serif text-lg font-bold text-resort-charcoal">{previewData.totalNights}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-resort-stone">Average Rate</span>
                  <div className="font-serif text-lg font-bold text-resort-charcoal">
                    ₹{parseFloat(previewData.averageNightlyRate).toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-resort-stone">Total Base Amount</span>
                  <div className="font-serif text-lg font-bold text-resort-forest">
                    ₹{parseFloat(previewData.totalBaseAmount).toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-resort-stone">Total Discount</span>
                  <div className="font-serif text-lg font-bold text-emerald-700">
                    ₹{parseFloat(previewData.totalPromotionDiscount).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Nightly Breakdown Table */}
              <div className="border border-resort-sand/60 rounded-md overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-resort-sand/60 bg-resort-sand/30 text-[10px] font-semibold text-resort-stone uppercase">
                      <th className="py-2.5 px-3">Night</th>
                      <th className="py-2.5 px-3">Day of Week</th>
                      <th className="py-2.5 px-3">Winning Rate Type</th>
                      <th className="py-2.5 px-3">Rule Name</th>
                      <th className="py-2.5 px-3 text-right">Rack Price</th>
                      <th className="py-2.5 px-3 text-right">Winning Price</th>
                      <th className="py-2.5 px-3 text-right">Discount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-resort-sand/40 font-normal">
                    {previewData.nights.map((n: any, idx: number) => {
                      const isWeekend = n.isWeekend;
                      const hasDiscount = parseFloat(n.discountAmount) > 0;

                      return (
                        <tr key={idx} className="hover:bg-resort-ivory/30">
                          <td className="py-2.5 px-3 font-mono font-medium text-resort-charcoal">{n.date}</td>
                          <td className="py-2.5 px-3">
                            <span className={isWeekend ? 'font-semibold text-indigo-700' : 'text-resort-stone'}>
                              {FULL_DAY_NAMES[n.dayOfWeek]} {isWeekend && '(Weekend)'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                n.rateType === 'BASE'
                                  ? 'bg-stone-100 text-stone-700'
                                  : n.rateType === 'PROMOTION'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : n.rateType === 'FESTIVAL'
                                  ? 'bg-rose-100 text-rose-800'
                                  : n.rateType === 'SEASONAL'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {n.rateType}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-resort-charcoal">
                            {n.rateName || <span className="text-resort-stone italic">Default Base Price</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right text-resort-stone">
                            ₹{parseFloat(n.referencePrice).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-resort-charcoal">
                            ₹{parseFloat(n.appliedPrice).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {hasDiscount ? (
                              <span className="text-emerald-700 font-medium">
                                -₹{parseFloat(n.discountAmount).toLocaleString('en-IN')}
                              </span>
                            ) : (
                              <span className="text-resort-stone">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
