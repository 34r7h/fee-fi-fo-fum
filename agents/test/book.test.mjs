// lib/book.mjs reads Castle v2's program back and finds its centre. The program here is assembled the way
// Castle._program and Castle._book build it (swap-vm 1.0.2 opcodes), for both token orderings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { concat, encodeAbiParameters, encodePacked, pad, toHex } from 'viem';
import { readProgram, centreQ96, deviationBps } from '../lib/book.mjs';

const Q96 = 1n << 96n;
const BPS = 10n ** 9n;
const isqrt = (n) => { if (n < 2n) return n; let x = n, y = (x + 1n) / 2n; while (y < x) { x = y; y = (x + n / x) / 2n; } return x; };
const ORDER = [{ type: 'tuple', components: [{ name: 'maker', type: 'address' }, { name: 'traits', type: 'uint256' }, { name: 'data', type: 'bytes' }] }];
const FENCE = '0xcc4c8af3781f1040769a6ecaa4f1b71f2e9bb50f';
const USDC = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238';
const CASTLE = '0xb927206e478d6b232bdb3e8a000a0666e684908e';

// Castle._book's band around the anchor (P = USDC per WETH, or WETH per USDC when USDC sorts first).
function band(anchorQ96, rangeBps, usdcIsLt) {
  const sqrtP = usdcIsLt ? isqrt((Q96 * 10n ** 36n) / anchorQ96) : isqrt((anchorQ96 * 10n ** 36n) / Q96);
  const b = isqrt((BPS + rangeBps) * 10n ** 27n);
  return { sqrtMin: (sqrtP * 10n ** 18n) / b, sqrtMax: (sqrtP * b) / 10n ** 18n };
}

function strategy(epoch, { sqrtMin, sqrtMax }) {
  const program = concat([
    encodePacked(['uint8', 'uint8', 'address', 'uint256', 'uint16', 'address'], [32, 74, FENCE, epoch, 158, USDC]),
    encodePacked(['uint8', 'uint8', 'uint16'], [19, 2, 60]),
    encodePacked(['uint8', 'uint8', 'uint256', 'uint256'], [18, 64, sqrtMin, sqrtMax]),
    encodePacked(['uint8', 'uint8', 'uint32'], [21, 4, 3_000_000]),
    '0x1100',
  ]);
  return encodeAbiParameters(ORDER, [{ maker: CASTLE, traits: 1n << 254n, data: program }]);
}

const epoch = 5067924479523343920357688704886482849781669170077692837114763432112309665792n;
const anchor = (2500n * 10n ** 6n * Q96) / 10n ** 18n;   // 2500 USDC per WETH, as the fork rehearsal seeds it

for (const usdcIsLt of [true, false]) {
  test(`centre of the band is the ENS anchor (usdc sorts ${usdcIsLt ? 'first' : 'second'})`, () => {
    const p = readProgram(strategy(epoch, band(anchor, 50_000_000n, usdcIsLt)));
    assert.equal(p.epoch, epoch);
    assert.equal(p.fence.toLowerCase(), FENCE);
    assert.equal(p.maker.toLowerCase(), CASTLE);
    assert.ok(deviationBps(centreQ96(p, usdcIsLt), anchor) <= 1, 'centre within 1 bp of the anchor');
  });
}

test('a band centred elsewhere is caught: 2% off the anchor reads as ~200 bps', () => {
  const off = (anchor * 102n) / 100n;
  const p = readProgram(strategy(epoch, band(off, 50_000_000n, true)));
  const d = deviationBps(centreQ96(p, true), anchor);
  assert.ok(d >= 199 && d <= 201, `deviation ${d}`);
});

test('a program without the fence at byte 0 is refused', () => {
  const bad = encodeAbiParameters(ORDER, [{ maker: CASTLE, traits: 0n, data: pad(toHex(1n), { size: 160 }) }]);
  assert.throws(() => readProgram(bad), /not a Castle v2 program/);
});
