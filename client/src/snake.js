// Pure Snake game logic.
export const COLS = 20;
export const ROWS = 20;
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function placeFood(snake, rnd = Math.random) {
  const taken = new Set(snake.map((p) => `${p.x},${p.y}`));
  const free = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (!taken.has(`${x},${y}`)) free.push({ x, y });
  }
  return free.length ? free[Math.floor(rnd() * free.length)] : null;
}

export function newState(rnd = Math.random) {
  const snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  return { snake, dir: 'right', food: placeFood(snake, rnd), score: 0, over: false, won: false };
}

// Advance one tick. `want` is the queued direction (ignored if it would reverse the snake).
export function step(s, want, rnd = Math.random) {
  if (s.over) return s;
  const dir = want && want !== OPPOSITE[s.dir] ? want : s.dir;
  const [dx, dy] = DELTA[dir];
  const head = { x: s.snake[0].x + dx, y: s.snake[0].y + dy };
  if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) return { ...s, dir, over: true };
  const eating = !!s.food && head.x === s.food.x && head.y === s.food.y;
  const body = eating ? s.snake : s.snake.slice(0, -1); // the tail moves away unless we grow
  if (body.some((p) => p.x === head.x && p.y === head.y)) return { ...s, dir, over: true };
  const snake = [head, ...body];
  const food = eating ? placeFood(snake, rnd) : s.food;
  return { snake, dir, food, score: s.score + (eating ? 10 : 0), over: !food, won: !food };
}
