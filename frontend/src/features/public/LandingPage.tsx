import { LayoutDashboard, LogIn, Mail, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { Button } from "../../components/Button";

/**
 * `/` — Public informational page (Phase D, §9).
 * Anonymous visitors see a static informational page with no item data.
 * Authenticated visitors see a dashboard shortcut instead of a sign-in prompt.
 */
export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col items-center gap-6 py-12 text-center sm:py-16">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
          CNCS Property Management System
        </h1>
        <p className="max-w-2xl text-lg text-slate-600">
          A property register for CNCS — tracking university-owned equipment and assets.
        </p>

        {user ? (
          <Link to="/dashboard">
            <Button size="lg" leftIcon={<LayoutDashboard className="h-5 w-5" />}>
              Go to Dashboard
            </Button>
          </Link>
        ) : (
          <Link to="/login">
            <Button size="lg" leftIcon={<LogIn className="h-5 w-5" />}>
              Sign in
            </Button>
          </Link>
        )}
      </section>

      <section className="grid gap-8 sm:grid-cols-3">
        <InfoCard
          icon={<MapPin className="h-8 w-8" />}
          title="Who can use this"
          description="Staff, department heads, property officers, and auditors with a CNCS account can access the system to track and manage university property."
        />
        <InfoCard
          icon={user ? <LayoutDashboard className="h-8 w-8" /> : <LogIn className="h-8 w-8" />}
          title={user ? "Your Workspace" : "How to get an account"}
          description={
            user
              ? "You are currently signed in. Head over to your dashboard to view your assigned items, manage requests, or perform inventory tasks."
              : "Contact your department head or the Property Office to request an account. All accounts require approval from your department head."
          }
        />
        <InfoCard
          icon={<Mail className="h-8 w-8" />}
          title="Contact the Property Office"
          description="For questions about the system, lost items, or account access, reach out to the CNCS Property Office."
        />
      </section>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      </div>
    </div>
  );
}
