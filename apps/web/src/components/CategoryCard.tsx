"use client";

import Link from "next/link";
import posthog from "posthog-js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type CategoryCardProps = {
  label: string;
  to: string;
  description?: string;
  imageSrc?: string;
};

export function CategoryCard({ label, to, description, imageSrc }: CategoryCardProps) {
  return (
    <Link
      href={to}
      className="block group"
      onClick={() => posthog.capture("category_clicked", { category: label, href: to })}
    >
      <Card className="shadow-sm hover:ring-primary/40 hover:shadow-md transition-all cursor-pointer overflow-hidden">
        {imageSrc && (
          <div className="aspect-[4/3] overflow-hidden bg-muted">
            <img
              src={imageSrc}
              alt=""
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          </div>
        )}
        <CardHeader>
          <CardTitle className="text-xl">{label}</CardTitle>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <span className="inline-flex items-center text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            View deals
            <svg
              className="ml-1 w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
