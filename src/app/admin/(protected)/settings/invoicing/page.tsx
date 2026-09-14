'use client';

import { useState, useEffect, useCallback } from 'react';
import { getInvoiceConfigAction, updateInvoiceConfigAction } from '@/actions/settings';
import { SettingsTabNav } from '@/components/admin/settings/SettingsTabNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FileText } from 'lucide-react';

type InvoiceConfig = {
  id: string;
  singletonKey: string;
  prefix: string;
  yearMonth: string;
  nextSequence: number;
  termsAndConditions: string | null;
  footerNote: string | null;
  showTaxBreakdown: boolean;
  showPaymentHistory: boolean;
};

export default function InvoiceSettingsPage() {
  const [config, setConfig] = useState<InvoiceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    prefix: '',
    termsAndConditions: '',
    footerNote: '',
    showTaxBreakdown: true,
    showPaymentHistory: true,
  });

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getInvoiceConfigAction();
    if (result.success && result.data) {
      const cfg = result.data as InvoiceConfig;
      setConfig(cfg);
      setForm({
        prefix: cfg.prefix,
        termsAndConditions: cfg.termsAndConditions || '',
        footerNote: cfg.footerNote || '',
        showTaxBreakdown: cfg.showTaxBreakdown,
        showPaymentHistory: cfg.showPaymentHistory,
      });
    } else {
      setError(result.error || 'Failed to load invoice configuration');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const result = await updateInvoiceConfigAction(form);
    setSaving(false);
    if (result.success) {
      setSuccess('Invoice configuration saved successfully');
      fetchConfig();
    } else {
      setError(result.error || 'Failed to save');
    }
  };

  return (
    <div className="space-y-6">
      <SettingsTabNav />

      <div>
        <h2 className="text-lg font-semibold text-resort-charcoal">Invoice Configuration</h2>
        <p className="text-xs text-resort-stone">
          Configure invoice prefix, terms and conditions, footer, and display options.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-resort-stone text-xs">
            Loading invoice configuration...
          </CardContent>
        </Card>
      ) : error && !config ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-xs text-red-600 mb-2">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchConfig} className="text-xs">Retry</Button>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-purple-600" />
                Invoice Settings
              </CardTitle>
              <CardDescription className="text-xs">
                These settings affect all future invoices. Existing invoices retain their original configuration.
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
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Invoice Prefix *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={form.prefix}
                    onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs font-mono text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold uppercase"
                  />
                  <p className="text-[10px] text-resort-stone mt-0.5">
                    Current sequence: {config?.nextSequence || 1} | Year-Month: {config?.yearMonth || 'N/A'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Terms and Conditions
                </label>
                <textarea
                  rows={4}
                  value={form.termsAndConditions}
                  onChange={(e) => setForm({ ...form, termsAndConditions: e.target.value })}
                  placeholder="Enter terms and conditions displayed on the invoice..."
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Footer Note
                </label>
                <textarea
                  rows={2}
                  value={form.footerNote}
                  onChange={(e) => setForm({ ...form, footerNote: e.target.value })}
                  placeholder="Footer note displayed at the bottom of the invoice..."
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold resize-y"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.showTaxBreakdown}
                    onChange={(e) => setForm({ ...form, showTaxBreakdown: e.target.checked })}
                    className="rounded border-resort-sand text-resort-forest focus:ring-resort-gold"
                  />
                  <span className="text-xs font-semibold text-resort-charcoal">Show Tax Breakdown</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.showPaymentHistory}
                    onChange={(e) => setForm({ ...form, showPaymentHistory: e.target.checked })}
                    className="rounded border-resort-sand text-resort-forest focus:ring-resort-gold"
                  />
                  <span className="text-xs font-semibold text-resort-charcoal">Show Payment History</span>
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="primary" size="sm" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}
