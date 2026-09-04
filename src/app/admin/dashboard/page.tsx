import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BedDouble, CalendarCheck, UtensilsCrossed, Boxes, Users, DollarSign } from 'lucide-react';

export default function AdminDashboardPage() {
  const stats = [
    { title: 'Today Arrivals', value: '14', desc: '4 checked-in, 10 pending', icon: Users },
    { title: 'Occupancy Rate', value: '82%', desc: '37 of 45 physical rooms', icon: BedDouble },
    { title: 'Active Restaurant Tables', value: '9', desc: '3 KOTs preparing in kitchen', icon: UtensilsCrossed },
    { title: 'Store Low Stock Items', value: '3', desc: 'Below reorder threshold', icon: Boxes },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
          Operations Overview
        </h1>
        <p className="text-sm text-resort-stone mt-1">
          Real-time status across PMS, Front Desk, Restaurant POS, and Inventory.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, idx) => {
          const Icon = s.icon;
          return (
            <Card key={idx}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-resort-stone">
                  {s.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-resort-gold" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-resort-charcoal">{s.value}</div>
                <p className="text-xs text-resort-stone mt-1">{s.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Architecture Status</CardTitle>
            <CardDescription>Phase 0.1 Foundation Verification</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-resort-stone">
            <div className="flex justify-between py-1 border-b border-resort-sand/60">
              <span className="font-medium text-resort-charcoal">Next.js Version:</span>
              <span>16.3.3 (App Router)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-resort-sand/60">
              <span className="font-medium text-resort-charcoal">Database Engine:</span>
              <span>PostgreSQL / Neon via Prisma ORM</span>
            </div>
            <div className="flex justify-between py-1 border-b border-resort-sand/60">
              <span className="font-medium text-resort-charcoal">Authentication & RBAC:</span>
              <span>jose JWT + Granular centralized RBAC</span>
            </div>
            <div className="flex justify-between py-1 border-b border-resort-sand/60">
              <span className="font-medium text-resort-charcoal">Domain Separation:</span>
              <span>Reservation ≠ Stay ≠ Physical Room</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next Development Milestone</CardTitle>
            <CardDescription>Phase 0.2 Domain Model & ERD</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-resort-stone leading-relaxed">
            <p>
              This console provides the administrative shell for PMS operators, front desk staff, restaurant cashiers, kitchen displays, and inventory managers.
            </p>
            <p>
              Full operational schemas, transactions, webcam guest verification, and KOT lifecycles will be introduced in subsequent controlled phases.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}