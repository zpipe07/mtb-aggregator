export function EmptyState() {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-muted-foreground/45 bg-muted/25 px-6 py-12 text-center">
      <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {"// no results"}
      </p>
      <p className="font-mono text-sm text-muted-foreground">
        No deals found. Try adjusting filters or search.
      </p>
    </div>
  );
}
