'use server';

import prisma from '@/lib/db/prisma';

export interface PublicRoomType {
  id: string;
  name: string;
  code: string;
  slug: string;
  description: string;
  basePrice: number;
  maxOccupancy: number;
  maxAdults: number;
  maxChildren: number;
  totalInventory: number;
  displayOrder: number;
  amenities: {
    name: string;
    code: string;
    icon: string | null;
  }[];
  media: {
    id: string;
    fileUrl: string;
    title: string | null;
    isFeatured: boolean;
  }[];
  activeRoomCount: number;
}

export interface PublicRoomTypeDetail extends PublicRoomType {
  relatedRoomTypes: {
    id: string;
    name: string;
    slug: string;
    description: string;
    basePrice: number;
    media: {
      fileUrl: string;
      isFeatured: boolean;
    }[];
  }[];
}

const roomTypeInclude = {
  amenities: {
    include: {
      amenity: {
        select: {
          name: true,
          code: true,
          icon: true,
        },
      },
    },
  },
  media: {
    where: {
      entityType: 'ROOM_TYPE',
    },
    select: {
      id: true,
      fileUrl: true,
      title: true,
      isFeatured: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  rooms: {
    where: { isActive: true },
    select: { id: true },
  },
};

export async function getPublicRoomTypes(): Promise<PublicRoomType[]> {
  const roomTypes = await prisma.roomType.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
    include: roomTypeInclude,
  });

  return roomTypes.map((rt) => ({
    id: rt.id,
    name: rt.name,
    code: rt.code,
    slug: rt.slug,
    description: rt.description,
    basePrice: Number(rt.basePrice),
    maxOccupancy: rt.maxOccupancy,
    maxAdults: rt.maxAdults,
    maxChildren: rt.maxChildren,
    totalInventory: rt.totalInventory,
    displayOrder: rt.displayOrder,
    amenities: rt.amenities.map((ra) => ra.amenity),
    media: rt.media,
    activeRoomCount: rt.rooms.length,
  }));
}

export async function getPublicRoomTypeBySlug(
  slug: string
): Promise<PublicRoomTypeDetail | null> {
  const roomType = await prisma.roomType.findUnique({
    where: { slug, isActive: true },
    include: roomTypeInclude,
  });

  if (!roomType) return null;

  const relatedRoomTypes = await prisma.roomType.findMany({
    where: {
      isActive: true,
      id: { not: roomType.id },
    },
    orderBy: { displayOrder: 'asc' },
    take: 3,
    include: {
      media: {
        where: { entityType: 'ROOM_TYPE', isFeatured: true },
        select: { fileUrl: true, isFeatured: true },
        take: 1,
      },
      rooms: {
        where: { isActive: true },
        select: { id: true },
      },
    },
  });

  return {
    id: roomType.id,
    name: roomType.name,
    code: roomType.code,
    slug: roomType.slug,
    description: roomType.description,
    basePrice: Number(roomType.basePrice),
    maxOccupancy: roomType.maxOccupancy,
    maxAdults: roomType.maxAdults,
    maxChildren: roomType.maxChildren,
    totalInventory: roomType.totalInventory,
    displayOrder: roomType.displayOrder,
    amenities: roomType.amenities.map((ra) => ra.amenity),
    media: roomType.media,
    activeRoomCount: roomType.rooms.length,
    relatedRoomTypes: relatedRoomTypes.map((rt) => ({
      id: rt.id,
      name: rt.name,
      slug: rt.slug,
      description: rt.description,
      basePrice: Number(rt.basePrice),
      media: rt.media,
      activeRoomCount: rt.rooms.length,
    })),
  };
}
