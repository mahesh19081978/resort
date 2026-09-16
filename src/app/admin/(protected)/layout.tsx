import React from 'react';
import { redirect } from 'next/navigation';
import { AdminSidebar, AdminTopbar } from '@/components/layout/AdminNavigation';
import { getCurrentUser } from '@/lib/auth/auth';
import { getBusinessDateNow } from '@/lib/frontdesk/arrivals';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/admin/login');
  }

  const businessDate = getBusinessDateNow();

  return (
    <div className="admin-pms-theme flex min-h-screen bg-[#F7F4ED] text-resort-charcoal font-body antialiased">
      <AdminSidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <AdminTopbar user={user} businessDate={businessDate} />
        <main className="p-4 md:p-6 lg:p-8 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}