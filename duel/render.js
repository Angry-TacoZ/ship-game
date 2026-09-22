import { CONFIG as C } from "./config.js";

export function renderArena(
  canvas,
  sim,
  { labels = ["DETERMINISTIC", "DETERMINISTIC"], arcs = true } = {},
) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, C.width, C.height);
  const gradient = ctx.createLinearGradient(0, 0, C.width, C.height);
  gradient.addColorStop(0, "#214453");
  gradient.addColorStop(1, "#152e40");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, C.width, C.height);
  ctx.strokeStyle = "#a5cad00e";
  ctx.lineWidth = 1;
  for (let x = 0; x < C.width; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, C.height);
    ctx.stroke();
  }
  for (let y = 0; y < C.height; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(C.width, y);
    ctx.stroke();
  }
  ctx.setLineDash([10, 12]);
  ctx.strokeStyle = "#9caea64a";
  ctx.strokeRect(60, 60, C.width - 120, C.height - 120);
  ctx.setLineDash([]);
  ctx.font = "16px ui-monospace, monospace";
  ctx.fillStyle = "#9bb9c3";
  ctx.fillText("A", 84, 94);
  ctx.fillText("B", C.width - 102, C.height - 82);
  const [a, b] = sim.ships;
  ctx.setLineDash([5, 12]);
  ctx.strokeStyle = "#d7e4cf28";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const range = Math.hypot(a.x - b.x, a.y - b.y);
  ctx.textAlign = "center";
  ctx.fillStyle = "#b1c4c6";
  ctx.fillText(`${range.toFixed(0)} u`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 18);
  for (const s of sim.ships) {
    const index = s.id === "alpha" ? 0 : 1,
      color = index === 0 ? "#71d4eb" : "#f4b77d";
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.heading);
    // Wake and sharply pointed bow make heading readable at arena scale.
    ctx.strokeStyle = color + "38";
    ctx.lineWidth = 3;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-55, sign * 13);
      ctx.lineTo(-120, sign * 27);
      ctx.lineTo(-185, sign * 35);
      ctx.stroke();
    }
    if (arcs)
      C.turretOffsets.forEach((offset, i) => {
        ctx.save();
        ctx.translate(offset, 0);
        const center = i < 2 ? 0 : Math.PI;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 83, center - C.turretArc, center + C.turretArc);
        ctx.closePath();
        ctx.fillStyle = color + "07";
        ctx.fill();
        ctx.strokeStyle = color + "20";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      });
    ctx.shadowColor = "#0008";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.beginPath();
    ctx.moveTo(62, 0);
    ctx.lineTo(40, -18);
    ctx.lineTo(-48, -18);
    ctx.lineTo(-60, -11);
    ctx.lineTo(-60, 11);
    ctx.lineTo(-48, 18);
    ctx.lineTo(40, 18);
    ctx.closePath();
    ctx.fillStyle = "#71858b";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    for (const [zone, x, w, max] of [
      ["STERN", -58, 28, C.hp / 4],
      ["MIDSHIPS", -30, 60, C.hp / 2],
      ["BOW", 30, 22, C.hp / 4],
    ]) {
      ctx.fillStyle = s.zones[zone] / max < 0.5 ? "#c67756" : "#9eadad";
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x, -13, w, 26);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = "#263b42";
    ctx.lineWidth = 2;
    for (const x of [-30, 30]) {
      ctx.beginPath();
      ctx.moveTo(x, -17);
      ctx.lineTo(x, 17);
      ctx.stroke();
    }
    ctx.fillStyle = "#3a4f56";
    ctx.fillRect(-14, -10, 28, 20);
    ctx.fillStyle = "#b4c2c0";
    ctx.fillRect(-6, -8, 11, 16);
    ctx.fillStyle = "#243840";
    ctx.fillRect(10, -5, 8, 10);
    s.turrets.forEach((t, i) => {
      ctx.save();
      ctx.translate(C.turretOffsets[i], 0);
      ctx.rotate(t.angle - s.heading);
      ctx.fillStyle =
        t.impaired > 0 ? "#f4705c" : t.reload <= 0 ? "#c8d8c8" : "#697f88";
      ctx.strokeStyle = "#182c34";
      ctx.lineWidth = 2;
      ctx.fillRect(-6, -8, 14, 16);
      ctx.strokeRect(-6, -8, 14, 16);
      ctx.fillStyle = t.impaired > 0 ? "#ffb088" : "#dce3d8";
      ctx.fillRect(6, -5, 23, 3);
      ctx.fillRect(6, 2, 23, 3);
      ctx.restore();
    });
    ctx.beginPath();
    ctx.moveTo(76, -6);
    ctx.lineTo(89, 0);
    ctx.lineTo(76, 6);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
    ctx.font = "bold 19px ui-monospace, monospace";
    ctx.fillStyle = color;
    ctx.fillText(`${index === 0 ? "α" : "β"} ${labels[index]}`, s.x, s.y - 126);
    ctx.font = "15px ui-monospace, monospace";
    ctx.fillStyle = "#d1dcd8";
    ctx.fillText(`${s.hp.toFixed(0)} HP`, s.x, s.y - 103);
    const modules = [
      s.modules.engine > 0 ? "ENGINE" : null,
      s.modules.steering > 0 ? "STEERING" : null,
      s.turrets.some((t) => t.impaired > 0) ? "TURRET" : null,
    ].filter(Boolean);
    if (modules.length) {
      ctx.fillStyle = "#ffd49d";
      ctx.fillText(`${modules.join(" / ")} IMPAIRED`, s.x, s.y + 105);
    }
  }
  for (const p of sim.projectiles) {
    ctx.strokeStyle = p.type === "AP" ? "#ffe3a0" : "#ff997a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x - Math.cos(p.angle) * 17, p.y - Math.sin(p.angle) * 17);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  for (const hit of sim.impacts.slice(-30)) {
    const age = sim.timeMs - hit.timeMs;
    if (age > 1700) continue;
    ctx.globalAlpha = Math.max(0, 1 - age / 1700);
    ctx.strokeStyle = hit.outcome === "RICOCHET" ? "#a6d7eb" : "#ffc08c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hit.point.x, hit.point.y, 10 + age / 100, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // One stable label per target prevents twin-shell salvos from drawing over each other.
  for (const ship of sim.ships) {
    const hit = sim.impacts.findLast((h) => h.target === ship.id);
    if (!hit || sim.timeMs - hit.timeMs > 1700) continue;
    ctx.font = "bold 16px ui-monospace, monospace";
    ctx.fillStyle = hit.outcome === "RICOCHET" ? "#a6d7eb" : "#ffc08c";
    ctx.fillText(
      `${hit.actualImpactZone} · ${hit.outcome}`,
      ship.x,
      ship.y + 138,
    );
  }
  ctx.textAlign = "left";
}
