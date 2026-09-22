import { TargetTracker } from '../duel/tracking.js';
// Explicit observation fixture; production callers cannot pass physical ships.
export function stationaryTrack({x,y,heading}) {
  const tracker = new TargetTracker();
  for(let i=0;i<6;i++) tracker.add({timestamp:i*100,x,y,heading});
  return tracker.estimate(500);
}
