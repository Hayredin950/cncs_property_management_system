import { LayoutDashboard, LogIn, LogOut } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { cn } from "../../lib/cn";
import { Button } from "../Button";
import { RoleBadge } from "../StatusBadges";

export interface HeaderAccountBlockProps {
  /**
   * `bar` is the compact control that sits in the header row; `drawer` is the full
   * account card that sits at the foot of the mobile drawer.
   */
  variant: "bar" | "drawer";
  className?: string;
}

/**
 * Everything the header says about *who you are* — in one component, in both
 * shells.
 *
 * It used to be written twice and differently. `PublicLayout` (landing, scan,
 * login, `*`) put a Dashboard button in the bar and a name + role chip + Dashboard
 * + Sign out in the drawer; `AppLayout` (the authenticated workbench) put the bare
 * name in the bar and *nothing* in the drawer, so the same hamburger offered a
 * different menu depending on which page you were standing on. Two surfaces that
 * both claim to be "the menu" and disagree is the kind of inconsistency a user
 * reads as a bug, because it is one.
 *
 * The rule that resolves it, kept from the original intent: **one control in the
 * bar, the whole account in the drawer.** The bar is a `justify-between` row with a
 * fixed-width lockup, so every control added there squeezes the university wordmark
 * on a phone — hence exactly one trailing control, whatever the state. The drawer
 * has room, so the account lives there in full: who you are (name, email, role),
 * then where you can go (Dashboard), then how to leave (Sign out).
 *
 * Reading auth from the context rather than taking props keeps the two shells from
 * having to thread the same four values through, which is how they drifted apart in
 * the first place.
 */
export function HeaderAccountBlock({ variant, className }: HeaderAccountBlockProps) {
  const { user, status, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // A stored token mid-rehydration: rendering "Sign in" here would flash a signed-in
  // user the wrong control for one frame.
  if (status === "loading") return null;

  // On the login page the CTA would navigate to the page it is already on, and a
  // second "Sign in" next to the form's own submit button is just noise.
  const onLoginPage = location.pathname === "/login";

  if (variant === "bar") {
    return user ? (
      <Button
        variant="outline"
        size="sm"
        leftIcon={<LayoutDashboard className="h-4 w-4" />}
        onClick={() => navigate("/dashboard")}
        className={className}
      >
        {/* The label is what gets dropped on a phone, never the control: the
            sidebar and the drawer both name the destination already. */}
        <span className="hidden sm:inline">Dashboard</span>
      </Button>
    ) : onLoginPage ? null : (
      /*
        Shorter than the admission portal's "Student / Staff Sign In" and shaped
        like the site's own pill CTAs rather than the base rounded rectangle — on a
        phone this is the only trailing control, so it has to earn its width instead
        of elbowing the wordmark.
      */
      <Button
        size="sm"
        className={cn("rounded-full px-5 shadow-sm", className)}
        leftIcon={<LogIn className="h-4 w-4" />}
        onClick={() => navigate("/login")}
      >
        Sign in
      </Button>
    );
  }

  if (!user) {
    if (onLoginPage) return null;
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <p className="px-1 text-sm text-aau-gray-600">
          Staff and administrators sign in to manage the register, file requests and run audits.
        </p>
        <Button fullWidth leftIcon={<LogIn className="h-4 w-4" />} onClick={() => navigate("/login")}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/*
        The identity card, and the reason the role chip moved here at all: on a
        phone the bar has room for one control, so "you are signed in as an Admin"
        needs a home with space for it. Bordered and tinted so it reads as a card
        rather than as three more menu rows.
      */}
      <div className="flex items-center gap-3 rounded-lg border border-aau-gray-200 bg-aau-gray-50 p-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white"
        >
          {initialsOf(user.fullName)}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-semibold text-aau-gray-900">{user.fullName}</span>
          <span className="truncate text-xs text-aau-gray-500">{user.email}</span>
          <RoleBadge role={user.role} className="self-start" />
        </span>
      </div>

      <Button
        variant="outline"
        fullWidth
        leftIcon={<LayoutDashboard className="h-4 w-4" />}
        onClick={() => navigate("/dashboard")}
      >
        Dashboard
      </Button>
      <Button variant="ghost" fullWidth leftIcon={<LogOut className="h-4 w-4" />} onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}

/**
 * At most two letters from the name — "Abebe Admin" → "AA".
 *
 * Initials, not an uploaded photo: there is no avatar column, no upload for one,
 * and a stock silhouette tells the user nothing. Falls back to the email's first
 * letter for a single-word or empty name, and to nothing at all rather than an
 * empty circle if both are missing.
 */
function initialsOf(fullName: string): string {
  const letters = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "");
  return letters.join("");
}
