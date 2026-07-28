// ============================================================
// test/bootstrap.js — installs tiny, honest fakes for the browser globals
// that src/ modules touch at import time (document, localStorage,
// performance, location, fetch, AudioContext, navigator), so the real
// source files can be imported unmodified under plain Node.
//
// Import this file FIRST (before importing anything under src/) in every
// test file. It is idempotent: calling installGlobals() repeatedly (e.g.
// because several test files import this module) is safe and cheap.
//
// It also exports small factories so individual tests can swap in a
// localStorage that throws on read/write, to exercise storage-resilience
// paths in src/save.js.
// ============================================================

// ---- localStorage -------------------------------------------------
// A real, honest in-memory Storage-like implementation (not a stub of the
// logic under test — just the browser Storage contract backed by a Map).
export function makeMemoryLocalStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    get length() { return map.size; },
    _dump() { return Object.fromEntries(map); }, // test-only convenience
  };
}

// A localStorage that throws on every read AND write, to simulate Safari
// Private Browsing / storage-disabled environments.
export function makeThrowingLocalStorage() {
  return {
    getItem() { throw new DOMException('storage disabled', 'SecurityError'); },
    setItem() { throw new DOMException('storage disabled', 'SecurityError'); },
    removeItem() { throw new DOMException('storage disabled', 'SecurityError'); },
    clear() { throw new DOMException('storage disabled', 'SecurityError'); },
    key() { throw new DOMException('storage disabled', 'SecurityError'); },
    get length() { throw new DOMException('storage disabled', 'SecurityError'); },
  };
}

// ---- document / canvas --------------------------------------------
function makeFakeCtx() {
  // A handful of no-op Canvas2D methods — enough that code which draws
  // doesn't throw. We never assert on drawing, so these stay dumb no-ops.
  const noop = () => {};
  return {
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
    fill: noop, stroke: noop, fillRect: noop, clearRect: noop, strokeRect: noop,
    fillText: noop, strokeText: noop, drawImage: noop, setTransform: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 0 }),
    set fillStyle(v) {}, get fillStyle() { return '#000'; },
    set strokeStyle(v) {}, get strokeStyle() { return '#000'; },
    set globalAlpha(v) {}, get globalAlpha() { return 1; },
    set font(v) {}, get font() { return '10px sans-serif'; },
    set textAlign(v) {}, get textAlign() { return 'left'; },
    set textBaseline(v) {}, get textBaseline() { return 'alphabetic'; },
    set lineWidth(v) {}, get lineWidth() { return 1; },
  };
}

function makeFakeCanvas() {
  const ctx = makeFakeCtx();
  return {
    width: 390, height: 844,
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844, right: 390, bottom: 844 }),
    addEventListener() {}, removeEventListener() {},
  };
}

function makeFakeDocument() {
  return {
    getElementById() { return makeFakeCanvas(); },
    createElement() { return makeFakeCanvas(); },
    documentElement: { clientWidth: 390, clientHeight: 844 },
    addEventListener() {}, removeEventListener() {},
    body: { style: {}, appendChild() {}, addEventListener() {}, removeEventListener() {} },
  };
}

// ---- AudioContext ---------------------------------------------------
class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = {};
  }
  resume() { this.state = 'running'; }
  createGain() {
    return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
  }
  createOscillator() {
    return {
      type: 'sine', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {}, start() {}, stop() {},
    };
  }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
  createBiquadFilter() { return { type: 'lowpass', frequency: { value: 0 }, connect() {} }; }
}

// ---- installer -------------------------------------------------------
let installed = false;
export function installGlobals() {
  if (installed) return;
  installed = true;
  if (!('localStorage' in globalThis)) globalThis.localStorage = makeMemoryLocalStorage();
  if (!('document' in globalThis)) globalThis.document = makeFakeDocument();
  if (!('performance' in globalThis)) globalThis.performance = { now: () => Date.now() };
  if (!('location' in globalThis)) {
    globalThis.location = { href: 'http://localhost/', origin: 'http://localhost', search: '', hostname: 'localhost', pathname: '/' };
  }
  if (!('navigator' in globalThis)) globalThis.navigator = { language: 'en-US', userAgent: 'node-test' };
  if (!('fetch' in globalThis)) {
    // Honest "offline" fake: real network calls are out of scope for this
    // suite, and code under test (aistage.js) is designed to fall back to
    // local generation whenever fetch fails — so a rejecting fetch
    // exercises that real fallback path rather than masking it.
    globalThis.fetch = () => Promise.reject(new Error('network unavailable in test environment'));
  }
  if (!('AudioContext' in globalThis)) globalThis.AudioContext = FakeAudioContext;
  if (!('window' in globalThis)) globalThis.window = globalThis;
}

installGlobals();
