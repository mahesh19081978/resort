export interface AmenityRecord {
  id: string;
  name: string;
  code: string;
  icon?: string | null;
  description?: string | null;
}

export interface AmenityOverrideRecord {
  amenityId: string;
  hasAmenity: boolean;
  amenity: AmenityRecord;
}

export interface EffectiveAmenityItem extends AmenityRecord {
  isOverride: boolean;
  overrideNote?: string;
}

/**
 * Computes the deterministic effective amenities for a room.
 *
 * Algorithm:
 * RoomType default amenities
 *         ↓
 * Room-level overrides (hasAmenity: true adds/confirms, hasAmenity: false removes)
 *         ↓
 * Effective room amenities
 */
export function computeEffectiveRoomAmenities(
  roomTypeAmenities: { amenity: AmenityRecord }[],
  overrides: { amenityId: string; hasAmenity: boolean; amenity: AmenityRecord; notes?: string | null }[]
): EffectiveAmenityItem[] {
  // Map keyed by amenity ID
  const effectiveMap = new Map<string, EffectiveAmenityItem>();

  // 1. Populate RoomType defaults
  for (const rta of roomTypeAmenities) {
    if (rta.amenity) {
      effectiveMap.set(rta.amenity.id, {
        ...rta.amenity,
        isOverride: false,
      });
    }
  }

  // 2. Apply Room-level overrides
  for (const ov of overrides) {
    if (ov.hasAmenity) {
      // Add or override to present
      effectiveMap.set(ov.amenityId, {
        ...ov.amenity,
        isOverride: true,
        overrideNote: ov.notes || undefined,
      });
    } else {
      // Explicitly removed at the room level
      effectiveMap.delete(ov.amenityId);
    }
  }

  return Array.from(effectiveMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}
