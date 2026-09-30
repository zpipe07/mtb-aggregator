"use client";

import { useState, type FormEvent, useTransition } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import Link from "next/link";
import { SearchBar, SEARCH_FRAME_MIN_H } from "../components/SearchBar";
import { Button } from "../components/ui/button";
import { cn } from "@/lib/utils";

export function HomeSearchForm() {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    if (q) {
      posthog.capture("search_submitted", { query: q });
    }
    startTransition(() => {
      if (q) {
        router.push(`/deals?q=${encodeURIComponent(q)}`);
      } else {
        router.push("/deals");
      }
    });
  };

  return (
    <form
      onSubmit={handleSearchSubmit}
      className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1">
        <SearchBar
          value={searchValue}
          onChange={setSearchValue}
          placeholder="Search deals…"
        />
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-stretch">
        <Button
          type="submit"
          disabled={isPending}
          className={cn(SEARCH_FRAME_MIN_H, "sm:min-w-[8rem]")}
        >
          {isPending ? "Searching…" : "Search"}
        </Button>
        <Button
          variant="outline"
          asChild
          className={cn(SEARCH_FRAME_MIN_H, "sm:min-w-[8rem]")}
        >
          <Link href="/deals">View all deals</Link>
        </Button>
      </div>
    </form>
  );
}
