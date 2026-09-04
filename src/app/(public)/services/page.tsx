import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function Page() {
  return (
    <div className="container mx-auto px-6 py-16">
      <div className="max-w-3xl mb-12">
        <h1 className="font-serif text-3xl sm:text-4xl text-resort-charcoal font-semibold mb-3">
          Resort Services & Experiences
        </h1>
        <p className="text-base text-resort-stone">
          Ayurvedic wellness spa, jungle safaris, and concierge assistance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resort Services & Experiences</CardTitle>
          <CardDescription>Resort & PMS Architecture Phase 0.1 Foundation</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-resort-stone">
            This module route is established within the <code>(public)</code> route group. The full database-driven model and transactional business actions will integrate in subsequent phases.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}