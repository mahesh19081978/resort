import { PrismaClient, NoteType } from '@prisma/client';

const prisma = new PrismaClient();

export async function backfillStayNotes() {
  const staysWithNotes = await prisma.stay.findMany({
    where: {
      notes: { not: null },
      stayNotes: { none: {} },
    },
    select: {
      id: true,
      notes: true,
    },
  });

  console.log(`Found ${staysWithNotes.length} stays needing StayNote backfill`);

  let count = 0;
  for (const stay of staysWithNotes) {
    if (stay.notes && stay.notes.trim()) {
      await prisma.stayNote.create({
        data: {
          stayId: stay.id,
          noteType: NoteType.OPERATIONAL,
          content: stay.notes.trim(),
          isEdited: false,
          createdById: null,
        },
      });
      count++;
    }
  }

  console.log(`Backfilled ${count} StayNote records`);
}

backfillStayNotes()
  .catch((e) => {
    console.error('StayNotes backfill failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
