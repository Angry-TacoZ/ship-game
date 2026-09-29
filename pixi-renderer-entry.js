import { Container, Graphics, Sprite, Text, Texture, TilingSprite, WebGLRenderer } from 'pixi.js';
import 'pixi.js/sprite-tiling';

class SpritePool {
    constructor(container, texture) { this.container = container; this.texture = texture; this.items = []; this.used = 0; }
    begin() { for (let i = 0; i < this.used; i++) this.items[i].visible = false; this.used = 0; }
    take() {
        let item = this.items[this.used];
        if (!item) { item = new Sprite(this.texture); item.anchor.set(0.5); this.items.push(item); this.container.addChild(item); }
        this.used++; item.visible = true; return item;
    }
}

function solidTexture(size = 32) {
    const source = document.createElement('canvas'); source.width = source.height = size;
    const context = source.getContext('2d');
    context.fillStyle = '#fff'; context.beginPath(); context.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); context.fill();
    return source;
}

function parseColor(value) {
    if (!colorCache.has(value)) {
        if (value.startsWith('rgba')) {
            const [r, g, b, a] = value.match(/[\d.]+/g).map(Number);
            colorCache.set(value, { tint: (r << 16) | (g << 8) | b, alpha: a });
        } else colorCache.set(value, { tint: Number.parseInt(value.replace('#', ''), 16), alpha: 1 });
    }
    return colorCache.get(value);
}
const colorCache = new Map();

class PixiGameRenderer {
    constructor() {
        this.name = 'PixiJS/WebGL'; this.ready = false; this.contextLost = false;
        this.textures = new Map(); this.islandSprites = new WeakMap(); this.islandTextureSources = new Set();
        this.shipPool = []; this.dropPool = []; this.popupPool = []; this.wakeCount = 0;
        this.visible = { islands: 0, ships: 0, projectiles: 0 };
        this.onLost = () => { this.contextLost = true; this.appCanvas.style.display = 'none';
            this.appCanvas.dispatchEvent(new CustomEvent('renderer-context-lost')); };
        this.onRestored = () => { this.contextLost = false; this.appCanvas.style.display = 'block';
            this.appCanvas.dispatchEvent(new CustomEvent('renderer-context-restored')); };
    }

    async init(viewport) {
        if (this.ready) throw new Error('Pixi renderer is already initialized.');
        this.renderer = new WebGLRenderer();
        await this.renderer.init({ width: viewport.width, height: viewport.height, resolution: 1,
            autoDensity: false, backgroundAlpha: 0, antialias: true, preferWebGLVersion: 2 });
        this.appCanvas = this.renderer.canvas;
        this.appCanvas.className = 'pixi-renderer-canvas';
        const gl = this.appCanvas.getContext('webgl2') || this.appCanvas.getContext('webgl');
        const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
        this.gpuRenderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unreported';
        Object.assign(this.appCanvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '6',
            pointerEvents: 'auto', width: `${viewport.width}px`, height: `${viewport.height}px` });
        document.body.appendChild(this.appCanvas);
        this.appCanvas.addEventListener('webglcontextlost', this.onLost);
        this.appCanvas.addEventListener('webglcontextrestored', this.onRestored);

        this.stage = new Container();
        this.waterLayer = new Container(); this.stage.addChild(this.waterLayer);
        this.baseWater = new TilingSprite({ texture: this.texture(NavalArt.waterTexture(512)), width: viewport.width, height: viewport.height });
        this.animatedWater = new TilingSprite({ texture: this.texture(NavalArt.waterTexture(512)), width: viewport.width, height: viewport.height });
        this.animatedWater.alpha = 0.07;
        this.waterLayer.addChild(this.baseWater, this.animatedWater);

        this.world = new Container(); this.stage.addChild(this.world);
        this.islandLayer = new Container(); this.wakeLayer = new Container();
        this.particleLayer = new Container(); this.shipLayer = new Container();
        this.projectileLayer = new Container(); this.popupLayer = new Container();
        this.world.addChild(this.islandLayer, this.wakeLayer, this.particleLayer,
            this.shipLayer, this.projectileLayer, this.popupLayer);

        this.foamPool = new SpritePool(this.wakeLayer, this.texture(NavalArt.foamTexture()));
        this.foamPool.items.length = 0;
        this.particlePool = new SpritePool(this.particleLayer, this.texture(solidTexture()));
        this.dropPool = new SpritePool(this.shipLayer, this.texture(solidTexture(16)));
        this.projectilePool = [];
        this.wakeBow = new Graphics(); this.wakeLayer.addChild(this.wakeBow);
        this.shipRingGraphics = new Graphics(); this.shipLayer.addChild(this.shipRingGraphics);
        this.islandSpritesByWorld = [];
        this.ready = true;
        this.resize(viewport.width, viewport.height);
        return this;
    }

    texture(source) {
        let texture = this.textures.get(source);
        if (!texture) {
            texture = Texture.from(source);
            texture.source.scaleMode = 'linear';
            this.textures.set(source, texture);
        }
        return texture;
    }

    resize(width, height) {
        if (!this.ready && !this.renderer) return;
        this.renderer.resize(width, height);
        Object.assign(this.appCanvas.style, { width: `${width}px`, height: `${height}px` });
        for (const tile of [this.baseWater, this.animatedWater]) { tile.width = width; tile.height = height; }
    }

    beginSprites() {
        this.foamPool.begin(); this.particlePool.begin(); this.dropPool.begin();
        for (let i = 0; i < (this.projectileUsed || 0); i++) { const sprite = this.projectilePool[i]; sprite.visible = false; if (sprite.head) sprite.head.visible = false; }
        this.projectileUsed = 0; this.wakeBow.clear(); this.shipRingGraphics.clear();
        this.visible = { islands: 0, ships: 0, projectiles: 0 };
    }

    render(state, camera, viewport, time, profile) {
        if (!this.ready || this.contextLost) return;
        const mode = name => !profile || profile.enabled(name);
        const phase = (name, draw) => { profile?.begin(name); draw(); profile?.end(name); };
        this.beginSprites();
        phase('water.pattern', () => {
            this.waterLayer.visible = mode('water');
            if (!this.waterLayer.visible) return;
            const resolution = camera.zoom < 0.2 ? 128 : camera.zoom < 0.4 ? 256 : camera.zoom < 0.8 ? 512 : 1024;
            const texture = this.texture(NavalArt.waterTexture(resolution));
            for (const tile of [this.baseWater, this.animatedWater]) {
                if (tile.texture !== texture) tile.texture = texture;
                const worldPixels = 1024 * camera.zoom;
                tile.tileScale.set(worldPixels / resolution);
                tile.tilePosition.set(viewport.width / 2 - camera.x * camera.zoom,
                    viewport.height / 2 - camera.y * camera.zoom);
            }
            this.animatedWater.tilePosition.set(this.baseWater.tilePosition.x + Math.sin(time / 7000) * 12 * camera.zoom,
                this.baseWater.tilePosition.y + Math.cos(time / 9000) * 12 * camera.zoom);
        });
        this.world.position.set(viewport.width / 2 - camera.x * camera.zoom, viewport.height / 2 - camera.y * camera.zoom);
        this.world.scale.set(camera.zoom);
        phase('islands', () => this.drawIslands(state.islands, camera, viewport, mode('islands')));
        phase('wakes', () => { if (mode('wakes')) this.drawWakes([ ...state.enemies, state.player ], camera, viewport); });
        phase('particles', () => this.drawParticles(state.particles, camera, viewport));
        phase('ships', () => this.drawShips(state, mode('hulls'), camera, viewport));
        phase('projectiles', () => { if (mode('tracers')) this.drawProjectiles(state.projectiles, camera, viewport); });
        phase('popups', () => this.drawPopups(state.damagePopups, camera, viewport));
        profile?.begin('minimapUI');
        drawMinimap(); updateDOM();
        profile?.end('minimapUI');
        profile?.begin('total'); this.renderer.render({ container: this.stage }); profile?.end('total');
        profile?.endFrame();
    }

    drawIslands(islands, camera, viewport, enabled) {
        for (const sprite of this.islandLayer.children) sprite.visible = false;
        if (!enabled) { this.islandLayer.visible = false; return; }
        this.islandLayer.visible = true;
        const bounds = { left: camera.x - viewport.width / (2 * camera.zoom), right: camera.x + viewport.width / (2 * camera.zoom),
            top: camera.y - viewport.height / (2 * camera.zoom), bottom: camera.y + viewport.height / (2 * camera.zoom) };
        for (const island of islands) {
            const position = islandBufferWorldPosition(island), geometry = island.renderGeometry;
            if (position.x > bounds.right || position.y > bounds.bottom || position.x + geometry.bufferWidth < bounds.left ||
                position.y + geometry.bufferHeight < bounds.top) continue;
            let sprite = this.islandSprites.get(island);
            if (!sprite) {
                sprite = new Sprite(this.texture(island.buffer)); sprite.anchor.set(0);
                this.islandSprites.set(island, sprite); this.islandTextureSources.add(island.buffer);
            }
            sprite.position.set(position.x, position.y); sprite.width = geometry.bufferWidth; sprite.height = geometry.bufferHeight;
            sprite.visible = true;
            if (sprite.parent !== this.islandLayer) this.islandLayer.addChild(sprite);
            this.visible.islands++;
        }
    }

    drawWakes(entities, camera, viewport) {
        this.foamPool.begin();
        const view = { left: camera.x - viewport.width / (2 * camera.zoom), right: camera.x + viewport.width / (2 * camera.zoom),
            top: camera.y - viewport.height / (2 * camera.zoom), bottom: camera.y + viewport.height / (2 * camera.zoom) };
        const visible = (x, y, p) => !(x + p < view.left || x - p > view.right || y + p < view.top || y - p > view.bottom);
        for (const entity of entities) {
            if (!entity) continue;
            const points = NavalArt.wakePoints(entity); let lastX = Infinity, lastY = Infinity, lastIndex = 0;
            for (let i = 1; i < points.length; i++) {
                const point = points[i];
                if (!visible(point.x, point.y, entity.radius * 2.6)) { lastX = Infinity; lastY = Infinity; lastIndex = i; continue; }
                const spacing = Math.min(1, entity.radius * camera.zoom * 0.325);
                if (i < points.length - 1 && Math.hypot(point.x - lastX, point.y - lastY) * camera.zoom < spacing) continue;
                const age = Math.max(0, Math.min(1, 1 - point.life / 4500));
                const weight = Number.isFinite(lastX) ? Math.max(1, i - lastIndex) : 1;
                const spread = entity.radius * (0.32 + age * 1.3), size = entity.radius * (0.65 + age * 0.6);
                for (const side of [-1, 0, 1]) {
                    const jitter = Math.sin(point.x * 0.13 + point.y * 0.19 + side) * entity.radius * 0.09;
                    const sprite = this.foamPool.take();
                    sprite.position.set(point.x - Math.sin(point.angle) * (spread * side + jitter),
                        point.y + Math.cos(point.angle) * (spread * side + jitter));
                    sprite.width = size; sprite.height = size;
                    const alpha = (1 - age) * Math.min(1, i / 12) * (side === 0 ? 0.37 : 0.27);
                    sprite.alpha = weight === 1 ? alpha : 1 - Math.pow(1 - alpha, weight);
                }
                lastX = point.x; lastY = point.y; lastIndex = i;
            }
            if (Math.hypot(entity.vx || 0, entity.vy || 0) > 0.3 && visible(entity.x, entity.y, entity.radius * 2.4)) {
                const length = entity.radius * 2.1, width = entity.radius * 0.65;
                for (const side of [-1, 1]) {
                    const point = (x, y) => ({ x: entity.x + Math.cos(entity.angle) * x - Math.sin(entity.angle) * y,
                        y: entity.y + Math.sin(entity.angle) * x + Math.cos(entity.angle) * y });
                    const start = point(length + 2, 0), control = point(length * 0.7, width * side), end = point(length * 0.2, width * side);
                    this.wakeBow.moveTo(start.x, start.y).quadraticCurveTo(control.x, control.y, end.x, end.y)
                        .stroke({ color: 0xecf5e9, alpha: Math.min(0.6, Math.hypot(entity.vx || 0, entity.vy || 0) * 0.17), width: 2 });
                }
            }
        }
        this.wakeCount = this.foamPool.used;
    }

    drawParticles(particles, camera, viewport) {
        this.particlePool.begin();
        const bounds = { left: camera.x - viewport.width / (2 * camera.zoom), right: camera.x + viewport.width / (2 * camera.zoom),
            top: camera.y - viewport.height / (2 * camera.zoom), bottom: camera.y + viewport.height / (2 * camera.zoom) };
        for (const particle of particles) {
            if (particle.x + particle.size < bounds.left || particle.x - particle.size > bounds.right ||
                particle.y + particle.size < bounds.top || particle.y - particle.size > bounds.bottom) continue;
            const sprite = this.particlePool.take(), color = parseColor(particle.color);
            sprite.position.set(particle.x, particle.y); sprite.tint = color.tint;
            sprite.alpha = particle.life / particle.maxLife * 0.55 * color.alpha;
            sprite.width = sprite.height = particle.size * 2;
        }
    }

    hullSprite(entity, color) {
        const dimensions = getHullDimensions(entity.radius, entity.nation), width = dimensions.width * 0.72;
        const art = NavalArt.getHullTexture(entity.nation, dimensions.length, width, color,
            graphics => traceShipHull(graphics, entity.nation, entity.radius));
        const sprite = new Sprite(this.texture(art.texture)); sprite.anchor.set(art.x / art.width, art.y / art.height);
        sprite.width = art.width; sprite.height = art.height; return sprite;
    }

    turretSprite(size, barrels, length) {
        const art = NavalArt.getTurretTexture(size, barrels, length), sprite = new Sprite(this.texture(art.texture));
        sprite.anchor.set(art.x / art.width, art.y / art.height); return sprite;
    }

    drawShips(state, showHulls, camera, viewport) {
        this.shipRingGraphics.clear();
        let used = 0;
        const drawShip = (entity, isPlayer) => {
            const extent = entity.radius * 2.4;
            if (entity.x + extent < camera.x - viewport.width / (2 * camera.zoom) || entity.x - extent > camera.x + viewport.width / (2 * camera.zoom) ||
                entity.y + extent < camera.y - viewport.height / (2 * camera.zoom) || entity.y - extent > camera.y + viewport.height / (2 * camera.zoom)) return;
            let root = this.shipPool[used];
            if (!root) { root = new Container(); root.turrets = []; this.shipPool.push(root); this.shipLayer.addChild(root); }
            root.visible = true; used++; root.position.set(entity.x, entity.y); root.rotation = entity.angle;
            const hullColor = isPlayer ? entity.config.hull.color : '#334155';
            if (showHulls) {
                const art = NavalArt.getHullTexture(entity.nation, getHullDimensions(entity.radius, entity.nation).length,
                    getHullDimensions(entity.radius, entity.nation).width * 0.72, hullColor,
                    graphics => traceShipHull(graphics, entity.nation, entity.radius));
                if (!root.hull || root.hull.texture.source.resource !== art.texture) {
                    if (root.hull) root.hull.destroy();
                    root.hull = new Sprite(this.texture(art.texture)); root.addChildAt(root.hull, 0);
                }
                root.hull.visible = true; root.hull.anchor.set(art.x / art.width, art.y / art.height);
                root.hull.width = art.width; root.hull.height = art.height;
            } else if (root.hull) root.hull.visible = false;
            let turretIndex = 0;
            const turret = (x, y, rotation, size, barrels, length) => {
                const art = NavalArt.getTurretTexture(size, barrels, length);
                let sprite = root.turrets[turretIndex];
                if (!sprite) { sprite = new Sprite(this.texture(art.texture)); sprite.anchor.set(art.x / art.width, art.y / art.height);
                    root.turrets.push(sprite); root.addChild(sprite); }
                else if (sprite.texture.source.resource !== art.texture) sprite.texture = this.texture(art.texture);
                sprite.visible = true; sprite.position.set(x, y); sprite.rotation = rotation; turretIndex++;
            };
            if (isPlayer) {
                for (let i = 0; i < (entity.config.secondary.turrets || 8); i++) {
                    const mount = getSecondaryMount(entity.nation, entity.radius, i);
                    turret(mount.x, mount.y, mount.side * Math.PI / 2, 5.5, 1, 6);
                }
                for (let i = 0; i < entity.config.main.turrets; i++)
                    turret((i - (entity.config.main.turrets - 1) / 2) * (entity.radius * 0.7), 0,
                        entity.turretAngle - entity.angle, 22, entity.config.main.barrels, 24);
                this.drawRanges(entity);
            } else {
                for (let i = 0; i < entity.spec.turrets; i++)
                    turret((i - (entity.spec.turrets - 1) / 2) * (entity.radius * 0.8), 0,
                        entity.turretAngle - entity.angle, 18, 1, 18);
            }
            while (turretIndex < root.turrets.length) root.turrets[turretIndex++].visible = false;
            this.visible.ships++;
        };
        for (const enemy of state.enemies) drawShip(enemy, false);
        if (state.player) drawShip(state.player, true);
        for (const drop of state.drops) {
            const sprite = this.dropPool.take(); sprite.position.set(drop.x, drop.y); sprite.tint = 0xfbbf24; sprite.width = sprite.height = 10;
        }
        while (used < this.shipPool.length) this.shipPool[used++].visible = false;
    }

    drawRanges(player) {
        const circle = (radius, dash, gap, color, alpha, lineWidth) => {
            const count = Math.max(24, Math.ceil(Math.PI * 2 * radius / (dash + gap)));
            for (let i = 0; i < count; i++) {
                const start = i * Math.PI * 2 / count, end = start + Math.PI * 2 / count * (dash / (dash + gap));
                this.shipRingGraphics.moveTo(player.x + Math.cos(start) * radius, player.y + Math.sin(start) * radius)
                    .arc(player.x, player.y, radius, start, end).stroke({ color, alpha, width: lineWidth });
            }
        };
        circle(player.config.main.range, 20, 20, 0xef4444, 0.4, 4);
        circle(player.config.secondary.range, 5, 10, 0xffffff, 0.3, 2);
        if (player.waypoint) this.shipRingGraphics.circle(player.waypoint.x, player.waypoint.y, 25).stroke({ color: 0x38bdf8, width: 4 });
    }

    drawProjectiles(projectiles, camera, viewport) {
        const rect = { left: camera.x - viewport.width / (2 * camera.zoom), right: camera.x + viewport.width / (2 * camera.zoom),
            top: camera.y - viewport.height / (2 * camera.zoom), bottom: camera.y + viewport.height / (2 * camera.zoom) };
        for (const projectile of projectiles) {
            if (projectile.life <= 0 || projectile.x < rect.left - 200 || projectile.x > rect.right + 200 ||
                projectile.y < rect.top - 200 || projectile.y > rect.bottom + 200) continue;
            const key = projectile.friendly ? (projectile.size > 8 ? 'main' : 'secondary') : 'enemy';
            const assets = NavalArt.getShellSprites(key), scale = projectile.size > 8 ? 0.85 : 0.55;
            let trail = this.projectilePool[this.projectileUsed];
            if (!trail) {
                trail = new Sprite(this.texture(assets.trail)); trail.anchor.set(1, 0.5);
                trail.head = new Sprite(this.texture(assets.head)); trail.head.anchor.set(0.5);
                this.projectilePool.push(trail); this.projectileLayer.addChild(trail, trail.head);
            }
            this.projectileUsed++; trail.visible = true; trail.head.visible = true;
            const geometry = NavalArt.shellTrailGeometry(projectile);
            trail.position.set(projectile.x, projectile.y); trail.rotation = geometry.angle;
            trail.width = geometry.length; trail.height = geometry.width; trail.alpha = geometry.length > 0 ? 1 : 0;
            trail.head.position.set(projectile.x, projectile.y); trail.head.rotation = geometry.angle;
            trail.head.width = 48 * scale; trail.head.height = 32 * scale;
            this.visible.projectiles++;
        }
    }

    drawPopups(popups, camera, viewport) {
        let i = 0;
        for (const popup of popups) {
            let text = this.popupPool[i];
            if (!text) { text = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 32, fontWeight: 'bold', fill: '#ffffff', align: 'center' } });
                text.anchor.set(0.5); this.popupPool.push(text); this.popupLayer.addChild(text); }
            text.visible = true; text.text = String(popup.text); text.position.set(popup.x, popup.y);
            text.alpha = popup.life / 1000;
            if (text._lastFill !== popup.color) { text.style.fill = popup.color; text._lastFill = popup.color; }
            i++;
        }
        while (i < this.popupPool.length) this.popupPool[i++].visible = false;
    }

    renderInfo() {
        const bytes = [...this.textures.keys()].reduce((sum, source) => sum + source.width * source.height * 4, 0);
        return { renderer: this.contextLost ? 'Canvas2D (WebGL recovering)' : this.name,
            contextLost: this.contextLost, wakeSprites: this.foamPool?.used || 0,
            visibleIslands: this.visible.islands, visibleShips: this.visible.ships,
            visibleProjectiles: this.visible.projectiles, textureBytes: bytes,
            canvasBytes: this.appCanvas.width * this.appCanvas.height * 4, gpuRenderer: this.gpuRenderer };
    }

    forceContextLoss() { this.renderer.context.forceContextLoss(); }
    forceContextRestore() { (this.appCanvas.getContext('webgl2') || this.appCanvas.getContext('webgl'))?.getExtension('WEBGL_lose_context')?.restoreContext(); }

    setVisible(visible) { if (this.appCanvas) this.appCanvas.style.display = visible ? 'block' : 'none'; }

    dispose() {
        if (!this.renderer) return;
        this.appCanvas.removeEventListener('webglcontextlost', this.onLost);
        this.appCanvas.removeEventListener('webglcontextrestored', this.onRestored);
        this.stage.destroy({ children: true });
        // Texture sources are owned by NavalArt and island caches; only destroy
        // Pixi's renderer resources, never the shared Canvas/Image sources.
        this.textures.clear(); this.renderer.destroy(); this.appCanvas.remove();
        this.ready = false; this.renderer = null; this.appCanvas = null;
    }
}

window.PixiGameRenderer = PixiGameRenderer;
