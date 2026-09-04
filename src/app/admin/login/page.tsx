'use client';

import React, { useActionState, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginAction } from '@/actions/auth';
import { Eye, EyeOff, Lock, Mail, ShieldAlert, Sparkles } from 'lucide-react';

export default function AdminLoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-resort-ivory p-6">
      <Card className="w-full max-w-md shadow-xl border-resort-sand/80 bg-white">
        <CardHeader className="text-center space-y-2 pb-6">
          <div className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-resort-gold/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-resort-darkwood">
            <Sparkles className="h-3.5 w-3.5 text-resort-gold" />
            <span>Staff Management Portal</span>
          </div>
          <CardTitle className="text-3xl font-serif text-resort-charcoal tracking-tight">
            The Royal Reserve
          </CardTitle>
          <CardDescription className="text-xs text-resort-stone">
            PMS, Restaurant POS & Enterprise Operations
          </CardDescription>
        </CardHeader>

        <CardContent>
          {state?.error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            >
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{state.error}</span>
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email-input"
                className="block text-xs font-semibold uppercase tracking-wider text-resort-stone"
              >
                Staff Email Address
              </label>
              <div className="relative">
                <Input
                  id="email-input"
                  name="email"
                  type="email"
                  placeholder="admin@royalreserve.com"
                  defaultValue="admin@royalreserve.com"
                  required
                  autoComplete="email"
                  disabled={isPending}
                  className="pl-9 h-11 text-sm border-resort-sand/90 focus:border-resort-gold"
                />
                <Mail className="absolute left-3 top-3 h-4 w-4 text-resort-stone pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password-input"
                className="block text-xs font-semibold uppercase tracking-wider text-resort-stone"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password-input"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  defaultValue="password123"
                  required
                  autoComplete="current-password"
                  disabled={isPending}
                  className="pl-9 pr-10 h-11 text-sm border-resort-sand/90 focus:border-resort-gold"
                />
                <Lock className="absolute left-3 top-3 h-4 w-4 text-resort-stone pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-resort-stone hover:text-resort-charcoal focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-11 text-sm font-semibold mt-2"
            >
              {isPending ? 'Authenticating...' : 'Sign In to Operations Console'}
            </Button>
          </form>

          <div className="mt-8 border-t border-resort-sand/60 pt-4 text-center text-[11px] text-resort-stone leading-relaxed">
            Restricted access for verified staff. All session activities and login attempts are cryptographically signed and audited.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}