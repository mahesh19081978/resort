'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { previewStayExtensionAction, extendStayAction } from '@/actions/frontdesk';
import { Calendar, AlertCircle, CheckCircle2, ArrowRight, Loader2, X } from 'lucide-react';

interface ExtendStayModalProps {
  stayId: string;
  stayNumber: string;
  currentRoomNumber: string;
  currentRoomTypeName: string;
  currentExpectedCheckout: string;
  guestName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ExtendStayModal({
  stayId,
  stayNumber,
  currentRoomNumber,
  currentRoomTypeName,
  currentExpectedCheckout,
  guestName,
  isOpen,
  onClose,
  onSuccess,
}: ExtendStayModalProps) {
  // Default new checkout date: +1 day from current expected checkout
  const currentCheckoutStr = currentExpectedCheckout.slice(0, 10);
  const nextDay = new Date(currentCheckoutStr);
  nextDay.setDate(nextDay.getDate() + 1);
  const minDateStr = nextDay.toISOString().slice(0, 10);

  const [newCheckoutDate, setNewCheckoutDate] = useState<string>(minDateStr);
  const [selectedTargetRoomId, setSelectedTargetRoomId] = useState<string>('');
  const [transferReason, setTransferReason] = useState<string>('');
  
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any | null>(null);

  // Fetch preview whenever checkout date changes
  useEffect(() => {
    if (!isOpen || !newCheckoutDate) return;
    if (newCheckoutDate <= currentCheckoutStr) {
      setPreviewData(null);
      setPreviewError('New checkout date must be later than current checkout date (' + currentCheckoutStr + ').');
      return;
    }

    let isMounted = true;
    setPreviewLoading(true);
    setPreviewError(null);

    previewStayExtensionAction(
      stayId,
      `${newCheckoutDate}T11:00:00.000Z`
    ).then((res) => {
      if (!isMounted) return;
      setPreviewLoading(false);
      if (res.success && res.data) {
        setPreviewData(res.data);
        if (!res.data.isSameRoomAvailable && res.data.availableSameTypeRooms.length > 0) {
          setSelectedTargetRoomId(res.data.availableSameTypeRooms[0].id);
        } else {
          setSelectedTargetRoomId('');
        }
      } else {
        setPreviewError(res.error || 'Failed to check room availability.');
        setPreviewData(null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [stayId, newCheckoutDate, currentCheckoutStr]);

  const handleConfirmExtend = async () => {
    if (!newCheckoutDate) return;
    setSubmitting(true);
    setSubmitError(null);

    const idempotencyKey = `ext_${stayId}_${newCheckoutDate}_${Date.now()}`;

    const formData = new FormData();
    formData.append('stayId', stayId);
    formData.append('newCheckoutDate', `${newCheckoutDate}T11:00:00.000Z`);
    if (selectedTargetRoomId) formData.append('targetRoomId', selectedTargetRoomId);
    if (transferReason.trim()) formData.append('transferReason', transferReason.trim());
    formData.append('idempotencyKey', idempotencyKey);

    const res = await extendStayAction(null, formData);

    setSubmitting(false);

    if (res.success && res.data) {
      setSuccessResult(res.data);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } else {
      setSubmitError(res.error || 'Stay extension failed.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto border-resort-sand bg-white shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-resort-sand">
          <CardTitle className="flex items-center gap-2 text-lg text-resort-charcoal">
            <Calendar className="w-5 h-5 text-resort-forest" />
            Extend Guest Stay
          </CardTitle>
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
          {successResult ? (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h3 className="text-base font-bold text-resort-charcoal">Stay Successfully Extended!</h3>
              <p className="text-xs text-resort-muted">
                Checkout extended to <span className="font-semibold text-resort-charcoal">{successResult.newExpectedCheckout.slice(0, 10)}</span>.
              </p>
              {successResult.roomTransferred ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
                  Room transferred from <span className="font-bold">{successResult.oldRoomNumber}</span> to <span className="font-bold">{successResult.roomNumber}</span>.
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-xs">
                  Guest continues in Room <span className="font-bold">{successResult.roomNumber}</span>.
                </div>
              )}
              <p className="text-xs font-mono text-resort-charcoal font-semibold">
                Additional Charge: {formatINR(successResult.additionalGrossCharge)} posted to Folio.
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {/* Current Stay Context */}
              <div className="p-3 bg-resort-sand-light rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-resort-muted block text-[10px] uppercase">Guest</span>
                  <span className="font-semibold text-resort-charcoal truncate block">{guestName}</span>
                </div>
                <div>
                  <span className="text-resort-muted block text-[10px] uppercase">Stay #</span>
                  <span className="font-mono text-resort-charcoal">{stayNumber}</span>
                </div>
                <div>
                  <span className="text-resort-muted block text-[10px] uppercase">Current Room</span>
                  <span className="font-semibold text-resort-charcoal">{currentRoomNumber} ({currentRoomTypeName})</span>
                </div>
                <div>
                  <span className="text-resort-muted block text-[10px] uppercase">Current Checkout</span>
                  <span className="font-mono font-medium text-resort-charcoal">{currentCheckoutStr}</span>
                </div>
              </div>

              {/* Date Input */}
              <div className="space-y-1.5">
                <Label htmlFor="newCheckout" className="text-xs font-semibold text-resort-charcoal">
                  New Departure Date
                </Label>
                <Input
                  id="newCheckout"
                  type="date"
                  min={minDateStr}
                  value={newCheckoutDate}
                  onChange={(e) => setNewCheckoutDate(e.target.value)}
                  className="text-xs w-full sm:w-60"
                />
              </div>

              {/* Preview Loading */}
              {previewLoading && (
                <div className="py-6 flex items-center justify-center gap-2 text-resort-muted text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-resort-forest" />
                  Checking physical room availability across extended dates...
                </div>
              )}

              {/* Preview Error */}
              {previewError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-800 flex items-start gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>{previewError}</div>
                </div>
              )}

              {/* Preview Content */}
              {previewData && !previewLoading && (
                <div className="space-y-3">
                  {/* Room Availability Status */}
                  {previewData.isSameRoomAvailable ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>
                          Same physical room <strong>{currentRoomNumber}</strong> is available for all {previewData.additionalNights} additional night(s).
                        </span>
                      </div>
                      <Badge variant="success" className="text-[10px]">No Room Move</Badge>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          Room {currentRoomNumber} is NOT available for the extended range.
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800">
                        A room transfer to another <strong>{currentRoomTypeName}</strong> room is required.
                      </p>

                      {previewData.availableSameTypeRooms.length > 0 ? (
                        <div className="pt-2 border-t border-amber-200 space-y-2">
                          <Label htmlFor="targetRoomSelect" className="text-[11px] font-semibold text-amber-900">
                            Select Replacement Room:
                          </Label>
                          <select
                            id="targetRoomSelect"
                            value={selectedTargetRoomId}
                            onChange={(e) => setSelectedTargetRoomId(e.target.value)}
                            className="w-full h-8 rounded border border-amber-300 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                          >
                            {previewData.availableSameTypeRooms.map((r: any) => (
                              <option key={r.id} value={r.id}>
                                {r.roomNumber} ({r.buildingName || ''} {r.floorName ? `- ${r.floorName}` : ''})
                              </option>
                            ))}
                          </select>
                          <div className="space-y-1">
                            <Label htmlFor="transferReason" className="text-[11px] text-amber-900">
                              Transfer Reason (Optional):
                            </Label>
                            <Input
                              id="transferReason"
                              placeholder="e.g. Extended stay; original room reserved"
                              value={transferReason}
                              onChange={(e) => setTransferReason(e.target.value)}
                              className="text-xs h-8"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-rose-700 font-semibold pt-1">
                          No other rooms of category [{currentRoomTypeName}] are available for these dates. Extension cannot proceed.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Additional Financial Breakdown */}
                  <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-1.5">
                    <div className="font-semibold text-resort-charcoal text-[11px] uppercase tracking-wider mb-1">
                      Financial Summary ({previewData.additionalNights} Night{previewData.additionalNights > 1 ? 's' : ''})
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-resort-muted">Nightly Rate ({previewData.roomTypeName})</span>
                      <span className="font-mono text-resort-charcoal">{formatINR(previewData.nightlyRate)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-resort-muted">Room Charge ({previewData.additionalNights} × {formatINR(previewData.nightlyRate)})</span>
                      <span className="font-mono text-resort-charcoal">{formatINR(previewData.additionalRoomCharge)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-resort-muted">Taxes & GST ({previewData.taxCode} @ {previewData.taxRatePercent}%)</span>
                      <span className="font-mono text-resort-charcoal">{formatINR(previewData.additionalTaxAmount)}</span>
                    </div>
                    <div className="flex justify-between text-xs pt-1 border-t border-neutral-200 font-semibold">
                      <span className="text-resort-charcoal">Additional Gross Total</span>
                      <span className="font-mono text-resort-forest text-sm font-bold">
                        {formatINR(previewData.additionalGrossTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {submitError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs">
                  {submitError}
                </div>
              )}
            </div>
          )}

          {!successResult && (
            <div className="pt-2 flex justify-end gap-2 border-t border-resort-sand">
              <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-resort-forest hover:bg-resort-forest-light text-white"
                onClick={handleConfirmExtend}
                disabled={
                  previewLoading ||
                  !previewData ||
                  (!previewData.isSameRoomAvailable && previewData.availableSameTypeRooms.length === 0) ||
                  submitting
                }
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Extending...
                  </>
                ) : (
                  <>
                    Confirm Extension <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
