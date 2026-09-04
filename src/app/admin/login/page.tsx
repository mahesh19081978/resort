import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginAction } from '@/actions/auth';

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-resort-ivory p-6">
      <Card className="w-full max-w-md shadow-lg border-resort-sand">
        <CardHeader className="text-center space-y-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-resort-gold">
            Staff & Management
          </span>
          <CardTitle className="text-2xl font-serif text-resort-charcoal">The Royal Reserve</CardTitle>
          <CardDescription>Resort PMS, POS & Operations Portal</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-resort-stone">
                Email Address
              </label>
              <Input
                name="email"
                type="email"
                placeholder="admin@royalreserve.com"
                defaultValue="admin@royalreserve.com"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-resort-stone">
                Password
              </label>
              <Input
                name="password"
                type="password"
                placeholder="••••••••••••"
                defaultValue="password123"
                required
              />
            </div>
            <Button type="submit" className="w-full h-11 text-sm font-semibold">
              Sign In to Management Console
            </Button>
          </form>
          <div className="mt-6 text-center text-xs text-resort-stone">
            Authorized personnel only. All access attempts are logged and monitored.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}