import { useEffect, useState } from 'react';
import { N, newPuzzle, tap } from './slide.js';
import PinPad from './PinPad.jsx';
import GameHeader, { Scores } from './GameHeader.jsx';

const readBest = () => { try { return Number(localStorage.getItem('slide_best')) || 0; } catch { return 0; } };

export default function Slide({ onCode, passLen, signal, onBack }) {
  const [p, setP] = useState(() => newPuzzle());
  const [best, setBest] = useState(readBest);
  const [pinOpen, setPinOpen] = useState(false);

  useEffect(() => {
    if (p.solved && (!best || p.moves < best)) {
      setBest(p.moves);
      try { localStorage.setItem('slide_best', String(p.moves)); } catch { /* storage blocked */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.solved]);

  const restart = () => setP(newPuzzle());
  // One element per number so React slides the same tile instead of re-creating it.
  const order = p.tiles.map((v, i) => ({ v, i })).filter((t) => t.v).sort((a, b) => a.v - b.v);

  return (
    <div className="gamewrap themed">
      <div className="game">
        <GameHeader title="Slide" signal={signal} onBack={onBack} onPin={() => setPinOpen(true)}
          right={<Scores items={[['MOVES', p.moves], ['BEST', best || '-']]} />} />
        <div className="gbar">
          <p>Put the numbers in order, 1 to 15.</p>
          <button className="gbtn" onClick={restart}>Shuffle</button>
        </div>

        <div className="bwrap"><div className="gbox sboard2">
          {order.map(({ v, i }) => (
            <button key={v} className="stile" style={{ transform: `translate(${(i % N) * 100}%, ${Math.floor(i / N) * 100}%)` }}
              onClick={() => !pinOpen && setP((s) => tap(s, i))}>
              <span>{v}</span>
            </button>
          ))}
          {pinOpen && <PinPad passLen={passLen} onCode={onCode} onClose={() => setPinOpen(false)} />}
          {p.solved && (
            <div className="gover">
              <h2>Solved!</h2>
              <p>{p.moves} moves</p>
              <button className="gbtn" onClick={restart}>Play again</button>
            </div>
          )}
        </div></div>
        <p className="ghow"><b>How to play:</b> tap a tile next to the empty square (or in line with it) to slide it. Finish with 1 to 15 in order.</p>
      </div>
    </div>
  );
}
