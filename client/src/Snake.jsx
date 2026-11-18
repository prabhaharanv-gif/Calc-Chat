import { useCallback, useEffect, useRef, useState } from 'react';
import { COLS, ROWS, newState, step } from './snake.js';
import PinPad, { useLongPress } from './PinPad.jsx';

const CELL = 22; // canvas pixels per cell
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
const readBest = () => { try { return Number(localStorage.getItem('snake_best')) || 0; } catch { return 0; } };

function draw(canvas, g) {
  const ctx = canvas.getContext('2d');
  const size = COLS * CELL;
  ctx.fillStyle = '#16231b';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1a2a20';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if ((x + y) % 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);

  if (g.food) {
    ctx.fillStyle = '#ff5d5d';
    ctx.beginPath();
    ctx.arc((g.food.x + 0.5) * CELL, (g.food.y + 0.5) * CELL, CELL * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7bd88f';
    ctx.fillRect((g.food.x + 0.5) * CELL - 1, g.food.y * CELL + 1, 2, 5);
  }
  g.snake.forEach((p, i) => {
    ctx.fillStyle = i === 0 ? '#4ec36b' : i % 2 ? '#7bd88f' : '#6fcf84';
    const pad = i === 0 ? 1 : 2;
    ctx.beginPath();
    ctx.roundRect(p.x * CELL + pad, p.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 6);
    ctx.fill();
  });
  const h = g.snake[0];
  ctx.fillStyle = '#0d1a12';
  const eye = (ox, oy) => { ctx.beginPath(); ctx.arc(h.x * CELL + ox, h.y * CELL + oy, 2, 0, Math.PI * 2); ctx.fill(); };
  if (g.dir === 'left' || g.dir === 'right') {
    const ox = g.dir === 'right' ? 16 : 6;
    eye(ox, 7); eye(ox, 15);
  } else {
    const oy = g.dir === 'down' ? 16 : 6;
    eye(7, oy); eye(15, oy);
  }
}

export default function Snake({ onCode, passLen, signal }) {
  const [g, setG] = useState(() => newState());
  const [running, setRunning] = useState(false);
  const [best, setBest] = useState(readBest);
  const [pinOpen, setPinOpen] = useState(false);
  const canvas = useRef(null);
  const inputs = useRef([]); // queued turns, so two quick swipes are not lost
  const swipe = useRef(null);
  const longPress = useLongPress(() => setPinOpen(true));
  const speed = Math.max(70, 140 - Math.floor(g.score / 50) * 10);

  const turn = useCallback((d) => {
    if (g.over) return;
    const q = inputs.current;
    if (q.length < 3 && q[q.length - 1] !== d) q.push(d);
    setRunning(true);
  }, [g.over]);

  const restart = () => { inputs.current = []; setG(newState()); setRunning(false); };

  useEffect(() => {
    if (!running || pinOpen || g.over) return undefined;
    const id = setInterval(() => setG((s) => step(s, inputs.current.shift())), speed);
    return () => clearInterval(id);
  }, [running, pinOpen, g.over, speed]);

  useEffect(() => { if (canvas.current) draw(canvas.current, g); }, [g]);

  useEffect(() => {
    if (g.score > best) {
      setBest(g.score);
      try { localStorage.setItem('snake_best', String(g.score)); } catch { /* storage blocked */ }
    }
  }, [g.score, best]);

  useEffect(() => {
    if (pinOpen) return undefined;
    const onKey = (e) => {
      const d = KEYS[e.key];
      if (d) { e.preventDefault(); turn(d); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn, pinOpen]);

  const swDown = (e) => { swipe.current = { x: e.clientX, y: e.clientY }; };
  const swUp = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || pinOpen) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) { if (!running && !g.over) turn(g.dir); return; }
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };

  return (
    <div className="gamewrap snakewrap">
      <div className="game">
        <div className="ghead">
          <h1 className={`gtitle ${signal ? 'sig' : ''}`} {...longPress}>Snake</h1>
          <div className="gscores">
            <div className="gscore"><span>SCORE</span><b>{g.score}</b></div>
            <div className="gscore"><span>BEST</span><b>{best}</b></div>
          </div>
        </div>

        <div className="sboard" onPointerDown={swDown} onPointerUp={swUp}>
          <canvas ref={canvas} width={COLS * CELL} height={ROWS * CELL} />
          {pinOpen && <PinPad passLen={passLen} onCode={onCode} onClose={() => setPinOpen(false)} />}
          {!running && !g.over && <div className="sover"><b>Tap or press an arrow key to start</b></div>}
          {g.over && (
            <div className="sover">
              <h2>{g.won ? 'You win!' : 'Game over!'}</h2>
              <p>Score {g.score}</p>
              <button className="gbtn" onClick={restart}>Play again</button>
            </div>
          )}
        </div>

        <div className="dpad">
          <button className="up" onClick={() => turn('up')} aria-label="Up">▲</button>
          <button className="left" onClick={() => turn('left')} aria-label="Left">◀</button>
          <button className="down" onClick={() => turn('down')} aria-label="Down">▼</button>
          <button className="right" onClick={() => turn('right')} aria-label="Right">▶</button>
        </div>
        <p className="ghow"><b>How to play:</b> swipe or use the arrow keys to steer the snake. Eat the red apples to grow, and do not hit the walls or yourself!</p>
      </div>
    </div>
  );
}
