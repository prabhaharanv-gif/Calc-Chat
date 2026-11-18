// Pure 2048 game logic.
export const SIZE = 4;

export const emptyGrid = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(0));

export function addTile(grid, rnd = Math.random) {
  const empties = [];
  grid.forEach((row, i) => row.forEach((v, j) => { if (!v) empties.push([i, j]); }));
  if (!empties.length) return grid;
  const [i, j] = empties[Math.floor(rnd() * empties.length)];
  const next = grid.map((r) => r.slice());
  next[i][j] = rnd() < 0.9 ? 2 : 4;
  return next;
}

export function slideRow(row) {
  const tiles = row.filter(Boolean);
  const out = [];
  let score = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === tiles[i + 1]) {
      out.push(tiles[i] * 2);
      score += tiles[i] * 2;
      i++;
    } else out.push(tiles[i]);
  }
  while (out.length < SIZE) out.push(0);
  return { row: out, score };
}

const transpose = (g) => g[0].map((_, c) => g.map((r) => r[c]));
const reverse = (g) => g.map((r) => r.slice().reverse());

export function move(grid, dir) {
  let x = grid;
  if (dir === 'right') x = reverse(x);
  if (dir === 'up') x = transpose(x);
  if (dir === 'down') x = reverse(transpose(x));
  let gained = 0;
  x = x.map((r) => { const s = slideRow(r); gained += s.score; return s.row; });
  if (dir === 'right') x = reverse(x);
  if (dir === 'up') x = transpose(x);
  if (dir === 'down') x = transpose(reverse(x));
  const moved = x.some((r, i) => r.some((v, j) => v !== grid[i][j]));
  return { grid: x, gained, moved };
}

export function canMove(grid) {
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      if (!grid[i][j]) return true;
      if (j + 1 < SIZE && grid[i][j] === grid[i][j + 1]) return true;
      if (i + 1 < SIZE && grid[i][j] === grid[i + 1][j]) return true;
    }
  }
  return false;
}

export const newGame = () => ({ grid: addTile(addTile(emptyGrid())), score: 0, won: false, over: false });

export function play(game, dir) {
  if (game.over) return game;
  const r = move(game.grid, dir);
  if (!r.moved) return game;
  const grid = addTile(r.grid);
  return {
    grid,
    score: game.score + r.gained,
    won: game.won || grid.some((row) => row.includes(2048)),
    over: !canMove(grid),
  };
}
