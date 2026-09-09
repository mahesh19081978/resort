const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma', 'client'));

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$queryRawUnsafe(
      'SELECT current_database() as db_name, current_user as db_user, version() as pg_version'
    );
    console.log('DATABASE IDENTITY:');
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
