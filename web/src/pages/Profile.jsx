import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, LoaderCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { formatRecord, playerName } from "@/lib/ladder";
import { LevelBar } from "@/components/LevelBar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AccountPanel } from "@/components/AccountPanel";
import { CountBadge, useNewFeedbackCount } from "@/hooks/useFeedbackCount";
import { feedbackHref } from "@/pages/Feedback";
import { api } from "@/api/client";

export function Profile() {
  let { user } = useAuth(),
    newFeedback = useNewFeedbackCount(),
    { player, refetch: refetch } = useMyPlayer(),
    queryClient = useQueryClient(),
    [form, setForm] = useState({
      username: "",
      display_name: "",
      bio: "",
      avatar_url: "",
    }),
    [saving, setSaving] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    player &&
      setForm({
        username: player.username || "",
        display_name: player.display_name || "",
        bio: player.bio || "",
        avatar_url: player.avatar_url || "",
      });
  }, [player?.id]);
  let setField = (e, t) => {
    (setForm((n) => ({
      ...n,
      [e]: t,
    })),
      setSaved(false));
  };
  return player ? (
    <>
      <PageHeader
        eyebrow="Account"
        title="My profile"
        description="Your username and photo are public. Your email is never shown."
      />
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6">
        <section className="rounded-sm border border-border bg-card p-4">
          <div className="flex items-center gap-4">
            <Avatar name={playerName(player)} src={form.avatar_url} size={64} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-lg font-semibold">{playerName(player)}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {"rank "}
                {player.singles_rank || "—"}
                {" · "}
                {player.singles_rating}
                {" singles ·"} {formatRecord(player.singles_wins, player.singles_losses)}
              </p>
            </div>
            <Link
              to={`/players/${player.username}`}
              className="inline-flex min-h-10 shrink-0 items-center rounded-sm border border-border px-3 py-1.5 text-xs font-medium sm:min-h-0 sm:px-2.5 hover:border-foreground/40"
            >
              View
            </Link>
          </div>
          <div className="mt-4">
            <LevelBar xp={player.xp || 0} />
          </div>
        </section>
        <form
          onSubmit={async (e) => {
            (e.preventDefault(), setSaving(true), setError(""));
            try {
              let e = await api.functions.invoke("updatePlayer", form);
              if (e.data?.error) throw Error(e.data.error);
              (await refetch(),
                queryClient.invalidateQueries({
                  queryKey: ["players"],
                }),
                setSaved(true));
            } catch (e) {
              setError(e.response?.data?.error || e.message || "Could not save your profile.");
            } finally {
              setSaving(false);
            }
          }}
          className="space-y-4"
        >
          <div className="flex items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/40">
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              {uploading ? "Uploading…" : "Change photo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  let t = e.target.files?.[0];
                  if (t) {
                    (setUploading(true), setError(""));
                    try {
                      let { file_url: e } = await api.uploadPublicFile(t);
                      setForm((t) => ({
                        ...t,
                        avatar_url: e,
                      }));
                    } catch (e) {
                      setError(e.message || "Could not upload that image.");
                    } finally {
                      setUploading(false);
                    }
                  }
                }}
                disabled={uploading}
              />
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={form.username}
              onChange={(e) => setField("username", e.target.value)}
              className="h-12 rounded-sm"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              value={form.display_name}
              onChange={(e) => setField("display_name", e.target.value)}
              className="h-12 rounded-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <textarea
              id="bio"
              value={form.bio}
              onChange={(e) => setField("bio", e.target.value)}
              rows={3}
              maxLength={280}
              placeholder="Paddle of choice, signature shot, trash talk."
              className="w-full rounded-sm border border-input bg-card px-3 py-2 text-base outline-none focus:border-foreground/40 sm:text-sm"
            />
          </div>
          {error && (
            <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {saved && (
            <p className="rounded-sm border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              Profile saved.
            </p>
          )}
          <Button type="submit" disabled={saving || uploading} className="h-12 w-full rounded-sm">
            {saving && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Save changes
          </Button>
        </form>
        <section className="space-y-3 border-t border-border pt-5">
          <div className="flex flex-wrap gap-2">
            <Link
              to="/matches"
              className="inline-flex min-h-10 items-center rounded-sm border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/40"
            >
              My matches
            </Link>
            {user?.role === "admin" && (
              <Link
                to="/admin/reviews"
                className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/40"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Review queue
              </Link>
            )}
            {user?.role === "admin" && (
              <Link
                to="/admin/feedback"
                className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/40"
              >
                Feedback inbox
                <CountBadge n={newFeedback} />
              </Link>
            )}
            <Link
              to={feedbackHref("/profile")}
              className="inline-flex min-h-10 items-center rounded-sm border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/40"
            >
              Send feedback
            </Link>
          </div>
          <AccountPanel email={user?.email} />
          <p className="text-xs text-muted-foreground">
            Your photo is stored publicly — anyone with the link can open it.
          </p>
        </section>
      </div>
    </>
  ) : null;
}
