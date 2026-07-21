import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { validateAdminBearer } from "@/lib/adminAuth";
import { parseRevalidateTarget } from "@/lib/parseRevalidateTarget";
import { PUBLIC_DATA_CACHE_TAG } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

type RevalidateType = "page" | "layout";

type RevalidateRequestBody = {
  /** Single path or full site URL (pathname + optional search). */
  path?: string;
  /** Batch of paths or URLs. */
  paths?: string[];
  /** Revalidate all fetches tagged with this name. */
  tag?: string;
  /** Batch of cache tags. */
  tags?: string[];
  /** `page` (default) or `layout` for path revalidation. */
  type?: RevalidateType;
};

function normalizePaths(body: RevalidateRequestBody): string[] {
  const raw = [
    ...(body.path ? [body.path] : []),
    ...(body.paths ?? []),
  ];
  const paths = new Set<string>();
  for (const item of raw) {
    paths.add(parseRevalidateTarget(item));
  }
  return [...paths];
}

function normalizeTags(body: RevalidateRequestBody): string[] {
  const raw = [
    ...(body.tag ? [body.tag] : []),
    ...(body.tags ?? []),
  ];
  const tags = new Set<string>();
  for (const item of raw) {
    const t = item.trim();
    if (t) tags.add(t);
  }
  return [...tags];
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

  let paths: string[] = [];
  let tags: string[] = [];
  try {
    paths = normalizePaths(body);
    tags = normalizeTags(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (paths.length === 0 && tags.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one path or tag" },
      { status: 400 },
    );
  }

  for (const path of paths) {
    revalidatePath(path, type);
  }
  for (const tag of tags) {
    revalidateTag(tag);
  }

  return NextResponse.json({
    ok: true,
    revalidated_paths: paths,
    revalidated_tags: tags,
    type,
    default_public_tag: PUBLIC_DATA_CACHE_TAG,
  });
}
