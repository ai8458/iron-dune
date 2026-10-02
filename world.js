import * as THREE from './vendor/three.module.js';
import { terrainHeight, seededRandom, TAU, CAMERA_HEIGHT } from './simulation.js';

const random = seededRandom(2817);
const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .92, ...options });
const sand = mat('#b99f70');
const dark = mat('#292e28');
const metal = mat('#40483a', { roughness: .65, metalness: .3 });
const playerPaint = mat('#777b52', { roughness: .8, metalness: .22 });
const playerLight = mat('#929374', { roughness: .85, metalness: .15 });
const enemyPaint = mat('#82765b', { roughness: .9, metalness: .15 });
const rubber = mat('#32352c');
const rust = mat('#8c6950');
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
const unitRock = new THREE.DodecahedronGeometry(1, 0);
// Bake rigid pieces that share a material into one draw call. Turret and gun
// groups remain separate, so aiming and recoil keep their independent motion.
function batchMeshes(parent) {
  const groups = new Map();
  for (const child of [...parent.children]) {
    if (!child.isMesh || child.isInstancedMesh || Array.isArray(child.material)) continue;
    if (!groups.has(child.material)) groups.set(child.material, []);
    groups.get(child.material).push(child);
  }
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => { mesh.updateMatrix(); const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); return g.applyMatrix4(mesh.matrix); });
    const geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      if (!geometries.every(g => g.attributes[name])) continue;
      const attributes = geometries.map(g => g.attributes[name]);
      const buffer = new Float32Array(attributes.reduce((total, a) => total + a.array.length, 0));
      let offset = 0;
      for (const attribute of attributes) { buffer.set(attribute.array, offset); offset += attribute.array.length; }
      geometry.setAttribute(name, new THREE.BufferAttribute(buffer, attributes[0].itemSize));
    }
    geometry.userData.batched = true;
    const merged = new THREE.Mesh(geometry, material);
    merged.castShadow = meshes.some(m => m.castShadow); merged.receiveShadow = meshes.some(m => m.receiveShadow);
    for (const mesh of meshes) parent.remove(mesh);
    for (const g of geometries) g.dispose();
    parent.add(merged);
  }
}
function box(parent, material, x, y, z, sx, sy, sz, ry = 0) {
  const m = new THREE.Mesh(unitBox, material);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function cylinder(parent, material, x, y, z, radius, height, rotationX = 0, rotationZ = 0) {
  const m = new THREE.Mesh(unitCylinder, material);
  m.position.set(x, y, z); m.scale.set(radius, height, radius); m.rotation.set(rotationX, 0, rotationZ);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function beam(parent, a, b, radius, material) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const m = new THREE.Mesh(unitCylinder, material); m.position.copy(start).add(end).multiplyScalar(.5);
  m.scale.set(radius, start.distanceTo(end), radius); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); parent.add(m); return m;
}
function groundTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#c2b292'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 34000; i++) {
    const shade = Math.floor(145 + random() * 65);
    ctx.fillStyle = `rgba(${shade + 25},${shade + 10},${shade - 25},${.1 + random() * .22})`;
    ctx.fillRect(random() * 512, random() * 512, random() * 2 + .5, random() * 1.2 + .5);
  }
  for (let y = 0; y < 512; y += 11) {
    ctx.beginPath(); ctx.strokeStyle = '#7f704912'; ctx.lineWidth = 1;
    for (let x = 0; x <= 512; x += 8) {
      const py = y + Math.sin(x * .02 + y * .1) * 4;
      x ? ctx.lineTo(x, py) : ctx.moveTo(x, py);
    }
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(75, 75); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createTank(isPlayer = false) {
  const root = new THREE.Group(), paint = isPlayer ? playerPaint : enemyPaint;
  const trim = isPlayer ? playerLight : sand;
  box(root, dark, 0, .8, 0, 3.35, .75, 6.1);
  const main = box(root, paint, 0, 1.48, -.1, 3.65, .8, 5.65);
  const nose = box(root, trim, 0, 1.64, -2.65, 3.7, .3, 1.3); nose.rotation.x = -.3;
  box(root, paint, 0, 1.76, 2.05, 3.7, .25, 1.4);
  const wheels = [];
  for (const sign of [-1, 1]) {
    box(root, rubber, sign * 2.02, .69, 0, .81, 1.19, 6.5);
    for (let i = 0; i < 7; i++) {
      const wheel = cylinder(root, metal, sign * 2.45, .67, -2.55 + i * .85, .45, .08, 0, Math.PI / 2); wheels.push(wheel);
      cylinder(root, paint, sign * 2.51, .67, -2.55 + i * .85, .19, .09, 0, Math.PI / 2);
    }
    for (let i = 0; i < 22; i++) box(root, metal, sign * 2.05, 1.26, -3 + i * .285, .9, .06, .13);
    box(root, paint, sign * 2.05, 1.43, 0, 1, .14, 6.65);
    for (let i = 0; i < 4; i++) box(root, paint, sign * 2.53, 1.04, -2.05 + i * 1.4, .11, .65, 1.25);
    for (let i = 0; i < 8; i++) cylinder(root, metal, sign * 1.62, 1.92, -2.2 + i * .6, .037, .034);
    box(root, dark, sign * 1.48, 1.58, -3.05, .4, .28, .12);
    box(root, mat(isPlayer ? '#d4c38e' : '#b2a47b', { emissive: '#978653', emissiveIntensity: .16 }), sign * 1.48, 1.58, -3.13, .26, .18, .02);
  }
  const turret = new THREE.Group(); turret.position.set(0, 2.06, -.05); root.add(turret);
  cylinder(turret, dark, 0, -.1, 0, 1.45, .25);
  box(turret, paint, 0, .23, .1, 2.88, .66, 2.7);
  for (const sign of [-1, 1]) {
    box(turret, trim, sign * 1.33, .3, -.57, .35, .66, 1.7, -sign * .16);
    box(turret, metal, sign * 1.48, .13, 1.35, .13, .75, 1.3);
    box(turret, metal, sign * 1.58, .2, 1.6, .8, .07, 1);
    for (let i = 0; i < 3; i++) cylinder(turret, dark, sign * 1.53, .36, -.54 + i * .32, .12, .3, .6, -sign * .8);
  }
  box(turret, paint, 0, .28, 1.65, 2.7, .65, .55);
  box(turret, trim, -.73, .64, .55, .85, .1, .85);
  cylinder(turret, paint, .55, .64, .45, .58, .14);
  cylinder(turret, trim, .55, .76, .45, .49, .1);
  beam(turret, [.23, .82, .48], [.84, .82, .48], .034, metal);
  box(turret, dark, -.63, .69, -.35, .52, .22, .24);
  box(turret, mat('#3e5549', { metalness: .6, roughness: .16 }), -.63, .73, -.49, .39, .09, .03);
  const gun = new THREE.Group(); gun.position.set(0, .22, -.85); turret.add(gun);
  cylinder(gun, paint, 0, 0, -.35, .42, 1.05, Math.PI / 2);
  cylinder(gun, paint, 0, 0, -2.75, .18, 4.1, Math.PI / 2);
  for (const z of [-1.05, -1.5, -3.2, -4.5]) cylinder(gun, metal, 0, 0, z, .217, .1, Math.PI / 2);
  cylinder(gun, trim, 0, 0, -2, .24, .7, Math.PI / 2);
  cylinder(gun, metal, 0, 0, -4.85, .25, .32, Math.PI / 2);
  cylinder(gun, dark, 0, 0, -5.025, .172, .015, Math.PI / 2);
  // Hinges, roof bolts and a radio whip give the commander's foreground scale.
  for (const x of [-1.1, 1.1]) for (let i = 0; i < 7; i++) cylinder(turret, metal, x, .61, -1 + i * .35, .036, .027);
  cylinder(turret, metal, -1.1, .81, 1.07, .08, .32);
  beam(turret, [-1.1, .85, 1.07], [-1.3, 3.75, 1.3], .018, dark);
  // Deck vents.
  for (let i = 0; i < 10; i++) box(root, dark, 0, 1.92, 1.65 + i * .1, 1.35, .025, .045);
  const camo = isPlayer ? mat('#5f6949') : mat('#655f46');
  box(turret, camo, -.4, .567, -.3, .75, .014, .8, .35);
  box(root, camo, .8, 1.903, -1.8, 1.4, .01, .6, -.2);
  if (!isPlayer) {
    const mark = mat('#be784e');
    box(turret, mark, 0, .57, .13, .14, .025, 1.1);
    box(turret, mark, 0, .57, .13, .8, .025, .14);
  }
  batchMeshes(root); batchMeshes(turret); batchMeshes(gun);
  root.userData = { turret, gun, wheels, main, isPlayer, recoil: 0 };
  return root;
}

export class DesertWorld {
  constructor(canvas, obstacles) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#c0c5b0');
    this.scene.fog = new THREE.FogExp2('#c7c4aa', .0031);
    this.camera = new THREE.PerspectiveCamera(68, 1, .12, 1700);
    this.scene.add(new THREE.HemisphereLight('#e4e9e2', '#968a72', 2.1));
    const sun = new THREE.DirectionalLight('#ffecd0', 3);
    sun.position.set(-90, 90, -140); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -125; sun.shadow.camera.right = 125; sun.shadow.camera.top = 125; sun.shadow.camera.bottom = -125; sun.shadow.camera.near = 1; sun.shadow.camera.far = 420; sun.shadow.bias = -.0004; sun.shadow.normalBias = .12;
    this.scene.add(sun); this.scene.add(sun.target); this.sun = sun;
    this.buildSky(); this.buildTerrain(); this.buildMountains(); this.buildDecor(obstacles); this.buildOutpost();
    this.playerTank = createTank(true); this.scene.add(this.playerTank);
    this.enemyModels = new Map(); this.shellModels = new Map(); this.particles = [];
    this.particleGeometry = new THREE.IcosahedronGeometry(1, 0);
    this.smokeMaterials = [mat('#786b52', { transparent: true, opacity: .28, depthWrite: false }), mat('#96866a', { transparent: true, opacity: .25, depthWrite: false })];
    this.fireMaterial = new THREE.MeshBasicMaterial({ color: '#ffd483', transparent: true, opacity: .9, depthWrite: false });
    this.flash = new THREE.PointLight('#ffa940', 0, 30, 2); this.scene.add(this.flash);
    this.shake = 0; this.bob = 0; this.time = 0; this.dustTimer = 0;
    this.resize();
  }
  buildSky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1300, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#7b999a') }, bottom: { value: new THREE.Color('#e4d4b1') }, sunDir: { value: new THREE.Vector3(-.48, .32, -.82).normalize() } },
      vertexShader: 'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform vec3 top;uniform vec3 bottom;uniform vec3 sunDir;varying vec3 vPosition;void main(){vec3 d=normalize(vPosition);float h=max(d.y,0.);vec3 color=mix(bottom,top,pow(h,.55));float s=max(dot(d,sunDir),0.);color+=vec3(1.,.76,.4)*pow(s,12.)*.14; color+=vec3(1.,.9,.64)*smoothstep(.99955,.99985,s)*.85;gl_FragColor=vec4(color,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}',
    }));
    // Shader chunks must begin on their own preprocessor lines.
    sky.material.fragmentShader = sky.material.fragmentShader.replace(';#include', ';\n#include');
    sky.material.fog = false; this.scene.add(sky);
    const cloudMat = new THREE.MeshBasicMaterial({ color: '#ece0c4', transparent: true, opacity: .11, depthWrite: false });
    for (let i = 0; i < 16; i++) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), cloudMat);
      cloud.position.set((random() - .5) * 1000, 170 + random() * 80, -470 + random() * 260);
      cloud.scale.set(70 + random() * 100, 3 + random() * 5, 15 + random() * 35); this.scene.add(cloud);
    }
  }
  buildTerrain() {
    const geometry = new THREE.PlaneGeometry(1200, 1200, 190, 190); geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = [];
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i);
      const dist = Math.hypot(x, z), edge = Math.max(0, Math.min(1, (dist - 175) / 150));
      const dunes = (Math.sin(x * .02 + z * .011) * 8 + Math.sin(z * .033 - x * .006) * 6 + 14) * edge;
      position.setY(i, terrainHeight(x, z) + dunes - .06);
      const shade = .87 + Math.sin(x * .028 + z * .018) * .055 + random() * .065;
      colors.push(shade, shade * .987, shade * .94);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    const texture = groundTexture(); texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const material = new THREE.MeshStandardMaterial({ map: texture, color: '#f4ead4', roughness: 1, vertexColors: true });
    const ground = new THREE.Mesh(geometry, material); ground.receiveShadow = true; this.scene.add(ground);
    // Old track impressions lead from the spawn into the battlefield.
    const trackMat = new THREE.MeshStandardMaterial({ color: '#877249', transparent: true, opacity: .15, depthWrite: false, roughness: 1 });
    for (const side of [-1, 1]) {
      const vertices = [], uvs = [], indices = [];
      for (let i = 0; i <= 75; i++) {
        const z = 170 - i * 4.8, center = Math.sin((z - 60) * .014) * 15 + side * 2.05;
        for (const offset of [-.44, .44]) { const x = center + offset; vertices.push(x, terrainHeight(x, z) + .012, z); uvs.push(offset < 0 ? 0 : 1, i); }
        if (i < 75) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals(); this.scene.add(new THREE.Mesh(g, trackMat));
    }
  }
  buildMountains() {
    const materials = [mat('#aa9779', { flatShading: true }), mat('#a79270', { flatShading: true }), mat('#baaa8b', { flatShading: true })];
    for (let i = 0; i < 46; i++) {
      const angle = i / 46 * TAU;
      const radius = 370 + random() * 210;
      const height = 28 + random() * 62;
      const baseRadius = 40 + random() * 75;
      const geometry = new THREE.CylinderGeometry(baseRadius * (.13 + random() * .22), baseRadius, height, 6 + Math.floor(random() * 3), 2);
      const pos = geometry.attributes.position;
      for (let j = 0; j < pos.count; j++) if (pos.getY(j) > -height * .4) { pos.setX(j, pos.getX(j) + (random() - .5) * 12); pos.setZ(j, pos.getZ(j) + (random() - .5) * 10); }
      geometry.computeVertexNormals();
      const m = new THREE.Mesh(geometry, materials[i % 3]); m.position.set(Math.sin(angle) * radius, height * .5 - 5, Math.cos(angle) * radius); m.rotation.y = random() * TAU; m.scale.z = .65 + random() * .7; this.scene.add(m);
      if (i % 3 === 0) {
        const mesa = new THREE.Mesh(new THREE.CylinderGeometry(30, 56, height * .55, 6), materials[1]); mesa.position.set(m.position.x + 30, height * .275, m.position.z + 20); this.scene.add(mesa);
      }
    }
  }
  buildDecor(obstacles) {
    const rockMaterials = [mat('#aa9670', { flatShading: true }), mat('#9a8867', { flatShading: true }), mat('#baaa84', { flatShading: true })];
    for (const o of obstacles) {
      if (o.kind === 'ruin') { this.ruin(o); continue; }
      const m = new THREE.Mesh(unitRock, rockMaterials[Math.floor(random() * 3)]);
      m.position.set(o.x, terrainHeight(o.x, o.z) + o.height * .25, o.z); m.scale.set(o.radius, o.height * .67, o.radius * .8); m.rotation.set(.2, random() * TAU, .1); m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
      for (let i = 0; i < 4; i++) {
        const small = new THREE.Mesh(unitRock, rockMaterials[i % 3]); const angle = random() * TAU;
        const x = o.x + Math.cos(angle) * o.radius * .85, z = o.z + Math.sin(angle) * o.radius * .85;
        small.position.set(x, terrainHeight(x, z) + .45, z); small.scale.set(1 + random() * 2, .7 + random(), 1 + random()); small.rotation.y = random() * TAU; small.castShadow = true; this.scene.add(small);
      }
    }
    const stones = new THREE.InstancedMesh(unitRock, rockMaterials[0], 240), dummy = new THREE.Object3D();
    for (let i = 0; i < 240; i++) {
      const x = (random() - .5) * 500, z = (random() - .5) * 500;
      const size = .12 + random() * .65;
      dummy.position.set(x, terrainHeight(x, z) + size * .1, z); dummy.scale.set(size * 1.5, size * .55, size); dummy.rotation.set(random(), random() * TAU, random()); dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
    }
    stones.receiveShadow = true; this.scene.add(stones);
    const grassMat = mat('#827e4f', { side: THREE.DoubleSide });
    const blades = new THREE.InstancedMesh(new THREE.ConeGeometry(.08, .85, 3), grassMat, 800);
    for (let i = 0; i < 160; i++) {
      const x = (random() - .5) * 350, z = (random() - .5) * 350;
      for (let j = 0; j < 5; j++) {
        const dx = x + (random() - .5) * .7, dz = z + (random() - .5) * .7;
        dummy.position.set(dx, terrainHeight(dx, dz) + .22, dz); dummy.scale.set(1, .4 + random() * .9, 1); dummy.rotation.set((random() - .5) * 1.2, random() * TAU, (random() - .5) * 1.1); dummy.updateMatrix(); blades.setMatrixAt(i * 5 + j, dummy.matrix);
      }
    }
    this.scene.add(blades);
    const boundaryMaterial = mat('#b09769');
    for (let i = 0; i < 56; i++) {
      const angle = i / 56 * TAU, x = Math.sin(angle) * 211, z = Math.cos(angle) * 211;
      cylinder(this.scene, boundaryMaterial, x, terrainHeight(x, z) + 1.5, z, .12, 3);
      const marker = new THREE.Mesh(new THREE.PlaneGeometry(.8, .55), mat('#cc8749', { side: THREE.DoubleSide })); marker.position.set(x, terrainHeight(x, z) + 2.6, z); marker.rotation.y = angle; this.scene.add(marker);
    }
  }
  ruin(o) {
    const g = new THREE.Group(); g.position.set(o.x, terrainHeight(o.x, o.z), o.z); this.scene.add(g);
    const wall = mat('#b4a584');
    box(g, wall, 0, 3, -5, 16, 6, 1.3);
    box(g, wall, -7.5, 2.5, 0, 1.3, 5, 11);
    box(g, wall, 7.5, 3.5, 0, 1.3, 7, 11);
    box(g, wall, -5.5, 2.7, 5, 4, 5.4, 1.2);
    box(g, wall, 4, 2.1, 5, 6, 4.2, 1.2);
    box(g, wall, 0, 5.7, 5, 15, 1.1, 1.2);
    box(g, wall, 5.5, 7.3, -2, 5, .6, 7);
    box(g, mat('#7a7057'), -7.9, 3.3, -2, .15, 2, 2);
    for (let i = 0; i < 12; i++) {
      box(g, wall, (random() - .5) * 18, .3 + random() * .4, 6 + random() * 3, 1 + random(), .5 + random() * .5, .8 + random(), random() * TAU);
    }
    for (let i = 0; i < 5; i++) box(g, dark, 6 - i * 2.5, 5.4, 1, .13, .15, 10);
  }
  buildOutpost() {
    const tower = new THREE.Group(); tower.position.set(-78, terrainHeight(-78, -135), -135); this.scene.add(tower);
    const towerMetal = mat('#766f56', { metalness: .4 });
    for (const [x, z] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) beam(tower, [x, 0, z], [x * .3, 29, z * .3], .13, towerMetal);
    for (let h = 0; h < 27; h += 4) {
      const a = 2 * (1 - h / 40), b = 2 * (1 - (h + 4) / 40);
      for (const z of [-1, 1]) { beam(tower, [-a, h, z * a], [b, h + 4, z * b], .065, towerMetal); beam(tower, [a, h, z * a], [-b, h + 4, z * b], .065, towerMetal); }
      for (const x of [-1, 1]) beam(tower, [x * a, h, -a], [x * b, h + 4, b], .065, towerMetal);
    }
    beam(tower, [0, 27, 0], [0, 34, 0], .08, towerMetal);
    box(tower, towerMetal, 0, 28, 0, 2.5, .15, 2.5);
    cylinder(tower, rust, .5, 25, .7, 1.4, .23, Math.PI / 2, .1);
    box(tower, sand, 0, 1.5, 0, 7, 3, 6);
    for (const [x, z] of [[-16, -13], [16, -13], [0, 16]]) beam(tower, [0, 23, 0], [x, 0, z], .026, towerMetal);
    // A wind-worn observation post on the right of the first engagement.
    const camp = new THREE.Group(); camp.position.set(109, terrainHeight(109, -25), -25); this.scene.add(camp);
    for (const x of [-3, 3]) for (const z of [-3, 3]) cylinder(camp, towerMetal, x, 4.5, z, .15, 9);
    box(camp, towerMetal, 0, 7.5, 0, 7, .25, 7);
    box(camp, sand, 0, 8.8, -3.2, 7, 2.3, .25);
    box(camp, sand, 3.2, 8.8, 0, .25, 2.3, 7);
    box(camp, mat('#8b8564'), 0, 10.3, 0, 8, .2, 8);
    beam(camp, [-3, 0, -3], [3, 7.5, -3], .12, towerMetal);
    beam(camp, [3, 0, 3], [-3, 7.5, 3], .12, towerMetal);
    const flagGeo = new THREE.PlaneGeometry(3, 1.6, 12, 4);
    const flag = new THREE.Mesh(flagGeo, mat('#ce8550', { side: THREE.DoubleSide })); flag.position.set(7.5, 8, -4); camp.add(flag); this.flag = flag;
    cylinder(camp, towerMetal, 6, 4.5, -4, .075, 9);
    for (let i = 0; i < 6; i++) {
      const x = 150 + i * 12, z = -i * 42, y = terrainHeight(x, z);
      cylinder(this.scene, towerMetal, x, y + 6, z, .16, 12);
      box(this.scene, towerMetal, x, y + 11, z, 4, .17, .22);
      if (i) {
        for (const offset of [-1.5, 1.5]) {
          const points = [];
          for (let j = 0; j <= 10; j++) { const f = j / 10; points.push(new THREE.Vector3(x - 12 + f * 12 + offset, y + 11 - Math.sin(f * Math.PI) * 2, z + 42 - f * 42)); }
          this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#6b6b58' })));
        }
      }
    }
    const crate = mat('#6e7351');
    for (let i = 0; i < 8; i++) box(camp, crate, -7 + (i % 3) * 1.5, .6, -3 + Math.floor(i / 3) * 1.6, 1.2, 1.2, 1.2);
    // Ambient windblown dust stays subtle against the distant dunes.
    const dustPositions = [];
    for (let i = 0; i < 320; i++) dustPositions.push((random() - .5) * 350, random() * 8 + .3, (random() - .5) * 350);
    const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#ecd3a3', size: .12, transparent: true, opacity: .3, depthWrite: false })); this.scene.add(this.dust);
  }
  resize() {
    const { clientWidth: width, clientHeight: height } = this.renderer.domElement;
    if (width && height) {
      const ratio = this.renderer.getPixelRatio();
      if (this.renderer.domElement.width !== Math.floor(width * ratio) || this.renderer.domElement.height !== Math.floor(height * ratio)) this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
      // Resizing clears the drawing buffer. Paint immediately, including when
      // ResizeObserver runs after the animation callback in the same frame.
      this.renderer.render(this.scene, this.camera);
    }
  }
  setQuality(quality) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'low' ? .85 : 1.6));
    this.dust.visible = quality !== 'low';
    this.resize();
  }
  reset() {
    for (const model of this.enemyModels.values()) { this.scene.remove(model); model.traverse(o => { if (o.geometry?.userData.batched) o.geometry.dispose(); }); if (model.userData.wreckMaterial) model.userData.wreckMaterial.dispose(); }
    for (const model of this.shellModels.values()) { this.scene.remove(model); model.geometry.dispose(); }
    for (const p of this.particles) { this.scene.remove(p.mesh); p.mesh.material.dispose(); }
    this.enemyModels.clear(); this.shellModels.clear(); this.particles.length = 0; this.shake = 0;
  }
  addParticle(x, y, z, { fire = false, size = 1, life = 1, vx = 0, vy = 0, vz = 0 } = {}) {
    if (this.particles.length > 240) return;
    const material = (fire ? this.fireMaterial : this.smokeMaterials[Math.floor(random() * 2)]).clone();
    const mesh = new THREE.Mesh(this.particleGeometry, material); mesh.position.set(x, y, z); mesh.scale.setScalar(size); mesh.rotation.set(random() * 3, random() * 3, random() * 3); this.scene.add(mesh);
    this.particles.push({ mesh, life, maxLife: life, size, vx, vy, vz, fire, opacity: material.opacity });
  }
  explosion(x, y, z, large = false) {
    for (let i = 0; i < (large ? 30 : 13); i++) {
      const angle = random() * TAU, velocity = random() * (large ? 8 : 4);
      this.addParticle(x, y, z, { fire: i < (large ? 12 : 5), size: .3 + random() * (large ? 1.7 : .7), life: i < 5 ? .25 + random() * .35 : 1.5 + random() * 2, vx: Math.sin(angle) * velocity, vy: random() * 5 + 1, vz: Math.cos(angle) * velocity });
    }
  }
  handleEvent(event) {
    if (event.type === 'fire') {
      for (let i = 0; i < 5; i++) this.addParticle(event.x, event.y, event.z, { fire: i < 3, size: i < 3 ? .45 : .4, life: i < 3 ? .09 : .65, vy: 1.7, vx: (random() - .5) * 2 });
      if (event.owner === 'player') { this.shake = .16; this.playerTank.userData.recoil = .65; this.flash.position.set(event.x, event.y + 1, event.z); this.flash.intensity = 35; }
    }
    if (event.type === 'impact') this.explosion(event.x, event.y, event.z, false);
    if (event.type === 'destroyed') {
      this.explosion(event.x, event.y, event.z, true);
      const model = this.enemyModels.get(event.id);
      if (model) {
        const wreckMaterial = mat('#3c3830');
        model.traverse(o => { if (o.isMesh) o.material = wreckMaterial; }); model.userData.wreckMaterial = wreckMaterial;
        model.userData.turret.rotation.z = .16;
      }
    }
    if (event.type === 'damage') this.shake = .3;
  }
  update(sim, dt, zoom) {
    this.time += dt;
    const active = sim.status === 'playing';
    const motionDt = active ? dt : 0;
    const p = sim.player, h = terrainHeight(p.x, p.z);
    this.playerTank.position.set(p.x, h, p.z); this.playerTank.rotation.y = p.yaw;
    const u = this.playerTank.userData;
    u.turret.rotation.y = p.aim - p.yaw; u.gun.rotation.x = p.pitch;
    u.recoil *= Math.exp(-motionDt * 7); u.gun.position.z = -.85 + u.recoil;
    this.bob += Math.abs(p.speed) * motionDt * 1.6;
    this.shake *= Math.exp(-motionDt * 9);
    const bob = Math.sin(this.bob) * Math.min(Math.abs(p.speed) * .002, .034);
    this.camera.position.set(p.x + Math.sin(p.aim) * .1, h + CAMERA_HEIGHT + bob + (random() - .5) * this.shake, p.z + Math.cos(p.aim) * .1);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(p.pitch + (random() - .5) * this.shake * .14, p.aim, Math.sin(this.bob * .5) * Math.min(Math.abs(p.speed) * .00025, .003));
    const targetFov = zoom ? 30 : 68; this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14); this.camera.updateProjectionMatrix();
    this.sun.position.set(p.x - 90, 90, p.z - 140); this.sun.target.position.set(p.x, 0, p.z);
    this.flash.intensity *= Math.exp(-motionDt * 22);
    for (const e of sim.enemies) {
      let model = this.enemyModels.get(e.id);
      if (!model) { model = createTank(); this.enemyModels.set(e.id, model); this.scene.add(model); }
      model.position.set(e.x, terrainHeight(e.x, e.z), e.z); model.rotation.y = e.yaw;
      model.userData.turret.rotation.y = e.aim - e.yaw;
      if (e.hp <= 0 && active && random() < dt * 4 && e.deadTime < 22) this.addParticle(e.x + (random() - .5), terrainHeight(e.x, e.z) + 2, e.z, { size: 1.1, life: 3.5, vy: 2, vx: .8 });
    }
    const liveShells = new Set();
    for (const shell of sim.projectiles) {
      liveShells.add(shell.id); let mesh = this.shellModels.get(shell.id);
      if (!mesh) { mesh = new THREE.Mesh(new THREE.SphereGeometry(.17, 6, 4), this.fireMaterial); mesh.scale.z = 6; this.scene.add(mesh); this.shellModels.set(shell.id, mesh); }
      mesh.position.set(shell.x, shell.y, shell.z); mesh.lookAt(shell.x + shell.vx, shell.y + shell.vy, shell.z + shell.vz);
    }
    for (const [id, mesh] of this.shellModels) if (!liveShells.has(id)) { this.scene.remove(mesh); mesh.geometry.dispose(); this.shellModels.delete(id); }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i]; part.life -= motionDt;
      if (part.life <= 0) { this.scene.remove(part.mesh); part.mesh.material.dispose(); this.particles.splice(i, 1); continue; }
      part.mesh.position.x += part.vx * motionDt; part.mesh.position.y += part.vy * motionDt; part.mesh.position.z += part.vz * motionDt;
      if (part.fire) part.vy -= motionDt * 3;
      part.mesh.scale.setScalar(part.size * (1 + (1 - part.life / part.maxLife) * (part.fire ? .3 : 2)));
      part.mesh.material.opacity = part.opacity * Math.min(1, part.life / part.maxLife * 1.5);
    }
    if (active && Math.abs(p.speed) > 2) {
      this.dustTimer += dt;
      if (this.dustTimer > .12) { this.dustTimer = 0; for (const side of [-1, 1]) this.addParticle(p.x + Math.sin(p.yaw) * 3 + Math.cos(p.yaw) * side * 2, h + .5, p.z + Math.cos(p.yaw) * 3 - Math.sin(p.yaw) * side * 2, { size: .6, life: 1.1, vy: .45, vx: .5 }); }
    }
    const flagPos = this.flag.geometry.attributes.position;
    for (let i = 0; i < flagPos.count; i++) { const x = flagPos.getX(i); flagPos.setZ(i, Math.sin(x * 2.8 + this.time * 3) * (x + 1.5) * .13); } flagPos.needsUpdate = true;
    this.dust.position.x = Math.sin(this.time * .02) * 20;
    this.renderer.render(this.scene, this.camera);
  }
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x + 1) * .5, y: (1 - v.y) * .5, visible: v.z < 1 && v.z > -1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
  }
}
