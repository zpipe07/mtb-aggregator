"use client";

import { useSyncExternalStore } from "react";
import type { CategoryTreeNode } from "@/api";
import {
  dealsListBackLabel,
  sanitizeDealsListBackHref,
} from "@/lib/dealsBackHref";
import { readDealDetailBackHref } from "@/lib/dealDetailBackStorage";

function subscribeBackHref(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === "dropper:dealDetailBackHref") cb();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function getBackHrefSnapshot(): string | null {
  return readDealDetailBackHref();
}

/** Back nav from sessionStorage so deal URLs stay canonical (no `?from=`). */
export function useDealDetailListContext(categoryTree: CategoryTreeNode[]) {
  const fromRaw = useSyncExternalStore(
    subscribeBackHref,
    getBackHrefSnapshot,
    () => null,
  );
  const backToDealsHref = sanitizeDealsListBackHref(fromRaw);
  const backToDealsLabel = dealsListBackLabel(backToDealsHref, categoryTree);
  return { backToDealsHref, backToDealsLabel };
}
