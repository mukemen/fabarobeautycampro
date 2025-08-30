/* Fabaro Beauty Cam Pro */
const videoEl = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const countdownEl = document.getElementById('countdown');

// Controls
const effectButtons = Array.from(document.querySelectorAll('[data-effect]'));
const beautyLevelEl = document.getElementById('beautyLevel');
const bgBlurLevelEl = document.getElementById('bgBlurLevel');
const glassesEl = document.getElementById('glasses');
const mustacheEl = document.getElementById('mustache');
const catEarsEl = document.getElementById('catears');
const blushEl = document.getElementById('blush');
const customStickerToggle = document.getElementById('customStickerToggle');
const customStickerFile = document.getElementById('customStickerFile');
const stickerScaleEl = document.getElementById('stickerScale');
const flipBtn = document.getElementById('flip');
const mirrorBtn = document.getElementById('mirror');
const gridEl = document.getElementById('grid');
const countdownToggle = document.getElementById('countdownToggle');
const ratioEl = document.getElementById('ratio');
const resolutionEl = document.getElementById('resolution');
const formatEl = document.getElementById('format');
const captureBtn = document.getElementById('capture');
const downloadLink = document.getElementById('download');
const wmToggle = document.getElementById('wmToggle');
const wmText = document.getElementById('wmText');
const installBtn = document.getElementById('install');
const startCamBtn = document.getElementById('startCam');

// State
let currentEffect = 'none';
let mirror = true;
let useFrontCamera = true;
let currentStream = null;
let lastResults = null;
let pendingInstallEvent = null;
let customSticker = null;

// --- Helpers & Debug ---
const debugEl = document.getElementById('debug');
function log(msg){ if(debugEl){ debugEl.textContent = String(msg); } }
function isInAppBrowser(){
  const ua = navigator.userAgent || '';
  return /(FBAN|FBAV|Instagram|Line|WeChat|MiuiBrowser|UCBrowser)/i.test(ua);
}
async function checkPermission(){
  try{
    if (navigator.permissions && navigator.permissions.query){
      const st = await navigator.permissions.query({name:'camera'});
      return st.state; // 'granted' | 'prompt' | 'denied'
    }
  }catch(e){}
  return 'unknown';
}

// Persist / restore settings
const SETTINGS_KEY = 'cfpro_settings_v1';
function saveSettings() {
  const s = {
    effect: currentEffect,
    beauty: beautyLevelEl.value,
    bgblur: bgBlurLevelEl.value,
    grid: gridEl.checked,
    countdown: countdownToggle.checked,
    ratio: ratioEl.value,
    res: resolutionEl.value,
    format: formatEl.value,
    mirror, wm: wmToggle.checked, wmtext: wmText.value,
    glasses: glassesEl.checked, mustache: mustacheEl.checked, catears: catEarsEl.checked, blush: blushEl.checked,
    stickerScale: stickerScaleEl.value, stickerOn: customStickerToggle.checked
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
function restoreSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    beautyLevelEl.value = s.beauty ?? 35;
    bgBlurLevelEl.value = s.bgblur ?? 45;
    gridEl.checked = !!s.grid;
    countdownToggle.checked = s.countdown ?? true;
    ratioEl.value = s.ratio ?? '4:3';
    resolutionEl.value = s.res ?? '1280x720';
    formatEl.value = s.format ?? 'png';
    mirror = s.mirror ?? true;
    wmToggle.checked = s.wm ?? true;
    wmText.value = s.wmtext ?? 'FABARO BEAUTY CAM PRO';
    glassesEl.checked = !!s.glasses;
    mustacheEl.checked = !!s.mustache;
    catEarsEl.checked = !!s.catears;
    blushEl.checked = !!s.blush;
    stickerScaleEl.value = s.stickerScale ?? 100;
    customStickerToggle.checked = !!s.stickerOn;
    setEffect(s.effect || 'none');
    mirrorBtn.textContent = `Cermin: ${mirror ? 'ON' : 'OFF'}`;
  } catch(e){}
}

// Effect selection
function setEffect(name) {
  currentEffect = name;
  effectButtons.forEach(b => b.classList.toggle('active', b.dataset.effect === name));
  saveSettings();
}
effectButtons.forEach(btn => btn.addEventListener('click', () => setEffect(btn.dataset.effect)));
[beautyLevelEl,bgBlurLevelEl,gridEl,countdownToggle,ratioEl,resolutionEl,formatEl,wmToggle,wmText,
 glassesEl,mustacheEl,catEarsEl,blushEl,stickerScaleEl,customStickerToggle].forEach(el => {
  el.addEventListener('input', saveSettings);
});

mirrorBtn.addEventListener('click', () => {
  mirror = !mirror;
  mirrorBtn.textContent = `Cermin: ${mirror ? 'ON' : 'OFF'}`;
  saveSettings();
});

flipBtn.addEventListener('click', async () => {
  useFrontCamera = !useFrontCamera;
  await startCamera(true);
});

captureBtn.addEventListener('click', async () => {
  if (countdownToggle.checked) {
    await doCountdown();
  }
  const mime = formatEl.value === 'jpg' ? 'image/jpeg' : 'image/png';
  const data = canvas.toDataURL(mime, 0.92);
  downloadLink.href = data;
  downloadLink.download = `selfie.${formatEl.value}`;
  downloadLink.click();
});

customStickerFile.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => { customSticker = img; };
  img.src = URL.createObjectURL(f);
});

async function doCountdown() {
  countdownEl.classList.remove('hidden');
  for (let i=3;i>=1;i--) {
    countdownEl.textContent = String(i);
    await new Promise(r=>setTimeout(r, 700));
  }
  countdownEl.classList.add('hidden');
}

// ---- CAMERA ----
async function startCamera(force = false) {
  if (currentStream) currentStream.getTracks().forEach(t => t.stop());
  const res = resolutionEl.value.split('x').map(n=>parseInt(n,10));
  const constraints = {
    video: {
      width: { ideal: res[0] },
      height: { ideal: res[1] },
      facingMode: useFrontCamera ? 'user' : 'environment'
    },
    audio: false
  };
  try {
    const perm = await checkPermission();
    if (!force && perm !== 'granted') { log('Tap tombol “Izinkan Kamera” untuk memulai.'); return; }
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    videoEl.srcObject = stream;
    await videoEl.play();
    resizeCanvasToRatio();
    log('Kamera aktif.');
  } catch(e) {
    console.error(e);
    log('Gagal akses kamera: ' + (e && e.message ? e.message : e));
    alert('Tidak bisa mengakses kamera. Buka di Chrome & izinkan kamera di Site settings.');
  }
}

function resizeCanvasToRatio() {
  const [rw,rh] = ratioEl.value.split(':').map(n=>parseInt(n,10));
  const res = resolutionEl.value.split('x').map(n=>parseInt(n,10));
  canvas.width = res[0];
  canvas.height = res[1];
  document.querySelector('.stage').style.aspectRatio = `${rw} / ${rh}`;
}

// ---- MEDIAPIPE ----
let faceMesh = null;
async function initFaceMesh() {
  faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
  faceMesh.setOptions({
    selfieMode: true,
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  });
  faceMesh.onResults((results) => { lastResults = results; });

  // render loop tanpa Camera utils (biar tidak minta permission kedua)
  const loop = async () => {
    try {
      if (videoEl.readyState >= 2) { await faceMesh.send({ image: videoEl }); }
    } catch (e) {}
    renderFrame();
    requestAnimationFrame(loop);
  };
  loop();
}

function px(pt) { return [pt.x * canvas.width, pt.y * canvas.height]; }
function avg(a,b){ return [(a[0]+b[0])/2,(a[1]+b[1])/2]; }
function dist(a,b){ const dx=a[0]-b[0], dy=a[1]-b[1]; return Math.hypot(dx,dy); }

function pathFromIndices(lm, indices) {
  const p0 = px(lm[indices[0]]);
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  for (let i=1;i<indices.length;i++) {
    const p = px(lm[indices[i]]);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
}

function renderFrame() {
  if (!videoEl.videoWidth) return;
  const w = canvas.width, h = canvas.height;
  ctx.save();
  if (mirror) { ctx.translate(w,0); ctx.scale(-1,1); }
  ctx.drawImage(videoEl, 0, 0, w, h);
  ctx.restore();

  const results = lastResults;
  if (results && results.multiFaceLandmarks && results.multiFaceLandmarks.length) {
    const lm = results.multiFaceLandmarks[0];
    if (currentEffect === 'beauty') applyBeautify(lm);
    if (currentEffect === 'bgblur') applyBackgroundBlur(lm);
    if (['bw','sepia','vivid','vignette'].includes(currentEffect)) applyGlobalFilter(currentEffect);
    if (currentEffect === 'vignette') drawVignette();
    drawStickers(lm);
    if (blushEl.checked) drawBlush(lm);
  } else {
    if (['bw','sepia','vivid','vignette'].includes(currentEffect)) applyGlobalFilter(currentEffect);
    if (currentEffect === 'vignette') drawVignette();
  }

  if (gridEl.checked) drawGrid();
  if (wmToggle.checked) drawWatermark(wmText.value);
}

const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];

function applyBeautify(lm) {
  const level = Number(beautyLevelEl.value)/100;
  const blurPx = Math.round(2 + level*6);
  const bright = 1 + level*0.2;
  const temp = document.createElement('canvas');
  temp.width = canvas.width; temp.height = canvas.height;
  const tctx = temp.getContext('2d');
  tctx.drawImage(canvas, 0, 0);
  tctx.filter = `blur(${blurPx}px) saturate(${1+level*0.12}) brightness(${bright})`;
  tctx.drawImage(temp, 0, 0);

  ctx.save();
  pathFromIndices(lm, FACE_OVAL); ctx.clip();
  ctx.drawImage(tctx.canvas, 0, 0);
  ctx.restore();

  const leftEye = px(lm[33]), rightEye = px(lm[263]);
  const eyeW = dist(leftEye, rightEye);
  ctx.save(); ctx.globalAlpha = 0.9;
  const regions = [
    { c: avg(px(lm[159]), px(lm[145])), r: eyeW*0.18 },
    { c: avg(px(lm[386]), px(lm[374])), r: eyeW*0.18 },
    { c: avg(px(lm[13]), px(lm[14])), r: eyeW*0.16 },
  ];
  regions.forEach(r => {
    ctx.beginPath(); ctx.arc(r.c[0], r.c[1], r.r, 0, Math.PI*2); ctx.closePath(); ctx.clip();
    ctx.save(); if (mirror) { ctx.translate(canvas.width,0); ctx.scale(-1,1); }
    ctx.drawImage(videoEl, 0,0, canvas.width, canvas.height); ctx.restore();
  });
  ctx.restore();
}

function applyBackgroundBlur(lm) {
  const level = Number(bgBlurLevelEl.value)/100;
  const blurPx = Math.round(4 + level*10);
  const temp = document.createElement('canvas');
  temp.width = canvas.width; temp.height = canvas.height;
  const tctx = temp.getContext('2d');
  tctx.drawImage(canvas, 0, 0);
  tctx.filter = `blur(${blurPx}px) saturate(1.05)`;
  tctx.drawImage(temp, 0, 0);

  ctx.save();
  ctx.drawImage(tctx.canvas, 0, 0);
  ctx.globalCompositeOperation = 'destination-out';
  pathFromIndices(lm, FACE_OVAL); ctx.fill();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function applyGlobalFilter(name) {
  const temp = document.createElement('canvas');
  temp.width = canvas.width; temp.height = canvas.height;
  const tctx = temp.getContext('2d');
  tctx.drawImage(canvas, 0, 0);
  if (name==='bw') tctx.filter = 'grayscale(100%) contrast(1.1)';
  if (name==='sepia') tctx.filter = 'sepia(100%) saturate(1.2)';
  if (name==='vivid') tctx.filter = 'contrast(1.2) saturate(1.4)';
  tctx.drawImage(temp, 0, 0);
  ctx.drawImage(tctx.canvas, 0, 0);
}

function drawVignette() {
  const w=canvas.width, h=canvas.height;
  const g = ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.3, w/2,h/2,Math.max(w,h)*0.7);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.35)');
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
}

function drawGrid() {
  const w=canvas.width,h=canvas.height;
  ctx.save();
  ctx.strokeStyle='rgba(255,255,255,.35)';
  ctx.lineWidth=1;
  for (let i=1;i<=2;i++){
    const x = (w/3)*i; const y=(h/3)*i;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
  }
  ctx.restore();
}

function drawWatermark(text) {
  const pad=16;
  ctx.save();
  ctx.globalAlpha=0.75;
  ctx.font = `${Math.round(canvas.width*0.025)}px system-ui,Segoe UI,Roboto`;
  ctx.textBaseline='bottom';
  const w = ctx.measureText(text).width + 20;
  const h = Math.round(canvas.width*0.04);
  const x = canvas.width - w - pad;
  const y = canvas.height - pad;
  ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(x, y-h, w, h);
  ctx.fillStyle='#e2e8f0'; ctx.fillText(text, x+10, y-6);
  ctx.restore();
}

// Stickers & AR
function roundRectPath(x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();}
function drawSunglasses(center, eyeW){
  const w=eyeW*1.5, h=eyeW*0.45; const x=center[0]-w/2, y=center[1]-h/2; const bridgeW=w*0.12, lensW=(w-bridgeW)/2;
  ctx.save(); ctx.globalAlpha=0.9; ctx.fillStyle='rgba(0,0,0,0.75)';
  roundRectPath(x,y,lensW,h,h*0.4); ctx.fill();
  roundRectPath(x+lensW+bridgeW,y,lensW,h,h*0.4); ctx.fill();
  ctx.fillRect(x+lensW,y+h*0.35,bridgeW,h*0.3);
  ctx.globalAlpha=0.25; ctx.fillStyle='#ffffff';
  roundRectPath(x+6,y+4,lensW-12,h*0.35,h*0.4); ctx.fill();
  roundRectPath(x+lensW+bridgeW+6,y+4,lensW-12,h*0.35,h*0.4); ctx.fill();
  ctx.restore();
}
function drawMustache(center,width){
  const h=width*0.25; const x=center[0]-width/2; const y=center[1]+h*0.1;
  ctx.save(); ctx.fillStyle='rgba(30,20,10,0.95)';
  ctx.beginPath();
  ctx.moveTo(center[0],y);
  ctx.bezierCurveTo(center[0]-width*0.15,y-h*1.2,x+width*0.05,y-h*0.3,x+width*0.2,y);
  ctx.bezierCurveTo(x+width*0.4,y+h*0.6,center[0]-width*0.05,y+h*0.4,center[0],y);
  ctx.moveTo(center[0],y);
  ctx.bezierCurveTo(center[0]+width*0.15,y-h*1.2,x+width*0.95,y-h*0.3,x+width*0.8,y);
  ctx.bezierCurveTo(x+width*0.6,y+h*0.6,center[0]+width*0.05,y+h*0.4,center[0],y);
  ctx.fill(); ctx.restore();
}
function drawCatEars(center,width){
  const earOffsetY=width*0.85; const leftX=center[0]-width*0.45; const rightX=center[0]+width*0.45; const baseY=center[1]-earOffsetY; const earH=width*0.55;
  ctx.save(); ctx.globalAlpha=0.95;
  ctx.beginPath(); ctx.moveTo(leftX,baseY); ctx.lineTo(leftX-width*0.18,baseY-earH); ctx.lineTo(leftX+width*0.18,baseY-earH*0.92); ctx.closePath(); ctx.fillStyle='#111827'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(leftX,baseY-earH*0.18); ctx.lineTo(leftX-width*0.12,baseY-earH*0.78); ctx.lineTo(leftX+width*0.1,baseY-earH*0.72); ctx.closePath(); ctx.fillStyle='#f472b6'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(rightX,baseY); ctx.lineTo(rightX+width*0.18,baseY-earH); ctx.lineTo(rightX-width*0.18,baseY-earH*0.92); ctx.closePath(); ctx.fillStyle='#111827'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(rightX,baseY-earH*0.18); ctx.lineTo(rightX+width*0.12,baseY-earH*0.78); ctx.lineTo(rightX-width*0.1,baseY-earH*0.72); ctx.closePath(); ctx.fillStyle='#f472b6'; ctx.fill();
  ctx.restore();
}
function drawBlush(lm){
  const left = avg(px(lm[50]), px(lm[101]));
  const right = avg(px(lm[280]), px(lm[330]));
  const r = dist(px(lm[33]), px(lm[263]))*0.15;
  ctx.save(); ctx.globalAlpha=0.15; ctx.fillStyle='#f472b6';
  ctx.beginPath(); ctx.ellipse(left[0], left[1], r, r*0.7, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(right[0], right[1], r, r*0.7, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawStickers(lm){
  const leftEye = px(lm[33]);
  const rightEye = px(lm[263]);
  const eyeMid = avg(leftEye, rightEye);
  const eyeW = dist(leftEye, rightEye);

  if (glassesEl.checked) drawSunglasses(eyeMid, eyeW);
  if (mustacheEl.checked) {
    const mouthC = avg(px(lm[13]), px(lm[14]));
    drawMustache(mouthC, eyeW*0.9);
  }
  if (catEarsEl.checked) drawCatEars(eyeMid, eyeW*1.2);
  if (customStickerToggle.checked && customSticker) {
    const forehead = px(lm[10]);
    const scale = Number(stickerScaleEl.value)/100;
    const w = eyeW*1.6*scale;
    const h = (customSticker.height/customSticker.width)*w;
    const x = forehead[0]-w/2;
    const y = forehead[1]-h*1.4;
    ctx.save(); ctx.globalAlpha=0.95;
    ctx.drawImage(customSticker, x, y, w, h);
    ctx.restore();
  }
}

// PWA install
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pendingInstallEvent = e;
  installBtn.disabled = false;
});
if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!pendingInstallEvent) return;
    pendingInstallEvent.prompt();
    await pendingInstallEvent.userChoice;
    pendingInstallEvent = null;
  });
}

// Service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}

// Start camera on user gesture
if (startCamBtn){
  startCamBtn.addEventListener('click', async()=>{ await startCamera(true); });
}

// Init
(async function init(){
  restoreSettings();
  const perm = await checkPermission();
  if (isInAppBrowser()) log('Terbuka di in-app browser. Buka di Chrome agar kamera bisa dipakai.');
  if (perm === 'granted') { await startCamera(true); } else { log('Tap tombol “Izinkan Kamera” untuk memulai.'); }
  await initFaceMesh();
  window.addEventListener('resize', resizeCanvasToRatio);
  ratioEl.addEventListener('change', resizeCanvasToRatio);
  resolutionEl.addEventListener('change', () => { startCamera(true); resizeCanvasToRatio(); });
})();
