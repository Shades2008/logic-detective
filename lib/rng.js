// Seeded PRNG so a seed always reproduces the same case (tests, room codes).
// Pure JS, no Node APIs: shared by the serverless routes and the browser.

// xmur3: string -> 32-bit seed
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed) {
  let a = hashSeed(String(seed));
  // mulberry32
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(next() * n);
  const pick = (arr) => arr[int(arr.length)];
  const shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const sample = (arr, k) => shuffle(arr).slice(0, k);
  return { next, int, pick, shuffle, sample };
}

export function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}
