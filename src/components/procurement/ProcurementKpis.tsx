'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, ShoppingCart, Truck, ReceiptText, DollarSign, Users } from 'lucide-react';

interface ProcurementKpisProps {
  kpis: {
    pendingRequestsCount: number;
    openOrdersCount: number;
    grnThisMonthCount: number;
    unpaidBillsCount: number;
    totalOutstandingPayables: string;
    totalPaidThisMonth: string;
    activeVendorsCount: number;
  };
}

export const ProcurementKpis: React.FC<ProcurementKpisProps> = ({ kpis }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <Card className="border border-resort-sand/50 bg-white/70 shadow-sm">
        <CardContent className="p-3.5">
          <div className="flex items-center justify-between text-resort-stone mb-1">
            <span className="text-[11px] font-medium tracking-wide uppercase">Open PRs</span>
            <FileText className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-resort-charcoal">{kpis.pendingRequestsCount}</div>
          <p className="text-[10px] text-resort-stone mt-0.5">Pending approval</p>
        </CardContent>
      </Card>

      <Card className="border border-resort-sand/50 bg-white/70 shadow-sm">
        <CardContent className="p-3.5">
          <div className="flex items-center justify-between text-resort-stone mb-1">
            <span className="text-[11px] font-medium tracking-wide uppercase">Open POs</span>
            <ShoppingCart className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-resort-charcoal">{kpis.openOrdersCount}</div>
          <p className="text-[10px] text-resort-stone mt-0.5">Awaiting GRN</p>
        </CardContent>
      </Card>

      <Card className="border border-resort-sand/50 bg-white/70 shadow-sm">
        <CardContent className="p-3.5">
          <div className="flex items-center justify-between text-resort-stone mb-1">
            <span className="text-[11px] font-medium tracking-wide uppercase">GRNs (Mth)</span>
            <Truck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-resort-charcoal">{kpis.grnThisMonthCount}</div>
          <p className="text-[10px] text-resort-stone mt-0.5">Stock posted</p>
        </CardContent>
      </Card>


      <Card className="border border-resort-sand/50 bg-white/70 shadow-sm">
        <CardContent className="p-3.5">
          <div className="flex items-center justify-between text-resort-stone mb-1">
            <span className="text-[11px] font-medium tracking-wide uppercase">Unpaid Bills</span>
            <ReceiptText className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl font-bold text-resort-charcoal">{kpis.unpaidBillsCount}</div>
          <p className="text-[10px] text-resort-stone mt-0.5">Pending payment</p>
        </CardContent>
      </Card>


      <Card className="border border-resort-sand/50 bg-white/70 shadow-sm">
        <CardContent className="p-3.5">
          <div className="flex items-center justify-between text-resort-stone mb-1">
            <span className="text-[11px] font-medium tracking-wide uppercase">Payables Due</span>
            <DollarSign className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-lg font-bold text-rose-700 truncate">₹{kpis.totalOutstandingPayables}</div>
          <p className="text-[10px] text-resort-stone mt-0.5">Total balance due</p>
        </CardContent>
      </Card>


      <Card className="border border-resort-sand/50 bg-white/70 shadow-sm">
        <CardContent className="p-3.5">
          <div className="flex items-center justify-between text-resort-stone mb-1">
            <span className="text-[11px] font-medium tracking-wide uppercase">Vendors</span>
            <Users className="w-4 h-4 text-resort-charcoal" />
          </div>
          <div className="text-xl font-bold text-resort-charcoal">{kpis.activeVendorsCount}</div>
          <p className="text-[10px] text-resort-stone mt-0.5">Active partners</p>
        </CardContent>
      </Card>
    </div>
  );
};
