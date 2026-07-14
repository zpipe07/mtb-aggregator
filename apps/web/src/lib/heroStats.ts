import type { Status } from "@/api";
import { formatRelativeTime } from "@/lib/formatRelativeTime";

export type HeroStats = {
  storeCount: number;
  dealCount: number;
  lastUpdated: string;
};

export function deriveHeroStats(status: Status): HeroStats {
  const stores = status.stores ?? [];
  const storeCount = stores.length;
  const dealCount = stores.reduce((sum, store) => sum + (store.deal_count ?? 0), 0);

  const lastScraped = stores.reduce<string | null>((latest, store) => {
    if (!store.last_scraped) return latest;
    if (!latest || store.last_scraped > latest) return store.last_scraped;
    return latest;
  }, null);

  return {
    storeCount,
    dealCount,
    lastUpdated: formatRelativeTime(lastScraped),
  };
}
