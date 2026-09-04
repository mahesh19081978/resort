import React from 'react';
import { AdminSidebar, AdminTopbar } from '@/components/layout/AdminNavigation';
import { getCurrentUser } from '@/lib/auth/auth';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen bg-resort-ivory/60 text-resort-charcoal">
      <AdminSidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <AdminTopbar user={user} />
        <main className="p-8 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}