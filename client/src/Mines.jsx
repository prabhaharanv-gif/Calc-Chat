import { useEffect, useState } from 'react';
import { COLS, MINES, newGame, reveal, toggleFlag, flagsUsed } from './minesweeper.js';
import PinPad from './PinPad.jsx';
import GameHeader, { Scores } from './GameHeader.jsx';

export default function Mines({ onCode, passLen, signal, onBack }) {
  const [g, setG] = useState(newGame);
  const [flagMode, setFlagMode] = useState(false);
  const [time, setTime] = useState(0);
  const [pinOpen, setPinOpen] = useState(false);

  useEffect(() => {
    if (!g.started || g.over || pinOpen) return undefined;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [g.started, g.over, pinOpen]);

  const restart = () => { setG(newGame()); setTime(0); };
  const tap = (i) => { if (!pinOpen) setG((s) => (flagMode ? toggleFlag(s, i) : reveal(s, i))); };
  const rightClick = (e, i) => { e.preventDefault(); if (!pinOpen) setG((s) => toggleFlag(s, i)); };

  return (
    <div className="gamewrap themed">
      <div className="game">
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
            <div className="gover">
              <h2>{g.won ? 'You cleared it!' : 'Boom!'}</h2>
              <p>{g.won ? `Time ${time}s` : 'You hit a mine'}</p>
              <button className="gbtn" onClick={restart}>Play again</button>
            </div>
          )}
        </div></div>
        <p className="ghow"><b>How to play:</b> tap a square to dig. Numbers tell how many mines touch it. Switch to Flag (or right-click) to mark mines. Open every safe square to win.</p>
      </div>
    </div>
  );
}
