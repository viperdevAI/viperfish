/* Voice: a robotic ship's computer, using the browser's built-in speech. Which voices exist depends on the device:
   on a Mac it picks one of the novelty robot voices (Zarvox first); anywhere else it uses an ordinary English voice pushed low and flat. */
(function () {
  "use strict";
  var synth = window.speechSynthesis, voice = null, robotic = false;
  var PREFER = ["Zarvox", "Trinoids", "Fred", "Ralph", "Albert", "Junior", "Organ"];   // roughly in order of how robotic they sound

  function pick() {
    if (!synth) return;
    var list = synth.getVoices() || [], i, j;
    for (i = 0; i < PREFER.length; i++) for (j = 0; j < list.length; j++) if (list[j].name.indexOf(PREFER[i]) === 0 && /^en/i.test(list[j].lang)) { voice = list[j]; robotic = i < 3; return; }
    for (j = 0; j < list.length; j++) if (/^en/i.test(list[j].lang) && /male|daniel|alex|google uk english male/i.test(list[j].name)) { voice = list[j]; robotic = false; return; }
    for (j = 0; j < list.length; j++) if (/^en/i.test(list[j].lang)) { voice = list[j]; robotic = false; return; }
  }
  if (synth) { pick(); if (synth.addEventListener) synth.addEventListener("voiceschanged", pick); }

  window.Voice = {
    available: !!(synth && window.SpeechSynthesisUtterance),
    // say(text): interrupts anything still being said unless `queue` is true
    say: function (text, queue) {
      if (!this.available) return false;
      try {
        if (!queue) synth.cancel();
        var u = new SpeechSynthesisUtterance(text);
        if (voice) u.voice = voice;
        u.lang = (voice && voice.lang) || "en-US";
        u.rate = robotic ? 0.88 : 0.82;       // slow and deliberate
        u.pitch = robotic ? 0.7 : 0.15;       // an ordinary voice is dropped as low as it goes, to sound flat and mechanical
        u.volume = 1;                          // the maximum the browser allows
        var done = false, fin = function () { if (done) return; done = true; if (window.DeepAudio && DeepAudio.duck) DeepAudio.duck(false); };
        u.onstart = function () { if (window.DeepAudio && DeepAudio.duck) DeepAudio.duck(true); };
        u.onend = u.onerror = fin;
        setTimeout(fin, 14000);                // never leave the ambient sound lowered
        synth.speak(u);
        return true;
      } catch (e) { return false; }
    },
    cancel: function () { if (synth) try { synth.cancel(); } catch (e) {} if (window.DeepAudio && DeepAudio.unduckAll) DeepAudio.unduckAll(); },
    info: function () { return { voice: voice && voice.name, robotic: robotic }; },
  };
})();
