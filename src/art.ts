// Bilder: eigene Grafiken in public/art/ ersetzen automatisch die Platzhalter in public/img/.
// Die Liste wird von „npm run art“ erzeugt (siehe docs/GRAFIK-ANLEITUNG.md).
import { ART } from './art-manifest';

const available = new Set<string>(ART);

export const hasArt = (name: string) => available.has(name);
export const img = (name: string) => (available.has(name) ? `art/${name}.webp` : `img/${name}.webp`);
