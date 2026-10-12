# Kasir Bot 🧾

Bot Telegram kasir untuk usaha kecil: catat penjualan & pengeluaran lewat chat, foto bukti bayar dibaca AI, data tersimpan rapi di Google Sheets. Dibangun dengan pola yang sama seperti [Spending Bot](../Spending%20Bot): **n8n + Docker + Telegram long-polling + Google Sheets/Drive + OpenRouter**.

> Gambaran lengkap: [OVERVIEW.md](OVERVIEW.md) · Keputusan desain: [PRD.md](PRD.md) · Aturan teknis: [CONVENTIONS.md](CONVENTIONS.md)

## Fitur

| Command | Siapa | Fungsi |
|---|---|---|
| `/jual` | semua | catat penjualan lewat **picker**: bot menampilkan katalog sebagai tombol → tap item → tap jumlah → selesai (satu pesan yang terus ter-update). Bisa juga `/jual 2 kopi susu, 1 roti` — dicocokkan AI ke katalog. Konfirmasi dulu sebelum disimpan. |
| `/beli` | semua | catat pengeluaran (keterangan → nominal → metode → kategori → opsional foto nota) |
| `/saldo` | semua | kas di laci (cash) vs digital, hari ini & total |
| `/laporan` | semua | rekap hari ini / kemarin / 7 hari / bulan ini (+ item terlaris, stok menipis) |
| `/stok` | semua | katalog + sisa stok barang (jasa tanpa stok) |
| `/batal` | semua* | batalkan transaksi terakhir (mirror baris `void`, data asli utuh); *kasir hanya miliknya sendiri |
| `/setup` | owner | wizard sekali jalan: nama usaha → jenis → daftar produk/jasa + harga |
| `/produk` | owner | kelola katalog: add / harga / stok (restok) / del |
| `/user` | owner | daftarkan & nonaktifkan kasir |
| `/help` | semua | panduan |

Bukti bayar cashless: foto diupload ke Google Drive (dilink ke transaksi) lalu dibaca vision model — nominalnya dibandingkan dengan total tagihan; kalau beda atau gagal dibaca, bot minta konfirmasi manual.

## Setup (dari nol, ±20 menit)

### 1. Siapkan token bot
1. Chat [@BotFather](https://t.me/BotFather) → `/newbot` → simpan tokennya (`123456:ABC-...`).

### 2. Siapkan Google Sheet (database)
1. Buat spreadsheet baru (nama bebas, mis. "DB Kasir").
2. **Extensions → Apps Script** → tempel isi [`sheet/setupTabs.gs`](sheet/setupTabs.gs) → jalankan fungsi `setupTabs` (authorize bila diminta).
3. Pastikan 7 tab terbentuk: Products, Transactions, Expenses, StockLog, Users, Pending, Meta.
4. Dari URL spreadsheet, salin ID-nya (bagian antara `/d/` dan `/edit`).

### 3. Siapkan folder Google Drive (bukti bayar)
1. Buat folder "Bukti Kasir" di Drive.
2. Share → *Anyone with the link → Viewer* (upload bot mewarisi izin folder ini, jadi link bukti bisa dibuka).
3. Salin folder ID-nya dari URL.

### 4. Jalankan stack
```bash
cp .env.example .env         # lalu isi TELEGRAM_BOT_TOKEN & POSTGRES_PASSWORD
docker compose up -d
```
Editor n8n: `http://127.0.0.1:5679` — di VPS, akses lewat SSH tunnel: `ssh -L 5679:127.0.0.1:5679 <vps>`.

### 5. Import & sambungkan workflow
1. Editor n8n → **Import from File** → `workflow/kasir-bot-v1.json`.
2. Buat credential **Google Sheets OAuth2** dan **Google Drive OAuth2** (boleh satu OAuth client Google untuk keduanya) → pasang ke semua node Sheets & Drive (proses import sengaja menghapus binding credential).
3. Isi node **Config**:
   - `spreadsheet_id` → ID dari langkah 2
   - `drive_folder_id` → ID dari langkah 3
   - `owner_ids` → ID Telegram kamu (chat pertama kali dengan bot akan menampilkan ID-mu, atau dapat dari @userinfobot)
   - `bot_token` & `openrouter_api_key` → isi lewat `node sync-creds.js inject` (dengan `creds.local.json`), atau manual di editor
4. **Activate** workflow.

### 6. Setup pertama lewat chat
Chat bot → `/setup` → jawab 3 langkahnya. Selesai — katalog siap, `/jual` bisa dipakai.

Kasir tambahan: minta dia chat bot (bot menolak + menampilkan ID-nya) → `/user add <id> <nama>`.

## Pemakaian harian

```
/jual                          → picker katalog: tap item → tap jumlah (1/2/3/5 atau ketik)
                                 → ulangi untuk item lain → ✅ Selesai & Bayar → metode → (foto bukti) → simpan
/jual 2 kopi susu, 1 roti      → versi ketik cepat (AI parse), draft yang sama
/beli                          → keterangan → nominal → metode → kategori → (foto nota) → ✅
/saldo    /laporan    /stok
/batal     → pilih transaksi → konfirmasi (stok ikut dikembalikan)
```
Draft yang menggantung > 2 jam otomatis dianggap hangus.

## Update

```bash
git pull
node sync-creds.js inject     # kalau workflow json baru diubah & perlu key
docker compose pull && docker compose up -d
# workflow berubah? import ulang json-nya ke n8n (scrub dulu: node sync-creds.js scrub)
node .test_kasir.js           # WAJIB hijau sebelum deploy perubahan logika
```

## Backup

- **Data kasir** ada di Google Sheets — andalkan versioning Google (File → Version history).
- **Internal n8n** (credentials + log eksekusi):
  ```bash
  docker exec kasir-bot-postgres pg_dump -U n8n n8n > backup-n8n-$(date +%F).sql
  docker run --rm -v kasir-bot_kasir_n8n_data:/data -v $(pwd):/bkp alpine tar czf /bkp/n8n-data-$(date +%F).tgz -C /data .
  ```

## Troubleshooting

| Gejala | Sebab & solusi |
|---|---|
| Bot diam total | `docker logs kasir-bot-poller` — token salah / workflow belum active |
| Error di node Sheets pertama | Tab belum dibuat (`setupTabs` belum dijalankan) atau spreadsheet_id salah |
| Semua credential hilang setelah import | Normal — re-link manual (gotcha n8n, lihat CONVENTIONS) |
| AI parse/vision sering gagal 429 | Model gratisan OpenRouter kena limit/didelist — ganti `ai_model`/`ai_vision_model` di Config |
| Nominal bukti nggak kebaca | By design: bot minta nominal manual; foto tetap tersimpan |
| Port 5679 bentrok | Ganti di `docker-compose.yml`, sisi host saja |
