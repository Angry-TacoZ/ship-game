// Loaded only on loopback with ?profile-render; never changes simulation rules.
window.RenderProfile = (() => {
    let disabled = new Set(), current = {}, starts = {}, frameStart = 0, wakeDrawStart=0;
    const samples = [];
    let fixtureIslands;
    const api = {
        get referenceWater() { return window.__profileWaterSource; },
        mode(name = 'full') {
            const modes = { full: [], 'no-water': ['water'], 'no-wakes': ['wakes'], 'no-islands': ['islands'],
                'no-hulls': ['hulls'], 'no-tracers': ['tracers'], 'no-water-wakes': ['water','wakes'] };
            if (!Object.hasOwn(modes, name)) throw new Error('Unknown render profile mode');
            disabled = new Set(modes[name]); samples.length = 0;
        },
        enabled: name => !disabled.has(name),
        beginFrame() { current = {}; starts = {}; frameStart = performance.now();wakeDrawStart=NavalArt.stats.wakeDraws||0; },
        begin(name) { starts[name] = performance.now(); },
        end(name) { current[name] = performance.now() - starts[name]; },
        endFrame() { current.total = performance.now() - frameStart;current.wakeDrawCalls=(NavalArt.stats.wakeDraws||0)-wakeDrawStart; samples.push(current); if (samples.length > 1200) samples.shift(); },
        reset() { samples.length = 0; },
        samples: () => samples.map(sample => ({ ...sample })),
        fixture(waveNumber, movingPlayer, cameraZoom) {
            // Deterministic representative snapshot; modes never touch this state.
            let seed = 913;
            const originalRandom = Math.random;
            Math.random = () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
            try {
                if(!fixtureIslands){initIslands();fixtureIslands=islands;}else islands=fixtureIslands;
                wave = waveNumber; spawnWave(waveNumber);
            } finally { Math.random = originalRandom; }
            player = new Player('USA'); player.x = 0; player.y = 0;
            zoom = cameraZoom; gameState = 'PAUSED'; particles = []; projectiles = []; drops = []; damagePopups = [];
            // Keep all twenty Wave 5 ships on-screen at .45; retain real radii/art.
            const entities = [...enemies, ...(movingPlayer ? [player] : [])];
            entities.forEach((entity,i) => {
                const endX = entity === player ? 0 : (i%5-2)*230;
                const endY = entity === player ? 0 : (Math.floor(i/5)-1.5)*180;
                entity.angle = -.6 + (i%3)*.4; entity.vx = Math.cos(entity.angle)*3; entity.vy = Math.sin(entity.angle)*3;
                entity.x = endX-Math.cos(entity.angle)*600; entity.y = endY-Math.sin(entity.angle)*600;
                for (let tick=0;tick<100;tick++) { entity.x+=Math.cos(entity.angle)*6; entity.y+=Math.sin(entity.angle)*6; NavalArt.recordWake(entity,16.6); }
            });
            if (!movingPlayer) { player.vx=0; player.vy=0; }
            // Visible coast near the camera while keeping the complete seeded map.
            player.x = islands[0].x + islands[0].radius*1.35; player.y = islands[0].y;
            const shiftX=player.x, shiftY=player.y;
            // Move camera/ships together, not coast geometry or collision radius.
            enemies.forEach(e=>{ e.x+=shiftX; e.y+=shiftY; });
            // Re-establish wakes after shifting (new entity histories avoid stale points).
            if (movingPlayer) { player.vx=3; player.vy=0; player.angle=0; }
            entities.forEach(entity => {
                const endX=entity.x,endY=entity.y;
                entity.x-=Math.cos(entity.angle)*600;entity.y-=Math.sin(entity.angle)*600;
                for(let tick=0;tick<100;tick++){entity.x+=Math.cos(entity.angle)*6;entity.y+=Math.sin(entity.angle)*6;NavalArt.recordWake(entity,16.6);}
                entity.x=endX;entity.y=endY;
            });
            for(let i=0;i<60;i++){
                const p=new Projectile(player.x-500+i*16,player.y-200+(i%6)*65,i*.3,i%3!==2,11,77,'#ef4444',i%3===0?13:5);
                p.x+=Math.cos(i*.3)*140;p.y+=Math.sin(i*.3)*140;projectiles.push(p);
            }
            for(let i=0;i<40;i++) particles.push(new Particle(player.x-300+i*15,player.y+200,0,0,1200,'#475569',4));
            return { wave, enemyCount:enemies.length, zoom, movingPlayer,
                wakePoints:entities.reduce((n,e)=>n+NavalArt.wakeCount(e),0),
                maximumWakeSpriteDraws:(enemies.length+1)*99*3,
                islandCaches:islands.map(i=>({width:i.buffer.width,height:i.buffer.height,worldWidth:i.renderGeometry.bufferWidth,worldHeight:i.renderGeometry.bufferHeight})),
                cacheBytes:islands.reduce((n,i)=>n+i.buffer.width*i.buffer.height*4,0) };
        }
    };
    return api;
})();
