/* Fabaro Beauty Cam Pro — shutter dekat kamera + kualitas native */
const videoEl = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const countdownEl = document.getElementById('countdown');
const debugEl = document.getElementById('debug');

const startCamBtn = document.getElementById('startCam');
const refreshBtn = document.getElementById('refreshNow');
const installBtn  = document.getElementById('install');
const downloadLink= document.getElementById('download');

const effectButtons = Array.from(document.querySelectorAll('[data-effect]'));
const beautyLevelEl = document.getElementById('beautyLevel') || {value:40};
const bgBlurLevelEl = document.getElementById('bgBlurLevel') || {value:45};

const flipBtn = document.getElementById('flip');
const mirrorBtn = document.getElementById('mirror');
const gridEl = document.getElementById('grid') || {checked:false};
const countdownToggle = document.getElementById('countdownToggle') || {checked:true};
const resolutionEl = document.getElementById('resolution') || {value:'device'};
const formatEl = document.getElementById('format') || {value:'png'};
const captureBtn = document.getElementById('capture');
const wmToggle = document.getElementById('wmToggle') || {checked:true};
const wmText = document.getElementById('wmText') || {value:'FABARO BEAUTY CAM PRO'};

// state
let currentEffect = 'none';
let mirror = true;
let useFrontCamera = true;
let currentStream = null;
let faceMesh = null;
let lastResults = null;
let pendingInstallEvent = null;
let customSticker = null; // (kalau kamu pakai fitur stiker custom)

// helpers
const log = (m)=>{ if (debugEl) debugEl.textContent = String(m); };
async function checkPermission(){
  try{ if (navigator.permissions?.query){ return (await navigator.permissions.query({name:'camera'})).state; } }catch(_){}
  return 'unknown';
}
function setStageAspectFromVideo(){
  const vw = videoEl.videoWidth || 4, vh = videoEl.videoHeight || 3;
  stage.style.aspectRatio = `${vw} / ${vh}`; // hindari distorsi = anti pusing
}
function setCanvasToVideo(){
  const vw = videoEl.videoWidth || 1280, vh = videoEl.videoHeight || 720;
  canvas.width = vw; canvas.height = vh;
}

// force refresh (mobile)
async function mobileHardRefresh() {
  try {
    if (window.caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if (navigator.serviceWorker?.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } finally {
    const u = new URL(location.href);
    u.searchParams.set('v', Date.now().toString());
    location.replace(u.toString());
  }
}
if (refreshBtn) refreshBtn.addEventListener('click', mobileHardRefresh);

// UI
function setEffect(name){
  currentEffect = name;
  effectButtons.forEach(b => b.classList.toggle('active', b.dataset.effect === name));
}
effectButtons.forEach(b => b.addEventListener('click', ()=>setEffect(b.dataset.effect)));

if (mirrorBtn) mirrorBtn.addEventListener('click', ()=>{ mirror=!mirror; mirrorBtn.textContent=`Cermin: ${mirror?'ON':'OFF'}`; });
if (flipBtn) flipBtn.addEventListener('click', async ()=>{ useFrontCamera=!useFrontCamera; await startCamera(true); });

if (captureBtn) captureBtn.addEventListener('click', async ()=>{
  if (countdownToggle.checked) { await doCountdown(); }
  const mime = formatEl.value==='jpg' ? 'image/jpeg' : 'image/png';
  const data = canvas.toDataURL(mime, 0.92);
  downloadLink.href = data;
  downloadLink.download = `selfie.${formatEl.value}`;
  downloadLink.click();
});

// tap-to-focus (best effort)
stage.addEventListener('click', async (e)=>{
  const track = currentStream?.getVideoTracks?.()[0];
  if (!track?.getCapabilities) return;
  const caps = track.getCapabilities();
  try {
    // 1) single-shot focus
    if (caps.focusMode && caps.focusMode.includes('single-shot')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
      log('Fokus: single-shot'); return;
    }
    // 2) pointsOfInterest (beberapa device)
    if (caps.pointsOfInterest) {
      const rect = stage.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      await track.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }] }] });
      log('Fokus: point set');
    }
  } catch(_){}
});

// camera
async function startCamera(force=false){
  countdownEl.classList.add('hidden'); // jangan nempel "3"
  const perm = await checkPermission();
  if (!force && perm!=='granted'){ log('Tap “Izinkan Kamera”.'); return; }

  // hentikan stream lama
  if (currentStream) currentStream.getTracks().forEach(t=>t.stop());

  const res = (resolutionEl.value||'device');
  const base = { video: { facingMode: useFrontCamera?'user':'environment' }, audio:false };

  // kalau bukan "device", set ideal ke pilihan user
  if (res !== 'device') {
    const [w,h] = res.split('x').map(n=>parseInt(n,10));
    base.video.width = { ideal: w };
    base.video.height = { ideal: h };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(base);
    currentStream = stream;
    videoEl.srcObject = stream;

    // coba tingkatkan kualitas sesuai kapabilitas device
    const track = stream.getVideoTracks()[0];
    if (track?.getCapabilities) {
      const caps = track.getCapabilities();
      const adv = [];

      // Device Max
      if (res === 'device' && caps.width && caps.height) {
        adv.push({ width: caps.width.max, height: caps.height.max });
      }

      // Stabilkan exposure/white-balance/focus kalau ada
      if (caps.exposureMode?.includes?.('continuous')) adv.push({ exposureMode: 'continuous' });
      if (caps.whiteBalanceMode?.includes?.('continuous')) adv.push({ whiteBalanceMode: 'continuous' });
      if (caps.focusMode?.includes?.('continuous')) adv.push({ focusMode: 'continuous' });

      // Target 30fps jika tersedia
      if (caps.frameRate) adv.push({ frameRate: Math.min(30, caps.frameRate.max || 30) });

      if (adv.length) {
        try { await track.applyConstraints({ advanced: adv }); } catch(_){}
      }
    }

    await videoEl.play();

    // setelah metadata tersedia → pakai rasio & ukuran asli
    if (videoEl.readyState >= 2) {
      setStageAspectFromVideo();
      setCanvasToVideo();
    } else {
      videoEl.addEventListener('loadedmetadata', ()=>{
        setStageAspectFromVideo();
        setCanvasToVideo();
      }, { once:true });
    }

    log('Kamera aktif.');
  } catch(e) {
    console.error(e);
    log('Gagal akses kamera: '+(e?.message||e));
    alert('Tidak bisa akses kamera. Buka di Chrome & izinkan kamera di Site settings.');
  }
}

// countdown
async function doCountdown(){
  countdownEl.classList.remove('hidden');
  for (let i=3;i>=1;i--) {
    countdownEl.textContent = String(i);
    await new Promise(r=>setTimeout(r, 700));
  }
  countdownEl.classList.add('hidden');
}

// mediapipe
async function initFaceMesh(){
  faceMesh = new FaceMesh({ locateFile: (f)=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
  faceMesh.setOptions({ selfieMode:true, maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:0.6, minTrackingConfidence:0.6 });
  faceMesh.onResults(res => { lastResults = res; });

  const loop = async ()=>{
    try{ if (videoEl.readyState>=2) await faceMesh.send({ image: videoEl }); }catch(_){}
    renderFrame(); requestAnimationFrame(loop);
  };
  loop();
}

// simple effects (pakai versi kamu sebelumnya kalau lengkap)
function applyBeautify(){ /* …(kode beautify kamu)… */ }
function applySoftGlow(){ /* … */ }
function applyBackgroundBlur(){ /* … */ }
function applyGlobalFilter(){ /* … */ }
function drawVignette(){ /* … */ }
function drawGrid(){ /* … */ }
function drawWatermark(){ /* … */ }

// render (ringkas — pakai punyamu jika sudah lengkap)
function renderFrame(){
  if (!videoEl.videoWidth) return;
  const w = canvas.width, h = canvas.height;

  ctx.save();
  // mirror untuk kamera depan biar natural
  if (mirror && useFrontCamera) { ctx.translate(w,0); ctx.scale(-1,1); }
  ctx.drawImage(videoEl, 0, 0, w, h);

  // … panggil efek/AR kamu di sini …

  if (gridEl.checked) drawGrid();
  if (wmToggle.checked) drawWatermark(wmText.value);
  ctx.restore();
}

// PWA & SW
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); pendingInstallEvent=e; installBtn && (installBtn.disabled=false); });
if (installBtn) installBtn.addEventListener('click', async ()=>{ if(!pendingInstallEvent) return; pendingInstallEvent.prompt(); await pendingInstallEvent.userChoice; pendingInstallEvent=null; });
if ('serviceWorker' in navigator) window.addEventListener('load', ()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

// Start cam with user gesture
if (startCamBtn) startCamBtn.addEventListener('click', ()=> startCamera(true));

// Init
(async function(){
  countdownEl.classList.add('hidden');
  if ((await checkPermission())==='granted') await startCamera(true); else log('Klik “Izinkan Kamera”.');
  await initFaceMesh();

  // ganti resolusi → restart stream & sesuaikan ukuran
  if (resolutionEl && resolutionEl.addEventListener) {
    resolutionEl.addEventListener('change', ()=> startCamera(true));
  }
})();
