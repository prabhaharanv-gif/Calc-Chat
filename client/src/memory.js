// Pure Memory Match logic (4x4, 8 pairs).
export const FACES = ['🍎', '🍌', '🍇', '🍒', '🍉', '🍋', '🥝', '🍓'];

const shuffle = (a, rnd) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

export function newMemory(rnd = Math.random) {
  const cards = shuffle([...FACES, ...FACES], rnd).map((face, id) => ({ id, face, up: false, done: false }));
  return { cards, first: null, pending: null, moves: 0, matched: 0, won: false };
}

// Turn a card over. A mismatch leaves `pending` set until resolve() flips the two cards back.
export function flip(s, i) {
  if (s.pending || s.won) return s;
  const c = s.cards[i];
  if (!c || c.up || c.done) return s;
  const cards = s.cards.map((x, k) => (k === i ? { ...x, up: true } : x));
  if (s.first === null) return { ...s, cards, first: i };
  const moves = s.moves + 1;
  if (cards[s.first].face === cards[i].face) {
    const done = cards.map((x, k) => (k === s.first || k === i ? { ...x, done: true } : x));
    const matched = s.matched + 1;
    return { ...s, cards: done, first: null, moves, matched, won: matched === FACES.length };
  }
  return { ...s, cards, first: null, moves, pending: [s.first, i] };
}

export function resolve(s) {
  if (!s.pending) return s;
  const cards = s.cards.map((x, k) => (s.pending.includes(k) ? { ...x, up: false } : x));
  return { ...s, cards, pending: null };
}
