// Tiny persistence layer: first-visit flag and personal best.
// localStorage can throw (private mode, blocked site data) or be missing, so
// every access is wrapped and the game falls back to memory for the session.

const KEY = 'logicDetective.v1';
let memory = { seenHowTo: false, best: null };

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      seenHowTo: data.seenHowTo === true,
      best: Number.isFinite(data.best) ? data.best : null,
    };
  } catch {
    return null;
  }
}

export function loadProfile() {
  const stored = read();
  if (stored) memory = stored;
  return { ...memory };
}

export function saveProfile(patch) {
  memory = { ...memory, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(memory));
    return true;
  } catch {
    return false; // memory-only this session
  }
}
