import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const taxes = await prisma.tax.findMany();
  console.log('Existing taxes:', taxes);
}
main().catch(console.error).finally(() => prisma.$disconnect());
