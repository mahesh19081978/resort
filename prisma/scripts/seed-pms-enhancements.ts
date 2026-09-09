#!/usr/bin/env tsx
/**
 * Comprehensive PMS Enhancements Seed Script
 * 
 * Ensures all required configuration data exists for:
 * - ServiceCharge configurations (EXTRA_SERVICE active, others inactive)
 * - CancellationPolicy configurations (default + alternatives)
 * - InvoiceConfig singleton (guaranteed to exist)
 * 
 * Idempotent: safe to run multiple times.
 */

import { PrismaClient, TaxScope } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedResult {
  success: boolean;
  serviceCharges: number;
  cancellationPolicies: number;
  invoiceConfig: boolean;
  errors: string[];
}

async function seedAll(): Promise<SeedResult> {
  const result: SeedResult = {
    success: true,
    serviceCharges: 0,
    cancellationPolicies: 0,
    invoiceConfig: false,
    errors: [],
  };

  try {
    // 1. Seed InvoiceConfig first (required by invoice issuance)
    console.log('📄 Ensuring InvoiceConfig singleton exists...');
    const invoiceConfig = await prisma.invoiceConfig.upsert({
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
    result.invoiceConfig = true;
    console.log('  ✓ InvoiceConfig initialized:', invoiceConfig.singletonKey);

    // 2. Find the service tax (required for ServiceCharge)
    console.log('🔍 Locating GST_SVC_18 tax for service charges...');
    const serviceTax = await prisma.tax.findFirst({
      where: { code: 'GST_SVC_18', isActive: true, scope: TaxScope.SERVICE },
    });

    if (!serviceTax) {
      // Create the tax if missing
      console.log('  ⚠ GST_SVC_18 not found, creating...');
      const newTax = await prisma.tax.create({
        data: {
          name: 'Extra Services GST (18%)',
          code: 'GST_SVC_18',
          rate: 18.00,
          scope: TaxScope.SERVICE,
          description: 'Standard 18% GST for extra guest services and amenities',
          isActive: true,
        },
      });
      console.log('  ✓ Created GST_SVC_18:', newTax.code);
      result.serviceCharges += 1; // Count the tax creation
    } else {
      console.log('  ✓ Found GST_SVC_18:', serviceTax.code);
    }

    // 3. Seed ServiceCharge configurations
    console.log('💰 Seeding ServiceCharge configurations...');

    // EXTRA_SERVICE (active, the only billing consumer in this phase)
    const extraServiceCharge = await prisma.serviceCharge.upsert({
      where: { code: 'EXTRA_SERVICE_CHARGE' },
      update: {},
      create: {
        name: 'Extra Service Charge',
        code: 'EXTRA_SERVICE_CHARGE',
        description: 'Standard service charge for extra guest services (spa, transfers, parking, etc.)',
        scope: 'EXTRA_SERVICE',
        rateType: 'PERCENTAGE',
        rateValue: 10.00,
        taxable: true,
        taxId: serviceTax!.id,
        effectiveFrom: null,
        effectiveTo: null,
        isActive: true,
      },
    });
    result.serviceCharges += 1;
    console.log('  ✓ EXTRA_SERVICE_CHARGE (active):', extraServiceCharge.code);

    // ROOM_SERVICE (inactive, configuration-only)
    const roomServiceCharge = await prisma.serviceCharge.upsert({
      where: { code: 'ROOM_SERVICE_CHARGE' },
      update: {},
      create: {
        name: 'Room Service Charge',
        code: 'ROOM_SERVICE_CHARGE',
        description: 'Service charge for room service (configuration-only in this phase)',
        scope: 'ROOM_SERVICE',
        rateType: 'PERCENTAGE',
        rateValue: 5.00,
        taxable: false,
        taxId: null,
        isActive: false,
      },
    });
    console.log('  ✓ ROOM_SERVICE_CHARGE (inactive):', roomServiceCharge.code);

    // RESTAURANT (inactive, configuration-only)
    const restaurantCharge = await prisma.serviceCharge.upsert({
      where: { code: 'RESTAURANT_CHARGE' },
      update: {},
      create: {
        name: 'Restaurant Service Charge',
        code: 'RESTAURANT_CHARGE',
        description: 'Service charge for restaurant bills (configuration-only in this phase)',
        scope: 'RESTAURANT',
        rateType: 'PERCENTAGE',
        rateValue: 5.00,
        taxable: false,
        taxId: null,
        isActive: false,
      },
    });
    console.log('  ✓ RESTAURANT_CHARGE (inactive):', restaurantCharge.code);

    // ALL (inactive, configuration-only)
    const allServicesCharge = await prisma.serviceCharge.upsert({
      where: { code: 'ALL_SERVICES_CHARGE' },
      update: {},
      create: {
        name: 'All Services Charge',
        code: 'ALL_SERVICES_CHARGE',
        description: 'Global service charge (configuration-only in this phase)',
        scope: 'ALL',
        rateType: 'PERCENTAGE',
        rateValue: 0.00,
        taxable: false,
        taxId: null,
        isActive: false,
      },
    });
    console.log('  ✓ ALL_SERVICES_CHARGE (inactive):', allServicesCharge.code);

    // 4. Seed CancellationPolicy configurations
    console.log('📋 Seeding CancellationPolicy configurations...');

    // Default free cancellation (48 hours)
    const freeCancellation = await prisma.cancellationPolicy.upsert({
      where: { code: 'FREE_CANCELLATION_48H' },
      update: {},
      create: {
        name: 'Free Cancellation (48 Hours)',
        code: 'FREE_CANCELLATION_48H',
        description: 'Free cancellation up to 48 hours before scheduled check-in. No charges apply.',
        feeType: 'PERCENTAGE',
        feeValue: 0.00,
        maxFeeAmount: null,
        minFeeAmount: null,
        hoursBeforeCheckIn: 48,
        isDefault: true,
        effectiveFrom: null,
        effectiveTo: null,
        isActive: true,
      },
    });
    result.cancellationPolicies += 1;
    console.log('  ✓ FREE_CANCELLATION_48H (default):', freeCancellation.code);

    // Non-refundable
    const nonRefundable = await prisma.cancellationPolicy.upsert({
      where: { code: 'NON_REFUNDABLE' },
      update: {},
      create: {
        name: 'Non-Refundable Rate',
        code: 'NON_REFUNDABLE',
        description: 'No refunds for cancellations. Full booking amount is forfeited.',
        feeType: 'FULL_BOOKING',
        feeValue: 100.00,
        maxFeeAmount: null,
        minFeeAmount: null,
        hoursBeforeCheckIn: null,
        isDefault: false,
        effectiveFrom: null,
        effectiveTo: null,
        isActive: true,
      },
    });
    result.cancellationPolicies += 1;
    console.log('  ✓ NON_REFUNDABLE:', nonRefundable.code);

    // Partial cancellation (72 hours, 50%)
    const partialCancellation = await prisma.cancellationPolicy.upsert({
      where: { code: 'PARTIAL_CANCELLATION_72H' },
      update: {},
      create: {
        name: 'Partial Cancellation (72 Hours)',
        code: 'PARTIAL_CANCELLATION_72H',
        description: '50% charge if cancelled within 72 hours of check-in',
        feeType: 'PERCENTAGE',
        feeValue: 50.00,
        maxFeeAmount: 5000.00,
        minFeeAmount: 500.00,
        hoursBeforeCheckIn: 72,
        isDefault: false,
        effectiveFrom: null,
        effectiveTo: null,
        isActive: true,
      },
    });
    result.cancellationPolicies += 1;
    console.log('  ✓ PARTIAL_CANCELLATION_72H:', partialCancellation.code);

    console.log('\n✅ PMS Enhancements seeding completed successfully!');
    console.log('  - ServiceCharges seeded:', result.serviceCharges);
    console.log('  - CancellationPolicies seeded:', result.cancellationPolicies);
    console.log('  - InvoiceConfig:', result.invoiceConfig ? '✓' : '✗');

  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
    console.error('\n❌ Seeding failed:', error);
  }

  return result;
}

// Run and exit with appropriate code
seedAll()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((e) => {
    console.error('Unhandled error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
