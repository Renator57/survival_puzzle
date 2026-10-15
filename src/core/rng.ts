// Deterministischer Zufall (mulberry32). Gleicher Seed = gleicher Kampfverlauf.
// Wichtig für Mehrspieler: Der Server kann einen Kampf mit demselben Seed nachrechnen
// und so prüfen, ob das Ergebnis eines Spielers echt ist.

export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

export function nextFloat(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(nextFloat(rng) * maxExclusive);
}
