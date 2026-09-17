'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdminPageHeader,
  AdminKpiCard,
  AdminCard,
  AdminStatusBadge,
  AdminEmptyState,
} from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AccessKpis,
  StaffUserItem,
  RoleStatItem,
  PermissionMatrixModule,
  SecurityAuditItem,
} from '@/lib/access/access-service';
import { UserRole } from '@/lib/permissions/rbac';
import { StaffUserModal } from './StaffUserModal';
import { ChangeRoleModal, RevokeSessionsModal } from './SecurityModals';
import { RoleDetailModal } from './RoleDetailModal';
import { DeleteConfirmDialog } from '@/components/admin/delete-confirm-dialog';
import {
  createStaffUserAction,
  updateStaffUserAction,
  toggleStaffUserStatusAction,
  changeStaffUserRoleAction,
  revokeStaffUserSessionsAction,
  updateRolePermissionsAction,
  searchStaffUsersAction,
} from '@/actions/access';
import {
  Users,
  ShieldCheck,
  KeyRound,
  History,
  Search,
  UserPlus,
  Filter,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Shield,
  Clock,
  Eye,
  Edit2,
  Lock,
  RotateCcw,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

interface AccessDashboardProps {
  initialKpis: AccessKpis;
  initialUsers: StaffUserItem[];
  totalUsers: number;
  initialRoles: RoleStatItem[];
  matrix: PermissionMatrixModule[];
  initialAuditLogs: SecurityAuditItem[];
  currentUserPermissions: {
    canManageUsers: boolean;
    canManageRoles: boolean;
    canReadAudit: boolean;
  };
}

export function AccessDashboard({
  initialKpis,
  initialUsers,
  totalUsers: initialTotalUsers,
  initialRoles,
  matrix,
  initialAuditLogs,
  currentUserPermissions,
}: AccessDashboardProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'matrix' | 'audit'>('users');
  const [isPending, startTransition] = useTransition();

  // State
  const [kpis, setKpis] = useState<AccessKpis>(initialKpis);
  const [users, setUsers] = useState<StaffUserItem[]>(initialUsers);
  const [totalUsers, setTotalUsers] = useState<number>(initialTotalUsers);
  const [roles, setRoles] = useState<RoleStatItem[]>(initialRoles);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditItem[]>(initialAuditLogs);

  // Filters for Users Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modals
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<StaffUserItem | null>(null);

  const [isChangeRoleModalOpen, setIsChangeRoleModalOpen] = useState(false);
  const [selectedUserForRole, setSelectedUserForRole] = useState<StaffUserItem | null>(null);

  const [isRevokeSessionsModalOpen, setIsRevokeSessionsModalOpen] = useState(false);
  const [selectedUserForRevoke, setSelectedUserForRevoke] = useState<StaffUserItem | null>(null);

  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [userToToggleStatus, setUserToToggleStatus] = useState<StaffUserItem | null>(null);

  const [selectedRoleForDetail, setSelectedRoleForDetail] = useState<RoleStatItem | null>(null);
  const [isRoleDetailModalOpen, setIsRoleDetailModalOpen] = useState(false);

  // Success / Error alerts
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Filter Refresh
  const handleFilterSearch = async (
    q = searchQuery,
    r = roleFilter,
    s = statusFilter
  ) => {
    startTransition(async () => {
      const res = await searchStaffUsersAction({
        query: q,
        role: r,
        status: s,
      });
      if (res.success && res.data) {
        setUsers(res.data.users);
        setTotalUsers(res.data.total);
      }
    });
  };

  // CRUD handlers
  const handleSaveStaffUser = async (data: any) => {
    if (data.id) {
      const res = await updateStaffUserAction(data);
      if (!res.success) throw new Error(res.error || 'Failed to update staff user');
      showFeedback('success', `Staff user "${data.name}" updated successfully.`);
    } else {
      const res = await createStaffUserAction(data);
      if (!res.success) throw new Error(res.error || 'Failed to create staff user');
      showFeedback('success', `Staff user "${data.name}" created successfully.`);
    }
    await handleFilterSearch();
  };

  const handleChangeRole = async (userId: string, newRole: UserRole) => {
    const res = await changeStaffUserRoleAction({ userId, newRole });
    if (!res.success) throw new Error(res.error || 'Failed to change role');
    showFeedback('success', `Staff user role updated to ${newRole}.`);
    await handleFilterSearch();
  };

  const handleToggleStatus = async () => {
    if (!userToToggleStatus) return;
    const targetStatus = !userToToggleStatus.isActive;
    startTransition(async () => {
      const res = await toggleStaffUserStatusAction({
        userId: userToToggleStatus.id,
        isActive: targetStatus,
      });
      setIsDeactivateDialogOpen(false);
      setUserToToggleStatus(null);
      if (res.success) {
        showFeedback(
          'success',
          `Staff user ${targetStatus ? 'activated' : 'deactivated'} successfully.`
        );
        await handleFilterSearch();
      } else {
        showFeedback('error', res.error || 'Failed to toggle staff status.');
      }
    });
  };

  const handleRevokeSessions = async (userId: string) => {
    const res = await revokeStaffUserSessionsAction({ userId });
    if (!res.success) throw new Error(res.error || 'Failed to revoke sessions');
    showFeedback('success', 'User sessions revoked. User will be forced to re-login.');
    await handleFilterSearch();
  };

  const router = useRouter();

  const handleSaveRolePermissions = async (roleCode: string, permissionCodes: string[]) => {
    const res = await updateRolePermissionsAction({
      roleCode: roleCode as UserRole,
      permissionCodes,
    });
    if (!res.success) throw new Error(res.error || 'Failed to update role permissions');
    
    // Update local roles state immediately so UI cards and modal reflect changes
    setRoles((prevRoles) =>
      prevRoles.map((r) =>
        r.code === roleCode
          ? {
              ...r,
              permissionCount: permissionCodes.length,
              permissions: permissionCodes,
            }
          : r
      )
    );
    showFeedback('success', `Role permissions for ${roleCode} updated successfully.`);
    router.refresh();
  };

  const availableRolesList = roles.map((r) => ({ code: r.code, name: r.name }));

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <AdminPageHeader
        title="RBAC & Security"
        subtitle="Manage staff accounts, roles, permissions and security access."
        badge="SECURITY CONSOLE"
        actions={
          currentUserPermissions.canManageUsers ? (
            <Button
              variant="primary"
              onClick={() => {
                setSelectedUserForEdit(null);
                setIsUserModalOpen(true);
              }}
              className="flex items-center gap-2 shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add Staff User</span>
            </Button>
          ) : undefined
        }
      />

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between gap-3 text-sm transition-all duration-200 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold uppercase tracking-wider hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          label="Total Staff Users"
          value={kpis.totalStaffUsers}
          icon={Users}
          variant="forest"
          subtext="Provisioned enterprise accounts"
        />
        <AdminKpiCard
          label="Active Users"
          value={kpis.activeUsers}
          icon={CheckCircle2}
          variant="forest"
          subtext={`${((kpis.activeUsers / (kpis.totalStaffUsers || 1)) * 100).toFixed(0)}% operational status`}
        />
        <AdminKpiCard
          label="System Roles"
          value={kpis.totalRoles}
          icon={ShieldCheck}
          variant="champagne"
          subtext="Standard RBAC profiles"
        />
        <AdminKpiCard
          label="Security Events Today"
          value={kpis.securityEventsToday}
          icon={History}
          variant="olive"
          subtext="Audit log interactions"
        />
      </div>

      {/* 3. Navigation Tabs */}
      <div className="border-b border-resort-sand flex items-center gap-1 sm:gap-2">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'users'
              ? 'border-resort-forest text-resort-forest bg-resort-sand/20'
              : 'border-transparent text-resort-stone hover:text-resort-charcoal'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Users ({totalUsers})</span>
        </button>

        <button
          onClick={() => setActiveTab('roles')}
          className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'roles'
              ? 'border-resort-forest text-resort-forest bg-resort-sand/20'
              : 'border-transparent text-resort-stone hover:text-resort-charcoal'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Roles ({roles.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'matrix'
              ? 'border-resort-forest text-resort-forest bg-resort-sand/20'
              : 'border-transparent text-resort-stone hover:text-resort-charcoal'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Permission Matrix</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'audit'
              ? 'border-resort-forest text-resort-forest bg-resort-sand/20'
              : 'border-transparent text-resort-stone hover:text-resort-charcoal'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit Log</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: USERS                                                              */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="bg-white p-4 rounded-lg border border-resort-sand/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-resort-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Search staff by name or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleFilterSearch(e.target.value, roleFilter, statusFilter);
                }}
                className="pl-9 text-xs"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2 w-full md:w-auto">
                <span className="text-xs text-resort-stone whitespace-nowrap">Role:</span>
                <select
                  value={roleFilter}
                  onChange={(e) => {
                    const next = e.target.value as UserRole | 'ALL';
                    setRoleFilter(next);
                    handleFilterSearch(searchQuery, next, statusFilter);
                  }}
                  className="h-9 rounded border border-resort-sand bg-white px-2.5 py-1 text-xs text-resort-charcoal focus:ring-resort-gold"
                >
                  <option value="ALL">All Roles</option>
                  {availableRolesList.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <span className="text-xs text-resort-stone whitespace-nowrap">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    const next = e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE';
                    setStatusFilter(next);
                    handleFilterSearch(searchQuery, roleFilter, next);
                  }}
                  className="h-9 rounded border border-resort-sand bg-white px-2.5 py-1 text-xs text-resort-charcoal focus:ring-resort-gold"
                >
                  <option value="ALL">All Status</option>
                  <option value="ACTIVE">Active Only</option>
                  <option value="INACTIVE">Inactive Only</option>
                </select>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-lg border border-resort-sand/80 shadow-xs overflow-hidden">
            {users.length === 0 ? (
              <AdminEmptyState
                title="No Staff Accounts Found"
                description="Try adjusting your search criteria or role filters to find existing staff users."
                icon={Users}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-resort-sand/80 bg-resort-ivory/50 text-[11px] font-semibold uppercase tracking-wider text-resort-stone">
                      <th className="py-3.5 px-4">Name</th>
                      <th className="py-3.5 px-4">Email</th>
                      <th className="py-3.5 px-4">Role</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Last Login</th>
                      <th className="py-3.5 px-4">Created</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-resort-sand/40">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-resort-ivory/25 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-resort-charcoal">{u.name}</div>
                        </td>
                        <td className="py-3.5 px-4 text-resort-charcoal font-mono text-[11px]">
                          {u.email}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide bg-resort-sand/60 text-resort-charcoal border border-resort-sand">
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <AdminStatusBadge
                            status={u.isActive ? 'ACTIVE' : 'NEUTRAL'}
                            label={u.isActive ? 'Active' : 'Deactivated'}
                          />
                        </td>
                        <td className="py-3.5 px-4 text-resort-stone" suppressHydrationWarning>
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="py-3.5 px-4 text-resort-stone" suppressHydrationWarning>
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {currentUserPermissions.canManageUsers && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedUserForEdit(u);
                                    setIsUserModalOpen(true);
                                  }}
                                  title="Edit User Details"
                                  className="p-1.5 rounded text-resort-stone hover:text-resort-forest hover:bg-resort-sand/40 transition-colors"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedUserForRole(u);
                                    setIsChangeRoleModalOpen(true);
                                  }}
                                  title="Change User Role"
                                  className="p-1.5 rounded text-resort-stone hover:text-amber-700 hover:bg-amber-50 transition-colors"
                                >
                                  <Shield className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedUserForRevoke(u);
                                    setIsRevokeSessionsModalOpen(true);
                                  }}
                                  title="Revoke Active Sessions"
                                  className="p-1.5 rounded text-resort-stone hover:text-purple-700 hover:bg-purple-50 transition-colors"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setUserToToggleStatus(u);
                                    setIsDeactivateDialogOpen(true);
                                  }}
                                  title={u.isActive ? 'Deactivate User' : 'Re-enable User'}
                                  className={`p-1.5 rounded transition-colors ${
                                    u.isActive
                                      ? 'text-resort-stone hover:text-rose-700 hover:bg-rose-50'
                                      : 'text-resort-stone hover:text-emerald-700 hover:bg-emerald-50'
                                  }`}
                                >
                                  {u.isActive ? (
                                    <XCircle className="w-3.5 h-3.5" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ROLES                                                              */}
      {/* ========================================================================= */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((r) => (
            <div
              key={r.id}
              onClick={() => {
                setSelectedRoleForDetail(r);
                setIsRoleDetailModalOpen(true);
              }}
              className="bg-white rounded-lg border border-resort-sand/80 p-5 shadow-xs hover:shadow-md hover:border-resort-forest/50 transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-resort-sand/60 text-resort-charcoal">
                    {r.code}
                  </span>
                  <AdminStatusBadge status={r.isSystem ? 'ACTIVE' : 'NEUTRAL'} label={r.isSystem ? 'System' : 'Custom'} />
                </div>
                <h4 className="font-serif text-base font-bold text-resort-charcoal mb-1">
                  {r.name}
                </h4>
                <p className="text-xs text-resort-muted leading-relaxed line-clamp-2 mb-4">
                  {r.description || 'System authority profile.'}
                </p>
              </div>

              <div className="pt-3 border-t border-resort-sand/40 flex items-center justify-between text-xs text-resort-stone">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-resort-forest" />
                  <strong>{r.userCount}</strong> staff users
                </span>
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-resort-gold-dark" />
                  <strong>{r.permissionCount}</strong> permissions
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PERMISSION MATRIX                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-lg border border-resort-sand/80 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="font-serif text-sm font-bold text-resort-charcoal">
                Enterprise Role Permission Authority Matrix
              </h3>
              <p className="text-xs text-resort-muted">
                Complete mapping of system permissions against the 9 approved operational roles.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-resort-stone">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Granted
              </span>
              <span className="flex items-center gap-1 ml-3">
                <span className="w-3 h-3 rounded-full bg-stone-200 inline-block" /> Unauthorized
              </span>
            </div>
          </div>

          <div className="space-y-6">
            {matrix.map((mod) => (
              <div
                key={mod.module}
                className="bg-white rounded-lg border border-resort-sand/80 shadow-xs overflow-hidden"
              >
                <div className="px-5 py-3 bg-resort-ivory/60 border-b border-resort-sand/80 flex items-center justify-between">
                  <h4 className="font-serif text-xs font-bold uppercase tracking-wider text-resort-forest">
                    {mod.label}
                  </h4>
                  <span className="text-[11px] text-resort-muted">
                    {mod.permissions.length} granular permissions
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-resort-sand/60 bg-resort-sand/20 text-[10px] font-semibold uppercase tracking-wider text-resort-stone">
                        <th className="py-2.5 px-4 min-w-[200px]">Permission</th>
                        <th className="py-2.5 px-2 text-center">Super Admin</th>
                        <th className="py-2.5 px-2 text-center">Admin</th>
                        <th className="py-2.5 px-2 text-center">Reception</th>
                        <th className="py-2.5 px-2 text-center">F&B Mgr</th>
                        <th className="py-2.5 px-2 text-center">Biller</th>
                        <th className="py-2.5 px-2 text-center">Kitchen</th>
                        <th className="py-2.5 px-2 text-center">Store</th>
                        <th className="py-2.5 px-2 text-center">Purchase</th>
                        <th className="py-2.5 px-2 text-center">Content</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-resort-sand/30">
                      {mod.permissions.map((p) => (
                        <tr key={p.code} className="hover:bg-resort-ivory/25 transition-colors">
                          <td className="py-2.5 px-4">
                            <div className="font-mono text-[11px] font-medium text-resort-charcoal">
                              {p.code}
                            </div>
                            {p.description && (
                              <div className="text-[11px] text-resort-muted">{p.description}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {p.roles.SUPER_ADMIN ? (
                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" />
                            ) : (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-300" />
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {p.roles.ADMIN ? (
                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" />
                            ) : (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-300" />
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {p.roles.RECEPTIONIST ? (
                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" />
                            ) : (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-300" />
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {p.roles.RESTAURANT_MANAGER ? (
                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" />
                            ) : (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-300" />
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {p.roles.RESTAURANT_BILLER ? (
                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" />
                            ) : (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-300" />
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {p.roles.KITCHEN_STAFF ? (
                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" />
                            ) : (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-300" />
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {p.roles.STORE_MANAGER ? (
                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" />
                            ) : (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-300" />
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {p.roles.PURCHASE_MANAGER ? (
                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" />
                            ) : (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-300" />
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {p.roles.CONTENT_MANAGER ? (
                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" />
                            ) : (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-300" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: AUDIT LOG                                                          */}
      {/* ========================================================================= */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-lg border border-resort-sand/80 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 bg-resort-ivory/60 border-b border-resort-sand/80 flex items-center justify-between">
            <div>
              <h4 className="font-serif text-xs font-bold uppercase tracking-wider text-resort-forest">
                Security & RBAC Audit Stream
              </h4>
              <p className="text-[11px] text-resort-muted">
                Immutable chronological log of authentication, user provisioning, and role mutations.
              </p>
            </div>
          </div>

          {auditLogs.length === 0 ? (
            <AdminEmptyState
              title="No Security Events Recorded"
              description="Security events such as user creations, logins, role adjustments, and session revocations will appear here."
              icon={History}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-resort-sand/80 bg-resort-ivory/50 text-[11px] font-semibold uppercase tracking-wider text-resort-stone">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Target ID</th>
                    <th className="py-3 px-4">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-resort-sand/40">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-resort-ivory/25 transition-colors">
                      <td className="py-3 px-4 text-resort-stone whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        {log.actor ? (
                          <div>
                            <span className="font-medium text-resort-charcoal">{log.actor.name}</span>
                            <span className="block text-[11px] text-resort-muted">{log.actor.email}</span>
                          </div>
                        ) : (
                          <span className="text-resort-stone italic">System</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-resort-sand/60 text-resort-charcoal">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-resort-stone">{log.entity}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-resort-muted">
                        {log.entityId}
                      </td>
                      <td className="py-3 px-4 text-resort-charcoal text-[11px] max-w-xs truncate">
                        {log.newValues
                          ? JSON.stringify(log.newValues)
                          : log.oldValues
                          ? `Previous: ${JSON.stringify(log.oldValues)}`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS                                                                    */}
      {/* ========================================================================= */}
      <StaffUserModal
        open={isUserModalOpen}
        onClose={() => {
          setIsUserModalOpen(false);
          setSelectedUserForEdit(null);
        }}
        onSave={handleSaveStaffUser}
        user={selectedUserForEdit}
        availableRoles={availableRolesList}
      />

      <ChangeRoleModal
        open={isChangeRoleModalOpen}
        onClose={() => {
          setIsChangeRoleModalOpen(false);
          setSelectedUserForRole(null);
        }}
        onConfirm={handleChangeRole}
        user={selectedUserForRole}
        availableRoles={availableRolesList}
      />

      <RevokeSessionsModal
        open={isRevokeSessionsModalOpen}
        onClose={() => {
          setIsRevokeSessionsModalOpen(false);
          setSelectedUserForRevoke(null);
        }}
        onConfirm={handleRevokeSessions}
        user={selectedUserForRevoke}
      />

      <DeleteConfirmDialog
        open={isDeactivateDialogOpen}
        onClose={() => {
          setIsDeactivateDialogOpen(false);
          setUserToToggleStatus(null);
        }}
        onConfirm={handleToggleStatus}
        title={userToToggleStatus?.isActive ? 'Deactivate Staff User' : 'Re-enable Staff User'}
        entityName={userToToggleStatus?.name || 'Staff User'}
        isPending={isPending}
      />

      <RoleDetailModal
        open={isRoleDetailModalOpen}
        onClose={() => {
          setIsRoleDetailModalOpen(false);
          setSelectedRoleForDetail(null);
        }}
        role={selectedRoleForDetail}
        onSavePermissions={handleSaveRolePermissions}
        allPermissionsByModule={matrix.map((m) => ({
          module: m.module,
          label: m.label,
          permissions: m.permissions.map((p) => ({
            code: p.code,
            description: p.description,
          })),
        }))}
        canEdit={currentUserPermissions.canManageRoles}
      />
    </div>
  );
}
