'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createAdminReservationAction,
  calculateAdminPricingAction,
} from '@/actions/booking/admin';
import {
  Calendar,
  Users,
  BedDouble,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  DollarSign,
  User,
} from 'lucide-react';
import { BookingSource, PaymentMethod } from '@prisma/client';

interface RoomTypeOption {
  id: string;
  name: string;
  code: string;
  basePrice: number;
  maxOccupancy: number;
}

interface AdminNewReservationFormProps {
  roomTypes: RoomTypeOption[];
  todayStr: string;
  tomorrowStr: string;
}

export function AdminNewReservationForm({
  roomTypes,
  todayStr,
  tomorrowStr,
}: AdminNewReservationFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [isPricingLoading, startPricingTransition] = useTransition();

  // Form State
  const [checkInDate, setCheckInDate] = useState(todayStr);
  const [checkOutDate, setCheckOutDate] = useState(tomorrowStr);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  const [selectedRooms, setSelectedRooms] = useState<
    Array<{ roomTypeId: string; roomsCount: number }>
  >([
    {
      roomTypeId: roomTypes[0]?.id || '',
      roomsCount: 1,
    },
  ]);

  const [pricing, setPricing] = useState<{
    subtotal: string;
    taxAmount: string;
    discountAmount: string;
    totalAmount: string;
    nights: number;
    lines: Array<{
      roomTypeId: string;
      roomTypeName: string;
      roomsCount: number;
      ratePerNight: string;
      totalNights: number;
      lineTotal: string;
    }>;
  } | null>(null);

  // Guest Details
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('India');
  const [specialRequests, setSpecialRequests] = useState('');
  const [source, setSource] = useState<BookingSource>(BookingSource.FRONT_DESK_WALKIN);

  // Advance Payment
  const [recordPayment, setRecordPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Idempotency Key generated once per workflow instance
  const [bookingRequestId] = useState(() => crypto.randomUUID());

  const [error, setError] = useState<string | null>(null);

  // Step 1 -> 2: Calculate Pricing & Validate Dates
  const handleProceedToStep2 = () => {
    setError(null);
    if (!checkInDate || !checkOutDate || checkInDate >= checkOutDate) {
      setError('Check-out date must be strictly after check-in date.');
      return;
    }

    if (selectedRooms.length === 0 || !selectedRooms[0].roomTypeId) {
      setError('Please select at least one room category.');
      return;
    }

    startPricingTransition(async () => {
      const res = await calculateAdminPricingAction({
        checkInDate,
        checkOutDate,
        rooms: selectedRooms,
      });

      if (!res.success || !res.data) {
        setError(res.error || 'Failed to calculate room pricing.');
      } else {
        setPricing(res.data);
        setPaymentAmount(res.data.totalAmount);
        setStep(2);
      }
    });
  };

  // Step 2 -> 3: Validate Guest Info
  const handleProceedToStep3 = () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('Guest first and last names are required.');
      return;
    }
    if (!phone.trim() || phone.trim().length < 10) {
      setError('A valid guest phone number (at least 10 digits) is required.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('A valid guest email address is required.');
      return;
    }
    setStep(3);
  };

  // Final Submit
  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startSubmitTransition(async () => {
      const payload = {
        bookingRequestId,
        checkInDate,
        checkOutDate,
        adults,
        children,
        rooms: selectedRooms,
        guest: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          postalCode: postalCode.trim() || undefined,
          country: country.trim() || 'India',
        },
        source,
        specialRequests: specialRequests.trim() || undefined,
        advancePayment: recordPayment
          ? {
              received: true,
              amount: parseFloat(paymentAmount) || 0,
              method: paymentMethod,
              transactionReference: transactionReference.trim() || undefined,
              notes: paymentNotes.trim() || undefined,
            }
          : {
              received: false,
            },
      };

      const res = await createAdminReservationAction(payload);
      if (!res.success || !res.data) {
        setError(res.error || 'Failed to create reservation.');
      } else {
        router.push(`/admin/bookings/${res.data.reservationId}`);
        router.refresh();
      }
    });
  };

  const formatCurrency = (val: string | number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(Number(val));
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6 space-y-6">
      {/* Progress Steps Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= 1 ? 'bg-resort-forest text-white' : 'bg-neutral-100 text-neutral-400'
            }`}
          >
            1
          </div>
          <span className={`text-xs font-semibold ${step >= 1 ? 'text-neutral-900' : 'text-neutral-400'}`}>
            Dates & Rooms
          </span>
        </div>

        <div className="w-12 h-0.5 bg-neutral-200" />

        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= 2 ? 'bg-resort-forest text-white' : 'bg-neutral-100 text-neutral-400'
            }`}
          >
            2
          </div>
          <span className={`text-xs font-semibold ${step >= 2 ? 'text-neutral-900' : 'text-neutral-400'}`}>
            Guest Details
          </span>
        </div>

        <div className="w-12 h-0.5 bg-neutral-200" />

        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= 3 ? 'bg-resort-forest text-white' : 'bg-neutral-100 text-neutral-400'
            }`}
          >
            3
          </div>
          <span className={`text-xs font-semibold ${step >= 3 ? 'text-neutral-900' : 'text-neutral-400'}`}>
            Payment & Confirm
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: Dates, Occupancy & Rooms */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Check-in Date <span className="text-rose-600">*</span>
              </label>
              <Input
                type="date"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                className="text-xs h-9"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Check-out Date <span className="text-rose-600">*</span>
              </label>
              <Input
                type="date"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                className="text-xs h-9"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Adults</label>
              <select
                value={adults}
                onChange={(e) => setAdults(parseInt(e.target.value, 10))}
                className="w-full text-xs h-9 px-3 rounded-lg border border-neutral-200 bg-white text-neutral-800"
              >
                {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} Adult{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Children</label>
              <select
                value={children}
                onChange={(e) => setChildren(parseInt(e.target.value, 10))}
                className="w-full text-xs h-9 px-3 rounded-lg border border-neutral-200 bg-white text-neutral-800"
              >
                {[0, 1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} Child{n > 1 ? 'ren' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-neutral-800 uppercase tracking-wider">
              Room Category & Quantity
            </h3>

            {selectedRooms.map((room, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 rounded-lg border border-neutral-200 bg-neutral-50/60 items-center"
              >
                <div className="sm:col-span-8">
                  <label className="block text-[11px] font-medium text-neutral-500 mb-1">
                    Room Category
                  </label>
                  <select
                    value={room.roomTypeId}
                    onChange={(e) => {
                      const updated = [...selectedRooms];
                      updated[idx].roomTypeId = e.target.value;
                      setSelectedRooms(updated);
                    }}
                    className="w-full text-xs h-9 px-3 rounded-lg border border-neutral-200 bg-white text-neutral-800 font-medium"
                  >
                    {roomTypes.map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.name} ({rt.code}) — {formatCurrency(rt.basePrice)}/night (Max {rt.maxOccupancy} pax)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-medium text-neutral-500 mb-1">
                    Quantity
                  </label>
                  <select
                    value={room.roomsCount}
                    onChange={(e) => {
                      const updated = [...selectedRooms];
                      updated[idx].roomsCount = parseInt(e.target.value, 10);
                      setSelectedRooms(updated);
                    }}
                    className="w-full text-xs h-9 px-3 rounded-lg border border-neutral-200 bg-white text-neutral-800 font-medium"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} Room{n > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-neutral-200">
            <Button
              type="button"
              onClick={handleProceedToStep2}
              disabled={isPricingLoading}
              className="bg-resort-forest hover:bg-resort-forest-deep text-white text-xs font-semibold min-w-[140px]"
            >
              {isPricingLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Checking Rates...
                </>
              ) : (
                <>
                  Continue to Guest <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: Guest Details & Booking Source */}
      {step === 2 && (
        <div className="space-y-6">
          {pricing && (
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg flex items-center justify-between text-xs font-mono">
              <span className="text-neutral-600">
                {pricing.nights} Night(s) • Total: {formatCurrency(pricing.totalAmount)}
              </span>
              <span className="text-neutral-500">Tax Included: {formatCurrency(pricing.taxAmount)}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                First Name <span className="text-rose-600">*</span>
              </label>
              <Input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Rahul"
                className="text-xs h-9"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Last Name <span className="text-rose-600">*</span>
              </label>
              <Input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Sharma"
                className="text-xs h-9"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Phone Number <span className="text-rose-600">*</span>
              </label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 9876543210"
                className="text-xs h-9"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Email Address <span className="text-rose-600">*</span>
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. rahul.sharma@example.com"
                className="text-xs h-9"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Address</label>
              <Input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address..."
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">City</label>
              <Input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City..."
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Booking Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as BookingSource)}
                className="w-full text-xs h-9 px-3 rounded-lg border border-neutral-200 bg-white text-neutral-800"
              >
                <option value={BookingSource.FRONT_DESK_WALKIN}>Front Desk Walk-in</option>
                <option value={BookingSource.PHONE_CALL}>Phone Reservation</option>
                <option value={BookingSource.DIRECT_WEBSITE}>Direct Website (Staff assisted)</option>
                <option value={BookingSource.CORPORATE}>Corporate Booking</option>
                <option value={BookingSource.TRAVEL_AGENT}>Travel Agent</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Special Requests / Notes
              </label>
              <textarea
                rows={2}
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                placeholder="e.g. Late check-in requested, quiet room preferred..."
                className="w-full text-xs p-2.5 rounded-lg border border-neutral-200"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep(1)}
              className="text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Dates
            </Button>
            <Button
              type="button"
              onClick={handleProceedToStep3}
              className="bg-resort-forest hover:bg-resort-forest-deep text-white text-xs font-semibold"
            >
              Continue to Payment <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: Payment & Final Confirmation */}
      {step === 3 && (
        <form onSubmit={handleFinalSubmit} className="space-y-6">
          {/* Reservation Summary */}
          <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-3 text-xs">
            <h4 className="font-semibold text-neutral-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Reservation Overview
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-neutral-700">
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase">Guest</span>
                <span className="font-semibold">
                  {firstName} {lastName}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase">Stay Dates</span>
                <span className="font-semibold">
                  {checkInDate} → {checkOutDate} ({pricing?.nights} nights)
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase">Party</span>
                <span className="font-semibold">
                  {adults} Adult(s), {children} Child(ren)
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase">Calculated Total</span>
                <span className="font-semibold font-mono text-emerald-800 text-sm">
                  {pricing ? formatCurrency(pricing.totalAmount) : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Options */}
          <div className="space-y-4 border border-neutral-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-neutral-900">Record Advance Payment</h4>
                <p className="text-[11px] text-neutral-500">
                  Collect cash, card or UPI payment now, or leave as pay-at-hotel.
                </p>
              </div>
              <input
                type="checkbox"
                checked={recordPayment}
                onChange={(e) => setRecordPayment(e.target.checked)}
                className="w-4 h-4 text-resort-forest rounded border-neutral-300"
              />
            </div>

            {recordPayment && (
              <div className="pt-3 border-t border-neutral-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                    Advance Amount (₹)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="text-xs h-9 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full text-xs h-9 px-3 rounded-lg border border-neutral-200 bg-white"
                  >
                    <option value={PaymentMethod.CASH}>Cash</option>
                    <option value={PaymentMethod.UPI}>UPI</option>
                    <option value={PaymentMethod.CARD}>Card / POS</option>
                    <option value={PaymentMethod.BANK_TRANSFER}>Bank Transfer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                    Transaction Ref (Optional)
                  </label>
                  <Input
                    type="text"
                    value={transactionReference}
                    onChange={(e) => setTransactionReference(e.target.value)}
                    placeholder="e.g. UPI Ref / POS Receipt #"
                    className="text-xs h-9"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep(2)}
              disabled={isSubmitting}
              className="text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Guest
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-resort-forest hover:bg-resort-forest-deep text-white text-xs font-semibold min-w-[160px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Creating Reservation...
                </>
              ) : (
                'Create Reservation'
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
