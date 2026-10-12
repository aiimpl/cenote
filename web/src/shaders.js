// Cenote: a flooded cave lit by one hole in the roof, seen from under the water.
// World: y up, still water is y = 0. The hole in the roof is centred on (0, H, 0).

export const common = /* glsl */ `
uniform float uT;
uniform vec3 uSun;          // towards the sun
const float G = 9.81;
const float PI = 3.14159265;
const float H = 9.;         // roof height above the water
const float HOLE = 3.3;     // hole radius
const float WALL = 15.;     // cave radius under water
const float D = 2.6;        // depth the light map is computed for (where the waves focus the light)

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3. - 2. * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s; }

// the hole in the roof: a ragged circle
float holeMask(vec2 c){
  float a = atan(c.y, c.x);
  float r = HOLE * (1. + 0.16 * (vnoise(vec2(a * 1.6, 1.)) - 0.5) * 2. + 0.04 * (vnoise(vec2(a * 4.5, 3.)) - 0.5) * 2.);
  return smoothstep(r + 0.04, r - 0.04, length(c));
}
// trees and vines around the hole break the sunlight into separate beams. Open sky = 1
float foliage(vec2 c){
  float rr = length(c) / HOLE;
  vec2 sw = 0.06 * vec2(sin(uT * 0.7 + c.y), cos(uT * 0.6 + c.x));          // leaves stir in the breeze
  float n = fbm(c * 1.6 + sw + 3.) * 0.55 + vnoise(c * 6. + sw * 3.) * 0.25 + vnoise(c * 17. + sw * 6.) * 0.2;   // branches, leaf clumps, single leaves
  float cover = 0.66 - 0.32 * smoothstep(0.35, 0.95, rr);                     // open in the middle, canopy towards the rim
  float open = 1. - smoothstep(cover - 0.015, cover + 0.015, n);
  // vines hanging over the rim, seen end-on from below: thin dark lines across the hole
  vec2 dir = c / max(length(c), 1e-3);
  float vine = smoothstep(0.86, 0.94, vnoise(dir * 9. + 4.) * 0.6 + vnoise(dir * 23. + 9.) * 0.4) * smoothstep(0.25, 0.8, rr);
  // roots and lianas hanging straight down from the far edge: seen from below they cross the opening as wavy lines
  float l1 = abs(c.x * 0.8 + c.y * 0.6 + 0.4 * sin(c.y * 2.1 + uT * 0.3) - 0.6);
  float l2 = abs(c.x * -0.5 + c.y * 0.86 + 0.3 * sin(c.x * 2.7 + 1.) + 1.1);
  vine = max(vine, max(smoothstep(0.07, 0.02, l1), smoothstep(0.05, 0.015, l2)) * 0.9);
  return open * (1. - vine);
}
// a point on the water surface is in the sun if the line to the sun passes through the hole
float sunlit(vec2 u){ vec2 c = u + uSun.xz * (H / uSun.y); return holeMask(c) * foliage(c); }

// value noise with its gradient (quintic)
vec3 noised(vec2 x){
  vec2 i = floor(x), f = fract(x);
  vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  vec2 du = 30. * f * f * (f * (f - 2.) + 1.);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
// the water in a cave is sheltered: only a slow, faint ripple from the air coming down the hole
vec3 calm(vec2 p){
  vec3 r = vec3(0.);
  float amp = 0.012, sc = 1.3;
  for (int o = 0; o < 4; o++){
    float fo = float(o);
    for (int l = 0; l < 2; l++){
      float fl = float(l);
      float th = fo * 1.13 + fl * 2.1;
      mat2 R = mat2(cos(th), -sin(th), sin(th), cos(th));
      vec2 v = vec2(cos(th + 1.9), sin(th + 1.9)) * (0.12 + 0.1 * fl) * sqrt(1.3 / sc);
      vec3 n = noised(R * p * sc + v * uT * sc + fo * 17.3 + fl * 5.1);
      r.x += amp * (n.x - 0.5);
      r.yz += amp * sc * (n.yz * R);
    }
    sc *= 1.9; amp *= 0.55;
  }
  return r;
}
// rings: (x, z, start time, strength). Drops from the vines, and the visitor's finger
const int NR = 32;
uniform vec4 uRip[NR];
vec3 ring(vec2 p, vec4 e, float seed){
  float age = uT - e.z;
  if (age < 0. || age > 4.) return vec3(0.);
  vec2 d = p - e.xy; float dist = length(d) + 1e-4;
  float ang = atan(d.y, d.x);
  float wob = vnoise(vec2(ang * 2.2 + seed * 7.1, age * 0.6)) - 0.5;
  float x = dist - (0.42 + 0.12 * wob) * age - 0.05 * wob;
  float str = 0.55 + 0.9 * vnoise(vec2(ang * 3.1 + seed * 3.7, 2.));
  float env = exp(-x * x / (0.012 + 0.04 * age)) * exp(-age / 1.3) / (1. + dist * 2.) * str;
  env *= 0.45 + 0.55 * smoothstep(0.06, -0.06, x);
  float k = 30. - 6. * age;
  return e.w * 0.02 * env * vec3(cos(k * x), -k * sin(k * x) * d / dist);
}
vec3 drips(vec2 p){
  // water drips from the vines at the edge of the hole, now and then
  vec3 r = vec3(0.);
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    float per = 2.3 + 2.1 * hash12(vec2(fi, 4.));
    float k = floor((uT + fi * 1.7) / per);
    float t0 = k * per - fi * 1.7;
    float a = 6.283 * hash12(vec2(fi, k));
    float rr = HOLE * (0.75 + 0.2 * hash12(vec2(k, fi)));
    vec2 c = vec2(cos(a), sin(a)) * rr - uSun.xz * 0.;      // straight below the rim
    r += ring(p, vec4(c, t0, 0.3), fi + k);
  }
  return r;
}
vec3 waterH(vec2 p){
  vec3 r = calm(p) + drips(p);
  for (int i = 0; i < NR; i++) r += ring(p, uRip[i], float(i));
  return r;
}
// the refracted sun with a flat surface
vec3 sunUnder(){ return refract(-uSun, vec3(0., 1., 0.), 1. / 1.333); }
`;

// the light map: a grid of the water surface; each vertex refracts the sun and is moved to where it lands at
// depth D, measured back along the undisturbed sun direction. Brightness = area shrink, times "is this point in the sun"
export const causVert = /* glsl */ `
uniform vec4 uBox;
out vec2 vOld;
out vec2 vNew;
out float vLit;
void main(){
  vec2 p = mix(uBox.xy, uBox.zw, uv);
  vec3 w = waterH(p);
  vec3 n = normalize(vec3(-w.y, 1., -w.z));
  vec3 r = refract(-uSun, n, 1. / 1.333);
  vec3 r0 = sunUnder();
  vec2 q = p + (r.xz / -r.y - r0.xz / -r0.y) * D;
  vOld = p; vNew = q; vLit = sunlit(p);
  gl_Position = vec4((q - uBox.xy) / (uBox.zw - uBox.xy) * 2. - 1., 0., 1.);
}`;
export const causFrag = /* glsl */ `
in vec2 vOld;
in vec2 vNew;
in float vLit;
out vec4 outColor;
void main(){
  vec2 ox = dFdx(vOld), oy = dFdy(vOld), nx = dFdx(vNew), ny = dFdy(vNew);
  float a0 = abs(ox.x * oy.y - ox.y * oy.x);
  float a1 = abs(nx.x * ny.y - nx.y * ny.x);
  outColor = vec4(min(a0 / max(a1, 1e-9), 40.) * vLit, 0., 0., 1.);
}`;

export const quadVert = /* glsl */ `
out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

export const frag = /* glsl */ `
uniform mat4 uInvVP;
uniform vec3 uCam;
uniform vec4 uBox;
uniform sampler2D uCaus;
uniform int uSteps;
uniform int uDbg;
in vec2 vUv;
out vec4 outColor;

const vec3 SUN = vec3(1.0, 0.96, 0.88) * 9.;
const vec3 SIGA = vec3(0.36, 0.085, 0.03);     // absorption: red goes first
const float SIGS = 0.03;                        // scattering (very clear water)
const vec3 SIGT = SIGA + SIGS;
const vec3 AMB = vec3(0.008, 0.03, 0.065);      // the cave's own dim blue light

// light arriving at a point under the water from the sun through the hole
float lightMap(vec2 u, float depth){
  vec2 uv = (u - uBox.xy) / (uBox.zw - uBox.xy);
  float lod = clamp(log2(max(depth, 0.1) / D) * 0.35, 0., 1.);
  float c = textureLod(uCaus, uv, lod).r;
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) c = 0.;
  float flat0 = sunlit(u);
  return mix(flat0, c, smoothstep(0.2, D, depth));
}
vec3 sunAt(vec3 x, out vec2 u){
  vec3 r0 = sunUnder();
  float depth = max(-x.y, 0.);
  float len = depth / -r0.y;
  u = x.xz - r0.xz * len;
  return SUN * lightMap(u, depth) * exp(-SIGT * len);
}

// the floor: a mound of fallen roof under the hole, on a limestone floor
float floorH(vec2 p){
  float m = 6.5 * exp(-dot(p - vec2(-1.5, -1.), p - vec2(-1.5, -1.)) / 45.);
  float boulders = 1.2 * pow(fbm(p * 0.35), 1.5) + 0.35 * fbm(p * 1.3);
  return -18. + m + boulders * (0.6 + m * 0.12);
}
vec3 floorN(vec2 p){
  float e = 0.05;
  return normalize(vec3(floorH(p - vec2(e, 0.)) - floorH(p + vec2(e, 0.)), 2. * e, floorH(p - vec2(0., e)) - floorH(p + vec2(0., e))));
}
vec3 rockAlbedo(vec3 x){
  float n = fbm(x.xz * 0.8 + x.y * 0.3) * 0.6 + fbm(x.xz * 5. - x.y) * 0.4;
  vec3 a = mix(vec3(0.42, 0.40, 0.34), vec3(0.78, 0.75, 0.66), n);
  return a * (0.85 + 0.3 * vnoise(x.xz * 30. + x.y * 9.));
}
float hg(float c, float g){ return (1. - g * g) / (4. * PI * pow(1. + g * g - 2. * g * c, 1.5)); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0., 1.); }

void main(){
  vec4 a = uInvVP * vec4(vUv * 2. - 1., -1., 1.); a /= a.w;
  vec4 b = uInvVP * vec4(vUv * 2. - 1., 1., 1.); b /= b.w;
  vec3 ro = uCam, rd = normalize(b.xyz - a.xyz);
  vec3 r0 = sunUnder();

  // what does the ray hit: the surface, the wall or the floor
  float tS = rd.y > 0. ? -ro.y / rd.y : 1e9;
  float bq = dot(ro.xz, rd.xz), aq = dot(rd.xz, rd.xz), cq = dot(ro.xz, ro.xz) - WALL * WALL;
  float tW = aq > 1e-6 ? (-bq + sqrt(max(bq * bq - aq * cq, 0.))) / aq : 1e9;
  float tF = 1e9;
  { // march the floor height field
    float t = 0.;
    for (int i = 0; i < 64; i++){
      vec3 x = ro + rd * t;
      float h = x.y - floorH(x.xz);
      if (h < 0.02){ tF = t; break; }
      t += max(0.08, h * 0.55);
      if (t > min(tS, tW)) break;
    }
  }
  float tEnd = min(tS, min(tW, tF));
  int kind = tEnd == tS ? 0 : (tEnd == tF ? 1 : 2);

  // light scattered towards us along the way: the shafts
  vec3 T = vec3(1.), sc = vec3(0.);
  int N = uSteps;
  float jit = hash12(gl_FragCoord.xy + fract(uT * 13.) * 91.);
  float tMax = min(tEnd, 60.);
  float dt = tMax / float(N);
  float ph = (hg(dot(r0, -rd), 0.85) * 0.7 + 0.3 / (4. * PI) * 2.5) * 1.8;
  for (int i = 0; i < 128; i++){
    if (i >= N) break;
    float t = (float(i) + jit) * dt;
    vec3 x = ro + rd * t;
    vec2 u;
    vec3 Ls = sunAt(x, u);
    // fine particles drifting in the water catch the light
    float sp = vnoise3(x * 9. + vec3(0., uT * 0.05, uT * 0.03));
    float dens = SIGS * (1. + 10. * pow(sp, 16.));
    sc += T * (Ls * ph + AMB * 0.25) * dens * dt;
    T *= exp(-SIGT * dt);
  }

  vec3 col = vec3(0.);
  vec3 x = ro + rd * tEnd;
  if (kind == 0){
    // the underside of the surface: the round window of the sky through the hole, or a dark mirror
    vec3 w = waterH(x.xz);
    vec3 n = normalize(vec3(-w.y, 1., -w.z));
    vec3 tr = refract(rd, -n, 1.333);
    if (dot(tr, tr) < 1e-4){
      col = AMB * 0.55 + SUN * 0.001 * sunlit(x.xz);   // total reflection: the dark cave below, mirrored
    } else {
      float F = 0.02 + 0.98 * pow(1. - abs(dot(rd, n)), 5.);
      vec3 c = x + tr * (H / max(tr.y, 0.05));
      float hm = holeMask(c.xz);
      // through the hole: blinding daylight, with vines hanging over the rim
      vec2 cd = c.xz / max(length(c.xz), 1e-3);
      float rim = smoothstep(HOLE * 0.55, HOLE * 1.02, length(c.xz));
      float vine = smoothstep(0.55, 0.8, vnoise(cd * 11.) * 0.7 + vnoise(cd * 29. + 3.) * 0.3) * rim;
      float fo = foliage(c.xz);
      // leaves against the daylight: near-black silhouettes, a little green where the light comes through them
      vec3 sky = mix(vec3(0.02, 0.05, 0.015) + vec3(0.1, 0.3, 0.05) * smoothstep(0.2, 0.9, fo), vec3(22., 24., 25.), smoothstep(0.35, 0.65, fo) * (1. - vine * 0.9));
      // the roof: dark rock, lit a little from the bright pool below and the hole's edge
      float near = exp(-max(length(c.xz) - HOLE, 0.) / 2.5);
      vec3 roof = rockAlbedo(c) * (0.015 + 0.25 * near) * vec3(0.8, 0.85, 0.75);
      col = mix(roof, sky, hm) * (1. - F) + AMB * F;
    }
  } else {
    vec3 n = kind == 1 ? floorN(x.xz) : normalize(vec3(-x.x, 0., -x.z) + 0.35 * vec3(fbm(x.yz * 0.7) - 0.5, fbm(x.xy * 0.6) - 0.5, fbm(x.xz * 0.7) - 0.5));
    vec2 u;
    vec3 Ls = sunAt(x, u);
    float dl = max(dot(n, -r0), 0.);
    // bounce: the sunlit patch of floor lights the cave a little
    float bounce = 0.04 * exp(-length(x.xz - u) / 9.);
    vec3 al = rockAlbedo(x);
    col = al * (Ls * dl + AMB * (1. + 0.5 * n.y) + SUN * bounce * vec3(0.3, 0.7, 0.9) * 0.05);
    // crevices are darker
    col *= 0.6 + 0.4 * smoothstep(0.2, 0.7, fbm(x.xz * 2.5 + x.y));
  }
  col = col * T + sc;
  if (uDbg == 1) col = vec3(textureLod(uCaus, vUv, 0.).r * 0.2);
  outColor = vec4(col, 1.);     // linear; bloom and tone mapping happen in post
}`;

// bloom: keep what is brighter than the threshold, blur it at low resolution
export const brightFrag = /* glsl */ `
uniform sampler2D uSrc;
uniform float uExp;
in vec2 vUv;
out vec4 outColor;
void main(){
  vec3 c = texture(uSrc, vUv).rgb * uExp;
  float l = max(c.r, max(c.g, c.b));
  outColor = vec4(c * smoothstep(0.9, 3.0, l), 1.);
}`;
export const blurFrag = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uDir;
in vec2 vUv;
out vec4 outColor;
void main(){
  vec3 s = texture(uSrc, vUv).rgb * 0.227;
  s += (texture(uSrc, vUv + uDir * 1.385).rgb + texture(uSrc, vUv - uDir * 1.385).rgb) * 0.316;
  s += (texture(uSrc, vUv + uDir * 3.231).rgb + texture(uSrc, vUv - uDir * 3.231).rgb) * 0.07;
  outColor = vec4(s, 1.);
}`;
export const postFrag = /* glsl */ `
uniform sampler2D uSrc;
uniform sampler2D uBloom;
uniform float uExp;
uniform float uT;
in vec2 vUv;
out vec4 outColor;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0., 1.); }
void main(){
  vec3 c = texture(uSrc, vUv).rgb * uExp + texture(uBloom, vUv).rgb * 0.35;
  vec2 q = vUv - 0.5;
  c *= 1. - 0.35 * dot(q, q) * 2.;                 // a little vignette, like a dive camera
  c = pow(aces(c), vec3(1. / 2.2));
  c += (hash12(gl_FragCoord.xy + fract(uT * 7.) * 100.) - 0.5) * 0.012;
  outColor = vec4(c, 1.);
}`;
