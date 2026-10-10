import { SearchX } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { useAuth } from "../../app/AuthContext";

/**
 * Catch-all for any unmatched path, and — deliberately — the same page a
 * role-scoped route renders for a viewer who can't use it (frontend-plan.md §8:
 * "there is no separate 'forbidden' page pretending to be a frontend-enforced
 * boundary the backend doesn't also enforce").
 */
export function NotFoundPage() {
  const { user } = useAuth();
  const homeHref = user ? "/dashboard" : "/";

  return (
    <ErrorState
      icon={<SearchX className="h-8 w-8" />}
      heading="Page not found"
      body="The page you're looking for doesn't exist, or isn't available to your account."
      action={
        <Link to={homeHref}>
          <Button variant="primary" size="sm">
            {user ? "Go to dashboard" : "Go home"}
          </Button>
        </Link>
      }
    />
  );
}
