/* Fabaro Beauty Cam Pro — profesional mobile build */
const videoEl = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const countdownEl = document.getElementById('countdown');
const debugEl = document.getElementById('debug');

const refreshBtn = document.getElementById('refreshNow');
const startCamBtn = document.getElementById('startCam');
const installBtn = document.getElementById('install');
const downloadLink = document.getElementById('download');
const captureBtn = document.getElementById('capture');
const proShotBtn = document.getElementById('proShot');
const systemCaptureInput = document.getElementById('systemCapture');

const flipBtn = document.getElementById('flip');
const mirrorBtn = document.getElementById('mirror');
const gridEl = document.getElementById('grid');
const countdownToggle = document.getElementById('countdownToggle');
const resolutionEl = document.getElementById('resolution');
const formatEl = document.getElementById('format');

const beautyLevelEl = document.getElementById('beautyLevel');
const bgBlurLevelEl = document.getElementById('bgBlurLevel');

const fxBlushEl = document.getElementById('fxBlush');
const fxLipTintEl = document.getElementById('fxLipTint');
const fxEyeBrightEl = document.getElementById('fxEyeBright');
const fxSoftPeachEl = document.getElementById('fxSoftPeach');

const customStickerToggle = document.getElementById('customStickerToggle');
const customStickerFile = document.getElementById('customStickerFile');
const stickerScaleEl = document.getElementById('stickerScale');
const wmToggle = document.getElementById('wmToggle');
const wmText = document.getElementById('wmText');

const presetListEl = document.getElementById('presetList');
const stickerPackListEl = document.getElementById('stickerPackList');
const stickerListEl = document.getElementById('stickerList');

let currentEffect = 'none';
let mirror = true;
let useFrontCamera = true;
let currentStream = null;
let faceMesh = null;
let lastResults = null;
let pendingInstallEvent = null;
let customSticker = null;

let ACTIVE_PRESET = null;
let ACTIVE_STICKER_PACK = null;
let STICKER_RUNTIME = []; // loaded images with config

// --- utils ---
const log = (m)=>{ if (debugEl) debugEl.textContent = String(m); };
async function checkPermission(){ try{ if (navigator.permissions?.query){ return (await navigator.permissions.query({name:'camera'})).state; } }catch(_){} return 'unknown'; }
const P=(pt)=>[pt.x*canvas.width, pt.y*canvas.height];
const AVG=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
const DIST=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

// ---- Service Worker flush / Perbarui tombol ----
async function mobileHardRefresh(){
  try{
    if (window.caches?.keys){ const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); }
    if (navigator.serviceWorker?.getRegistrations){ const regs=await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r=>r.unregister())); }
  }finally{
    const u=new URL(location.href); u.searchParams.set('v', Date.now().toString()); location.replace(u.toString());
  }
}
refreshBtn?.addEventListener('click', mobileHardRefresh);

// ---- Camera preview (720p smooth) + device max option ----
function setStageAspectFromVideo(){
  const vw = videoEl.videoWidth || 4, vh = videoEl.videoHeight || 3;
  stage.style.aspectRatio = `${vw} / ${vh}`;
}
function setCanvasToVideo(){
  const vw = videoEl.videoWidth || 1280, vh = videoEl.videoHeight || 720;
  canvas.width = vw; canvas.height = vh;
}
async function startCamera(force=false){
  countdownEl?.classList.add('hidden');
  const perm = await checkPermission();
  if (!force && perm!=='granted'){ log('Tap “Izinkan Kamera”.'); return; }
  if (currentStream) currentStream.getTracks().forEach(t=>t.stop());

  const want = (resolutionEl?.value || '1280x720');
  const base = { video: { facingMode: useFrontCamera?'user':'environment' }, audio:false };

  if (want === 'device'){
    // ringan tetap: preview 720p; full-res saat Pro Shot
    base.video.width = { ideal: 1280 }; base.video.height = { ideal: 720 };
    base.video.frameRate = { ideal: 30, max: 30 };
  } else {
    const [w,h]=want.split('x').map(n=>parseInt(n,10));
    base.video.width = { ideal: w }; base.video.height = { ideal: h };
    base.video.frameRate = { ideal: 30, max: 30 };
  }

  try{
    const stream = await navigator.mediaDevices.getUserMedia(base);
    currentStream = stream; videoEl.srcObject = stream; await videoEl.play();

    // improve if device supports
    const track = stream.getVideoTracks()[0];
    if (track?.getCapabilities){
      const caps = track.getCapabilities(); const adv=[];
      if (caps.focusMode?.includes?.('continuous')) adv.push({ focusMode:'continuous' });
      if (caps.exposureMode?.includes?.('continuous')) adv.push({ exposureMode:'continuous' });
      if (caps.whiteBalanceMode?.includes?.('continuous')) adv.push({ whiteBalanceMode:'continuous' });
      if (adv.length){ try{ await track.applyConstraints({ advanced: adv }); }catch{} }
    }

    if (videoEl.readyState>=2){ setStageAspectFromVideo(); setCanvasToVideo(); }
    else videoEl.addEventListener('loadedmetadata', ()=>{ setStageAspectFromVideo(); setCanvasToVideo(); }, {once:true});

    log('Kamera aktif (preview lancar). Tekan PRO untuk foto full-res.');
  }catch(e){
    console.error(e); log('Gagal akses kamera: '+(e?.message||e));
    alert('Buka di Chrome & izinkan kamera di Site settings.');
  }
}

// Tap to focus (best effort)
stage.addEventListener('click', async (e)=>{
  const track = currentStream?.getVideoTracks?.()[0];
  if (!track?.getCapabilities) return;
  const caps = track.getCapabilities();
  try{
    if (caps.focusMode?.includes?.('single-shot')) await track.applyConstraints({ advanced:[{ focusMode:'single-shot' }] });
    if (caps.pointsOfInterest){
      const r=stage.getBoundingClientRect(); const x=(e.clientX-r.left)/r.width; const y=(e.clientY-r.top)/r.height;
      await track.applyConstraints({ advanced:[{ pointsOfInterest:[{x,y}] }] });
    }
    log('Fokus disetel.');
  }catch{}
});

// ---- FaceMesh (throttled) ----
async function initFaceMesh(){
  // tunggu global FaceMesh tersedia
  let tries=0; while (typeof FaceMesh==='undefined' && tries<100){ await new Promise(r=>setTimeout(r,50)); tries++; }
  faceMesh = new FaceMesh({ locateFile: (f)=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
  faceMesh.setOptions({ selfieMode:true, maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:0.6, minTrackingConfidence:0.6 });
  faceMesh.onResults(res => { lastResults = res; });

  // throttle 12 FPS agar hemat baterai & lancar
  setInterval(async ()=>{ try{ if (videoEl.readyState>=2) await faceMesh.send({ image: videoEl }); }catch{} }, 83);
  requestAnimationFrame(renderLoop);
}

// ---- Preset & Sticker packs loader ----
const DEFAULT_EFFECT_PACKS = [
  { id:'none', name:'Tanpa Efek', apply:{ effect:'none', blush:false, liptint:false, eyebright:false, peach:false }},
  { id:'natural', name:'Natural Peach', apply:{ effect:'beauty', blush:true, liptint:true, eyebright:true, peach:true }},
  { id:'sweet', name:'Sweet Pink', apply:{ effect:'softglow', blush:true, liptint:true, eyebright:false, peach:false }},
  { id:'glam', name:'Glam Night', apply:{ effect:'vignette', blush:true, liptint:true, eyebright:true, peach:false }},
  { id:'bwsoft', name:'B/W Soft', apply:{ effect:'bw', blush:false, liptint:false, eyebright:true, peach:false }},
  { id:'vivid', name:'Vivid Pop', apply:{ effect:'vivid', blush:false, liptint:true, eyebright:false, peach:false }}
];

const DEFAULT_STICKER_PACKS = [
  { id:'vector-cute', name:'Cute (Vector)', type:'vector', stickers:[
    { key:'glasses', name:'Sunglasses', on:false },
    { key:'bunny', name:'Bunny Ears', on:false },
    { key:'crown', name:'Crown', on:false },
    { key:'flowers', name:'Flowers', on:false },
    { key:'sparkles', name:'Sparkles', on:false },
    { key:'heartcheek', name:'Heart Cheeks', on:false },
    { key:'catears', name:'Cat Ears', on:false },
    { key:'mustache', name:'Mustache', on:false }
  ]},
  { id:'images-demo', name:'Images Demo', type:'images', stickers:[
    { key:'pink-heart', name:'Pink Heart', url:"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='180'><path d='M100 170 C-20 90, 30 10, 100 60 C170 10, 220 90, 100 170 Z' fill='%23fb7185'/></svg>", anchor:'cheekR' },
    { key:'gold-star', name:'Gold Star', url:"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><polygon points='90,10 110,65 170,65 120,100 140,160 90,125 40,160 60,100 10,65 70,65' fill='%23facc15'/></svg>", anchor:'forehead' }
  ]}
];
// NB: Jika ada /effects/packs.json & /stickers/packs.json, kita pakai itu; kalau tidak ada, fallback ke default di atas.

async function fetchJSON(url, fallback){
  try{
    const r = await fetch(url, { cache:'no-store' });
    if (!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  }catch{ return fallback; }
}

async function buildPresetUI(){
  const packs = await fetchJSON('/effects/packs.json', DEFAULT_EFFECT_PACKS);
  presetListEl.innerHTML = '';
  packs.forEach(p=>{
    const b=document.createElement('button'); b.className='chip'; b.textContent=p.name;
    b.addEventListener('click', ()=> applyPreset(p));
    if (p.id==='natural') { b.classList.add('active'); ACTIVE_PRESET=p; } // default
    presetListEl.appendChild(b);
  });
  if (!ACTIVE_PRESET) ACTIVE_PRESET=packs[0];
  highlightPreset(ACTIVE_PRESET.id);
  applyPreset(ACTIVE_PRESET, {silent:true});
}
function highlightPreset(id){
  presetListEl.querySelectorAll('.chip').forEach((el,i)=>{
    const name = el.textContent;
    const isActive = DEFAULT_EFFECT_PACKS.find(p=>p.name===name)?.id===id;
    el.classList.toggle('active', isActive);
  });
}
function applyPreset(preset, opts={}){
  ACTIVE_PRESET = preset;
  const ap = preset.apply || {};
  setEffect(ap.effect || 'none');
  fxBlushEl.checked = !!ap.blush;
  fxLipTintEl.checked = !!ap.liptint;
  fxEyeBrightEl.checked = !!ap.eyebright;
  fxSoftPeachEl.checked = !!ap.peach;
  if (!opts.silent) highlightPreset(preset.id);
}

async function buildStickerUI(){
  const packs = await fetchJSON('/stickers/packs.json', DEFAULT_STICKER_PACKS);
  stickerPackListEl.innerHTML=''; stickerListEl.innerHTML=''; STICKER_RUNTIME=[];
  packs.forEach(p=>{
    const b=document.createElement('button'); b.className='chip'; b.textContent=p.name;
    b.addEventListener('click', ()=> selectStickerPack(p, packs));
    stickerPackListEl.appendChild(b);
  });
  // pilih default pack pertama
  if (packs.length){ selectStickerPack(packs[0], packs); }
}
function selectStickerPack(pack, all){
  ACTIVE_STICKER_PACK = pack;
  // highlight
  const idx = Array.from(stickerPackListEl.children).findIndex(ch => ch.textContent===pack.name);
  stickerPackListEl.querySelectorAll('.chip').forEach((c,i)=>c.classList.toggle('active', i===idx));
  // build sticker toggles
  stickerListEl.innerHTML='';
  STICKER_RUNTIME = [];
  (pack.stickers||[]).forEach(st=>{
    const label = document.createElement('label'); label.className='toggle';
    const input = document.createElement('input'); input.type='checkbox'; input.checked=!!st.on;
    input.addEventListener('change', ()=> st.on = input.checked);
    label.appendChild(input); label.append(' '+st.name);
    stickerListEl.appendChild(label);

    // preload image stickers
    if (pack.type==='images' && st.url){
      const img = new Image(); img.src = st.url; STICKER_RUNTIME.push({ key:st.key, img, anchor: st.anchor||'forehead', onRef: input });
    } else {
      STICKER_RUNTIME.push({ key:st.key, img:null, anchor:null, onRef: input }); // vector
    }
  });
}

// ---- Effects & Makeup ----
function setEffect(name){
  currentEffect = name;
  document.querySelectorAll('[data-effect]').forEach(b=>b.classList.toggle('active', b.dataset.effect===name));
}
const FACE_OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
function pathFromIndices(lm,ids){ const p0=P(lm[ids[0]]); ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); for(let i=1;i<ids.length;i++){ const p=P(lm[ids[i]]); ctx.lineTo(p[0],p[1]); } ctx.closePath(); }

function applyBeautify(lm){
  const level = Number(beautyLevelEl.value)/100;
  if (level<=0) return;
  const blurPx = Math.round(2 + level*6), bright = 1 + level*0.18;
  const t=document.createElement('canvas'); t.width=canvas.width; t.height=canvas.height;
  const tc=t.getContext('2d'); tc.drawImage(canvas,0,0);
  tc.filter = `blur(${blurPx}px) saturate(${1+level*0.12}) brightness(${bright})`; tc.drawImage(t,0,0);
  if (lm){ ctx.save(); pathFromIndices(lm,FACE_OVAL); ctx.clip(); ctx.drawImage(tc.canvas,0,0); ctx.restore(); }
  else { ctx.drawImage(tc.canvas,0,0); }
}
function applySoftGlow(){
  const t=document.createElement('canvas'); t.width=canvas.width; t.height=canvas.height;
  const tc=t.getContext('2d'); tc.drawImage(canvas,0,0);
  tc.filter='blur(8px) brightness(1.08)'; tc.drawImage(t,0,0);
  ctx.save(); ctx.globalCompositeOperation='screen'; ctx.globalAlpha=0.5; ctx.drawImage(tc.canvas,0,0); ctx.restore();
}
function applyPeachTone(){
  const t=document.createElement('canvas'); t.width=canvas.width; t.height=canvas.height;
  const tc=t.getContext('2d'); tc.drawImage(canvas,0,0);
  tc.filter='sepia(0.25) saturate(1.05) hue-rotate(-8deg)'; tc.drawImage(t,0,0); ctx.drawImage(t,0,0);
}
function applyBackgroundBlur(lm){
  const level=Number(bgBlurLevelEl.value)/100; const blurPx=Math.round(4+level*10);
  const t=document.createElement('canvas'); t.width=canvas.width; t.height=canvas.height;
  const tc=t.getContext('2d'); tc.drawImage(canvas,0,0);
  tc.filter=`blur(${blurPx}px) saturate(1.05)`; tc.drawImage(t,0,0);
  ctx.save(); ctx.drawImage(tc.canvas,0,0);
  if (lm){ ctx.globalCompositeOperation='destination-out'; pathFromIndices(lm,FACE_OVAL); ctx.fill(); ctx.globalCompositeOperation='destination-over'; ctx.drawImage(videoEl,0,0,canvas.width,canvas.height); }
  ctx.restore();
}
function applyGlobalFilter(name){
  const t=document.createElement('canvas'); t.width=canvas.width; t.height=canvas.height;
  const tc=t.getContext('2d'); tc.drawImage(canvas,0,0);
  if (name==='bw') tc.filter='grayscale(100%) contrast(1.1)';
  if (name==='sepia') tc.filter='sepia(100%) saturate(1.2)';
  if (name==='vivid') tc.filter='contrast(1.2) saturate(1.4)';
  tc.drawImage(t,0,0); ctx.drawImage(t,0,0);
}
function drawVignette(){ const w=canvas.width,h=canvas.height; const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.3,w/2,h/2,Math.max(w,h)*0.7); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.35)'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h); }

// Makeup
function drawBlush(lm){ const L=AVG(P(lm[50]),P(lm[101])), R=AVG(P(lm[280]),P(lm[330])); const eyeW=DIST(P(lm[33]),P(lm[263])); const r=eyeW*0.18;
  ctx.save(); ctx.globalAlpha=0.16; ctx.fillStyle='#f472b6';
  ctx.beginPath(); ctx.ellipse(L[0],L[1],r,r*0.7,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(R[0],R[1],r,r*0.7,0,0,Math.PI*2); ctx.fill(); ctx.restore();
}
function drawLipTint(lm){ const c=AVG(P(lm[13]),P(lm[14])); const eyeW=DIST(P(lm[33]),P(lm[263])); const w=eyeW*0.9,h=w*0.35;
  ctx.save(); ctx.globalAlpha=0.18; ctx.fillStyle='#e8517a';
  ctx.beginPath(); ctx.ellipse(c[0],c[1]+h*0.05,w*0.55,h*0.6,0,0,Math.PI*2); ctx.fill(); ctx.restore();
}
function drawEyeBright(lm){ const L=AVG(P(lm[159]),P(lm[145])), R=AVG(P(lm[386]),P(lm[374])); const eyeW=DIST(P(lm[33]),P(lm[263])); const r=eyeW*0.14;
  ctx.save(); ctx.globalAlpha=0.22; ctx.fillStyle='rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.ellipse(L[0],L[1],r,r*0.7,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(R[0],R[1],r,r*0.7,0,0,Math.PI*2); ctx.fill(); ctx.restore();
}

// Vector Stickers
function rr(x,y,w,h,r){const R=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+R,y);ctx.arcTo(x+w,y,x+w,y+h,R);ctx.arcTo(x+w,y+h,x,y+h,R);ctx.arcTo(x,y+h,x,y,R);ctx.arcTo(x,y,x+w,y,R);ctx.closePath();}
function drawSunglasses(lm){ const L=P(lm[33]), R=P(lm[263]), mid=AVG(L,R), eyeW=DIST(L,R);
  const w=eyeW*1.6,h=eyeW*0.46,x=mid[0]-w/2,y=mid[1]-h/2,bridge=w*0.12,lens=(w-bridge)/2;
  ctx.save(); ctx.globalAlpha=0.9; ctx.fillStyle='rgba(0,0,0,0.78)';
  rr(x,y,lens,h,h*0.4); ctx.fill(); rr(x+lens+bridge,y,lens,h,h*0.4); ctx.fill(); ctx.fillRect(x+lens,y+h*0.35,bridge,h*0.3);
  ctx.globalAlpha=0.25; ctx.fillStyle='#fff'; rr(x+6,y+4,lens-12,h*0.35,h*0.4); ctx.fill(); rr(x+lens+bridge+6,y+4,lens-12,h*0.35,h*0.4); ctx.fill(); ctx.restore();
}
function drawMustache(lm){ const m=AVG(P(lm[13]),P(lm[14])), eyeW=DIST(P(lm[33]),P(lm[263])); const w=eyeW*0.95,h=w*0.25,x=m[0]-w/2,y=m[1]+h*0.1;
  ctx.save(); ctx.fillStyle='rgba(30,20,10,0.95)'; ctx.beginPath();
  ctx.moveTo(m[0],y);
  ctx.bezierCurveTo(m[0]-w*0.15,y-h*1.2,x+w*0.05,y-h*0.3,x+w*0.2,y);
  ctx.bezierCurveTo(x+w*0.4,y+h*0.6,m[0]-w*0.05,y+h*0.4,m[0],y);
  ctx.moveTo(m[0],y);
  ctx.bezierCurveTo(m[0]+w*0.15,y-h*1.2,x+w*0.95,y-h*0.3,x+w*0.8,y);
  ctx.bezierCurveTo(x+w*0.6,y+h*0.6,m[0]+w*0.05,y+h*0.4,m[0],y); ctx.fill(); ctx.restore();
}
function drawCatEars(lm){ const mid=AVG(P(lm[33]),P(lm[263])); const eyeW=DIST(P(lm[33]),P(lm[263]));
  const baseY=mid[1]-eyeW*0.9, earH=eyeW*0.6, leftX=mid[0]-eyeW*0.5, rightX=mid[0]+eyeW*0.5;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(leftX,baseY); ctx.lineTo(leftX-eyeW*0.18,baseY-earH); ctx.lineTo(leftX+eyeW*0.18,baseY-earH*0.9); ctx.closePath(); ctx.fillStyle='#111827'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(leftX,baseY-earH*0.18); ctx.lineTo(leftX-eyeW*0.12,baseY-earH*0.78); ctx.lineTo(leftX+eyeW*0.1,baseY-earH*0.7); ctx.closePath(); ctx.fillStyle='#f472b6'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(rightX,baseY); ctx.lineTo(rightX+eyeW*0.18,baseY-earH); ctx.lineTo(rightX-eyeW*0.18,baseY-earH*0.9); ctx.closePath(); ctx.fillStyle='#111827'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(rightX,baseY-earH*0.18); ctx.lineTo(rightX+eyeW*0.12,baseY-earH*0.78); ctx.lineTo(rightX-eyeW*0.1,baseY-earH*0.7); ctx.closePath(); ctx.fillStyle='#f472b6'; ctx.fill(); ctx.restore();
}
function drawBunnyEars(lm){ const mid=AVG(P(lm[33]),P(lm[263])); const eyeW=DIST(P(lm[33]),P(lm[263]));
  const baseY=mid[1]-eyeW*1.0, earH=eyeW*1.2, gap=eyeW*0.25;
  ctx.save(); ctx.fillStyle='#f8fafc';
  ctx.beginPath(); ctx.moveTo(mid[0]-gap,baseY);
  ctx.bezierCurveTo(mid[0]-gap-eyeW*0.25,baseY-earH*0.3, mid[0]-gap-eyeW*0.1,baseY-earH, mid[0]-gap*1.1,baseY-earH);
  ctx.bezierCurveTo(mid[0]-gap*0.9,baseY-earH, mid[0]-gap*0.7,baseY-earH*0.3, mid[0]-gap,baseY); ctx.fill();
  ctx.beginPath(); ctx.moveTo(mid[0]+gap,baseY);
  ctx.bezierCurveTo(mid[0]+gap+eyeW*0.25,baseY-earH*0.3, mid[0]+gap+eyeW*0.1,baseY-earH, mid[0]+gap*1.1,baseY-earH);
  ctx.bezierCurveTo(mid[0]+gap*0.9,baseY-earH, mid[0]+gap*0.7,baseY-earH*0.3, mid[0]+gap,baseY); ctx.fill();
  ctx.fillStyle='#f472b6';
  ctx.beginPath(); ctx.ellipse(mid[0]-gap*1.02,baseY-earH*0.6, eyeW*0.12, earH*0.28, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(mid[0]+gap*1.02,baseY-earH*0.6, eyeW*0.12, earH*0.28, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
}
function drawCrown(lm){ const mid=AVG(P(lm[33]),P(lm[263])); const eyeW=DIST(P(lm[33]),P(lm[263])); const y=mid[1]-eyeW*0.95, w=eyeW*1.4, h=eyeW*0.55, x=mid[0]-w/2;
  ctx.save(); ctx.fillStyle='#c3a463'; ctx.beginPath();
  ctx.moveTo(x,y+h); for (let i=0;i<5;i++){ const px=x+(w/4)*i; const py=(i%2===0)?y:y+h*0.2; ctx.lineTo(px,py); }
  ctx.lineTo(x+w,y+h); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#fcd34d'; for (let i=0;i<3;i++){ ctx.beginPath(); const cx=x+w*(0.2+0.3*i); ctx.arc(cx,y+(i===1?0:h*0.1), eyeW*0.06, 0, Math.PI*2); ctx.fill(); } ctx.restore();
}
function sparkle(x,y,r){ ctx.save(); ctx.translate(x,y); ctx.fillStyle='rgba(255,255,255,0.9)';
  for (let i=0;i<2;i++){ ctx.beginPath(); ctx.moveTo(0,-r); ctx.lineTo(r*0.2,-r*0.2); ctx.lineTo(r,0); ctx.lineTo(r*0.2,r*0.2); ctx.lineTo(0,r); ctx.lineTo(-r*0.2,r*0.2); ctx.lineTo(-r,0); ctx.lineTo(-r*0.2,-r*0.2); ctx.closePath(); ctx.globalAlpha=0.9-(i*0.3); ctx.fill(); r*=0.6; } ctx.restore(); }
function drawSparkles(lm){ const mid=AVG(P(lm[33]),P(lm[263])); const eyeW=DIST(P(lm[33]),P(lm[263])); sparkle(mid[0]-eyeW*0.9, mid[1]-eyeW*0.2, eyeW*0.22); sparkle(mid[0]+eyeW*0.9, mid[1]-eyeW*0.1, eyeW*0.18); sparkle(mid[0], mid[1]-eyeW*0.9, eyeW*0.2); }
function drawFlowers(lm){ const mid=AVG(P(lm[33]),P(lm[263])); const eyeW=DIST(P(lm[33]),P(lm[263]));
  const flower=(x,y,r)=>{ ctx.save(); ctx.translate(x,y); for (let i=0;i<6;i++){ ctx.rotate(Math.PI/3); ctx.beginPath(); ctx.ellipse(0,-r*0.7,r*0.35,r*0.6,0,0,Math.PI*2); ctx.fillStyle='#f9a8d4'; ctx.fill(); } ctx.beginPath(); ctx.arc(0,0,r*0.28,0,Math.PI*2); ctx.fillStyle='#fde68a'; ctx.fill(); ctx.restore(); };
  flower(mid[0]-eyeW*0.7, mid[1]-eyeW*0.6, eyeW*0.18); flower(mid[0]+eyeW*0.7, mid[1]-eyeW*0.55, eyeW*0.18);
}
function drawHeartCheeks(lm){ const L=AVG(P(lm[50]),P(lm[101])), R=AVG(P(lm[280]),P(lm[330])); const eyeW=DIST(P(lm[33]),P(lm[263])), s=eyeW*0.12;
  const heart=(x,y,s,color)=>{ ctx.save(); ctx.translate(x,y); ctx.rotate(-0.1); ctx.beginPath(); ctx.moveTo(0,-s*0.25); ctx.bezierCurveTo(-s,-s,-s,s*0.4,0,s); ctx.bezierCurveTo(s,s*0.4,s,-s,0,-s*0.25); ctx.fillStyle=color; ctx.globalAlpha=0.9; ctx.fill(); ctx.restore(); };
  heart(L[0],L[1],s,'#fb7185'); heart(R[0],R[1],s,'#fb7185');
}

// Image stickers renderer
function drawImageStickers(lm){
  if (!lm) return;
  const eyeW=DIST(P(lm[33]),P(lm[263]));
  const anchors = {
    forehead: P(lm[10]),
    cheekL: AVG(P(lm[50]), P(lm[101])),
    cheekR: AVG(P(lm[280]), P(lm[330]))
  };
  STICKER_RUNTIME.forEach(s=>{
    if (!s.onRef?.checked) return;
    if (!s.img) return;
    const scale = Number(stickerScaleEl.value)/100;
    const w = eyeW*1.6*scale;
    const h = (s.img.height/s.img.width) * w;
    const anc = anchors[s.anchor || 'forehead'] || anchors.forehead;
    const x = anc[0]-w/2, y = anc[1]-h*1.4;
    ctx.save(); ctx.globalAlpha=0.95; ctx.drawImage(s.img, x, y, w, h); ctx.restore();
  });
}

// Grid & Watermark
function drawGrid(){ const w=canvas.width,h=canvas.height; ctx.save(); ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1; for(let i=1;i<=2;i++){ const x=(w/3)*i,y=(h/3)*i; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); } ctx.restore(); }
function drawWatermark(text){ const pad=16; ctx.save(); ctx.globalAlpha=0.75; ctx.font=`${Math.round(canvas.width*0.025)}px system-ui,Segoe UI,Roboto`; ctx.textBaseline='bottom'; const w=ctx.measureText(text).width+20; const h=Math.round(canvas.width*0.04); const x=canvas.width-w-pad; const y=canvas.height-pad; ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(x,y-h,w,h); ctx.fillStyle='#e2e8f0'; ctx.fillText(text,x+10,y-6); ctx.restore(); }

// ---- Render loop ----
function renderLoop(){
  if (videoEl.videoWidth){
    const w=canvas.width,h=canvas.height;
    ctx.save();
    if (mirror && useFrontCamera){ ctx.translate(w,0); ctx.scale(-1,1); }
    ctx.drawImage(videoEl, 0, 0, w, h);

    const lm = (lastResults && lastResults.multiFaceLandmarks && lastResults.multiFaceLandmarks[0]) || null;

    // apply preset effects
    if (currentEffect==='beauty') applyBeautify(lm);
    if (currentEffect==='softglow') applySoftGlow();
    if (currentEffect==='bgblur') applyBackgroundBlur(lm);
    if (['bw','sepia','vivid','vignette'].includes(currentEffect)) applyGlobalFilter(currentEffect);
    if (currentEffect==='vignette') drawVignette();

    // makeup
    if (lm){
      if (fxBlushEl.checked) drawBlush(lm);
      if (fxLipTintEl.checked) drawLipTint(lm);
      if (fxEyeBrightEl.checked) drawEyeBright(lm);
      if (fxSoftPeachEl.checked) applyPeachTone();
    } else if (fxSoftPeachEl.checked){ applyPeachTone(); }

    // vector sticker pack toggles (by key)
    if (lm){
      STICKER_RUNTIME.forEach(s=>{
        if (!s.onRef?.checked) return;
        if (s.img) return; // handled in image renderer
        if (s.key==='glasses') drawSunglasses(lm);
        if (s.key==='bunny') drawBunnyEars(lm);
        if (s.key==='crown') drawCrown(lm);
        if (s.key==='flowers') drawFlowers(lm);
        if (s.key==='sparkles') drawSparkles(lm);
        if (s.key==='heartcheek') drawHeartCheeks(lm);
        if (s.key==='catears') drawCatEars(lm);
        if (s.key==='mustache') drawMustache(lm);
      });
      // image stickers (if any)
      drawImageStickers(lm);
    }

    if (gridEl?.checked) drawGrid();
    if (wmToggle?.checked) drawWatermark(wmText?.value || 'FABARO BEAUTY CAM PRO');

    ctx.restore();
  }
  requestAnimationFrame(renderLoop);
}

// ---- Capture buttons ----
async function doCountdown(){
  countdownEl?.classList.remove('hidden');
  for (let i=3;i>=1;i--){ countdownEl.textContent=String(i); await new Promise(r=>setTimeout(r,700)); }
  countdownEl?.classList.add('hidden');
}
captureBtn?.addEventListener('click', async ()=>{
  if (countdownToggle?.checked) await doCountdown();
  const mime = (formatEl?.value==='jpg') ? 'image/jpeg' : 'image/png';
  const data = canvas.toDataURL(mime, 0.92);
  downloadLink.href = data; downloadLink.download = `selfie.${mime==='image/jpeg'?'jpg':'png'}`; downloadLink.click();
});

// PRO SHOT (full-res via ImageCapture / fallback system camera)
async function takeProShotFullRes(){
  if ('ImageCapture' in window && currentStream){
    try{
      const track = currentStream.getVideoTracks()[0];
      const ic = new ImageCapture(track);
      // ambil resolusi maksimum yang tersedia
      let caps = track.getCapabilities?.() || {};
      const targetW = caps.width?.max || track.getSettings?.().width || canvas.width;
      const targetH = caps.height?.max || track.getSettings?.().height || canvas.height;
      const blob = await ic.takePhoto({ imageWidth: targetW, imageHeight: targetH }).catch(()=> ic.takePhoto());
      const bmp = await createImageBitmap(blob);
      // jalankan efek di foto full-res
      await faceMesh?.send({ image: bmp }); // update landmarks
      const oldW=canvas.width, oldH=canvas.height;
      canvas.width=bmp.width; canvas.height=bmp.height;
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(bmp,0,0,canvas.width,canvas.height);

      const lm = (lastResults && lastResults.multiFaceLandmarks && lastResults.multiFaceLandmarks[0]) || null;
      // apply same effects on still
      if (currentEffect==='beauty') applyBeautify(lm);
      if (currentEffect==='softglow') applySoftGlow();
      if (currentEffect==='bgblur') applyBackgroundBlur(lm);
      if (['bw','sepia','vivid','vignette'].includes(currentEffect)) applyGlobalFilter(currentEffect);
      if (currentEffect==='vignette') drawVignette();
      if (lm){ if (fxBlushEl.checked) drawBlush(lm); if (fxLipTintEl.checked) drawLipTint(lm); if (fxEyeBrightEl.checked) drawEyeBright(lm); }
      if (fxSoftPeachEl.checked) applyPeachTone();
      if (lm){
        STICKER_RUNTIME.forEach(s=>{ if (!s.onRef?.checked || s.img) return; if (s.key==='glasses') drawSunglasses(lm); if (s.key==='bunny') drawBunnyEars(lm); if (s.key==='crown') drawCrown(lm); if (s.key==='flowers') drawFlowers(lm); if (s.key==='sparkles') drawSparkles(lm); if (s.key==='heartcheek') drawHeartCheeks(lm); if (s.key==='catears') drawCatEars(lm); if (s.key==='mustache') drawMustache(lm); });
        drawImageStickers(lm);
      }
      if (wmToggle?.checked) drawWatermark(wmText?.value || 'FABARO BEAUTY CAM PRO');

      const mime = (formatEl?.value==='jpg') ? 'image/jpeg' : 'image/png';
      const data = canvas.toDataURL(mime, 0.95);
      downloadLink.href = data; downloadLink.download = `selfie_pro.${mime==='image/jpeg'?'jpg':'png'}`; downloadLink.click();

      // restore preview size
      canvas.width=oldW; canvas.height=oldH;
      return;
    }catch(e){ console.warn('ImageCapture gagal, fallback system camera.', e); }
  }
  // fallback: buka kamera sistem
  systemCaptureInput?.click();
}
proShotBtn?.addEventListener('click', takeProShotFullRes);

// system camera result
systemCaptureInput?.addEventListener('change', async (e)=>{
  const f=e.target.files?.[0]; if(!f) return;
  const bmp = await createImageBitmap(f);
  await faceMesh?.send({ image: bmp });
  const oldW=canvas.width, oldH=canvas.height;
  canvas.width=bmp.width; canvas.height=bmp.height;
  ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bmp,0,0,canvas.width,canvas.height);
  const lm = (lastResults && lastResults.multiFaceLandmarks && lastResults.multiFaceLandmarks[0]) || null;
  if (currentEffect==='beauty') applyBeautify(lm);
  if (currentEffect==='softglow') applySoftGlow();
  if (currentEffect==='bgblur') applyBackgroundBlur(lm);
  if (['bw','sepia','vivid','vignette'].includes(currentEffect)) applyGlobalFilter(currentEffect);
  if (currentEffect==='vignette') drawVignette();
  if (lm){ if (fxBlushEl.checked) drawBlush(lm); if (fxLipTintEl.checked) drawLipTint(lm); if (fxEyeBrightEl.checked) drawEyeBright(lm); }
  if (fxSoftPeachEl.checked) applyPeachTone();
  if (lm){ STICKER_RUNTIME.forEach(s=>{ if (!s.onRef?.checked || s.img) return; if (s.key==='glasses') drawSunglasses(lm); if (s.key==='bunny') drawBunnyEars(lm); if (s.key==='crown') drawCrown(lm); if (s.key==='flowers') drawFlowers(lm); if (s.key==='sparkles') drawSparkles(lm); if (s.key==='heartcheek') drawHeartCheeks(lm); if (s.key==='catears') drawCatEars(lm); if (s.key==='mustache') drawMustache(lm); }); drawImageStickers(lm); }
  if (wmToggle?.checked) drawWatermark(wmText?.value || 'FABARO BEAUTY CAM PRO');
  const mime = (formatEl?.value==='jpg') ? 'image/jpeg' : 'image/png';
  const data = canvas.toDataURL(mime, 0.95);
  downloadLink.href = data; downloadLink.download = `selfie_pro.${mime==='image/jpeg'?'jpg':'png'}`; downloadLink.click();
  canvas.width=oldW; canvas.height=oldH;
});

// Mirror / Flip / settings
mirrorBtn?.addEventListener('click', ()=>{ mirror=!mirror; mirrorBtn.textContent=`Cermin: ${mirror?'ON':'OFF'}`; });
flipBtn?.addEventListener('click', async ()=>{ useFrontCamera=!useFrontCamera; await startCamera(true); });
resolutionEl?.addEventListener('change', ()=> startCamera(true));
customStickerFile?.addEventListener('change', (e)=>{ const f=e.target.files?.[0]; if(!f) return; const img=new Image(); img.onload=()=>{ customSticker=img; }; img.src=URL.createObjectURL(f); });

// PWA & SW
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); pendingInstallEvent=e; installBtn && (installBtn.disabled=false); });
installBtn?.addEventListener('click', async ()=>{ if(!pendingInstallEvent) return; pendingInstallEvent.prompt(); await pendingInstallEvent.userChoice; pendingInstallEvent=null; });
if ('serviceWorker' in navigator) window.addEventListener('load', ()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
navigator.serviceWorker?.ready?.then(reg=>{ try{ reg.update(); }catch{} });

// Init
(async function(){
  countdownEl?.classList.add('hidden');
  await buildPresetUI();
  await buildStickerUI();
  const perm = await checkPermission();
  if (perm==='granted') await startCamera(true); else log('Klik “Izinkan Kamera”.');
  await initFaceMesh();
  startCamBtn?.addEventListener('click', ()=> startCamera(true));
})();
