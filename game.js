import { BattleSimulation, RELOAD_TIME, terrainHeight, clamp, TAU } from './simulation.js';
import { DesertWorld } from './world.js';
import { BattleAudio } from './audio.js';

const $ = id => document.getElementById(id);
const sim = new BattleSimulation();
const audio = new BattleAudio();
const canvas = $('gameCanvas'), battlefield = $('battlefield');
const keys = new Set();
let world, zoom = false, sensitivity = 1, lastTime = 0, hudTime = 0, messageTimer = 0, damageTimer = 0, hitTimer = 0;
let pointerDown = false, previouslyLocked = false, previousReload = 0, dialogWasPlaying = false;
const enemyTags = new Map();
const radar = $('radarCanvas'), radarCtx = radar.getContext('2d');
const stateText = new Map();
function text(id, value) { if (stateText.get(id) !== String(value)) { $(id).textContent = value; stateText.set(id, String(value)); } }
function showMessage(message, duration = 3) { text('battleMessage', message); $('battleMessage').classList.add('visible'); messageTimer = duration; }
function clearInput() { keys.clear(); pointerDown = false; }
function releaseMouse() { if (document.pointerLockElement) document.exitPointerLock(); }
function lockMouse() {
  if (sim.status !== 'playing' || document.pointerLockElement === canvas) return;
  try { const request = canvas.requestPointerLock?.(); request?.catch(() => text('driveHint', '方向键瞄准 · 按住鼠标拖动瞄准 · 空格开火')); }
  catch { text('driveHint', '方向键瞄准 · 按住鼠标拖动瞄准 · 空格开火'); }
}
function start({ lock = true } = {}) {
  sim.start(); audio.init();
  $('introPanel').classList.add('hidden'); $('pauseOverlay').classList.add('hidden'); $('endOverlay').classList.add('hidden');
  battlefield.classList.add('playing'); text('missionTag', '进行中');
  canvas.focus({ preventScroll: true });
  if (lock) lockMouse();
  if (sim.elapsed === 0) { showMessage('第一波敌军正在接近 · 保持警戒', 4); text('radioText', '“前方发现三辆敌方坦克。主炮已就绪，自由开火。”'); }
}
function pause() {
  if (sim.status !== 'playing') return;
  sim.pause(); clearInput(); releaseMouse();
  $('pauseOverlay').classList.remove('hidden'); text('missionTag', '已暂停');
}
function reset() {
  clearInput(); releaseMouse(); sim.reset(); world.reset(); zoom = false;
  battlefield.classList.remove('zoomed'); damageTimer = hitTimer = 0;
  $('damageFlash').style.opacity = '0'; $('hitMarker').style.opacity = '0';
  for (const tag of enemyTags.values()) tag.remove(); enemyTags.clear();
  previousReload = 0; start();
}
function toggleZoom() { if (sim.status !== 'playing') return; zoom = !zoom; battlefield.classList.toggle('zoomed', zoom); }
function openDialog(dialog) {
  if (dialog.open) return;
  dialogWasPlaying = sim.status === 'playing';
  if (dialogWasPlaying) pause();
  dialog.showModal();
}
function setSound(value) {
  audio.setEnabled(value);
  $('audioInput').checked = value;
  $('soundBtn').setAttribute('aria-label', value ? '关闭声音' : '开启声音');
  $('soundBtn').title = value ? '关闭声音' : '开启声音';
  $('soundBtn').innerHTML = value ? '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4zM15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4zM16 9l5 6m0-6-5 6"/></svg>';
}

$('startBtn').addEventListener('click', () => { setSound(true); start(); });
$('resumeBtn').addEventListener('click', () => start());
$('restartBtn').addEventListener('click', reset);
$('restartPauseBtn').addEventListener('click', reset);
$('pauseBtn').addEventListener('click', () => { if (sim.status === 'paused') start(); else pause(); });
$('manualBtn').addEventListener('click', () => openDialog($('manualDialog')));
$('allControlsBtn').addEventListener('click', () => openDialog($('manualDialog')));
$('settingsBtn').addEventListener('click', () => openDialog($('settingsDialog')));
$('operationsBtn').addEventListener('click', () => { battlefield.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (sim.status === 'paused') start({ lock: false }); });
$('soundBtn').addEventListener('click', () => setSound(!audio.enabled));
$('audioInput').addEventListener('change', event => setSound(event.target.checked));
$('sensitivityInput').addEventListener('input', event => { sensitivity = Number(event.target.value); $('sensitivityValue').value = sensitivity.toFixed(1); });
$('qualitySelect').addEventListener('change', event => world?.setQuality(event.target.value));
for (const dialog of document.querySelectorAll('dialog')) {
  for (const button of dialog.querySelectorAll('.dialog-close,.dialog-done')) button.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if (dialogWasPlaying && sim.status === 'paused') start({ lock: false }); dialogWasPlaying = false; });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
}
$('fullscreenBtn').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await battlefield.requestFullscreen(); }
  catch { showMessage('当前浏览器不支持全屏，可按 F11 放大战场'); }
});
document.addEventListener('fullscreenchange', () => {
  const fullscreen = !!document.fullscreenElement;
  $('fullscreenBtn').setAttribute('aria-label', fullscreen ? '退出全屏' : '全屏战场');
  $('fullscreenBtn').title = fullscreen ? '退出全屏' : '全屏战场';
  world?.resize();
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (previouslyLocked && !locked && sim.status === 'playing') pause();
  previouslyLocked = locked;
  text('driveHint', locked ? 'WASD 驾驶 · Q 瞄准镜 · Esc 暂停' : '点击画面锁定鼠标 · 方向键也可瞄准');
});
document.addEventListener('pointerlockerror', () => text('driveHint', '方向键瞄准 · 按住鼠标拖动瞄准 · 空格开火'));
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', event => {
  if (sim.status !== 'playing') return;
  canvas.focus({ preventScroll: true });
  if (event.button === 2) { toggleZoom(); return; }
  if (event.button !== 0) return;
  pointerDown = true; sim.fire(); lockMouse();
});
document.addEventListener('pointerup', () => { pointerDown = false; });
document.addEventListener('mousemove', event => {
  if (document.pointerLockElement === canvas || (event.target === canvas && event.buttons === 1)) sim.aim(event.movementX, event.movementY, sensitivity * (zoom ? .45 : 1));
});
window.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
  const gameKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyQ', 'KeyP', 'Escape'];
  if (!gameKeys.includes(event.code)) return;
  // Keep Space/Enter working on interface buttons instead of stealing keyboard clicks.
  if (event.target.tagName === 'BUTTON' && sim.status !== 'playing') return;
  if (event.code !== 'Escape') event.preventDefault();
  if (event.code === 'Escape' || event.code === 'KeyP') {
    if (event.repeat) return;
    if (sim.status === 'playing') pause(); else if (sim.status === 'paused') start({ lock: false });
    return;
  }
  if (event.code === 'KeyQ' && !event.repeat) toggleZoom();
  if (sim.status === 'playing') keys.add(event.code);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { clearInput(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); pause(); } });
window.addEventListener('resize', () => world?.resize());
new ResizeObserver(() => world?.resize()).observe(battlefield);

function end(victory) {
  clearInput(); releaseMouse();
  $('pauseOverlay').classList.add('hidden'); $('endOverlay').classList.remove('hidden');
  text('endIcon', victory ? '✦' : '◇');
  text('endEyebrow', victory ? 'OPERATION COMPLETE' : 'VEHICLE LOST');
  text('endTitle', victory ? '前哨，守住了。' : '战车失去响应。');
  text('endDescription', victory ? '十二辆敌方坦克已被击毁。指挥官，干得漂亮。' : '装甲已耗尽。重新部署，再向沙漠发起挑战。');
  text('endScore', sim.score.toLocaleString()); text('endKills', sim.kills); text('endAccuracy', `${sim.shots ? Math.round(sim.hits / sim.shots * 100) : 0}%`);
  text('missionTag', victory ? '任务完成' : '任务结束');
  text('radioText', victory ? '“前哨安全。所有单位，向指挥官致敬。”' : '“我们失去了战车信号。准备下一次部署。”');
  $('restartBtn').focus({ preventScroll: true });
}
function processEvents() {
  for (const event of sim.events) {
    world.handleEvent(event);
    if (event.type === 'fire') audio.fire(event.owner === 'enemy');
    if (event.type === 'hit') { hitTimer = .65; $('hitMarker').querySelector('span').textContent = '命中目标 +50'; audio.hit(); }
    if (event.type === 'destroyed') { hitTimer = 1.2; $('hitMarker').querySelector('span').textContent = '目标击毁 +250'; audio.explosion(); text('radioText', `“确认击毁。已清除 ${sim.kills} 个目标，继续推进。”`); }
    if (event.type === 'damage') { damageTimer = .65; audio.noise(.4, .3, 650); if (sim.player.hp <= 30 && sim.player.hp > 0) showMessage('装甲危急 · 寻找掩体'); }
    if (event.type === 'wave' && sim.status === 'playing') { showMessage(`第 ${event.wave} 波敌军抵达 · 雷达发现新目标`, 4); text('radioText', event.wave === 1 ? '“前方发现三辆敌方坦克。主炮已就绪，自由开火。”' : '“补给完成，装甲已修复。新一波敌军正在接近。”'); }
    if (event.type === 'clear') showMessage(event.wave === 3 ? '区域安全 · 正在确认战果' : '本波已清除 · 装甲修复中', 4);
    if (event.type === 'end') end(event.victory);
  }
  sim.events.length = 0;
}
function updateHud(dt) {
  const p = sim.player;
  text('health', Math.round(p.hp)); $('healthBar').style.width = `${p.hp}%`;
  $('healthBar').style.background = p.hp > 30 ? '#d1dcb0' : '#e17c55';
  text('healthState', p.hp > 60 ? '状态良好' : p.hp > 30 ? '装甲受损' : '装甲危急');
  text('speed', String(Math.round(Math.abs(p.speed) * 3.6)).padStart(2, '0'));
  text('gear', p.speed > .2 ? `D${Math.min(4, Math.floor(p.speed / 5) + 1)}` : p.speed < -.2 ? 'R' : 'N');
  text('ammo', p.reload > 0 ? '00' : '01');
  text('reloadText', p.reload > 0 ? `自动装填 ${p.reload.toFixed(1)}s` : '主炮已就绪');
  $('reloadBar').style.width = `${(1 - p.reload / RELOAD_TIME) * 100}%`;
  $('reloadDot').style.background = p.reload > 0 ? '#dfa568' : '#cbda9f';
  if (previousReload > 0 && !p.reload && sim.status === 'playing') audio.ready(); previousReload = p.reload;
  let bearing = Math.round(((-p.aim * 180 / Math.PI) % 360 + 360) % 360);
  text('bearing', `${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(bearing / 45) % 8]}  ${String(bearing).padStart(3, '0')}°`);
  text('kills', `${String(sim.kills).padStart(2, '0')} / 12`); text('score', String(sim.score).padStart(4, '0')); text('waveText', `第 ${sim.wave + 1} / 3 波`);
  for (let i = 0; i < 3; i++) $( `wave${i + 1}`).className = i < sim.wave || sim.status === 'won' ? 'done' : i === sim.wave ? 'active' : '';
  $('coordinates').firstChild.textContent = `GRID ${String(Math.round(p.x + 210)).padStart(3, '0')} : ${String(Math.round(p.z + 210)).padStart(3, '0')}`;
  messageTimer = Math.max(0, messageTimer - dt); if (!messageTimer) $('battleMessage').classList.remove('visible');
  damageTimer = Math.max(0, damageTimer - dt); hitTimer = Math.max(0, hitTimer - dt);
  $('damageFlash').style.opacity = String(damageTimer * .7); $('hitMarker').style.opacity = String(Math.min(1, hitTimer * 4));
  let targeted = false, nearest = Infinity;
  const width = battlefield.clientWidth, height = battlefield.clientHeight;
  for (const e of sim.enemies) {
    let tag = enemyTags.get(e.id);
    if (!tag) { tag = document.createElement('div'); tag.className = 'target-tag'; tag.innerHTML = '<span></span><div class="enemy-health"><b></b></div><i></i>'; $('targetMarkers').append(tag); enemyTags.set(e.id, tag); }
    const distance = Math.hypot(e.x - p.x, e.z - p.z);
    const screen = world.project(e.x, terrainHeight(e.x, e.z) + 4.3, e.z);
    const shown = e.hp > 0 && screen.visible && distance < 185;
    tag.hidden = !shown;
    // A CSS display declaration overrides hidden in some browsers; use explicit display.
    tag.style.display = shown ? 'flex' : 'none';
    if (shown) {
      tag.style.left = `${screen.x * width}px`; tag.style.top = `${screen.y * height}px`;
      tag.querySelector('span').textContent = `${String(e.id).padStart(2, '0')} · ${Math.round(distance)} M`;
      tag.querySelector('b').style.width = `${e.hp}%`;
      const center = world.project(e.x, terrainHeight(e.x, e.z) + 1.8, e.z);
      if (Math.hypot((center.x - .5) * width, (center.y - .5) * height) < Math.max(12, height * 3 / distance)) { targeted = true; nearest = Math.min(nearest, distance); }
    }
  }
  $('reticle').classList.toggle('on-target', targeted);
  text('range', targeted ? `${Math.round(nearest)} M` : '— M');
}
function drawRadar(time) {
  const ctx = radarCtx, w = radar.width, h = radar.height, cx = w / 2, cy = h / 2;
  const scale = Math.min(w, h) / 455;
  const mx = x => cx + x * scale, mz = z => cy + z * scale;
  ctx.fillStyle = '#303b2e'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#a6b29113'; ctx.lineWidth = 1;
  for (let x = cx % 37; x < w; x += 37) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = cy % 37; y < h; y += 37) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.strokeStyle = '#a6b29120';
  for (const radius of [60, 120, 185]) { ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.stroke(); }
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(time * .35);
  const gradient = ctx.createConicGradient ? ctx.createConicGradient(-.65, 0, 0) : null;
  if (gradient) { gradient.addColorStop(0, '#bccd9900'); gradient.addColorStop(.1, '#bccd991c'); gradient.addColorStop(.1001, '#bccd9900'); gradient.addColorStop(1, '#bccd9900'); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, 188, -.65, -.02); ctx.lineTo(0, 0); ctx.fill(); }
  ctx.strokeStyle = '#b6c18a26'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(188, 0); ctx.stroke(); ctx.restore();
  for (const o of sim.obstacles) {
    ctx.save(); ctx.translate(mx(o.x), mz(o.z)); ctx.rotate(o.x * .04); ctx.fillStyle = '#a1ac8540'; ctx.strokeStyle = '#b8c29535';
    const size = o.radius * scale * 1.4; ctx.fillRect(-size / 2, -size / 2, size, size * .85); ctx.strokeRect(-size / 2, -size / 2, size, size * .85); ctx.restore();
  }
  const p = sim.player;
  ctx.save(); ctx.translate(mx(p.x), mz(p.z)); ctx.rotate(-p.aim);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 100, -Math.PI / 2 - .49, -Math.PI / 2 + .49); ctx.closePath(); ctx.fillStyle = '#d9dfae13'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fillStyle = '#e7eac7'; ctx.shadowColor = '#dae7a7'; ctx.shadowBlur = 8; ctx.fill(); ctx.restore();
  for (const e of sim.enemies) {
    if (e.hp <= 0) continue;
    ctx.save(); ctx.translate(mx(e.x), mz(e.z)); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#e89964'; ctx.shadowBlur = 9; ctx.shadowColor = '#eb97514a'; ctx.fillRect(-4, -4, 8, 8); ctx.restore();
    ctx.beginPath(); ctx.arc(mx(e.x), mz(e.z), 11 + Math.sin(time * 2) * 2, 0, TAU); ctx.strokeStyle = '#d6905838'; ctx.stroke();
  }
}
function frame(milliseconds) {
  const dt = Math.min((milliseconds - lastTime) / 1000 || .016, .05); lastTime = milliseconds;
  const input = { forward: keys.has('KeyW'), backward: keys.has('KeyS'), left: keys.has('KeyA'), right: keys.has('KeyD'), boost: keys.has('ShiftLeft') || keys.has('ShiftRight'), aimLeft: keys.has('ArrowLeft'), aimRight: keys.has('ArrowRight'), aimUp: keys.has('ArrowUp'), aimDown: keys.has('ArrowDown'), fire: keys.has('Space') || pointerDown, zoom };
  sim.update(dt, input); processEvents(); world.update(sim, dt, zoom); audio.update(sim.player.speed, sim.status === 'playing');
  hudTime += dt;
  if (hudTime >= 1 / 25) { updateHud(hudTime); drawRadar(milliseconds / 1000); hudTime = 0; }
  requestAnimationFrame(frame);
}

try {
  world = new DesertWorld(canvas, sim.obstacles);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); pause(); $('loadingScreen').classList.remove('hidden'); text('loadingText', '图形设备暂时不可用，请刷新页面重新部署。'); });
  world.update(sim, .016, false); updateHud(0); drawRadar(0);
  $('loadingScreen').classList.add('hidden');
  requestAnimationFrame(frame);
} catch (error) {
  console.error('战场初始化失败', error);
  $('loadingScreen').querySelector('strong').textContent = '战场未能启动';
  text('loadingText', '请使用支持 WebGL 2 的新版 Edge 或 Chrome，并启用浏览器图形加速。');
}
export { sim as battle, world as battlefieldView };
