import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';

export default async function AdminRootPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/admin/login');
  }

  redirect('/admin/dashboard');
}
