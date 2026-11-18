// Game progress (the current board) is saved on the device so a game survives going back to the hub,
// locking the app or restarting it. Best scores are stored separately by each game.
const key = (name) => `prog_${name}`;

export function loadProgress(name, isValid) {
  try {
    const v = JSON.parse(localStorage.getItem(key(name)));
    return v && isValid(v) ? v : null;
  } catch { return null; }
}

// Pass null to clear (finished games are not resumed).
export function saveProgress(name, value) {
  try {
    if (value == null) localStorage.removeItem(key(name));
    else localStorage.setItem(key(name), JSON.stringify(value));
  } catch { /* storage blocked */ }
}
