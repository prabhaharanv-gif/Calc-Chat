// Pure Minesweeper logic (9x9, 10 mines). The first reveal is always safe.
export const ROWS = 9;
export const COLS = 9;
export const MINES = 10;

export const newGame = () => ({
  cells: Array.from({ length: ROWS * COLS }, () => ({ mine: false, open: false, flag: false, n: 0 })),
  started: false, over: false, won: false,
});

export function neighbors(i) {
  const r = Math.floor(i / COLS);
  const c = i % COLS;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) out.push(rr * COLS + cc);
    }
  }
  return out;
}

function place(cells, safe, rnd) {
  const banned = new Set([safe, ...neighbors(safe)]);
  const pool = cells.map((_, i) => i).filter((i) => !banned.has(i));
  for (let k = pool.length - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1));
    [pool[k], pool[j]] = [pool[j], pool[k]];
  }
  pool.slice(0, MINES).forEach((i) => { cells[i].mine = true; });
  cells.forEach((c, i) => { c.n = neighbors(i).filter((j) => cells[j].mine).length; });
}

export function reveal(s, i, rnd = Math.random) {
  const first = s.cells[i];
  if (s.over || first.open || first.flag) return s;
  const cells = s.cells.map((c) => ({ ...c }));
  if (!s.started) place(cells, i, rnd);
  if (cells[i].mine) {
    cells.forEach((c) => { if (c.mine) c.open = true; });
    return { ...s, cells, started: true, over: true, won: false };
  }
  const stack = [i];
  while (stack.length) {
    const k = stack.pop();
    const c = cells[k];
    if (c.open || c.flag) continue;
    c.open = true;
    if (c.n === 0) neighbors(k).forEach((j) => { if (!cells[j].open) stack.push(j); });
  }
  const closedSafe = cells.filter((c) => !c.mine && !c.open).length;
  return { ...s, cells, started: true, over: closedSafe === 0, won: closedSafe === 0 };
}

export function toggleFlag(s, i) {
  if (s.over || s.cells[i].open) return s;
  const cells = s.cells.map((c, k) => (k === i ? { ...c, flag: !c.flag } : c));
  return { ...s, cells };
}

export const flagsUsed = (s) => s.cells.filter((c) => c.flag).length;
