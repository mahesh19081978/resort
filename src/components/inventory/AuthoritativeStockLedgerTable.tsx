'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, Calendar, ArrowDownUp, RefreshCw } from 'lucide-react';
import { AdminStatusBadge } from '@/components/admin/ui';

export interface MovementRecord {
  id: string;
  movementNumber: string;
  movementType: string;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  unitCost: number;
  totalCost: number;
  remarks: string | null;
  createdAt: string;
  item: {
    id: string;
    name: string;
    code: string;
    baseUnit: { code: string; name: string };
  };
  store: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export interface StoreOption {
  id: string;
  name: string;
  code: string;
}

function formatDisplayQty(val: number): string {
  // Human-friendly precision: trim redundant zeros like 40.0000 -> 40, but keep 40.25
  const rounded = Number(val.toFixed(4));
  return rounded.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

export default function AuthoritativeStockLedgerTable({
  movements,
  stores,
}: {
  movements: MovementRecord[];
  stores: StoreOption[];
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | '7DAYS' | '30DAYS'>('ALL');

  // Available movement types present in the dataset or standard list
  const movementTypes = [
    'ALL',
    'PURCHASE_RECEIPT',
    'STOCK_ISSUE',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'OPENING_BALANCE',
    'WASTAGE',
    'DAMAGE',
  ];

  const filteredMovements = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = todayStart - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = todayStart - 30 * 24 * 60 * 60 * 1000;

    return movements.filter((m) => {
      // Store filter
      if (selectedStoreId !== 'ALL' && m.store?.id !== selectedStoreId) {
        return false;
      }

      // Movement Type filter
      if (selectedType !== 'ALL' && m.movementType !== selectedType) {
        return false;
      }

      // Date shortcut filter
      const mTime = new Date(m.createdAt).getTime();
      if (dateFilter === 'TODAY' && mTime < todayStart) {
        return false;
      }
      if (dateFilter === '7DAYS' && mTime < sevenDaysAgo) {
        return false;
      }
      if (dateFilter === '30DAYS' && mTime < thirtyDaysAgo) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesItem = m.item.name.toLowerCase().includes(q) || m.item.code.toLowerCase().includes(q);
        const matchesMov = m.movementNumber.toLowerCase().includes(q);
        const matchesStore = m.store?.name.toLowerCase().includes(q) || m.store?.code.toLowerCase().includes(q);
        const matchesRemarks = m.remarks?.toLowerCase().includes(q);
        if (!matchesItem && !matchesMov && !matchesStore && !matchesRemarks) {
          return false;
        }
      }

      return true;
    });
  }, [movements, searchTerm, selectedStoreId, selectedType, dateFilter]);

  return (
    <div className="space-y-3">
      {/* Search & Filter Controls */}
      <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between pb-1">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Search movement #, item, store, remarks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-md bg-white focus:outline-hidden focus:ring-1 focus:ring-resort-forest"
          />
        </div>

        {/* Filter Dropdowns & Date shortcuts */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Store Filter */}
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-border rounded-md bg-white text-stone-700 focus:outline-hidden focus:ring-1 focus:ring-resort-forest"
          >
            <option value="ALL">All Stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Movement Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-border rounded-md bg-white text-stone-700 focus:outline-hidden focus:ring-1 focus:ring-resort-forest"
          >
            {movementTypes.map((t) => (
              <option key={t} value={t}>
                {t === 'ALL' ? 'All Types' : t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          {/* Date Range Shortcuts */}
          <div className="inline-flex rounded-md border border-border bg-stone-50/70 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setDateFilter('ALL')}
              className={`px-2 py-1 rounded transition-colors ${
                dateFilter === 'ALL' ? 'bg-white font-semibold text-resort-charcoal shadow-2xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('TODAY')}
              className={`px-2 py-1 rounded transition-colors ${
                dateFilter === 'TODAY' ? 'bg-white font-semibold text-resort-charcoal shadow-2xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('7DAYS')}
              className={`px-2 py-1 rounded transition-colors ${
                dateFilter === '7DAYS' ? 'bg-white font-semibold text-resort-charcoal shadow-2xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Last 7d
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('30DAYS')}
              className={`px-2 py-1 rounded transition-colors ${
                dateFilter === '30DAYS' ? 'bg-white font-semibold text-resort-charcoal shadow-2xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Last 30d
            </button>
          </div>

          {(searchTerm || selectedStoreId !== 'ALL' || selectedType !== 'ALL' || dateFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedStoreId('ALL');
                setSelectedType('ALL');
                setDateFilter('ALL');
              }}
              className="text-[11px] text-stone-500 hover:text-stone-800 underline ml-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="border border-border/80 rounded-lg overflow-x-auto bg-white shadow-2xs">
        <table className="w-full text-left text-xs border-collapse min-w-[700px]">
          <thead>
            <tr className="border-b border-border bg-stone-50/80 text-stone-600 uppercase text-[10px] tracking-wider font-semibold">
              <th className="py-2.5 px-3">Movement #</th>
              <th className="py-2.5 px-3">Type</th>
              <th className="py-2.5 px-3">Store</th>
              <th className="py-2.5 px-3">Item</th>
              <th className="py-2.5 px-3 text-right">Qty</th>
              <th className="py-2.5 px-3 text-center">Balance Track</th>
              <th className="py-2.5 px-3">Date</th>
              <th className="py-2.5 px-3">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredMovements.map((m) => {
              const isInbound = [
                'OPENING_BALANCE',
                'PURCHASE_RECEIPT',
                'TRANSFER_IN',
                'ADJUSTMENT_IN',
                'RETURN_FROM_DEPARTMENT',
              ].includes(m.movementType);

              const unitCode = m.item.baseUnit.code || '';

              return (
                <tr key={m.id} className="hover:bg-stone-50/60 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-medium text-resort-charcoal">
                    {m.movementNumber}
                  </td>
                  <td className="py-2.5 px-3">
                    <AdminStatusBadge
                      status={
                        isInbound
                          ? 'SUCCESS'
                          : m.movementType === 'WASTAGE' || m.movementType === 'DAMAGE'
                          ? 'DANGER'
                          : 'PENDING'
                      }
                      label={m.movementType.replace(/_/g, ' ')}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-stone-600">{m.store?.name || '—'}</td>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-resort-charcoal">{m.item.name}</div>
                    <div className="font-mono text-[10px] text-stone-600">{m.item.code}</div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold">
                    <span className={isInbound ? 'text-emerald-700' : 'text-amber-700'}>
                      {isInbound ? '+' : '-'}
                      {formatDisplayQty(m.quantity)} {unitCode}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono text-stone-600">
                    <span className="text-stone-500">{formatDisplayQty(m.balanceBefore)}</span>
                    <span className="mx-1 text-stone-300">→</span>
                    <span className="font-bold text-resort-charcoal">{formatDisplayQty(m.balanceAfter)} {unitCode}</span>
                  </td>
                  <td className="py-2.5 px-3 text-stone-500 text-[11px] whitespace-nowrap">
                    {new Date(m.createdAt).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td
                    className="py-2.5 px-3 text-stone-500 text-[11px] truncate max-w-[220px]"
                    title={m.remarks || ''}
                  >
                    {m.remarks || '—'}
                  </td>
                </tr>
              );
            })}

            {filteredMovements.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center">
                  <p className="font-serif text-sm font-semibold text-resort-charcoal">No stock movements found</p>
                  <p className="text-xs text-stone-600 mt-0.5">
                    {searchTerm || selectedStoreId !== 'ALL' || selectedType !== 'ALL' || dateFilter !== 'ALL'
                      ? 'No movement records match the selected filters.'
                      : 'Inventory activity will appear here after the first receipt, issue, transfer, or adjustment.'}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Showing count indicator */}
      <div className="flex justify-between items-center text-[11px] text-stone-600 px-1">
        <span>
          Showing <strong className="text-stone-700">{filteredMovements.length}</strong> of{' '}
          <strong className="text-stone-700">{movements.length}</strong> recorded movements
        </span>
        <span className="italic">Append-only authoritative ledger</span>
      </div>
    </div>
  );
}
