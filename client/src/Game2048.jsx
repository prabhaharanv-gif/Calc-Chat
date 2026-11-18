import { useCallback, useEffect, useRef, useState } from 'react';
import { newGame, play } from './game2048.js';
import PinPad from './PinPad.jsx';
import GameHeader, { Scores } from './GameHeader.jsx';
import GameOver from './GameOver.jsx';
import { loadProgress, saveProgress } from './progress.js';

const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
const readBest = () => { try { return Number(localStorage.getItem('g2048_best')) || 0; } catch { return 0; } };
const valid = (v) => v.game && typeof v.game.score === 'number' && Array.isArray(v.game.grid)
  && v.game.grid.length === 4 && v.game.grid.every((r) => Array.isArray(r) && r.length === 4);

export default function Game2048({ onCode, passLen, signal, onBack }) {
  const [saved] = useState(() => loadProgress('2048', valid));
  const [game, setGame] = useState(() => saved?.game || newGame());
  const [keepGoing, setKeepGoing] = useState(() => saved?.keepGoing || false);
  const [best, setBest] = useState(readBest);
  const startBest = useRef(best); // best score when this round began (to show "New best!")
  const [pinOpen, setPinOpen] = useState(false);
  const swipe = useRef(null);

  useEffect(() => {
    if (game.score > best) {
      setBest(game.score);
      try { localStorage.setItem('g2048_best', String(game.score)); } catch { /* storage blocked */ }
    }
  }, [game.score, best]);

  // Keep the board saved; a finished game is not resumed.
  useEffect(() => { saveProgress('2048', game.over ? null : { game, keepGoing }); }, [game, keepGoing]);

  const move = useCallback((dir) => setGame((g) => play(g, dir)), []);
  const restart = () => { startBest.current = best; setGame(newGame()); setKeepGoing(false); };

  useEffect(() => {
    if (pinOpen) return undefined;
    const onKey = (e) => {
      const d = KEYS[e.key];
      if (d) { e.preventDefault(); move(d); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, pinOpen]);

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
  const stats = [['Score', game.score], ['Best', best]];
  const newBest = game.score > 0 && game.score > startBest.current;

  return (
    <div className="gamewrap themed">
      <div className="game">
        <GameHeader title="2048" signal={signal} onBack={onBack} onPin={() => setPinOpen(true)}
          right={<Scores items={[['SCORE', game.score], ['BEST', best]]} />} />
        <div className="gbar">
          <p>Join the numbers and get to the <b>2048 tile!</b></p>
          <button className="gbtn" onClick={restart}>New Game</button>
        </div>

        <div className="bwrap"><div className="gboard" onPointerDown={swDown} onPointerUp={swUp}>
          {game.grid.flat().map((v, i) => (
            <div className="gcell" key={i}>
              {v ? <div key={v} className={`gtile t${v > 2048 ? 'big' : v}`}>{v}</div> : null}
            </div>
          ))}
          {pinOpen && <PinPad passLen={passLen} onCode={onCode} onClose={() => setPinOpen(false)} />}
          {game.over && (
            <GameOver emoji="🧩" title="Game Over" newBest={newBest} stats={stats} onAgain={restart} onHome={onBack} />
          )}
          {showWin && (
            <GameOver emoji="🏆" win title="You Win!" subtitle="You reached the 2048 tile" newBest={newBest} stats={stats}
              onAgain={restart} onHome={onBack}
              extra={<button className="govkeep" onClick={() => setKeepGoing(true)}>Keep Going</button>} />
          )}
        </div></div>

        <p className="ghow"><b>How to play:</b> swipe (or use the arrow keys) to move the tiles. When two tiles with the same number touch, they merge into one!</p>
      </div>
    </div>
  );
}
