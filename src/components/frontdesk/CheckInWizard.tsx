'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkInAction,
  uploadGuestDocumentAction,
  captureGuestPhotoAction,
  verifyGuestDocumentAction,
  getGuestDocumentsAction,
  getGuestPhotoAction,
} from '@/actions/frontdesk';
import { WebcamCapture } from './WebcamCapture';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Upload,
  X,
  File,
  Eye,
  Shield,
  Plus,
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

interface PaymentSummary {
  roomRentTotal: number;
  totalNights: number;
  roomsCount: number;
  paidDuringBooking: number;
  balanceDue: number;
  isPaidInFull: boolean;
  successfulPayments: Array<{
    id: string;
    paymentNumber: string;
    amount: number;
    method: string;
    paymentDate: string;
    transactionReference?: string | null;
  }>;
}

interface ExistingDocument {
  id: string;
  documentType: string;
  documentNumber: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  verificationStatus: string;
  verifiedAt: string | null;
  createdAt: string;
}

interface CheckInWizardProps {
  reservation: {
    id: string;
    reservationNumber: string;
    checkInDate: string;
    checkOutDate: string;
    adults: number;
    children: number;
    totalRooms: number;
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
      totalNights: number;
      roomsCount: number;
      lineTotal: string;
      taxAmount: string;
    }>;
    paymentSummary: PaymentSummary;
  };
  eligibleRooms: EligibleRoom[];
}

const STAGES = [
  { id: 1, label: 'Reservation' },
  { id: 2, label: 'Guest Info' },
  { id: 3, label: 'ID Proof' },
  { id: 4, label: 'Photo' },
  { id: 5, label: 'Room' },
  { id: 6, label: 'Payment' },
  { id: 7, label: 'Review' },
];

const ALLOWED_DOC_TYPES = [
  { value: IdDocumentType.AADHAAR, label: 'AADHAAR CARD' },
  { value: IdDocumentType.PAN_CARD, label: 'PAN CARD' },
  { value: IdDocumentType.PASSPORT, label: 'PASSPORT' },
  { value: IdDocumentType.DRIVING_LICENSE, label: 'DRIVING LICENSE' },
  { value: IdDocumentType.VOTER_ID, label: 'VOTER ID' },
  { value: IdDocumentType.OTHER, label: 'OTHER' },
];

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function maskDocumentNumber(docType: string, number: string): string {
  if (!number || number.length < 4) return number;
  if (docType === 'AADHAAR') {
    const last4 = number.slice(-4);
    return 'XXXX XXXX ' + last4;
  }
  if (docType === 'PAN_CARD') {
    const visible = number.slice(0, 2);
    const last = number.slice(-1);
    const masked = '*'.repeat(Math.max(0, number.length - 3));
    return visible + masked + last;
  }
  const visibleStart = number.slice(0, 2);
  const visibleEnd = number.slice(-2);
  const masked = '*'.repeat(Math.max(0, number.length - 4));
  return visibleStart + masked + visibleEnd;
}

export function CheckInWizard({ reservation, eligibleRooms }: CheckInWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any | null>(null);

  // Stage 2 & Multi-Guest Occupants state (Stage 2 collects: firstName, lastName, gender, phone optional)
  const [primaryGender, setPrimaryGender] = useState<string>('MALE');
  const [additionalOccupants, setAdditionalOccupants] = useState<
    Array<{
      id: string;
      firstName: string;
      lastName: string;
      gender: string;
      phone: string;
    }>
  >([]);

  // Stage 3 — Multi-Guest Document State
  interface GuestDocEntry {
    occupantId: string; // 'primary' or occupant id
    fullName: string;
    isPrimary: boolean;
    gender: string;
    phone?: string;
    idDocumentType: IdDocumentType;
    idDocumentNumber: string;
    documentFile: File | null;
    documentPreview: string | null;
    documentUploadState: 'idle' | 'uploading' | 'success' | 'error';
    documentStorageRef: string;
    documentDataBase64: string;
    documentFileName: string;
    documentMimeType: string;
    documentFileSize: number;
    documentId: string;
    documentVerificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
    selectedExistingDocId: string;
    documentError: string | null;
  }

  const [guestDocs, setGuestDocs] = useState<GuestDocEntry[]>(() => [
    {
      occupantId: 'primary',
      fullName: `${reservation.primaryGuest.firstName} ${reservation.primaryGuest.lastName}`,
      isPrimary: true,
      gender: 'MALE',
      phone: reservation.primaryGuest.phone || undefined,
      idDocumentType: IdDocumentType.AADHAAR,
      idDocumentNumber: '',
      documentFile: null,
      documentPreview: null,
      documentUploadState: 'idle',
      documentStorageRef: '',
      documentDataBase64: '',
      documentFileName: '',
      documentMimeType: '',
      documentFileSize: 0,
      documentId: '',
      documentVerificationStatus: 'PENDING',
      selectedExistingDocId: '',
      documentError: null,
    },
  ]);

  const [existingDocuments, setExistingDocuments] = useState<ExistingDocument[]>([]);

  // Keep guestDocs synchronized with primary guest & additional occupants
  useEffect(() => {
    setGuestDocs((prevDocs) => {
      const nextDocs: GuestDocEntry[] = [];

      // 1. Primary Guest
      const existingPrimary = prevDocs.find((d) => d.occupantId === 'primary');
      nextDocs.push({
        occupantId: 'primary',
        fullName: `${reservation.primaryGuest.firstName} ${reservation.primaryGuest.lastName}`,
        isPrimary: true,
        gender: primaryGender,
        phone: reservation.primaryGuest.phone || undefined,
        idDocumentType: existingPrimary?.idDocumentType || IdDocumentType.AADHAAR,
        idDocumentNumber: existingPrimary?.idDocumentNumber || '',
        documentFile: existingPrimary?.documentFile || null,
        documentPreview: existingPrimary?.documentPreview || null,
        documentUploadState: existingPrimary?.documentUploadState || 'idle',
        documentStorageRef: existingPrimary?.documentStorageRef || '',
        documentDataBase64: existingPrimary?.documentDataBase64 || '',
        documentFileName: existingPrimary?.documentFileName || '',
        documentMimeType: existingPrimary?.documentMimeType || '',
        documentFileSize: existingPrimary?.documentFileSize || 0,
        documentId: existingPrimary?.documentId || '',
        documentVerificationStatus: existingPrimary?.documentVerificationStatus || 'PENDING',
        selectedExistingDocId: existingPrimary?.selectedExistingDocId || '',
        documentError: existingPrimary?.documentError || null,
      });

      // 2. Additional Occupants
      for (const occ of additionalOccupants) {
        const found = prevDocs.find((d) => d.occupantId === occ.id);
        const name = `${occ.firstName.trim()} ${occ.lastName.trim()}`.trim() || 'Additional Guest';
        nextDocs.push({
          occupantId: occ.id,
          fullName: name,
          isPrimary: false,
          gender: occ.gender,
          phone: occ.phone?.trim() || undefined,
          idDocumentType: found?.idDocumentType || IdDocumentType.AADHAAR,
          idDocumentNumber: found?.idDocumentNumber || '',
          documentFile: found?.documentFile || null,
          documentPreview: found?.documentPreview || null,
          documentUploadState: found?.documentUploadState || 'idle',
          documentStorageRef: found?.documentStorageRef || '',
          documentDataBase64: found?.documentDataBase64 || '',
          documentFileName: found?.documentFileName || '',
          documentMimeType: found?.documentMimeType || '',
          documentFileSize: found?.documentFileSize || 0,
          documentId: found?.documentId || '',
          documentVerificationStatus: found?.documentVerificationStatus || 'PENDING',
          selectedExistingDocId: found?.selectedExistingDocId || '',
          documentError: found?.documentError || null,
        });
      }

      return nextDocs;
    });
  }, [additionalOccupants, primaryGender, reservation.primaryGuest]);

  // Load existing documents for primary guest on file when entering Stage 3 (without auto-selecting)
  useEffect(() => {
    if (step === 3 && reservation.primaryGuest.id) {
      getGuestDocumentsAction(reservation.primaryGuest.id).then((res) => {
        if (res.success && res.data) {
          setExistingDocuments(res.data);
          // Do NOT auto-select or auto-fill existing documents to prevent confusion
        }
      });
    }
  }, [step, reservation.primaryGuest.id]);

  // Stage 4 — Photo state
  const [photoStorageRef, setPhotoStorageRef] = useState<string>('');
  const [photoCaptured, setPhotoCaptured] = useState(false);
  const [photoId, setPhotoId] = useState<string>('');
  const [photoDataBase64, setPhotoDataBase64] = useState<string>('');
  const [photoMimeType, setPhotoMimeTypeState] = useState<string>('');

  // Stage 5 — Room state
  const [selectedRoomId, setSelectedRoomId] = useState<string>(eligibleRooms[0]?.id || '');

  // Stage 6 — Payment state
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>(reservation.paymentSummary);
  const [additionalDepositAmount, setAdditionalDepositAmount] = useState<string>('0');
  const [additionalDepositMethod, setAdditionalDepositMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [additionalDepositReference, setAdditionalDepositReference] = useState<string>('');

  // Stage 7 — Notes
  const [notes, setNotes] = useState<string>('');

  const selectedRoom = eligibleRooms.find((r) => r.id === selectedRoomId);
  const expectedCheckOutDate = reservation.checkOutDate.slice(0, 10);

  // Load existing photo when reaching Stage 4
  useEffect(() => {
    if (step === 4 && reservation.primaryGuest.id && !photoCaptured) {
      getGuestPhotoAction(reservation.primaryGuest.id).then((res) => {
        if (res.success && res.data) {
          setPhotoStorageRef(res.data.fileUrl);
          setPhotoId(res.data.id);
          setPhotoCaptured(true);
        }
      });
    }
  }, [step, reservation.primaryGuest.id, photoCaptured]);

  // Multi-guest document handlers
  const handleGuestDocFieldChange = useCallback((occupantId: string, field: 'idDocumentType' | 'idDocumentNumber', value: any) => {
    setGuestDocs((prev) =>
      prev.map((g) => (g.occupantId === occupantId ? { ...g, [field]: value } : g))
    );
  }, []);

  const handleGuestFileSelect = useCallback((occupantId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setGuestDocs((prev) =>
        prev.map((g) => (g.occupantId === occupantId ? { ...g, documentError: 'Invalid file type. Accepted: JPG, PNG, PDF' } : g))
      );
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setGuestDocs((prev) =>
        prev.map((g) => (g.occupantId === occupantId ? { ...g, documentError: 'File size exceeds 15MB limit' } : g))
      );
      return;
    }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setGuestDocs((prev) =>
          prev.map((g) =>
            g.occupantId === occupantId
              ? { ...g, documentFile: file, documentPreview: ev.target?.result as string, documentError: null }
              : g
          )
        );
      };
      reader.readAsDataURL(file);
    } else {
      setGuestDocs((prev) =>
        prev.map((g) =>
          g.occupantId === occupantId
            ? { ...g, documentFile: file, documentPreview: null, documentError: null }
            : g
        )
      );
    }
  }, []);

  const handleGuestDocUpload = useCallback(async (occupantId: string) => {
    const targetGuest = guestDocs.find((g) => g.occupantId === occupantId);
    if (!targetGuest || !targetGuest.documentFile || !targetGuest.idDocumentNumber || targetGuest.idDocumentNumber.trim().length < 3) {
      return;
    }

    setGuestDocs((prev) =>
      prev.map((g) => (g.occupantId === occupantId ? { ...g, documentUploadState: 'uploading', documentError: null } : g))
    );

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(targetGuest.documentFile);
      const fileBase64 = await base64Promise;

      const formData = new FormData();
      formData.append('guestId', reservation.primaryGuest.id);
      formData.append('documentType', targetGuest.idDocumentType);
      formData.append('documentNumber', targetGuest.idDocumentNumber);
      formData.append('fileBase64', fileBase64);
      formData.append('fileName', targetGuest.documentFile.name);
      formData.append('mimeType', targetGuest.documentFile.type);
      if (targetGuest.selectedExistingDocId) {
        formData.append('existingDocumentId', targetGuest.selectedExistingDocId);
      }

      const result = await uploadGuestDocumentAction(null, formData);

      if (result.success && result.data) {
        setGuestDocs((prev) =>
          prev.map((g) =>
            g.occupantId === occupantId
              ? {
                  ...g,
                  documentStorageRef: result.data!.storageRef,
                  documentId: result.data!.documentId,
                  documentDataBase64: fileBase64,
                  documentFileName: targetGuest.documentFile!.name,
                  documentMimeType: targetGuest.documentFile!.type,
                  documentFileSize: targetGuest.documentFile!.size,
                  documentVerificationStatus: 'PENDING',
                  documentUploadState: 'success',
                  selectedExistingDocId: g.selectedExistingDocId || result.data!.documentId,
                  documentError: null,
                }
              : g
          )
        );
      } else {
        setGuestDocs((prev) =>
          prev.map((g) =>
            g.occupantId === occupantId
              ? { ...g, documentUploadState: 'error', documentError: result.error || 'Upload failed' }
              : g
          )
        );
      }
    } catch (err) {
      setGuestDocs((prev) =>
        prev.map((g) =>
          g.occupantId === occupantId
            ? { ...g, documentUploadState: 'error', documentError: 'Upload failed. Please try again.' }
            : g
        )
      );
    }
  }, [guestDocs, reservation.primaryGuest.id]);

  const handleGuestDocVerification = useCallback(async (occupantId: string, status: 'VERIFIED' | 'REJECTED') => {
    const targetGuest = guestDocs.find((g) => g.occupantId === occupantId);
    if (!targetGuest || !targetGuest.documentId) return;

    const formData = new FormData();
    formData.append('documentId', targetGuest.documentId);
    formData.append('verificationStatus', status);

    const result = await verifyGuestDocumentAction(null, formData);

    if (result.success && result.data) {
      setGuestDocs((prev) =>
        prev.map((g) =>
          g.occupantId === occupantId ? { ...g, documentVerificationStatus: result.data!.status as any } : g
        )
      );
    } else {
      setGuestDocs((prev) =>
        prev.map((g) =>
          g.occupantId === occupantId ? { ...g, documentError: result.error || 'Verification failed' } : g
        )
      );
    }
  }, [guestDocs]);

  const handleRemoveGuestDoc = useCallback((occupantId: string) => {
    setGuestDocs((prev) =>
      prev.map((g) =>
        g.occupantId === occupantId
          ? {
              ...g,
              documentFile: null,
              documentPreview: null,
              documentStorageRef: '',
              documentId: '',
              documentVerificationStatus: 'PENDING',
              documentUploadState: 'idle',
              selectedExistingDocId: '',
              documentDataBase64: '',
              documentFileName: '',
              documentMimeType: '',
              documentFileSize: 0,
              documentError: null,
            }
          : g
      )
    );
  }, []);

  const handleSelectExistingDoc = useCallback((doc: ExistingDocument) => {
    setGuestDocs((prev) =>
      prev.map((g) =>
        g.isPrimary
          ? {
              ...g,
              selectedExistingDocId: doc.id,
              idDocumentType: doc.documentType as IdDocumentType,
              idDocumentNumber: doc.documentNumber,
              documentStorageRef: doc.fileUrl,
              documentId: doc.id,
              documentVerificationStatus: doc.verificationStatus as any,
              documentError: null,
            }
          : g
      )
    );
  }, []);

  const handlePhotoCapture = useCallback(async (base64: string) => {
    setPhotoCaptured(true);

    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    const mimeType = base64.match(/data:(.*?);/)?.[1] || 'image/jpeg';

    const formData = new FormData();
    formData.append('guestId', reservation.primaryGuest.id);
    formData.append('photoBase64', base64Data);
    formData.append('mimeType', mimeType);

    const result = await captureGuestPhotoAction(null, formData);

    if (result.success && result.data) {
      setPhotoStorageRef(result.data.storageRef);
      setPhotoId(result.data.photoId);
      setPhotoDataBase64(base64Data);
      setPhotoMimeTypeState(mimeType);
    } else {
      setError(result.error || 'Failed to save photo');
      setPhotoCaptured(false);
    }
  }, [reservation.primaryGuest.id]);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    const primaryDoc = guestDocs.find((g) => g.isPrimary) || guestDocs[0];

    const formData = new FormData();
    formData.append('reservationId', reservation.id);
    formData.append('roomId', selectedRoomId);
    formData.append('expectedCheckOut', expectedCheckOutDate);
    formData.append('idDocumentType', primaryDoc?.idDocumentType || IdDocumentType.AADHAAR);
    formData.append('idDocumentNumber', primaryDoc?.idDocumentNumber || '');
    formData.append('gender', primaryGender);

    // Build authoritative occupants payload with individual documents
    const primaryOccupant = {
      firstName: reservation.primaryGuest.firstName,
      lastName: reservation.primaryGuest.lastName,
      gender: primaryGender,
      phone: reservation.primaryGuest.phone || undefined,
      email: reservation.primaryGuest.email || undefined,
      idDocumentType: primaryDoc?.idDocumentType || IdDocumentType.AADHAAR,
      idDocumentNumber: primaryDoc?.idDocumentNumber || '',
      documentStorageRef: primaryDoc?.documentStorageRef || undefined,
      documentFileName: primaryDoc?.documentFileName || undefined,
      documentMimeType: primaryDoc?.documentMimeType || undefined,
      documentFileSize: primaryDoc?.documentFileSize || undefined,
      isPrimary: true,
    };

    const accompanyingOccupants = additionalOccupants.map((occ) => {
      const doc = guestDocs.find((g) => g.occupantId === occ.id);
      return {
        firstName: occ.firstName.trim(),
        lastName: occ.lastName.trim(),
        gender: occ.gender,
        phone: occ.phone?.trim() || undefined,
        idDocumentType: doc?.idDocumentType || IdDocumentType.AADHAAR,
        idDocumentNumber: doc?.idDocumentNumber?.trim() || '',
        documentStorageRef: doc?.documentStorageRef || undefined,
        documentFileName: doc?.documentFileName || undefined,
        documentMimeType: doc?.documentMimeType || undefined,
        documentFileSize: doc?.documentFileSize || undefined,
        isPrimary: false,
      };
    });

    const allOccupants = [primaryOccupant, ...accompanyingOccupants];

    formData.append('occupants', JSON.stringify(allOccupants));

    if (primaryDoc?.documentStorageRef) formData.append('documentStorageRef', primaryDoc.documentStorageRef);
    if (primaryDoc?.documentFileName) formData.append('documentFileName', primaryDoc.documentFileName);
    if (primaryDoc?.documentMimeType) formData.append('documentMimeType', primaryDoc.documentMimeType);
    if (primaryDoc?.documentFileSize) formData.append('documentFileSize', primaryDoc.documentFileSize.toString());
    if (photoStorageRef) formData.append('photoStorageRef', photoStorageRef);
    if (photoMimeType) formData.append('photoMimeType', photoMimeType);
    if (notes) formData.append('notes', notes);

    const depositNum = parseFloat(additionalDepositAmount);
    if (!isNaN(depositNum) && depositNum > 0) {
      formData.append('advanceDepositAmount', depositNum.toString());
      formData.append('advanceDepositMethod', additionalDepositMethod);
      if (additionalDepositReference) formData.append('advanceDepositReference', additionalDepositReference);
    }

    const res = await checkInAction(null, formData);
    setLoading(false);

    if (res.success && res.data) {
      setSuccessData(res.data);
    } else {
      setError(res.error || 'Check-in failed');
    }
  };

  // Stage 3 advancing rule: All entered guests must have valid ID document number (>= 3 chars)
  // And primary guest must have document storage ref and verification status
  const primaryDoc = guestDocs.find((g) => g.isPrimary);
  const allGuestsHaveDocNumbers = guestDocs.every((g) => g.idDocumentNumber.trim().length >= 3);
  const primaryDocVerified = primaryDoc ? (primaryDoc.documentStorageRef !== '' && primaryDoc.documentVerificationStatus === 'VERIFIED') : false;
  const canAdvanceFromStage3 = allGuestsHaveDocNumbers && primaryDocVerified;
  const canAdvanceFromStage4 = true;
  const canAdvanceFromStage5 = selectedRoomId !== '';

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
      {/* Wizard Header with Status Indicators */}
      <div className="border-b border-neutral-200 pb-3">
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 text-[11px]">
          {STAGES.map((s) => {
            const isComplete = step > s.id;
            const isCurrent = step === s.id;
            return (
              <div
                key={s.id}
                className={`flex flex-col items-center text-center p-1.5 rounded transition-colors ${
                  isCurrent
                    ? 'bg-neutral-900 text-white font-semibold'
                    : isComplete
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-neutral-500'
                }`}
              >
                <span className="text-[10px] opacity-75">
                  {isComplete ? '✓' : isCurrent ? '●' : '○'} Stage {s.id}
                </span>
                <span className="truncate w-full mt-0.5">{s.label}</span>
              </div>
            );
          })}
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
              <UserCheck className="w-5 h-5 mr-2 text-resort-gold" /> Stage 2: Guest Details & Occupants
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            {/* Primary Guest */}
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-900 text-xs">
                  Primary Guest: {reservation.primaryGuest.firstName} {reservation.primaryGuest.lastName}
                </span>
                <Badge variant="success" className="text-[10px]">Primary</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <span className="text-neutral-500 block text-[10px]">Contact Phone</span>
                  <span className="font-mono text-neutral-900">{reservation.primaryGuest.phone || 'Not Provided'}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">Email Address</span>
                  <span className="text-neutral-900">{reservation.primaryGuest.email || 'Not Provided'}</span>
                </div>
                <div>
                  <Label className="text-[10px]">Gender *</Label>
                  <select
                    value={primaryGender}
                    onChange={(e) => setPrimaryGender(e.target.value)}
                    className="w-full h-7 rounded border border-neutral-300 bg-white px-2 text-xs"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Accompanying Occupants Section */}
            <div className="space-y-2 pt-2 border-t border-neutral-200">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-800">
                  Additional Occupants ({additionalOccupants.length})
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-neutral-300 text-neutral-700"
                  onClick={() => {
                    setAdditionalOccupants([
                      ...additionalOccupants,
                      {
                        id: `occ_${Date.now()}_${Math.random()}`,
                        firstName: '',
                        lastName: '',
                        gender: 'FEMALE',
                        phone: '',
                      },
                    ]);
                  }}
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Occupant
                </Button>
              </div>

              {additionalOccupants.length === 0 ? (
                <p className="text-neutral-500 text-[11px] italic">
                  No accompanying occupants added. If this stay has multiple guests (e.g. couple, family, friends), add their details above. Mandatory identity and document verification applies to each occupant.
                </p>
              ) : (
                <div className="space-y-3">
                  {additionalOccupants.map((occ, idx) => (
                    <div key={occ.id} className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-neutral-800 text-[11px]">
                          Occupant #{idx + 2}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] text-rose-600 hover:text-rose-700"
                          onClick={() => {
                            setAdditionalOccupants(additionalOccupants.filter((o) => o.id !== occ.id));
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-[10px]">First Name *</Label>
                          <Input
                            value={occ.firstName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAdditionalOccupants(
                                additionalOccupants.map((o) => (o.id === occ.id ? { ...o, firstName: val } : o))
                              );
                            }}
                            placeholder="First Name"
                            required
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">Last Name *</Label>
                          <Input
                            value={occ.lastName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAdditionalOccupants(
                                additionalOccupants.map((o) => (o.id === occ.id ? { ...o, lastName: val } : o))
                              );
                            }}
                            placeholder="Last Name"
                            required
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">Gender *</Label>
                          <select
                            value={occ.gender}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAdditionalOccupants(
                                additionalOccupants.map((o) => (o.id === occ.id ? { ...o, gender: val } : o))
                              );
                            }}
                            className="w-full h-7 rounded border border-neutral-300 bg-white px-2 text-xs"
                          >
                            <option value="FEMALE">Female</option>
                            <option value="MALE">Male</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-[10px]">Phone (Optional)</Label>
                          <Input
                            value={occ.phone}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAdditionalOccupants(
                                additionalOccupants.map((o) => (o.id === occ.id ? { ...o, phone: val } : o))
                              );
                            }}
                            placeholder="Phone number"
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                // Validate that all additional occupants have required names & gender
                for (const occ of additionalOccupants) {
                  if (!occ.firstName.trim() || !occ.lastName.trim()) {
                    setError('All occupants must have a first and last name.');
                    return;
                  }
                  if (!occ.gender.trim()) {
                    setError('All occupants must have a gender specified.');
                    return;
                  }
                }
                setError(null);
                setStep(3);
              }}
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
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center">
                <FileText className="w-5 h-5 mr-2 text-resort-gold" /> Stage 3: Guest ID Document Verification
              </span>
              <Badge variant="outline" className="text-xs font-normal">
                {guestDocs.length} Guest{guestDocs.length > 1 ? 's' : ''} to verify
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-xs">
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg text-blue-900 text-xs">
              Every guest must have their ID Document Type and Document Number recorded. Documents can be uploaded for secure digital archiving and immediate verification.
            </div>

            {/* Render a dedicated ID card for EACH guest */}
            <div className="space-y-5">
              {guestDocs.map((guest, gIdx) => (
                <div
                  key={guest.occupantId}
                  className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-4"
                >
                  {/* Guest Header */}
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-resort-charcoal text-white flex items-center justify-center text-[11px] font-bold">
                        {gIdx + 1}
                      </span>
                      <span className="font-semibold text-neutral-900 text-sm">
                        {guest.fullName}
                      </span>
                      <Badge
                        variant={guest.isPrimary ? 'success' : 'outline'}
                        className="text-[10px]"
                      >
                        {guest.isPrimary ? 'Primary Guest' : `Occupant #${gIdx + 1}`}
                      </Badge>
                    </div>
                    {guest.phone && (
                      <span className="text-[11px] text-neutral-500 font-mono">
                        {guest.phone}
                      </span>
                    )}
                  </div>

                  {/* Document Type & Number */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">ID Document Type *</Label>
                      <select
                        value={guest.idDocumentType}
                        onChange={(e) =>
                          handleGuestDocFieldChange(guest.occupantId, 'idDocumentType', e.target.value as IdDocumentType)
                        }
                        className="w-full h-8 rounded-md border border-neutral-300 bg-white px-2.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                      >
                        {ALLOWED_DOC_TYPES.map((dt) => (
                          <option key={dt.value} value={dt.value}>{dt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Document Number *</Label>
                      <Input
                        placeholder="e.g. 1234 5678 9012 or ABCDE1234F"
                        value={guest.idDocumentNumber}
                        onChange={(e) =>
                          handleGuestDocFieldChange(guest.occupantId, 'idDocumentNumber', e.target.value)
                        }
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Document File Uploader */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-neutral-700">Upload ID Document Proof</Label>

                    {guest.documentFile ? (
                      <div className="flex items-center gap-3 p-3 bg-white border border-neutral-200 rounded-lg">
                        {guest.documentPreview ? (
                          <div className="w-14 h-14 rounded overflow-hidden bg-neutral-100 flex-shrink-0 border border-neutral-200">
                            <img src={guest.documentPreview} alt="Document preview" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded bg-neutral-100 flex items-center justify-center flex-shrink-0 border border-neutral-200">
                            <File className="w-6 h-6 text-neutral-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-neutral-900 truncate">{guest.documentFile.name}</p>
                          <p className="text-[11px] text-neutral-500">{formatFileSize(guest.documentFile.size)}</p>
                          {guest.documentUploadState === 'uploading' && (
                            <p className="text-[11px] text-blue-600 flex items-center gap-1 mt-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Uploading to vault...
                            </p>
                          )}
                          {guest.documentUploadState === 'success' && (
                            <p className="text-[11px] text-emerald-600 flex items-center gap-1 mt-1">
                              <Check className="w-3 h-3" /> Uploaded successfully
                            </p>
                          )}
                          {guest.documentUploadState === 'error' && guest.documentError && (
                            <p className="text-[11px] text-red-600 mt-1">{guest.documentError}</p>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          {guest.documentUploadState !== 'uploading' && !guest.documentStorageRef && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={!guest.idDocumentNumber || guest.idDocumentNumber.trim().length < 3}
                              onClick={() => handleGuestDocUpload(guest.occupantId)}
                            >
                              <Upload className="w-3 h-3 mr-1" /> Upload
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-neutral-500 hover:text-neutral-700"
                            onClick={() => handleRemoveGuestDoc(guest.occupantId)}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <input
                          id={`file-input-${guest.occupantId}`}
                          type="file"
                          accept=".jpg,.jpeg,.png,.pdf"
                          onChange={(e) => handleGuestFileSelect(guest.occupantId, e)}
                          className="hidden"
                        />
                        <div
                          className="border-2 border-dashed border-neutral-300 rounded-lg p-4 text-center cursor-pointer hover:border-neutral-400 bg-white transition-colors"
                          onClick={() => document.getElementById(`file-input-${guest.occupantId}`)?.click()}
                        >
                          <Upload className="w-5 h-5 mx-auto mb-1 text-neutral-400" />
                          <p className="text-neutral-700 text-xs font-medium">Click to choose document proof for {guest.fullName}</p>
                          <p className="text-neutral-400 text-[10px] mt-0.5">JPG, PNG, or PDF — Max 15MB</p>
                        </div>
                      </div>
                    )}

                    {guest.documentError && !guest.documentFile && (
                      <p className="text-[11px] text-red-600">{guest.documentError}</p>
                    )}
                  </div>

                  {/* Verification Status Banner & Actions */}
                  {guest.documentId && (
                    <div className="p-3 bg-white rounded-lg border border-neutral-200 space-y-2">
                      {guest.documentVerificationStatus === 'VERIFIED' && (
                        <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 p-2 rounded">
                          <Shield className="w-4 h-4" />
                          <span className="font-medium">Document Verified for {guest.fullName}</span>
                        </div>
                      )}
                      {guest.documentVerificationStatus === 'REJECTED' && (
                        <div className="flex items-center gap-2 text-red-700 bg-red-50 p-2 rounded">
                          <AlertCircle className="w-4 h-4" />
                          <span className="font-medium">Document Rejected</span>
                        </div>
                      )}
                      {guest.documentVerificationStatus === 'PENDING' && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 p-2 rounded">
                            <AlertCircle className="w-4 h-4" />
                            <span className="font-medium">Uploaded — pending front desk verification</span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleGuestDocVerification(guest.occupantId, 'VERIFIED')}
                              className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 h-7 text-xs"
                            >
                              <Check className="w-3 h-3 mr-1" /> Verify ID
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleGuestDocVerification(guest.occupantId, 'REJECTED')}
                              className="text-red-700 border-red-300 hover:bg-red-50 h-7 text-xs"
                            >
                              <X className="w-3 h-3 mr-1" /> Reject
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Optional: Show existing documents on file only for Primary Guest if available */}
                  {guest.isPrimary && existingDocuments.length > 0 && !guest.documentFile && (
                    <div className="space-y-2 pt-2 border-t border-neutral-200">
                      <Label className="text-xs text-neutral-500 font-medium">
                        Existing Documents on File (Primary Guest)
                      </Label>
                      <div className="space-y-1.5">
                        {existingDocuments.map((doc) => (
                          <div
                            key={doc.id}
                            className={`p-2.5 bg-white border rounded-lg text-xs cursor-pointer transition-colors ${
                              guest.selectedExistingDocId === doc.id
                                ? 'border-neutral-900 ring-1 ring-neutral-900'
                                : 'border-neutral-200 hover:border-neutral-400'
                            }`}
                            onClick={() => handleSelectExistingDoc(doc)}
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="font-medium">{doc.documentType.replace('_', ' ')}</span>
                                <span className="ml-2 font-mono text-neutral-600">{doc.documentNumber}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                                  doc.verificationStatus === 'VERIFIED' ? 'bg-emerald-100 text-emerald-700' :
                                  doc.verificationStatus === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                  'bg-amber-100 text-amber-700'
                                }`}>
                                  {doc.verificationStatus}
                                </span>
                                <span className="text-[10px] text-neutral-400">Click to use</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="text-[11px] text-neutral-500">
              Document numbers and upload references are securely audited. Primary guest document must be verified before proceeding to photo capture.
            </p>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button"
              disabled={!canAdvanceFromStage3}
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
              Capture a live photo of the guest for security and front-desk recognition. The camera will start automatically.
              <span className="ml-1 text-neutral-400">(Optional — you may skip if camera is unavailable)</span>
            </p>
            <WebcamCapture
              onCapture={handlePhotoCapture}
              capturedImage={photoStorageRef.startsWith('ref:') ? null : photoStorageRef}
              autoStart={true}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(3)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div className="flex gap-2">
              {!photoCaptured && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(5)}
                  className="border-neutral-300 text-neutral-600"
                >
                  Skip Photo <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
              <Button
                type="button"
                disabled={!canAdvanceFromStage4}
                onClick={() => setStep(5)}
                className="bg-resort-charcoal text-white hover:bg-neutral-800"
              >
                {photoCaptured ? 'Continue to Room Selection' : 'Continue'} <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
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
            {/* Expected Departure Date — READ-ONLY */}
            <div className="space-y-1 max-w-sm">
              <Label className="text-xs">Expected Departure Date</Label>
              <div className="h-9 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs flex items-center font-mono text-neutral-700">
                {expectedCheckOutDate}
              </div>
              <p className="text-[10px] text-neutral-500">Read-only — derived from reservation checkout date</p>
            </div>

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
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(4)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button"
              disabled={!canAdvanceFromStage5}
              onClick={() => setStep(6)}
              className="bg-resort-charcoal text-white hover:bg-neutral-800"
            >
              Continue to Payment <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STAGE 6: PAYMENT / BALANCE */}
      {step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <CreditCard className="w-5 h-5 mr-2 text-resort-gold" /> Stage 6: Payment / Balance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            {/* Financial Summary — Server-Driven */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-neutral-200">
                <span className="text-neutral-500">ROOM RENT / RESERVATION TOTAL</span>
                <span className="font-mono font-bold text-neutral-900 text-sm">
                  {formatCurrency(paymentSummary.roomRentTotal)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">PAID DURING BOOKING</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  {formatCurrency(paymentSummary.paidDuringBooking)}
                </span>
              </div>
              {paymentSummary.successfulPayments.length > 0 && (
                <div className="pl-4 space-y-1">
                  {paymentSummary.successfulPayments.map((p) => (
                    <div key={p.id} className="flex justify-between text-[11px] text-neutral-500">
                      <span>{p.paymentNumber} ({p.method})</span>
                      <span className="font-mono">{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-neutral-200">
                <span className="font-semibold text-neutral-900">
                  {paymentSummary.isPaidInFull ? 'PAID IN FULL' : 'BALANCE DUE AT CHECK-IN'}
                </span>
                <span className={`font-mono font-bold text-sm ${paymentSummary.isPaidInFull ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {paymentSummary.isPaidInFull ? '₹0.00' : formatCurrency(paymentSummary.balanceDue)}
                </span>
              </div>
            </div>

            {/* Additional Check-in Payment (only if balance > 0) */}
            {!paymentSummary.isPaidInFull && (
              <div className="space-y-3">
                <p className="text-neutral-600">
                  Collect the remaining balance at check-in using the fields below.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="additionalDepositAmount" className="text-xs">Amount to Collect (INR)</Label>
                    <Input
                      id="additionalDepositAmount"
                      type="number"
                      min="0"
                      max={paymentSummary.balanceDue}
                      step="0.01"
                      value={additionalDepositAmount}
                      onChange={(e) => setAdditionalDepositAmount(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="additionalDepositMethod" className="text-xs">Payment Method</Label>
                    <select
                      id="additionalDepositMethod"
                      value={additionalDepositMethod}
                      onChange={(e) => setAdditionalDepositMethod(e.target.value as PaymentMethod)}
                      className="w-full h-9 rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs shadow-sm focus:outline-none"
                    >
                      <option value={PaymentMethod.CASH}>Cash</option>
                      <option value={PaymentMethod.UPI}>UPI</option>
                      <option value={PaymentMethod.CARD}>Credit / Debit Card</option>
                      <option value={PaymentMethod.BANK_TRANSFER}>Bank Transfer</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="additionalDepositReference" className="text-xs">Transaction Reference</Label>
                    <Input
                      id="additionalDepositReference"
                      placeholder="Optional reference / Auth code"
                      value={additionalDepositReference}
                      onChange={(e) => setAdditionalDepositReference(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {paymentSummary.isPaidInFull && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Reservation has been fully paid. No additional payment is required at check-in.
              </div>
            )}
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

      {/* STAGE 7: COMPREHENSIVE FRONT DESK REVIEW */}
      {step === 7 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <ClipboardList className="w-5 h-5 mr-2 text-resort-gold" /> Stage 7: Comprehensive Front Desk Review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Guest Photo */}
              <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
                <h4 className="font-semibold text-neutral-900 flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5" /> Guest Photo
                </h4>
                {photoCaptured && photoId ? (
                  <div className="space-y-2">
                    <div className="w-40 h-30 rounded overflow-hidden bg-neutral-200 border border-neutral-300">
                      <img
                        src={`/api/secure-media/guest-photo/${photoId}`}
                        alt="Guest photo"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'w-full h-full flex items-center justify-center text-neutral-500 text-[10px]';
                            fallback.textContent = 'Photo unavailable';
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1 text-emerald-700">
                      <Check className="w-3 h-3" />
                      <span>Photo captured</span>
                    </div>
                  </div>
                ) : photoCaptured ? (
                  <div className="w-40 h-30 rounded bg-neutral-200 overflow-hidden flex items-center justify-center">
                    <span className="text-neutral-500 text-[10px]">Photo captured (persisting...)</span>
                  </div>
                ) : (
                  <p className="text-neutral-500">No photo captured</p>
                )}
              </div>

              {/* ID Documents Summary for All Guests */}
              <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-3">
                <h4 className="font-semibold text-neutral-900 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> Guest ID Documents ({guestDocs.length})
                  </span>
                  <Badge variant="outline" className="text-[10px]">Audited</Badge>
                </h4>
                <div className="space-y-2">
                  {guestDocs.map((g) => (
                    <div key={g.occupantId} className="p-2 bg-white rounded border border-neutral-200 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-neutral-900">
                          {g.fullName} {g.isPrimary && <span className="text-neutral-500 font-normal">(Primary)</span>}
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          g.documentVerificationStatus === 'VERIFIED' ? 'bg-emerald-100 text-emerald-700' :
                          g.documentVerificationStatus === 'REJECTED' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {g.documentVerificationStatus}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-neutral-600 font-mono">
                        <span>{g.idDocumentType.replace('_', ' ')}</span>
                        <span>{maskDocumentNumber(g.idDocumentType, g.idDocumentNumber)}</span>
                      </div>
                      {g.documentFileName && (
                        <div className="flex justify-between text-[10px] text-neutral-500 truncate">
                          <span>File: {g.documentFileName}</span>
                          {g.documentFileSize > 0 && <span>{formatFileSize(g.documentFileSize)}</span>}
                        </div>
                      )}
                      {g.documentId && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(`/api/secure-media/guest-document/${g.documentId}`, '_blank')}
                          className="h-5 text-[10px] p-0 text-blue-600 hover:text-blue-800"
                        >
                          <Eye className="w-3 h-3 mr-1" /> View ID Document
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Guest & Occupants Details */}
              <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
                <h4 className="font-semibold text-neutral-900 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" /> All Occupants ({guestDocs.length})
                  </span>
                </h4>
                <div className="space-y-2">
                  <div className="p-2 bg-white rounded border border-neutral-200 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium text-neutral-900">{reservation.primaryGuest.firstName} {reservation.primaryGuest.lastName}</span>
                      <Badge variant="success" className="text-[10px]">Primary</Badge>
                    </div>
                    <div className="flex justify-between text-[11px] text-neutral-500">
                      <span>Phone: {reservation.primaryGuest.phone || 'N/A'}</span>
                      <span>Gender: {primaryGender}</span>
                    </div>
                  </div>
                  {additionalOccupants.map((occ, oIdx) => (
                    <div key={occ.id} className="p-2 bg-white rounded border border-neutral-200 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="font-medium text-neutral-900">{occ.firstName} {occ.lastName}</span>
                        <Badge variant="outline" className="text-[10px]">Occupant #{oIdx + 2}</Badge>
                      </div>
                      <div className="flex justify-between text-[11px] text-neutral-500">
                        <span>Phone: {occ.phone || 'Not provided'}</span>
                        <span>Gender: {occ.gender}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reservation Details */}
              <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
                <h4 className="font-semibold text-neutral-900 flex items-center gap-1">
                  <ClipboardList className="w-3.5 h-3.5" /> Reservation Details
                </h4>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Reservation #</span>
                    <span className="font-mono">{reservation.reservationNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Check-In</span>
                    <span className="font-mono">{reservation.checkInDate.slice(0, 10)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Check-Out</span>
                    <span className="font-mono">{expectedCheckOutDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Room Type</span>
                    <span className="font-medium">{reservation.reservedRooms[0]?.roomType?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Rooms</span>
                    <span>{reservation.reservedRooms[0]?.roomsCount || 1}</span>
                  </div>
                </div>
              </div>

              {/* Room Details */}
              <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
                <h4 className="font-semibold text-neutral-900 flex items-center gap-1">
                  <BedDouble className="w-3.5 h-3.5" /> Room Details
                </h4>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Room Number</span>
                    <span className="font-mono font-bold">{selectedRoom?.roomNumber || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Building / Floor</span>
                    <span>{selectedRoom?.floor.building.name} — {selectedRoom?.floor.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Room Type</span>
                    <span>{reservation.reservedRooms[0]?.roomType?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Status</span>
                    <span className="font-medium">{selectedRoom?.status}</span>
                  </div>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
                <h4 className="font-semibold text-neutral-900 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" /> Financial Summary
                </h4>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Reservation Total</span>
                    <span className="font-mono font-bold">{formatCurrency(paymentSummary.roomRentTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Paid During Booking</span>
                    <span className="font-mono text-emerald-700">{formatCurrency(paymentSummary.paidDuringBooking)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Balance Due</span>
                    <span className={`font-mono font-bold ${paymentSummary.isPaidInFull ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {paymentSummary.isPaidInFull ? 'PAID IN FULL' : formatCurrency(paymentSummary.balanceDue)}
                    </span>
                  </div>
                  {parseFloat(additionalDepositAmount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Check-in Payment</span>
                      <span className="font-mono text-emerald-700">
                        {formatCurrency(parseFloat(additionalDepositAmount))} ({additionalDepositMethod})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Check-In Notes */}
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
              disabled={loading}
              onClick={handleSubmit}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Completing Check-In...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" /> Complete Check-In
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
