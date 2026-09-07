'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  openTableSessionAction,
  closeTableSessionAction,
  addTablesToSessionAction,
} from '@/actions/restaurant';
import { Users, Clock, AlertCircle, Plus, CheckCircle2, ChevronRight, Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TableItem {
  id: string;
  tableNumber: string;
  capacity: number;
  section: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'JOINED' | 'BLOCKED';
  currentSession?: {
    id: string;
    sessionCode: string;
    paxCount: number;
    guestName?: string | null;
    openedAt: string;
    orderCount: number;
    tables: { id: string; tableNumber: string }[];
  } | null;
}

export function TablesView({
  restaurantId,
  tables,
}: {
  restaurantId: string;
  tables: TableItem[];
}) {
  const [selectedSection, setSelectedSection] = useState<string>('ALL');
  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [targetTable, setTargetTable] = useState<TableItem | null>(null);
  const [paxCount, setPaxCount] = useState<number>(2);
  const [guestName, setGuestName] = useState<string>('');
  const [selectedMultiTables, setSelectedMultiTables] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sections = ['ALL', ...Array.from(new Set(tables.map((t) => t.section)))];

  const filteredTables = selectedSection === 'ALL'
    ? tables
    : tables.filter((t) => t.section === selectedSection);

  const availableTables = tables.filter((t) => t.status === 'AVAILABLE');

  const handleOpenClick = (table: TableItem) => {
    setTargetTable(table);
    setSelectedMultiTables([table.id]);
    setPaxCount(table.capacity);
    setGuestName('');
    setErrorMsg(null);
    setOpenModalOpen(true);
  };

  const handleOpenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('restaurantId', restaurantId);
    selectedMultiTables.forEach((id) => formData.append('tableIds', id));
    formData.append('paxCount', String(paxCount));
    if (guestName) formData.append('guestName', guestName);

    const res = await openTableSessionAction(null, formData);
    setIsSubmitting(false);

    if (res.success) {
      setOpenModalOpen(false);
      window.location.reload();
    } else {
      setErrorMsg(res.error || 'Failed to open session');
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to close this table session? Ensure all bills are settled.')) {
      return;
    }
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    const res = await closeTableSessionAction(null, formData);
    if (res.success) {
      window.location.reload();
    } else {
      alert(res.error || 'Failed to close session');
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics & Section Filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-4 rounded-lg border border-resort-sand">
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
          {sections.map((sec) => (
            <button
              key={sec}
              onClick={() => setSelectedSection(sec)}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                selectedSection === sec
                  ? 'bg-resort-forest text-resort-ivory font-semibold'
                  : 'bg-resort-sand/40 text-resort-charcoal hover:bg-resort-sand'
              )}
            >
              {sec}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            <span className="text-resort-stone font-medium">
              Available ({tables.filter((t) => t.status === 'AVAILABLE').length})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
            <span className="text-resort-stone font-medium">
              Occupied ({tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'JOINED').length})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            <span className="text-resort-stone font-medium">
              Reserved ({tables.filter((t) => t.status === 'RESERVED').length})
            </span>
          </div>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredTables.map((table) => {
          const isAvailable = table.status === 'AVAILABLE';
          const isOccupied = table.status === 'OCCUPIED' || table.status === 'JOINED';
          const session = table.currentSession;

          return (
            <Card
              key={table.id}
              className={cn(
                'relative border transition-all hover:shadow-md',
                isAvailable && 'border-emerald-200 bg-emerald-50/20',
                isOccupied && 'border-amber-300 bg-amber-50/20',
                table.status === 'RESERVED' && 'border-blue-200 bg-blue-50/20'
              )}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-lg font-bold text-resort-charcoal">
                        {table.tableNumber}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider',
                          isAvailable && 'bg-emerald-100 text-emerald-800',
                          isOccupied && 'bg-amber-100 text-amber-800',
                          table.status === 'RESERVED' && 'bg-blue-100 text-blue-800'
                        )}
                      >
                        {table.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-resort-stone mt-0.5">{table.section}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-resort-stone font-medium bg-white px-2 py-1 rounded border border-resort-sand/60">
                    <Users className="w-3 h-3" />
                    <span>{table.capacity}</span>
                  </div>
                </div>

                {/* Active Session Details */}
                {isOccupied && session ? (
                  <div className="p-2.5 bg-white rounded border border-amber-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-resort-charcoal font-medium">
                      <span>{session.guestName || 'Guest Party'}</span>
                      <span className="text-amber-800 font-mono text-[11px] font-semibold">
                        {session.sessionCode}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-resort-stone">
                      <span>Pax: {session.paxCount}</span>
                      <span>Orders: {session.orderCount}</span>
                    </div>
                    {session.tables.length > 1 && (
                      <div className="text-[10px] text-indigo-700 bg-indigo-50 p-1 rounded font-medium">
                        Joined: {session.tables.map((t) => t.tableNumber).join(', ')}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-emerald-700 font-medium">
                    Ready for Guests
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 border-t border-resort-sand/60 flex items-center justify-between gap-2">
                  {isAvailable && (
                    <Button
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => handleOpenClick(table)}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Open Table
                    </Button>
                  )}

                  {isOccupied && session && (
                    <div className="w-full flex items-center gap-2">
                      <Link
                        href={`/admin/restaurant/pos?tableSessionId=${session.id}&tableNumber=${table.tableNumber}`}
                        className="flex-1"
                      >
                        <Button size="sm" variant="primary" className="w-full text-xs">
                          <Utensils className="w-3 h-3 mr-1" /> POS
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs text-red-700 border-red-200 hover:bg-red-50"
                        onClick={() => handleCloseSession(session.id)}
                      >
                        Close
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modal: Open Dining Session */}
      {openModalOpen && targetTable && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg border border-resort-sand w-full max-w-md p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-resort-sand pb-3">
              <h2 className="font-serif text-lg font-bold text-resort-charcoal">
                Open Dining Session — Table {targetTable.tableNumber}
              </h2>
              <button
                onClick={() => setOpenModalOpen(false)}
                className="text-resort-stone hover:text-resort-charcoal"
              >
                ?
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 text-red-800 rounded border border-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleOpenSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Guest Name / Party (Optional)</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g., Mr. Sharma or VIP Table"
                  className="w-full px-3 py-2 border border-resort-sand rounded text-xs focus:ring-1 focus:ring-resort-forest focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Guest Count (Pax)</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={paxCount}
                  onChange={(e) => setPaxCount(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 border border-resort-sand rounded text-xs focus:ring-1 focus:ring-resort-forest focus:outline-none"
                />
              </div>

              {/* Optional Table Joining */}
              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">
                  Join Additional Tables (Optional)
                </label>
                <p className="text-[11px] text-resort-stone">
                  Select extra available physical tables to group logically under this single session.
                </p>
                <div className="max-h-32 overflow-y-auto border border-resort-sand rounded p-2 grid grid-cols-3 gap-1 bg-resort-sand/10">
                  {availableTables
                    .filter((t) => t.id !== targetTable.id)
                    .map((t) => {
                      const isSelected = selectedMultiTables.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedMultiTables(selectedMultiTables.filter((id) => id !== t.id));
                            } else {
                              setSelectedMultiTables([...selectedMultiTables, t.id]);
                            }
                          }}
                          className={cn(
                            'p-1.5 rounded text-[11px] font-medium border text-center transition-colors',
                            isSelected
                              ? 'bg-resort-forest text-white border-resort-forest font-bold'
                              : 'bg-white border-resort-sand text-resort-charcoal hover:bg-resort-sand/40'
                          )}
                        >
                          {t.tableNumber} ({t.capacity}p)
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="pt-3 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpenModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Opening Session...' : 'Confirm & Open'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
