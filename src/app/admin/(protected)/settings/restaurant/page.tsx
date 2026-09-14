'use client';

import { useState, useEffect, useCallback } from 'react';
import { getRestaurantSettingsAction, updateRestaurantSettingsAction } from '@/actions/settings';
import { SettingsTabNav } from '@/components/admin/settings/SettingsTabNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { UtensilsCrossed } from 'lucide-react';

type Restaurant = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  openingTime: string | null;
  closingTime: string | null;
  isActive: boolean;
};

export default function RestaurantSettingsPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    phone: '',
    email: '',
    openingTime: '',
    closingTime: '',
    isActive: true,
  });

  const fetchRestaurant = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getRestaurantSettingsAction();
    if (result.success && result.data) {
      const r = result.data as Restaurant;
      setRestaurant(r);
      setForm({
        name: r.name,
        description: r.description || '',
        phone: r.phone || '',
        email: r.email || '',
        openingTime: r.openingTime || '',
        closingTime: r.closingTime || '',
        isActive: r.isActive,
      });
    } else {
      setError(result.error || 'Failed to load restaurant settings');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRestaurant();
  }, [fetchRestaurant]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const result = await updateRestaurantSettingsAction({
      id: restaurant.id,
      ...form,
    });
    setSaving(false);
    if (result.success) {
      setSuccess('Restaurant settings saved successfully');
      fetchRestaurant();
    } else {
      setError(result.error || 'Failed to save');
    }
  };

  return (
    <div className="space-y-6">
      <SettingsTabNav />

      <div>
        <h2 className="text-lg font-semibold text-resort-charcoal">Restaurant Settings</h2>
        <p className="text-xs text-resort-stone">
          Configure the restaurant profile, operating hours, and contact information. Tax configuration for menu items is managed through the Tax Configuration section.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-resort-stone text-xs">
            Loading restaurant settings...
          </CardContent>
        </Card>
      ) : error && !restaurant ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-xs text-red-600 mb-2">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchRestaurant} className="text-xs">Retry</Button>
          </CardContent>
        </Card>
      ) : restaurant ? (
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UtensilsCrossed className="h-4 w-4 text-orange-600" />
                Restaurant Profile
              </CardTitle>
              <CardDescription className="text-xs">
                Basic restaurant configuration. Menu items and their tax rates are managed through the Menu Management section.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded bg-red-50 border border-red-200 p-3">
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
              {success && (
                <div className="rounded bg-emerald-50 border border-emerald-200 p-3">
                  <p className="text-xs text-emerald-700">{success}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Restaurant Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Code</label>
                  <input
                    type="text"
                    disabled
                    value={restaurant.code}
                    className="w-full rounded border border-resort-sand bg-stone-50 px-3 py-2 text-xs font-mono text-resort-stone cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional description"
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Restaurant phone"
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="Restaurant email"
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Opening Time</label>
                  <input
                    type="time"
                    value={form.openingTime}
                    onChange={(e) => setForm({ ...form, openingTime: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Closing Time</label>
                  <input
                    type="time"
                    value={form.closingTime}
                    onChange={(e) => setForm({ ...form, closingTime: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="rounded border-resort-sand text-resort-forest focus:ring-resort-gold"
                />
                <span className="text-xs font-semibold text-resort-charcoal">Active</span>
              </label>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="primary" size="sm" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      ) : null}
    </div>
  );
}
