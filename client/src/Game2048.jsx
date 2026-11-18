import { useCallback, useEffect, useRef, useState } from 'react';
import { newGame, play } from './game2048.js';
import PinPad from './PinPad.jsx';
import GameHeader, { Scores } from './GameHeader.jsx';

const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
const readBest = () => { try { return Number(localStorage.getItem('g2048_best')) || 0; } catch { return 0; } };

export default function Game2048({ onCode, passLen, signal, onBack }) {
  const [game, setGame] = useState(newGame);
  const [best, setBest] = useState(readBest);
  const [keepGoing, setKeepGoing] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const swipe = useRef(null);

  useEffect(() => {
    if (game.score > best) {
      setBest(game.score);
      try { localStorage.setItem('g2048_best', String(game.score)); } catch { /* storage blocked */ }
    }
  }, [game.score, best]);

  const move = useCallback((dir) => setGame((g) => play(g, dir)), []);
  const restart = () => { setGame(newGame()); setKeepGoing(false); };

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
          {(game.over || showWin) && (
            <div className="gover">
              <h2>{game.over ? 'Game over!' : 'You win!'}</h2>
              <div className="row">
                {showWin && <button className="gbtn" onClick={() => setKeepGoing(true)}>Keep going</button>}
                <button className="gbtn" onClick={restart}>{game.over ? 'Try again' : 'New game'}</button>
              </div>
            </div>
          )}
        </div></div>

        <p className="ghow"><b>How to play:</b> swipe (or use the arrow keys) to move the tiles. When two tiles with the same number touch, they merge into one!</p>
      </div>
    </div>
  );
}
