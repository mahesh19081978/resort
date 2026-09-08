'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CreditCard, Smartphone, Building2, CheckCircle2, XCircle, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { getBookingStatusAction } from '@/actions/booking/status';
import { simulateMockGatewayPaymentAction } from '@/actions/booking/payment-simulate';
import { SanitizedPublicBooking } from '@/lib/booking/reservation-service';

function MockPaymentGatewayContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const txRef = searchParams.get('tx') || '';
  const reservationId = searchParams.get('res') || '';
  const token = searchParams.get('token') || '';
  const statusToken = searchParams.get('statusToken') || '';
  const initialChannel = searchParams.get('channel');

  const [booking, setBooking] = useState<SanitizedPublicBooking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<'CARD' | 'UPI' | 'NET_BANKING'>(() => {
    if (initialChannel === 'UPI') return 'UPI';
    if (initialChannel === 'NET_BANKING') return 'NET_BANKING';
    return 'CARD';
  });
  const [error, setError] = useState<string | null>(null);
  const [gatewayResult, setGatewayResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    // Production Guard: Mock gateway simulator is strictly unavailable in production
    if (process.env.NODE_ENV === 'production') {
      setError('Mock payment simulator is strictly disabled in production environment.');
      setIsLoading(false);
      return;
    }

    async function loadBooking() {
      const activeStatusToken = statusToken || token;
      if (!reservationId && !activeStatusToken) {
        setError('Missing reservation context.');
        setIsLoading(false);
        return;
      }

      const res = await getBookingStatusAction(reservationId || activeStatusToken, activeStatusToken || undefined);
      if (!res.success || !res.data) {
        setError(res.error?.message || 'Unable to retrieve reservation details.');
      } else {
        setBooking(res.data);
      }
      setIsLoading(false);
    }

    loadBooking();
  }, [reservationId, token, statusToken]);

  const handleSimulatePayment = async (status: 'SUCCESS' | 'FAILED') => {
    if (!token) {
      setError('A valid signed public_payment token is required to simulate payment.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await simulateMockGatewayPaymentAction({
        token,
        outcome: status,
        channel: selectedMethod,
      });

      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Payment simulation failed on server.');
      }

      if (status === 'SUCCESS') {
        setGatewayResult({
          success: true,
          message: 'Payment authorized and confirmed by bank. Redirecting to confirmation...',
        });
        const statusToken = res.data.statusAccessToken;
        setTimeout(() => {
          router.push(`/booking?token=${encodeURIComponent(statusToken || '')}`);
        }, 1500);
      } else {
        setGatewayResult({
          success: false,
          message: 'Payment simulation declined. Hold remains active until 15-minute expiration.',
        });
      }
    } catch (err: any) {
      console.error('Simulation error', err);
      setError(err?.message || 'Payment simulation failed.');
    } finally {
      setSubmitting(false);
    }
  };
  if (isLoading) {
    return (
      <div className="bg-resort-ivory pt-28 md:pt-32 min-h-[70vh] flex flex-col items-center justify-center p-6">
        <Loader2 className="h-10 w-10 animate-spin text-resort-gold mb-4" />
        <p className="text-sm text-resort-muted">Connecting to payment gateway...</p>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="bg-resort-ivory pt-28 md:pt-32 min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4 text-red-600">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-resort-charcoal-text mb-2">Payment Gateway Error</h2>
        <p className="text-sm text-resort-muted max-w-md mb-6">{error}</p>
        <button
          onClick={() => router.push('/booking')}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-resort-forest text-white rounded-full text-sm font-semibold hover:bg-resort-forest-light"
        >
          <ArrowLeft className="h-4 w-4" /> Return to Booking
        </button>
      </div>
    );
  }

  return (
    <div className="bg-resort-ivory pt-28 md:pt-32 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[720px] mx-auto bg-white rounded-2xl shadow-luxury-lg overflow-hidden border border-resort-sand/60">
        {/* Header */}
        <div className="bg-resort-forest px-6 pt-5 pb-6 text-white text-center relative">
          <div className="inline-block px-3 py-1 rounded-full bg-resort-gold/20 text-resort-gold text-[10px] font-semibold uppercase tracking-wider mb-3">
            Mock Gateway · Dev / QA
          </div>
          <h1 className="font-display text-xl md:text-2xl font-bold">Secure Online Payment</h1>
          <p className="text-xs text-resort-sand/70 mt-1">
            HDFC / Razorpay Checkout
          </p>
        </div>

        {/* Amount Banner */}
        <div className="bg-resort-sand/30 px-6 py-5 flex items-center justify-between border-b border-resort-sand/60">
          <div>
            <p className="text-[10px] text-resort-muted uppercase tracking-wider font-semibold">Amount Payable</p>
            <p className="text-2xl md:text-3xl font-display font-bold text-resort-charcoal-text mt-0.5">
              {formatCurrency(booking?.requiredAdvanceAmount || 0)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-resort-muted uppercase tracking-wider font-semibold">Guest</p>
            <p className="text-sm font-semibold text-resort-charcoal-text mt-0.5">{booking?.maskedGuestName}</p>
            <p className="text-[10px] text-resort-muted mt-0.5">
              Ref: <span className="font-mono text-resort-forest">{booking?.reservationNumber}</span>
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>{error}</div>
            </div>
          )}

          {gatewayResult && (
            <div
              className={`p-4 rounded-xl border text-xs flex items-start gap-2 ${
                gatewayResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              {gatewayResult.success ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
              )}
              <div>{gatewayResult.message}</div>
            </div>
          )}

          {/* Payment Method Selector */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-resort-muted mb-3">
              Select Gateway Payment Channel
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setSelectedMethod('CARD')}
                className={`p-4 rounded-xl border text-center transition-all ${
                  selectedMethod === 'CARD'
                    ? 'border-resort-forest bg-resort-forest/5 ring-1 ring-resort-forest/30'
                    : 'border-resort-sand/80 hover:border-resort-sand hover:bg-resort-sand/20'
                }`}
              >
                <CreditCard className="h-5 w-5 mx-auto mb-1.5 text-resort-forest" />
                <span className="text-xs font-semibold block text-resort-charcoal-text">Credit/Debit</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedMethod('UPI')}
                className={`p-4 rounded-xl border text-center transition-all ${
                  selectedMethod === 'UPI'
                    ? 'border-resort-forest bg-resort-forest/5 ring-1 ring-resort-forest/30'
                    : 'border-resort-sand/80 hover:border-resort-sand hover:bg-resort-sand/20'
                }`}
              >
                <Smartphone className="h-5 w-5 mx-auto mb-1.5 text-resort-forest" />
                <span className="text-xs font-semibold block text-resort-charcoal-text">UPI / QR</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedMethod('NET_BANKING')}
                className={`p-4 rounded-xl border text-center transition-all ${
                  selectedMethod === 'NET_BANKING'
                    ? 'border-resort-forest bg-resort-forest/5 ring-1 ring-resort-forest/30'
                    : 'border-resort-sand/80 hover:border-resort-sand hover:bg-resort-sand/20'
                }`}
              >
                <Building2 className="h-5 w-5 mx-auto mb-1.5 text-resort-forest" />
                <span className="text-xs font-semibold block text-resort-charcoal-text">Net Banking</span>
              </button>
            </div>
          </div>

          {/* Channel Form Details (Simulated) */}
          <div className="p-4 rounded-xl bg-resort-sand/20 border border-resort-sand/50 text-xs space-y-1.5">
            {selectedMethod === 'CARD' && (
              <>
                <p className="font-medium text-resort-charcoal-text">Simulated Card: 4111 •••• •••• 1111</p>
                <p className="text-resort-muted">Expiry: 12/29 | CVV: •••</p>
              </>
            )}
            {selectedMethod === 'UPI' && (
              <>
                <p className="font-medium text-resort-charcoal-text">Simulated VPA: guest@okhdfcbank</p>
                <p className="text-resort-muted">Collect request simulated directly to your UPI app</p>
              </>
            )}
            {selectedMethod === 'NET_BANKING' && (
              <>
                <p className="font-medium text-resort-charcoal-text">Simulated Bank: State Bank of India / HDFC</p>
                <p className="text-resort-muted">Secure redirected session simulation</p>
              </>
            )}
          </div>

          {/* Action Simulation Buttons */}
          <div className="space-y-3 pt-2">
            <button
              type="button"
              disabled={submitting || (gatewayResult?.success ?? false)}
              onClick={() => handleSimulatePayment('SUCCESS')}
              className="w-full py-4 bg-resort-forest text-white font-semibold rounded-xl hover:bg-resort-forest-light transition-all text-sm shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing Payment...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Simulate Successful Payment ({formatCurrency(booking?.requiredAdvanceAmount || 0)})
                </>
              )}
            </button>

            <button
              type="button"
              disabled={submitting || (gatewayResult?.success ?? false)}
              onClick={() => handleSimulatePayment('FAILED')}
              className="w-full py-3 bg-white text-red-700 border border-red-200 font-semibold rounded-xl hover:bg-red-50 transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <XCircle className="h-4 w-4" /> Simulate Bank Decline / Failure
            </button>

            <button
              type="button"
              onClick={() => router.push('/booking')}
              className="w-full py-2.5 text-resort-muted hover:text-resort-charcoal-text text-xs font-semibold text-center block transition-colors"
            >
              Cancel and Return to Booking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MockPaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-resort-ivory pt-28 md:pt-32 min-h-[70vh] flex items-center justify-center p-6">
          <Loader2 className="h-8 w-8 animate-spin text-resort-gold" />
        </div>
      }
    >
      <MockPaymentGatewayContent />
    </Suspense>
  );
}
