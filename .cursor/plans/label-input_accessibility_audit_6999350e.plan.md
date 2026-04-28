---
name: Label-input accessibility audit
overview: Audit found public deal filters using visible `<label>` text without `htmlFor`/`id` links to `<select>`s, plus several admin surfaces with the same gap or placeholder-only cues. Fix by systematically pairing labels with controls (`htmlFor`+`id`), using `fieldset`/`legend` or `aria-labelledby` where grouping fits, and aligning with WCAG programmatic name requirements referenced in Web Interface Guidelines.
todos:
  - id: filter-select-ids
    content: Add useId/htmlFor/id to FilterSelect; wire facet selects in DealFilters + FilterSidebar with sanitized facet key ids
    status: completed
  - id: category-drill-down-fieldset
    content: Replace loose label with fieldset/legend or group+aria-labelledby in CategoryDrillDown
    status: completed
  - id: admin-data-browser
    content: "DataBrowser: label strip (sr-only or aria-label), spec override aria-labelledby, bulk confirm htmlFor+id"
    status: completed
  - id: admin-forms-rest
    content: ExtractionFieldLibraryPanel, CompositionProfileForm (library+overrides modal), Operations enrich row, PromptProfileManager test modal
    status: completed
  - id: docs-apps-web-readme
    content: Brief apps/web/README.md note on label association for filter primitives
    status: completed
isProject: false
---

# Label–control association audit and fixes

## Standards (aligned with fetched Web Interface Guidelines / WCAG)

- Visible labels should be **[programmatically associated](https://www.w3.org/WAI/tutorials/forms/labels/)** with their control via `label[for]` + matching `id`, wrapping `label` containing the control, or `aria-labelledby` / `aria-label` when a single visible word label is inappropriate.
- Relying on `placeholder` alone is **not** an accessible name.
- Matches the attached **frontend-ui-engineering** guidance: semantic labels aid keyboard/SR users; **SearchBar** ([`apps/web/src/components/SearchBar.tsx`](apps/web/src/components/SearchBar.tsx)) already does this (`htmlFor="deal-search"` + `id` on [`Input`](apps/web/src/components/ui/input.tsx)).

## Issues found by area

### Public deals UI (highest visibility)

| Location                                                                   | Problem                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`FilterSelect.tsx`](apps/web/src/components/FilterSelect.tsx)             | `<label>{label}</label>` with no `htmlFor`; [`Select`](apps/web/src/components/ui/select.tsx) has no `id`. Affects Store, Brand, Min discount, Sort everywhere `FilterSelect` is used.                                                                                                                                                    |
| [`DealFilters.tsx`](apps/web/src/components/DealFilters.tsx) (spec facets) | Same pattern for dynamic spec `<Select>`s (lines ~172–186).                                                                                                                                                                                                                                                                               |
| [`FilterSidebar.tsx`](apps/web/src/components/FilterSidebar.tsx)           | Same for spec blocks (~121–135) and variant blocks (~165–174).                                                                                                                                                                                                                                                                            |
| [`CategoryDrillDown.tsx`](apps/web/src/components/CategoryDrillDown.tsx)   | Non-input widget: labeled with `<label>` but no focusable single control—the tree is buttons. Loose `<label>` does not correctly describe the composite. Prefer **`fieldset` + `legend`** (minimal CSS reset so layout unchanged) **or** `role="group"` + `aria-labelledby` on the container pointing at an element `id` for the caption. |

[`Toolbar.tsx`](apps/web/src/components/Toolbar.tsx) sort `<Select>` **is correctly** wired (`label` + `id="sort-select"`).

### Admin UI (still user-facing)

| Location                                                                                | Problem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ExtractionFieldLibraryPanel.tsx`](apps/web/src/admin/ExtractionFieldLibraryPanel.tsx) | Modal form labels (`field_key`, etc.) lack `htmlFor`; controls lack ids. Toolbar **search `<input>`** (~206) has no associated label (`aria-label="Search definitions"` or sr-only `<label>`).                                                                                                                                                                                                                                                                                                                                                                                   |
| [`DataBrowser.tsx`](apps/web/src/admin/DataBrowser.tsx)                                 | Main filter strip (~415–557): multiple `<select>`/`<input>` with **no labels**—only placeholders on some inputs. Canonical path selector, LLM conf select, sort select, brand input, category text input, enrichment/stock/visibility selects. **Bulk confirm** (~624–634): `<label>` text without matching `input` **id**/htmlFor**. **Spec overrides** (~228–237): `<input>` paired with `<dt>` text visually but **not** programmatically (use **`aria-labelledby`\*\* on each input referencing an `id` on the sibling `<dt>`, or `htmlFor` if you convert `dt` to `label`). |
| [`CompositionProfileForm.tsx`](apps/web/src/admin/CompositionProfileForm.tsx)           | “Add from library” label (~233–238) disconnected from `<select>`. Overrides **dialog** textarea (~313) needs `id` + `label htmlFor` or `aria-labelledby`.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [`Operations.tsx`](apps/web/src/admin/Operations.tsx)                                   | Enrichment section uses `<span className="block ...">` as captions (~218, 232, 248) for `<select>`/`<input>`—not associated. Wrapped radios/checkboxes (~197–267) already use implicit labels where applicable.                                                                                                                                                                                                                                                                                                                                                                  |
| [`PromptProfileManager.tsx`](apps/web/src/admin/PromptProfileManager.tsx)               | Test modal listing ID **`<input>`** (~591) has no `<label>` (main profile form lines ~99–158 are OK).                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Already in good shape (examples):** [`AdminGate`](apps/web/src/admin/AdminGate.tsx), [`StoreManager`](apps/web/src/admin/StoreManager.tsx), [`NormalizationManager`](apps/web/src/admin/NormalizationManager.tsx), [`TaxonomyManager`](apps/web/src/admin/TaxonomyManager.tsx), [`CategoryManager`](apps/web/src/admin/CategoryManager.tsx), [`CategoryPicker`](apps/web/src/admin/CategoryPicker.tsx), [`SpecFilterManager`](apps/web/src/admin/SpecFilterManager.tsx) (checkbox uses wrapping label).

## Implementation approach

1. **`FilterSelect`**
   - Add `const selectId = React.useId()` (optional override prop `controlId?: string` for tests).
   - Set `<label htmlFor={selectId}>` and `<Select id={selectId} ...>`.

2. **Dynamic facet `<Select>`s** (DealFilters + FilterSidebar)
   - Generate stable **`id`** per facet: sanitize `facet.key` for HTML ids (replace spaces/special chars) or compose ` `${baseId}-${facet.key}` `` with sanitization helper in a tiny util or inline `replace(/\W+/g,'-')` + prefix strip.
   - Set matching `htmlFor` on the visible label.

3. **`CategoryDrillDown`**
   - Prefer **`<fieldset className="border-0 p-0 m-0 min-w-0">`** + **`<legend className="sr-only ???">`** vs current classes — typically legend shares the **same typography classes** the old label had (`block text-sm font-medium …`) so visuals stay identical without a stray duplicate `<label>`.

4. **DataBrowser toolbar**
   - For each standalone control in the horizontal strip, supply either:
     - **Visually hidden** `<label htmlFor={id}>…</label>` + `id` on the control (`className="sr-only"` consistent with Toolbar/SearchBar), naming each filter (Search, Store, Brand, …), **or**
     - **`aria-label`** mirroring those names if the row is intentionally label-free visually.
   - Prefer hidden labels **if** future layout adds visible captions; either is WCAG-compliant when named.

5. **Spec overrides grid**
   - Add `id={\`spec-dt-${key}\`}` (sanitize `key`) on `<dt>` and `aria-labelledby={\`spec-dt-${key}\`}`on the`<input>` (or consolidate with a helper).

6. **Smaller admin fixes**
   - Extraction modal: **`htmlFor` + `id`** for every field row; search input: **`aria-label="Search field definitions"`** (and/or sr-only label).
   - CompositionProfileForm library select + overrides textarea: **`htmlFor` + `id`**.
   - Operations enrichment row: **`label htmlFor`** + **`id`** for store dropdown, canonical dropdown, numeric LLM field.
   - PromptProfileManager test modal: label + id for listing ID input.

7. **`SearchBar`** (optional cleanup)
   - `aria-label="Search deals"` duplicates the associated `<label>`; OK for SRs but redundant— optionally **remove `aria-label`** once `htmlFor`/`id` is the sole name source (minor, not blocking).

## Documentation

Per workspace docs rule: add a short note under web component patterns in [`apps/web/README.md`](apps/web/README.md): filters use programmatic `label`/`id` linkage; cite `FilterSelect`/fieldset patterns so future additions stay consistent.

## Verification

- Run through **`/deals`** (toolbar + sidebar/drawer if applicable): Tab to each `<select>`; screen reader **should announce** label + role + value (spot-check VoiceOver briefly if available).
- **axe-core** DevTools extension on `/deals` and one admin route after edits (fixes “Select element must have an accessible name”).
- No PostHog event changes anticipated (label-only a11y); note **intentionally unchanged** if reviewer asks.
