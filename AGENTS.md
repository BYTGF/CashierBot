# ⛔ KASIR BOT — ATURAN SCOPE (WAJIB DIBACA SEBELUM MULAI BEKERJA)

Aturan ini menumpuk di atas aturan global (`~/.zcode/AGENTS.md`). Kalau bertabrakan, **yang di sini yang lebih ketat yang menang**. Aturan teknis (format ID, gaya Code node, higienitas JSON) ada di [CONVENTIONS.md](CONVENTIONS.md) — ikuti itu.

## Ruang lingkup yang diizinkan

Agent HANYA boleh bekerja pada:

1. **Folder proyek lokal** `C:\Users\user\Documents\codes\N8N\Kasir Bot` (file-file proyek ini saja).
2. **Docker Compose project `kasir-bot`** — service `kasir-bot-n8n`, `kasir-bot-postgres`, `kasir-bot-poller` + volume `kasir_*` yang didefinisikan di `docker-compose.yml` ini.

## Dilarang keras

- ❌ `docker system/container/image/volume/network/builder prune` dalam bentuk apa pun.
- ❌ `docker stop/rm/restart`, `docker volume rm` pada container/volume **bukan** milik compose project ini — termasuk container Spending Bot atau project lain milik user.
- ❌ `docker compose down` di luar folder ini; `down -v` / `--remove-orphans` hanya jika user mengetik perintahnya sendiri.
- ❌ Menyentuh project saudara `Spending Bot` (foldernya bukan wilayah kerja ini, walau pattern-nya jadi referensi).
- ❌ `rm -rf` apa pun yang tidak dibuat sendiri di sesi ini.
- ❌ Menulis secret (bot token, API key) ke file yang di-track git, ke README/PRD, atau ke log chat — tampilkan hanya nama variabel + placeholder-nya.

## Kebiasaan wajib

1. **`node .test_kasir.js` wajib hijau** sebelum menyatakan selesai — untuk perubahan apa pun yang menyentuh `workflow/*.json` atau Code node.
2. **Scrub sebelum commit**: `node sync-creds.js scrub` (cek `status` — tidak boleh ada nilai `sk-or-v1-…` / token asli).
3. **Inspeksi dulu** (`docker ps -a`, `ls`) sebelum perintah yang mengubah state; jelaskan efeknya satu kalimat, lalu jalankan.
4. Workflow di-edit lewat JSON di repo (atau n8n UI → export kembali ke `workflow/kasir-bot-v1.json`). Jangan ada dua versi aktif — path webhook-nya sama.
5. Error di luar scope proyek (disk penuh, port dipakai project lain, memory) → **laporkan dan tanya**, jangan "sekalian beresin".

## Dokumentasi wajib (perubahan = update docs)

Setiap sesi yang mengubah kode/konfigurasi/docs wajib diakhiri:

1. **Entri baru di `CHANGELOG.md`** (paling atas): tanggal, apa yang berubah, file mana, kenapa, pelajaran/error penting. Refresh "Status sekarang" & "Pending" bila tergeser.
2. **Update docs terkait** bila perilaku berubah: `PRD.md` (keputusan/scope), `README.md` (setup/pemakaian), `OVERVIEW.md` (arsitektur/alur), `CONVENTIONS.md` (aturan teknis). Perubahan kecil cukup CHANGELOG.

## Definisi "selesai"

Stack dianggap selesai saat: container hidup, workflow ter-import & active, `/setup` lulus, dan satu siklus `/jual` cashless (foto bukti terbaca) tersimpan di Sheets dengan stok berkurang. Di luar itu = butuh go eksplisit dari user.
