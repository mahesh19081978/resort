'use server';

import { getCurrentUser, requireAuth as requireAuthUser } from '@/lib/auth/auth';
import { recordAuditEvent } from '@/lib/auth/audit';
import { hasPermission, requirePermission } from '@/lib/permissions/rbac';
import {
  getGuestDatabasePage,
  type GuestDatabaseFilters,
} from '@/lib/guest-db/search';
import { getGuestFullProfile, getGuestPhotoData, getGuestDocumentData } from '@/lib/guest-db/guest-profile';
import { getStayDetail } from '@/lib/guest-db/stay-detail';
import { getStayInvestigationPage } from '@/lib/guest-db/stay-investigation';
import { getCurrentlyStayingPage, type CurrentlyStayingFilters } from '@/lib/guest-db/inhouse';
import {
  GuestSearchInputSchema,
  GuestProfileInputSchema,
  StayDetailInputSchema,
  StayInvestigationInputSchema,
  CurrentlyStayingInputSchema,
} from '@/validations/guest-db';

async function requireSession() {
  const user = await requireAuthUser();
  return user;
}

export async function searchGuestsAction(input: {
  query?: string;
  page?: number;
  pageSize?: number;
  filters?: GuestDatabaseFilters;
}) {
  const user = await requireSession();
  requirePermission(user, 'guest:read');
  const parsed = GuestSearchInputSchema.parse(input);

  const result = await getGuestDatabasePage(
    parsed.page,
    parsed.pageSize,
    parsed.filters,
    parsed.query
  );

  await recordAuditEvent({
    userId: user.id,
    action: 'guest_database_accessed',
    entity: 'Guest',
    entityId: 'search',
    newValues: { query: parsed.query, page: parsed.page, filters: parsed.filters },
  });

  return result;
}

export async function getGuestProfileAction(input: { guestId: string }) {
  const user = await requireSession();
  const parsed = GuestProfileInputSchema.parse(input);

  const profile = await getGuestFullProfile(parsed.guestId);
  if (!profile) throw new Error('Guest not found');

  const hasSensitiveAccess = hasPermission(user, 'guest:view_sensitive');

  await recordAuditEvent({
    userId: user.id,
    action: 'guest_profile_viewed',
    entity: 'Guest',
    entityId: parsed.guestId,
    newValues: { name: `${profile.guest.firstName} ${profile.guest.lastName}`, hasSensitiveAccess },
  });

  return { profile, hasSensitiveAccess };
}

export async function getStayDetailAction(input: { stayId: string }) {
  const user = await requireSession();
  requirePermission(user, 'guest:read');
  const parsed = StayDetailInputSchema.parse(input);

  const stay = await getStayDetail(parsed.stayId);
  if (!stay) throw new Error('Stay not found');

  await recordAuditEvent({
    userId: user.id,
    action: 'stay_investigated',
    entity: 'Stay',
    entityId: parsed.stayId,
    newValues: { stayNumber: stay.stayNumber },
  });

  return stay;
}

export async function investigateStayByDateAction(input: {
  dateFrom: string;
  dateTo?: string;
  roomNumber?: string;
  floor?: string;
  building?: string;
  status?: string;
}) {
  const user = await requireSession();
  requirePermission(user, 'guest:read');
  const parsed = StayInvestigationInputSchema.parse(input);

  const result = await getStayInvestigationPage(
    parsed.dateFrom,
    parsed.dateTo,
    {
      roomNumber: parsed.roomNumber,
      floor: parsed.floor,
      building: parsed.building,
      status: parsed.status,
    }
  );

  await recordAuditEvent({
    userId: user.id,
    action: 'stay_investigation_performed',
    entity: 'Stay',
    entityId: 'search',
    newValues: { dateFrom: parsed.dateFrom, dateTo: parsed.dateTo, totalRecords: result.summary.totalRecords },
  });

  return result;
}

export async function getCurrentlyStayingAction(input?: {
  roomNumber?: string;
  floor?: string;
  building?: string;
  status?: string;
}) {
  const user = await requireSession();
  requirePermission(user, 'guest:read');
  const parsed = CurrentlyStayingInputSchema.parse(input ?? {});

  const result = await getCurrentlyStayingPage({
    roomNumber: parsed.roomNumber,
    floor: parsed.floor,
    building: parsed.building,
    status: parsed.status as CurrentlyStayingFilters['status'],
  });

  await recordAuditEvent({
    userId: user.id,
    action: 'inhouse_guests_viewed',
    entity: 'Stay',
    entityId: 'inhouse',
    newValues: { total: result.total },
  });

  return result;
}

export async function getGuestPhotoAction(guestId: string) {
  const user = await requireSession();
  if (!hasPermission(user, 'guest:view_sensitive')) {
    throw new Error('Insufficient permissions for photo access');
  }

  const photo = await getGuestPhotoData(guestId);
  if (!photo) return null;

  await recordAuditEvent({
    userId: user.id,
    action: 'guest_photo_viewed',
    entity: 'Guest',
    entityId: guestId,
  });
  return photo;
}

export async function getGuestDocumentAction(guestId: string, documentId: string) {
  const user = await requireSession();
  if (!hasPermission(user, 'guest:view_sensitive')) {
    throw new Error('Insufficient permissions for document access');
  }

  const doc = await getGuestDocumentData(documentId, guestId);
  if (!doc) return null;

  await recordAuditEvent({
    userId: user.id,
    action: 'guest_document_viewed',
    entity: 'Guest',
    entityId: guestId,
    newValues: { documentId },
  });
  return doc;
}

export async function postGuestChargeAction(input: {
  stayId: string;
  description: string;
  amount: number;
  isTaxInclusive?: boolean;
}) {
  const user = await requireSession();

  if (!hasPermission(user, 'folio:update')) {
    throw new Error('Insufficient permissions');
  }

  const { postGuestCharge } = await import('@/lib/guest-db/post-charge');
  const result = await postGuestCharge(
    {
      stayId: input.stayId,
      description: input.description,
      amount: input.amount,
      isTaxInclusive: input.isTaxInclusive ?? false,
    },
    user.id
  );

  await recordAuditEvent({
    userId: user.id,
    action: 'guest_charge_posted',
    entity: 'Stay',
    entityId: input.stayId,
    newValues: { description: input.description, amount: input.amount },
  });

  return result;
}
