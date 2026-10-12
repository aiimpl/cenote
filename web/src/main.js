import * as THREE from 'three';
import { common, causVert, causFrag, quadVert, frag, brightFrag, blurFrag, postFrag } from './shaders.js';

const params = new URLSearchParams(location.search);
const RENDER = params.has('render');
const PHONE = matchMedia('(pointer: coarse)').matches;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: RENDER, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.autoClear = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
const SUN = new THREE.Vector3(0.22, 0.95, 0.2).normalize();
const H = 9;

// light map of the shafts: a grid of the sunlit patch of water, drawn into a texture with mipmaps
// (deeper water samples a blurrier level: the focused net of light spreads out with depth)
const CN = RENDER ? [1100, 1100] : (PHONE ? [420, 420] : [640, 640]);
const CR = RENDER ? 2048 : (PHONE ? 768 : 1024);
const causRT = new THREE.WebGLRenderTarget(CR, CR, {
  type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
});
// the sunlit patch on the water is the hole projected down along the sun
const u0 = new THREE.Vector2(-SUN.x * H / SUN.y, -SUN.z * H / SUN.y);
const box = new THREE.Vector4(u0.x - 5, u0.y - 5, u0.x + 5, u0.y + 5);

const uniforms = {
  uT: { value: 0 },
  uSun: { value: SUN },
  uBox: { value: box },
  uCaus: { value: causRT.texture },
  uInvVP: { value: new THREE.Matrix4() },
  uCam: { value: camera.position },
  uSteps: { value: RENDER ? 96 : (PHONE ? 28 : 40) },
  uSpk: { value: RENDER ? 26 : (PHONE ? 10 : 12) },
  uDbg: { value: Number(params.get('dbg') || 0) },
  uRip: { value: Array.from({ length: 32 }, () => new THREE.Vector4(0, 0, -99, 0)) },
  uBub: { value: new THREE.Vector4(0, 0, -14, 0) },
};
const causMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3, uniforms, vertexShader: common + causVert, fragmentShader: causFrag,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  depthTest: false, depthWrite: false, side: THREE.DoubleSide,
});
const causScene = new THREE.Scene();
const causMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, CN[0], CN[1]), causMat);
causMesh.frustumCulled = false; causScene.add(causMesh);

const mainMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader: quadVert, fragmentShader: common + frag, depthTest: false, depthWrite: false });
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsGeo = new THREE.PlaneGeometry(2, 2);
function pass(mat) { const sc = new THREE.Scene(); const m = new THREE.Mesh(fsGeo, mat); m.frustumCulled = false; sc.add(m); return sc; }
const mainScene = pass(mainMat);
// HDR scene -> bloom at 1/4 size -> tone mapping
const hdrOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
const hdrRT = new THREE.WebGLRenderTarget(4, 4, hdrOpts);
const bA = new THREE.WebGLRenderTarget(4, 4, hdrOpts), bB = new THREE.WebGLRenderTarget(4, 4, hdrOpts);
const uExp = { value: 2.4 };
const mk = (fs, u) => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: quadVert, fragmentShader: fs, depthTest: false, depthWrite: false });
const brightMat = mk(brightFrag, { uSrc: { value: hdrRT.texture }, uExp });
const blurMat = mk(blurFrag, { uSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
const postMat = mk(postFrag, { uSrc: { value: hdrRT.texture }, uBloom: { value: bA.texture }, uExp, uT: uniforms.uT });
const brightScene = pass(brightMat), blurScene = pass(blurMat), postScene = pass(postMat);

// ---- camera ----
function look(p, t, roll = 0) {
  camera.position.set(p[0], p[1], p[2]);
  camera.up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.lookAt(t[0], t[1], t[2]);
}
// a diver holding the camera floats: a slow rise and fall with each breath, and a little drift and roll
function float(t) {
  camera.position.y += 0.09 * Math.sin(t * 1.4) + 0.03 * Math.sin(t * 3.1 + 1);
  camera.position.x += 0.04 * Math.sin(t * 0.9 + 2);
  camera.rotateZ(0.012 * Math.sin(t * 0.8) + 0.004 * Math.sin(t * 2.3));
  camera.rotateX(0.008 * Math.sin(t * 1.4 + 0.6));
}
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const ease = (k) => k * k * (3 - 2 * k);
// film: five shots of 3 s
const SHOTS = [
  { t0: 0, bub: [-0.4, -0.3, -14], f: (u) => look(lerp([0.9, -11.6, 0.8], [0.6, -11.2, 0.5], u / 3), [-2.6, -0.5, -2]) },               // looking up into the beams
  { t0: 10, exp: 1.5, bub: [-7.0, -6.6, -16], f: (u) => look(lerp([-8.6, -5.4, -8.2], [-8.0, -7.6, -7.6], ease(u / 3)), [-3.4, -10.8, -3.0]) },             // sinking alongside the light, down to where it lands
  { t0: 20, bub: [2.0, 1.5, -15], f: (u) => look(lerp([3.5, -13.2, 3], [3.1, -13.1, 2.6], u / 3), [-2.6, -4, -2.2]) },              // from the rocks below, up the beams
  { t0: 30, exp: 0.8, bub: [-0.35, -0.65, -8], f: (u) => look(lerp([-0.6, -7, -0.4], [-0.6, -7.3, -0.4], u / 3), [-2.1, 1, -2.4], 0.25 * u) },   // straight up: the window of daylight
  { t0: 1.5, bub: [-0.4, -0.3, -14], f: (u) => look(lerp([0.8, -11.5, 0.7], [0.5, -11.1, 0.4], u / 3), [-2.6, -0.5, -2]) },           // back to the opening
];
const SHOT_LEN = 3, FILM_LEN = SHOTS.length * SHOT_LEN;
function filmAt(t) {
  const i = Math.min(SHOTS.length - 1, Math.floor(t / SHOT_LEN));
  const u = t - i * SHOT_LEN;
  SHOTS[i].f(u);
  float(SHOTS[i].t0 + u);
  uExp.value = SHOTS[i].exp || 2.4;
  const b = SHOTS[i].bub; uniforms.uBub.value.set(b[0], b[1], b[2], 1);
  return { scene: SHOTS[i].t0 + u, shot: i };
}

function resize(w, h) {
  renderer.setSize(w, h, false);
  hdrRT.setSize(w, h);
  bA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); bB.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
function draw(t) {
  uniforms.uT.value = t;
  camera.updateMatrixWorld();
  uniforms.uInvVP.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
  renderer.setRenderTarget(causRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(causScene, ortho);
  renderer.setRenderTarget(hdrRT); renderer.clear(); renderer.render(mainScene, ortho);
  renderer.setRenderTarget(bA); renderer.render(brightScene, ortho);
  for (let k = 0; k < 2; k++) {
    blurMat.uniforms.uSrc.value = bA.texture; blurMat.uniforms.uDir.value.set((k + 1) / bA.width, 0);
    renderer.setRenderTarget(bB); renderer.render(blurScene, ortho);
    blurMat.uniforms.uSrc.value = bB.texture; blurMat.uniforms.uDir.value.set(0, (k + 1) / bA.height);
    renderer.setRenderTarget(bA); renderer.render(blurScene, ortho);
  }
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(postScene, ortho);
}

if (RENDER) {
  document.body.classList.add('film');
  const rs = Number(params.get('rs') || 2);
  resize(540 * rs, 675 * rs);
  canvas.style.width = '540px'; canvas.style.height = '675px';
  window.__filmLen = FILM_LEN;
  window.__renderAt = (f, fps) => {
    const r = filmAt(f / fps);
    draw(r.scene);
    renderer.getContext().finish();
    return r;
  };
  window.__ready = true;
} else {
  // the page: Up / Down, and a finger on the water (seen from below) makes rings that bend the shafts
  const VIEWS = {
    up: { p: [0.8, -11.4, 0.7], t: [-2.6, -0.5, -2] },
    down: { p: [-8.2, -6.2, -7.8], t: [-3.4, -10.8, -3.0] },
  };
  let view = 'up', wide = false;
  const cp = new THREE.Vector3(...VIEWS.up.p), ct = new THREE.Vector3(...VIEWS.up.t);
  const onResize = () => {
    const dpr = Math.min(devicePixelRatio, 2);
    const w = innerWidth * dpr, h = innerHeight * dpr;
    const k = Math.min(1, Math.sqrt((PHONE ? 0.6e6 : 0.9e6) / (w * h)));
    resize(Math.round(w * k), Math.round(h * k));
    wide = innerWidth > innerHeight;
    camera.fov = wide ? 56 : 62; camera.updateProjectionMatrix();
  };
  addEventListener('resize', onResize); onResize();
  const btn = { up: document.getElementById('b-up'), down: document.getElementById('b-down') };
  const setView = (v) => { view = v; for (const k in btn) btn[k].classList.toggle('on', k === v); };
  btn.up.onclick = () => setView('up'); btn.down.onclick = () => setView('down');
  setView('up');
  const t0 = performance.now();
  let now = 0, ri = 0, last = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  // where the finger points on the water surface (from below, the ray goes up to y = 0)
  const hit = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const d = ray.ray.direction, o = ray.ray.origin;
    if (d.y <= 0.02) return null;
    const t = -o.y / d.y;
    return new THREE.Vector2(o.x + d.x * t, o.z + d.z * t);
  };
  const drop = (p, amp) => { uniforms.uRip.value[ri].set(p.x, p.y, now, amp); ri = (ri + 1) % 32; };
  canvas.addEventListener('pointerdown', (e) => {
    last = hit(e); if (last) drop(last, 1.4);
    document.getElementById('hint').style.opacity = 0; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p = hit(e);
    if (p && p.distanceTo(last) > 0.3) { drop(p, 0.9); last = p; }
  });
  const up = () => { last = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  renderer.setAnimationLoop(() => {
    const t = (performance.now() - t0) / 1000;
    const dt = Math.min(0.1, t - now); now = t;
    const V = VIEWS[view], k = Math.min(1, dt * 2);
    cp.lerp(new THREE.Vector3(...V.p), k); ct.lerp(new THREE.Vector3(...V.t), k);
    const sway = [0.4 * Math.sin(t * 0.21), 0.25 * Math.sin(t * 0.17), 0.4 * Math.cos(t * 0.19)];
    look([cp.x + sway[0], cp.y + sway[1], cp.z + sway[2]], [ct.x, ct.y + (wide && view === 'up' ? 4 : 0), ct.z]);   // landscape: keep the whole opening in frame
    float(t);
    uExp.value += ((view === 'down' ? 1.5 : 2.4) - uExp.value) * k;
    const hx = ct.x - cp.x, hz = ct.z - cp.z, hl = Math.hypot(hx, hz) || 1;
    uniforms.uBub.value.set(cp.x + 1.6 * hx / hl + 0.5, cp.z + 1.6 * hz / hl - 0.5, cp.y - 3, 1);   // bubbles rising just in front of you
    draw(now);
  });
}
