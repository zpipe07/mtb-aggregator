"use client";

import { useSearchParams } from "next/navigation";
import type { CategoryTreeNode } from "@/api";
import {
  dealsListBackLabel,
  sanitizeDealsListBackHref,
} from "@/lib/dealsBackHref";

/** Read `?from=` on the client so ISR cache keys stay `/deals/[id]` only. */
export function useDealDetailListContext(categoryTree: CategoryTreeNode[]) {
  const searchParams = useSearchParams();
  const fromRaw = searchParams.get("from");
  const backToDealsHref = sanitizeDealsListBackHref(fromRaw);
  const backToDealsLabel = dealsListBackLabel(backToDealsHref, categoryTree);
  return { backToDealsHref, backToDealsLabel };
}
