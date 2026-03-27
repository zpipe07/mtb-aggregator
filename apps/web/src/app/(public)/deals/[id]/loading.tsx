import { Skeleton } from "@/components/ui/skeleton";

export default function DealDetailLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Skeleton className="h-4 w-32 mb-6" />

      <div className="bg-card rounded-xl shadow-lg border border-border overflow-hidden">
        <div className="p-6">
          <div className="flex gap-6 flex-wrap">
            <Skeleton className="w-40 h-40 flex-shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-full max-w-md" />
              <Skeleton className="h-4 w-32" />
              <div className="flex flex-wrap gap-2 pt-1">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="h-10 w-36 rounded-lg mt-2" />
            </div>
          </div>

          <div className="mt-8 border-t border-border pt-6 space-y-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
