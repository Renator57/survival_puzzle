// Match-3-Spielfeld: Tauschen, Treffer finden, Spezialsteine, Nachrutschen.
import { nextInt, type Rng } from './rng';

export const COLS = 7;
export const ROWS = 6;
export const COLORS = 5;

export type Special = 'none' | 'row' | 'col' | 'bomb';
export const CRATE = -1; // Kiste: blockiert ein Feld, zerbricht durch Treffer daneben

export interface Tile {
  id: number;
  color: number; // CRATE (-1) = Kiste
  special: Special;
  frozen?: boolean; // Eis: lässt sich nicht tauschen, taut durch Treffer daneben auf
}

export interface Obstacles {
  crates: number;
  ice: number;
}

export interface Pos {
  row: number;
  col: number;
}

export interface Board {
  grid: Tile[][]; // grid[row][col], Reihe 0 ist oben
  nextId: number;
}

export interface ClearedTile {
  id: number;
  color: number;
  pos: Pos;
}

// Ein Schritt einer Kettenreaktion – die Oberfläche animiert Schritt für Schritt.
export interface CascadeStep {
  cleared: ClearedTile[];
  created: { id: number; special: Special }[];
  grid: Tile[][];
}

const key = (p: Pos) => p.row * COLS + p.col;
const inside = (p: Pos) => p.row >= 0 && p.row < ROWS && p.col >= 0 && p.col < COLS;
export const isAdjacent = (a: Pos, b: Pos) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;

function newTile(board: Board, rng: Rng, color = nextInt(rng, COLORS)): Tile {
  return { id: board.nextId++, color, special: 'none' };
}

export function cloneGrid(grid: Tile[][]): Tile[][] {
  return grid.map((row) => row.map((t) => ({ ...t })));
}

// Startfeld ohne fertige Dreierreihen, optional mit Kisten und Eis.
export function createBoard(rng: Rng, obstacles: Obstacles = { crates: 0, ice: 0 }): Board {
  const board: Board = { grid: [], nextId: 1 };
  for (let r = 0; r < ROWS; r++) {
    const row: Tile[] = [];
    for (let c = 0; c < COLS; c++) {
      let color: number;
      do {
        color = nextInt(rng, COLORS);
      } while (
        (c >= 2 && row[c - 1].color === color && row[c - 2].color === color) ||
        (r >= 2 && board.grid[r - 1][c].color === color && board.grid[r - 2][c].color === color)
      );
      row.push(newTile(board, rng, color));
    }
    board.grid.push(row);
  }
  // Kisten eher in den unteren Reihen, Eis überall
  const cells = range(0, ROWS * COLS).map((i) => ({ row: Math.floor(i / COLS), col: i % COLS }));
  for (let i = 0; i < obstacles.crates; i++) {
    const free = cells.filter((p) => p.row >= 2 && board.grid[p.row][p.col].color !== CRATE);
    const p = free[nextInt(rng, free.length)];
    board.grid[p.row][p.col].color = CRATE;
  }
  for (let i = 0; i < obstacles.ice; i++) {
    const free = cells.filter((p) => board.grid[p.row][p.col].color !== CRATE && !board.grid[p.row][p.col].frozen);
    const p = free[nextInt(rng, free.length)];
    board.grid[p.row][p.col].frozen = true;
  }
  if (!hasValidMove(board)) shuffle(board, rng);
  return board;
}

// Explodierer-Zombies werfen Kisten aufs Feld.
export function addCrates(board: Board, rng: Rng, count: number): Tile[][] {
  for (let i = 0; i < count; i++) {
    const free = board.grid.flat().filter((t) => t.color !== CRATE && t.special === 'none');
    if (free.length < 12) break;
    const tile = free[nextInt(rng, free.length)];
    tile.color = CRATE;
    tile.frozen = false;
  }
  if (!hasValidMove(board)) shuffle(board, rng);
  return cloneGrid(board.grid);
}

interface Run {
  cells: Pos[];
  dir: 'h' | 'v';
}

function findRuns(grid: Tile[][]): Run[] {
  const runs: Run[] = [];
  for (let r = 0; r < ROWS; r++) {
    let start = 0;
    for (let c = 1; c <= COLS; c++) {
      if (c < COLS && grid[r][c].color === grid[r][start].color) continue;
      if (c - start >= 3 && grid[r][start].color !== CRATE) runs.push({ dir: 'h', cells: range(start, c).map((col) => ({ row: r, col })) });
      start = c;
    }
  }
  for (let c = 0; c < COLS; c++) {
    let start = 0;
    for (let r = 1; r <= ROWS; r++) {
      if (r < ROWS && grid[r][c].color === grid[start][c].color) continue;
      if (r - start >= 3 && grid[start][c].color !== CRATE) runs.push({ dir: 'v', cells: range(start, r).map((row) => ({ row, col: c })) });
      start = r;
    }
  }
  return runs;
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

export function hasMatch(grid: Tile[][]): boolean {
  return findRuns(grid).length > 0;
}

function swapCells(grid: Tile[][], a: Pos, b: Pos) {
  const tmp = grid[a.row][a.col];
  grid[a.row][a.col] = grid[b.row][b.col];
  grid[b.row][b.col] = tmp;
}

export function isValidSwap(board: Board, a: Pos, b: Pos): boolean {
  if (!inside(a) || !inside(b) || !isAdjacent(a, b)) return false;
  const ta = board.grid[a.row][a.col];
  const tb = board.grid[b.row][b.col];
  if (ta.color === CRATE || tb.color === CRATE || ta.frozen || tb.frozen) return false;
  if (ta.special !== 'none' || tb.special !== 'none') return true;
  swapCells(board.grid, a, b);
  const ok = hasMatch(board.grid);
  swapCells(board.grid, a, b);
  return ok;
}

export function hasValidMove(board: Board): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS && isValidSwap(board, { row: r, col: c }, { row: r, col: c + 1 })) return true;
      if (r + 1 < ROWS && isValidSwap(board, { row: r, col: c }, { row: r + 1, col: c })) return true;
    }
  }
  return false;
}

export function shuffle(board: Board, rng: Rng) {
  const tiles = board.grid.flat();
  for (let attempt = 0; attempt < 100; attempt++) {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = nextInt(rng, i + 1);
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    board.grid = range(0, ROWS).map((r) => tiles.slice(r * COLS, (r + 1) * COLS));
    if (!hasMatch(board.grid) && hasValidMove(board)) return;
  }
  // Notfall: komplett neu würfeln
  const fresh = createBoard(rng);
  board.grid = fresh.grid.map((row) => row.map((t) => ({ ...t, id: board.nextId++ })));
}

// Bereich, den ein Spezialstein beim Auslösen abräumt.
function blastArea(special: Special, p: Pos): Pos[] {
  if (special === 'row') return range(0, COLS).map((col) => ({ row: p.row, col }));
  if (special === 'col') return range(0, ROWS).map((row) => ({ row, col: p.col }));
  if (special === 'bomb') {
    const out: Pos[] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) out.push({ row: p.row + dr, col: p.col + dc });
    return out.filter(inside);
  }
  return [];
}

// Räumt die markierten Felder ab (inkl. Kettenreaktion von Spezialsteinen),
// lässt Steine nachrutschen und füllt oben neu auf.
function clearAndCollapse(board: Board, rng: Rng, toClear: Map<number, Pos>, created: CascadeStep['created']) {
  const queue = [...toClear.values()];
  while (queue.length) {
    const p = queue.pop()!;
    for (const q of blastArea(board.grid[p.row][p.col].special, p)) {
      if (!toClear.has(key(q))) {
        toClear.set(key(q), q);
        queue.push(q);
      }
    }
  }

  // Kisten neben abgeräumten Steinen zerbrechen, Eis daneben taut auf
  for (const p of [...toClear.values()]) {
    if (board.grid[p.row][p.col].color === CRATE) continue;
    for (const q of [{ row: p.row - 1, col: p.col }, { row: p.row + 1, col: p.col }, { row: p.row, col: p.col - 1 }, { row: p.row, col: p.col + 1 }]) {
      if (!inside(q) || toClear.has(key(q))) continue;
      const t = board.grid[q.row][q.col];
      if (t.color === CRATE) toClear.set(key(q), q);
      else if (t.frozen) t.frozen = false;
    }
  }

  const cleared: ClearedTile[] = [...toClear.values()].map((pos) => {
    const t = board.grid[pos.row][pos.col];
    return { id: t.id, color: t.color, pos };
  });

  for (let c = 0; c < COLS; c++) {
    const kept: Tile[] = [];
    for (let r = ROWS - 1; r >= 0; r--) if (!toClear.has(key({ row: r, col: c }))) kept.push(board.grid[r][c]);
    for (let r = ROWS - 1; r >= 0; r--) board.grid[r][c] = kept[ROWS - 1 - r] ?? newTile(board, rng);
  }
  return { cleared, created, grid: cloneGrid(board.grid) };
}

// Verbundene Treffer (L-/T-Formen) zusammenfassen und Spezialsteine bestimmen.
function resolveMatches(board: Board, rng: Rng, preferred: Pos[]): CascadeStep | null {
  const runs = findRuns(board.grid);
  if (!runs.length) return null;

  const groups: Run[][] = [];
  for (const run of runs) {
    const runKeys = new Set(run.cells.map(key));
    const touching = groups.filter((g) => g.some((r) => r.cells.some((p) => runKeys.has(key(p)))));
    const merged = [run, ...touching.flat()];
    for (const g of touching) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }

  const toClear = new Map<number, Pos>();
  const created: CascadeStep['created'] = [];
  for (const group of groups) {
    const cells = new Map<number, Pos>();
    for (const run of group) for (const p of run.cells) cells.set(key(p), p);
    const longest = Math.max(...group.map((r) => r.cells.length));
    const hasBoth = group.some((r) => r.dir === 'h') && group.some((r) => r.dir === 'v');

    let special: Special = 'none';
    if (longest >= 5 || hasBoth) special = 'bomb';
    else if (longest === 4) special = group[0].dir === 'h' ? 'row' : 'col';

    let keep: Pos | undefined;
    if (special !== 'none') {
      keep = preferred.find((p) => cells.has(key(p))) ?? group[0].cells[Math.floor(group[0].cells.length / 2)];
    }
    for (const [k, p] of cells) {
      if (keep && k === key(keep)) continue;
      toClear.set(k, p);
    }
    if (keep) {
      const tile = board.grid[keep.row][keep.col];
      // Ein bereits spezieller Stein, der erneut getroffen wird, explodiert stattdessen.
      if (tile.special !== 'none') toClear.set(key(keep), keep);
      else {
        tile.special = special;
        created.push({ id: tile.id, special });
      }
    }
  }
  return clearAndCollapse(board, rng, toClear, created);
}

// Führt einen Zug komplett aus. Gibt null zurück, wenn der Tausch ungültig ist.
export function playSwap(board: Board, rng: Rng, a: Pos, b: Pos): CascadeStep[] | null {
  if (!isValidSwap(board, a, b)) return null;
  swapCells(board.grid, a, b);
  const steps: CascadeStep[] = [];

  // Getauschte Spezialsteine lösen sofort aus.
  const triggered = [a, b].filter((p) => board.grid[p.row][p.col].special !== 'none');
  if (triggered.length) {
    const toClear = new Map(triggered.map((p) => [key(p), p]));
    steps.push(clearAndCollapse(board, rng, toClear, []));
  }

  let preferred = [b, a];
  for (let step = resolveMatches(board, rng, preferred); step; step = resolveMatches(board, rng, preferred)) {
    steps.push(step);
    preferred = [];
  }
  if (!hasValidMove(board)) {
    shuffle(board, rng);
    steps.push({ cleared: [], created: [], grid: cloneGrid(board.grid) });
  }
  return steps;
}
