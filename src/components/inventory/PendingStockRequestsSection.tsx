'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { AdminStatusBadge } from '@/components/admin/ui';

export interface PendingStockRequestItem {
  id: string;
  requestNumber: string;
  department: string;
  status: string;
  itemCount: number;
  createdAt: string;
  requestedByName?: string | null;
  destinationStoreName: string;
}

export default function PendingStockRequestsSection({
  requests,
  canApproveOrIssue,
}: {
  requests: PendingStockRequestItem[];
  canApproveOrIssue: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-border/80 shadow-2xs overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-5 py-3.5 border-b border-border bg-stone-50/50 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-base font-bold text-resort-charcoal">
              Pending Stock Requests
            </h3>
            {requests.length > 0 && (
              <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-100 text-amber-900">
                {requests.length} Action Required
              </span>
            )}
          </div>
          <p className="text-xs text-stone-600 mt-0.5">
            Internal department requisitions pending storekeeper review, approval, or warehouse handover.
          </p>
        </div>
        <Link
          href="/admin/inventory/requests"
          className="inline-flex items-center gap-1 text-xs font-semibold text-resort-forest hover:text-resort-forest/80 transition-colors"
        >
          View All Requests
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="p-4">
        {requests.length > 0 ? (
          <div className="border border-border/80 rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-border bg-stone-50 text-[10px] uppercase font-semibold text-stone-600 tracking-wider">
                  <th className="py-2.5 px-3">Request #</th>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3">Destination Store</th>
                  <th className="py-2.5 px-3 text-center">Items</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {requests.map((r) => {
                  const isApproved = r.status === 'APPROVED' || r.status === 'PARTIALLY_APPROVED';
                  const isSubmitted = r.status === 'SUBMITTED';

                  return (
                    <tr key={r.id} className="hover:bg-amber-50/20 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-medium text-resort-charcoal">
                        {r.requestNumber}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-resort-charcoal">{r.department}</td>
                      <td className="py-2.5 px-3 text-stone-600">{r.destinationStoreName}</td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {r.itemCount} item{r.itemCount > 1 ? 's' : ''}
                      </td>
                      <td className="py-2.5 px-3">
                        <AdminStatusBadge
                          status={isApproved ? 'APPROVED' : 'PENDING'}
                          label={r.status.replace(/_/g, ' ')}
                        />
                      </td>
                      <td className="py-2.5 px-3 text-stone-600 whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Link
                          href="/admin/inventory/requests"
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                            isApproved && canApproveOrIssue
                              ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs'
                              : isSubmitted && canApproveOrIssue
                              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs'
                              : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                          }`}
                        >
                          {isApproved && canApproveOrIssue
                            ? 'Issue Stock →'
                            : isSubmitted && canApproveOrIssue
                            ? 'Review & Approve →'
                            : 'View Details →'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center bg-stone-50/30 rounded-lg border border-dashed border-border/80">
            <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-2">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <p className="font-serif text-sm font-semibold text-resort-charcoal">
              No pending stock requests
            </p>
            <p className="text-xs text-stone-600 mt-0.5">
              All department inventory requests are currently up to date.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
