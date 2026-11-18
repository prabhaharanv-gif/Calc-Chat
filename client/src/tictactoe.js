// Pure Tic-Tac-Toe logic. The player is X, the computer is O.
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function winner(b) {
  for (const [x, y, z] of LINES) if (b[x] && b[x] === b[y] && b[x] === b[z]) return b[x];
  return b.every(Boolean) ? 'draw' : null;
}

const free = (b) => b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

function score(b, turn, cpu, depth) {
  const w = winner(b);
  if (w === cpu) return 10 - depth;
  if (w === 'draw') return 0;
  if (w) return depth - 10;
  const other = turn === 'X' ? 'O' : 'X';
  const results = free(b).map((i) => {
    const n = b.slice();
    n[i] = turn;
    return score(n, other, cpu, depth + 1);
  });
  return turn === cpu ? Math.max(...results) : Math.min(...results);
}

// Perfect play.
export function bestMove(b, cpu = 'O') {
  const other = cpu === 'X' ? 'O' : 'X';
  let best = -Infinity;
  let move = free(b)[0];
  for (const i of free(b)) {
    const n = b.slice();
    n[i] = cpu;
    const s = score(n, other, cpu, 1);
    if (s > best) { best = s; move = i; }
  }
  return move;
}

// Beatable: sometimes plays a random square so the player can win.
export function computerMove(b, rnd = Math.random, mistakeRate = 0.25) {
  const f = free(b);
  if (rnd() < mistakeRate) return f[Math.floor(rnd() * f.length)];
  return bestMove(b, 'O');
}
