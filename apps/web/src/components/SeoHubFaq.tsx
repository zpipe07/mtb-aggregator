import type { SeoHubFaqItem } from "@/lib/seoHubs";

type Props = {
  items: SeoHubFaqItem[];
  headingId?: string;
};

/** Semantic FAQ block for curated SEO hub pages. */
export function SeoHubFaq({ items, headingId = "seo-hub-faq" }: Props) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="mb-6 max-w-3xl">
      <h2
        id={headingId}
        className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
      >
        Common questions
      </h2>
      <dl className="space-y-4">
        {items.map((item) => (
          <div key={item.question}>
            <dt className="text-sm font-medium text-foreground">{item.question}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
