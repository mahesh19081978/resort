'use server';

import { cookies } from 'next/headers';
import { loginSchema } from '@/validations';
import { encryptSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export async function loginAction(formData: FormData): Promise<void> {
  const rawData = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = loginSchema.safeParse(rawData);
  if (!parsed.success) {
    throw new Error('Validation error');
  }

  const { email } = parsed.data;

  // Architectural placeholder for authentication flow in Phase 0.1
  const token = await encryptSession({
    userId: 'usr_admin_001',
    email,
    name: 'System Administrator',
    role: 'SUPER_ADMIN',
  });

  const cookieStore = await cookies();
  cookieStore.set('resort_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  redirect('/admin/dashboard');
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('resort_session');
  redirect('/admin/login');
}