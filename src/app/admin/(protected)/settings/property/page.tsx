'use client';

import { useState, useEffect, useCallback } from 'react';
import { getPropertySettingsAction, updatePropertySettingsAction } from '@/actions/settings';
import { SettingsTabNav } from '@/components/admin/settings/SettingsTabNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Building } from 'lucide-react';

type Property = {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  contactPhone: string;
  contactEmail: string;
  website: string | null;
  gstin: string | null;
  logoUrl: string | null;
  currency: string;
  timezone: string;
  checkInTime: string;
  checkOutTime: string;
};

export default function PropertySettingsPage() {
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    contactPhone: '',
    contactEmail: '',
    website: '',
    gstin: '',
    logoUrl: '',
    currency: '',
    timezone: '',
    checkInTime: '',
    checkOutTime: '',
  });

  const fetchProperty = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getPropertySettingsAction();
    if (result.success && result.data) {
      const p = result.data as Property;
      setProperty(p);
      setForm({
        name: p.name,
        address: p.address,
        city: p.city,
        state: p.state,
        postalCode: p.postalCode,
        country: p.country,
        contactPhone: p.contactPhone,
        contactEmail: p.contactEmail,
        website: p.website || '',
        gstin: p.gstin || '',
        logoUrl: p.logoUrl || '',
        currency: p.currency,
        timezone: p.timezone,
        checkInTime: p.checkInTime,
        checkOutTime: p.checkOutTime,
      });
    } else {
      setError(result.error || 'Failed to load property settings');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProperty();
  }, [fetchProperty]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const result = await updatePropertySettingsAction(form);
    setSaving(false);
    if (result.success) {
      setSuccess('Property settings saved successfully');
      fetchProperty();
    } else {
      setError(result.error || 'Failed to save');
    }
  };

  return (
    <div className="space-y-6">
      <SettingsTabNav />

      <div>
        <h2 className="text-lg font-semibold text-resort-charcoal">Property Settings</h2>
        <p className="text-xs text-resort-stone">
          Configure resort property details, contact information, GSTIN, timezone, and check-in/out times.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-resort-stone text-xs">
            Loading property settings...
          </CardContent>
        </Card>
      ) : error && !property ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-xs text-red-600 mb-2">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchProperty} className="text-xs">Retry</Button>
          </CardContent>
        </Card>
      ) : property ? (
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building className="h-4 w-4 text-resort-forest" />
                Resort Property Configuration
              </CardTitle>
              <CardDescription className="text-xs">
                Enterprise resort address, contact numbers, GSTIN, and operational settings.
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
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Property Name *</label>
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
                    value={property.code}
                    className="w-full rounded border border-resort-sand bg-stone-50 px-3 py-2 text-xs font-mono text-resort-stone cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">Address *</label>
                <input
                  type="text"
                  required
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Postal Code *</label>
                  <input
                    type="text"
                    required
                    value={form.postalCode}
                    onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Country *</label>
                  <input
                    type="text"
                    required
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Contact Phone *</label>
                  <input
                    type="text"
                    required
                    value={form.contactPhone}
                    onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Contact Email *</label>
                  <input
                    type="email"
                    required
                    value={form.contactEmail}
                    onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Website</label>
                  <input
                    type="url"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://..."
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={form.gstin}
                    onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                    placeholder="29AAAAA0000A1Z5"
                    maxLength={15}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs font-mono text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Currency</label>
                  <input
                    type="text"
                    required
                    maxLength={3}
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs font-mono text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Timezone</label>
                  <input
                    type="text"
                    required
                    value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Check-In Time</label>
                  <input
                    type="time"
                    required
                    value={form.checkInTime}
                    onChange={(e) => setForm({ ...form, checkInTime: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">Check-Out Time</label>
                  <input
                    type="time"
                    required
                    value={form.checkOutTime}
                    onChange={(e) => setForm({ ...form, checkOutTime: e.target.value })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="primary" size="sm" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Property Settings'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      ) : null}
    </div>
  );
}
