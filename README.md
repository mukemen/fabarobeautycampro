# Fabaro Beauty Cam Pro — MUKEMEN.AI

Static web app kamera filter (client‑side) siap **GitHub → Vercel**.
Fitur: Beautify, Blur Background, B/W, Sepia, Vivid, Vignette, Grid, Countdown, Watermark, Stiker Custom, PWA.

## Deploy (GitHub → Vercel)
1. Buat repo GitHub (Private disarankan) dan upload semua file di root.
2. Vercel → Add New → Project → Import Git Repository → pilih repo ini.
3. Framework: **Other (Static)**, Build Command: (kosong), Output Directory: (kosong).
4. Deploy → URL https (kamera jalan).

## GitHub Pages (opsional)
- Workflow `.github/workflows/pages.yml` sudah ada. Aktifkan Pages di Settings → Pages → "GitHub Actions".

## Jalankan lokal
- VS Code → Live Server. Hindari membuka lewat `file://` agar izin kamera tidak ditolak.

## Keamanan
- `vercel.json` berisi header keamanan + CSP kompatibel CDN jsdelivr.
- Jangan menambah `Permissions-Policy` yang memblokir akses `camera`.

Lisensi: MIT
