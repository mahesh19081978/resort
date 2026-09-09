import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const tables: any = await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  console.log('Tables:', tables.map((t: any) => t.table_name));
  
  const hasMigTable = tables.some((t: any) => t.table_name === '_prisma_migrations');
  if (hasMigTable) {
    const migs = await prisma.$queryRawUnsafe(`SELECT * FROM "_prisma_migrations"`);
    console.log('Applied migrations:', migs);
  } else {
    console.log('_prisma_migrations does not exist');
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
