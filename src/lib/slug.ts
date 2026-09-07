import prisma from '@/lib/db/prisma';

/**
 * Generate a URL-safe slug from a string.
 * Converts to lowercase, replaces spaces/special chars with hyphens,
 * and trims leading/trailing hyphens.
 */
export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a unique slug for a RoomType.
 * Appends -2, -3, etc. on collision.
 * The database @unique constraint is the final protection.
 */
export async function generateUniqueRoomTypeSlug(name: string): Promise<string> {
  const base = toSlug(name);
  let slug = base;
  let counter = 2;

  while (true) {
    const existing = await prisma.roomType.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing) return slug;

    slug = `${base}-${counter}`;
    counter++;
  }
}
