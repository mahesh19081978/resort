import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Procurement, PO & GRN</h1>
        <p className="text-xs text-resort-stone mt-1">Purchase requests, vendor approvals, Goods Receipt Notes (GRN), partial deliveries, and vendor payables.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Procurement, PO & GRN Module Shell</CardTitle>
          <CardDescription>Phase 0.1 Architectural Foundation</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-resort-stone leading-relaxed">
            This module route is established within the operational Admin shell. In subsequent phases, full transactional workflows, Prisma queries, and domain actions will be plugged into this route.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}