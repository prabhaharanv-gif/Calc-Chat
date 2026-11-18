// node snake-test.mjs : checks the Snake rules
import assert from 'assert';
import { newState, step, placeFood, COLS, ROWS } from './src/snake.js';

const fixed = () => 0; // deterministic "random"
let s = newState(fixed);
assert.equal(s.snake.length, 3); assert.equal(s.dir, 'right'); assert.equal(s.score, 0);
assert.ok(!s.snake.some((p) => p.x === s.food.x && p.y === s.food.y), 'food never spawns on the snake');

// moves forward, keeps length
let t = step({ ...s, food: { x: 0, y: 0 } }, null, fixed);
assert.deepEqual(t.snake[0], { x: 11, y: 10 }); assert.equal(t.snake.length, 3);

// cannot reverse into itself
t = step({ ...s, food: { x: 0, y: 0 } }, 'left', fixed);
assert.deepEqual(t.snake[0], { x: 11, y: 10 }, 'reverse input ignored'); assert.equal(t.over, false);

// turning works
t = step({ ...s, food: { x: 0, y: 0 } }, 'up', fixed);
assert.deepEqual(t.snake[0], { x: 10, y: 9 }); assert.equal(t.dir, 'up');

// eating grows and scores, new food elsewhere
t = step({ ...s, food: { x: 11, y: 10 } }, null, fixed);
assert.equal(t.snake.length, 4); assert.equal(t.score, 10);
assert.ok(!t.snake.some((p) => p.x === t.food.x && p.y === t.food.y));

// wall = game over
let w = { ...s, snake: [{ x: COLS - 1, y: 5 }, { x: COLS - 2, y: 5 }, { x: COLS - 3, y: 5 }], food: { x: 0, y: 0 } };
assert.equal(step(w, null, fixed).over, true, 'hitting the right wall ends the game');
w = { ...s, snake: [{ x: 5, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 }], dir: 'up', food: { x: 0, y: 19 } };
assert.equal(step(w, null, fixed).over, true, 'hitting the top wall ends the game');

// self collision
const loop = { ...s, dir: 'right', food: { x: 0, y: 0 },
  snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }, { x: 6, y: 4 }] };
assert.equal(step(loop, 'down', fixed).over, true, 'running into its own body ends the game');

// moving into the cell the tail just left is fine
const chase = { ...s, dir: 'right', food: { x: 0, y: 0 },
  snake: [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }] };
assert.equal(step(chase, 'left', fixed).over, false, 'tail cell is free because the tail moves');

// finished games stay finished
assert.equal(step({ ...s, over: true }, 'up', fixed).snake, s.snake);
assert.equal(placeFood(Array.from({ length: COLS * ROWS }, (_, i) => ({ x: i % COLS, y: Math.floor(i / COLS) }))), null, 'full board has no food cell');
console.log('snake: all checks passed');
