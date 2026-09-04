import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Physical Rooms & Room Types</h1>
        <p className="text-xs text-resort-stone mt-1">Configure room types (Standard, Deluxe, Villa) and physical rooms (e.g. S-101..S-110) with dynamic amenities.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Physical Rooms & Room Types Module Shell</CardTitle>
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