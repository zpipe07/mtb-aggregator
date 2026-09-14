import {
  revalidatePath,
  revalidateTag,
  unstable_expirePath,
  unstable_expireTag,
} from "next/cache";
import { after, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { validateAdminBearer } from "@/lib/adminAuth";
import { parseRevalidateTarget } from "@/lib/parseRevalidateTarget";
import { PUBLIC_DATA_CACHE_TAG } from "@/lib/revalidate";
import {
  coreIndexNowUrls,
  indexNowUrlForPath,
  submitIndexNow,
} from "@/lib/indexNow";

export const dynamic = "force-dynamic";

type RevalidateType = "page" | "layout";

type RevalidateRequestBody = {
  /** Single path or full site URL (query is parsed for display; revalidation uses pathname). */
  path?: string;
  /** Batch of paths or URLs. */
  paths?: string[];
  /** Revalidate all fetches tagged with this name. */
  tag?: string;
  /** Batch of cache tags. */
  tags?: string[];
  /** `page` (default) or `layout` for path revalidation. */
  type?: RevalidateType;
  /** When true, also purge the entire site (`revalidatePath('/', 'layout')`). */
  purge_all?: boolean;
};

type NormalizedTarget = {
  pathname: string;
  search: string;
};

function normalizeTargets(body: RevalidateRequestBody): NormalizedTarget[] {
  const raw = [...(body.path ? [body.path] : []), ...(body.paths ?? [])];
  const byPathname = new Map<string, NormalizedTarget>();
  for (const item of raw) {
    const parsed = parseRevalidateTarget(item);
    byPathname.set(parsed.pathname, parsed);
  }
  return [...byPathname.values()];
}

function normalizeTags(body: RevalidateRequestBody): string[] {
  const raw = [...(body.tag ? [body.tag] : []), ...(body.tags ?? [])];
  const tags = new Set<string>();
  for (const item of raw) {
    const t = item.trim();
    if (t) tags.add(t);
  }
  return [...tags];
}

function expirePath(pathname: string, type: RevalidateType) {
  // Immediate expiration (admin expects fresh data on next reload).
  unstable_expirePath(pathname, type);
  revalidatePath(pathname, type);
}

function expireTag(tag: string) {
  unstable_expireTag(tag);
  revalidateTag(tag);
}

export async function POST(request: Request) {
  if (!validateAdminBearer(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ADMIN_PASSWORD?.trim()) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD is not configured on the web app" },
      { status: 503 },
    );
  }

  let body: RevalidateRequestBody;
  try {
    body = (await request.json()) as RevalidateRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type: RevalidateType = body.type === "layout" ? "layout" : "page";

  let targets: NormalizedTarget[] = [];
  let tags: string[] = [];
  try {
    targets = normalizeTargets(body);
    tags = normalizeTags(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (targets.length === 0 && tags.length === 0 && !body.purge_all) {
    return NextResponse.json(
      { error: "Provide at least one path or tag" },
      { status: 400 },
    );
  }

  for (const { pathname } of targets) {
    expirePath(pathname, type);
  }
  for (const tag of tags) {
    expireTag(tag);
  }
  if (body.purge_all) {
    expirePath("/", "layout");
  }

  const indexNowUrls = body.purge_all
    ? coreIndexNowUrls()
    : targets.map((t) => indexNowUrlForPath(t.pathname));
  after(() => {
    void submitIndexNow(indexNowUrls).then((result) => {
      if (result.status === "error") {
        Sentry.captureException(new Error(result.message), {
          tags: { integration: "indexnow", trigger: "revalidate" },
          extra: { httpStatus: result.httpStatus },
        });
      }
    });
  });

  return NextResponse.json({
    ok: true,
    revalidated_paths: targets.map((t) => t.pathname),
    revalidated_queries: targets
      .filter((t) => t.search)
      .map((t) => `${t.pathname}${t.search}`),
    revalidated_tags: tags,
    purged_all: Boolean(body.purge_all),
    type,
    note:
      "Next.js revalidates by pathname; query strings select which page variant you care about but all variants under a pathname share the same route cache.",
    default_public_tag: PUBLIC_DATA_CACHE_TAG,
  });
}
