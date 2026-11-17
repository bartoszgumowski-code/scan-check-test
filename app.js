/* Scan Check: live camera scanning with zxing-cpp (WebAssembly). Results are interpreted by gs1.js. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var Z = window.ZXingWASM;
  var READ_OPTS = { tryHarder: true, maxNumberOfSymbols: 1, textMode: "HRI" };

  /* ---------- reader setup ---------- */
  var readerReady = false;
  var readerPromise = Z
    ? Z.prepareZXingModule({
        overrides: {
          locateFile: function (path, prefix) {
            return path.endsWith(".wasm") ? new URL("vendor/zxing-wasm/zxing_reader.wasm", location.href).href : prefix + path;
          }
        },
        fireImmediately: true
      }).then(function () { readerReady = true; setStatus(window.isSecureContext ? "" : "Camera needs a secure (https) address."); })
        .catch(function (e) { setStatus("The barcode reader could not load. Reload the page. (" + (e && e.message) + ")", true); })
    : Promise.reject(new Error("missing"));
  if (!Z) setStatus("The barcode reader file is missing. Reload the page.", true);

  /* ---------- helpers ---------- */
  function setStatus(msg, err) { var s = $("status"); s.textContent = msg || ""; s.className = "status" + (err ? " err" : ""); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- result rendering ---------- */
  function rawHTML(res) {
    if (res.segments) return res.segments.map(function (a) { return '<span class="seg-ai">(' + esc(a.ai) + ")</span>" + esc(a.v); }).join(" ");
    return esc(res.raw.replace(/\u001d/g, "<GS>"));
  }
  function renderResult(res, example) {
    var h = '<div class="result-head"><span class="chip chip-format">' + esc(res.formatName) + "</span>";
    if (res.gs1) h += '<span class="chip chip-gs1">GS1 data</span>';
    if (example) h += '<span class="chip chip-example">Example</span>';
    h += "</div><div><h2>" + esc(res.title) + '</h2><p class="summary">' + esc(res.summary) + "</p></div>";
    h += '<div><div class="raw-label">What the barcode contains</div><div class="raw">' + rawHTML(res) + '</div></div><div class="fields">';
    res.fields.forEach(function (f) {
      var badge = f.ok === true ? '<span class="badge ok">check digit OK</span>' : f.ok === false ? '<span class="badge bad">check digit wrong</span>' : "";
      var val = f.link ? '<a href="' + esc(f.value) + '" target="_blank" rel="noopener">' + esc(f.value) + "</a>" : esc(f.value);
      h += '<div class="field"><div class="ai' + (f.ai ? "" : " none") + '">' + (f.ai ? esc(f.ai) : "&middot;") + '</div><div class="body"><div class="label">' +
        esc(f.label) + badge + '</div><div class="value">' + val + "</div>" + (f.note ? '<div class="note">' + esc(f.note) + "</div>" : "") + "</div></div>";
    });
    h += "</div>";
    if (res.tip) h += '<div class="tip">' + esc(res.tip) + "</div>";
    h += '<div class="hist-actions"><button class="btn-small" type="button" id="copyOne">Copy value</button></div>';
    if (example) h += '<p class="summary">Example of a pallet-contents label. Scan a barcode to see your own here.</p>';
    $("result").innerHTML = h;
    $("copyOne").addEventListener("click", function () { copyText(res.raw.replace(/\u001d/g, ""), this); });
  }

  /* ---------- history ---------- */
  var KEY = "scancheck.history.v1";
  var history = [];
  try { history = JSON.parse(store(KEY) || "[]") || []; } catch (e) { history = []; }
  function saveHistory() { store(KEY, JSON.stringify(history.slice(0, 300))); }
  function renderHistory() {
    var ul = $("hist");
    if (!history.length) { ul.innerHTML = '<li class="empty">No scans yet. Every code you scan is listed here.</li>'; return; }
    ul.innerHTML = history.map(function (h, i) {
      var d = new Date(h.ts);
      var t = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      return '<li class="hist-item" tabindex="0" data-i="' + i + '"><span class="v">' + esc(h.text.replace(/\u001d/g, " ")) + '</span><span class="t">' + t +
        '</span><span class="k">' + esc(h.title + " · " + h.formatName) + "</span></li>";
    }).join("");
  }
  function addHistory(res, sym) {
    history.unshift({ ts: Date.now(), text: res.raw, format: res.format, sym: sym || "", formatName: res.formatName, title: res.title });
    history = history.slice(0, 300);
    saveHistory(); renderHistory();
  }
  function openHistory(i) {
    var h = history[i]; if (!h) return;
    renderResult(ScanGS1.interpret(h.text, h.format, h.sym));
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("hist").addEventListener("click", function (e) { var li = e.target.closest(".hist-item"); if (li) openHistory(+li.dataset.i); });
  $("hist").addEventListener("keydown", function (e) { if (e.key === "Enter") { var li = e.target.closest(".hist-item"); if (li) openHistory(+li.dataset.i); } });

  function tableRows(sep) {
    var head = ["Time", "Type", "What it is", "Value", "NVE (00)", "GTIN (01/02)", "Charge (10)", "Best before (15)", "Expiry (17)", "Count (37)"];
    var q = function (v) { v = String(v); return sep === ";" && /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v.replace(/\t/g, " "); };
    var rows = [head.map(q).join(sep)];
    history.forEach(function (h) {
      var r = ScanGS1.interpret(h.text, h.format, h.sym), k = {};
      (r.segments || []).forEach(function (a) { k[a.ai] = a.v; });
      rows.push([new Date(h.ts).toLocaleString("de-DE"), r.formatName, r.title, h.text.replace(/\u001d/g, " "), k["00"] || "", k["01"] || k["02"] || "",
        k["10"] || "", k["15"] ? ScanGS1.fmtDate(k["15"]) : "", k["17"] ? ScanGS1.fmtDate(k["17"]) : "", k["37"] || ""].map(q).join(sep));
    });
    return rows.join("\n");
  }
  function copyText(t, btn) {
    var done = function () { if (btn) { var o = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = o; }, 1400); } };
    try { navigator.clipboard.writeText(t).then(done, function () { setStatus("Copy was blocked by the browser.", true); }); }
    catch (e) { setStatus("Copy is not supported in this browser.", true); }
  }
  $("copyAll").addEventListener("click", function () { if (!history.length) return setStatus("Nothing to copy yet."); copyText(tableRows("\t"), this); });
  $("csvBtn").addEventListener("click", function () {
    if (!history.length) return setStatus("Nothing to download yet.");
    var blob = new Blob(["﻿" + tableRows(";")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "scans-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });
  $("clearAll").addEventListener("click", function () { $("clearConfirm").hidden = false; });
  $("clearNo").addEventListener("click", function () { $("clearConfirm").hidden = true; });
  $("clearYes").addEventListener("click", function () { history = []; saveHistory(); renderHistory(); $("clearConfirm").hidden = true; });

  /* ---------- feedback ---------- */
  var audioCtx = null, soundOn = store("scancheck.sound") !== "0";
  $("soundBtn").setAttribute("aria-pressed", String(soundOn));
  function initAudio() { try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch (e) {} }
  /* "Blip": a short rising two-note chirp, built as a tiny WAV so it plays through a media element.
     On iPhone this also plays when the ringer switch is on silent (Web Audio does not). */
  function makeBlip() {
    var rate = 22050, len = Math.round(rate * 0.16), data = new Int16Array(len), phase = 0;
    for (var i = 0; i < len; i++) {
      var t = i / rate;
      var f = t < 0.06 ? 900 + (t / 0.06) * 500 : 1900 + ((t - 0.06) / 0.1) * 500;
      var noteT = t < 0.06 ? t : t - 0.065;
      var noteLen = t < 0.06 ? 0.06 : 0.095;
      var env = noteT < 0 ? 0 : Math.min(1, noteT / 0.004) * Math.max(0, 1 - noteT / noteLen);
      phase += (2 * Math.PI * f) / rate;
      data[i] = Math.round(Math.sin(phase) * env * 0.55 * 32767);
    }
    var buf = new ArrayBuffer(44 + len * 2), v = new DataView(buf);
    var w = function (o, s) { for (var k = 0; k < s.length; k++) v.setUint8(o + k, s.charCodeAt(k)); };
    w(0, "RIFF"); v.setUint32(4, 36 + len * 2, true); w(8, "WAVE"); w(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, "data"); v.setUint32(40, len * 2, true);
    for (var j = 0; j < len; j++) v.setInt16(44 + j * 2, data[j], true);
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }
  var blipEl = null, audioUnlocked = false;
  try { blipEl = new Audio(makeBlip()); blipEl.preload = "auto"; } catch (e) { blipEl = null; }
  function unlockAudio() {
    initAudio();
    if (audioUnlocked || !blipEl) return;
    blipEl.muted = true;
    var p = blipEl.play();
    var finish = function () { blipEl.pause(); blipEl.currentTime = 0; blipEl.muted = false; audioUnlocked = true; };
    if (p && p.then) p.then(finish, function () { blipEl.muted = false; }); else finish();
  }
  document.addEventListener("pointerdown", unlockAudio, { passive: true });
  document.addEventListener("keydown", unlockAudio);

  function webAudioBlip() {
    if (!audioCtx) return;
    try {
      var now = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(900, now); o.frequency.linearRampToValueAtTime(1400, now + 0.06);
      o.frequency.setValueAtTime(1900, now + 0.065); o.frequency.linearRampToValueAtTime(2400, now + 0.16);
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.35, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      o.connect(g); g.connect(audioCtx.destination); o.start(now); o.stop(now + 0.17);
    } catch (e) {}
  }
  function beep() {
    if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
    if (!soundOn) return;
    if (!blipEl) return webAudioBlip();
    try {
      blipEl.currentTime = 0;
      var p = blipEl.play();
      if (p && p.catch) p.catch(webAudioBlip);
    } catch (e) { webAudioBlip(); }
  }
  $("soundBtn").addEventListener("click", function () { soundOn = !soundOn; initAudio(); this.setAttribute("aria-pressed", String(soundOn)); store("scancheck.sound", soundOn ? "1" : "0"); });

  /* ---------- camera ---------- */
  var video = $("video"), stream = null, track = null, running = false, paused = false, busy = false;
  var continuous = store("scancheck.continuous") === "1", lastText = "", lastTime = 0, resumeOnShow = false;
  var frame = document.createElement("canvas"), fctx = frame.getContext("2d", { willReadFrequently: true });
  $("modeBtn").setAttribute("aria-pressed", String(continuous));

  function ui() {
    $("startBox").hidden = running;
    $("guide").hidden = !running || paused;
    $("viewport").classList.toggle("scanning", running && !paused);
    $("pausedBox").hidden = !(running && paused);
    $("stopBtn").hidden = !running;
  }

  function cameraError(e) {
    var n = e && e.name;
    if (n === "NotAllowedError" || n === "SecurityError") return "Camera access was blocked. Allow the camera for this site in the browser settings, then tap Start camera again.";
    if (n === "NotFoundError" || n === "OverconstrainedError") return "No camera was found on this device. Use the photo or typing option below.";
    if (n === "NotReadableError") return "The camera is busy in another app. Close that app and try again.";
    return "The camera could not start" + (e && e.message ? ": " + e.message : ".");
  }

  async function startCamera() {
    initAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $("startText").textContent = "This browser cannot open the camera here. Use the photo or typing option below.";
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    } catch (e) {
      $("startText").textContent = cameraError(e);
      return;
    }
    video.srcObject = stream;
    try { await video.play(); } catch (e) {}
    track = stream.getVideoTracks()[0];
    var caps = {};
    try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch (e) {}
    $("torchBtn").hidden = !caps.torch;
    if (caps.focusMode && caps.focusMode.indexOf("continuous") >= 0) { try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch (e) {} }
    running = true; paused = false; store("scancheck.autostart", "1");
    ui();
    if (!readerReady) setStatus("Loading the barcode reader…");
    readerPromise.then(loop, function () {});
  }

  function stopCamera(keepAuto) {
    running = false;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; track = null; video.srcObject = null;
    $("torchBtn").setAttribute("aria-pressed", "false");
    if (!keepAuto) store("scancheck.autostart", "0");
    $("startText").textContent = "Camera is off. Tap to start it again.";
    ui();
  }

  function drawMarks(pos, w, h) {
    var svg = $("marks");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    if (!pos) { svg.innerHTML = ""; return; }
    var p = [pos.topLeft, pos.topRight, pos.bottomRight, pos.bottomLeft].map(function (q) { return q.x + "," + q.y; }).join(" ");
    svg.innerHTML = '<polygon points="' + p + '" fill="rgba(47,211,122,.25)" stroke="#2fd37a" stroke-width="' + Math.max(3, w / 160) + '" stroke-linejoin="round"/>';
    clearTimeout(drawMarks.t);
    drawMarks.t = setTimeout(function () { svg.innerHTML = ""; }, 900);
  }

  function onHit(hit, w, h) {
    var now = Date.now();
    if (hit.text === lastText && now - lastTime < 2500) { lastTime = now; return; }
    lastText = hit.text; lastTime = now;
    beep();
    drawMarks(hit.position, w, h);
    $("guide").classList.add("hit"); setTimeout(function () { $("guide").classList.remove("hit"); }, 400);
    var res = ScanGS1.interpret(hit.text, hit.format, hit.symbologyIdentifier);
    renderResult(res);
    addHistory(res, hit.symbologyIdentifier);
    $("lastbar").hidden = false;
    $("lastT").textContent = res.title + " · " + res.formatName;
    $("lastV").textContent = hit.text;
    setStatus("");
    if (!continuous) { paused = true; ui(); }
  }

  async function loop() {
    if (!running) return;
    if (!paused && !busy && readerReady && video.readyState >= 2 && video.videoWidth) {
      busy = true;
      try {
        var vw = video.videoWidth, vh = video.videoHeight, s = Math.min(1, 1280 / Math.max(vw, vh));
        var w = Math.round(vw * s), h = Math.round(vh * s);
        if (frame.width !== w || frame.height !== h) { frame.width = w; frame.height = h; }
        fctx.drawImage(video, 0, 0, w, h);
        var results = await Z.readBarcodes(fctx.getImageData(0, 0, w, h), READ_OPTS);
        var hit = null;
        for (var i = 0; i < results.length; i++) if (results[i].isValid) { hit = results[i]; break; }
        if (hit && running && !paused) onHit(hit, w, h);
      } catch (e) {
        setStatus("Reading failed: " + (e && e.message ? e.message : e), true);
      }
      busy = false;
    }
    setTimeout(function () { requestAnimationFrame(loop); }, 40);
  }

  $("startBtn").addEventListener("click", startCamera);
  $("stopBtn").addEventListener("click", function () { stopCamera(false); });
  $("nextBtn").addEventListener("click", function () { initAudio(); paused = false; lastText = ""; $("marks").innerHTML = ""; ui(); });
  $("modeBtn").addEventListener("click", function () {
    continuous = !continuous;
    this.setAttribute("aria-pressed", String(continuous));
    store("scancheck.continuous", continuous ? "1" : "0");
    if (continuous && paused) { paused = false; ui(); }
  });
  $("torchBtn").addEventListener("click", async function () {
    if (!track) return;
    var on = this.getAttribute("aria-pressed") !== "true";
    try { await track.applyConstraints({ advanced: [{ torch: on }] }); this.setAttribute("aria-pressed", String(on)); }
    catch (e) { setStatus("The light could not be switched on this phone.", true); }
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && running) { resumeOnShow = true; stopCamera(true); }
    else if (!document.hidden && resumeOnShow) { resumeOnShow = false; startCamera(); }
  });

  /* Start automatically next time if the camera was already allowed */
  if (store("scancheck.autostart") === "1" && navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: "camera" }).then(function (p) { if (p.state === "granted") startCamera(); }, function () {});
  }

  /* ---------- photo ---------- */
  $("pick").addEventListener("change", async function () {
    var f = this.files && this.files[0]; this.value = "";
    if (!f) return;
    setStatus("Reading the photo…");
    try {
      await readerPromise;
      var results = await Z.readBarcodes(f, READ_OPTS);
      var hit = results.filter(function (r) { return r.isValid; })[0];
      if (!hit) return setStatus("No barcode found in this photo. Move closer and keep the barcode sharp and straight.", true);
      var res = ScanGS1.interpret(hit.text, hit.format, hit.symbologyIdentifier);
      renderResult(res); addHistory(res, hit.symbologyIdentifier); setStatus("");
      $("result").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) { setStatus("This photo could not be read: " + (e && e.message ? e.message : e), true); }
  });

  /* ---------- typed / handheld ---------- */
  $("typedForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = $("typed").value;
    if (!v.trim()) return;
    var res = ScanGS1.interpret(v, "TYPED");
    renderResult(res); addHistory(res); setStatus("");
    $("typed").value = ""; $("typed").focus();
  });

  /* ---------- first view ---------- */
  renderResult(ScanGS1.interpret("(02)04012345000016(37)40(10)L2611A(15)271031", "Code128", "]C1"), true);
  renderHistory();
  ui();
})();
