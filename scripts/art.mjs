// Bereitet eigene Grafiken auf: art-src/<name>.png|jpg|webp → public/art/<name>.webp
//
//  - Einfarbiger Hintergrund (weiß, grün, …) wird vom Rand aus entfernt (Flutfüllung,
//    damit gleiche Farben IM Motiv erhalten bleiben). Bilder mit Transparenz bleiben unverändert.
//  - Ränder werden abgeschnitten, das Bild quadratisch gemacht und auf max. 512 px verkleinert.
//  - Namen mit „bg-“ sind Hintergründe: kein Freistellen, Breite 1024 px.
//  - Am Ende wird src/art-manifest.ts neu geschrieben, damit das Spiel die Bilder kennt.
//
// Aufruf: npm run art            (alle Bilder)
//         npm run art -- rex     (nur Dateien, deren Name „rex“ enthält)
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const SRC = 'art-src';
const OUT = 'public/art';
const SIZE = 512;
const TOLERANCE = 48; // Farbabstand, ab dem ein Pixel nicht mehr zum Hintergrund gehört
const SOFT = 30; // weicher Übergang am Rand des Motivs

mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });
const filter = process.argv[2];
const files = readdirSync(SRC).filter((f) => /\.(png|jpe?g|webp)$/i.test(f) && (!filter || f.includes(filter)));

async function removeBackground(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  // Schon transparent? Dann nichts tun.
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent++;
  if (transparent > w * h * 0.02) return { data, info };

  // Hintergrundfarbe aus den vier Ecken (Median)
  const corners = [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]].map(([x, y]) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  });
  const bg = [0, 1, 2].map((c) => corners.map((p) => p[c]).sort((a, b) => a - b)[1]);
  const dist = (i) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);

  // Flutfüllung von allen Randpixeln aus
  const seen = new Uint8Array(w * h);
  const queue = [];
  for (let x = 0; x < w; x++) queue.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) queue.push(y * w, y * w + w - 1);
  while (queue.length) {
    const p = queue.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    const d = dist(p * 4);
    if (d > TOLERANCE + SOFT) continue;
    // Weicher Rand: je näher an der Hintergrundfarbe, desto durchsichtiger
    data[p * 4 + 3] = d <= TOLERANCE ? 0 : Math.round(((d - TOLERANCE) / SOFT) * 255);
    if (d > TOLERANCE) continue;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) queue.push(p - 1);
    if (x < w - 1) queue.push(p + 1);
    if (y > 0) queue.push(p - w);
    if (y < h - 1) queue.push(p + w);
  }
  return { data, info };
}

const names = [];
for (const file of files) {
  const name = basename(file, extname(file)).toLowerCase();
  const input = join(SRC, file);
  try {
    if (name.startsWith('bg-')) {
      await sharp(input).resize({ width: 1024, withoutEnlargement: true }).webp({ quality: 85 }).toFile(join(OUT, `${name}.webp`));
    } else {
      const { data, info } = await removeBackground(input);
      const trimmed = await sharp(data, { raw: info }).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
      const side = Math.max(trimmed.info.width, trimmed.info.height);
      const pad = Math.round(side * 0.04);
      // Erst quadratisch auffüllen, dann verkleinern (sharp würde sonst zuerst verkleinern)
      const square = await sharp(trimmed.data)
        .extend({
          top: Math.floor((side - trimmed.info.height) / 2) + pad,
          bottom: Math.ceil((side - trimmed.info.height) / 2) + pad,
          left: Math.floor((side - trimmed.info.width) / 2) + pad,
          right: Math.ceil((side - trimmed.info.width) / 2) + pad,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      await sharp(square)
        .resize(SIZE, SIZE, { fit: 'contain', withoutEnlargement: true, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 88, alphaQuality: 100 })
        .toFile(join(OUT, `${name}.webp`));
    }
    console.log(`✓ ${file} → public/art/${name}.webp`);
  } catch (err) {
    console.error(`✗ ${file}: ${err.message}`);
  }
}

// Manifest mit allen vorhandenen eigenen Bildern
for (const f of readdirSync(OUT)) if (f.endsWith('.webp')) names.push(basename(f, '.webp'));
names.sort();
// Alle Platzhalter (public/img) – damit das Spiel anzeigen kann, was noch fehlt
const placeholders = readdirSync('public/img').filter((f) => f.endsWith('.webp')).map((f) => basename(f, '.webp')).sort();
writeFileSync(
  'src/art-manifest.ts',
  `// Automatisch erzeugt von scripts/art.mjs – nicht von Hand bearbeiten.\nexport const ART: string[] = ${JSON.stringify(names)};\n\nexport const PLACEHOLDERS: string[] = ${JSON.stringify(placeholders)};\n`,
);
console.log(`\n${files.length} Bild(er) verarbeitet · ${names.length} eigene Bilder im Spiel aktiv.`);
