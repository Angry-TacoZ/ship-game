import test from 'node:test';
import assert from 'node:assert/strict';
import { DuelRunner } from '../duel/runner.js';
import { INITIAL_ACTION, rng, streamSeed } from '../duel/config.js';

test('four independent role/side conditions apply the asynchronous action to the assigned ship', async () => {
  for (const contenderShip of ['alpha', 'bravo']) for (const swapped of [false, true]) {
    const r = new DuelRunner({ contenderShip, swapped, mode: 'MOCK', clock: () => 0,
      requestDecision: async () => ({action: INITIAL_ACTION, providerLatencyMs: 0, model: 'MOCK'}) });
    r.tick();
    await new Promise(resolve => setImmediate(resolve));
    r.tick();
    assert.equal(r.latest[contenderShip].controller, 'MOCK_DELAYED_RULES');
    assert.equal(r.latest[contenderShip].ship, contenderShip);
    assert.equal(r.summary().ships.find(s => s.id === 'alpha').startingSide, swapped ? 'B' : 'A');
    assert.equal(r.summary().ships.find(s => s.id === 'alpha').rngRole, 'R0');
    assert.equal(r.summary().ships.find(s => s.id === 'bravo').rngRole, 'R1');
    r.dispose();
  }
});
test('named RNG streams reproduce and consumption in one purpose cannot perturb another', () => {
  const a = rng(streamSeed(42, 'R0', 'dispersion')), b = rng(streamSeed(42, 'R0', 'dispersion'));
  const modules = rng(streamSeed(42, 'R0', 'modules'));
  for (let i=0;i<100;i++) { modules(); assert.equal(a(), b()); }
  assert.notEqual(streamSeed(42,'R0','dispersion'), streamSeed(42,'R1','dispersion'));
});
