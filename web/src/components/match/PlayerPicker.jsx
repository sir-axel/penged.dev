import { useState, useMemo } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { playerName } from "@/lib/ladder";
import { Avatar } from "@/components/Avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PlayerPicker({
  label: label,
  players = [],
  value: value,
  onChange: onChange,
  excludeIds = [],
}) {
  let [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    selected = players.find((e) => e.id === value),
    filtered = useMemo(() => {
      let e = new Set(excludeIds.filter(Boolean)),
        n = query.trim().toLowerCase();
      return players
        .filter((t) => !e.has(t.id))
        .filter(
          (e) =>
            !n ||
            playerName(e).toLowerCase().includes(n) ||
            String(e.username || "")
              .toLowerCase()
              .includes(n),
        )
        .slice(0, 60);
    }, [players, excludeIds, query]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] w-full items-center gap-2.5 rounded-sm border border-input bg-card px-3 py-2 text-left transition-colors hover:border-foreground/40"
      >
        {selected ? (
          <>
            <Avatar name={playerName(selected)} src={selected.avatar_url} size={26} />
            <span className="min-w-0 flex-1 truncate font-heading text-sm font-medium">
              {playerName(selected)}
            </span>
          </>
        ) : (
          <span className="flex-1 text-sm text-muted-foreground">{label || "Choose a player"}</span>
        )}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          // Phones: a bottom sheet sized to the visible screen, so the list (not the page behind) scrolls.
          // Touch devices don't auto-focus search: that popped the keyboard and moved the sheet off-screen.
          onOpenAutoFocus={(e) => {
            if (window.matchMedia?.("(pointer: coarse)").matches) e.preventDefault();
          }}
          className="bottom-0 top-auto flex max-h-[85dvh] translate-y-0 flex-col gap-0 rounded-t-lg p-0 data-[state=open]:slide-in-from-top-[100%] sm:bottom-auto sm:top-[50%] sm:max-h-[80vh] sm:max-w-md sm:translate-y-[-50%] sm:data-[state=open]:slide-in-from-top-[48%]"
        >
          <DialogHeader className="border-b border-border px-4 py-3 text-left">
            <DialogTitle className="font-heading text-base">
              {label || "Choose a player"}
            </DialogTitle>
          </DialogHeader>
          <div className="border-b border-border px-4 py-2.5">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search players"
                aria-label="Search players"
                className="h-11 w-full rounded-sm border border-input bg-background pl-9 pr-3 text-base outline-none focus:border-foreground/40 lg:text-sm"
              />
            </div>
          </div>
          <ul className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain py-1 pb-[env(safe-area-inset-bottom)]">
            {filtered.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => {
                    (onChange(e.id), setOpen(false), setQuery(""));
                  }}
                  className={`flex min-h-[52px] w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-secondary ${value === e.id ? "bg-secondary" : ""}`}
                >
                  <Avatar name={playerName(e)} src={e.avatar_url} size={30} player={e} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading text-sm font-medium">
                      {playerName(e)}
                    </span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {"rank "}
                      {e.singles_rank || "—"}
                      {" · "}
                      {e.singles_rating || 1400}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {!filtered.length && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                No players found.
              </li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
