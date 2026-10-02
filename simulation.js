export const TAU = Math.PI * 2;
export const ARENA_RADIUS = 210;
export const RELOAD_TIME = 2.2;
export const CAMERA_HEIGHT = 3.5;
export const WAVE_SIZES = [3, 4, 5];
export const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
export const terrainHeight = (x, z) => Math.sin(x * .022) * Math.sin(z * .026) * 1.2 + Math.sin(x * .058 + z * .035) * .22;
export function seededRandom(seed = 7391) {
  return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed); seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed); return ((seed ^ seed >>> 14) >>> 0) / 4294967296; };
}
export function segmentSphere(a, b, center, radius) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const ox = a.x - center.x, oy = a.y - center.y, oz = a.z - center.z;
  const aa = dx * dx + dy * dy + dz * dz;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c <= 0) return 0;
  if (aa === 0) return null;
  const bb = ox * dx + oy * dy + oz * dz;
  const discriminant = bb * bb - aa * c;
  if (discriminant < 0) return null;
  const t = (-bb - Math.sqrt(discriminant)) / aa;
  return t >= 0 && t <= 1 ? t : null;
}
export function createObstacles() {
  return [
    { x: -28, z: 23, radius: 6, height: 4.5, kind: 'rock' },
    { x: 34, z: 6, radius: 7, height: 5.2, kind: 'rock' },
    { x: -54, z: -38, radius: 9, height: 7.3, kind: 'rock' },
    { x: 86, z: 32, radius: 8, height: 5, kind: 'rock' },
    { x: -89, z: 65, radius: 10, height: 6.7, kind: 'rock' },
    { x: 18, z: -105, radius: 7, height: 6, kind: 'rock' },
    { x: -118, z: -66, radius: 12, height: 9, kind: 'rock' },
    { x: 122, z: -88, radius: 9, height: 7, kind: 'rock' },
    { x: -10, z: 137, radius: 7, height: 5, kind: 'rock' },
    { x: 95, z: 121, radius: 9, height: 6, kind: 'rock' },
    { x: 71, z: -64, radius: 12, height: 7, kind: 'ruin' },
    { x: -108, z: -135, radius: 11, height: 8, kind: 'ruin' },
    { x: -64, z: 128, radius: 11, height: 6, kind: 'ruin' }
  ];
}

export class BattleSimulation {
  constructor({ random = seededRandom(8641) } = {}) {
    this.random = random;
    this.obstacles = createObstacles();
    this.reset();
  }
  reset() {
    this.player = { x: 0, z: 68, yaw: 0, aim: 0, pitch: -.018, speed: 0, hp: 100, reload: 0 };
    this.enemies = [];
    this.projectiles = [];
    this.events = [];
    this.status = 'ready';
    this.wave = 0;
    this.kills = 0;
    this.score = 0;
    this.shots = 0;
    this.hits = 0;
    this.elapsed = 0;
    this.nextWave = 0;
    this.nextId = 1;
    this.spawnWave(0);
  }
  start() { if (this.status === 'ready' || this.status === 'paused') this.status = 'playing'; }
  pause() { if (this.status === 'playing') { this.status = 'paused'; this.player.speed = 0; } }
  emit(type, properties = {}) { this.events.push({ type, ...properties }); }
  spawnWave(index) {
    const positions = [
      [[0, -23], [-63, -57], [58, -28]],
      [[-108, 10], [104, -15], [-65, -114], [58, -130]],
      [[-122, 95], [135, 75], [20, -158], [-140, -98], [133, -119]]
    ][index];
    positions.forEach(([x, z], i) => {
      const yaw = Math.atan2(-(this.player.x - x), -(this.player.z - z));
      this.enemies.push({ id: this.nextId++, x, z, yaw, aim: yaw, hp: 100, cooldown: 5 + i * 1.6, phase: this.random() * TAU, speed: 0, deadTime: 0 });
    });
    this.emit('wave', { wave: index + 1 });
  }
  moveBody(body, dx, dz, radius = 3.2) {
    let nx = body.x + dx, nz = body.z + dz;
    for (let pass = 0; pass < 2; pass++) {
      for (const obstacle of this.obstacles) {
        const ox = nx - obstacle.x, oz = nz - obstacle.z;
        const dist = Math.hypot(ox, oz), min = radius + obstacle.radius;
        if (dist < min) {
          if (dist < .001) { nx = obstacle.x + min; nz = obstacle.z; }
          else { nx = obstacle.x + ox / dist * min; nz = obstacle.z + oz / dist * min; }
        }
      }
    }
    const dist = Math.hypot(nx, nz);
    if (dist > ARENA_RADIUS - radius) { nx *= (ARENA_RADIUS - radius) / dist; nz *= (ARENA_RADIUS - radius) / dist; }
    body.x = nx; body.z = nz;
  }
  aim(dx, dy, sensitivity = 1) {
    if (this.status !== 'playing') return;
    this.player.aim = wrapAngle(this.player.aim - dx * .0019 * sensitivity);
    this.player.pitch = clamp(this.player.pitch - dy * .0015 * sensitivity, -.25, .28);
  }
  fire() {
    const p = this.player;
    if (this.status !== 'playing' || p.reload > 0) return false;
    const y = terrainHeight(p.x, p.z) + CAMERA_HEIGHT;
    const direction = { x: -Math.sin(p.aim) * Math.cos(p.pitch), y: Math.sin(p.pitch), z: -Math.cos(p.aim) * Math.cos(p.pitch) };
    this.projectiles.push({ id: this.nextId++, owner: 'player', x: p.x + direction.x * 5, y: y + direction.y * 5, z: p.z + direction.z * 5, vx: direction.x * 165, vy: direction.y * 165, vz: direction.z * 165, age: 0 });
    p.reload = RELOAD_TIME;
    this.shots++;
    this.emit('fire', { x: p.x + direction.x * 5, y: y - .35 + direction.y * 5, z: p.z + direction.z * 5, owner: 'player' });
    return true;
  }
  enemyFire(enemy) {
    const p = this.player;
    const distance = Math.hypot(p.x - enemy.x, p.z - enemy.z);
    const spread = 3.8 + distance * .025;
    const tx = p.x + (this.random() - .5) * spread;
    const tz = p.z + (this.random() - .5) * spread;
    const startY = terrainHeight(enemy.x, enemy.z) + 2.5;
    const dx = tx - enemy.x, dz = tz - enemy.z, dy = terrainHeight(p.x, p.z) + 1.6 - startY;
    const norm = Math.hypot(dx, dy, dz);
    this.projectiles.push({ id: this.nextId++, owner: 'enemy', x: enemy.x + dx / norm * 5, y: startY, z: enemy.z + dz / norm * 5, vx: dx / norm * 48, vy: dy / norm * 48, vz: dz / norm * 48, age: 0 });
    this.emit('fire', { x: enemy.x + dx / norm * 5, y: startY, z: enemy.z + dz / norm * 5, owner: 'enemy' });
  }
  update(dt, input = {}) {
    if (this.status !== 'playing') return;
    dt = clamp(dt, 0, .05);
    this.elapsed += dt;
    const p = this.player;
    p.reload = Math.max(0, p.reload - dt);
    const throttle = Number.isFinite(input.throttle) ? clamp(input.throttle, -1, 1) : (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const turn = Number.isFinite(input.steer) ? clamp(input.steer, -1, 1) : (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const targetSpeed = throttle > 0 ? (input.boost ? 19 : 12.5) * throttle : throttle * 7;
    p.speed += (targetSpeed - p.speed) * Math.min(1, dt * (throttle ? 1.6 : 2.5));
    if (Math.abs(p.speed) < .03) p.speed = 0;
    const rotation = turn * dt * .68 * (input.boost ? .7 : 1);
    p.yaw = wrapAngle(p.yaw + rotation);
    p.aim = wrapAngle(p.aim + rotation);
    this.moveBody(p, -Math.sin(p.yaw) * p.speed * dt, -Math.cos(p.yaw) * p.speed * dt);
    this.aim(((input.aimRight ? 1 : 0) - (input.aimLeft ? 1 : 0)) * dt * 540, ((input.aimDown ? 1 : 0) - (input.aimUp ? 1 : 0)) * dt * 250, input.zoom ? .45 : 1);
    if (input.fire) this.fire();

    for (const e of this.enemies) {
      if (e.hp <= 0) { e.deadTime += dt; continue; }
      const distance = Math.hypot(p.x - e.x, p.z - e.z);
      const targetAim = Math.atan2(-(p.x - e.x), -(p.z - e.z));
      e.aim = wrapAngle(e.aim + wrapAngle(targetAim - e.aim) * Math.min(1, dt * 1.8));
      let steer = targetAim;
      e.speed = distance > 82 ? 3.2 + this.wave * .5 : distance < 38 ? -2.2 : .9;
      if (distance <= 82 && distance >= 38) steer += Math.sin(e.phase) * .65;
      for (const o of this.obstacles) {
        const od = Math.hypot(o.x - e.x, o.z - e.z);
        if (od < o.radius + 13) {
          const away = Math.atan2(-(e.x - o.x), -(e.z - o.z));
          steer = wrapAngle(away + (e.id % 2 ? 1 : -1) * .8);
        }
      }
      e.yaw = wrapAngle(e.yaw + clamp(wrapAngle(steer - e.yaw), -dt * .6, dt * .6));
      this.moveBody(e, -Math.sin(e.yaw) * e.speed * dt, -Math.cos(e.yaw) * e.speed * dt);
      // Hulls are solid, including other tanks.
      const pd = Math.hypot(p.x - e.x, p.z - e.z);
      if (pd < 6.4) {
        const nx = pd > .001 ? (p.x - e.x) / pd : 1;
        const nz = pd > .001 ? (p.z - e.z) / pd : 0;
        this.moveBody(p, nx * (6.4 - pd), nz * (6.4 - pd));
        p.speed *= .9;
      }
      for (const other of this.enemies) {
        if (other.id <= e.id || other.hp <= 0) continue;
        const ed = Math.hypot(e.x - other.x, e.z - other.z);
        if (ed < 6.4) this.moveBody(e, ed > .001 ? (e.x - other.x) / ed * (6.4 - ed) : 6.4, ed > .001 ? (e.z - other.z) / ed * (6.4 - ed) : 0);
      }
      e.cooldown -= dt;
      if (e.cooldown <= 0 && distance < 170 && Math.abs(wrapAngle(targetAim - e.aim)) < .15) {
        this.enemyFire(e);
        e.cooldown = 6 + this.random() * 3 - this.wave * .7;
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const shell = this.projectiles[i];
      const from = { x: shell.x, y: shell.y, z: shell.z };
      shell.x += shell.vx * dt; shell.y += shell.vy * dt; shell.z += shell.vz * dt; shell.age += dt;
      let hit = null, fraction = Infinity;
      const candidates = shell.owner === 'player' ? this.enemies.filter(e => e.hp > 0) : [p];
      for (const target of candidates) {
        const t = segmentSphere(from, shell, { x: target.x, y: terrainHeight(target.x, target.z) + 1.8, z: target.z }, 3.1);
        if (t !== null && t < fraction) { fraction = t; hit = { kind: shell.owner === 'player' ? 'enemy' : 'player', target }; }
      }
      for (const o of this.obstacles) {
        const t = segmentSphere(from, shell, { x: o.x, y: terrainHeight(o.x, o.z) + o.height * .35, z: o.z }, o.radius * .85);
        if (t !== null && t < fraction) { fraction = t; hit = { kind: 'ground' }; }
      }
      // Interpolate terrain impact so a shell cannot pass through a dune within a frame.
      for (let s = 1; s <= 4; s++) {
        const t = s / 4;
        const x = from.x + (shell.x - from.x) * t, y = from.y + (shell.y - from.y) * t, z = from.z + (shell.z - from.z) * t;
        if (y <= terrainHeight(x, z) && t < fraction) { fraction = t; hit = { kind: 'ground' }; break; }
      }
      if (hit) {
        const position = { x: from.x + (shell.x - from.x) * fraction, y: from.y + (shell.y - from.y) * fraction, z: from.z + (shell.z - from.z) * fraction };
        if (hit.kind === 'enemy') {
          hit.target.hp = Math.max(0, hit.target.hp - 60);
          this.hits++;
          this.score += 50;
          this.emit('hit', { ...position, id: hit.target.id });
          if (hit.target.hp <= 0) {
            this.kills++;
            this.score += 250;
            this.emit('destroyed', { x: hit.target.x, y: terrainHeight(hit.target.x, hit.target.z) + 1.8, z: hit.target.z, id: hit.target.id });
          }
        } else if (hit.kind === 'player') {
          p.hp = Math.max(0, p.hp - (10 + this.wave * 2));
          this.emit('damage', { ...position, health: p.hp });
          if (p.hp <= 0) { this.status = 'lost'; p.speed = 0; this.emit('end', { victory: false }); }
        }
        this.emit('impact', { ...position, kind: hit.kind });
        this.projectiles.splice(i, 1);
      } else if (shell.age > 7 || Math.hypot(shell.x, shell.z) > 430) this.projectiles.splice(i, 1);
    }
    if (this.status !== 'playing') return;
    if (this.enemies.every(e => e.hp <= 0)) {
      if (!this.nextWave) { this.nextWave = 4; this.emit('clear', { wave: this.wave + 1 }); }
      this.nextWave -= dt;
      if (this.nextWave <= 0) {
        if (this.wave === WAVE_SIZES.length - 1) { this.status = 'won'; this.score += Math.round(p.hp * 10); p.speed = 0; this.emit('end', { victory: true }); }
        else {
          this.wave++;
          p.hp = Math.min(100, p.hp + 25);
          this.projectiles.length = 0;
          this.spawnWave(this.wave);
        }
        this.nextWave = 0;
      }
    }
  }
}
