'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { updateKOTStatusAction } from '@/actions/restaurant';
import { ChefHat, Clock, CheckCircle2, AlertCircle, Play, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KitchenKOTItem {
  id: string;
  name: string;
  quantity: number;
  notes?: string | null;
  kitchenStation?: string | null;
}

export interface KitchenKOT {
  id: string;
  kotNumber: string;
  orderNumber: string;
  orderType: 'DINE_IN' | 'TAKE_AWAY' | 'ROOM_SERVICE';
  status: 'SENT' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
  kitchenNote?: string | null;
  tableOrRoom: string;
  createdAt: string;
  items: KitchenKOTItem[];
}

export function KitchenDisplay({ kots }: { kots: KitchenKOT[] }) {
  const router = useRouter();
  const [stationFilter, setStationFilter] = useState<string>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const stations = ['ALL', 'Tandoor', 'Curry Station', 'Pantry'];

  const filteredKots = kots.filter((kot) => {
    if (stationFilter === 'ALL') return true;
    return kot.items.some((i) => i.kitchenStation === stationFilter);
  });

  const handleStatusUpdate = async (
    kotId: string,
    nextStatus: 'PREPARING' | 'READY' | 'SERVED'
  ) => {
    setUpdatingId(kotId);
    const res = await updateKOTStatusAction(kotId, nextStatus);
    setUpdatingId(null);

    if (res.success) {
      router.refresh();
    } else {
      alert(res.error || 'Failed to update KOT status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Station Filters & Status Legend */}
      <div className="bg-white p-4 rounded-lg border border-resort-sand flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {stations.map((st) => (
            <button
              key={st}
              onClick={() => setStationFilter(st)}
              className={cn(
                'px-3.5 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap',
                stationFilter === st
                  ? 'bg-resort-forest text-resort-ivory'
                  : 'bg-resort-sand/30 text-resort-charcoal hover:bg-resort-sand'
              )}
            >
              {st} {st !== 'ALL' && 'Station'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-amber-700">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Pending (
            {kots.filter((k) => k.status === 'SENT').length})
          </span>
          <span className="flex items-center gap-1.5 font-medium text-blue-700">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Preparing (
            {kots.filter((k) => k.status === 'PREPARING').length})
          </span>
          <span className="flex items-center gap-1.5 font-medium text-emerald-700">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Ready to Serve (
            {kots.filter((k) => k.status === 'READY').length})
          </span>
        </div>
      </div>

      {/* KOT Cards Display Grid */}
      {filteredKots.length === 0 ? (
        <div className="bg-white rounded-lg border border-resort-sand p-12 text-center text-resort-stone space-y-2">
          <ChefHat className="w-12 h-12 mx-auto text-resort-sand" />
          <h3 className="font-serif font-bold text-lg text-resort-charcoal">All Orders Cleared</h3>
          <p className="text-xs">No pending or preparing Kitchen Order Tickets at this moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredKots.map((kot) => {
            const isSent = kot.status === 'SENT';
            const isPreparing = kot.status === 'PREPARING';
            const isReady = kot.status === 'READY';
            const createdTime = new Date(kot.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <Card
                key={kot.id}
                className={cn(
                  'border transition-all shadow-sm',
                  isSent && 'border-amber-300 bg-amber-50/15',
                  isPreparing && 'border-blue-300 bg-blue-50/15',
                  isReady && 'border-emerald-300 bg-emerald-50/20'
                )}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between border-b border-resort-sand/60 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-resort-charcoal">
                          #{kot.kotNumber}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded tracking-wider uppercase',
                            isSent && 'bg-amber-100 text-amber-800',
                            isPreparing && 'bg-blue-100 text-blue-800',
                            isReady && 'bg-emerald-100 text-emerald-800'
                          )}
                        >
                          {kot.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-resort-stone font-medium mt-0.5">
                        Order #{kot.orderNumber} ({kot.orderType.replace('_', ' ')})
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="font-bold text-xs bg-resort-sand/30 px-2 py-0.5 rounded text-resort-forest">
                        {kot.tableOrRoom}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] text-resort-stone justify-end mt-1">
                        <Clock className="w-3 h-3" />
                        <span>{createdTime}</span>
                      </div>
                    </div>
                  </div>

                  {/* Kitchen Special Instructions */}
                  {kot.kitchenNote && (
                    <div className="p-2 bg-amber-100/80 rounded border border-amber-200 text-amber-900 text-[11px] font-medium">
                      ?? Note: {kot.kitchenNote}
                    </div>
                  )}

                  {/* Items list */}
                  <div className="space-y-2 py-1">
                    {kot.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-2 text-xs border-b border-resort-sand/30 pb-1.5 last:border-none"
                      >
                        <div>
                          <span className="font-semibold text-resort-charcoal">{item.name}</span>
                          {item.notes && (
                            <p className="text-[11px] text-amber-800 italic">{item.notes}</p>
                          )}
                          {item.kitchenStation && (
                            <span className="text-[9px] text-resort-stone bg-resort-sand/20 px-1.5 py-0.5 rounded">
                              {item.kitchenStation}
                            </span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-sm text-resort-forest bg-resort-sand/20 px-2 py-0.5 rounded">
                          {item.quantity}x
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Operational Action Buttons */}
                  <div className="pt-2 border-t border-resort-sand/60">
                    {isSent && (
                      <Button
                        size="sm"
                        className="w-full text-xs bg-blue-700 hover:bg-blue-800 text-white"
                        disabled={updatingId === kot.id}
                        onClick={() => handleStatusUpdate(kot.id, 'PREPARING')}
                      >
                        <Play className="w-3 h-3 mr-1" /> Start Preparation
                      </Button>
                    )}

                    {isPreparing && (
                      <Button
                        size="sm"
                        className="w-full text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
                        disabled={updatingId === kot.id}
                        onClick={() => handleStatusUpdate(kot.id, 'READY')}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" /> Mark as Ready
                      </Button>
                    )}

                    {isReady && (
                      <Button
                        size="sm"
                        className="w-full text-xs bg-resort-forest text-white"
                        disabled={updatingId === kot.id}
                        onClick={() => handleStatusUpdate(kot.id, 'SERVED')}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark as Served
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
