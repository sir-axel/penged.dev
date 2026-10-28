import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, LoaderCircle, Trash2 } from "lucide-react";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { validateGames } from "@/lib/validateGames";
import { PageHeader } from "@/components/PageHeader";
import { SegmentedControl } from "@/components/match/SegmentedControl";
import { Avatar } from "@/components/Avatar";
import { playerName } from "@/lib/ladder";
import { PaddleToggle } from "@/components/match/PaddleToggle";
import { PlayerPicker } from "@/components/match/PlayerPicker";
import { ScoreStepper } from "@/components/match/ScoreStepper";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";

export function NewMatch() {
  let navigate = useNavigate(),
    { player } = useMyPlayer(),
    [format, setFormat] = useState("singles"),
    [target, setTarget] = useState(11),
    [partnerId, setPartnerId] = useState(""),
    [opponentId, setOpponentId] = useState(""),
    [opponent2Id, setOpponent2Id] = useState(""),
    [paddles, setPaddles] = useState({}),
    [games, setGames] = useState([
      {
        a: "",
        b: "",
      },
      {
        a: "",
        b: "",
      },
    ]),
    [error, setError] = useState(""),
    [submitting, setSubmitting] = useState(false),
    { data: players = [] } = useQuery({
      queryKey: ["players"],
      queryFn: async () =>
        (
          await api.entities.Player.list({
            limit: 300,
          })
        ).items || [],
    }),
    paddleOf = (e) => paddles[e] || "default",
    setPaddle = (e, t) =>
      setPaddles((n) => ({
        ...n,
        [e]: t,
      })),
    filledGames = games.filter((e) => e.a !== "" && e.b !== ""),
    validation = useMemo(() => validateGames(filledGames, target), [filledGames, target]),
    updateGame = (e, t, n) => {
      setGames((r) =>
        r.map((r, i) =>
          i === e
            ? {
                ...r,
                [t]: n,
              }
            : r,
        ),
      );
    };
  return (
    <>
      <PageHeader
        eyebrow="New result"
        title="Record a match"
        description="Every player in the match has to confirm the result before it counts."
      />
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 pb-28 sm:px-6">
        <section className="space-y-2">
          <p className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
            Format
          </p>
          <SegmentedControl
            label="Match format"
            value={format}
            onChange={(e) => setFormat(e)}
            options={[
              {
                value: "singles",
                label: "Singles",
              },
              {
                value: "doubles",
                label: "Doubles",
              },
            ]}
          />
          <SegmentedControl
            label="Game target"
            value={target}
            onChange={(e) => setTarget(e)}
            options={[
              {
                value: 11,
                label: "To 11",
              },
              {
                value: 21,
                label: "To 21",
              },
            ]}
          />
        </section>
        <section className="space-y-2">
          <p className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
            Your side
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Paddle: <span className="font-medium text-foreground">Free</span> is a standard paddle,{" "}
            <span className="font-medium text-foreground">Paid</span> is one the player paid for.
            It's shown on the match and doesn't change ratings.
          </p>
          <div className="space-y-2 rounded-sm border border-border bg-card p-3">
            <div className="flex items-center gap-3">
              <Avatar name={playerName(player)} src={player?.avatar_url} size={30} />
              <span className="min-w-0 flex-1 truncate font-heading text-sm font-semibold">
                {player ? playerName(player) : "You"}
              </span>
              <PaddleToggle
                value={paddleOf(player?.id)}
                onChange={(e) => setPaddle(player?.id, e)}
              />
            </div>
            {format === "doubles" && (
              <div className="flex items-center gap-2 border-t border-border pt-2">
                <div className="min-w-0 flex-1">
                  <PlayerPicker
                    label="Pick your partner"
                    players={players}
                    value={partnerId}
                    onChange={setPartnerId}
                    excludeIds={[player?.id, opponentId, opponent2Id]}
                  />
                </div>
                <PaddleToggle
                  label="Partner paddle"
                  value={paddleOf(partnerId)}
                  onChange={(e) => setPaddle(partnerId, e)}
                />
              </div>
            )}
          </div>
        </section>
        <section className="space-y-2">
          <p className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
            Opponents
          </p>
          <div className="space-y-2 rounded-sm border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <PlayerPicker
                  label="Pick an opponent"
                  players={players}
                  value={opponentId}
                  onChange={setOpponentId}
                  excludeIds={[player?.id, partnerId, opponent2Id]}
                />
              </div>
              <PaddleToggle
                label="Opponent paddle"
                value={paddleOf(opponentId)}
                onChange={(e) => setPaddle(opponentId, e)}
              />
            </div>
            {format === "doubles" && (
              <div className="flex items-center gap-2 border-t border-border pt-2">
                <div className="min-w-0 flex-1">
                  <PlayerPicker
                    label="Pick the second opponent"
                    players={players}
                    value={opponent2Id}
                    onChange={setOpponent2Id}
                    excludeIds={[player?.id, partnerId, opponentId]}
                  />
                </div>
                <PaddleToggle
                  label="Second opponent paddle"
                  value={paddleOf(opponent2Id)}
                  onChange={(e) => setPaddle(opponent2Id, e)}
                />
              </div>
            )}
          </div>
        </section>
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
              Games
            </p>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {"to "}
              {target}
            </span>
          </div>
          <div className="space-y-2">
            {games.map((e, t) => (
              <div className="rounded-sm border border-border bg-card px-3 py-2.5" key={t}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    {"Game "}
                    {t + 1}
                  </span>
                  {games.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove game ${t + 1}`}
                      onClick={() => setGames((e) => e.filter((e, n) => n !== t))}
                      className="-mr-2.5 rounded-sm p-3 text-muted-foreground transition-colors hover:text-destructive sm:-mr-1.5 sm:p-2"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      You
                    </p>
                    <ScoreStepper
                      label={`Your score, game ${t + 1}`}
                      value={e.a}
                      onChange={(e) => updateGame(t, "a", e)}
                    />
                  </div>
                  <div className="flex flex-col items-end">
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      Them
                    </p>
                    <ScoreStepper
                      label={`Opponent score, game ${t + 1}`}
                      value={e.b}
                      onChange={(e) => updateGame(t, "b", e)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {games.length < 5 && (
            <button
              type="button"
              onClick={() =>
                setGames((e) => [
                  ...e,
                  {
                    a: "",
                    b: "",
                  },
                ])
              }
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-sm border border-dashed border-border px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add game
            </button>
          )}
        </section>
        {validation.ok && (
          <p className="rounded-sm border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            {"Your side wins "}
            {validation.gamesA}–{validation.gamesB}. Everyone will be asked to confirm.
          </p>
        )}
        {error && (
          <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="kb-bar fixed inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom))] z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:bottom-0">
        <div className="mx-auto max-w-2xl">
          <Button
            onClick={async () => {
              if ((setError(""), !player)) {
                setError("Create your player profile first.");
                return;
              }
              if (!opponentId || (format === "doubles" && (!partnerId || !opponent2Id))) {
                setError("Pick every player in the match.");
                return;
              }
              if (!validation.ok) {
                setError(validation.error);
                return;
              }
              let r = [
                {
                  player_id: player.id,
                  paddle: paddleOf(player.id),
                },
              ];
              format === "doubles" &&
                r.push({
                  player_id: partnerId,
                  paddle: paddleOf(partnerId),
                });
              let a = [
                {
                  player_id: opponentId,
                  paddle: paddleOf(opponentId),
                },
              ];
              (format === "doubles" &&
                a.push({
                  player_id: opponent2Id,
                  paddle: paddleOf(opponent2Id),
                }),
                setSubmitting(true));
              try {
                let t = await api.functions.invoke("submitMatch", {
                  format: format,
                  target: target,
                  side_a: r,
                  side_b: a,
                  games: filledGames.map((e) => ({
                    a: Number(e.a),
                    b: Number(e.b),
                  })),
                });
                if (t.data?.error) throw Error(t.data.error);
                navigate(`/matches/${t.data.match.id}`);
              } catch (e) {
                setError(e.response?.data?.error || e.message || "Could not submit that match.");
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={submitting}
            size="lg"
            className="h-12 w-full rounded-sm text-[15px]"
          >
            {submitting && (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Submit for sign-off
          </Button>
        </div>
      </div>
    </>
  );
}
