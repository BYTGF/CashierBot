# CHANGELOG — Kasir Bot

> Entri terbaru di paling atas. Format: tanggal, ringkasan, file, kenapa, pelajaran.

## Status sekarang

**v1 selesai dibangun (lokal), belum di-deploy.** Workflow `kasir-bot-v1.json` (103 node) lengkap — termasuk picker katalog dengan pesan live untuk `/jual`: setup wizard, katalog & stok, /jual (draft + AI parse + metode + foto bukti vision + konfirmasi), /beli, /saldo, /laporan, /batal (void), /produk, /user multi-role, laporan on-demand. Test harness hijau (167 assertion). Belum ada: bot token & spreadsheet asli, import ke n8n, deploy VPS.

## Pending (urutan deploy)

1. User: buat bot @BotFather, spreadsheet baru + `setupTabs`, folder Drive "Bukti Kasir" (share anyone-viewer), isi `.env`.
2. `docker compose up -d` → import workflow → re-link Google Sheets + Drive credentials → isi Config (spreadsheet_id, drive_folder_id, owner_ids) → `node sync-creds.js inject` (bot_token & openrouter key) → activate.
3. Chat `/setup` → coba `/jual` end-to-end.

---

## 2026-10-12 — Fix time-bomb harness + publish repo ke GitHub (BYTGF/CashierBot)

- **Yang berubah:** `.test_kasir.js` — fixture draft `pj()`/`pjr()` memakai timestamp tetap `2026-10-06 10:00:00 WIB`. Router punya TTL draft 2 jam, jadi begitu waktu nyata berjalan >2 jam sejak fixture ditulis, 11 assertion routing-saat-draft gagal walau workflow benar (terjadi pada run 12 Okt). Diganti helper `wibNow()` (waktu sekarang, format WIB sama). Hasil: **167 pass, 0 fail**.
- **File:** `.test_kasir.js`. Repo di-push perdana ke `github.com/BYTGF/CashierBot` (sebelumnya repo kosong, lokal 0 commit).
- **Kenapa:** harness harus deterministik kapan pun dijalankan; TTL adalah perilaku workflow yang benar (draft >2 jam hangus) — yang salah fixture-nya.
- **Pelajaran:** jangan pakai timestamp tetap di fixture yang mengalir lewat logika TTL/umur; generate saat run atau beku waktu (`Date.now` di-mock).

## 2026-10-06 — Picker katalog + pesan live (revisi UX /jual)

- **Yang berubah:** `/jual` kosong sekarang membuka **picker**: katalog jadi tombol inline (6/halaman + navigasi), tap item → layar jumlah (tombol 1/2/3/5, ✍️ ketik, ◀️ kembali) → item masuk draft, lalu kembali ke daftar. Semuanya dirender sebagai **satu pesan live** yang di-edit via editMessageText (msg_id disimpan di draft). `✅ Selesai & Bayar` lanjut ke alur metode/bukti yang lama. Jalur teks tetap ada (hybrid): `/jual 2 kopi...` atau ketik apa pun saat picker terbuka → AI parse, hasilnya di-merge dan stage tetap `jual_pick`. Jasa: layar jumlah tanpa info stok, commit tidak menyentuh stok.
- **File:** workflow/kasir-bot-v1.json (96 → 103 node: +Load Katalog Jual, Jual Picker?, Build Picker Screen, Picker Live?, Edit Pesan, Kirim Picker, Simpan MsgId), .test_kasir.js (137 → 167 assertion, skenario S4b), README/OVERVIEW/CONVENTIONS/PRD.
- **Kenapa:** permintaan user — input jualan via tombol, bukan ketik; jumlah dalam satu flow yang sama.
- **Pelajaran:** patch string `const prods = $input...` kena dua node (Build Order Prompt & Stok Reply punya pola identik) — harus pakai anchor konteks, bukan baris tunggal; regex baru di String.raw rawan kehilangan backslash saat dipatch via script — selalu cek jsCode hasil generate dengan harness.

## 2026-10-06 — v1 dibangun dari nol

- **Yang dibuat:** seluruh repo. Infra: `docker-compose.yml` (n8n:5679 + postgres + tg-poller, volume `kasir_*`), `telegram-poller.py` (adaptasi Spending Bot, path `kasir-bot-in`), `sync-creds.js` (inject/scrub `bot_token` + `openrouter_api_key`). Data: `sheet/setupTabs.gs` (7 tab). Workflow: `workflow/kasir-bot-v1.json` — 96 node, 40 Code node. Test: `.test_kasir.js` (137 assertion, struktur + 11 skenario). Docs: README, OVERVIEW, CONVENTIONS, PRD, AGENTS.
- **Kenapa begini:** pattern disalin dari `Spending Bot/workflow/spending-bot-v4.json` (bentuk node webhook/set/code/sheets/switch/http/if + dedup staticData + prompt anti-halusinasi). Perbedaan sadar: (1) kirim pesan via HTTP Telegram API bukan node Telegram — keyboard dinamis (daftar void N baris) & tanpa Telegram credential; (2) + Google Drive upload bukti; (3) + tab Products/StockLog/Users/Meta; (4) void = mirror baris negatif + restore stok.
- **Pelajaran/error saat membangun:**
  - n8n staticData API namanya `$getWorkflowStaticData` (ber-prefix `$`) — mock harness awal tanpa `$` bikin ReferenceError.
  - Regex capture metode bayar ke-index `[2]` padahal cuma ada 1 grup → `[1]` (ketahuan harness).
  - Parser baris katalog `Cukur Rambut 20000` salah kira (harga dikira stok) → strategi dua-opsi (coba stok+harga, gagal → harga saja) di parseLine & /produk add.
  - `</b>` di dalam regex literal menutup regex prematur → jangan sertakan tag HTML di pola regex.
  - Switch v3 fallback = `options.fallbackOutput: 'extra'`; read node Sheets yang mungkin kosong wajib `alwaysOutputData: true` supaya branch tetap jalan.
