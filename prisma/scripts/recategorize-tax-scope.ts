import { PrismaClient, TaxScope } from '@prisma/client';

const prisma = new PrismaClient();

export async function recategorizeTaxScope() {
  const taxes = await prisma.tax.findMany();
  console.log(`Reviewing ${taxes.length} taxes for scope categorization`);

  for (const tax of taxes) {
    if (tax.scope === TaxScope.OTHER) {
      let targetScope: TaxScope | null = null;
      if (tax.code.startsWith('GST_ROOM_') || tax.code === 'ROOM_GST') {
        targetScope = TaxScope.ROOM;
      } else if (tax.code.startsWith('GST_FNB_') || tax.code.startsWith('GST_REST_')) {
        targetScope = TaxScope.RESTAURANT;
      } else if (tax.code.startsWith('GST_SVC_')) {
        targetScope = TaxScope.SERVICE;
      }

      if (targetScope) {
        await prisma.tax.update({
          where: { id: tax.id },
          data: { scope: targetScope },
        });
        console.log(`Updated Tax [${tax.code}] -> scope: ${targetScope}`);
      }
    }
  }

  const existingServiceTax = await prisma.tax.findFirst({
    where: { scope: TaxScope.SERVICE, isActive: true },
  });

  if (!existingServiceTax) {
    const serviceTax = await prisma.tax.upsert({
      where: { code: 'GST_SVC_18' },
      update: { scope: TaxScope.SERVICE, isActive: true },
      create: {
        code: 'GST_SVC_18',
        name: 'Extra Services GST (18%)',
        rate: 18.00,
        scope: TaxScope.SERVICE,
        description: 'Standard 18% GST for extra guest services and amenities',
        isActive: true,
      },
    });
    console.log('Created/Ensured active Tax for TaxScope.SERVICE:', serviceTax.code);
  }
}

recategorizeTaxScope()
  .catch((e) => {
    console.error('Tax recategorization failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
