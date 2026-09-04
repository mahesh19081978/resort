'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkInAction } from '@/actions/frontdesk';
import { WebcamCapture } from './WebcamCapture';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { IdDocumentType, PaymentMethod } from '@prisma/client';
import {
  CheckCircle2,
  AlertCircle,
  Camera,
  FileText,
  BedDouble,
  UserCheck,
  ShieldCheck,
  CreditCard,
  ClipboardList,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
} from 'lucide-react';

interface EligibleRoom {
  id: string;
  roomNumber: string;
  status: string;
  floor: {
    name: string;
    building: {
      name: string;
    };
  };
}

interface CheckInWizardProps {
  reservation: {
    id: string;
    reservationNumber: string;
    checkInDate: string;
    checkOutDate: string;
    primaryGuest: {
      id: string;
      firstName: string;
      lastName: string;
      email?: string | null;
      phone?: string | null;
    };
    reservedRooms: Array<{
      roomType: {
        id: string;
        name: string;
      };
      ratePerNight: string;
    }>;
  };
  eligibleRooms: EligibleRoom[];
}

const STAGES = [
  { id: 1, label: 'Reservation' },
  { id: 2, label: 'Guest Info' },
  { id: 3, label: 'ID Proof' },
  { id: 4, label: 'Photo' },
  { id: 5, label: 'Room' },
  { id: 6, label: 'Deposit' },
  { id: 7, label: 'Review' },
  { id: 8, label: 'Activate' },
];

export function CheckInWizard({ reservation, eligibleRooms }: CheckInWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any | null>(null);

  // Form State
  const [selectedRoomId, setSelectedRoomId] = useState<string>(eligibleRooms[0]?.id || '');
  const [expectedCheckOut, setExpectedCheckOut] = useState<string>(reservation.checkOutDate);
  const [idDocumentType, setIdDocumentType] = useState<IdDocumentType>(IdDocumentType.PASSPORT);
  const [idDocumentNumber, setIdDocumentNumber] = useState<string>('');
  const [documentStorageRef, setDocumentStorageRef] = useState<string>('');
  const [photoStorageRef, setPhotoStorageRef] = useState<string>('');
  const [advanceDepositAmount, setAdvanceDepositAmount] = useState<string>('0');
  const [advanceDepositMethod, setAdvanceDepositMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [advanceDepositReference, setAdvanceDepositReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const selectedRoom = eligibleRooms.find((r) => r.id === selectedRoomId);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append('reservationId', reservation.id);
    formData.append('roomId', selectedRoomId);
    formData.append('expectedCheckOut', expectedCheckOut);
    formData.append('idDocumentType', idDocumentType);
    formData.append('idDocumentNumber', idDocumentNumber);
    if (documentStorageRef) formData.append('documentStorageRef', documentStorageRef);
    if (photoStorageRef) formData.append('photoStorageRef', photoStorageRef);
    if (notes) formData.append('notes', notes);

    const depositNum = parseFloat(advanceDepositAmount);
    if (!isNaN(depositNum) && depositNum > 0) {
      formData.append('advanceDepositAmount', depositNum.toString());
      formData.append('advanceDepositMethod', advanceDepositMethod);
      if (advanceDepositReference) formData.append('advanceDepositReference', advanceDepositReference);
    }

    const res = await checkInAction(null, formData);
    setLoading(false);

    if (res.success && res.data) {
      setSuccessData(res.data);
    } else {
      setError(res.error || 'Check-in failed');
    }
  };

  if (successData) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            <div>
              <CardTitle className="text-xl text-emerald-900">Check-In Successful</CardTitle>
              <p className="text-xs text-emerald-700 mt-1">
                Stay #{successData.stayNumber} has been activated. Room is now OCCUPIED.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-white rounded-lg border border-emerald-100 text-xs">
            <div>
              <span className="text-neutral-500 block">Stay Number</span>
              <span className="font-mono font-bold text-neutral-900">{successData.stayNumber}</span>
            </div>
            <div>
              <span className="text-neutral-500 block">Assigned Room</span>
              <span className="font-mono font-bold text-neutral-900">{successData.roomNumber}</span>
            </div>
            <div>
              <span className="text-neutral-500 block">Primary Folio</span>
              <span className="font-mono font-bold text-neutral-900">{successData.folioNumber}</span>
            </div>
            <div>
              <span className="text-neutral-500 block">Guest</span>
              <span className="font-medium text-neutral-900">{successData.guestName}</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => router.push('/admin/frontdesk')}
            className="border-emerald-300"
          >
            Return to Front Desk
          </Button>
          <Button
            onClick={() => router.push('/admin/frontdesk/inhouse')}
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            View In-House Stays
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 8-Stage Wizard Header */}
      <div className="border-b border-neutral-200 pb-3">
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 text-[11px]">
          {STAGES.map((s) => (
            <div
              key={s.id}
              className={`flex flex-col items-center text-center p-1.5 rounded transition-colors ${
                step === s.id
                  ? 'bg-neutral-900 text-white font-semibold'
                  : step > s.id
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-neutral-500'
              }`}
            >
              <span className="text-[10px] opacity-75">Stage {s.id}</span>
              <span className="truncate w-full mt-0.5">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-3 text-rose-800 text-xs">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* STAGE 1: RESERVATION REVIEW */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <ClipboardList className="w-5 h-5 mr-2 text-resort-gold" /> Stage 1: Reservation Review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <span className="text-neutral-500 block">Reservation Number</span>
                <span className="font-mono font-bold text-neutral-900">{reservation.reservationNumber}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Reserved Room Type</span>
                <span className="font-semibold text-neutral-900">{reservation.reservedRooms[0]?.roomType?.name}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Scheduled Check-In</span>
                <span className="font-mono text-neutral-900">{reservation.checkInDate.slice(0, 10)}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Scheduled Check-Out</span>
                <span className="font-mono text-neutral-900">{reservation.checkOutDate.slice(0, 10)}</span>
              </div>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded text-blue-900">
              Please verify that the arriving guest matches this reservation record before continuing.
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button
              type="button"
              onClick={() => setStep(2)}
              className="bg-resort-charcoal text-white hover:bg-neutral-800"
            >
              Continue to Guest Details <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STAGE 2: GUEST DETAILS */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <UserCheck className="w-5 h-5 mr-2 text-resort-gold" /> Stage 2: Guest Details & Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-neutral-500 block">Full Name</span>
                <span className="font-semibold text-neutral-900">
                  {reservation.primaryGuest.firstName} {reservation.primaryGuest.lastName}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block">Contact Phone</span>
                <span className="font-mono text-neutral-900">{reservation.primaryGuest.phone || 'Not Provided'}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Email Address</span>
                <span className="text-neutral-900">{reservation.primaryGuest.email || 'Not Provided'}</span>
              </div>
            </div>
            <p className="text-neutral-500 text-[11px]">
              Confirm contact details with guest for billing communications and keycard authorization.
            </p>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button"
              onClick={() => setStep(3)}
              className="bg-resort-charcoal text-white hover:bg-neutral-800"
            >
              Continue to ID Verification <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STAGE 3: ID DOCUMENT VERIFICATION */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <FileText className="w-5 h-5 mr-2 text-resort-gold" /> Stage 3: Guest ID Document Verification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="idDocumentType" className="text-xs">ID Document Type</Label>
                <select
                  id="idDocumentType"
                  value={idDocumentType}
                  onChange={(e) => setIdDocumentType(e.target.value as IdDocumentType)}
                  className="w-full h-9 rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                >
                  <option value={IdDocumentType.PASSPORT}>Passport</option>
                  <option value={IdDocumentType.DRIVING_LICENSE}>Driving License</option>
                  <option value={IdDocumentType.AADHAAR}>National ID / Aadhaar</option>
                  <option value={IdDocumentType.VOTER_ID}>Voter ID</option>
                  <option value={IdDocumentType.OTHER}>Other Government ID</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="idDocumentNumber" className="text-xs">Document Number</Label>
                <Input
                  id="idDocumentNumber"
                  placeholder="e.g. Z98765432"
                  value={idDocumentNumber}
                  onChange={(e) => setIdDocumentNumber(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="documentStorageRef" className="text-xs">
                Internal Document Vault Reference (Optional)
              </Label>
              <Input
                id="documentStorageRef"
                placeholder="vault://docs/... or leave blank for auto-generated ref"
                value={documentStorageRef}
                onChange={(e) => setDocumentStorageRef(e.target.value)}
                className="text-xs"
              />
              <p className="text-[11px] text-neutral-500">
                Document numbers and references are audited. Access requires restricted permission.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button"
              disabled={!idDocumentNumber || idDocumentNumber.trim().length < 3}
              onClick={() => setStep(4)}
              className="bg-resort-charcoal text-white hover:bg-neutral-800"
            >
              Continue to Live Photo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STAGE 4: LIVE WEBCAM PHOTO */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Camera className="w-5 h-5 mr-2 text-resort-gold" /> Stage 4: Live Webcam Photo Capture
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-neutral-600">
              Capture a live photo of the guest for security and front-desk recognition.
            </p>
            <WebcamCapture
              onCapture={(base64) => {
                setPhotoStorageRef(`ref:guest-webcam:${Date.now()}`);
              }}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(3)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button"
              onClick={() => setStep(5)}
              className="bg-resort-charcoal text-white hover:bg-neutral-800"
            >
              Continue to Room Selection <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STAGE 5: ELIGIBLE ROOM SELECTION */}
      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <BedDouble className="w-5 h-5 mr-2 text-resort-gold" /> Stage 5: Eligible Physical Room Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Available Clean Rooms in Category: {reservation.reservedRooms[0]?.roomType?.name}</Label>
              {eligibleRooms.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
                  No rooms in category &ldquo;{reservation.reservedRooms[0]?.roomType?.name}&rdquo; are currently
                  AVAILABLE or RESERVED for this reservation. Clean/ready a room first.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {eligibleRooms.map((rm) => (
                    <button
                      type="button"
                      key={rm.id}
                      onClick={() => setSelectedRoomId(rm.id)}
                      className={`p-3 text-left rounded-lg border text-xs transition-all ${
                        selectedRoomId === rm.id
                          ? 'border-resort-charcoal bg-neutral-900 text-white shadow-sm'
                          : 'border-neutral-200 bg-white hover:border-neutral-400 text-neutral-800'
                      }`}
                    >
                      <div className="font-mono text-base font-bold">Room {rm.roomNumber}</div>
                      <div className="text-[11px] opacity-80 mt-1">
                        {rm.floor.building.name} — {rm.floor.name}
                      </div>
                      <div className="mt-2 text-[10px] uppercase tracking-wider font-semibold">
                        Status: {rm.status}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 max-w-sm">
              <Label htmlFor="expectedCheckOut" className="text-xs">Expected Departure Date</Label>
              <Input
                id="expectedCheckOut"
                type="date"
                value={expectedCheckOut.slice(0, 10)}
                onChange={(e) => setExpectedCheckOut(e.target.value)}
                className="text-xs"
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(4)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button"
              disabled={!selectedRoomId}
              onClick={() => setStep(6)}
              className="bg-resort-charcoal text-white hover:bg-neutral-800"
            >
              Continue to Advance Deposit <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STAGE 6: ADVANCE DEPOSIT COLLECTION */}
      {step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <CreditCard className="w-5 h-5 mr-2 text-resort-gold" /> Stage 6: Advance Deposit / Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-3 bg-neutral-50 rounded border border-neutral-200 text-neutral-700">
              Optionally collect an advance deposit payment at check-in. Any payment collected here is recorded with context <code>RESERVATION_ADVANCE</code> and credited toward the reservation advance ledger.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="advanceDepositAmount" className="text-xs">Deposit Amount (INR)</Label>
                <Input
                  id="advanceDepositAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={advanceDepositAmount}
                  onChange={(e) => setAdvanceDepositAmount(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="advanceDepositMethod" className="text-xs">Payment Method</Label>
                <select
                  id="advanceDepositMethod"
                  value={advanceDepositMethod}
                  onChange={(e) => setAdvanceDepositMethod(e.target.value as PaymentMethod)}
                  className="w-full h-9 rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs shadow-sm focus:outline-none"
                >
                  <option value={PaymentMethod.CASH}>Cash</option>
                  <option value={PaymentMethod.UPI}>UPI</option>
                  <option value={PaymentMethod.CARD}>Credit / Debit Card</option>
                  <option value={PaymentMethod.BANK_TRANSFER}>Bank Transfer</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="advanceDepositReference" className="text-xs">Transaction Reference</Label>
                <Input
                  id="advanceDepositReference"
                  placeholder="Optional reference / Auth code"
                  value={advanceDepositReference}
                  onChange={(e) => setAdvanceDepositReference(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(5)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button"
              onClick={() => setStep(7)}
              className="bg-resort-charcoal text-white hover:bg-neutral-800"
            >
              Continue to Final Review <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STAGE 7: FINAL REVIEW */}
      {step === 7 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <ClipboardList className="w-5 h-5 mr-2 text-resort-gold" /> Stage 7: Comprehensive Front Desk Review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 text-xs space-y-2">
              <div className="flex justify-between pb-2 border-b border-neutral-200 font-semibold text-neutral-900">
                <span>Reservation Number</span>
                <span className="font-mono">{reservation.reservationNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Primary Guest</span>
                <span className="font-medium">
                  {reservation.primaryGuest.firstName} {reservation.primaryGuest.lastName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Assigned Physical Room</span>
                <span className="font-mono font-bold text-neutral-900">
                  Room {selectedRoom?.roomNumber} ({selectedRoom?.floor.building.name})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Expected Departure</span>
                <span className="font-mono">{expectedCheckOut.slice(0, 10)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">ID Verification</span>
                <span className="font-mono">
                  {idDocumentType}: {idDocumentNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Advance Deposit Collected</span>
                <span className="font-mono font-bold text-neutral-900">
                  INR {parseFloat(advanceDepositAmount) > 0 ? parseFloat(advanceDepositAmount).toFixed(2) : '0.00'}
                  {parseFloat(advanceDepositAmount) > 0 && ` (${advanceDepositMethod})`}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="text-xs">Check-In Notes / Special Instructions</Label>
              <Input
                id="notes"
                placeholder="Optional front desk handover notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-xs"
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(6)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button"
              onClick={() => setStep(8)}
              className="bg-resort-charcoal text-white hover:bg-neutral-800"
            >
              Proceed to Activation <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STAGE 8: EXPLICIT CONFIRMATION & ACTIVATION */}
      {step === 8 && (
        <Card className="border-emerald-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center text-emerald-900">
              <ShieldCheck className="w-5 h-5 mr-2 text-emerald-600" /> Stage 8: Explicit Confirmation & Stay Activation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-lg text-emerald-900 space-y-2">
              <p className="font-semibold text-sm">You are about to activate Stay for:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Guest: <strong>{reservation.primaryGuest.firstName} {reservation.primaryGuest.lastName}</strong></li>
                <li>Room: <strong>Room {selectedRoom?.roomNumber}</strong> (Status will change to <strong>OCCUPIED</strong>)</li>
                <li>Stay ledger and initial Folio will be generated in <strong>OPEN</strong> status.</li>
                {parseFloat(advanceDepositAmount) > 0 && (
                  <li>Advance deposit of <strong>INR {parseFloat(advanceDepositAmount).toFixed(2)}</strong> will be recorded.</li>
                )}
              </ul>
            </div>
            <p className="text-neutral-500 text-[11px]">
              This action is audited and cannot be undone except through formal front-desk cancellation or checkout workflows.
            </p>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(7)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Activating Stay...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" /> Confirm & Activate Stay
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

