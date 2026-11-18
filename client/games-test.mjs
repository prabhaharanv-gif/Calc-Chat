// node games-test.mjs : checks the rules of Memory, Tic-Tac-Toe, Minesweeper and Slide
import assert from 'assert';
import { newMemory, flip, resolve, FACES } from './src/memory.js';
import { winner, bestMove, computerMove } from './src/tictactoe.js';
import * as ms from './src/minesweeper.js';
import { newPuzzle, tap, solvable, solvedTiles, isSolved } from './src/slide.js';

// ---------- Memory ----------
let m = newMemory();
assert.equal(m.cards.length, 16);
for (const f of FACES) assert.equal(m.cards.filter((c) => c.face === f).length, 2, 'every face appears twice');
const pairOf = (s, i) => s.cards.findIndex((c, k) => k !== i && c.face === s.cards[i].face);
let a = 0; let b = pairOf(m, 0);
let t = flip(flip(m, a), b);
assert.equal(t.matched, 1); assert.equal(t.moves, 1); assert.ok(t.cards[a].done && t.cards[b].done);
const wrong = m.cards.findIndex((c, k) => k !== 0 && c.face !== m.cards[0].face);
t = flip(flip(m, 0), wrong);
assert.deepEqual(t.pending, [0, wrong], 'mismatch is pending');
assert.equal(flip(t, 5), t, 'cannot flip while a mismatch is showing');
t = resolve(t);
assert.ok(!t.cards[0].up && !t.cards[wrong].up && !t.pending, 'mismatch flips back');
let all = newMemory();
for (let i = 0; i < 16; i++) { if (!all.cards[i].done) all = flip(flip(all, i), pairOf(all, i)); }
assert.equal(all.won, true); assert.equal(all.moves, 8);

// ---------- Tic-Tac-Toe ----------
assert.equal(winner(['X', 'X', 'X', null, null, null, null, null, null]), 'X');
assert.equal(winner(['O', null, null, null, 'O', null, null, null, 'O']), 'O');
assert.equal(winner(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']), 'draw');
assert.equal(winner(Array(9).fill(null)), null);
assert.equal(bestMove(['O', 'O', null, 'X', 'X', null, null, null, null], 'O'), 2, 'computer takes a winning move');
assert.equal(bestMove(['X', 'X', null, null, 'O', null, null, null, null], 'O'), 2, 'computer blocks a win');
// perfect play never loses against any sequence of player moves
function neverLoses(board, turn) {
  const w = winner(board);
  if (w) return w !== 'X';
  if (turn === 'O') { const n = board.slice(); n[bestMove(board, 'O')] = 'O'; return neverLoses(n, 'X'); }
  return board.every((v, i) => { if (v) return true; const n = board.slice(); n[i] = 'X'; return neverLoses(n, 'O'); });
}
assert.ok(neverLoses(Array(9).fill(null), 'X'), 'perfect computer cannot be beaten');
const mistakes = Array.from({ length: 400 }, () => computerMove(['X', 'X', null, null, 'O', null, null, null, null])).filter((x) => x !== 2).length;
assert.ok(mistakes > 0 && mistakes < 200, 'the easy computer sometimes makes mistakes');

// ---------- Minesweeper ----------
let g = ms.newGame();
g = ms.reveal(g, 40);
assert.equal(g.cells.filter((c) => c.mine).length, ms.MINES);
assert.ok(!g.cells[40].mine && ms.neighbors(40).every((j) => !g.cells[j].mine), 'first click and its neighbours are safe');
assert.ok(g.cells[40].open && !g.over);
assert.ok(g.cells.every((c, i) => c.mine || c.n === ms.neighbors(i).filter((j) => g.cells[j].mine).length), 'numbers match neighbouring mines');
g = ms.toggleFlag(g, 0);
assert.equal(ms.flagsUsed(g), 1);
const mine = g.cells.findIndex((c) => c.mine);
const lost = ms.reveal({ ...g, cells: g.cells.map((c, i) => (i === mine ? { ...c, flag: false } : c)) }, mine);
assert.ok(lost.over && !lost.won, 'stepping on a mine ends the game');
let won = g;
for (let i = 0; i < won.cells.length; i++) if (!won.cells[i].mine && !won.cells[i].open) won = ms.reveal({ ...won, cells: won.cells.map((c, k) => (k === i ? { ...c, flag: false } : c)) }, i);
assert.ok(won.won && won.over, 'opening every safe square wins');

// ---------- Slide puzzle ----------
for (let k = 0; k < 50; k++) { const p = newPuzzle(); assert.ok(solvable(p.tiles) && !isSolved(p.tiles), 'every shuffle is solvable and not already solved'); }
let s = { tiles: solvedTiles(), moves: 0, solved: false };
s = tap(s, 14); // tile 15 next to the blank (index 15)
assert.deepEqual(s.tiles.slice(12), [13, 14, 0, 15]); assert.equal(s.moves, 1);
s = tap(s, 12); // slides 13 and 14 together
assert.deepEqual(s.tiles.slice(12), [0, 13, 14, 15]); assert.equal(s.moves, 2);
const before = s; assert.equal(tap(s, 5), before, 'tapping a tile not in line with the blank does nothing');
let q = { tiles: solvedTiles(), moves: 0, solved: false };
q = tap(tap(q, 14), 15);
assert.ok(q.solved, 'moving back to the start solves it');
console.log('games: all checks passed');
