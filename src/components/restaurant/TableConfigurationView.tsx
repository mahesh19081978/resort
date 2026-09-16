'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  saveSittingAreaAction,
  toggleSittingAreaAction,
  saveTableAction,
  bulkCreateTablesAction,
  deleteOrArchiveTableAction,
} from '@/actions/restaurant';
import {
  Plus,
  Edit2,
  Trash2,
  Layers,
  LayoutGrid,
  Users,
  AlertCircle,
  CheckCircle2,
  Settings,
  Sparkles,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SittingAreaData {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  displayOrder: number;
  isActive: boolean;
  tableCount: number;
}

export interface TableConfigData {
  id: string;
  tableNumber: string;
  capacity: number;
  sittingAreaId: string;
  sittingAreaName: string;
  isActive: boolean;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'JOINED' | 'BLOCKED';
  activeSessionId?: string | null;
}

export function TableConfigurationView({
  restaurantId,
  sittingAreas,
  tables,
}: {
  restaurantId: string;
  sittingAreas: SittingAreaData[];
  tables: TableConfigData[];
}) {
  const [subTab, setSubTab] = useState<'tables' | 'areas'>('tables');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [areaModalOpen, setAreaModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<SittingAreaData | null>(null);

  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableConfigData | null>(null);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<TableConfigData | null>(null);

  // Form states - Area
  const [areaName, setAreaName] = useState('');
  const [areaCode, setAreaCode] = useState('');
  const [areaDescription, setAreaDescription] = useState('');
  const [areaOrder, setAreaOrder] = useState('0');
  const [areaActive, setAreaActive] = useState(true);

  // Form states - Table
  const [tableNumber, setTableNumber] = useState('');
  const [tableCapacity, setTableCapacity] = useState('4');
  const [tableSittingAreaId, setTableSittingAreaId] = useState(sittingAreas[0]?.id || '');
  const [tableActive, setTableActive] = useState(true);

  // Form states - Bulk
  const [bulkPrefix, setBulkPrefix] = useState('T');
  const [bulkStartNum, setBulkStartNum] = useState('1');
  const [bulkCount, setBulkCount] = useState('6');
  const [bulkCapacity, setBulkCapacity] = useState('4');
  const [bulkAreaId, setBulkAreaId] = useState(sittingAreas[0]?.id || '');

  // Submissions
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const filteredTables = tables.filter((t) => {
    if (selectedAreaId !== 'ALL' && t.sittingAreaId !== selectedAreaId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNum = t.tableNumber.toLowerCase().includes(q);
      const matchArea = t.sittingAreaName.toLowerCase().includes(q);
      if (!matchNum && !matchArea) return false;
    }
    return true;
  });

  // Area handlers
  const openAddArea = () => {
    setEditingArea(null);
    setAreaName('');
    setAreaCode('');
    setAreaDescription('');
    setAreaOrder(String(sittingAreas.length * 10));
    setAreaActive(true);
    setErrorMsg(null);
    setAreaModalOpen(true);
  };

  const openEditArea = (area: SittingAreaData) => {
    setEditingArea(area);
    setAreaName(area.name);
    setAreaCode(area.code);
    setAreaDescription(area.description || '');
    setAreaOrder(String(area.displayOrder));
    setAreaActive(area.isActive);
    setErrorMsg(null);
    setAreaModalOpen(true);
  };

  const handleSaveArea = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await saveSittingAreaAction({
      id: editingArea ? editingArea.id : undefined,
      restaurantId,
      name: areaName,
      code: areaCode,
      description: areaDescription || undefined,
      displayOrder: parseInt(areaOrder, 10) || 0,
      isActive: areaActive,
    });

    setIsSubmitting(false);

    if (res.success) {
      setAreaModalOpen(false);
      setSuccessMsg(editingArea ? 'Sitting Area updated' : 'Sitting Area created');
      setTimeout(() => setSuccessMsg(null), 3000);
      window.location.reload();
    } else {
      setErrorMsg(res.error || 'Failed to save sitting area');
    }
  };

  // Table handlers
  const openAddTable = () => {
    setEditingTable(null);
    setTableNumber('');
    setTableCapacity('4');
    setTableSittingAreaId(sittingAreas[0]?.id || '');
    setTableActive(true);
    setErrorMsg(null);
    setTableModalOpen(true);
  };

  const openEditTable = (t: TableConfigData) => {
    setEditingTable(t);
    setTableNumber(t.tableNumber);
    setTableCapacity(String(t.capacity));
    setTableSittingAreaId(t.sittingAreaId);
    setTableActive(t.isActive);
    setErrorMsg(null);
    setTableModalOpen(true);
  };

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await saveTableAction({
      id: editingTable ? editingTable.id : undefined,
      restaurantId,
      sittingAreaId: tableSittingAreaId,
      tableNumber,
      capacity: parseInt(tableCapacity, 10) || 4,
      isActive: tableActive,
    });

    setIsSubmitting(false);

    if (res.success) {
      setTableModalOpen(false);
      setSuccessMsg(editingTable ? 'Table updated' : 'Table created');
      setTimeout(() => setSuccessMsg(null), 3000);
      window.location.reload();
    } else {
      setErrorMsg(res.error || 'Failed to save table');
    }
  };

  const handleBulkCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await bulkCreateTablesAction({
      restaurantId,
      sittingAreaId: bulkAreaId,
      prefix: bulkPrefix,
      startNumber: parseInt(bulkStartNum, 10) || 1,
      count: parseInt(bulkCount, 10) || 6,
      capacity: parseInt(bulkCapacity, 10) || 4,
    });

    setIsSubmitting(false);

    if (res.success) {
      setBulkModalOpen(false);
      const createdCount = Array.isArray(res.data) ? res.data.length : bulkCount;
      setSuccessMsg(`Successfully created ${createdCount} tables in batch!`);
      setTimeout(() => setSuccessMsg(null), 3000);
      window.location.reload();
    } else {
      setErrorMsg(res.error || 'Bulk table creation failed');
    }
  };

  const handleDeleteTable = async () => {
    if (!tableToDelete) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await deleteOrArchiveTableAction(tableToDelete.id);
    setIsSubmitting(false);

    if (res.success) {
      setDeleteModalOpen(false);
      const wasHard = (res.data as any)?.hardDeleted;
      setSuccessMsg(
        wasHard
          ? `Table ${tableToDelete.tableNumber} deleted.`
          : `Table ${tableToDelete.tableNumber} safely archived to protect session history.`
      );
      setTimeout(() => setSuccessMsg(null), 3000);
      window.location.reload();
    } else {
      setErrorMsg(res.error || 'Failed to delete table');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-md flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Sub-Tabs Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-lg border border-resort-sand">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubTab('tables')}
            className={cn(
              'px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors',
              subTab === 'tables'
                ? 'bg-resort-forest text-white shadow-sm'
                : 'bg-resort-sand/40 text-resort-charcoal hover:bg-resort-sand'
            )}
          >
            Physical Tables ({tables.length})
          </button>
          <button
            onClick={() => setSubTab('areas')}
            className={cn(
              'px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors',
              subTab === 'areas'
                ? 'bg-resort-forest text-white shadow-sm'
                : 'bg-resort-sand/40 text-resort-charcoal hover:bg-resort-sand'
            )}
          >
            Authoritative Sitting Areas ({sittingAreas.length})
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {subTab === 'tables' ? (
            <>
              <Button size="sm" variant="outline" onClick={() => { setErrorMsg(null); setBulkModalOpen(true); }} className="text-xs">
                <Sparkles className="w-3.5 h-3.5 mr-1" /> Bulk Add Tables
              </Button>
              <Button size="sm" onClick={openAddTable} className="text-xs">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Table
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={openAddArea} className="text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Sitting Area
            </Button>
          )}
        </div>
      </div>

      {subTab === 'tables' ? (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 rounded-lg border border-resort-sand text-xs">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-resort-stone" />
              <input
                type="text"
                placeholder="Search table number or sitting area..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
              />
            </div>

            <div className="w-full sm:w-64">
              <select
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
              >
                <option value="ALL">All Sitting Areas ({sittingAreas.length})</option>
                {sittingAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.tableCount} tables)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tables Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredTables.map((table) => {
              const isOccupied = table.activeSessionId !== null && table.activeSessionId !== undefined;

              return (
                <Card key={table.id} className="border border-resort-sand hover:shadow-sm transition-all">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-serif text-lg font-bold text-resort-charcoal">
                            {table.tableNumber}
                          </span>
                          <Badge
                            variant={table.isActive ? 'success' : 'secondary'}
                            className="text-[10px]"
                          >
                            {table.isActive ? 'Active' : 'Deactivated'}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-resort-stone font-medium mt-0.5">
                          {table.sittingAreaName}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 text-xs text-resort-stone font-medium bg-resort-sand/20 px-2 py-1 rounded">
                        <Users className="w-3 h-3" />
                        <span>{table.capacity}p</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-resort-sand/60 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-resort-stone">
                        Live Status: <strong className={cn(isOccupied ? 'text-amber-700' : 'text-emerald-700')}>{table.status}</strong>
                      </span>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-resort-charcoal hover:bg-resort-sand/40"
                          onClick={() => openEditTable(table)}
                          title="Edit Table"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => {
                            setTableToDelete(table);
                            setErrorMsg(null);
                            setDeleteModalOpen(true);
                          }}
                          disabled={isOccupied}
                          title={isOccupied ? 'Cannot delete or archive table while session is active' : 'Delete or Archive Table'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredTables.length === 0 && (
            <div className="p-8 text-center bg-white border border-dashed border-resort-sand rounded-lg text-resort-stone text-xs">
              No tables found matching your search.
            </div>
          )}
        </div>
      ) : (
        /* Sitting Areas List */
        <div className="bg-white rounded-lg border border-resort-sand overflow-hidden">
          <div className="p-4 border-b border-resort-sand flex items-center justify-between">
            <div>
              <h3 className="font-serif font-bold text-sm text-resort-charcoal">
                Authoritative Sitting Areas
              </h3>
              <p className="text-xs text-resort-stone mt-0.5">
                Primary source of truth for restaurant floor sections.
              </p>
            </div>
          </div>

          <div className="divide-y divide-resort-sand">
            {sittingAreas.map((area) => (
              <div
                key={area.id}
                className="p-4 flex items-center justify-between hover:bg-resort-sand/10 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-sm text-resort-charcoal">
                      {area.name}
                    </span>
                    <span className="font-mono text-[10px] text-resort-stone bg-resort-sand/40 px-1.5 py-0.5 rounded uppercase font-semibold">
                      {area.code}
                    </span>
                    <Badge
                      variant={area.isActive ? 'success' : 'secondary'}
                      className="text-[10px]"
                    >
                      {area.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {area.description && (
                    <p className="text-xs text-resort-stone">{area.description}</p>
                  )}
                  <p className="text-[11px] text-resort-stone">
                    Display Order: <strong className="font-mono">{area.displayOrder}</strong> • {area.tableCount} tables assigned
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => openEditArea(area)}
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit Area
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: ADD / EDIT SITTING AREA */}
      {areaModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-resort-sand w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-resort-sand flex items-center justify-between bg-resort-sand/20">
              <h3 className="font-serif font-bold text-sm text-resort-charcoal">
                {editingArea ? 'Edit Sitting Area' : 'Create Sitting Area'}
              </h3>
              <button
                type="button"
                onClick={() => setAreaModalOpen(false)}
                className="text-resort-stone hover:text-resort-charcoal text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveArea} className="p-4 space-y-3 text-xs">
              {errorMsg && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Area Name *</label>
                <input
                  type="text"
                  required
                  value={areaName}
                  onChange={(e) => setAreaName(e.target.value)}
                  placeholder="e.g. Heritage AC Hall, Garden Terrace"
                  className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Code *</label>
                <input
                  type="text"
                  required
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value.toUpperCase())}
                  placeholder="e.g. IN_AC, EXT_TERRACE"
                  className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs font-mono uppercase focus:outline-none focus:border-resort-forest"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Display Order</label>
                <input
                  type="number"
                  min="0"
                  value={areaOrder}
                  onChange={(e) => setAreaOrder(e.target.value)}
                  placeholder="0, 10, 20..."
                  className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={areaDescription}
                  onChange={(e) => setAreaDescription(e.target.value)}
                  placeholder="Indoor fine dining, scenic view, pool side..."
                  className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={areaActive}
                    onChange={(e) => setAreaActive(e.target.checked)}
                    className="rounded border-resort-sand text-resort-forest"
                  />
                  <span>Active Sitting Area</span>
                </label>
              </div>

              <div className="pt-3 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAreaModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Sitting Area'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT TABLE */}
      {tableModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-resort-sand w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-resort-sand flex items-center justify-between bg-resort-sand/20">
              <h3 className="font-serif font-bold text-sm text-resort-charcoal">
                {editingTable ? `Edit Table ${editingTable.tableNumber}` : 'Create Table'}
              </h3>
              <button
                type="button"
                onClick={() => setTableModalOpen(false)}
                className="text-resort-stone hover:text-resort-charcoal text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTable} className="p-4 space-y-3 text-xs">
              {errorMsg && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Table Number / Identifier *</label>
                <input
                  type="text"
                  required
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. T-01, VIP-1"
                  className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs font-mono uppercase focus:outline-none focus:border-resort-forest font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Sitting Area *</label>
                <select
                  value={tableSittingAreaId}
                  onChange={(e) => setTableSittingAreaId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                >
                  {sittingAreas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Seating Capacity *</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={tableCapacity}
                  onChange={(e) => setTableCapacity(e.target.value)}
                  placeholder="4"
                  className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={tableActive}
                    onChange={(e) => setTableActive(e.target.checked)}
                    className="rounded border-resort-sand text-resort-forest"
                  />
                  <span>Active (Available for floor service)</span>
                </label>
              </div>

              <div className="pt-3 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTableModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Table'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: BULK CREATE TABLES */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-resort-sand w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-resort-sand flex items-center justify-between bg-resort-sand/20">
              <div>
                <h3 className="font-serif font-bold text-sm text-resort-charcoal flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-resort-forest" /> Bulk Table Creation
                </h3>
                <p className="text-[11px] text-resort-stone">
                  Generate up to 50 numbered dining tables atomically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkModalOpen(false)}
                className="text-resort-stone hover:text-resort-charcoal text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBulkCreate} className="p-4 space-y-3 text-xs">
              {errorMsg && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Sitting Area Destination *</label>
                <select
                  value={bulkAreaId}
                  onChange={(e) => setBulkAreaId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                >
                  {sittingAreas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">Table Prefix *</label>
                  <input
                    type="text"
                    required
                    value={bulkPrefix}
                    onChange={(e) => setBulkPrefix(e.target.value.toUpperCase())}
                    placeholder="e.g. T, R, TERRACE"
                    className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs font-mono uppercase focus:outline-none focus:border-resort-forest"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">Starting Number *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={bulkStartNum}
                    onChange={(e) => setBulkStartNum(e.target.value)}
                    placeholder="1"
                    className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">Number of Tables (Count) *</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    required
                    value={bulkCount}
                    onChange={(e) => setBulkCount(e.target.value)}
                    placeholder="6"
                    className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">Seating Capacity *</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    required
                    value={bulkCapacity}
                    onChange={(e) => setBulkCapacity(e.target.value)}
                    placeholder="4"
                    className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                  />
                </div>
              </div>

              {/* Preview previewing table numbers */}
              <div className="p-2.5 bg-resort-sand/20 rounded border border-resort-sand text-[11px] space-y-1">
                <span className="font-semibold text-resort-charcoal">Batch Preview:</span>
                <p className="font-mono text-resort-forest font-medium">
                  {bulkPrefix}-{(parseInt(bulkStartNum, 10) || 1) < 10 ? `0${parseInt(bulkStartNum, 10) || 1}` : parseInt(bulkStartNum, 10) || 1} to{' '}
                  {bulkPrefix}-{(parseInt(bulkStartNum, 10) || 1) + (parseInt(bulkCount, 10) || 1) - 1 < 10
                    ? `0${(parseInt(bulkStartNum, 10) || 1) + (parseInt(bulkCount, 10) || 1) - 1}`
                    : (parseInt(bulkStartNum, 10) || 1) + (parseInt(bulkCount, 10) || 1) - 1}
                </p>
                <p className="text-[10px] text-resort-stone">
                  Atomic Transaction: If any number collides with an existing table, the entire batch is rolled back safely.
                </p>
              </div>

              <div className="pt-3 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating Batch...' : 'Generate Tables'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE OR ARCHIVE TABLE */}
      {deleteModalOpen && tableToDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-resort-sand w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-resort-sand flex items-center justify-between bg-red-50">
              <h3 className="font-serif font-bold text-sm text-red-800 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-red-600" /> Remove or Archive Table
              </h3>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="text-resort-stone hover:text-resort-charcoal text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              {errorMsg && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs">
                  {errorMsg}
                </div>
              )}

              <p className="text-resort-charcoal">
                Are you sure you want to remove table <strong>{tableToDelete.tableNumber}</strong>?
              </p>

              <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded text-[11px] space-y-1">
                <p className="font-semibold">Session History Protection Guarantee:</p>
                <p>
                  If this table has historical dining sessions, it will be <strong>safely archived</strong> (hidden from POS) rather than hard deleted to preserve dining audit trails.
                </p>
              </div>

              <div className="pt-2 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleDeleteTable}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Confirm Removal'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
