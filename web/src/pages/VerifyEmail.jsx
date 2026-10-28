import { Link, useSearchParams } from "react-router-dom";
import { MailCheck, TriangleAlert } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { useAuth } from "@/context/AuthContext";

/** Landing page for the emailed verification link (Better Auth redirects here; ?error=... on failure). */
export function VerifyEmail() {
  const [params] = useSearchParams();
  const { user, isLoadingAuth } = useAuth();
  const failed = params.get("error") || params.get("done") !== "1";
  const home = (
    <Link
      to={user ? "/" : "/login"}
      className="inline-flex min-h-10 items-center text-primary font-medium hover:underline"
    >
      {user ? "Back to the board" : "Log in"}
    </Link>
  );
  if (failed) {
    return (
      <AuthShell
        icon={TriangleAlert}
        title="Couldn't verify your email"
        subtitle="The link is invalid or has expired"
        footer={home}
      >
        <p className="text-sm text-foreground text-center">
          {user
            ? "Open your profile and choose “Resend email” to get a fresh link."
            : "Log in, open your profile and choose “Resend email” to get a fresh link."}
        </p>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      icon={MailCheck}
      title="Email verified"
      subtitle={isLoadingAuth ? "One moment…" : "Thanks, your address is confirmed"}
      footer={home}
    >
      <p role="status" className="text-sm text-foreground text-center">
        You're all set. We can now reach you if you ever lose your password.
      </p>
    </AuthShell>
  );
}
