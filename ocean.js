/* Viperfish ocean: a real-time WebGL shader.
   Above water: wave field (sum of peaked sine waves, analytic normals), Fresnel sky reflection, sun glitter, foam, haze.
   Underwater: Snell's window + total internal reflection, per-colour light absorption with depth, god rays.
   Lens: refractive water drops, aerated-water splash cover. All procedural, no image assets. */
(function () {
  "use strict";

  var VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";

  var FRAG = [
    "precision highp float;",
    "uniform vec2 u_res; uniform float u_time; uniform float u_alt; uniform float u_pitch;",
    "uniform vec3 u_deep; uniform float u_zoom; uniform float u_curve; uniform float u_cover; uniform float u_wet; uniform vec4 u_drops[16]; uniform vec2 u_shake;",
    "const vec3 SUN = vec3(0.3817, 0.1680, -0.9089);",
    "const float FOCAL = 0.866;",
    // the sun is low in the sky ahead and to the right. Seen from underwater it sits near the edge of the bright circle (Snell's window), towards the bottom of the screen when looking straight up, and rises to the horizon as the camera tilts: SUNW is the direction to it in the water, SUNA the same ray in air
    "const vec3 SUNW = vec3(0.2870, 0.6713, -0.6834);",
    "const vec3 SUNA = vec3(0.3817, 0.1680, -0.9089);",
    "const vec3 SA = vec3(-0.9220, 0.0000, -0.3872);",
    "const vec3 SB = vec3(-0.2599, 0.7412, 0.6189);",
    "vec2 g_uv;",

    "float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }",
    "float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);",
    "  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));",
    "  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }",
    "float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.03 + vec2(7.1, 3.7); a *= 0.5; } return v; }",

    // ---------------------------------------------------------------- sky
    "vec3 sky(vec3 rd){",
    "  float e = clamp(rd.y, 0.0, 1.0);",
    "  vec3 hor = vec3(1.10, 0.60, 0.32);",
    "  vec3 low = vec3(0.50, 0.30, 0.40);",
    "  vec3 mid = vec3(0.075, 0.190, 0.400);",
    "  vec3 top = vec3(0.010, 0.030, 0.095);",
    "  vec3 c = mix(hor, low, smoothstep(0.0, 0.10, e));",
    "  c = mix(c, mid, smoothstep(0.05, 0.36, e));",
    "  c = mix(c, top, smoothstep(0.28, 0.95, e));",
    "  float sd = clamp(dot(rd, SUN), 0.0, 1.0);",
    "  float sunOn = 1.0;                  // the underwater view has its own sun, which fades out as the camera surfaces; this (horizon) sun takes over",
    "  c += vec3(1.0, 0.50, 0.22) * pow(sd, 5.0) * 0.70 * sunOn;",
    "  c += vec3(1.0, 0.72, 0.42) * pow(sd, 36.0) * 1.0 * sunOn;",
    "  c += vec3(1.0, 0.92, 0.72) * smoothstep(0.99950, 0.99985, sd) * 14.0 * sunOn;",
    "  if (rd.y > 0.0) {",
    "    vec2 cuv = rd.xz / (rd.y + 0.10) * 0.9 + vec2(u_time * 0.010, 0.0);",
    "    float n = fbm(cuv * 1.1);",
    "    float cov = smoothstep(0.50, 0.68, n);",
    "    float nl = fbm(cuv * 1.1 + SUN.xz * 0.13);",
    "    float lit = clamp(0.5 + (n - nl) * 3.6, 0.0, 1.0);",
    "    vec3 cc = mix(vec3(0.15, 0.16, 0.25), vec3(1.0, 0.58, 0.36), lit);",
    "    cc += vec3(1.0, 0.55, 0.30) * pow(sd, 8.0) * 0.55 * lit;",
    "    float fade = smoothstep(0.0, 0.07, rd.y) * (1.0 - smoothstep(0.7, 1.0, rd.y) * 0.4);",
    "    c = mix(c, cc, cov * 0.88 * fade);",
    "  }",
    "  return c;",
    "}",

    // ---------------------------------------------------------------- waves: returns (height, dh/dx, dh/dz)
    "vec3 waves(vec2 p, float dist){",
    "  float h = 0.0; vec2 g = vec2(0.0);",
    "  float fp = dist * dist * (1.5 / u_res.y) / max(abs(u_alt), 0.5);",
    "  for (int i = 0; i < 8; i++){",
    "    float fi = float(i);",
    "    float lam = 20.0 * pow(0.62, fi);",
    "    float k = 6.2831853 / lam;",
    "    float a = sin(fi * 2.399 + 0.6) * 0.8;",
    "    vec2 d = vec2(sin(a), cos(a));",
    "    float th = k * dot(d, p) + sqrt(9.81 * k) * u_time * 0.85 + fi * 1.7;",
    "    float amp = 0.0125 * lam;",
    "    float f = 1.0 - smoothstep(lam * 0.45, lam * 2.2, fp);",
    "    float e = exp(sin(th) - 1.0);",
    "    h += amp * f * (2.0 * e - 1.0);",
    "    g += amp * f * 2.0 * e * cos(th) * k * d;",
    "  }",
    "  return vec3(h, g);",
    "}",

    // ---------------------------------------------------------------- above water
    "vec3 above(vec3 ro, vec3 rd){",
    "  if (rd.y > -0.0015) return sky(rd);",
    "  float t = -ro.y / rd.y;",
    "  for (int i = 0; i < 4; i++){ vec2 xz = ro.xz + rd.xz * t; t = (waves(xz, t).x - ro.y) / rd.y; }",
    "  t = clamp(t, 0.1, 9000.0);",
    "  vec2 xz = ro.xz + rd.xz * t;",
    "  vec3 wv = waves(xz, t);",
    "  vec3 n = normalize(vec3(-wv.y, 1.0, -wv.z));",
    "  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(60.0, 1800.0, t) * 0.78));",
    // far swell: the fine waves are too small to resolve out here, so keep long bands running parallel to the horizon all the way out
    "  vec2 vd = normalize(rd.xz + vec2(0.0001));",
    "  float al = dot(xz, vd) * 0.075 + u_time * 0.40, ac = dot(xz, vec2(-vd.y, vd.x)) * 0.012;",
    "  float s0 = vnoise(vec2(ac, al)), s1 = vnoise(vec2(ac, al + 0.12));",
    "  float s2 = vnoise(vec2(ac * 2.3 + 7.0, al * 2.1)), s3 = vnoise(vec2(ac * 2.3 + 7.0, (al + 0.12) * 2.1));",
    "  float slope = ((s1 - s0) + 0.25 * (s3 - s2)) / 0.12 * 0.075 * 0.8;",
    "  float farK = smoothstep(25.0, 160.0, t) * (1.0 - smoothstep(120.0, 1500.0, t) * 0.80);",
    "  n = normalize(n + vec3(vd.x, 0.0, vd.y) * slope * farK);",
    "  float cosv = clamp(dot(n, -rd), 0.0, 1.0);",
    "  float F = 0.02 + 0.98 * pow(1.0 - cosv, 5.0);",
    "  vec3 refl = reflect(rd, n); refl.y = abs(refl.y) + 0.002;",
    "  vec3 rc = sky(normalize(refl));",
    "  float crest = clamp((wv.x + 0.12) / 0.55, 0.0, 1.0);",
    "  vec3 deepc = vec3(0.003, 0.040, 0.075);",
    "  vec3 shal = vec3(0.015, 0.200, 0.260);",
    "  vec3 fl = normalize(vec3(rd.x, 0.0001, rd.z));",
    "  float sunLit = pow(clamp(dot(fl, normalize(vec3(SUN.x, 0.0001, SUN.z))), 0.0, 1.0), 3.0);",
    "  vec3 body = mix(deepc, shal, crest * 0.60 + sunLit * 0.30 * crest);",
    "  body += vec3(0.10, 0.07, 0.04) * sunLit * 0.10;",
    "  vec3 col = mix(body, rc, F);",
    "  vec3 hv = normalize(SUN - rd);",
    "  float nh = clamp(dot(n, hv), 0.0, 1.0);",
    "  float ex = 1100.0 / (1.0 + t * 0.07);\n    col += vec3(1.0, 0.80, 0.52) * pow(nh, ex) * ex * 0.082;",
    "  col += vec3(1.0, 0.60, 0.34) * pow(nh, 140.0) * 1.1;",
    "  float fn = vnoise(xz * 1.7 + u_time * 0.3);",
    "  float foam = smoothstep(0.64, 0.96, crest + 0.38 * (fn - 0.5)) * (1.0 - smoothstep(40.0, 240.0, t));",
    "  col = mix(col, vec3(0.86, 0.88, 0.92) * (0.50 + 0.5 * clamp(dot(n, SUN) * 1.2, 0.0, 1.0)), foam * 0.50);",
    "  float haze = 1.0 - exp(-t * 0.0007);",
    "  vec3 hz = vec3(0.92, 0.56, 0.38) * (0.80 + 0.5 * pow(clamp(dot(fl, normalize(vec3(SUN.x, 0.0001, SUN.z))), 0.0, 1.0), 4.0));",
    "  col = mix(col, hz, haze * 0.82);",
    "  return col;",
    "}",

    // ---------------------------------------------------------------- under water
    // The camera looks straight up. What it sees: the sky squeezed into Snell's window by refraction at the wavy surface, the sun broken up by the waves,
    // shafts of light fanning out from the sun, and lit particles drifting at different distances. Nothing here is sampled at a position that scales
    // with depth except the surface itself, so sinking only makes the surface recede: the light does not swim or stretch.
    "vec3 skyU(vec3 r){",
    "  float e = clamp(r.y, 0.0, 1.0);",
    "  vec3 c = mix(vec3(1.05, 0.62, 0.36), vec3(0.15, 0.36, 0.78), smoothstep(0.0, 0.55, e));",
    "  return mix(c, vec3(0.09, 0.24, 0.62), smoothstep(0.5, 1.0, e) * 0.5);",
    "}",
    "float motes(vec2 uv, float Z, float t){",
    "  float acc = 0.0;",
    "  for (int L = 0; L < 3; L++){",
    "    float fl = float(L);",
    "    float zz = Z * 1.5 + fl / 3.0 + 0.13;",
    "    float ph = fract(zz), cyc = floor(zz);",
    "    float d = 3.2 * pow(0.085, ph) * 8.0;                       // far (small, sharp) to near (large, out of focus)",
    "    float fade = smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.75, 1.0, ph));",
    "    vec2 q = (uv + vec2(0.004, -0.006) * t) * d + vec2(cyc * 7.7 + fl * 13.1, cyc * 3.3 + fl * 5.0);",
    "    vec2 id = floor(q), f = fract(q);",
    "    float h = hash(id + fl * 17.0 + cyc * 3.1);",
    "    if (h > 0.55) {",
    "      float h2 = hash(id * 1.7 + 3.1 + fl), h3 = hash(id + 8.3 + cyc);",
    "      vec2 pos = 0.5 + (vec2(h2, h3) - 0.5) * 0.6;",
    "      float rs = mix(0.0016, 0.014, ph * ph) * (0.6 + 0.8 * h2);",
    "      float r = length(f - pos) / d;",
    "      float disc = 1.0 - smoothstep(rs * 0.55, rs + 1.2 / u_res.y, r);",
    "      float inten = min(1.0, pow(0.0030 / rs, 1.6));",
    "      acc += disc * inten * fade * (0.55 + 0.45 * sin(t * (0.5 + h3) + h * 40.0));",
    "    }",
    "  }",
    "  return acc;",
    "}",
    // fine ripples (slopes only): what breaks the sun into glitter and frays the edge of the window
    "vec3 vnd(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);",
    "  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0)), k = a - b - c + d;",
    "  return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du * vec2((b - a) + k * u.y, (c - a) + k * u.x)); }",
    "vec2 ripples(vec2 p, float fp){",
    "  vec2 g = vec2(0.0);",
    "  mat2 M = mat2(1.0, 0.0, 0.0, 1.0);",
    "  float c = 0.50;",
    "  for (int i = 0; i < 5; i++){",
    "    float fi = float(i);",
    "    M = mat2(0.8, -0.6, 0.6, 0.8) * M;",
    "    vec3 n = vnd(M * p / c + vec2(u_time * (0.55 + 0.2 * fi), -u_time * 0.4) + fi * 19.7);",
    "    g += 0.085 * (1.0 - smoothstep(c * 0.5, c * 2.4, fp)) * (n.yz * M);",
    "    c *= 0.5;",
    "  }",
    "  return g;",
    "}",
    "vec3 under(vec3 ro, vec3 rd){",
    "  float D = max(-ro.y, 0.05);",
    "  vec3 K = vec3(0.25, 0.038, 0.018);                             // red goes first, blue last",
    "  vec3 Ld = exp(-K * D);",
    "  vec3 body = vec3(0.012, 0.20, 0.34) * Ld;",
    "  float sdv = clamp(dot(rd, SUNW), 0.0, 1.0);",
    "  vec3 col;",
    "  if (rd.y > 0.01) {",
    "    float ts = D / rd.y;",
    "    vec2 pxz = ro.xz + rd.xz * ts;",
    "    vec3 wv = waves(pxz, ts);",
    "    vec2 sl = wv.yz * 0.7 + ripples(pxz, ts * ts * (1.5 / u_res.y) / D);",
    "    vec3 N = -normalize(vec3(-sl.x, 1.0, -sl.y));",
    "    float c = dot(N, rd);",
    "    float kk = max(1.0 - 1.7689 * (1.0 - c * c), 0.0);           // 0 = total internal reflection",
    "    vec3 rr = normalize(1.33 * rd - (1.33 * c + sqrt(kk)) * N + vec3(0.0, 1e-4, 0.0));",
    "    float F = 0.02 + 0.98 * pow(1.0 - smoothstep(0.0, 0.6, kk), 3.0);",
    "    vec3 T = exp(-K * min(ts, 600.0));",
    "    float sd = clamp(dot(rr, SUNA), 0.0, 1.0);",
    "    float bl = 1.0 / (1.0 + D * 0.15);                           // the deeper, the more the sun smears into a glow",
    "    vec3 sun = vec3(1.0, 0.93, 0.78) * (pow(sd, 5000.0) * 70.0 * bl * bl + pow(sd, 600.0 * bl + 20.0) * 6.0 * bl + pow(sd, 60.0 * bl + 6.0) * 1.2 + pow(sd, 5.0) * 0.20);",
    "    col = (skyU(rr) + sun) * T * (1.0 - F) + body * mix(0.95, 0.30, clamp(-reflect(rd, N).y, 0.0, 1.0)) * F;",
    "    col = mix(col, body * 1.2, 1.0 - exp(-0.02 * ts));             // water between here and the surface veils it",
    "  } else {",
    "    col = body * 1.2 * mix(1.0, 0.18, smoothstep(0.0, 0.9, -rd.y));",
    "  }",
    "  col += vec3(0.25, 0.60, 0.80) * Ld * (pow(sdv, 8.0) * 0.5 + pow(max(rd.y, 0.0), 3.0) * 0.25);   // scattered light, strongest toward the sun and overhead",
    // light shafts: streaks around the sun's direction, in angle only
    "  vec3 w = rd - SUNW * dot(rd, SUNW);",
    "  float wl = length(w);",
    "  vec2 dv = vec2(dot(w, SA), dot(w, SB)) / max(wl, 1e-4);",
    "  float rad = wl / max(dot(rd, SUNW), 0.05);",
    "  float sh = vnoise(dv * 3.0 + vec2(u_time * 0.045, 1.7)) * 0.50 + vnoise(dv * 7.0 + vec2(4.0, -u_time * 0.07)) * 0.32 + vnoise(dv * 16.0 + vec2(u_time * 0.10, 9.0)) * 0.18;",
    "  sh = smoothstep(0.42, 0.78, sh);",
    "  float env = smoothstep(0.0, 0.30, rad) / (1.0 + rad * 1.6) * (1.0 - exp(-D / 2.5)) * exp(-D / 90.0) * step(0.0, dot(rd, SUNW));",
    "  col += vec3(0.45, 0.85, 1.0) * Ld * sh * env * 0.85;",
    "  col += vec3(0.60, 0.90, 1.0) * Ld * motes(g_uv, u_zoom, u_time) * (0.10 + 0.90 * pow(sdv, 6.0)) * smoothstep(0.3, 3.0, D) * 1.6;",
    "  return col;",
    "}",

    // ---------------------------------------------------------------- deep water (all the way down): added in display space
    "vec3 pal(float h){ return 0.5 + 0.5 * cos(6.2831853 * (h + vec3(0.0, 0.33, 0.67))); }",
    "vec3 biolum(vec2 uv, float Z, float amt, float sp){",
    // living light, far off: three depth shells loop; scrolling down moves you away from the surface, so the sparks shrink away instead of sliding down the screen.
    // Most are pin-points that flash and fade (startled plankton); a few are larger, slow, soft glows.
    "  vec3 acc = vec3(0.0);",
    "  for (int L = 0; L < 3; L++){",
    "    float fl = float(L);",
    "    float zz = Z + fl / 3.0;",
    "    float ph = fract(zz), cyc = floor(zz);",
    "    float d = mix(2.2, 0.22, ph);",
    "    float fade = smoothstep(0.0, 0.20, ph) * (1.0 - smoothstep(0.78, 1.0, ph));",
    "    vec2 q = uv * d * 7.0 + vec2(fl * 13.1 + cyc * 7.7 + u_time * 0.02, cyc * 3.3 + fl * 5.0);",
    "    vec2 base = floor(q - 0.5);",
    "    float clump = smoothstep(0.35, 0.75, vnoise(q * 0.23 + fl * 4.0));   // animals gather in patches",
    "    for (int j = 0; j < 4; j++){",
    "      vec2 c0 = base + vec2(float(j - (j / 2) * 2), float(j / 2));",
    "      float h = hash(c0 + fl * 17.0), h2 = hash(c0 * 1.7 + 3.1 + fl), h3 = hash(c0 + 8.3);",
    "      if (h > 0.80 + 0.14 * sp - 0.16 * clump * (1.0 - 0.8 * sp)) {   // sp: the deeper, the barer",
    "        vec2 pos = c0 + 0.5 + (vec2(h2, h3) - 0.5) * 0.62 + vec2(0.04 * sin(u_time * 0.5 + h * 40.0), 0.05 * sin(u_time * 0.4 + h2 * 40.0));",
    "        float r = length(q - pos);",
    "        float big = step(0.80, h3);",
    "        float slow = 0.12 + 0.88 * pow(0.5 + 0.5 * sin(u_time * (0.25 + h2 * 0.6) + h * 60.0), 3.0);",
    "        float tf = fract(u_time * (0.05 + 0.10 * h2) + h * 7.0);",
    "        float flash = exp(-tf * 9.0) * smoothstep(0.0, 0.015, tf) * 2.6 + 0.10;",
    "        float rad = mix(0.014 + 0.016 * h2, 0.050 + 0.040 * h2, big);",
    "        float g = exp(-r * r / (rad * rad)) + 0.22 * exp(-r * r / (rad * rad * 12.0));",
    "        vec3 colr = mix(mix(pal(0.42 + 0.30 * h2), vec3(0.25, 0.70, 0.75), 0.5), vec3(0.38, 0.62, 0.90), 0.85 * sp);   // colder, paler blue in the abyss",
    "        acc += colr * g * mix(flash, slow * 0.8, big) * fade * (0.22 + 0.08 * fl);",
    "      }",
    "    }",
    "  }",
    "  return acc * amt;",
    "}",
    // fbm that zooms: two copies of the noise at different scales cross-fade in a loop
    "float zfbm(vec2 p, float Z, float seed){",
    "  float acc = 0.0;",
    "  for (int k = 0; k < 2; k++){",
    "    float zz = Z + float(k) * 0.5;",
    "    float ph = fract(zz), cyc = floor(zz);",
    "    float w = sin(3.14159265 * ph); w *= w;",
    "    float g = mix(1.0, 2.6, ph);",
    "    acc += w * fbm(p / g + vec2(cyc * 5.3 + seed, cyc * 2.1));",
    "  }",
    "  return acc;",
    "}",
    "vec3 deepFx(vec2 uv, float Dm){",
    "  vec2 zen = vec2(0.0, FOCAL * cos(u_pitch) / max(sin(u_pitch), 0.05));   // where straight-up lands on the screen (centre when looking at the zenith)",
    // near the surface the light comes from the sun's side; deeper down it has been scattered so often that it simply comes from straight overhead
    "  vec2 gc = zen + vec2(0.30, -0.24) * (1.0 - smoothstep(40.0, 500.0, Dm));",
    "  vec2 zv = uv - gc; float zr = length(zv);",
    "  float zglow = exp(-zr * zr * 0.9);",
    "  float lite = 1.0 - smoothstep(60.0, 1000.0, Dm);        // sunlight that is left: none below 1,000 m",
    "  float dark = smoothstep(400.0, 1200.0, Dm);             // living light takes over",
    "  float sp = smoothstep(900.0, 4500.0, Dm);               // ...then thins out into the barren, cold deep",
    "  float lamp = smoothstep(150.0, 600.0, Dm);              // the submarine's own lights come up as the sea goes dark",
    "  vec3 add = vec3(0.0);",
    "  float m1 = zfbm(uv * vec2(1.6, 1.3) + vec2(u_time * 0.012, 0.0), u_zoom * 0.4, 0.0);",
    "  float m2 = fbm(uv * vec2(3.0, 2.5) + vec2(5.2 - u_time * 0.01, 1.3));",
    "  float murk = smoothstep(0.30, 0.75, m1 * 0.65 + m2 * 0.5);",
    "  vec3 mcol = mix(vec3(0.030, 0.150, 0.230), vec3(0.020, 0.050, 0.130), 1.0 - lite);",
    "  add += mcol * murk * (0.35 + 0.9 * zglow) * (0.22 + 0.78 * lite);",
    "  add += vec3(0.020, 0.095, 0.150) * lite * lite * (0.15 + 0.85 * zglow) * 0.55;",
    // the surface, a very long way up: a patch of light that shrinks and dims as you sink
    "  float win = exp(-zr * zr / (0.03 + 0.45 / (1.0 + Dm / 70.0)));",
    "  add += vec3(0.16, 0.42, 0.58) * win * lite * lite * 0.22;",
    // two lamps below the window, angled in: their beams show only where they hit haze and drifting particles
    "  if (lamp > 0.0) {",
    "    float ax = 0.5 * u_res.x / u_res.y;",
    "    float cone = 0.0;",
    "    for (int i = 0; i < 2; i++){",
    "      float sg = i == 0 ? -1.0 : 1.0;",
    "      vec2 Lp = vec2(sg * (ax + 0.06), -0.56);",
    "      vec2 dir = normalize(vec2(-sg * ax * 0.9, 0.62));",
    "      vec2 v = uv - Lp; float al = dot(v, dir); float pe = v.x * dir.y - v.y * dir.x;",
    "      float wd = 0.035 + 0.22 * max(al, 0.0);",
    "      cone += exp(-pe * pe / (wd * wd)) * smoothstep(0.0, 0.08, al) / (1.0 + 3.5 * al * al);",
    "    }",
    "    vec3 lc = vec3(0.55, 0.78, 1.0);",
    "    float mo = motes(uv, u_zoom, u_time);",
    "    add += lc * cone * lamp * (0.085 + 0.24 * murk);",
    "    add += lc * mo * lamp * (0.025 + 2.2 * cone) + vec3(0.30, 0.60, 0.80) * mo * lite * 0.25;",
    "  }",
    "  if (dark > 0.0) {",
    "    add += biolum(uv, u_zoom, dark * 0.60 * (1.0 - 0.3 * sp), sp);",
    "    float bl = smoothstep(0.55, 0.85, zfbm(uv * 2.2 + vec2(-u_time * 0.02, 0.0), u_zoom * 0.6, 11.0));",
    "    add += mix(vec3(0.02, 0.22, 0.28), vec3(0.08, 0.04, 0.16), 0.5 + 0.5 * sin(Dm * 0.0012 + uv.x)) * bl * dark * 0.16 * (1.0 - 0.9 * sp);",
    "  }",
    "  return add;",
    "}",

    // ---------------------------------------------------------------- main
    "void main(){",
    "  vec2 uv0 = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y + u_shake;",
    "  uv0 *= 1.0 + u_curve * dot(uv0, uv0);                         // wide-angle glass: the edges of the view curve away",
    "  vec2 uv = uv0;",
    "  g_uv = uv0;",
    "  vec2 off = vec2(0.0); float dm = 0.0; float spec = 0.0;",
    "  for (int i = 0; i < 16; i++){",
    "    vec4 d = u_drops[i];",
    "    if (d.w > 0.001) {",
    "      vec2 dv = uv0 - d.xy; float r = d.z; float l = length(dv);",
    "      if (l < r) {",
    "        float k = l / r;",
    "        off -= dv * (1.0 - k * k) * 1.15 * d.w;",
    "        dm = max(dm, d.w * (1.0 - smoothstep(0.86, 1.0, k)));",
    "        spec += d.w * smoothstep(0.42, 0.0, length(dv / r - vec2(-0.30, 0.34))) * 0.9;",
    "        spec += d.w * smoothstep(0.0, 0.10, k - 0.80) * (1.0 - smoothstep(0.92, 1.0, k)) * 0.25;",
    "      }",
    "    }",
    "  }",
    "  uv += off;",
    "  vec3 rd = normalize(vec3(uv.x, uv.y, -FOCAL));",
    "  float cp = cos(u_pitch), sp = sin(u_pitch);",
    "  rd = vec3(rd.x, rd.y * cp - rd.z * sp, rd.y * sp + rd.z * cp);",
    "  vec3 col = vec3(0.0);",
    "  if (u_alt <= -420.0) { }                                      // fully mixed to u_deep below: skip the surface render\n  else if (u_alt > 0.35) col = above(vec3(0.0, u_alt, 0.0), rd);",
    "  else if (u_alt < -0.35) col = under(vec3(0.0, u_alt, 0.0), rd);",
    "  else col = mix(under(vec3(0.0, min(u_alt, -0.15), 0.0), rd), above(vec3(0.0, max(u_alt, 0.15), 0.0), rd), smoothstep(-0.35, 0.35, u_alt));",
    "  float uw = smoothstep(0.0, 1.0, -u_alt);",
    "  col *= mix(1.0, 0.82, uw);",
    "  col *= 1.0 - 0.18 * dm;",
    "  col += vec3(1.0) * spec * 0.85 * dm;",
    // aerated water (splash white-out): fine bubbles plus streaks of water pouring down
    "  float bub = smoothstep(0.66, 0.76, vnoise(uv0 * vec2(150.0, 115.0) + vec2(0.0, -u_time * 5.0)));",
    "  float stk = smoothstep(0.25, 0.80, vnoise(vec2(uv0.x * 70.0, uv0.y * 2.2 + u_time * 8.0)));",
    "  float stk2 = smoothstep(0.30, 0.85, vnoise(vec2(uv0.x * 150.0 + 3.0, uv0.y * 3.0 + u_time * 11.0)));",
    "  float aer = u_cover * (0.16 + 0.26 * stk + 0.16 * stk2 + 0.34 * bub);",
    "  col = mix(col, vec3(0.80, 0.93, 0.98), clamp(aer, 0.0, 1.0));",
    "  col = 1.0 - exp(-col * 1.05);",
    "  col = pow(col, vec3(1.0 / 2.2));",
    "  float Dm = max(-u_alt, 0.0);",
    "  float depthMix = smoothstep(30.0, 420.0, Dm);",
    "  col = mix(col, u_deep, depthMix);",
    "  if (Dm > 4.0) col += deepFx(uv0, Dm) * smoothstep(4.0, 260.0, Dm);",
    // pressure and cold: the frame closes in, the colour drains toward steel blue
    "  float pr = smoothstep(200.0, 9000.0, Dm);",
    "  float lum = dot(col, vec3(0.30, 0.59, 0.11));",
    "  col = mix(col, vec3(lum) * vec3(0.82, 0.97, 1.18), 0.40 * pr);",
    "  col *= mix(1.0, 0.74 - 0.34 * pr, smoothstep(0.28 - 0.10 * pr, 0.95, length(uv0)));",
    "  col += (hash(gl_FragCoord.xy + u_time) - 0.5) / 255.0;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("[ocean] shader compile error:", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function create(canvas) {
    var gl = null;
    try {
      gl = canvas.getContext("webgl", { alpha: false, antialias: false, powerPreference: "high-performance" }) ||
           canvas.getContext("experimental-webgl");
    } catch (e) {}
    if (!gl) return null;
    var vs = compile(gl, gl.VERTEX_SHADER, VERT), fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn("[ocean] link error:", gl.getProgramInfoLog(prog)); return null; }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one big triangle
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ["u_res", "u_time", "u_alt", "u_pitch", "u_deep", "u_zoom", "u_curve", "u_cover", "u_wet", "u_drops", "u_shake"].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });
    var drops = new Float32Array(64);
    var lost = false;
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); lost = true; });
    canvas.addEventListener("webglcontextrestored", function () { lost = false; });

    return {
      gl: gl,
      resize: function (w, h) {
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
      },
      render: function (s) {
        if (lost) return;
        gl.uniform2f(U.u_res, canvas.width, canvas.height);
        gl.uniform1f(U.u_time, s.time);
        gl.uniform1f(U.u_alt, s.alt);
        gl.uniform1f(U.u_pitch, s.pitch);
        gl.uniform3f(U.u_deep, s.deep[0], s.deep[1], s.deep[2]);
        gl.uniform1f(U.u_cover, s.cover || 0);
        gl.uniform1f(U.u_zoom, s.zoom || 0);
        gl.uniform1f(U.u_curve, s.curve || 0);
        gl.uniform1f(U.u_wet, s.wet || 0);
        gl.uniform2f(U.u_shake, (s.shake && s.shake[0]) || 0, (s.shake && s.shake[1]) || 0);
        drops.fill(0);
        var d = s.drops || [];
        for (var i = 0; i < 16 && i < d.length; i++) {
          drops[i * 4] = d[i].x; drops[i * 4 + 1] = d[i].y; drops[i * 4 + 2] = d[i].r; drops[i * 4 + 3] = d[i].a;
        }
        gl.uniform4fv(U.u_drops, drops);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  }

  window.Ocean = { create: create };
})();
