import { requireAuth } from '@/lib/auth/auth';
import { hasPermission } from '@/lib/permissions/rbac';
import { redirect } from 'next/navigation';
import {
  getAccessKpis,
  getStaffUsers,
  getRolesWithStats,
  getPermissionMatrix,
  getSecurityAuditLogs,
} from '@/lib/access/access-service';
import { AccessDashboard } from '@/components/admin/access/AccessDashboard';

export const dynamic = 'force-dynamic';

export default async function AccessManagementPage() {
  const user = await requireAuth();

  const canManageUsers = hasPermission(user, 'user:manage');
  const canManageRoles = hasPermission(user, 'role:manage');
  const canReadAudit = hasPermission(user, 'audit:read');

  if (!canManageUsers && !canManageRoles && !canReadAudit) {
    redirect('/admin/dashboard');
  }

  const [kpis, usersData, roles, matrix, auditLogs] = await Promise.all([
    getAccessKpis(),
    getStaffUsers(),
    getRolesWithStats(),
    getPermissionMatrix(),
    getSecurityAuditLogs({ limit: 50 }),
  ]);

  return (
    <AccessDashboard
      initialKpis={kpis}
      initialUsers={usersData.users}
      totalUsers={usersData.total}
      initialRoles={roles}
      matrix={matrix}
      initialAuditLogs={auditLogs}
      currentUserPermissions={{
        canManageUsers,
        canManageRoles,
        canReadAudit,
      }}
    />
  );
}
