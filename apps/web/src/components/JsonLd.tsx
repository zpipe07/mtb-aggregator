/**
 * Renders a single JSON-LD `<script type="application/ld+json">` block (schema.org).
 * Use builders in `@/lib/jsonLd` and pass the resulting object.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
