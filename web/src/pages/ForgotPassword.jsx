import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LoaderCircle, Mail, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <AuthShell
      icon={sent ? MailCheck : Mail}
      title="Forgot password?"
      subtitle="Enter your email — we'll send a reset link"
      footer={
        <Link
          to="/login"
          className="inline-flex min-h-10 items-center gap-1 text-primary font-medium hover:underline"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden="true" />
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <div role="status" className="space-y-3 text-center text-sm text-foreground">
          <p>If an account exists for that email, a reset link is on its way.</p>
          <p className="text-muted-foreground">
            It can take a minute, and the link works for one hour. Check your spam folder if you
            don't see it.
          </p>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              await api.auth.forgotPassword(email.trim());
            } catch {
              // Same message either way: never reveal whether the address exists (or that we hit a limit).
            } finally {
              setLoading(false);
              setSent(true);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
