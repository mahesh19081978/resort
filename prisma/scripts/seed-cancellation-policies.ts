import { PrismaClient, CancellationFeeType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding CancellationPolicy configurations...');

  // Free cancellation policy (default)
  const freeCancellation = await prisma.cancellationPolicy.upsert({
    where: { code: 'FREE_CANCELLATION_48H' },
    update: {},
    create: {
      name: 'Free Cancellation (48 Hours)',
      code: 'FREE_CANCELLATION_48H',
      description: 'Free cancellation up to 48 hours before scheduled check-in. No charges apply.',
      feeType: CancellationFeeType.PERCENTAGE,
      feeValue: 0.00, // 0% fee
      maxFeeAmount: null,
      minFeeAmount: null,
      hoursBeforeCheckIn: 48,
      isDefault: true,
      effectiveFrom: null,
      effectiveTo: null,
      isActive: true,
    },
  });

  console.log('✅ Default cancellation policy created:', {
    id: freeCancellation.id,
    name: freeCancellation.name,
    code: freeCancellation.code,
    feeType: freeCancellation.feeType,
    feeValue: freeCancellation.feeValue.toString(),
    hoursBeforeCheckIn: freeCancellation.hoursBeforeCheckIn,
    isDefault: freeCancellation.isDefault,
  });

  // Non-refundable policy
  const nonRefundable = await prisma.cancellationPolicy.upsert({
    where: { code: 'NON_REFUNDABLE' },
    update: {},
    create: {
      name: 'Non-Refundable Rate',
      code: 'NON_REFUNDABLE',
      description: 'No refunds for cancellations. Full booking amount is forfeited.',
      feeType: CancellationFeeType.FULL_BOOKING,
      feeValue: 100.00, // 100% of booking
      maxFeeAmount: null,
      minFeeAmount: null,
      hoursBeforeCheckIn: null, // applies at any time
      isDefault: false,
      effectiveFrom: null,
      effectiveTo: null,
      isActive: true,
    },
  });

  console.log('✅ Non-refundable policy created:', {
    id: nonRefundable.id,
    name: nonRefundable.name,
    code: nonRefundable.code,
    feeType: nonRefundable.feeType,
    feeValue: nonRefundable.feeValue.toString(),
  });

  // Partial cancellation policy (example)
  const partialCancellation = await prisma.cancellationPolicy.upsert({
    where: { code: 'PARTIAL_CANCELLATION_72H' },
    update: {},
    create: {
      name: 'Partial Cancellation (72 Hours)',
      code: 'PARTIAL_CANCELLATION_72H',
      description: '50% charge if cancelled within 72 hours of check-in',
      feeType: CancellationFeeType.PERCENTAGE,
      feeValue: 50.00, // 50% fee
      maxFeeAmount: 5000.00, // Max fee cap
      minFeeAmount: 500.00, // Min fee floor
      hoursBeforeCheckIn: 72,
      isDefault: false,
      effectiveFrom: null,
      effectiveTo: null,
      isActive: true,
    },
  });

  console.log('✅ Partial cancellation policy created:', {
    id: partialCancellation.id,
    name: partialCancellation.name,
    code: partialCancellation.code,
    feeType: partialCancellation.feeType,
    feeValue: partialCancellation.feeValue.toString(),
    maxFeeAmount: partialCancellation.maxFeeAmount?.toString(),
    minFeeAmount: partialCancellation.minFeeAmount?.toString(),
    hoursBeforeCheckIn: partialCancellation.hoursBeforeCheckIn,
  });

  console.log('\n✅ CancellationPolicy seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ CancellationPolicy seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
