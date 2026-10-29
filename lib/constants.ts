/** Realistic time from confirmation to a working system. Size is what drives
 *  it: a home goes up in days, but a commercial or industrial site also needs
 *  equipment procurement, structure fabrication and a longer install. `days`
 *  is the upper end of the range. */
export function estimateDeployment(systemKw: number): { days: number; label: string } {
  if (systemKw <= 10) return { days: 3, label: "2-3 days" };
  if (systemKw <= 25) return { days: 7, label: "4-7 days" };
  if (systemKw <= 50) return { days: 21, label: "2-3 weeks" };
  if (systemKw <= 100) return { days: 35, label: "3-5 weeks" };
  if (systemKw <= 250) return { days: 56, label: "5-8 weeks" };
  return { days: 84, label: "8-12 weeks" };
}
