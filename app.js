/* Fabaro Beauty Cam Pro — efek cewek + AR stiker */
const videoEl = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const countdownEl = document.getElementById('countdown');
const debugEl = document.getElementById('debug');

const effectButtons = Array.from(document.querySelectorAll('[data-effect]'));
const beautyLevelEl = document.getElementById('beautyLevel');
const bgBlurLevelEl = document.getElementById('bgBlurLevel');

const fxBlushEl = document.getElementById('fxBlush');
const fxLipTintEl = document.getElementById('fxLipTint');
const fxEyeBrightEl = document.getElementById('fxEyeBright');
const fxSoftPeachEl = document.getElementById('fxSoftPeach');

const stGlassesEl = document.getElementById('stGlasses');
const stMustacheEl = document.getElementById('stMustache');
const stCatEarsEl = document.getElementById('stCatEars');
const stBunnyEl = document.getElementById('stBunny');
const stCrownEl = document.getElementById('stCrown');
const stSparklesEl = document.getElementById('stSparkles');
const stFlowersEl = document.getElementById('stFlowers');
const stHeartCheekEl = document.getElementById('stHeartCheek');

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

let currentEffect = 'none';
let mirror = true;
let useFrontCamera = true;
let currentStream = null;
let lastResults = null;
let pendingInstallEvent = null;
let customSticker = null;

// ---- helpers ----
const log = (m)=>{ if (debugEl) debugEl.textContent = String(m); };
function isInAppBrowser(){
  const ua = navigator.userAgent || '';
  return /(FBAN|FBAV|Instagram|Line|WeChat|MiuiBrowser|UCBrowser)/i.test(ua);
}
async function checkPermission(){
  try{
    if (navigator.permissions?.query){
      const st = await navigator.permissions.query({name:'camera'});
      return st.state;
    }
  }catch(_){}
  return 'unknown';
}

// settings
const SETTINGS_KEY = 'cfpro_settings_v2';
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
    stickers: {
      glasses: stGlassesEl.checked, mustache: stMustacheEl.checked, cat: stCatEarsEl.checked,
      bunny: stBunnyEl.checked, crown: stCrownEl.checked, sparkles: stSparklesEl.checked,
      flowers: stFlowersEl.checked, heartcheek: stHeartCheekEl.checked
    },
    beautyfx: {
      blush: fxBlushEl.checked, liptint: fxLipTintEl.checked,
      eyebright: fxEyeBrightEl.checked, softpeach: fxSoftPeachEl.checked
    },
    stickerScale: stickerScaleEl.value, stickerOn: customStickerToggle.checked
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
function restoreSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return;
  try{
    const s = JSON.parse(raw);
    beautyLevelEl.value = s.beauty ?? 40;
    bgBlurLevelEl.value = s.bgblur ?? 45;
    gridEl.checked = !!s.grid;
    countdownToggle.checked = s.countdown ?? true;
    ratioEl.value = s.ratio ?? '4:3';
    resolutionEl.value = s.res ?? '1280x720';
    formatEl.value = s.format ?? 'png';
    mirror = s.mirror ?? true; mirrorBtn.textContent = `Cermin: ${mirror ? 'ON':'OFF'}`;
    wmToggle.checked = s.wm ?? true; wmText.value = s.wmtext ?? 'FABARO BEAUTY CAM PRO';
    if (s.stickers){
      stGlassesEl.checked = !!s.stickers.glasses;
      stMustacheEl.checked = !!s.stickers.mustache;
      stCatEarsEl.checked = !!s.stickers.cat;
      stBunnyEl.checked = !!s.stickers.bunny;
      stCrownEl.checked = !!s.stickers.crown;
      stSparklesEl.checked = !!s.stickers.sparkles;
      stFlowersEl.checked = !!s.stickers.flowers;
      stHeartCheekEl.checked = !!s.stickers.heartcheek;
    }
    if (s.beautyfx){
      fxBlushEl.checked = !!s.beautyfx.blush;
      fxLipTintEl.checked = !!s.beautyfx.liptint;
      fxEyeBrightEl.checked = !!s.beautyfx.eyebright;
      fxSoftPeachEl.checked = !!s.beautyfx.softpeach;
    }
    stickerScaleEl.value = s.stickerScale ?? 110;
    customStickerToggle.checked = !!s.stickerOn;
    setEffect(s.effect || 'none');
  }catch(_){}
}

// events
effectButtons.forEach(btn => btn.addEventListener('click', () => setEffect(btn.dataset.effect)));
[
  beautyLevelEl,bgBlurLevelEl,gridEl,countdownToggle,ratioEl,resolutionEl,formatEl,wmToggle,wmText,
  stGlassesEl,stMustacheEl,stCatEarsEl,stBunnyEl,stCrownEl,stSparklesEl,stFlowersEl,stHeartCheekEl,
  fxBlushEl,fxLipTintEl,fxEyeBrightEl,fxSoftPeachEl,
  stickerScaleEl,customStickerToggle
].forEach(el => el.addEventListener('input', saveSettings));

document.getElementById('mirror').addEventListener('click', ()=>{ mirror=!mirror; saveSettings(); mirrorBtn.textContent=`Cermin: ${mirror?'ON':'OFF'}`; });
flipBtn.addEventListener('click', async ()=>{ useFrontCamera=!useFrontCamera; await startCamera(true); });

captureBtn.addEventListener('click', async ()=>{
  if (countdownToggle.checked) await doCountdown();
  const mime = formatEl.value==='jpg' ? 'image/jpeg' : 'image/png';
  const data = canvas.toDataURL(mime, 0.92);
  downloadLink.href = data; downloadLink.download = `selfie.${formatEl.value}`; downloadLink.click();
});

customStickerFile.addEventListener('change', (e)=>{
  const f = e.target.files?.[0]; if(!f) return;
  const img = new Image(); img.onload=()=>{ customSticker=img; }; img.src = URL.createObjectURL(f);
});

window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); pendingInstallEvent=e; installBtn.disabled=false; });
installBtn.addEventListener('click', async ()=>{ if(!pendingInstallEvent)return; pendingInstallEvent.prompt(); await pendingInstallEvent.userChoice; pendingInstallEvent=null; });
if ('serviceWorker' in navigator) window.addEventListener('load', ()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

if (startCamBtn) startCamBtn.addEventListener('click', ()=> startCamera(true) );

function setEffect(name){
  currentEffect = name;
  effectButtons.forEach(b => b.classList.toggle('active', b.dataset.effect===name));
  saveSettings();
}

async function doCountdown(){
  countdownEl.classList.remove('hidden');
  for (let i=3;i>=1;i--){ countdownEl.textContent=String(i); await new Promise(r=>setTimeout(r,700)); }
  countdownEl.classList.add('hidden');
}

// ---- camera + sizing ----
async function startCamera(force=false){
  if (currentStream) currentStream.getTracks().forEach(t=>t.stop());
  const [w,h] = resolutionEl.value.split('x').map(n=>parseInt(n,10));
  const constraints = { video:{ width:{ideal:w}, height:{ideal:h}, facingMode: useFrontCamera?'user':'environment' }, audio:false };
  try{
    const perm = await checkPermission();
    if (!force && perm!=='granted'){ log('Tap “Izinkan Kamera”.'); return; }
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream; videoEl.srcObject = stream; await videoEl.play();
    setCanvasSize();
    log('Kamera aktif.');
  }catch(e){
    console.error(e); log('Gagal akses kamera: '+(e?.message||e));
    alert('Tidak bisa akses kamera. Buka di Chrome & izinkan kamera di Site settings.');
  }
}
function setCanvasSize(){
  const [w,h] = resolutionEl.value.split('x').map(n=>parseInt(n,10));
  canvas.width = w; canvas.height = h;
  // Stage fallback height (CSS sudah ada 4:3 fallback)
}

// ---- mediapipe face mesh ----
let faceMesh = null;
async function initFaceMesh(){
  faceMesh = new FaceMesh({ locateFile: (f)=> `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
  faceMesh.setOptions({ selfieMode:true, maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:0.6, minTrackingConfidence:0.6 });
  faceMesh.onResults(res => { lastResults = res; });
  // manual loop
  const loop = async ()=>{
    try{ if (videoEl.readyState>=2) await faceMesh.send({ image: videoEl }); }catch(_){}
    renderFrame(); requestAnimationFrame(loop);
  };
  loop();
}

// ---- math helpers ----
const P = (pt)=>[pt.x*canvas.width, pt.y*canvas.height];
const AVG = (a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
const DIST = (a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

// ---- render ----
function renderFrame(){
  if (!videoEl.videoWidth) return;
  const w=canvas.width, h=canvas.height;
  ctx.save(); if (mirror){ ctx.translate(w,0); ctx.scale(-1,1); }
  ctx.drawImage(videoEl, 0, 0, w, h);
  ctx.restore();

  const lm = (lastResults && lastResults.multiFaceLandmarks && lastResults.multiFaceLandmarks[0]) || null;

  // Efek global & regional
  if (currentEffect==='beauty') applyBeautify(lm);
  if (currentEffect==='softglow') applySoftGlow();
  if (currentEffect==='bgblur') applyBackgroundBlur(lm);
  if (['bw','sepia','vivid','vignette'].includes(currentEffect)) applyGlobalFilter(currentEffect);
  if (currentEffect==='vignette') drawVignette();

  // Make-up ringan
  if (lm){
    if (fxBlushEl.checked) drawBlush(lm);
    if (fxLipTintEl.checked) drawLipTint(lm);
    if (fxEyeBrightEl.checked) drawEyeBright(lm);
    if (fxSoftPeachEl.checked) applyPeachTone();
  } else if (fxSoftPeachEl.checked){
    applyPeachTone();
  }

  // Stiker / AR
  if (lm){
    if (stGlassesEl.checked) drawSunglasses(lm);
    if (stMustacheEl.checked) drawMustache(lm);
    if (stCatEarsEl.checked) drawCatEars(lm);
    if (stBunnyEl.checked) drawBunnyEars(lm);
    if (stCrownEl.checked) drawCrown(lm);
    if (stSparklesEl.checked) drawSparkles(lm);
    if (stFlowersEl.checked) drawFlowers(lm);
    if (stHeartCheekEl.checked) drawHeartCheeks(lm);
    if (customStickerToggle.checked && customSticker) drawCustomSticker(lm);
  }

  if (gridEl.checked) drawGrid();
  if (wmToggle.checked) drawWatermark(wmText.value);
}

// ---- EFFECTS ----
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];

function pathFromIndices(lm, ids){
  const p0 = P(lm[ids[0]]); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]);
  for (let i=1;i<ids.length;i++){ const p = P(lm[ids[i]]); ctx.lineTo(p[0], p[1]); }
  ctx.closePath();
}

function applyBeautify(lm){
  const level = Number(beautyLevelEl.value)/100;
  const blurPx = Math.round(2 + level*6);
  const bright = 1 + level*0.18;
  const temp = document.createElement('canvas'); temp.width=canvas.width; temp.height=canvas.height;
  const tctx = temp.getContext('2d'); tctx.drawImage(canvas,0,0);
  tctx.filter = `blur(${blurPx}px) saturate(${1+level*0.12}) brightness(${bright})`;
  tctx.drawImage(temp,0,0);
  if (lm){ ctx.save(); pathFromIndices(lm, FACE_OVAL); ctx.clip(); ctx.drawImage(tctx.canvas,0,0); ctx.restore(); }
  else { ctx.drawImage(tctx.canvas,0,0); }
}

function applySoftGlow(){
  const temp = document.createElement('canvas'); temp.width=canvas.width; temp.height=canvas.height;
  const tctx = temp.getContext('2d'); tctx.drawImage(canvas,0,0);
  tctx.filter='blur(8px) brightness(1.08)'; tctx.drawImage(temp,0,0);
  ctx.save(); ctx.globalCompositeOperation='screen'; ctx.globalAlpha=0.5; ctx.drawImage(tctx.canvas,0,0); ctx.restore();
}

function applyPeachTone(){
  const temp = document.createElement('canvas'); temp.width=canvas.width; temp.height=canvas.height;
  const tctx = temp.getContext('2d'); tctx.drawImage(canvas,0,0);
  tctx.filter='sepia(0.25) saturate(1.05) hue-rotate(-8deg)';
  tctx.drawImage(temp,0,0); ctx.drawImage(tctx.canvas,0,0);
}

function applyBackgroundBlur(lm){
  const level = Number(bgBlurLevelEl.value)/100;
  const blurPx = Math.round(4 + level*10);
  const temp = document.createElement('canvas'); temp.width=canvas.width; temp.height=canvas.height;
  const tctx = temp.getContext('2d'); tctx.drawImage(canvas,0,0);
  tctx.filter = `blur(${blurPx}px) saturate(1.05)`; tctx.drawImage(temp,0,0);
  ctx.save(); ctx.drawImage(tctx.canvas,0,0);
  if (lm){ ctx.globalCompositeOperation='destination-out'; pathFromIndices(lm, FACE_OVAL); ctx.fill(); ctx.globalCompositeOperation='destination-over'; ctx.drawImage(videoEl,0,0,canvas.width,canvas.height); }
  ctx.restore();
}

function applyGlobalFilter(name){
  const t = document.createElement('canvas'); t.width=canvas.width; t.height=canvas.height;
  const tctx = t.getContext('2d'); tctx.drawImage(canvas,0,0);
  if (name==='bw') tctx.filter='grayscale(100%) contrast(1.1)';
  if (name==='sepia') tctx.filter='sepia(100%) saturate(1.2)';
  if (name==='vivid') tctx.filter='contrast(1.2) saturate(1.4)';
  tctx.drawImage(t,0,0); ctx.drawImage(t,0,0);
}

function drawVignette(){
  const w=canvas.width,h=canvas.height;
  const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.3,w/2,h/2,Math.max(w,h)*0.7);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.35)');
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
}

// ---- MAKE-UP (ringan) ----
function drawBlush(lm){
  const L = AVG(P(lm[50]), P(lm[101]));
  const R = AVG(P(lm[280]), P(lm[330]));
  const eyeW = DIST(P(lm[33]), P(lm[263]));
  const r = eyeW*0.18;
  ctx.save(); ctx.globalAlpha=0.16; ctx.fillStyle='#f472b6';
  ctx.beginPath(); ctx.ellipse(L[0], L[1], r, r*0.7, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(R[0], R[1], r, r*0.7, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawLipTint(lm){
  const c = AVG(P(lm[13]), P(lm[14]));
  const eyeW = DIST(P(lm[33]), P(lm[263]));
  const w = eyeW*0.9, h = w*0.35;
  ctx.save(); ctx.globalAlpha=0.18; ctx.fillStyle='#e8517a';
  ctx.beginPath(); ctx.ellipse(c[0], c[1]+h*0.05, w*0.55, h*0.6, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawEyeBright(lm){
  const L = AVG(P(lm[159]), P(lm[145]));
  const R = AVG(P(lm[386]), P(lm[374]));
  const eyeW = DIST(P(lm[33]), P(lm[263]));
  const r = eyeW*0.14;
  ctx.save(); ctx.globalAlpha=0.22; ctx.fillStyle='rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.ellipse(L[0], L[1], r, r*0.7, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(R[0], R[1], r, r*0.7, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

// ---- STICKERS / AR ----
function rr(x,y,w,h,r){const R=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+R,y);ctx.arcTo(x+w,y,x+w,y+h,R);ctx.arcTo(x+w,y+h,x,y+h,R);ctx.arcTo(x,y+h,x,y,R);ctx.arcTo(x,y,x+w,y,R);ctx.closePath();}
function drawSunglasses(lm){
  const L=P(lm[33]), R=P(lm[263]), mid=AVG(L,R), eyeW=DIST(L,R);
  const w=eyeW*1.6, h=eyeW*0.46, x=mid[0]-w/2, y=mid[1]-h/2, bridge=w*0.12, lens=(w-bridge)/2;
  ctx.save(); ctx.globalAlpha=0.9; ctx.fillStyle='rgba(0,0,0,0.78)';
  rr(x,y,lens,h,h*0.4); ctx.fill(); rr(x+lens+bridge,y,lens,h,h*0.4); ctx.fill(); ctx.fillRect(x+lens,y+h*0.35,bridge,h*0.3);
  ctx.globalAlpha=0.25; ctx.fillStyle='#ffffff'; rr(x+6,y+4,lens-12,h*0.35,h*0.4); ctx.fill(); rr(x+lens+bridge+6,y+4,lens-12,h*0.35,h*0.4); ctx.fill();
  ctx.restore();
}
function drawMustache(lm){
  const mouth=AVG(P(lm[13]),P(lm[14])); const eyeW=DIST(P(lm[33]),P(lm[263])); const w=eyeW*0.95; const h=w*0.25; const x=mouth[0]-w/2; const y=mouth[1]+h*0.1;
  ctx.save(); ctx.fillStyle='rgba(30,20,10,0.95)'; ctx.beginPath();
  ctx.moveTo(mouth[0],y); ctx.bezierCurveTo(mouth[0]-w*0.15,y-h*1.2,x+w*0.05,y-h*0.3,x+w*0.2,y);
  ctx.bezierCurveTo(x+w*0.4,y+h*0.6,mouth[0]-w*0.05,y+h*0.4,mouth[0],y);
  ctx.moveTo(mouth[0],y); ctx.bezierCurveTo(mouth[0]+w*0.15,y-h*1.2,x+w*0.95,y-h*0.3,x+w*0.8,y);
  ctx.bezierCurveTo(x+w*0.6,y+h*0.6,mouth[0]+w*0.05,y+h*0.4,mouth[0],y); ctx.fill(); ctx.restore();
}
function drawCatEars(lm){
  const mid=AVG(P(lm[33]),P(lm[263])); const eyeW=DIST(P(lm[33]),P(lm[263]));
  const baseY=mid[1]-eyeW*0.9; const earH=eyeW*0.6; const leftX=mid[0]-eyeW*0.5; const rightX=mid[0]+eyeW*0.5;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(leftX,baseY); ctx.lineTo(leftX-eyeW*0.18,baseY-earH); ctx.lineTo(leftX+eyeW*0.18,baseY-earH*0.9); ctx.closePath(); ctx.fillStyle='#111827'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(leftX,baseY-earH*0.18); ctx.lineTo(leftX-eyeW*0.12,baseY-earH*0.78); ctx.lineTo(leftX+eyeW*0.1,baseY-earH*0.7); ctx.closePath(); ctx.fillStyle='#f472b6'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(rightX,baseY); ctx.lineTo(rightX+eyeW*0.18,baseY-earH); ctx.lineTo(rightX-eyeW*0.18,baseY-earH*0.9); ctx.closePath(); ctx.fillStyle='#111827'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(rightX,baseY-earH*0.18); ctx.lineTo(rightX+eyeW*0.12,baseY-earH*0.78); ctx.lineTo(rightX-eyeW*0.1,baseY-earH*0.7); ctx.closePath(); ctx.fillStyle='#f472b6'; ctx.fill();
  ctx.restore();
}
function drawBunnyEars(lm){
  const mid=AVG(P(lm[33]),P(lm[263])); const eyeW=DIST(P(lm[33]),P(lm[263]));
  const baseY=mid[1]-eyeW*1.0; const earH=eyeW*1.2; const gap=eyeW*0.25;
  ctx.save(); ctx.fillStyle='#f8fafc';
  // left ear
  ctx.beginPath(); ctx.moveTo(mid[0]-gap,baseY);
  ctx.bezierCurveTo(mid[0]-gap-eyeW*0.25,baseY-earH*0.3, mid[0]-gap-eyeW*0.1,baseY-earH, mid[0]-gap*1.1,baseY-earH);
  ctx.bezierCurveTo(mid[0]-gap*0.9,baseY-earH, mid[0]-gap*0.7,baseY-earH*0.3, mid[0]-gap,baseY);
  ctx.fill();
  // right ear
  ctx.beginPath(); ctx.moveTo(mid[0]+gap,baseY);
  ctx.bezierCurveTo(mid[0]+gap+eyeW*0.25,baseY-earH*0.3, mid[0]+gap+eyeW*0.1,baseY-earH, mid[0]+gap*1.1,baseY-earH);
  ctx.bezierCurveTo(mid[0]+gap*0.9,baseY-earH, mid[0]+gap*0.7,baseY-earH*0.3, mid[0]+gap,baseY); ctx.fill();
  // inner pink
  ctx.fillStyle='#f472b6'; const inner=earH*0.75;
  ctx.beginPath(); ctx.ellipse(mid[0]-gap*1.02,baseY-earH*0.6, eyeW*0.12, inner*0.28, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(mid[0]+gap*1.02,baseY-earH*0.6, eyeW*0.12, inner*0.28, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawCrown(lm){
  const mid=AVG(P(lm[33]),P(lm[263])); const eyeW=DIST(P(lm[33]),P(lm[263]));
  const y=mid[1]-eyeW*0.95; const w=eyeW*1.4; const h=eyeW*0.55; const x=mid[0]-w/2;
  ctx.save(); ctx.fillStyle='#c3a463'; ctx.beginPath();
  ctx.moveTo(x,y+h); for (let i=0;i<5;i++){ const px=x+(w/4)*i; const py = (i%2===0)? y : y+h*0.2; ctx.lineTo(px, py); }
  ctx.lineTo(x+w,y+h); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#fcd34d'; for (let i=0;i<3;i++){ ctx.beginPath(); const cx=x+w*(0.2+0.3*i); ctx.arc(cx,y+(i===1?0:h*0.1), eyeW*0.06, 0, Math.PI*2); ctx.fill(); }
  ctx.restore();
}
function drawSparkles(lm){
  const mid=AVG(P(lm[33]),P(lm[263])); const eyeW=DIST(P(lm[33]),P(lm[263]));
  sparkle(mid[0]-eyeW*0.9, mid[1]-eyeW*0.2, eyeW*0.22);
  sparkle(mid[0]+eyeW*0.9, mid[1]-eyeW*0.1, eyeW*0.18);
  sparkle(mid[0], mid[1]-eyeW*0.9, eyeW*0.2);
}
function sparkle(x,y,r){
  ctx.save(); ctx.translate(x,y); ctx.fillStyle='rgba(255,255,255,0.9)';
  for (let i=0;i<2;i++){ ctx.beginPath(); ctx.moveTo(0,-r); ctx.lineTo(r*0.2,-r*0.2); ctx.lineTo(r,0); ctx.lineTo(r*0.2,r*0.2); ctx.lineTo(0,r); ctx.lineTo(-r*0.2,r*0.2); ctx.lineTo(-r,0); ctx.lineTo(-r*0.2,-r*0.2); ctx.closePath(); ctx.globalAlpha=0.9-(i*0.3); ctx.fill(); r*=0.6; }
  ctx.restore();
}
function drawFlowers(lm){
  const mid=AVG(P(lm[33]),P(lm[263])); const eyeW=DIST(P(lm[33]),P(lm[263]));
  flower(mid[0]-eyeW*0.7, mid[1]-eyeW*0.6, eyeW*0.18);
  flower(mid[0]+eyeW*0.7, mid[1]-eyeW*0.55, eyeW*0.18);
}
function flower(x,y,r){
  ctx.save(); ctx.translate(x,y);
  for (let i=0;i<6;i++){ ctx.rotate(Math.PI/3); ctx.beginPath(); ctx.ellipse(0, -r*0.7, r*0.35, r*0.6, 0, 0, Math.PI*2); ctx.fillStyle='#f9a8d4'; ctx.fill(); }
  ctx.beginPath(); ctx.arc(0,0,r*0.28,0,Math.PI*2); ctx.fillStyle='#fde68a'; ctx.fill(); ctx.restore();
}
function drawHeartCheeks(lm){
  const L = AVG(P(lm[50]), P(lm[101])); const R = AVG(P(lm[280]), P(lm[330]));
  const eyeW = DIST(P(lm[33]), P(lm[263])); const s=eyeW*0.12;
  heart(L[0], L[1], s, '#fb7185'); heart(R[0], R[1], s, '#fb7185');
}
function heart(x,y,s,color){
  ctx.save(); ctx.translate(x,y); ctx.rotate(-0.1);
  ctx.beginPath();
  ctx.moveTo(0,-s*0.25);
  ctx.bezierCurveTo(-s, -s, -s, s*0.4, 0, s);
  ctx.bezierCurveTo(s, s*0.4, s, -s, 0, -s*0.25);
  ctx.fillStyle=color; ctx.globalAlpha=0.9; ctx.fill(); ctx.restore();
}
function drawCustomSticker(lm){
  const forehead = P(lm[10]); const eyeW=DIST(P(lm[33]),P(lm[263]));
  const scale = Number(stickerScaleEl.value)/100; const w=eyeW*1.6*scale; const h=customSticker.height/customSticker.width*w;
  const x=forehead[0]-w/2; const y=forehead[1]-h*1.4; ctx.save(); ctx.globalAlpha=0.95; ctx.drawImage(customSticker, x,y,w,h); ctx.restore();
}

// util
function drawGrid(){
  const w=canvas.width,h=canvas.height; ctx.save(); ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1;
  for (let i=1;i<=2;i++){ const x=(w/3)*i, y=(h/3)*i; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  ctx.restore();
}
function drawWatermark(text){
  const pad=16; ctx.save(); ctx.globalAlpha=0.75; ctx.font=`${Math.round(canvas.width*0.025)}px system-ui,Segoe UI,Roboto`; ctx.textBaseline='bottom';
  const w=ctx.measureText(text).width+20; const h=Math.round(canvas.width*0.04); const x=canvas.width-w-pad; const y=canvas.height-pad;
  ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(x,y-h,w,h); ctx.fillStyle='#e2e8f0'; ctx.fillText(text,x+10,y-6); ctx.restore();
}

// init
(async function(){
  restoreSettings();
  if (isInAppBrowser()) log('Terbuka di in-app browser. Buka di Chrome agar kamera bisa dipakai.');
  const perm = await checkPermission();
  if (perm==='granted') await startCamera(true); else log('Klik “Izinkan Kamera” di atas kanan.');
  await initFaceMesh();
  window.addEventListener('resize', setCanvasSize);
  ratioEl.addEventListener('change', setCanvasSize);
  resolutionEl.addEventListener('change', ()=>{ startCamera(true); setCanvasSize(); });
})();
