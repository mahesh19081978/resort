import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const enums: any = await prisma.$queryRawUnsafe(`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'IdDocumentType'`);
  console.log('IdDocumentType values in DB:', enums.map((e: any) => e.enumlabel));
}
main().catch(console.error).finally(() => prisma.$disconnect());
