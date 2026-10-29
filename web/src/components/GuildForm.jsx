import { useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuildBadge, GuildTag, GUILD_COLORS, guildColor } from "@/components/GuildBadge";

/** Create / edit a guild. `onSubmit(values)` returns a promise; its error message is shown under the form. */
export function GuildForm({ initial = {}, submitLabel, onSubmit, onCancel }) {
  const [name, setName] = useState(initial.name || "");
  const [tag, setTag] = useState(initial.tag || "");
  const [color, setColor] = useState(initial.color || "blue");
  const [description, setDescription] = useState(initial.description || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cleanTag = tag.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit({ name: name.trim(), tag: cleanTag, color, description: description.trim() });
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-3 rounded-sm border border-border bg-card p-3" aria-hidden="true">
        <GuildBadge color={color} size={36} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 font-heading text-base font-semibold">
            <GuildTag tag={cleanTag || "TAG"} color={color} />
            <span className="min-w-0 break-words">{name.trim() || "Your guild"}</span>
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Preview</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="guild-name">Name</Label>
        <Input id="guild-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required placeholder="Spin Doctors" className="h-10" />
        <p className="text-xs text-muted-foreground">3–24 characters. Has to be unique.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="guild-tag">Tag</Label>
        <Input
          id="guild-tag"
          value={cleanTag}
          onChange={(e) => setTag(e.target.value)}
          maxLength={4}
          required
          placeholder="SPN"
          autoCapitalize="characters"
          className="h-10 w-28 font-mono uppercase"
        />
        <p className="text-xs text-muted-foreground">2–4 letters or numbers. Shows next to every member's name.</p>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Badge color</legend>
        <div className="flex flex-wrap gap-2 pt-1">
          {GUILD_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              aria-label={c}
              aria-pressed={color === c}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-sm border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
              style={{ backgroundColor: guildColor(c) }}
            >
              {color === c && <Check className="h-4 w-4" style={{ color: "var(--guild-on)" }} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="guild-desc">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <textarea
          id="guild-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={140}
          rows={2}
          placeholder="Lunch-break regulars. All levels welcome."
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:text-sm"
        />
        <p className="text-right font-mono text-[10px] text-muted-foreground">{description.length}/140</p>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-sm bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center rounded-sm border border-border bg-secondary px-5 text-sm font-medium hover:bg-accent">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
