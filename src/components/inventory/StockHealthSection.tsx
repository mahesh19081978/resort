'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AdminStatusBadge } from '@/components/admin/ui';

export interface StockHealthItem {
  id: string;
  name: string;
  code: string;
  storeName: string;
  currentStock: number;
  reorderLevel: number;
  unitCode: string;
  isLowStock: boolean;
}

export default function StockHealthSection({
  items,
}: {
  items: StockHealthItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  const lowStockCount = items.filter((i) => i.isLowStock).length;

  return (
    <div className="bg-white rounded-lg border border-border/80 shadow-2xs overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-stone-50/50">
        <div className="flex items-center gap-2">
          <h3 className="font-serif text-base font-bold text-resort-charcoal">
            Stock Health & Reorder Status
          </h3>
          {lowStockCount > 0 ? (
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-100 text-rose-800">
              {lowStockCount} Low Stock
            </span>
          ) : (
            <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-800">
              Healthy
            </span>
          )}
        </div>
        <span className="text-xs text-stone-600 italic">
          Authoritative threshold monitoring (Reorder Level &gt; 0)
        </span>
      </div>

      <div className="p-4">
        <div className="border border-border/80 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-stone-50 text-[10px] uppercase font-semibold text-stone-600 tracking-wider">
                <th className="py-2.5 px-3">Item</th>
                <th className="py-2.5 px-3">Store</th>
                <th className="py-2.5 px-3 text-right">Current Stock</th>
                <th className="py-2.5 px-3 text-right">Reorder Level</th>
                <th className="py-2.5 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {items.map((it) => (
                <tr key={it.id} className="hover:bg-stone-50/60">
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-resort-charcoal">{it.name}</div>
                    <div className="font-mono text-[10px] text-stone-600">{it.code}</div>
                  </td>
                  <td className="py-2.5 px-3 text-stone-600">{it.storeName}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-resort-charcoal">
                    {it.currentStock.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {it.unitCode}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-stone-600">
                    {it.reorderLevel.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {it.unitCode}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <AdminStatusBadge
                      status={it.isLowStock ? 'DANGER' : 'SUCCESS'}
                      label={it.isLowStock ? 'Low Stock' : 'Healthy'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
