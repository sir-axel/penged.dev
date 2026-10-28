import { useState } from "react";
import { BadgeCheck, KeyRound, LoaderCircle, LogOut, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";

export function AccountPanel({ email }) {
  let { logout, user } = useAuth(),
    [sendingReset, setSendingReset] = useState(false),
    [notice, setNotice] = useState(""),
    [sendingVerify, setSendingVerify] = useState(false),
    [verifySent, setVerifySent] = useState(false),
    [deleting, setDeleting] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="space-y-3">
      <section className="border border-border bg-card p-4">
        <h2 className="font-display text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">
          Account
        </h2>
        <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
          {email}
          {user?.emailVerified && (
            <span className="ml-2 inline-flex items-center gap-1 text-success">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Verified
            </span>
          )}
        </p>
        {user && !user.emailVerified && (
          <div
            data-testid="verify-banner"
            className="mt-3 flex flex-wrap items-center justify-between gap-2 border border-border bg-secondary px-3 py-2"
          >
            <p className="text-[13px] text-foreground">
              {verifySent
                ? "Check your inbox for the verification link."
                : "Verify your email so you can recover your account."}
            </p>
            {!verifySent && (
              <button
                type="button"
                onClick={async () => {
                  (setSendingVerify(true), setError(""));
                  try {
                    await api.auth.sendVerificationEmail(email);
                    setVerifySent(true);
                  } catch (e) {
                    setError(e.message || "Could not send the verification email.");
                  } finally {
                    setSendingVerify(false);
                  }
                }}
                disabled={sendingVerify}
                className="inline-flex min-h-10 items-center border border-border bg-card px-3 text-sm font-medium hover:border-foreground/50 disabled:opacity-60"
              >
                {sendingVerify ? "Sending…" : "Resend email"}
              </button>
            )}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              (setSendingReset(true), setError(""), setNotice(""));
              try {
                await api.auth.forgotPassword(email);
                setNotice("Check your inbox for a link to change your password.");
              } catch (e) {
                setError(e.message || "Could not send the reset link.");
              } finally {
                setSendingReset(false);
              }
            }}
            disabled={sendingReset}
            className="inline-flex min-h-10 items-center gap-1.5 border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/50 disabled:opacity-60"
          >
            {sendingReset ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            )}
            Change password
          </button>
          <button
            type="button"
            onClick={() => logout(true)}
            className="inline-flex min-h-10 items-center gap-1.5 border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
        {notice && (
          <p role="status" className="mt-3 text-xs text-success">
            {notice}
          </p>
        )}
      </section>
      <section className="border border-destructive/40 bg-destructive/5 p-4">
        <h2 className="font-display text-[0.55rem] uppercase tracking-[0.16em] text-destructive">
          Delete account
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Removes your profile, your rank, open challenges and any result still waiting on
          your confirmation. Verified match history stays on the board.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-destructive/50 text-destructive"
            >
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Delete my account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This cannot be undone. You will lose your rating, level and rank.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep my account</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  (setDeleting(true), setError(""));
                  try {
                    let e = await api.functions.invoke("deleteAccount", {
                      confirm: "DELETE",
                    });
                    if (e.data?.error) throw Error(e.data.error);
                    logout(true);
                  } catch (e) {
                    (setError(
                      e.response?.data?.error || e.message || "Could not delete your account.",
                    ),
                      setDeleting(false));
                  }
                }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting…" : "Delete for good"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
      {error && (
        <p className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
