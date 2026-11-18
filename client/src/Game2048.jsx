import { useCallback, useEffect, useRef, useState } from 'react';
import { newGame, play } from './game2048.js';

const LONG_PRESS_MS = 2500; // hold the "2048" title this long to open the hidden PIN pad
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];

const readBest = () => { try { return Number(localStorage.getItem('g2048_best')) || 0; } catch { return 0; } };

export default function Game2048({ onCode, passLen }) {
  const [game, setGame] = useState(newGame);
  const [best, setBest] = useState(readBest);
  const [keepGoing, setKeepGoing] = useState(false);
  const [pin, setPin] = useState(null); // null = closed, otherwise the digits typed so far
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const lp = useRef(null);
  const swipe = useRef(null);
  const pinOpen = pin !== null;

  useEffect(() => {
    if (game.score > best) {
      setBest(game.score);
      try { localStorage.setItem('g2048_best', String(game.score)); } catch { /* storage blocked */ }
    }
  }, [game.score, best]);

  const move = useCallback((dir) => setGame((g) => play(g, dir)), []);
  const restart = () => { setGame(newGame()); setKeepGoing(false); };

  // ---- hidden PIN pad ----
  const submit = useCallback(async (code) => {
    if (busy) return;
    setBusy(true);
    const r = await onCode(code, { explicit: true });
    if (r !== 'unlock') {
      setShake(true);
      setTimeout(() => { setShake(false); setPin(''); setBusy(false); }, 450);
    }
  }, [busy, onCode]);

  const add = useCallback((d) => {
    if (busy || pin === null) return;
    const next = (pin + d).slice(0, 8);
    setPin(next);
    if (passLen && next.length === passLen) submit(next);
  }, [busy, pin, passLen, submit]);

  const back = () => { if (!busy) setPin((p) => (p ? p.slice(0, -1) : p)); };
  const ok = () => { if (pin && pin.length >= 4) submit(pin); };

  useEffect(() => {
    const onKey = (e) => {
      if (pinOpen) {
        if (/^\d$/.test(e.key)) add(e.key);
        else if (e.key === 'Backspace') back();
        else if (e.key === 'Enter') ok();
        else if (e.key === 'Escape' && !busy) setPin(null);
        return;
      }
      const d = KEYS[e.key];
      if (d) { e.preventDefault(); move(d); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const startLP = () => { clearTimeout(lp.current); lp.current = setTimeout(() => setPin(''), LONG_PRESS_MS); };
  const endLP = () => clearTimeout(lp.current);
  useEffect(() => () => clearTimeout(lp.current), []);

  // ---- swipe on the board ----
  const swDown = (e) => { swipe.current = { x: e.clientX, y: e.clientY }; };
  const swUp = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || pinOpen) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };

  const showWin = game.won && !keepGoing && !game.over;

  return (
    <div className="gamewrap">
      <div className="game">
        <div className="ghead">
          <h1 className="gtitle" onPointerDown={startLP} onPointerUp={endLP} onPointerLeave={endLP}
            onPointerCancel={endLP} onContextMenu={(e) => e.preventDefault()}>2048</h1>
          <div className="gscores">
            <div className="gscore"><span>SCORE</span><b>{game.score}</b></div>
            <div className="gscore"><span>BEST</span><b>{best}</b></div>
          </div>
        </div>
        <div className="gbar">
          <p>Join the numbers and get to the <b>2048 tile!</b></p>
          <button className="gbtn" onClick={restart}>New Game</button>
        </div>

        <div className="gboard" onPointerDown={swDown} onPointerUp={swUp}>
          {game.grid.flat().map((v, i) => (
            <div className="gcell" key={i}>
              {v ? <div key={v} className={`gtile t${v > 2048 ? 'big' : v}`}>{v}</div> : null}
            </div>
          ))}
          {(game.over || showWin) && (
            <div className="gover">
              <h2>{game.over ? 'Game over!' : 'You win!'}</h2>
              <div className="row">
                {showWin && <button className="gbtn" onClick={() => setKeepGoing(true)}>Keep going</button>}
                <button className="gbtn" onClick={restart}>{game.over ? 'Try again' : 'New game'}</button>
              </div>
            </div>
          )}
        </div>

        <p className="ghow"><b>How to play:</b> swipe (or use the arrow keys) to move the tiles. When two tiles with the same number touch, they merge into one!</p>
      </div>

      {pinOpen && (
        <div className="pinwrap" onClick={() => !busy && setPin(null)}>
          <div className={`pinpad ${shake ? 'shake' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="pindots">
              {Array.from({ length: Math.max(passLen || 4, pin.length) }).map((_, i) => (
                <span key={i} className={i < pin.length ? 'on' : ''} />
              ))}
            </div>
            <div className="pingrid">
              {PAD.map((k) => (
                <button key={k} onClick={() => (k === '⌫' ? back() : k === '✓' ? ok() : add(k))}>{k}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
