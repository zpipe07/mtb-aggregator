import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { fetchDeals } from "@/api";
import {
  validateAdminBearer,
  validateCronBearer,
  validateCronSecretHeader,
} from "@/lib/adminAuth";
import {
  INDEXNOW_MAX_URLS_PER_RUN,
  coreIndexNowUrls,
  indexNowUrlForPath,
  isIndexNowEnabled,
  isRecentScrape,
  submitIndexNow,
  uniqueIndexNowUrls,
  type SubmitIndexNowResult,
} from "@/lib/indexNow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily cron lookback with overlap so a missed run still catches scrapes. */
const DEAL_LOOKBACK_MS = 30 * 60 * 60 * 1000;
const DEAL_PAGE_SIZE = 200;

function authorize(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return (
    validateCronBearer(auth) ||
    validateAdminBearer(auth) ||
    validateCronSecretHeader(request.headers.get("x-cron-secret"))
  );
}

async function collectRecentDealUrls(now: Date): Promise<string[]> {
  const urls: string[] = [];
  for (let offset = 0; offset < INDEXNOW_MAX_URLS_PER_RUN; offset += DEAL_PAGE_SIZE) {
    const remaining = INDEXNOW_MAX_URLS_PER_RUN - urls.length;
    if (remaining <= 0) break;
    const res = await fetchDeals({
      limit: Math.min(DEAL_PAGE_SIZE, remaining),
      offset,
      sort: "newest",
      group_variants: true,
      noStore: true,
    });
    const deals = res.deals ?? [];
    if (deals.length === 0) break;

    let reachedLookback = false;
    for (const deal of deals) {
      if (!isRecentScrape(deal.last_scraped, DEAL_LOOKBACK_MS, now)) {
        reachedLookback = true;
        break;
      }
      urls.push(indexNowUrlForPath(`/deals/${deal.id}`));
      if (urls.length >= INDEXNOW_MAX_URLS_PER_RUN) {
        return urls;
      }
    }
    if (reachedLookback || deals.length < DEAL_PAGE_SIZE) break;
  }
  return urls;
}

async function urlsFromRequest(request: Request): Promise<string[]> {
  if (request.method === "GET") {
    return [];
  }
  try {
    const body = (await request.json()) as { urls?: unknown };
    if (!Array.isArray(body.urls)) return [];
    return body.urls.filter((u): u is string => typeof u === "string");
  } catch {
    return [];
  }
}

async function runIndexNow(request: Request): Promise<NextResponse> {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isIndexNowEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "IndexNow submits only from Vercel Production",
    });
  }

  const explicit = await urlsFromRequest(request);
  let urlList: string[];
  if (explicit.length > 0) {
    urlList = uniqueIndexNowUrls(explicit);
  } else {
    let dealUrls: string[] = [];
    try {
      dealUrls = await collectRecentDealUrls(new Date());
    } catch (err) {
      Sentry.captureException(err);
    }
    urlList = uniqueIndexNowUrls([...coreIndexNowUrls(), ...dealUrls]);
  }

  const result: SubmitIndexNowResult = await submitIndexNow(urlList);
  if (result.status === "error") {
    Sentry.captureException(new Error(result.message), {
      tags: { integration: "indexnow" },
      extra: { httpStatus: result.httpStatus },
    });
    return NextResponse.json(
      { ok: false, ...result },
      { status: result.httpStatus && result.httpStatus >= 400 ? 502 : 500 },
    );
  }

  return NextResponse.json({ ok: true, ...result, urlCount: urlList.length });
}

export async function GET(request: Request) {
  return runIndexNow(request);
}

export async function POST(request: Request) {
  return runIndexNow(request);
}
