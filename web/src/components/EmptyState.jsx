export function EmptyState({ title, body: body, action: action }) {
  return (
    <div className="rounded-sm border border-dashed border-border bg-card/60 px-5 py-10 text-center">
      <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-sm border border-border bg-secondary">
        <span className="h-2 w-2 rounded-full bg-brand" />
      </div>
      <p className="font-heading text-base font-semibold">{title}</p>
      {body && (
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          {body}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
