import test from 'node:test';
import assert from 'node:assert/strict';
import { DuelSimulation, tacticalSnapshot } from '../duel/simulation.js';
import { TargetTracker } from '../duel/tracking.js';
import { aimSolution, dispersionHalfWidth } from '../duel/combat.js';
import { deterministicPolicy } from '../duel/policy.js';
import { providerRequest } from '../server/jev.js';
import { CONFIG as C } from '../duel/config.js';

test('policies and director cannot read hidden enemy motion; provider has only the canonical track', () => {
  const sim=new DuelSimulation(); const [a,b]=sim.ships;
  for(let i=0;i<36;i++)sim.step();
  const before=tacticalSnapshot(sim,'alpha');
  const aim=aimSolution(a,before.opponent.track,0,'MIDSHIPS');
  b.vx=999; b.vy=-999; b.speed=999; b.heading=2; b.x+=500;
  const after=tacticalSnapshot(sim,'alpha');
  assert.deepEqual(after,before);
  assert.deepEqual(deterministicPolicy(after),deterministicPolicy(before));
  assert.deepEqual(aimSolution(a,after.opponent.track,0,'MIDSHIPS'),aim);
  assert.throws(()=>aimSolution(a,b,0,'MIDSHIPS'),/TargetTrack/);
  const payload=providerRequest(after,'jev-test');
  assert.deepEqual(payload.state.observation.opponent,after.opponent);
  for(const key of ['speed','velocity','vx','vy','heading','position','aspect','action'])
    assert.equal(Object.hasOwn(after.opponent,key),false,key);
});
test('constant-motion intercept hits the predicted track; a later turn and stale track cause real miss distance', () => {
  const sim=new DuelSimulation(), shooter=sim.ships[0], t=new TargetTracker();
  shooter.x=200;shooter.y=300;shooter.heading=0;
  for(let i=0;i<8;i++)t.add({timestamp:i*100,x:1200,y:300+i*4,heading:Math.PI/2});
  const aim=aimSolution(shooter,t.estimate(700),0,'MIDSHIPS');
  const time=aim.flightTimeSeconds;
  const shell={x:aim.origin.x+Math.cos(aim.angle)*C.shellSpeed*time,y:aim.origin.y+Math.sin(aim.angle)*C.shellSpeed*time};
  assert.ok(Math.hypot(shell.x-1200,shell.y-(328+40*time))<1e-7);
  // Target turns east immediately after firing, something the director cannot know.
  assert.ok(Math.hypot(shell.x-(1200+40*time),shell.y-328)>100);
  const stale=t.estimate(1700);
  assert.ok(Math.hypot(stale.position.x-1240,stale.position.y-328)>50);
  assert.ok(stale.positionUncertainty>t.estimate(700).positionUncertainty);
  assert.equal(aimSolution(shooter,t.estimate(2201),0,'MIDSHIPS').usable,false);
});
test('unknown and lost tracks cannot fire; observation cadence is 10Hz', () => {
  const sim=new DuelSimulation(), a=sim.ships[0];
  a.commit({maneuver:'HOLD_COURSE',fire:'FIRE',shell:'HE',aimZone:'MIDSHIPS'});
  assert.equal(a.weapons(sim.trackers.alpha.estimate(0),0).length,0);
  for(let i=0;i<60;i++)sim.step();
  assert.equal(sim.trackResearch.length,22);
  assert.equal(a.weapons(sim.trackers.alpha.estimate(2601),2601).length,0);
});
test('engagement range gives meaningful flight time and spread grows physically with range', () => {
  const sim=new DuelSimulation();
  assert.equal(Math.abs(sim.ships[0].x-sim.ships[1].x),1100);
  assert.ok(C.startingSeparation/C.shellSpeed>2.8);
  assert.deepEqual([500,1000,1500].map(dispersionHalfWidth),[7,16,29]);
});
