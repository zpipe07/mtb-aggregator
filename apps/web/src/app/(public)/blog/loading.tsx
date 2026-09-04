import { Skeleton } from "@/components/ui/skeleton";

export default function BlogLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-12">
      <Skeleton className="h-2.5 w-28" />
      <Skeleton className="mt-3 h-10 w-[min(100%,16rem)]" />
      <Skeleton className="mt-4 h-5 max-w-xl" />
      <div className="mt-10 space-y-6 border-y border-border py-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-[80%]" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}
