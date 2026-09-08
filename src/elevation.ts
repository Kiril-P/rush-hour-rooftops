/** Smooth, seeded visual elevation. Slopes stay shallow enough for unique screen picking. */
export function elevationAt(x: number, y: number, seed = 824671): number {
  const phase = ((seed % 997) / 997) * Math.PI * 2;
  return (
    0.62 * Math.sin((x - 16) * 0.24 + phase) +
    0.48 * Math.sin((y - 10) * 0.28 + phase * 0.6)
  );
}
