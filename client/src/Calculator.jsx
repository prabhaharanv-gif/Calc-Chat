import { useState, useEffect, useCallback } from 'react';

// Safe evaluator (no eval): + - × ÷ with precedence, decimals, unary minus.
function evaluate(expr) {
  const tokens = expr.match(/\d+\.?\d*|\.\d+|[+\-×÷]/g);
  if (!tokens) return '0';
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '-' && (i === 0 || /[+\-×÷]/.test(tokens[i - 1])) && tokens[i + 1]) {
      out.push(String(-parseFloat(tokens[++i])));
    } else out.push(t);
  }
  const pass = (ops) => {
    for (let i = 1; i < out.length - 1; ) {
      if (ops.includes(out[i])) {
        const a = parseFloat(out[i - 1]);
        const b = parseFloat(out[i + 1]);
        const r = out[i] === '+' ? a + b : out[i] === '-' ? a - b : out[i] === '×' ? a * b : a / b;
        out.splice(i - 1, 3, String(r));
      } else i += 2;
    }
  };
  pass(['×', '÷']);
  pass(['+', '-']);
  const n = parseFloat(out[0]);
  if (!isFinite(n)) return 'Error';
  return String(parseFloat(n.toPrecision(12)));
}

const KEYS = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '='];

export default function Calculator({ onCode, signal }) {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('');
  const [typed, setTyped] = useState(false); // true only if the digits were typed by hand

  const press = useCallback(
    async (k) => {
      if (k === 'C') { setExpr(''); setResult(''); setTyped(false); return; }
      if (k === '⌫') { setExpr((e) => e.slice(0, -1)); return; }
      if (k === '%') {
        setExpr((e) => (/^\d+\.?\d*$/.test(e) ? String(parseFloat(e) / 100) : e));
        setTyped(false);
        return;
      }
      if (k === '=') {
        // Typed digits only: could be the passcode (silent: no hint if wrong).
        if (typed && /^\d+$/.test(expr)) {
          const r = await onCode(expr);
          if (r === 'unlock') { setExpr(''); setResult(''); setTyped(false); return; }
        }
        const r = evaluate(expr);
        setResult(r);
        setExpr(r === 'Error' ? '' : r);
        setTyped(false);
        return;
      }
      setResult('');
      setTyped(true);
      setExpr((e) => (e.length < 24 ? e + k : e));
    },
    [expr, typed, onCode]
  );

  useEffect(() => {
    const onKey = (ev) => {
      const map = { '*': '×', '/': '÷', Enter: '=', Backspace: '⌫', Escape: 'C' };
      const k = map[ev.key] ?? ev.key;
      if (/^[0-9.+\-×÷=%C⌫]$/.test(k)) {
        ev.preventDefault();
        press(k);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  return (
    <div className="calc">
      <div className="display">
        <div className={`main ${signal ? 'sig' : ''}`}>{expr || result || '0'}</div>
      </div>
      <div className="keys">
        {KEYS.map((k) => (
          <button
            key={k}
            className={`key ${/[÷×\-+=]/.test(k) ? 'op' : /[C⌫%]/.test(k) ? 'fn' : ''} ${k === '0' ? 'zero' : ''}`}
            onClick={() => press(k)}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
