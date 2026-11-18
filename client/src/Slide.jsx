import { useEffect, useRef, useState } from 'react';
import { N, newPuzzle, tap } from './slide.js';
import PinPad from './PinPad.jsx';
import GameHeader, { Scores } from './GameHeader.jsx';
import GameOver from './GameOver.jsx';
import { loadProgress, saveProgress } from './progress.js';

const readBest = () => { try { return Number(localStorage.getItem('slide_best')) || 0; } catch { return 0; } };
const valid = (v) => Array.isArray(v.tiles) && v.tiles.length === N * N && typeof v.moves === 'number';

export default function Slide({ onCode, passLen, signal, onBack }) {
  const [p, setP] = useState(() => loadProgress('slide', valid) || newPuzzle());
  const [best, setBest] = useState(readBest); // fewest moves
  const startBest = useRef(best);
  const [pinOpen, setPinOpen] = useState(false);

  useEffect(() => {
    if (p.solved && (!best || p.moves < best)) {
      setBest(p.moves);
      try { localStorage.setItem('slide_best', String(p.moves)); } catch { /* storage blocked */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.solved]);

  useEffect(() => { saveProgress('slide', p.solved ? null : p); }, [p]);

  const restart = () => { startBest.current = best; setP(newPuzzle()); };
  // One element per number so React slides the same tile instead of re-creating it.
  const order = p.tiles.map((v, i) => ({ v, i })).filter((t) => t.v).sort((a, b) => a.v - b.v);

  return (
    <div className="gamewrap themed">
      <div className="game">
        <GameHeader title="Slide" signal={signal} onBack={onBack} onPin={() => setPinOpen(true)}
          right={<Scores items={[['MOVES', p.moves], ['BEST', best || '-']]} />} />
        <div className="gbar">
          <p>Put the numbers in order, 1 to 15.</p>
          <button className="gbtn" onClick={restart}>New Game</button>
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
            <GameOver emoji="🏆" win title="Solved!" subtitle="All 15 tiles in order" newBest={!startBest.current || p.moves < startBest.current}
              stats={[['Moves', p.moves], ['Best', best || p.moves]]} onAgain={restart} onHome={onBack} />
          )}
        </div></div>
        <p className="ghow"><b>How to play:</b> tap a tile next to the empty square (or in line with it) to slide it. Finish with 1 to 15 in order.</p>
      </div>
    </div>
  );
}
