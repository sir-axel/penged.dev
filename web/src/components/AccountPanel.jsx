import { useState } from "react";
import { LogOut, Trash2 } from "lucide-react";
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
  let { logout } = useAuth(),
    [deleting, setDeleting] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="space-y-3">
      <section className="border border-border bg-card p-4">
        <h2 className="font-display text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">
          Account
        </h2>
        <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{email}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => logout(true)}
            className="inline-flex min-h-10 items-center gap-1.5 border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </section>
      <section className="border border-destructive/40 bg-destructive/5 p-4">
        <h2 className="font-display text-[0.55rem] uppercase tracking-[0.16em] text-destructive">
          Delete account
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Removes your profile, your ladder spot, open challenges and any result still waiting on
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
                This cannot be undone. You will lose your rating, level and ladder position.
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
