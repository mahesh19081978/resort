'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserRole } from '@/lib/permissions/rbac';
import { StaffUserItem } from '@/lib/access/access-service';
import { X, UserPlus, Save, AlertCircle } from 'lucide-react';

interface StaffUserModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  user?: StaffUserItem | null;
  availableRoles: { code: UserRole; name: string }[];
}

export function StaffUserModal({
  open,
  onClose,
  onSave,
  user,
  availableRoles,
}: StaffUserModalProps) {
  const isEditing = Boolean(user);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [role, setRole] = useState<UserRole>(user?.role || 'RECEPTIONIST');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(user ? user.isActive : true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setRole(user.role);
      setIsActive(user.isActive);
      setPassword('');
    } else {
      setName('');
      setEmail('');
      setRole('RECEPTIONIST');
      setPassword('');
      setIsActive(true);
    }
    setError(null);
  }, [user, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isEditing && user) {
        await onSave({
          id: user.id,
          name,
          email,
          role,
          isActive,
        });
      } else {
        if (!password || password.length < 8) {
          throw new Error('Password must be at least 8 characters long');
        }
        await onSave({
          name,
          email,
          role,
          password,
          isActive,
        });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save staff user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-resort-sand w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-resort-sand/80 bg-resort-ivory/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-resort-forest/10 text-resort-forest">
              {isEditing ? <Save className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-resort-charcoal">
                {isEditing ? 'Edit Staff User' : 'Add Staff User'}
              </h3>
              <p className="text-xs text-resort-muted">
                {isEditing
                  ? 'Update staff account parameters and security roles.'
                  : 'Provision a new authenticated resort staff user.'}
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <Label htmlFor="staff-name">Full Name</Label>
            <Input
              id="staff-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Eleanor Vance"
              className="mt-1"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <Label htmlFor="staff-email">Staff Email Address</Label>
            <Input
              id="staff-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@royalreserve.com"
              className="mt-1"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <Label htmlFor="staff-role">System Role</Label>
            <select
              id="staff-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="mt-1 flex h-10 w-full rounded border border-resort-sand bg-white px-3 py-2 text-sm text-resort-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-resort-gold disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting}
            >
              {availableRoles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-resort-muted mt-1">
              Role determines module authorization boundaries across PMS, POS, and ERP.
            </p>
          </div>

          {!isEditing && (
            <div>
              <Label htmlFor="staff-password">Initial Password</Label>
              <Input
                id="staff-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="mt-1"
                disabled={isSubmitting}
              />
              <p className="text-[11px] text-resort-muted mt-1">
                Must be at least 8 characters. Will be securely hashed with bcrypt (cost 12).
              </p>
            </div>
          )}

          <div className="pt-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded text-resort-forest border-resort-sand focus:ring-resort-gold"
                disabled={isSubmitting}
              />
              <span className="text-sm font-medium text-resort-charcoal">
                Account Active (Staff member can sign in)
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-resort-sand flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Provision User'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
