'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { postServiceChargeAction, getActiveServicesAction } from '@/actions/frontdesk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Loader2, X, AlertCircle, CheckCircle2, Plus } from 'lucide-react';

interface Service {
  id: string;
  name: string;
  code: string;
  basePrice: string;
  description: string | null;
}

interface TaxPreview {
  taxCode: string;
  taxName: string;
  taxRate: string;
  serviceChargeAmount: string;
  taxAmount: string;
  grossTotal: string;
  netSubtotal: string;
}

interface PostChargeModalProps {
  stayId: string;
  stayNumber: string;
  roomNumber: string;
  guestName: string;
  onClose: () => void;
}

export function PostChargeModal({ stayId, stayNumber, roomNumber, guestName, onClose }: PostChargeModalProps) {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Request-scoped idempotency token: generated once per charge operation.
  // Stable across retries of the same request. New modal = new key.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [taxPreview, setTaxPreview] = useState<TaxPreview | null>(null);
  const [loadingTax, setLoadingTax] = useState(false);

  const fetchTaxPreview = useCallback(async (serviceId: string, qty: number, price: string) => {
    if (!serviceId) {
      setTaxPreview(null);
      return;
    }
    setLoadingTax(true);
    try {
      const params = new URLSearchParams({ serviceId, quantity: String(qty) });
      if (price) params.set('unitPrice', price);
      const res = await fetch(`/api/frontdesk/tax-preview?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTaxPreview(data);
      } else {
        setTaxPreview(null);
      }
    } catch {
      setTaxPreview(null);
    }
    setLoadingTax(false);
  }, []);

  useEffect(() => {
    async function load() {
      const res = await getActiveServicesAction();
      if (res.success && res.data) {
        setServices(res.data);
      }
      setLoadingServices(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (selectedServiceId) {
      fetchTaxPreview(selectedServiceId, quantity, unitPrice);
    }
  }, [selectedServiceId, quantity, unitPrice, fetchTaxPreview]);

  const handleServiceChange = useCallback(
    (serviceId: string) => {
      setSelectedServiceId(serviceId);
      const svc = services.find((s) => s.id === serviceId);
      if (svc) {
        setDescription(svc.name);
        setUnitPrice(svc.basePrice);
      }
      fetchTaxPreview(serviceId, quantity, svc?.basePrice || '');
    },
    [services, fetchTaxPreview, quantity]
  );

  const handleSubmit = async () => {
    setError(null);

    if (!selectedServiceId) {
      setError('Please select a service');
      return;
    }
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    if (quantity < 1) {
      setError('Quantity must be at least 1');
      return;
    }

    setSubmitting(true);

    const formData = new FormData();
    formData.append('stayId', stayId);
    formData.append('serviceId', selectedServiceId);
    formData.append('description', description.trim());
    formData.append('quantity', String(quantity));
    if (unitPrice) formData.append('unitPrice', unitPrice);
    if (notes.trim()) formData.append('notes', notes.trim());
    formData.append('idempotencyKey', idempotencyKey);

    const res = await postServiceChargeAction(null, formData);

    if (res.success) {
      setSuccess(true);
      router.refresh();
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setError(res.error || 'Failed to post charge');
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <Card className="w-full max-w-md mx-4 border-emerald-200 bg-emerald-50">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-emerald-900">Charge Posted Successfully</p>
            <p className="text-xs text-emerald-700 mt-1">The folio has been updated.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayNet = taxPreview ? parseFloat(taxPreview.netSubtotal) : (parseFloat(unitPrice || '0') * quantity);
  const displayServiceCharge = taxPreview ? parseFloat(taxPreview.serviceChargeAmount) : 0;
  const displayTax = taxPreview ? parseFloat(taxPreview.taxAmount) : 0;
  const displayGross = taxPreview ? parseFloat(taxPreview.grossTotal) : displayNet;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <Card
        className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="p-4 pb-2 border-b border-resort-sand">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-resort-charcoal">
              Post Charge — Room {roomNumber}
            </CardTitle>
            <button onClick={onClose} className="text-resort-muted hover:text-resort-charcoal">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-resort-muted">
            Stay: {stayNumber} | Guest: {guestName}
          </p>
        </CardHeader>

        <CardContent className="p-4 space-y-3">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loadingServices ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-resort-forest" />
              <span className="ml-2 text-xs text-resort-muted">Loading services...</span>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Service *</Label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => handleServiceChange(e.target.value)}
                  className="w-full h-9 rounded-md border border-resort-sand bg-white px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-resort-forest"
                >
                  <option value="">Select a service...</option>
                  {services.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name} ({svc.code}) — ₹{parseFloat(svc.basePrice).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Description *</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Charge description"
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Quantity *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Unit Price (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="text-xs font-mono"
                    placeholder="Server-set from service"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional internal notes"
                  className="text-xs"
                />
              </div>

              {selectedServiceId && unitPrice && (
                <div className="p-3 bg-resort-sand-light rounded-lg text-xs">
                  <div className="flex justify-between">
                    <span className="text-resort-muted">Unit Price × Qty</span>
                    <span className="font-mono">
                      ₹{parseFloat(unitPrice || '0').toFixed(2)} × {quantity}
                    </span>
                  </div>
                  {loadingTax ? (
                    <div className="flex items-center gap-1 mt-1 text-resort-muted">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading pricing...
                    </div>
                  ) : taxPreview ? (
                    <>
                      {displayServiceCharge > 0 && (
                        <div className="flex justify-between mt-1">
                          <span className="text-resort-muted">Service Charge</span>
                          <span className="font-mono text-resort-muted">
                            ₹{displayServiceCharge.toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between mt-1">
                        <span className="text-resort-muted">
                          {taxPreview.taxName} ({taxPreview.taxCode} — {taxPreview.taxRate}%)
                        </span>
                        <span className="font-mono text-resort-muted">
                          ₹{displayTax.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between mt-1 pt-1 border-t border-resort-sand font-semibold">
                        <span>Total (Gross)</span>
                        <span className="font-mono text-resort-charcoal">
                          ₹{displayGross.toFixed(2)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between mt-1 pt-1 border-t border-resort-sand font-semibold">
                      <span>Total</span>
                      <span className="font-mono text-resort-charcoal">
                        ₹{displayNet.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>

        <CardFooter className="p-4 pt-0 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs border-resort-sand"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={submitting || loadingServices}
            onClick={handleSubmit}
            className="bg-resort-forest hover:bg-resort-forest-light text-white text-xs"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Posting...
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5 mr-1" /> Post Charge
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
