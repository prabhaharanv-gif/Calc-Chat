import { useEffect, useRef, useState } from 'react';
import { COLS, ROWS, MINES, newGame, reveal, toggleFlag, flagsUsed } from './minesweeper.js';
import PinPad from './PinPad.jsx';
import GameHeader, { Scores } from './GameHeader.jsx';
import GameOver from './GameOver.jsx';
import { loadProgress, saveProgress } from './progress.js';

const readBest = () => { try { return Number(localStorage.getItem('mines_best')) || 0; } catch { return 0; } };
const valid = (v) => v.g && Array.isArray(v.g.cells) && v.g.cells.length === ROWS * COLS && typeof v.time === 'number';

export default function Mines({ onCode, passLen, signal, onBack }) {
  const [saved] = useState(() => loadProgress('mines', valid));
  const [g, setG] = useState(() => saved?.g || newGame());
  const [time, setTime] = useState(() => saved?.time || 0);
  const [flagMode, setFlagMode] = useState(false);
  const [best, setBest] = useState(readBest); // fastest clear, in seconds
  const startBest = useRef(best);
  const [pinOpen, setPinOpen] = useState(false);

  useEffect(() => {
    if (!g.started || g.over || pinOpen) return undefined;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [g.started, g.over, pinOpen]);

  useEffect(() => {
    if (g.won && (!best || time < best)) {
      setBest(time);
      try { localStorage.setItem('mines_best', String(time)); } catch { /* storage blocked */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.won]);

  useEffect(() => { saveProgress('mines', g.over ? null : { g, time }); }, [g, time]);

  const restart = () => { startBest.current = best; setG(newGame()); setTime(0); };
  const tap = (i) => { if (!pinOpen) setG((s) => (flagMode ? toggleFlag(s, i) : reveal(s, i))); };
  const rightClick = (e, i) => { e.preventDefault(); if (!pinOpen) setG((s) => toggleFlag(s, i)); };

  return (
    <div className="gamewrap themed">
      <div className={`game ${pinOpen ? 'paused' : ''}`}>
        <GameHeader title="Mines" signal={signal} onBack={onBack} onPin={() => setPinOpen(true)}
          right={<Scores items={[['MINES', MINES - flagsUsed(g)], ['TIME', time]]} />} />
        <div className="gbar">
          <div className="seg mode">
            <button className={!flagMode ? 'on' : ''} onClick={() => setFlagMode(false)}>Dig</button>
            <button className={flagMode ? 'on' : ''} onClick={() => setFlagMode(true)}>🚩 Flag</button>
          </div>
          <button className="gbtn" onClick={restart}>New Game</button>
        </div>

        <div className="bwrap"><div className="gbox mboard" style={{ '--cols': COLS }}>
          {g.cells.map((c, i) => (
            <button key={i} className={`mcell ${c.open ? 'open' : ''} ${c.open && c.mine ? 'boom' : ''} n${c.n}`}
              onClick={() => tap(i)} onContextMenu={(e) => rightClick(e, i)}
              aria-label={c.open ? (c.mine ? 'Mine' : `${c.n}`) : c.flag ? 'Flag' : 'Hidden'}>
              {c.open ? (c.mine ? '💣' : c.n || '') : c.flag ? '🚩' : ''}
            </button>
          ))}
          {pinOpen && <PinPad passLen={passLen} onCode={onCode} onClose={() => setPinOpen(false)} />}
          {g.over && (
            g.won ? (
              <GameOver emoji="🏆" win title="You Cleared It!" subtitle="Every safe square is open"
                newBest={!startBest.current || time < startBest.current}
                stats={[['Time', `${time}s`], ['Best', `${best || time}s`]]} onAgain={restart} onHome={onBack} />
            ) : (
              <GameOver emoji="💣" title="Boom!" subtitle="You hit a mine" stats={[['Time', `${time}s`], ['Best', best ? `${best}s` : '-']]}
                onAgain={restart} onHome={onBack} />
            )
          )}
        </div></div>
        <p className="ghow"><b>How to play:</b> tap a square to dig. Numbers tell how many mines touch it. Switch to Flag (or right-click) to mark mines. Open every safe square to win.</p>
      </div>
    </div>
  );
}
