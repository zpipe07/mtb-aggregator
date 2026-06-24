/** Format a USD amount with two decimal places (e.g. chart ticks, deal prices). */
export function formatMoney(n: number): string {
  return n.toFixed(2);
}
