/* DeepAudio: a synthesized ocean soundscape (Web Audio, no files). Off until the visitor turns it on.
   Above the water: a soft sea wash. Underwater: a rumble that gets lower and more muffled with depth, plus a deep drone. */
(function () {
  "use strict";
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, fx = null, noiseBuf = null, surfGain = null, underGain = null, underLP = null, droneGain = null;
  var on = false, depth = 0, under = 0, ducked = 0;
  var LEVEL = 0.26, DUCK = 0.04;   // the ambient level, and how far it drops while the ship's voice is speaking

  function noiseBuffer(c) {                       // 6 s of brown noise, looped
    var n = Math.floor(c.sampleRate * 6), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0), last = 0, max = 0, i;
    for (i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last; max = Math.max(max, Math.abs(last)); }
    for (i = 0; i < n; i++) d[i] /= max || 1;
    return b;
  }
  function loopSource(c, buf, offset) {
    var s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, offset || 0); return s;
  }

  function build() {
    ctx = new AC();
    var buf = noiseBuffer(ctx);
    var comp = ctx.createDynamicsCompressor();
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(comp); comp.connect(ctx.destination);
    fx = ctx.createGain(); fx.gain.value = 1; fx.connect(comp);   // alarms, creaks and the implosion: not lowered when the voice speaks
    noiseBuf = buf;

    // above the water: band-limited wash with a slow swell
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 800; bp.Q.value = 0.5;
    surfGain = ctx.createGain(); surfGain.gain.value = 0;
    loopSource(ctx, buf, 0).connect(bp); bp.connect(surfGain); surfGain.connect(master);
    var swell = ctx.createOscillator(), swellAmt = ctx.createGain();
    swell.frequency.value = 0.11; swellAmt.gain.value = 0.12; swell.connect(swellAmt); swellAmt.connect(surfGain.gain); swell.start();

    // underwater: muffled rumble
    underLP = ctx.createBiquadFilter(); underLP.type = "lowpass"; underLP.frequency.value = 900; underLP.Q.value = 0.4;
    underGain = ctx.createGain(); underGain.gain.value = 0;
    loopSource(ctx, buf, 2.5).connect(underLP); underLP.connect(underGain); underGain.connect(master);

    // deep drone: two slightly detuned triangles with a very slow breathing
    droneGain = ctx.createGain(); droneGain.gain.value = 0;
    [41, 41.6, 55].forEach(function (f, i) {
      var o = ctx.createOscillator(); o.type = i < 2 ? "triangle" : "sine"; o.frequency.value = f;
      var g = ctx.createGain(); g.gain.value = i < 2 ? 0.5 : 0.25; o.connect(g); g.connect(droneGain); o.start();
    });
    var br = ctx.createOscillator(), brAmt = ctx.createGain();
    br.frequency.value = 0.04; brAmt.gain.value = 0.25; br.connect(brAmt); brAmt.connect(droneGain.gain); br.start();
    var droneLP = ctx.createBiquadFilter(); droneLP.type = "lowpass"; droneLP.frequency.value = 160;
    droneGain.disconnect(); droneGain.connect(droneLP); droneLP.connect(master);
  }

  window.DeepAudio = {
    enable: function () {
      if (!AC) return false;
      try { if (!ctx) build(); ctx.resume(); } catch (e) { return false; }
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(ducked ? DUCK : LEVEL, ctx.currentTime, 1.0);
      on = true;
      return true;
    },
    disable: function () {
      if (!ctx || !on) return;
      on = false;
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
      setTimeout(function () { if (!on && ctx) ctx.suspend(); }, 1500);
    },
    isOn: function () { return on; },
    // lower everything else while the voice talks, so it stands out (calls nest: the sound comes back when the last one ends)
    duck: function (down) {
      ducked = Math.max(0, ducked + (down ? 1 : -1));
      if (!ctx || !on) return;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(ducked ? DUCK : LEVEL, ctx.currentTime, ducked ? 0.08 : 0.6);
    },
    unduckAll: function () { ducked = 0; if (ctx && on) master.gain.setTargetAtTime(LEVEL, ctx.currentTime, 0.4); },
    // the hull groaning under the pressure
    creak: function (strength) {
      if (!ctx || !on) return;
      var t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), la = ctx.createGain(), d = 0.9 + Math.random() * 1.1;
      o.type = "sawtooth"; o.frequency.setValueAtTime(70 + Math.random() * 40, t); o.frequency.exponentialRampToValueAtTime(34 + Math.random() * 14, t + d);
      bp.type = "bandpass"; bp.frequency.value = 160 + Math.random() * 120; bp.Q.value = 6;
      lfo.frequency.value = 9 + Math.random() * 14; la.gain.value = 0.5; lfo.connect(la); la.connect(g.gain);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1 + 0.18 * (strength || 0), t + d * 0.3); g.gain.linearRampToValueAtTime(0, t + d);
      o.connect(bp); bp.connect(g); g.connect(fx); o.start(t); lfo.start(t); o.stop(t + d + 0.05); lfo.stop(t + d + 0.05);
    },
    // the implosion: one huge low boom
    boom: function () {
      if (!ctx || !on) return;
      var t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), n = ctx.createBufferSource(), ng = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = "sine"; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(26, t + 1.8);
      g.gain.setValueAtTime(1.0, t); g.gain.exponentialRampToValueAtTime(0.001, t + 2.6); o.connect(g); g.connect(fx); o.start(t); o.stop(t + 2.7);
      n.buffer = noiseBuf; n.loop = true; lp.type = "lowpass"; lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.8);
      ng.gain.setValueAtTime(1.0, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 2.2); n.connect(lp); lp.connect(ng); ng.connect(fx); n.start(t); n.stop(t + 2.3);
    },
    // water blasting in: an instant roar plus a hiss of white water, dying down as the cabin fills
    flood: function (seconds) {
      if (!ctx || !on) return;
      var t = ctx.currentTime, n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(),
          n2 = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g2 = ctx.createGain();
      n.buffer = noiseBuf; n.loop = true; bp.type = "bandpass"; bp.Q.value = 0.6;
      bp.frequency.setValueAtTime(1400, t); bp.frequency.exponentialRampToValueAtTime(220, t + seconds);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1.0, t + 0.04); g.gain.exponentialRampToValueAtTime(0.5, t + seconds * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      n.connect(bp); bp.connect(g); g.connect(fx); n.start(t); n.stop(t + seconds + 0.1);
      n2.buffer = noiseBuf; n2.loop = true; n2.playbackRate.value = 3; hp.type = "highpass"; hp.frequency.value = 2200;
      g2.gain.setValueAtTime(0.0001, t); g2.gain.linearRampToValueAtTime(0.7, t + 0.03); g2.gain.exponentialRampToValueAtTime(0.0001, t + seconds * 0.8);
      n2.connect(hp); hp.connect(g2); g2.connect(fx); n2.start(t); n2.stop(t + seconds);
    },
    // a short two-tone warning alarm (only when sound is on)
    alarm: function () {
      if (!ctx || !on) return;
      var t0 = ctx.currentTime + 0.02, g = ctx.createGain(), lp = ctx.createBiquadFilter(), o = ctx.createOscillator();
      lp.type = "lowpass"; lp.frequency.value = 1800; o.type = "square"; g.gain.value = 0;
      o.connect(lp); lp.connect(g); g.connect(fx);
      for (var i = 0; i < 4; i++) {
        var t = t0 + i * 0.42;
        o.frequency.setValueAtTime(i % 2 ? 620 : 880, t);
        g.gain.setValueAtTime(0.16, t); g.gain.setValueAtTime(0.0001, t + 0.3);
      }
      o.start(t0); o.stop(t0 + 1.8);
    },
    // browsers keep a new AudioContext silent until the visitor does something: resume it on the first real gesture
    unlock: function () { if (ctx && on && ctx.state === "suspended") ctx.resume(); },
    update: function (s) {
      depth = Math.max(0, Math.min(11000, s.depth || 0));
      under = Math.max(0, Math.min(1, s.under == null ? 1 : s.under));
      if (!on || !ctx) return;
      var t = ctx.currentTime, a = under * Math.PI / 2;
      surfGain.gain.setTargetAtTime(Math.cos(a) * 0.42, t, 0.4);
      // rumble: cutoff falls with depth on a log scale (about 900 Hz -> 400 at 500 m -> 120 at 3 km -> 60 at the bottom)
      var cutoff = 900 * Math.pow(60 / 900, Math.pow(depth / 11000, 0.45));
      underLP.frequency.setTargetAtTime(cutoff, t, 0.4);
      underGain.gain.setTargetAtTime(Math.sin(a) * (0.85 - 0.45 * depth / 11000), t, 0.4);
      droneGain.gain.setTargetAtTime(Math.sin(a) * 0.22 * Math.min(1, Math.max(0, (depth - 400) / 3000)), t, 0.6);
    },
  };

  ["pointerdown", "mousedown", "keydown", "touchend", "click"].forEach(function (ev) {
    window.addEventListener(ev, function () { window.DeepAudio.unlock(); }, { capture: true, passive: true });
  });

  document.addEventListener("visibilitychange", function () {
    if (!ctx || !on) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });
})();
