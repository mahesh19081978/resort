import React from 'react';
import { AdminSidebar, AdminTopbar } from '@/components/layout/AdminNavigation';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-resort-ivory/60 text-resort-charcoal">
      <AdminSidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <AdminTopbar />
        <main className="p-8 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}