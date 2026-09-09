import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedInvoiceConfig() {
  const config = await prisma.invoiceConfig.upsert({
    where: { singletonKey: 'DEFAULT' },
    update: {},
    create: {
      singletonKey: 'DEFAULT',
      prefix: 'INV',
      yearMonth: '',
      nextSequence: 1,
      termsAndConditions: '1. All accounts are due upon presentation.\n2. Goods & Services Tax (GST) is charged as per applicable Government of India regulations.\n3. Any disputed items must be notified to front desk within 24 hours.',
      footerNote: 'Thank you for choosing Infinity Resort & Restaurant. We wish you a safe journey ahead.',
      showTaxBreakdown: true,
      showPaymentHistory: true,
    },
  });
  console.log('InvoiceConfig initialized:', config);
  return config;
}

seedInvoiceConfig()
  .catch((e) => {
    console.error('InvoiceConfig seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
