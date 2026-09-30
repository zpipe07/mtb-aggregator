import type { Deal } from "../api";
import { buildDealDetailHref } from "@/lib/dealsBackHref";
import { dealsListSurfaceFromListHref } from "@/lib/dealsListSurface";
import { DealGrid } from "./DealGrid";
import { EmptyState } from "./EmptyState";

type DealsListResultsProps = {
  deals: Deal[];
  /** Current `/deals` URL (path + query) so deal cards preserve filters on detail → back. */
  dealsListPath: string;
};

/** RSC listing body for deals routes: grid or empty state. Keep out of `DealsPageContent`. */
export function DealsListResults({
  deals,
  dealsListPath,
}: DealsListResultsProps) {
  if (deals.length === 0) {
    return <EmptyState />;
  }

  return (
    <DealGrid
      deals={deals}
      getHref={(d) => buildDealDetailHref(d.id)}
      listSurface={dealsListSurfaceFromListHref(dealsListPath)}
      persistBackHref={dealsListPath}
    />
  );
}
