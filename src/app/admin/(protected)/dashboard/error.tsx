'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AlertCircle, RotateCcw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DashboardError] Route error caught:', error);
  }, [error]);

  return (
    <div className="py-12 flex justify-center">
      <Card className="max-w-md w-full border-rose-200 shadow-sm">
        <CardHeader className="text-center pb-2">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <CardTitle className="font-serif text-xl text-resort-charcoal">
            Operations Dashboard Unavailable
          </CardTitle>
          <CardDescription className="text-xs text-resort-stone">
            A temporary service disruption prevented the operational management metrics from loading.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2 text-center">
          <p className="text-xs text-neutral-500">
            Operational data remains protected in the database. Please try refreshing or return to Front Desk.
          </p>
          <div className="flex justify-center gap-3">
            <Button
              onClick={() => reset()}
              size="sm"
              className="bg-resort-charcoal text-white hover:bg-neutral-800 text-xs font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Retry Loading
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => (window.location.href = '/admin/frontdesk')}
              className="text-xs"
            >
              Go to Front Desk
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
