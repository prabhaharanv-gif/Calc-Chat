import { useCallback, useEffect, useRef, useState } from 'react';
import { COLS, ROWS, newState, step } from './snake.js';
import PinPad from './PinPad.jsx';
import GameHeader, { Scores } from './GameHeader.jsx';

const CELL = 28; // canvas pixels per cell
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
const readBest = () => { try { return Number(localStorage.getItem('snake_best')) || 0; } catch { return 0; } };

function path(ctx, pts, dx = 0, dy = 0) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
  ctx.stroke();
}

function draw(canvas, g) {
  const ctx = canvas.getContext('2d');
  const size = COLS * CELL;

  // bright lawn
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#aadb59' : '#b6e467';
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }
  const sheen = ctx.createLinearGradient(0, 0, size, size);
  sheen.addColorStop(0, 'rgba(255,255,255,.18)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);

  // apple
  if (g.food) {
    const cx = (g.food.x + 0.5) * CELL;
    const cy = (g.food.y + 0.56) * CELL;
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.beginPath(); ctx.ellipse(cx + 1.5, cy + CELL * 0.34, CELL * 0.3, CELL * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    const grad = ctx.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, CELL * 0.4);
    grad.addColorStop(0, '#ff8a8a');
    grad.addColorStop(1, '#e5252a');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.beginPath(); ctx.ellipse(cx - 5, cy - 5, 3.2, 2, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3f9b3a';
    ctx.beginPath(); ctx.ellipse(cx + 3, cy - CELL * 0.4, 5, 2.6, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy - CELL * 0.3); ctx.lineTo(cx - 1, cy - CELL * 0.45); ctx.stroke();
  }

  // snake: one smooth thick line through the segment centres
  const pts = g.snake.map((p) => [(p.x + 0.5) * CELL, (p.y + 0.5) * CELL]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = CELL * 0.82; path(ctx, pts, 1.5, 2.5);
  ctx.strokeStyle = '#2f6df0'; ctx.lineWidth = CELL * 0.8; path(ctx, pts);
  ctx.strokeStyle = '#4f8bff'; ctx.lineWidth = CELL * 0.58; path(ctx, pts);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = CELL * 0.14; path(ctx, pts, -2, -3);

  // head + eyes
  const [hx, hy] = pts[0];
  ctx.fillStyle = '#2f6df0';
  ctx.beginPath(); ctx.arc(hx, hy, CELL * 0.46, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4f8bff';
  ctx.beginPath(); ctx.arc(hx - 1, hy - 1.5, CELL * 0.34, 0, Math.PI * 2); ctx.fill();
  const look = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[g.dir];
  const side = [-look[1], look[0]];
  [-1, 1].forEach((k) => {
    const ex = hx + look[0] * 5 + side[0] * k * 6;
    const ey = hy + look[1] * 5 + side[1] * k * 6;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ex, ey, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#17233f';
    ctx.beginPath(); ctx.arc(ex + look[0] * 1.6, ey + look[1] * 1.6, 2.1, 0, Math.PI * 2); ctx.fill();
  });
}

export default function Snake({ onCode, passLen, signal, onBack }) {
  const [g, setG] = useState(() => newState());
  const [running, setRunning] = useState(false);
  const [best, setBest] = useState(readBest);
  const [pinOpen, setPinOpen] = useState(false);
  const canvas = useRef(null);
  const inputs = useRef([]); // queued turns, so two quick swipes are not lost
  const swipe = useRef(null);
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
    <div className="gamewrap themed">
      <div className="game">
        <GameHeader title="Snake" signal={signal} onBack={onBack} onPin={() => setPinOpen(true)}
          right={<Scores items={[['SCORE', g.score], ['BEST', best]]} />} />
        <div className="gbar">
          <p>Eat the apples and grow longer.</p>
          <button className="gbtn" onClick={restart}>New Game</button>
        </div>

        <div className="sboard" onPointerDown={swDown} onPointerUp={swUp}>
          <canvas ref={canvas} width={COLS * CELL} height={ROWS * CELL} />
          {pinOpen && <PinPad passLen={passLen} onCode={onCode} onClose={() => setPinOpen(false)} />}
          {!running && !g.over && <div className="sover start"><b>Tap or press an arrow key to start</b></div>}
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
        <p className="ghow"><b>How to play:</b> swipe or use the arrow keys to steer the snake. Do not hit the walls or yourself!</p>
      </div>
    </div>
  );
}
