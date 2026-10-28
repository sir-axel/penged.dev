export function PageHeader({
  eyebrow: eyebrow,
  title: title,
  description: description,
  action: action,
}) {
  return (
    <div className="border-b border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-7 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-10">
        <div>
          {eyebrow && (
            <p className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-brand">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
    </div>
  );
}
