// ============================================================
// test/qr.test.js — qrMatrix: size/shape, determinism, and the
// too-long-input null-return contract.
// ============================================================
import './bootstrap.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix } from '../src/qr.js';

test('qrMatrix: returns a square matrix sized for the input', () => {
  const q = qrMatrix('hi');
  assert.ok(q, 'qrMatrix("hi") should not be null — this input easily fits');
  assert.ok(Number.isInteger(q.size) && q.size > 0, 'size must be a positive integer');
  assert.equal(q.modules.length, q.size * q.size, 'modules array must have exactly size*size entries (a square)');
  for (const v of q.modules) assert.ok(v === 0 || v === 1, 'every module must be strictly 0 or 1');
});

test('qrMatrix: bigger payloads never produce a smaller matrix', () => {
  const small = qrMatrix('a');
  const big = qrMatrix('a'.repeat(150));
  assert.ok(small && big, 'both short and moderately long payloads should encode successfully');
  assert.ok(big.size >= small.size, `a longer payload (size ${big.size}) must not choose a smaller QR version than a shorter one (size ${small.size})`);
});

test('qrMatrix: deterministic for the same input', () => {
  const a = qrMatrix('https://example.com/share?id=abc123');
  const b = qrMatrix('https://example.com/share?id=abc123');
  assert.equal(a.size, b.size, 'same input must choose the same QR version both times');
  assert.deepEqual(Array.from(a.modules), Array.from(b.modules), 'same input must produce byte-for-byte identical modules');
});

test('qrMatrix: different inputs generally produce different matrices', () => {
  const a = qrMatrix('EMOJI DROP ULTIMATE - score 1000');
  const b = qrMatrix('EMOJI DROP ULTIMATE - score 2000');
  assert.notDeepEqual(Array.from(a.modules), Array.from(b.modules), 'distinct payloads should not encode to the same matrix');
});

test('qrMatrix: returns null when the input is too long to encode (even at max version)', () => {
  const tooLong = 'x'.repeat(5000);
  assert.equal(qrMatrix(tooLong), null, 'input far beyond version-10 capacity must return null, not throw or truncate silently');
});

test('qrMatrix: a payload right at a practical size still encodes (sanity bound on the null path)', () => {
  const q = qrMatrix('x'.repeat(100));
  assert.ok(q !== null, '100 ASCII chars should still be within version-10/ECC-M capacity');
});
