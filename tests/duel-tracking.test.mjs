import test from 'node:test';
import assert from 'node:assert/strict';
import { TargetTracker, observePose, ageBand } from '../duel/tracking.js';
import { rng, angleDelta } from '../duel/config.js';
const sample = (timestamp, x, y=0, heading=0) => ({timestamp,x,y,heading});
test('observation contract, seeded bounded noise, and physical rotation', () => {
  const a=rng(7), b=rng(7), c=rng(7);
  for(let i=0;i<20;i++) {
    const x=observePose({x:10,y:20,heading:0},i,a);
    assert.deepEqual(x,observePose({x:10,y:20,heading:0},i,b));
    assert.ok(Math.abs(x.x-10)<=1.5 && Math.abs(x.y-20)<=1.5 && Math.abs(x.heading)<=Math.PI/180);
    const mirror=observePose({x:-10,y:-20,heading:Math.PI},i,c,true);
    assert.ok(Math.abs(x.x+mirror.x)<1e-10);
  }
  assert.throws(()=>new TargetTracker().add({...sample(0,0),vx:12}));
});
test('acquisition and straight-line velocity convergence; bounded history', () => {
  const t=new TargetTracker();
  assert.equal(t.estimate(0).quality,'LOST');
  t.add(sample(0,0)); assert.equal(t.estimate(0).estimatedSpeed,null);
  for(let i=1;i<=20;i++) { t.add(sample(i*100,i*4));
    if(i===1) assert.equal(t.estimate(100).maturity,'ROUGH');
    if(i===4) assert.equal(t.estimate(400).maturity,'DEVELOPING');
  }
  const e=t.estimate(2000);
  assert.equal(e.estimatedSpeed,40); assert.equal(e.maturity,'ESTABLISHED');
  assert.equal(e.confidence.overall,1); assert.equal(t.history.length,8);
});
test('heading wrap-around and persisted turn and speed trends', () => {
  const t=new TargetTracker(); t.add(sample(0,0,0,Math.PI-.01));
  t.add(sample(100,1,0,-Math.PI+.01));
  assert.ok(Math.abs(angleDelta(Math.PI,t.estimate(100).estimatedHeading))<.02);
  assert.equal(t.estimate(100).turnTrend,'UNKNOWN');
  for(let i=2;i<20;i++) t.add(sample(i*100,i*i*.1,0,-Math.PI+.01+(i-1)*.024));
  assert.equal(t.estimate(1900).turnTrend,'HARD_STARBOARD');
  assert.equal(t.estimate(1900).speedTrend,'ACCELERATING');
});
test('age bands, confidence degradation, spatial uncertainty and lost track', () => {
  const t=new TargetTracker(); for(let i=0;i<8;i++)t.add(sample(i*100,i*4));
  const fresh=t.estimate(700), stale=t.estimate(1200), older=t.estimate(1700), lost=t.estimate(2201);
  assert.equal(fresh.positionUncertainty,2); assert.equal(stale.positionUncertainty,8); assert.equal(older.positionUncertainty,20);
  assert.ok(stale.confidence.overall<fresh.confidence.overall);
  assert.equal(lost.quality,'LOST'); assert.equal(lost.confidence.overall,0);
  assert.equal(ageBand(151).quality,'GOOD'); assert.equal(ageBand(751).quality,'VERY_STALE');
});
test('maneuver residuals degrade confidence and increase spatial uncertainty', () => {
  const t=new TargetTracker(); for(let i=0;i<8;i++)t.add(sample(i*100,i*4));
  const before=t.estimate(700); t.add(sample(800,60,20,.3)); const after=t.estimate(800);
  assert.ok(after.confidence.overall<before.confidence.overall);
  assert.ok(after.positionUncertainty>before.positionUncertainty);
});
