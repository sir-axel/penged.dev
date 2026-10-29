import { useState } from "react";
import { Link } from "react-router-dom";
import { LogIn, LoaderCircle, Lock, Mail } from "lucide-react";
import { getReturnTo } from "@/lib/returnTo";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { api } from "@/api/client";

export function Login() {
  let [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    returnTo = getReturnTo();
  return (
    <AuthShell
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
        <>
          Don't have an account?{" "}
          <Link
            to={"/register" + (returnTo === "/" ? "" : "?returnTo=" + encodeURIComponent(returnTo))}
            className="inline-block py-2.5 text-primary font-medium hover:underline sm:py-0"
          >
            Create one
          </Link>
        </>
      }
    >
      {new URLSearchParams(window.location.search).get("reset") === "1" && !error && (
        <div role="status" className="mb-4 p-3 rounded-sm bg-success/10 text-success text-sm">
          Password updated. Log in with your new password.
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-sm bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form
        onSubmit={async (t) => {
          (t.preventDefault(), setError(""), setLoading(true));
          try {
            (await api.auth.login(email, password),
              (window.location.href = returnTo));
          } catch (e) {
            setError(e.message || "Invalid email or password");
          } finally {
            setLoading(false);
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="inline-flex min-h-10 items-center text-sm text-primary underline-offset-2 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
