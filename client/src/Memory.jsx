import { useEffect, useState } from 'react';
import { newMemory, flip, resolve } from './memory.js';
import PinPad from './PinPad.jsx';
import GameHeader, { Scores } from './GameHeader.jsx';

const readBest = () => { try { return Number(localStorage.getItem('mem_best')) || 0; } catch { return 0; } };

export default function Memory({ onCode, passLen, signal, onBack }) {
  const [g, setG] = useState(() => newMemory());
  const [best, setBest] = useState(readBest);
  const [pinOpen, setPinOpen] = useState(false);

  // A wrong pair stays visible for a moment, then flips back.
  useEffect(() => {
    if (!g.pending) return undefined;
    const t = setTimeout(() => setG(resolve), 750);
    return () => clearTimeout(t);
  }, [g.pending]);

  useEffect(() => {
    if (g.won && (!best || g.moves < best)) {
      setBest(g.moves);
      try { localStorage.setItem('mem_best', String(g.moves)); } catch { /* storage blocked */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.won]);

  const restart = () => setG(newMemory());

  return (
    <div className="gamewrap themed">
      <div className="game">
        <GameHeader title="Memory" signal={signal} onBack={onBack} onPin={() => setPinOpen(true)}
          right={<Scores items={[['MOVES', g.moves], ['BEST', best || '-']]} />} />
        <div className="gbar">
          <p>Find all the matching pairs.</p>
          <button className="gbtn" onClick={restart}>New Game</button>
        </div>

        <div className="bwrap"><div className="gbox memboard">
          {g.cards.map((c, i) => (
            <button key={c.id} className={`mcard ${c.up || c.done ? 'up' : ''} ${c.done ? 'done' : ''}`}
              onClick={() => !pinOpen && setG((s) => flip(s, i))} aria-label={c.up || c.done ? c.face : 'Hidden card'}>
              <span className="mface mfront">?</span>
              <span className="mface mback">{c.face}</span>
            </button>
          ))}
          {pinOpen && <PinPad passLen={passLen} onCode={onCode} onClose={() => setPinOpen(false)} />}
          {g.won && (
            <div className="gover">
              <h2>You did it!</h2>
              <p>{g.moves} moves</p>
              <button className="gbtn" onClick={restart}>Play again</button>
            </div>
          )}
        </div></div>
        <p className="ghow"><b>How to play:</b> tap two cards to flip them. If they match they stay open. Match all 8 pairs in as few moves as you can.</p>
      </div>
    </div>
  );
}
