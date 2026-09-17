'use client';

import React, { useState } from 'react';
import { Warehouse, Boxes, AlertCircle, ChevronRight, X } from 'lucide-react';
import { AdminStatusBadge } from '@/components/admin/ui';

export interface StoreStockItem {
  id: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  quantityOnHand: number;
  unitCode: string;
  standardCost: number;
}

export interface PhysicalStoreCardData {
  id: string;
  name: string;
  code: string;
  department: string;
  isActive: boolean;
  itemCount: number;
  totalUnits: number;
  stocks: StoreStockItem[];
}

export default function PhysicalStoresGrid({
  stores,
}: {
  stores: PhysicalStoreCardData[];
}) {
  const [selectedStore, setSelectedStore] = useState<PhysicalStoreCardData | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stores.map((store) => {
          const topStock = store.stocks[0];
          const isCentral = store.code === 'STORE-MAIN';

          return (
            <div
              key={store.id}
              onClick={() => setSelectedStore(store)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedStore(store);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`View stock details for ${store.name}`}
              className="bg-white rounded-lg border border-border/90 p-4 shadow-2xs hover:shadow-md transition-all text-left flex flex-col justify-between group cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-resort-forest"
            >
              <div>
                {/* Store Card Header */}
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-serif text-sm font-bold text-resort-charcoal group-hover:text-resort-forest transition-colors">
                        {store.name}
                      </h4>
                      {isCentral && (
                        <span className="text-[9px] font-semibold bg-blue-50 text-blue-700 px-1 py-0.5 rounded border border-blue-200">
                          Main Warehouse
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      <span className="font-mono">{store.code}</span> · {store.department}
                    </p>
                  </div>
                  <AdminStatusBadge
                    status={store.isActive ? 'ACTIVE' : 'NEUTRAL'}
                    label={store.isActive ? 'Active' : 'Inactive'}
                  />
                </div>

                {/* Stock Stats Row */}
                <div className="grid grid-cols-2 gap-2 py-2.5 my-2 border-y border-stone-100 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-600 block">
                      Tracked Items
                    </span>
                    <span className="font-serif text-base font-bold text-resort-charcoal mt-0.5 block">
                      {store.itemCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-600 block">
                      Units On Hand
                    </span>
                    <span className="font-serif text-base font-bold text-resort-charcoal mt-0.5 block">
                      {store.totalUnits.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Stock Snapshot or Empty State */}
                <div className="pt-1 text-xs">
                  {topStock ? (
                    <div>
                      <p className="text-[10px] uppercase font-semibold tracking-wider text-stone-600 mb-1">
                        Current Stock
                      </p>
                      <div className="flex items-center justify-between text-xs py-1 px-2 rounded bg-stone-50/70 border border-stone-100">
                        <span className="font-medium text-stone-700 truncate pr-2">
                          {topStock.itemName}
                        </span>
                        <span className="font-mono font-bold text-resort-forest shrink-0">
                          {topStock.quantityOnHand.toLocaleString('en-IN', { maximumFractionDigits: 2 })}{' '}
                          {topStock.unitCode}
                        </span>
                      </div>
                      {store.stocks.length > 1 && (
                        <p className="text-[10px] text-stone-600 mt-1 pl-1">
                          + {store.stocks.length - 1} other item{store.stocks.length - 1 > 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="py-2 text-center text-[11px] text-stone-600 italic bg-stone-50/40 rounded border border-dashed border-stone-200">
                      No stock recorded yet
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer Link */}
              <div className="mt-4 pt-2 border-t border-stone-100 flex items-center justify-between text-xs font-semibold text-resort-forest group-hover:translate-x-0.5 transition-transform">
                <span>View Store Details</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Store Detail Modal */}
      {selectedStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-border max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border flex justify-between items-center bg-stone-50/70">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-resort-forest/10 flex items-center justify-center text-resort-forest">
                  <Warehouse className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base text-resort-charcoal">
                    {selectedStore.name}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Code: <span className="font-mono">{selectedStore.code}</span> · Dept: {selectedStore.department}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStore(null)}
                className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <div className="flex justify-between items-center text-xs pb-1 border-b border-stone-100">
                <span className="text-stone-500">Tracked Stock Items:</span>
                <span className="font-semibold text-resort-charcoal">{selectedStore.stocks.length}</span>
              </div>

              {selectedStore.stocks.length > 0 ? (
                <div className="border border-border/80 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-stone-50 text-[10px] uppercase font-semibold text-stone-600">
                        <th className="py-2 px-3">Item Name</th>
                        <th className="py-2 px-3">Code</th>
                        <th className="py-2 px-3 text-right">Quantity On Hand</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {selectedStore.stocks.map((s) => (
                        <tr key={s.id} className="hover:bg-stone-50/50">
                          <td className="py-2.5 px-3 font-semibold text-resort-charcoal">{s.itemName}</td>
                          <td className="py-2.5 px-3 font-mono text-[10px] text-stone-500">{s.itemCode}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-resort-forest">
                            {s.quantityOnHand.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {s.unitCode}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-stone-500 italic bg-stone-50/40 rounded border border-dashed border-stone-200">
                  No stock items recorded in this store yet.
                </div>
              )}
            </div>

            <div className="p-3 border-t border-border flex justify-end bg-stone-50/40">
              <button
                type="button"
                onClick={() => setSelectedStore(null)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-md border border-border bg-white text-stone-700 hover:bg-stone-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
