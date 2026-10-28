import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LoaderCircle, Lock, TriangleAlert } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";

export function ResetPassword() {
  let [params] = useSearchParams(),
    token = params.get("token"),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  return token ? (
    <AuthShell icon={Lock} title="New password" subtitle="Enter your new password below">
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form
        onSubmit={async (e) => {
          if ((e.preventDefault(), setError(""), password !== confirm)) {
            setError("Passwords do not match");
            return;
          }
          setLoading(true);
          try {
            (await api.auth.resetPassword({
              token,
              newPassword: password,
            }),
              (window.location.href = "/login"));
          } catch (e) {
            setError(e.message || "Failed to reset password");
          } finally {
            setLoading(false);
          }
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
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
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
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
              Resetting...
            </>
          ) : (
            "Reset password"
          )}
        </Button>
      </form>
    </AuthShell>
  ) : (
    <AuthShell
      icon={TriangleAlert}
      title="Invalid reset link"
      subtitle="This password reset link is missing or invalid"
      footer={
        <Link to="/forgot-password" className="text-primary font-medium hover:underline">
          Request a new link
        </Link>
      }
    >
      <p className="text-sm text-foreground text-center">
        The link you used appears to be incomplete. Please request a new password reset email.
      </p>
    </AuthShell>
  );
}
