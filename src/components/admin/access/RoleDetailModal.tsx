'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RoleStatItem } from '@/lib/access/access-service';
import { X, ShieldCheck, Check, Minus, Save, AlertCircle, AlertTriangle } from 'lucide-react';
import { AdminBadgeSemanticType, AdminStatusBadge } from '@/components/admin/ui';

interface RoleDetailModalProps {
  open: boolean;
  onClose: () => void;
  role: RoleStatItem | null;
  onSavePermissions?: (roleCode: string, permissionCodes: string[]) => Promise<void>;
  allPermissionsByModule: {
    module: string;
    label: string;
    permissions: { code: string; description: string | null }[];
  }[];
  canEdit: boolean;
}

export function RoleDetailModal({
  open,
  onClose,
  role,
  onSavePermissions,
  allPermissionsByModule,
  canEdit,
}: RoleDetailModalProps) {
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (role) {
      setSelectedPermissions(new Set(role.permissions));
      setError(null);
      setSuccessMsg(null);
    }
  }, [role, open]);

  if (!open || !role) return null;

  const togglePermission = (code: string) => {
    if (!canEdit) return;
    const next = new Set(selectedPermissions);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
    }
    setSelectedPermissions(next);
  };

  const toggleModulePermissions = (modulePermissions: { code: string }[]) => {
    if (!canEdit) return;
    const moduleCodes = modulePermissions.map((p) => p.code);
    const allSelected = moduleCodes.every((code) => selectedPermissions.has(code));
    const next = new Set(selectedPermissions);

    if (allSelected) {
      // Deselect all in this module
      for (const code of moduleCodes) {
        next.delete(code);
      }
    } else {
      // Select all in this module
      for (const code of moduleCodes) {
        next.add(code);
      }
    }
    setSelectedPermissions(next);
  };

  const handleSave = async () => {
    if (!canEdit || !onSavePermissions) return;
    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await onSavePermissions(role.code, Array.from(selectedPermissions));
      setSuccessMsg('Permissions saved and audited successfully.');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to update role permissions');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-resort-sand w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-resort-sand/80 bg-resort-ivory/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-resort-forest/10 text-resort-forest">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-lg font-bold text-resort-charcoal">
                  {role.name}
                </h3>
                <AdminStatusBadge status={role.isSystem ? 'ACTIVE' : 'NEUTRAL'} label={role.isSystem ? 'System Role' : 'Custom'} />
                <span className="text-xs font-mono bg-resort-sand/60 text-resort-charcoal px-2 py-0.5 rounded">
                  {role.code}
                </span>
              </div>
              <p className="text-xs text-resort-muted mt-0.5">
                {role.description || 'System operational role profile.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-resort-muted hover:text-resort-charcoal p-1.5 rounded-lg hover:bg-resort-sand/40 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Overview Bar */}
        <div className="px-6 py-3 bg-resort-sand/20 border-b border-resort-sand/60 flex items-center justify-between text-xs text-resort-charcoal shrink-0">
          <div className="flex items-center gap-6">
            <span>
              Assigned Staff Users: <strong>{role.userCount}</strong>
            </span>
            <span>
              Granted Permissions: <strong>{selectedPermissions.size}</strong>
            </span>
          </div>
          <div className="flex items-center gap-3">
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const allCodes = new Set<string>();
                    for (const m of allPermissionsByModule) {
                      for (const p of m.permissions) {
                        allCodes.add(p.code);
                      }
                    }
                    setSelectedPermissions(allCodes);
                  }}
                  className="text-xs font-semibold text-resort-forest hover:underline cursor-pointer"
                >
                  Select All ({allPermissionsByModule.reduce((acc, m) => acc + m.permissions.length, 0)})
                </button>
                <span className="text-resort-sand">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedPermissions(new Set())}
                  className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                >
                  Clear All
                </button>
              </>
            )}
            {!canEdit && (
              <span className="text-[11px] text-resort-muted italic">
                Read-only mode (requires role:manage permission to edit)
              </span>
            )}
          </div>
        </div>

        {/* Body / Permissions Matrix */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="space-y-6">
            {allPermissionsByModule.map((mod) => {
              const activeCount = mod.permissions.filter((p) => selectedPermissions.has(p.code)).length;
              const totalCount = mod.permissions.length;
              const isAllActive = totalCount > 0 && activeCount === totalCount;
              const isIndeterminate = activeCount > 0 && activeCount < totalCount;

              return (
                <div key={mod.module} className="border border-resort-sand/70 rounded-lg overflow-hidden bg-white">
                  <div className="px-4 py-2.5 bg-resort-ivory/40 border-b border-resort-sand/70 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <h4 className="font-serif text-xs font-bold uppercase tracking-wider text-resort-forest">
                        {mod.label}
                      </h4>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[11px] text-resort-stone">
                        {activeCount} of {totalCount} active
                      </span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => toggleModulePermissions(mod.permissions)}
                          className="flex items-center justify-center cursor-pointer group"
                          title={isAllActive ? `Deselect all ${mod.label}` : `Select all ${mod.label}`}
                        >
                          <div
                            className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                              isAllActive
                                ? 'bg-resort-forest text-white border-resort-forest'
                                : isIndeterminate
                                ? 'bg-resort-forest/20 text-resort-forest border-resort-forest/60'
                                : 'border-resort-sand bg-white text-transparent group-hover:border-resort-forest/50'
                            }`}
                          >
                            {isAllActive && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            {isIndeterminate && <Minus className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-resort-sand/40">
                  {mod.permissions.map((perm) => {
                    const isGranted = selectedPermissions.has(perm.code);
                    return (
                      <div
                        key={perm.code}
                        onClick={() => togglePermission(perm.code)}
                        className={`px-4 py-2.5 flex items-center justify-between text-xs transition-colors ${
                          canEdit ? 'cursor-pointer hover:bg-resort-ivory/25' : ''
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-semibold text-resort-charcoal">
                              {perm.code}
                            </span>
                          </div>
                          {perm.description && (
                            <p className="text-resort-muted text-[11px]">{perm.description}</p>
                          )}
                        </div>
                        <div className="shrink-0 ml-4">
                          <div
                            className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                              isGranted
                                ? 'bg-resort-forest text-white border-resort-forest'
                                : 'border-resort-sand bg-white text-transparent'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-resort-sand/80 bg-resort-ivory/50 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-resort-muted">
            All permission adjustments are cryptographically committed to PostgreSQL & logged to AuditLog.
          </p>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Close
            </Button>
            {canEdit && (
              <Button type="button" variant="primary" onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Role Permissions'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
