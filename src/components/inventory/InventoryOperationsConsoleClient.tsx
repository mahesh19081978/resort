'use client';

import React, { useState } from 'react';
import InventoryQuickActions, { QuickActionPermissions } from '@/components/inventory/InventoryQuickActions';
import StoreManagementModal, { StoreSummary } from '@/components/inventory/StoreManagementModal';
import PendingStockRequestsSection, { PendingStockRequestItem } from '@/components/inventory/PendingStockRequestsSection';
import PhysicalStoresGrid, { PhysicalStoreCardData } from '@/components/inventory/PhysicalStoresGrid';
import StockHealthSection, { StockHealthItem } from '@/components/inventory/StockHealthSection';
import AuthoritativeStockLedgerTable, { MovementRecord, StoreOption } from '@/components/inventory/AuthoritativeStockLedgerTable';
import { AdminKpiCard, AdminCard } from '@/components/admin/ui';
import { IndianRupee, Boxes, Clock, AlertTriangle, Warehouse } from 'lucide-react';

export interface OperationsCenterProps {
  currentUserRole: string;
  permissions: QuickActionPermissions;
  kpiData: {
    totalStockValue: number;
    itemsInStock: number;
    pendingRequestsCount: number;
    lowStockCount: number;
    activeStoresCount: number;
  };
  storesData: {
    cards: PhysicalStoreCardData[];
    summaries: StoreSummary[];
    options: StoreOption[];
  };
  pendingRequests: PendingStockRequestItem[];
  stockHealthItems: StockHealthItem[];
  recentMovements: MovementRecord[];
}

export default function InventoryOperationsConsoleClient({
  currentUserRole,
  permissions,
  kpiData,
  storesData,
  pendingRequests,
  stockHealthItems,
  recentMovements,
}: OperationsCenterProps) {
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header & Quick Operations Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-2xl lg:text-3xl font-bold tracking-tight text-resort-charcoal">
              Inventory & Store Ledger
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-resort-forest/10 text-resort-forest border border-resort-forest/20">
              Operations Control
            </span>
          </div>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Authoritative stock ledger, physical stores, internal transfers, department issues, and inventory operations.
          </p>
        </div>

        {/* Quick Actions Component */}
        <InventoryQuickActions
          permissions={permissions}
          onOpenManageStores={() => setIsStoreModalOpen(true)}
        />
      </div>

      {/* Store Management Controlled Modal */}
      <StoreManagementModal
        stores={storesData.summaries}
        isOpen={isStoreModalOpen}
        onClose={() => setIsStoreModalOpen(false)}
      />

      {/* Operational KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Stock Valuation */}
        <AdminKpiCard
          label="Total Stock Valuation"
          value={`₹${kpiData.totalStockValue.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          icon={IndianRupee}
          variant="forest"
          subtext="Moving WAC authoritative valuation"
        />

        {/* 2. Items in Stock */}
        <AdminKpiCard
          label="Items in Stock"
          value={kpiData.itemsInStock}
          icon={Boxes}
          variant="champagne"
          subtext="Active catalog items on hand"
        />

        {/* 3. Pending Stock Requests */}
        <AdminKpiCard
          label="Pending Requests"
          value={kpiData.pendingRequestsCount}
          icon={Clock}
          variant={kpiData.pendingRequestsCount > 0 ? 'alert' : 'neutral'}
          subtext={
            kpiData.pendingRequestsCount > 0
              ? 'Awaiting approval or issue'
              : 'All requisitions up to date'
          }
        />

        {/* 4. Stock Health / Low Stock Items */}
        <AdminKpiCard
          label="Low Stock Items"
          value={kpiData.lowStockCount}
          icon={AlertTriangle}
          variant={kpiData.lowStockCount > 0 ? 'alert' : 'olive'}
          subtext={
            kpiData.lowStockCount > 0
              ? 'Items at or below reorder level'
              : 'All stocks above reorder level'
          }
        />
      </div>

      {/* Operations Section 1: Pending Stock Requests */}
      <section aria-label="Pending Stock Requests">
        <PendingStockRequestsSection
          requests={pendingRequests}
          canApproveOrIssue={permissions.canIssue || permissions.canTransfer}
        />
      </section>

      {/* Operations Section 2: Physical Stores Overview */}
      <section aria-label="Physical Stores">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-base font-bold text-resort-charcoal">
                Physical Stores Overview
              </h3>
              <span className="text-xs text-stone-600 font-mono">
                ({storesData.cards.length} active stores)
              </span>
            </div>
            <p className="text-xs text-stone-600">
              Select any store to inspect its specific item stock levels and balances.
            </p>
          </div>

          {permissions.canManageStores && (
            <button
              onClick={() => setIsStoreModalOpen(true)}
              className="text-xs font-semibold text-resort-forest hover:underline inline-flex items-center gap-1"
            >
              <Warehouse className="w-3.5 h-3.5" />
              Manage Stores →
            </button>
          )}
        </div>

        <PhysicalStoresGrid stores={storesData.cards} />
      </section>

      {/* Operations Section 3: Stock Health (Only shown if items have reorder thresholds configured) */}
      {stockHealthItems.length > 0 && (
        <section aria-label="Stock Health & Thresholds">
          <StockHealthSection items={stockHealthItems} />
        </section>
      )}

      {/* Operations Section 4: Authoritative Stock Movement Ledger */}
      <section aria-label="Authoritative Stock Movement Ledger">
        <div className="bg-white rounded-lg border border-border/80 shadow-2xs p-5 space-y-4">
          <div>
            <h3 className="font-serif text-base font-bold text-resort-charcoal">
              Authoritative Stock Movement Ledger
            </h3>
            <p className="text-xs text-stone-600 mt-0.5">
              Append-only historical transaction log with real-time before and after balance tracking.
            </p>
          </div>

          <AuthoritativeStockLedgerTable
            movements={recentMovements}
            stores={storesData.options}
          />
        </div>
      </section>
    </div>
  );
}
