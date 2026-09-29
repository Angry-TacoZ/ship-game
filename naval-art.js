// Painted surface assets are decoded once; terrain and ship detail are cached.
// Gameplay positions, collision radii, and weapon logic live in index.html.
window.NavalArt = (() => {
    const images = {};
    const hulls = new Map();
    const turretTextures = new Map();
    const wakes = new WeakMap();
    let waterTile, shipCrop, foam;
    const islandNames = ['island', 'island-lowland', 'island-spine'];
    const islandSources = [];
    const shellSprites = new Map();
    const waterPatterns = new WeakMap();
    const waterLevels = new Map();
    const segments = 128;
    const stats = { ready: false, failed: false, hullCaches: 0, islandPaints: 0, wakePoints: 0 };

    function canvas(width, height) {
        const result = document.createElement('canvas');
        result.width = width; result.height = height;
        return result;
    }

    function load(name, url) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => { images[name] = image; resolve(); };
            image.onerror = () => reject(new Error(`Unable to load ${url}`));
            image.src = url;
        });
    }

    function prepare() {
        // Blend opposite edge strips for a periodic texture without mirrored
        // quadrants, which create conspicuous diamonds in directional waves.
        waterTile = canvas(1024, 1024);
        const water = waterTile.getContext('2d', { willReadFrequently: true });
        water.drawImage(images.water, 0, 0, 1024, 1024);
        const tile = water.getImageData(0, 0, 1024, 1024);
        const blend = (a, b, weight) => {
            for (let channel = 0; channel < 3; channel++) {
                const left = tile.data[a + channel], right = tile.data[b + channel];
                tile.data[a + channel] = left * (1 - weight) + right * weight;
                tile.data[b + channel] = right * (1 - weight) + left * weight;
            }
        };
        for (let i = 0; i < 96; i++) for (let j = 0; j < 1024; j++) {
            const weight = (1 - i / 96) * 0.5;
            blend((j * 1024 + i) * 4, (j * 1024 + 1023 - i) * 4, weight);
        }
        for (let i = 0; i < 96; i++) for (let j = 0; j < 1024; j++) {
            blend((i * 1024 + j) * 4, ((1023 - i) * 1024 + j) * 4, (1 - i / 96) * 0.5);
        }
        water.putImageData(tile, 0, 0);
        // Tint both passes once. (0.93*T + 0.07*T-offset) is the same blend
        // as the old two texture passes followed by a 20% full-screen tint.
        if (['localhost','127.0.0.1','[::1]'].includes(location.hostname) && new URLSearchParams(location.search).has('profile-render')) window.__profileWaterSource=waterTile;
        const tinted = canvas(1024,1024), tint = tinted.getContext('2d');
        tint.drawImage(waterTile,0,0);tint.fillStyle='rgba(18,59,70,.2)';tint.fillRect(0,0,1024,1024);
        waterTile = tinted;
        waterLevels.set(1024,waterTile);
        for(const size of [128,256,512]){
            const mip=canvas(size,size),mc=mip.getContext('2d');mc.imageSmoothingQuality='high';
            mc.drawImage(waterTile,0,0,size,size);waterLevels.set(size,mip);
        }
        foam = canvas(96, 96);
        const fc = foam.getContext('2d');
        for (let i = 0; i < 60; i++) {
            const angle = i * 2.399963, distance = Math.sqrt(i / 60) * 37;
            const x = 48 + Math.cos(angle) * distance, y = 48 + Math.sin(angle) * distance;
            const radius = 3 + (Math.sin(i * 7.13) + 1) * 4;
            const shade = fc.createRadialGradient(x, y, 0, x, y, radius);
            shade.addColorStop(0, 'rgba(236, 246, 229, .6)'); shade.addColorStop(1, 'rgba(220, 240, 229, 0)');
            fc.fillStyle = shade; fc.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        for (const name of islandNames) {
            const islandSource = canvas(1024, 1024);
            const land = islandSource.getContext('2d', { willReadFrequently: true });
            const source = images[name], fit = 1024 / Math.max(source.width, source.height);
            const width = source.width * fit, height = source.height * fit;
            land.drawImage(source, (1024 - width) / 2, (1024 - height) / 2, width, height);
            const pixels = land.getImageData(0, 0, 1024, 1024).data;
            let sourceExtent = 0;
            for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
                if (pixels[(y * 1024 + x) * 4 + 3] > 40) sourceExtent = Math.max(sourceExtent, Math.hypot(x - 512, y - 512));
            }
            const islandRadii = Array.from({ length: segments }, (_, i) => {
                const a = i * Math.PI * 2 / segments;
                for (let r = 720; r > 0; r--) {
                    const x = Math.round(512 + Math.cos(a) * r), y = Math.round(512 + Math.sin(a) * r);
                    if (x >= 0 && x < 1024 && y >= 0 && y < 1024 && pixels[(y * 1024 + x) * 4 + 3] > 40) return r;
                }
                throw new Error('Island artwork must contain land at its center.');
            });
            islandSources.push({ islandSource, islandRadii, sourceExtent });
        }
        // Trim transparent margins once so deck scale does not depend on padding.
        const ship = canvas(images.ship.width, images.ship.height);
        const sc = ship.getContext('2d', { willReadFrequently: true });
        sc.drawImage(images.ship, 0, 0);
        const data = sc.getImageData(0, 0, ship.width, ship.height).data;
        let x0 = ship.width, y0 = ship.height, x1 = 0, y1 = 0;
        for (let y = 0; y < ship.height; y++) for (let x = 0; x < ship.width; x++) {
            if (data[(y * ship.width + x) * 4 + 3] <= 40) continue;
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
        shipCrop = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
        stats.ready = true;
    }

    const ready = Promise.all([
        load('water', 'assets/art/ocean.png'),
        load('island', 'assets/art/island.png'),
        load('island-lowland', 'assets/art/island-lowland.png'),
        load('island-spine', 'assets/art/island-spine.png'),
        load('ship', 'assets/art/ship-deck.png')
    ]).then(prepare).then(() => true).catch(error => {
        stats.failed = true;
        console.error(error.message);
        return false;
    });

    function ocean(context, x, y, width, height, time = 0) {
        const profile = window.RenderProfile;
        context.save();
        if (stats.ready) {
            const world=context.getTransform();
            const left=world.a*x+world.c*y+world.e,top=world.b*x+world.d*y+world.f;
            const screenWidth=width*world.a,screenHeight=height*world.d;
            context.setTransform(1,0,0,1,0,0);
            // The source still covers 1024 world units; only sample resolution
            // changes. Coarse levels avoid repeatedly filtering 1024px tiles.
            const resolution=world.a<.2?128:world.a<.4?256:world.a<.8?512:1024;
            let patterns=waterPatterns.get(context);if(!patterns){patterns=new Map();waterPatterns.set(context,patterns);}
            let pattern=patterns.get(resolution);
            if(!pattern){pattern=context.createPattern(waterLevels.get(resolution),'repeat');patterns.set(resolution,pattern);stats.waterPatternCreates=(stats.waterPatternCreates||0)+1;}
            profile?.begin('water.pattern');
            const factor=1024/resolution;
            world.a*=factor;world.d*=factor;
            pattern.setTransform(world);context.fillStyle=pattern;
            context.fillRect(left,top,screenWidth,screenHeight);
            profile?.end('water.pattern'); profile?.begin('water.animated');
            context.globalAlpha = 0.07;
            world.e+=Math.sin(time/7000)*12*world.a/factor;world.f+=Math.cos(time/9000)*12*world.d/factor;
            pattern.setTransform(world);context.fillStyle=pattern;
            context.fillRect(left,top,screenWidth,screenHeight);
            profile?.end('water.animated');
        } else {context.fillStyle='#123f4c';context.fillRect(x,y,width,height);}
        context.restore();
    }

    function shorelineRadius(island, angle) {
        const { islandRadii, sourceExtent } = islandSources[island.artVariant ?? 0];
        const rotation = island.seed1 * 0.63;
        const localAngle = ((angle - rotation) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const index = localAngle * segments / (Math.PI * 2), low = Math.floor(index);
        const radius = islandRadii[low] * (1 - (index - low)) + islandRadii[(low + 1) % segments] * (index - low);
        return radius * island.radius * 1.24 / sourceExtent;
    }

    function island(context, island, cx, cy, shoreline) {
        const { islandSource, sourceExtent } = islandSources[island.artVariant ?? 0];
        stats.islandPaints++;
        context.save();
        context.beginPath();
        for (let i = 0; i < segments; i++) {
            const a = i * Math.PI * 2 / segments, r = shoreline(a);
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.closePath(); context.clip();
        context.fillStyle = '#817c5e';
        context.fillRect(cx - island.radius * 1.3, cy - island.radius * 1.3, island.radius * 2.6, island.radius * 2.6);
        context.translate(cx, cy);
        context.rotate(island.seed1 * 0.63);
        const scale = island.radius * 1.24 / sourceExtent;
        context.scale(scale, scale);
        context.drawImage(islandSource, -512, -512);
        context.restore();
    }

    // Straight-moving shells need no history arrays or additional particles.
    function shellTrailGeometry(projectile) {
        const speed = Math.hypot(projectile.vx, projectile.vy);
        const distance = Math.hypot(projectile.x - projectile.originX, projectile.y - projectile.originY);
        const maximumLength = projectile.size > 8 ? 170 : 105;
        return { angle: Math.atan2(projectile.vy, projectile.vx),
            length: Math.min(distance, maximumLength, speed * 12),
            width: projectile.size > 8 ? 13 : 8 };
    }

    function getShellSprites(key) {
        if (!shellSprites.has(key)) {
            const hot = key === 'enemy' ? '245, 111, 65' : '237, 192, 115';
            const trail = canvas(256, 32), tc = trail.getContext('2d');
            const glow = tc.createLinearGradient(0, 0, 256, 0);
            glow.addColorStop(0, `rgba(${hot}, 0)`);
            glow.addColorStop(.45, `rgba(${hot}, .12)`);
            glow.addColorStop(1, `rgba(${hot}, .65)`);
            tc.fillStyle = glow;
            tc.beginPath(); tc.moveTo(0, 16); tc.lineTo(256, 2); tc.lineTo(256, 30); tc.closePath(); tc.fill();
            const core = tc.createLinearGradient(0, 0, 256, 0);
            core.addColorStop(0, 'rgba(255, 242, 213, 0)');
            core.addColorStop(.65, `rgba(${hot}, .35)`);
            core.addColorStop(1, 'rgba(255, 245, 222, .95)');
            tc.fillStyle = core;
            tc.beginPath(); tc.moveTo(0, 16); tc.lineTo(256, 12); tc.lineTo(256, 20); tc.closePath(); tc.fill();
            const head = canvas(48, 32), hc = head.getContext('2d');
            const halo = hc.createRadialGradient(24, 16, 1, 24, 16, 14);
            halo.addColorStop(0, `rgba(${hot}, .65)`); halo.addColorStop(1, `rgba(${hot}, 0)`);
            hc.fillStyle = halo; hc.fillRect(0, 0, 48, 32);
            hc.fillStyle = key === 'enemy' ? '#b56342' : '#a48c61';
            hc.beginPath(); hc.moveTo(12, 12); hc.lineTo(26, 12); hc.lineTo(34, 16);
            hc.lineTo(26, 20); hc.lineTo(12, 20); hc.closePath(); hc.fill();
            hc.fillStyle = '#fff1cf'; hc.fillRect(15, 13, 12, 2);
            shellSprites.set(key, { trail, head });
        }
        return shellSprites.get(key);
    }

    function shell(context, projectile) {
        if (projectile.life <= 0) return;
        const key = projectile.friendly ? (projectile.size > 8 ? 'main' : 'secondary') : 'enemy';
        const sprite = getShellSprites(key), geometry = shellTrailGeometry(projectile);
        context.save(); context.translate(projectile.x, projectile.y); context.rotate(geometry.angle);
        if (geometry.length > 0) context.drawImage(sprite.trail, -geometry.length, -geometry.width / 2, geometry.length, geometry.width);
        const headScale = projectile.size > 8 ? .85 : .55;
        context.drawImage(sprite.head, -24 * headScale, -16 * headScale, 48 * headScale, 32 * headScale);
        context.restore();
    }

    function getHullTexture(nation, length, width, color, trace) {
        const key = `${nation}:${length}:${width}:${color}`;
        if (!hulls.has(key)) {
            const sprite = canvas(Math.ceil(length * 2.4 * 3 + 24), Math.ceil(width * 2 * 3 + 24));
            const sc = sprite.getContext('2d');
            const cx = sprite.width / 2, cy = sprite.height / 2;
            sc.translate(cx, cy); sc.scale(3, 3);
            trace(sc); sc.fillStyle = '#596773'; sc.fill();
            sc.save(); sc.clip();
            const crop = shipCrop;
            sc.drawImage(images.ship, crop.x, crop.y, crop.width, crop.height,
                -length, -width, length * (nation === 'Germany' ? 2.2 : 2), width * 2);
            // Small nation-specific steel tint leaves the painted timber readable.
            sc.globalAlpha = 0.1; sc.fillStyle = color; sc.fillRect(-length, -width, length * 2.2, width * 2);
            sc.restore();
            trace(sc); sc.strokeStyle = '#273d45'; sc.lineWidth = 1; sc.stroke();
            hulls.set(key, { sprite, cx: cx / 3, cy: cy / 3 }); stats.hullCaches = hulls.size;
        }
        const cached = hulls.get(key);
        return { texture: cached.sprite, x: cached.cx, y: cached.cy,
            width: cached.sprite.width / 3, height: cached.sprite.height / 3 };
    }

    function hull(context, nation, length, width, color, trace) {
        if (window.RenderProfile && !window.RenderProfile.enabled('hulls')) return;
        const cached = getHullTexture(nation, length, width, color, trace);
        context.drawImage(cached.texture, -cached.x, -cached.y, cached.width, cached.height);
    }

    function turret(context, size, barrels, barrelLength) {
        const metal = context.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
        metal.addColorStop(0, '#aab5b7'); metal.addColorStop(0.45, '#6d7e87'); metal.addColorStop(1, '#364954');
        context.fillStyle = 'rgba(9, 26, 32, .45)'; context.fillRect(-size / 2 + 2, -size / 2 + 3, size, size);
        context.beginPath(); context.moveTo(-size / 2, -size * 0.3); context.lineTo(-size * 0.3, -size / 2);
        context.lineTo(size / 2, -size * 0.35); context.lineTo(size / 2, size * 0.35);
        context.lineTo(-size * 0.3, size / 2); context.lineTo(-size / 2, size * 0.3); context.closePath();
        context.fillStyle = metal; context.fill(); context.strokeStyle = '#2f414a'; context.lineWidth = 0.9; context.stroke();
        context.fillStyle = '#88969a'; context.fillRect(-size * 0.15, -size * 0.24, size * 0.25, size * 0.2);
        for (let i = 0; i < barrels; i++) {
            const y = (i - (barrels - 1) / 2) * 5;
            context.fillStyle = '#30434e'; context.fillRect(size / 2 - 2, y - 2, barrelLength, 4);
            context.fillStyle = '#a2acaa'; context.fillRect(size / 2 - 2, y - 1.5, barrelLength - 2, 1);
        }
    }

    function getTurretTexture(size, barrels, barrelLength) {
        const key = `${size}:${barrels}:${barrelLength}`;
        if (!turretTextures.has(key)) {
            const padding = 4;
            const width = Math.ceil(padding * 2 + size + barrelLength);
            const height = Math.ceil(padding * 2 + Math.max(size, barrels * 5));
            const sprite = canvas(width, height), context = sprite.getContext('2d');
            const x = padding + size / 2, y = height / 2;
            context.translate(x, y);
            turret(context, size, barrels, barrelLength);
            turretTextures.set(key, { texture: sprite, x, y, width, height });
        }
        return turretTextures.get(key);
    }

    function recordWake(entity, dt) {
        let points = wakes.get(entity);
        if (!points) { points = []; wakes.set(entity, points); }
        points.forEach(p => { p.life -= dt; });
        while (points.length && points[0].life <= 0) points.shift();
        if (Math.hypot(entity.vx || 0, entity.vy || 0) < 0.25) return;
        const last = points[points.length - 1];
        const length = entity.radius * 2.1;
        const x = entity.x - Math.cos(entity.angle) * length, y = entity.y - Math.sin(entity.angle) * length;
        if (!last || Math.hypot(last.x - x, last.y - y) > 5) points.push({ x, y, angle: entity.angle, life: 4500 });
        if (points.length > 100) points.shift();
        stats.wakePoints = points.length;
    }

    function wake(context, entity, view) {
        const points = wakes.get(entity) || [];
        context.save(); context.lineCap = 'round';
        let lastX=Infinity,lastY=Infinity,lastIndex=0;
        const visible=(x,y,padding)=>!view || !(x+padding<view.left || x-padding>view.right || y+padding<view.top || y-padding>view.bottom);
        for (let i = 1; i < points.length; i++) {
            const q = points[i];
            if(!visible(q.x,q.y,entity.radius*2.6)){lastX=Infinity;lastY=Infinity;lastIndex=i;continue;}
            // Only skip subpixel-redundant centers. Normal-zoom foam remains
            // identical; keep spacing below half a tiny ship's foam footprint.
            const spacing=view?Math.min(1,entity.radius*view.zoom*.325):0;
            if(view && i<points.length-1 && Math.hypot(q.x-lastX,q.y-lastY)*view.zoom<spacing)continue;
            const age=Math.max(0,Math.min(1,1-q.life/4500));
            const weight=Number.isFinite(lastX)?Math.max(1,i-lastIndex):1;
            const spread=entity.radius*(.32+age*1.3),size=entity.radius*(.65+age*.6);
            for(const side of [-1,0,1]){
                const jitter=Math.sin(q.x*.13+q.y*.19+side)*entity.radius*.09;
                const x=q.x-Math.sin(q.angle)*(spread*side+jitter),y=q.y+Math.cos(q.angle)*(spread*side+jitter);
                const alpha=(1-age)*Math.min(1,i/12)*(side===0?.37:.27);
                context.globalAlpha=weight===1?alpha:1-Math.pow(1-alpha,weight);
                context.drawImage(foam,x-size/2,y-size/2,size,size);
                stats.wakeDraws=(stats.wakeDraws||0)+1;
            }
            lastX=q.x;lastY=q.y;lastIndex=i;
        }
        const speed = Math.hypot(entity.vx || 0, entity.vy || 0);
        if (speed > 0.3 && visible(entity.x,entity.y,entity.radius*2.4)) {
            context.translate(entity.x, entity.y); context.rotate(entity.angle);
            context.globalAlpha = Math.min(0.6, speed * 0.17); context.strokeStyle = '#ecf5e9'; context.lineWidth = 2;
            const l = entity.radius * 2.1, w = entity.radius * 0.65;
            for (const side of [-1, 1]) {
                context.beginPath(); context.moveTo(l + 2, 0);
                context.quadraticCurveTo(l * 0.7, w * side, l * 0.2, w * side); context.stroke();
            }
        }
        context.restore();
    }

    return { ready, stats, variantCount: islandNames.length, ocean, island, shorelineRadius, shell, shellTrailGeometry,
        renderCacheInfo: () => ({wakeSprites:1,wakeBytes:foam.width*foam.height*4,
            waterBytes:[...waterLevels.values()].reduce((n,c)=>n+c.width*c.height*4,0),hullBytes:[...hulls.values()].reduce((n,h)=>n+h.sprite.width*h.sprite.height*4,0),
            shellBytes:[...shellSprites.values()].reduce((n,s)=>n+(s.trail.width*s.trail.height+s.head.width*s.head.height)*4,0),
            turretBytes:[...turretTextures.values()].reduce((n,s)=>n+s.texture.width*s.texture.height*4,0)}),
        waterTexture: size => waterLevels.get(size), foamTexture: () => foam,
        wakePoints: entity => wakes.get(entity) || [], getHullTexture, getTurretTexture, getShellSprites,
        shellCacheCount: () => shellSprites.size, hull, turret, recordWake, wake, wakeCount: entity => (wakes.get(entity) || []).length };
})();
