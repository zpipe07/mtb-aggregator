/** Stepped minimum discount filter values displayed in selects (matches URL `min_discount` param). */

/** Stops at 90% — 100% (fully free) is not a meaningful filter for this catalog. */
export const MIN_DISCOUNT_STEP_VALUES = [
  10, 20, 30, 40, 50, 60, 70, 80, 90,
] as const;

const STEP_VALUE_SET = new Set(MIN_DISCOUNT_STEP_VALUES.map(String));

export const STEP_MIN_DISCOUNT_OPTIONS: { value: string; label: string }[] =
  MIN_DISCOUNT_STEP_VALUES.map((n) => ({
    value: String(n),
    label: `At least ${n}%`,
  }));

/**
 * Options for FilterSelect + `min_discount` URL sync. Includes legacy bookmark values
 * not on the 10% grid so `<select value={...}>` stays controlled.
 */
export function buildMinDiscountSelectOptions(
  current: string,
): { value: string; label: string }[] {
  const anyOption = { value: "", label: "No minimum" };
  const base = [anyOption, ...STEP_MIN_DISCOUNT_OPTIONS];

  const c = current.trim();
  if (!c || STEP_VALUE_SET.has(c)) return base;

  return [{ value: c, label: `${c}% (custom)` }, ...base];
}
