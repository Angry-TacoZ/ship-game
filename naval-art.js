// Painted surface assets are decoded once; terrain and ship detail are cached.
// Gameplay positions, collision radii, and weapon logic live in index.html.
window.NavalArt = (() => {
    const images = {};
    const hulls = new Map();
    const wakes = new WeakMap();
    let waterTile, shipCrop, foam;
    const islandNames = ['island', 'island-lowland', 'island-spine'];
    const islandSources = [];
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
        context.save();
        context.fillStyle = '#123f4c'; context.fillRect(x, y, width, height);
        if (stats.ready) {
            context.fillStyle = context.createPattern(waterTile, 'repeat');
            context.fillRect(x, y, width, height);
            context.globalAlpha = 0.07;
            context.translate(Math.sin(time / 7000) * 12, Math.cos(time / 9000) * 12);
            context.fillRect(x - 16, y - 16, width + 32, height + 32);
            context.globalAlpha = 0.2; context.fillStyle = '#123b46';
            context.fillRect(x - 16, y - 16, width + 32, height + 32);
        }
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

    function hull(context, nation, length, width, color, trace) {
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
        context.drawImage(cached.sprite, -cached.cx, -cached.cy, cached.sprite.width / 3, cached.sprite.height / 3);
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

    function wake(context, entity) {
        const points = wakes.get(entity) || [];
        context.save(); context.lineCap = 'round';
        for (let i = 1; i < points.length; i++) {
            const q = points[i];
            const age = 1 - q.life / 4500, spread = entity.radius * (0.32 + age * 1.3);
            for (const side of [-1, 0, 1]) {
                const jitter = Math.sin(q.x * .13 + q.y * .19 + side) * entity.radius * .09;
                const x = q.x - Math.sin(q.angle) * (spread * side + jitter);
                const y = q.y + Math.cos(q.angle) * (spread * side + jitter);
                const size = entity.radius * (0.65 + age * 0.6);
                context.globalAlpha = (1 - age) * Math.min(1, i / 12) * (side === 0 ? .37 : .27);
                context.drawImage(foam, x - size / 2, y - size / 2, size, size);
            }
        }
        const speed = Math.hypot(entity.vx || 0, entity.vy || 0);
        if (speed > 0.3) {
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

    return { ready, stats, variantCount: islandNames.length, ocean, island, shorelineRadius, hull, turret, recordWake, wake, wakeCount: entity => (wakes.get(entity) || []).length };
})();
