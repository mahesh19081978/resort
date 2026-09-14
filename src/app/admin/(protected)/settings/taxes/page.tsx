'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTaxesAction } from '@/actions/settings';
import { SettingsTabNav } from '@/components/admin/settings/SettingsTabNav';
import { TaxForm, TaxListItem, getTaxStatus, type Tax } from '@/components/admin/settings/TaxConfig';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, RefreshCw } from 'lucide-react';

export default function TaxesSettingsPage() {
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTax, setEditingTax] = useState<Tax | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'room' | 'restaurant' | 'service' | 'other'>('all');

  const fetchTaxes = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getTaxesAction();
    if (result.success) {
      setTaxes(result.data || []);
    } else {
      setError(result.error || 'Failed to load taxes');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTaxes();
  }, [fetchTaxes]);

  const filteredTaxes = taxes.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'active') return t.isActive;
    return t.scope.toLowerCase() === filter;
  });

  const activeCount = taxes.filter((t) => t.isActive).length;
  const now = new Date();
  const effectiveCount = taxes.filter((t) => {
    if (!t.isActive) return false;
    const from = t.effectiveFrom ? new Date(t.effectiveFrom) : null;
    const to = t.effectiveTo ? new Date(t.effectiveTo) : null;
    if (from && from > now) return false;
    if (to && to <= now) return false;
    return true;
  }).length;

  return (
    <div className="space-y-6">
      <SettingsTabNav />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-resort-charcoal">Tax Configuration</h2>
          <p className="text-xs text-resort-stone">
            Create and manage tax rules by scope. Taxes must be active and within effective dates to be applied.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchTaxes} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setEditingTax(null); setShowForm(true); }}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Create Tax
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-resort-sand bg-white p-3 text-center">
          <div className="text-[10px] font-semibold text-resort-stone uppercase">Total</div>
          <div className="text-xl font-bold font-serif text-resort-charcoal mt-1">{taxes.length}</div>
        </div>
        <div className="rounded-lg border border-resort-sand bg-white p-3 text-center">
          <div className="text-[10px] font-semibold text-resort-stone uppercase">Active</div>
          <div className="text-xl font-bold font-serif text-emerald-600 mt-1">{activeCount}</div>
        </div>
        <div className="rounded-lg border border-resort-sand bg-white p-3 text-center">
          <div className="text-[10px] font-semibold text-resort-stone uppercase">Effective Now</div>
          <div className="text-xl font-bold font-serif text-resort-forest mt-1">{effectiveCount}</div>
        </div>
        <div className="rounded-lg border border-resort-sand bg-white p-3 text-center">
          <div className="text-[10px] font-semibold text-resort-stone uppercase">Scopes</div>
          <div className="text-xl font-bold font-serif text-resort-gold mt-1">
            {new Set(taxes.map((t) => t.scope)).size}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['all', 'active', 'room', 'restaurant', 'service', 'other'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-resort-forest text-resort-ivory'
                : 'bg-resort-sand/50 text-resort-charcoal hover:bg-resort-sand'
            }`}
          >
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-resort-stone text-xs">Loading taxes...</div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-xs text-red-600 mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchTaxes} className="text-xs">
                Retry
              </Button>
            </div>
          ) : filteredTaxes.length === 0 ? (
            <div className="p-8 text-center text-resort-stone text-xs">
              {taxes.length === 0
                ? 'No tax configurations found. Create one to get started.'
                : 'No taxes match the selected filter.'}
            </div>
          ) : (
            <div className="divide-y divide-resort-sand/50">
              {filteredTaxes.map((tax) => (
                <TaxListItem
                  key={tax.id}
                  tax={tax}
                  onEdit={() => { setEditingTax(tax); setShowForm(true); }}
                  onDeleted={fetchTaxes}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <TaxForm
          tax={editingTax}
          onClose={() => { setShowForm(false); setEditingTax(null); }}
          onSaved={() => { setShowForm(false); setEditingTax(null); fetchTaxes(); }}
        />
      )}
    </div>
  );
}
