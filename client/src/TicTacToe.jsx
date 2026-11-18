import { useEffect, useState } from 'react';
import { winner, computerMove } from './tictactoe.js';
import PinPad from './PinPad.jsx';
import GameHeader, { Scores } from './GameHeader.jsx';

const readScore = () => {
  try { return JSON.parse(localStorage.getItem('ttt_score')) || { w: 0, l: 0, d: 0 }; } catch { return { w: 0, l: 0, d: 0 }; }
};

export default function TicTacToe({ onCode, passLen, signal, onBack }) {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [turn, setTurn] = useState('X'); // you are X, the computer is O
  const [score, setScore] = useState(readScore);
  const [pinOpen, setPinOpen] = useState(false);
  const result = winner(board);

  // Count the finished game once.
  useEffect(() => {
    if (!result) return;
    setScore((s) => {
      const next = { ...s, w: s.w + (result === 'X' ? 1 : 0), l: s.l + (result === 'O' ? 1 : 0), d: s.d + (result === 'draw' ? 1 : 0) };
      try { localStorage.setItem('ttt_score', JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }, [result]);

  // The computer replies after a short pause.
  useEffect(() => {
    if (turn !== 'O' || result || pinOpen) return undefined;
    const t = setTimeout(() => {
      setBoard((b) => { const n = b.slice(); n[computerMove(b)] = 'O'; return n; });
      setTurn('X');
    }, 520);
    return () => clearTimeout(t);
  }, [turn, result, pinOpen, board]);

  const play = (i) => {
    if (pinOpen || result || turn !== 'X' || board[i]) return;
    const n = board.slice();
    n[i] = 'X';
    setBoard(n);
    setTurn('O');
  };
  const restart = () => { setBoard(Array(9).fill(null)); setTurn('X'); };

  const status = result === 'X' ? 'You win! 🎉' : result === 'O' ? 'Computer wins' : result === 'draw' ? "It's a draw"
    : turn === 'X' ? 'Your turn (X)' : 'Computer is thinking...';

  return (
    <div className="gamewrap themed">
      <div className="game">
        <GameHeader title="Tic Tac Toe" signal={signal} onBack={onBack} onPin={() => setPinOpen(true)}
          right={<Scores items={[['WIN', score.w], ['LOSE', score.l], ['DRAW', score.d]]} />} />
        <div className="gbar">
          <p className="tstatus">{status}</p>
          <button className="gbtn" onClick={restart}>New Game</button>
        </div>

        <div className="bwrap"><div className="gbox tboard">
          {board.map((v, i) => (
            <button key={i} className={`tcell ${v ? `m${v}` : ''}`} onClick={() => play(i)} aria-label={v || 'Empty'}>{v}</button>
          ))}
          {pinOpen && <PinPad passLen={passLen} onCode={onCode} onClose={() => setPinOpen(false)} />}
        </div></div>
        <p className="ghow"><b>How to play:</b> get three in a row (across, down or diagonal) before the computer does.</p>
      </div>
    </div>
  );
}
