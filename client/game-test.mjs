// node game-test.mjs : checks the 2048 rules
import assert from 'assert';
import { slideRow, move, canMove, play, newGame, addTile, emptyGrid } from './src/game2048.js';

assert.deepEqual(slideRow([2, 2, 2, 2]), { row: [4, 4, 0, 0], score: 8 });
assert.deepEqual(slideRow([2, 2, 4, 0]), { row: [4, 4, 0, 0], score: 4 });
assert.deepEqual(slideRow([0, 2, 0, 2]), { row: [4, 0, 0, 0], score: 4 });
assert.deepEqual(slideRow([4, 2, 2, 4]), { row: [4, 4, 4, 0], score: 4 });
assert.deepEqual(slideRow([2, 4, 8, 16]), { row: [2, 4, 8, 16], score: 0 });

const g = [[2, 0, 0, 2], [0, 4, 0, 0], [0, 0, 0, 0], [2, 0, 0, 2]];
assert.deepEqual(move(g, 'left').grid, [[4, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [4, 0, 0, 0]]);
assert.deepEqual(move(g, 'right').grid, [[0, 0, 0, 4], [0, 0, 0, 4], [0, 0, 0, 0], [0, 0, 0, 4]]);
assert.deepEqual(move(g, 'up').grid, [[4, 4, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
assert.deepEqual(move(g, 'down').grid, [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [4, 4, 0, 4]]);
assert.equal(move(g, 'left').gained, 8);
assert.equal(move([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]], 'left').moved, false);

assert.equal(canMove([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]), false, 'full board, no merges = game over');
assert.equal(canMove([[2, 2, 4, 8], [4, 8, 2, 4], [8, 4, 8, 2], [2, 8, 4, 8]]), true, 'adjacent equal tiles can merge');

const start = newGame();
assert.equal(start.grid.flat().filter(Boolean).length, 2, 'new game starts with 2 tiles');
const after = play({ grid: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0, won: false, over: false }, 'left');
assert.equal(after.score, 4); assert.equal(after.grid.flat().filter(Boolean).length, 2, 'merge + one new tile');
assert.equal(addTile(emptyGrid()).flat().filter(Boolean).length, 1);
const win = play({ grid: [[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0, won: false, over: false }, 'left');
assert.equal(win.won, true, 'reaching 2048 sets won');
console.log('game: all checks passed');
