import { PrismaClient, ServiceChargeScope, ServiceChargeRateType, TaxScope } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding ServiceCharge configurations...');

  // Find the service tax (GST_SVC_18)
  const serviceTax = await prisma.tax.findFirst({
    where: { code: 'GST_SVC_18', isActive: true, scope: TaxScope.SERVICE },
  });

  if (!serviceTax) {
    console.error('ERROR: GST_SVC_18 tax not found. Please seed taxes first.');
    process.exit(1);
  }

  // Create EXTRA_SERVICE service charge (the only active billing consumer in this phase)
  const extraServiceCharge = await prisma.serviceCharge.upsert({
    where: { code: 'EXTRA_SERVICE_CHARGE' },
    update: {},
    create: {
      name: 'Extra Service Charge',
      code: 'EXTRA_SERVICE_CHARGE',
      description: 'Standard service charge for extra guest services (spa, transfers, parking, etc.)',
      scope: ServiceChargeScope.EXTRA_SERVICE,
      rateType: ServiceChargeRateType.PERCENTAGE,
      rateValue: 10.00, // 10% service charge
      taxable: true,
      taxId: serviceTax.id,
      effectiveFrom: null, // effective immediately
      effectiveTo: null, // no expiration
      isActive: true,
    },
  });

  console.log('✅ ServiceCharge created:', {
    id: extraServiceCharge.id,
    name: extraServiceCharge.name,
    scope: extraServiceCharge.scope,
    rateType: extraServiceCharge.rateType,
    rateValue: extraServiceCharge.rateValue.toString(),
    taxable: extraServiceCharge.taxable,
    taxCode: serviceTax.code,
  });

  // Create configuration-only service charges (not active billing consumers in this phase)
  // These are placeholders for future phases

  const roomServiceCharge = await prisma.serviceCharge.upsert({
    where: { code: 'ROOM_SERVICE_CHARGE' },
    update: {},
    create: {
      name: 'Room Service Charge',
      code: 'ROOM_SERVICE_CHARGE',
      description: 'Service charge for room service (configuration-only in this phase)',
      scope: ServiceChargeScope.ROOM_SERVICE,
      rateType: ServiceChargeRateType.PERCENTAGE,
      rateValue: 5.00,
      taxable: false,
      taxId: null,
      isActive: false, // Not active in this phase
    },
  });

  const restaurantServiceCharge = await prisma.serviceCharge.upsert({
    where: { code: 'RESTAURANT_CHARGE' },
    update: {},
    create: {
      name: 'Restaurant Service Charge',
      code: 'RESTAURANT_CHARGE',
      description: 'Service charge for restaurant bills (configuration-only in this phase)',
      scope: ServiceChargeScope.RESTAURANT,
      rateType: ServiceChargeRateType.PERCENTAGE,
      rateValue: 5.00,
      taxable: false,
      taxId: null,
      isActive: false, // Not active in this phase
    },
  });

  const allServicesCharge = await prisma.serviceCharge.upsert({
    where: { code: 'ALL_SERVICES_CHARGE' },
    update: {},
    create: {
      name: 'All Services Charge',
      code: 'ALL_SERVICES_CHARGE',
      description: 'Global service charge (configuration-only in this phase)',
      scope: ServiceChargeScope.ALL,
      rateType: ServiceChargeRateType.PERCENTAGE,
      rateValue: 0.00,
      taxable: false,
      taxId: null,
      isActive: false, // Not active in this phase
    },
  });

  console.log('✅ Configuration-only ServiceCharges created (inactive):');
  console.log('  - ROOM_SERVICE_CHARGE (inactive)');
  console.log('  - RESTAURANT_CHARGE (inactive)');
  console.log('  - ALL_SERVICES_CHARGE (inactive)');

  console.log('\n✅ ServiceCharge seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ ServiceCharge seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
