---
name: Category Card Images
overview: "Add the four stock images (bikes, components, gear, accessories) to the home page category cards. Two approaches: hardcode a slug-to-image mapping in the frontend (simpler) or add an image_url column to the categories table and expose it via the API (more flexible, admin-manageable)."
todos: []
isProject: false
---

# Add Stock Images to Home Page Category Cards

## Current State

- **HomePage** ([apps/web/src/pages/HomePage.tsx](apps/web/src/pages/HomePage.tsx)) renders up to 8 category cards from `GET /categories/tree` (root-level nodes only). The tree has 4 roots: Bikes, Components, Gear, Accessories.
- **CategoryCard** ([apps/web/src/components/CategoryCard.tsx](apps/web/src/components/CategoryCard.tsx)) accepts `label`, `to`, and optional `description` — no image support.
- **Images** in `apps/web/public/`: `stock-bikes.jpg`, `stock-components.jpg`, `stock-gear.jpg`, `stock-accessories.jpg` — one per root category.

## Hardcode vs Database

| Approach     | Pros                                                                         | Cons                                                                     |
| ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Hardcode** | No migration, no API changes, minimal code. Images live in repo.             | Changing images requires a deploy. New categories need manual mapping.   |
| **Database** | Admin can manage images via CategoryManager. Flexible for future categories. | Migration, API changes, admin UI updates. More work for 4 static images. |

**Recommendation:** Hardcode for now. The images map 1:1 to the 4 root categories, are static assets, and rarely change. If you later want admin-manageable images, add `image_url` to the schema and wire it through.

---

## Implementation (Hardcode Approach)

### 1. Extend CategoryCard to support images

In [apps/web/src/components/CategoryCard.tsx](apps/web/src/components/CategoryCard.tsx):

- Add optional `imageSrc?: string` prop.
- When present, render an `<img>` (or background image) above/beside the label. Use `object-cover` and a fixed aspect ratio for consistent card layout.
- Keep the card layout responsive (e.g., image on top, label below).

### 2. Add slug-to-image mapping in HomePage

In [apps/web/src/pages/HomePage.tsx](apps/web/src/pages/HomePage.tsx):

```ts
const CATEGORY_IMAGES: Record<string, string> = {
  bikes: "/stock-bikes.jpg",
  components: "/stock-components.jpg",
  gear: "/stock-gear.jpg",
  accessories: "/stock-accessories.jpg",
};
```

- In `buildCategoryCards`, include `imageSrc: CATEGORY_IMAGES[category.slug] ?? undefined` for each card.
- Pass `imageSrc` to `CategoryCard`. Categories without a mapping (e.g., future "Other") render without an image.

### 3. Update CategoryCard stories

In [apps/web/src/components/CategoryCard.stories.tsx](apps/web/src/components/CategoryCard.stories.tsx):

- Add a story that uses `imageSrc` (e.g., `"/stock-bikes.jpg"`) to document the image variant.

### 4. Docs

- Update [apps/web/README.md](apps/web/README.md) or [docs/DESIGN.md](docs/DESIGN.md) if they describe the home page layout or category cards.

---

## Alternative: Database Approach

If you prefer admin-manageable images:

1. **Migration** — Add `image_url VARCHAR(500)` to `categories` in a new migration.
2. **API** — Extend `Category` struct and `CategoryTreeNode` in [apps/api/internal/db/categories.go](apps/api/internal/db/categories.go); include `image_url` in SELECTs and JSON.
3. **Admin** — Add image URL field to category create/edit forms in [apps/web/src/admin/CategoryManager.tsx](apps/web/src/admin/CategoryManager.tsx).
4. **Frontend** — Use `category.image_url` from the tree response instead of the hardcoded map.

---

## Files to Touch (Hardcode)

- `apps/web/src/components/CategoryCard.tsx` — add `imageSrc` prop and image rendering
- `apps/web/src/pages/HomePage.tsx` — add `CATEGORY_IMAGES` map and pass `imageSrc` to cards
- `apps/web/src/components/CategoryCard.stories.tsx` — add image story
