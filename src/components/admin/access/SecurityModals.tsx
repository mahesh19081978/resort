'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { UserRole } from '@/lib/permissions/rbac';
import { StaffUserItem } from '@/lib/access/access-service';
import { X, ShieldAlert, KeyRound, AlertTriangle } from 'lucide-react';

interface ChangeRoleModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (userId: string, newRole: UserRole) => Promise<void>;
  user: StaffUserItem | null;
  availableRoles: { code: UserRole; name: string }[];
}

export function ChangeRoleModal({
  open,
  onClose,
  onConfirm,
  user,
  availableRoles,
}: ChangeRoleModalProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>(user?.role || 'RECEPTIONIST');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (user) {
      setSelectedRole(user.role);
    }
    setError(null);
  }, [user, open]);

  if (!open || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm(user.id, selectedRole);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to change user role');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-resort-sand w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-resort-sand/80 bg-resort-ivory/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-resort-charcoal">Change Staff Role</h3>
              <p className="text-xs text-resort-muted">Assign a different system authority level.</p>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-resort-sand/30 p-3.5 rounded-lg border border-resort-sand/80 space-y-1">
            <p className="text-xs text-resort-muted">Modifying role for:</p>
            <p className="font-medium text-sm text-resort-charcoal">{user.name}</p>
            <p className="text-xs text-resort-stone">{user.email}</p>
          </div>

          <div>
            <Label htmlFor="change-role-select">Select New Role</Label>
            <select
              id="change-role-select"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              className="mt-1 flex h-10 w-full rounded border border-resort-sand bg-white px-3 py-2 text-sm text-resort-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-resort-gold disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting}
            >
              {availableRoles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-resort-muted mt-2 leading-relaxed">
              <strong>Notice:</strong> Changing roles will immediately terminate any currently
              active browser sessions across devices, requiring the user to re-authenticate.
            </p>
          </div>

          <div className="pt-4 border-t border-resort-sand flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Updating Role...' : 'Confirm Role Change'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface RevokeSessionsModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (userId: string) => Promise<void>;
  user: StaffUserItem | null;
}

export function RevokeSessionsModal({
  open,
  onClose,
  onConfirm,
  user,
}: RevokeSessionsModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !user) return null;

  const handleConfirm = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm(user.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke sessions');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-resort-sand w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-resort-sand/80 bg-rose-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-100 text-rose-700">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-resort-charcoal">Revoke User Sessions</h3>
              <p className="text-xs text-resort-muted">Force immediate sign-out across all devices.</p>
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

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs text-resort-stone leading-relaxed">
            Are you sure you want to revoke all active sessions for{' '}
            <strong className="text-resort-charcoal">{user.name}</strong> ({user.email})?
          </p>

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-3 text-[11px] text-amber-900 leading-relaxed">
            Active authentication tokens for this account will be invalidated immediately.
            The user will be required to re-authenticate with valid credentials upon their next request.
          </div>

          <div className="pt-4 border-t border-resort-sand flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="bg-rose-700 hover:bg-rose-800 text-white"
            >
              {isSubmitting ? 'Revoking...' : 'Revoke All Sessions'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
