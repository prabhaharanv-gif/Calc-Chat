import { useState } from 'react';
import Snake from './Snake.jsx';
import Game2048 from './Game2048.jsx';
import Memory from './Memory.jsx';
import TicTacToe from './TicTacToe.jsx';
import Mines from './Mines.jsx';
import Slide from './Slide.jsx';
import GameHeader from './GameHeader.jsx';
import PinPad from './PinPad.jsx';

// The front screen: a normal-looking games app. Holding ANY game title (or this hub's title) for
// ~2 seconds opens the hidden PIN pad. The titles turn green when a message is waiting.
function Icon2({ id }) {
  const s = { fill: 'none', stroke: '#fff', strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const props = { viewBox: '0 0 64 64', width: 64, height: 64, 'aria-hidden': true };
  switch (id) {
    case 'snake':
      return (
        <svg {...props}>
          <path d="M10 46 C10 30 34 42 34 28 C34 14 54 22 52 12" {...s} strokeWidth={8} />
          <circle cx="52" cy="12" r="5.5" fill="#fff" /><circle cx="54" cy="11" r="1.7" fill="#1c6b3e" />
          <circle cx="14" cy="18" r="5" fill="#ff6b6b" />
        </svg>
      );
    case '2048':
      return (
        <svg {...props}>
          <rect x="5" y="14" width="54" height="36" rx="9" fill="#fff" opacity=".96" />
          <text x="32" y="40" textAnchor="middle" fontSize="21" fontWeight="700" fill="#e0762f" fontFamily="'Baloo 2 Variable', sans-serif">2048</text>
        </svg>
      );
    case 'memory':
      return (
        <svg {...props}>
          <rect x="7" y="14" width="27" height="37" rx="7" fill="#fff" opacity=".9" transform="rotate(-10 20 32)" />
          <rect x="30" y="13" width="27" height="37" rx="7" fill="#fff" transform="rotate(9 43 32)" />
          <text x="43" y="40" textAnchor="middle" fontSize="22" fontWeight="700" fill="#d1479b" fontFamily="'Baloo 2 Variable', sans-serif" transform="rotate(9 43 32)">?</text>
        </svg>
      );
    case 'ttt':
      return (
        <svg {...props}>
          <path d="M24 8V56M40 8V56M8 24H56M8 40H56" {...s} opacity=".85" />
          <path d="M11 11L21 21M21 11L11 21" {...s} strokeWidth={4.5} />
          <circle cx="32" cy="32" r="5.5" {...s} strokeWidth={4.5} />
          <path d="M43 43L53 53M53 43L43 53" {...s} strokeWidth={4.5} />
        </svg>
      );
    case 'mines':
      return (
        <svg {...props}>
          <circle cx="32" cy="34" r="13" fill="#fff" />
          <path d="M32 14V54M12 34H52M18 20L46 48M46 20L18 48" {...s} strokeWidth={4} />
          <circle cx="27" cy="29" r="3.2" fill="#9aa7b8" />
          <path d="M44 12L50 8M52 17L58 15" {...s} strokeWidth={3.5} stroke="#ffd166" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => ((r === 2 && c === 2) ? null : (
            <rect key={`${r}${c}`} x={8 + c * 17} y={8 + r * 17} width="14" height="14" rx="4" fill="#fff" opacity={(r + c) % 2 ? 0.8 : 1} />
          ))))}
        </svg>
      );
  }
}

const GAMES = [
  { id: 'snake', name: 'Snake', C: Snake, a: '#43b36a', b: '#1c6b3e' },
  { id: 'slide', name: 'Slide', C: Slide, a: '#ff8a5c', b: '#d23a63' },
  { id: 'memory', name: 'Memory', C: Memory, a: '#a56bff', b: '#d1479b' },
  { id: 'ttt', name: 'Tic Tac Toe', C: TicTacToe, a: '#4c8dff', b: '#2748c9' },
  { id: 'mines', name: 'Mines', C: Mines, a: '#6b7a92', b: '#252f3f' },
  { id: '2048', name: '2048', C: Game2048, a: '#f6b94b', b: '#e0762f' },
];

export default function Games({ onCode, passLen, signal }) {
  const [cur, setCur] = useState(null);
  const [pinOpen, setPinOpen] = useState(false);
  const game = GAMES.find((g) => g.id === cur);

  if (game) {
    const Game = game.C;
    return <Game onCode={onCode} passLen={passLen} signal={signal} onBack={() => setCur(null)} />;
  }

  return (
    <div className="gamewrap themed hubwrap">
      <div className="game">
        <GameHeader title="Mini Games" signal={signal} onPin={() => setPinOpen(true)} />
        <p className="hubsub">Pick a game to play</p>
        <div className={`hubgrid ${GAMES.length > 6 ? 'three' : ''}`}>
          {GAMES.map((g) => (
            <button key={g.id} className="htile" style={{ '--a': g.a, '--b': g.b }} onClick={() => setCur(g.id)}>
              <span className="hicon"><Icon2 id={g.id} /></span>
              <span className="hname">{g.name}</span>
            </button>
          ))}
        </div>
      </div>
      {pinOpen && (
        <div className="pinfull">
          <PinPad passLen={passLen} onCode={onCode} onClose={() => setPinOpen(false)} />
        </div>
      )}
    </div>
  );
}
