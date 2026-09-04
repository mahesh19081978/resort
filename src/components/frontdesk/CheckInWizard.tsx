'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkInAction } from '@/actions/frontdesk';
import { WebcamCapture } from './WebcamCapture';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { IdDocumentType } from '@prisma/client';
import {
  CheckCircle2,
  AlertCircle,
  Camera,
  FileText,
  BedDouble,
  UserCheck,
  ShieldCheck,
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

    const res = await checkInAction(null, formData);
    setLoading(false);

    if (res.success && res.data) {
      setSuccessData(res.data);
      setStep(5);
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
      {/* Wizard Steps Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 pb-3 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold ${
              step >= 1 ? 'bg-resort-charcoal text-white' : 'bg-neutral-200 text-neutral-600'
            }`}
          >
            1
          </span>
          <span className={step === 1 ? 'font-bold text-neutral-900' : 'text-neutral-500'}>
            Reservation & Room
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-neutral-400" />
        <div className="flex items-center gap-2">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold ${
              step >= 2 ? 'bg-resort-charcoal text-white' : 'bg-neutral-200 text-neutral-600'
            }`}
          >
            2
          </span>
          <span className={step === 2 ? 'font-bold text-neutral-900' : 'text-neutral-500'}>
            Identity Proof
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-neutral-400" />
        <div className="flex items-center gap-2">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold ${
              step >= 3 ? 'bg-resort-charcoal text-white' : 'bg-neutral-200 text-neutral-600'
            }`}
          >
            3
          </span>
          <span className={step === 3 ? 'font-bold text-neutral-900' : 'text-neutral-500'}>
            Live Photo Capture
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-neutral-400" />
        <div className="flex items-center gap-2">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold ${
              step >= 4 ? 'bg-resort-charcoal text-white' : 'bg-neutral-200 text-neutral-600'
            }`}
          >
            4
          </span>
          <span className={step === 4 ? 'font-bold text-neutral-900' : 'text-neutral-500'}>
            Review & Activate
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-3 text-rose-800 text-xs">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Room Selection & Schedule */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <BedDouble className="w-5 h-5 mr-2 text-resort-gold" /> Step 1: Assign Physical Room
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-neutral-50 rounded border border-neutral-200 text-xs grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-neutral-500 block">Guest Name</span>
                <span className="font-semibold text-neutral-900">
                  {reservation.primaryGuest.firstName} {reservation.primaryGuest.lastName}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block">Reserved Category</span>
                <span className="font-semibold text-neutral-900">
                  {reservation.reservedRooms[0]?.roomType?.name}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block">Base Rate / Night</span>
                <span className="font-mono font-semibold text-neutral-900">
                  INR {reservation.reservedRooms[0]?.ratePerNight}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Available Eligible Clean Rooms</Label>
              {eligibleRooms.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
                  No rooms in category &ldquo;{reservation.reservedRooms[0]?.roomType?.name}&rdquo; are currently
                  AVAILABLE or RESERVED. Clean/ready a room first.
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
          <CardFooter className="flex justify-end gap-2">
            <Button
              type="button"
              disabled={!selectedRoomId}
              onClick={() => setStep(2)}
              className="bg-resort-charcoal text-white hover:bg-neutral-800"
            >
              Continue to Identity Proof <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 2: Identity Document Verification */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <FileText className="w-5 h-5 mr-2 text-resort-gold" /> Step 2: Guest Identity Verification
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
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button"
              disabled={!idDocumentNumber || idDocumentNumber.trim().length < 3}
              onClick={() => setStep(3)}
              className="bg-resort-charcoal text-white hover:bg-neutral-800"
            >
              Continue to Live Photo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 3: Live Photo Capture */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Camera className="w-5 h-5 mr-2 text-resort-gold" /> Step 3: Live Webcam Photo Capture
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
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button"
              onClick={() => setStep(4)}
              className="bg-resort-charcoal text-white hover:bg-neutral-800"
            >
              Proceed to Review <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 4: Review & Complete Check-In */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <ShieldCheck className="w-5 h-5 mr-2 text-emerald-600" /> Step 4: Confirm & Activate Stay
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
                <span className="text-neutral-500">Expected Checkout</span>
                <span className="font-mono">{expectedCheckOut.slice(0, 10)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">ID Verification</span>
                <span>
                  {idDocumentType}: {idDocumentNumber}
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
            <Button type="button" variant="outline" onClick={() => setStep(3)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Activating Stay...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Complete Check-In
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
