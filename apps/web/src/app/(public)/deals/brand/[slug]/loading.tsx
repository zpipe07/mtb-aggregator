export default function BrandDealsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="mt-6 h-4 w-full max-w-2xl animate-pulse rounded bg-muted" />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-sm bg-muted" />
        ))}
      </div>
    </div>
  );
}
