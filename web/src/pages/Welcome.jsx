import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { api } from "@/api/client";
import { browserTimeZone } from "@/lib/ladder";

export function Welcome() {
  let navigate = useNavigate(),
    queryClient = useQueryClient(),
    { player: existing } = useMyPlayer(),
    [username, setUsername] = useState(
      () => new URLSearchParams(window.location.search).get("username") || "",
    ),
    [displayName, setDisplayName] = useState(""),
    [avatarUrl, setAvatarUrl] = useState(""),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [submitting, setSubmitting] = useState(false);
  // Already claimed a username: nothing to do here.
  if (existing && !submitting) return <Navigate to="/" replace />;
  return (
    <>
      <PageHeader
        eyebrow="Step 1 of 1"
        title="Claim your spot on the ladder"
        description="Your username becomes your public profile at penged.dev. Your email stays private."
      />
      <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
        <form
          onSubmit={async (r) => {
            (r.preventDefault(), setError(""), setSubmitting(true));
            try {
              let r = await api.functions.invoke("createPlayer", {
                username: username.trim(),
                display_name: displayName.trim() || username.trim(),
                avatar_url: avatarUrl,
                timezone: browserTimeZone(),
              });
              if (r.data?.error) throw Error(r.data.error);
              (await queryClient.invalidateQueries({
                queryKey: ["my-player"],
              }),
                await queryClient.invalidateQueries({
                  queryKey: ["players"],
                }),
                navigate("/", {
                  replace: true,
                }));
            } catch (e) {
              setError(e.response?.data?.error || e.message || "Could not create your profile.");
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-5"
        >
          <div className="flex items-center gap-4">
            <Avatar name={displayName || username || "?"} src={avatarUrl} size={64} />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/40">
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Add photo"}
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
                      setAvatarUrl(e);
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
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. topspin_tom"
              autoComplete="username"
              maxLength={20}
              className="h-12 rounded-sm"
              required
            />
            <p className="text-xs text-muted-foreground">
              3–20 characters. Letters, numbers, dots, dashes or underscores.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Optional — how your name shows on the ladder"
              maxLength={40}
              className="h-12 rounded-sm"
            />
          </div>
          {error && (
            <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="h-12 w-full rounded-sm"
            disabled={submitting || uploading}
          >
            {submitting && (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Create my profile
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Your photo is stored publicly — anyone with the link can open it.
          </p>
        </form>
      </div>
    </>
  );
}
