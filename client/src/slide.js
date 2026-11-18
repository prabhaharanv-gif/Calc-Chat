// Pure sliding puzzle (15-puzzle) logic. 0 is the empty square.
export const N = 4;

export const solvedTiles = () => [...Array(N * N - 1).keys()].map((i) => i + 1).concat(0);
export const isSolved = (t) => t.every((v, i) => v === solvedTiles()[i]);

// Tap a tile: it and every tile between it and the empty square slide one step.
export function tap(s, i) {
  const t = s.tiles;
  const b = t.indexOf(0);
  if (s.solved || i === b) return s;
  const sameRow = Math.floor(i / N) === Math.floor(b / N);
  const sameCol = i % N === b % N;
  if (!sameRow && !sameCol) return s;
  const step = sameRow ? (i < b ? 1 : -1) : (i < b ? N : -N);
  const tiles = t.slice();
  for (let k = b; k !== i; k -= step) tiles[k] = tiles[k - step];
  tiles[i] = 0;
  return { tiles, moves: s.moves + 1, solved: isSolved(tiles) };
}

// Shuffle by making random legal moves from the solved board, so it is always solvable.
export function newPuzzle(rnd = Math.random) {
  for (;;) {
    const tiles = solvedTiles();
    let blank = N * N - 1;
    let prev = -1;
    for (let k = 0; k < 160; k++) {
      const r = Math.floor(blank / N);
      const c = blank % N;
      const opts = [];
      if (r > 0) opts.push(blank - N);
      if (r < N - 1) opts.push(blank + N);
      if (c > 0) opts.push(blank - 1);
      if (c < N - 1) opts.push(blank + 1);
      const choices = opts.filter((o) => o !== prev);
      const pick = choices[Math.floor(rnd() * choices.length)];
      tiles[blank] = tiles[pick];
      tiles[pick] = 0;
      prev = blank;
      blank = pick;
    }
    if (!isSolved(tiles)) return { tiles, moves: 0, solved: false };
  }
}

// 4x4 solvability rule (used by the tests).
export function solvable(t) {
  const nums = t.filter(Boolean);
  let inv = 0;
  for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i] > nums[j]) inv++;
  const rowFromBottom = N - Math.floor(t.indexOf(0) / N);
  return (inv + rowFromBottom) % 2 === 1;
}
