export const PRINCIPLES = [
  {
    tag: "01",
    title: "Every player signs off",
    body: "A win only counts once each participant accepts the submitted result. Doubles needs all four. Declined or disputed matches never touch your rating.",
  },
  {
    tag: "02",
    title: "Rating is not level",
    body: "Rating measures who you beat and moves only on verified results. Level is earned by showing up and playing — it never buys you rank.",
  },
  {
    tag: "03",
    title: "Challenges, not shortcuts",
    body: "You climb by beating the player above you. Ducking one costs rating and a place on the ladder, and ignoring it for 72 hours costs double.",
  },
];
export function HouseRules() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <h2 className="font-display text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground">
        House rules
      </h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {PRINCIPLES.map((e) => (
          <article className="pixel-frame rounded-sm border border-border bg-card p-4" key={e.tag}>
            <span className="font-mono text-[11px] text-brand">{e.tag}</span>
            <h3 className="mt-2 font-heading text-base font-semibold leading-tight">{e.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{e.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
