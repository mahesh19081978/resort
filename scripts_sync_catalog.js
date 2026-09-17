const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const permissions = [
  // Bookings & PMS
  { code: 'booking:read', module: 'BOOKING', description: 'View reservations' },
  { code: 'booking:create', module: 'BOOKING', description: 'Create reservations' },
  { code: 'booking:update', module: 'BOOKING', description: 'Modify reservations' },
  { code: 'booking:cancel', module: 'BOOKING', description: 'Cancel reservations' },
  { code: 'checkin:perform', module: 'PMS', description: 'Perform guest check-in' },
  { code: 'checkout:perform', module: 'PMS', description: 'Perform guest checkout' },
  { code: 'folio:read', module: 'FOLIO', description: 'View guest folio balance' },
  { code: 'folio:update', module: 'FOLIO', description: 'Post charges to folio' },
  { code: 'folio:settle', module: 'FOLIO', description: 'Settle and close folio' },
  { code: 'room:read', module: 'PMS', description: 'View room information' },
  { code: 'room:manage', module: 'PMS', description: 'Manage room assignments and status' },
  { code: 'room:delete', module: 'PMS', description: 'Delete physical rooms' },
  { code: 'room:type:delete', module: 'PMS', description: 'Delete room types' },
  { code: 'property:manage', module: 'PMS', description: 'Manage property configuration' },
  { code: 'property:delete', module: 'PMS', description: 'Delete property records' },
  { code: 'building:delete', module: 'PMS', description: 'Delete building records' },
  { code: 'floor:delete', module: 'PMS', description: 'Delete floor records' },
  { code: 'guest:read', module: 'GUEST', description: 'View guest profiles' },
  { code: 'guest:manage', module: 'GUEST', description: 'Create and edit guest profiles' },
  { code: 'guest:view_sensitive', module: 'GUEST', description: 'View sensitive guest documents' },
  // Restaurant & POS
  { code: 'restaurant:order:create', module: 'RESTAURANT', description: 'Take restaurant orders' },
  { code: 'restaurant:order:read', module: 'RESTAURANT', description: 'View restaurant orders' },
  { code: 'restaurant:order:update', module: 'RESTAURANT', description: 'Update restaurant orders' },
  { code: 'restaurant:order:cancel', module: 'RESTAURANT', description: 'Cancel restaurant orders' },
  { code: 'restaurant:table:manage', module: 'RESTAURANT', description: 'Manage restaurant tables' },
  { code: 'restaurant:bill:create', module: 'RESTAURANT', description: 'Generate and split bills' },
  { code: 'restaurant:bill:settle', module: 'RESTAURANT', description: 'Settle restaurant bills' },
  { code: 'restaurant:bill:void', module: 'RESTAURANT', description: 'Void restaurant bills' },
  { code: 'restaurant:room-charge', module: 'RESTAURANT', description: 'Post restaurant charges to room folio' },
  { code: 'kitchen:view', module: 'RESTAURANT', description: 'View kitchen display system' },
  { code: 'kitchen:update_kot', module: 'RESTAURANT', description: 'Send and update KOTs' },
  { code: 'recipe:read', module: 'RESTAURANT', description: 'View recipes' },
  { code: 'recipe:manage', module: 'RESTAURANT', description: 'Manage recipes' },
  // Inventory & Store
  { code: 'inventory:read', module: 'INVENTORY', description: 'View store stock balance' },
  { code: 'inventory:issue', module: 'INVENTORY', description: 'Issue stock to departments' },
  { code: 'inventory:adjust', module: 'INVENTORY', description: 'Record stock adjustments' },
  { code: 'inventory:transfer', module: 'INVENTORY', description: 'Transfer stock between stores' },
  { code: 'inventory:count', module: 'INVENTORY', description: 'Perform stock counts' },
  { code: 'inventory:item:manage', module: 'INVENTORY', description: 'Manage inventory items' },
  { code: 'inventory:stock:issue', module: 'INVENTORY', description: 'Issue stock movements' },
  { code: 'inventory:stock:transfer', module: 'INVENTORY', description: 'Transfer stock movements' },
  { code: 'inventory:stock:adjust', module: 'INVENTORY', description: 'Adjust stock movements' },
  { code: 'inventory:stock:wastage', module: 'INVENTORY', description: 'Record stock wastage' },
  { code: 'inventory:request:create', module: 'INVENTORY', description: 'Create stock requests' },
  { code: 'inventory:request:approve', module: 'INVENTORY', description: 'Approve or reject stock requests' },
  { code: 'inventory:transfer:create', module: 'INVENTORY', description: 'Create stock transfers' },
  { code: 'inventory:transfer:approve', module: 'INVENTORY', description: 'Approve stock transfers' },
  { code: 'inventory:transfer:dispatch', module: 'INVENTORY', description: 'Dispatch stock transfers' },
  { code: 'inventory:transfer:receive', module: 'INVENTORY', description: 'Receive stock transfers' },
  { code: 'inventory:count:create', module: 'INVENTORY', description: 'Create stock counts' },
  { code: 'inventory:count:approve', module: 'INVENTORY', description: 'Approve stock counts' },
  { code: 'inventory:count:post', module: 'INVENTORY', description: 'Post stock counts' },
  { code: 'inventory:opening-balance:create', module: 'INVENTORY', description: 'Create opening balances' },
  { code: 'inventory:report:view', module: 'INVENTORY', description: 'View inventory reports' },
  // Procurement
  { code: 'procurement:request:create', module: 'PROCUREMENT', description: 'Create purchase requests' },
  { code: 'procurement:order:create', module: 'PROCUREMENT', description: 'Create purchase orders' },
  { code: 'procurement:grn:receive', module: 'PROCUREMENT', description: 'Receive GRN goods' },
  { code: 'procurement:bill:process', module: 'PROCUREMENT', description: 'Process vendor bills' },
  { code: 'vendor:manage', module: 'PROCUREMENT', description: 'Manage vendors and payments' },
  // Admin & Content
  { code: 'user:manage', module: 'ADMIN', description: 'Manage user accounts' },
  { code: 'role:manage', module: 'ADMIN', description: 'Manage roles and permissions' },
  { code: 'reports:financial', module: 'REPORTS', description: 'View financial reports' },
  { code: 'reports:operational', module: 'REPORTS', description: 'View operational reports' },
  { code: 'content:manage', module: 'CONTENT', description: 'Manage website content' },
  { code: 'audit:read', module: 'ADMIN', description: 'View audit logs' },
  // Settings
  { code: 'settings:view', module: 'SETTINGS', description: 'View settings' },
  { code: 'settings:property:update', module: 'SETTINGS', description: 'Update property settings' },
  { code: 'settings:tax:view', module: 'SETTINGS', description: 'View tax configurations' },
  { code: 'settings:tax:update', module: 'SETTINGS', description: 'Update tax configurations' },
  { code: 'settings:charges:view', module: 'SETTINGS', description: 'View service charges' },
  { code: 'settings:charges:update', module: 'SETTINGS', description: 'Update service charges' },
  { code: 'settings:cancellation:view', module: 'SETTINGS', description: 'View cancellation policies' },
  { code: 'settings:cancellation:update', module: 'SETTINGS', description: 'Update cancellation policies' },
  { code: 'settings:restaurant:update', module: 'SETTINGS', description: 'Update restaurant settings' },
  { code: 'settings:invoice:view', module: 'SETTINGS', description: 'View invoice configuration' },
  { code: 'settings:invoice:update', module: 'SETTINGS', description: 'Update invoice configuration' },
  // Frontdesk extras
  { code: 'folio:payment:record', module: 'FOLIO', description: 'Record folio payments' },
  { code: 'folio:charge:post', module: 'FOLIO', description: 'Post folio charges' },
  { code: 'stay:note:view', module: 'PMS', description: 'View stay notes' },
  { code: 'stay:note:create', module: 'PMS', description: 'Create stay notes' },
  { code: 'invoice:issue', module: 'FOLIO', description: 'Issue invoices' }
];

async function sync() {
  console.log('Syncing ' + permissions.length + ' permissions...');
  for (const p of permissions) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, description: p.description },
      create: p
    });
  }

  const superAdminRole = await prisma.role.findUnique({ where: { code: 'SUPER_ADMIN' } });
  if (superAdminRole) {
    const allPerms = await prisma.permission.findMany();
    for (const perm of allPerms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: superAdminRole.id, permissionId: perm.id }
      });
    }
    console.log('Linked ' + allPerms.length + ' permissions to SUPER_ADMIN role.');
  }

  const finalCount = await prisma.permission.count();
  console.log('Sync complete! Total permissions in DB: ' + finalCount);
}

sync().catch(console.error).finally(() => prisma.$disconnect());
