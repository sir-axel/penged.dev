import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LoaderCircle, Lock, TriangleAlert } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";

const RequestNew = (
  <Link
    to="/forgot-password"
    className="inline-flex min-h-10 items-center text-primary font-medium hover:underline"
  >
    Request a new link
  </Link>
);

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error"); // Better Auth sends ?error=INVALID_TOKEN for bad/expired links
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [badToken, setBadToken] = useState(false);

  if (!token || linkError || badToken) {
    return (
      <AuthShell
        icon={TriangleAlert}
        title="Link expired or invalid"
        subtitle="Reset links work once and for one hour"
        footer={RequestNew}
      >
        <p className="text-sm text-foreground text-center">
          This password reset link can't be used any more. Request a new one and try again.
        </p>
      </AuthShell>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match");
    setLoading(true);
    try {
      await api.auth.resetPassword({ token, newPassword: password });
      window.location.href = "/login?reset=1";
    } catch (err) {
      if (/token/i.test(err.message || "")) setBadToken(true);
      else setError(err.message || "Failed to reset password");
      setLoading(false);
    }
  };

  return (
    <AuthShell icon={Lock} title="New password" subtitle="Choose a new password for your account">
      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              minLength={8}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat it"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Set new password"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
