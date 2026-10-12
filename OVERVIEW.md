# OVERVIEW — Kasir Bot

## Apa ini

Bot Telegram yang menggantikan kasir kertas: pemilik & kasir usaha kecil mencatat **penjualan** dan **pengeluaran** lewat chat, bot mencocokkan pesanan ke katalog, meminta konfirmasi, membaca foto bukti bayar cashless dengan AI, lalu menyimpan semuanya ke Google Sheets yang bisa diolah bebas (pivot, formula, dashboard). Uang di laci (cash) dan uang digital terpisah, stok barang berkurang otomatis, salah input bisa dibatalkan tanpa menghapus data.

Dibuat dengan stack yang identik dengan *Spending Bot* (project saudara): satu `docker-compose.yml` berisi **n8n** (mesin workflow), **postgres** (hanya untuk internal n8n), dan **tg-poller** (jembatan Telegram → n8n yang bekerja dengan long-polling sehingga tidak butuh domain/HTTPS publik).

## Siapa pakai

| Role | Akses |
|---|---|
| **owner** | semua command, termasuk `/setup`, `/produk`, `/user`, `/batal` transaksi siapa pun |
| **kasir** | `/jual`, `/beli`, `/saldo`, `/laporan`, `/stok`, `/batal` (hanya transaksinya sendiri) |

Identitas = akun Telegram. Owner bootstrap lewat `owner_ids` di node Config; kasir lain didaftarkan lewat `/user add`.

## Arsitektur

```
Telegram ◄──long-polling── tg-poller (python, TELEGRAM_BOT_TOKEN di .env)
                               │ POST raw update
                               ▼
                    n8n webhook /kasir-bot-in
                               │
   Config (secret & parameter) → Load Users → Extract & Filter
   (whitelist role + dedup) → Read Pending → Router → Route (Switch 16 rute)
     │
     ├─ /jual  → Load Katalog → prompt AI → OpenRouter (parsing pesanan)
     │            → validasi & merge draft → metode bayar → foto:
     │            Telegram getFile → Download → Google Drive upload
     │            → OpenRouter vision (baca nominal) → bandingkan → konfirmasi
     │            → commit: append Transactions + update Products + append StockLog
     ├─ /beli  → wizard draft → (upload nota) → konfirmasi → append Expenses
     ├─ /saldo /laporan /stok → baca Sheets → hitung di Code node → reply
     ├─ /batal → pilih transaksi → mirror baris void + kembalikan stok
     └─ /setup /produk /user → kelola katalog, meta & daftar user
                               │
                    Kirim Pesan (HTTP sendMessage, keyboard dinamis)
```

Semua balasan berakhir di satu node `Kirim Pesan` (HTTP ke Telegram API, parse_mode HTML, `reply_markup` dinamis) sehingga keyboard bisa dibangun bebas dari Code node.

## Alur `/jual` end-to-end (inti bot)

1. `/jual` (kosong) → **pesan live picker**: katalog jadi tombol (6 item/halaman + navigasi) → tap item → layar jumlah (tombol 1/2/3/5 atau ketik) → item masuk draft, pesan yang sama terus di-edit (editMessageText).
2. Alternatif `/jual 2 kopi susu, 1 roti` atau ketik teks apa pun saat draft terbuka → katalog di-inject ke prompt → AI hanya **memilih** product_id + qty (anti-halusinasi: harga/total dihitung bot dari katalog, item tak dikenal dibuang). Hasilnya di-merge ke draft yang sama.
3. Draft tampil ringkasannya di layar picker → `✅ Selesai & Bayar`, atau `💳 Lanjut Bayar` di jalur teks.
4. Pilih metode (Cash/QRIS/Transfer/E-Wallet). Cash → langsung konfirmasi. Cashless → minta foto.
4. Foto → Drive (`Bukti Kasir/…`) → vision model baca nominal → dibandingkan total: `cocok` / `beda (ditandai)` / `tidak terbaca (minta ketik manual)`.
5. `✅ Simpan` → satu baris **per item line** di tab Transactions (satu `tx_id` per order), stok barang dikurangi + StockLog tercatat, peringatan stok menipis jika ada.

Setiap langkah tersimpan di tab `Pending` (state machine) — bot bisa lanjut di tengah percakapan dan draft > 2 jam hangus sendiri.

## Model data (1 spreadsheet, 7 tab)

Skema header: [`sheet/setupTabs.gs`](sheet/setupTabs.gs). Prinsip (diwarisi Spending Bot):

- **Append-only**: bot tidak pernah menghapus/menimpa baris transaksi. Koreksi = baris `status=void` + `void_of=<id>`; semua perhitungan hanya menghitung baris `status=ok`.
- **Saldo tidak pernah disimpan** — selalu dihitung dari baris (masuk − keluar), jadi tidak mungkin selisih sendiri. `Kas di laci` = cash masuk − cash keluar.
- **Stok**: kolom `stok` di Products adalah nilai terkini; jejak perubahan ada di StockLog (ref: tx_id / restok / void).
- Harga di transaksi adalah *snapshot* saat jual — naikkan harga tidak mengubah histori.
- Angka ditulis polos tanpa pemisah (`15000`); parsing & format (`Rp15.000`) dikerjakan bot.

| Tab | Isi |
|---|---|
| `Products` | katalog: id, nama, jenis (barang/jasa), harga, stok, stok_min, aktif |
| `Transactions` | penjualan, satu baris per item line (tx_id, operator, qty, harga, subtotal, metode, bukti_link, status, void_of) |
| `Expenses` | pengeluaran (exp_id, keterangan, kategori, metode, nominal, bukti_link, status, void_of) |
| `StockLog` | ledger stok: perubahan ±, sisa, ref |
| `Users` | user_id, nama, role (owner/kasir), aktif |
| `Pending` | state machine draft (jid, stage, draft_json, status) |
| `Meta` | key-value: business_name, business_type, setup_done |

## Keputusan penting

Ringkasan + alasannya ada di [PRD.md](PRD.md). Yang paling menentukan: (1) foto bukti dibaca AI vision tapi selalu ada jalur konfirmasi manual; (2) semua kirim pesan lewat HTTP Telegram API (bukan node Telegram) supaya keyboard dinamis & tidak butuh Telegram credential; (3) repo terpisah dari Spending Bot karena target deploy, owner, dan ritme rilisnya beda.

## Glossary

- **draft** — transaksi yang sedang disusun, belum disimpan (ada di tab `Pending`).
- **commit** — menuliskan draft yang sudah dikonfirmasi ke tab final (Transactions/Expenses/Products).
- **void** — pembatalan: baris baru bertanda yang meng-nyatakan transaksi lama tidak sah; data asli tetap ada.
- **katalog** — daftar produk/jasa + harga di tab `Products`.
- **kasir / owner** — dua role user; matriks akses lihat di atas.
- **bukti** — foto bukti bayar cashless (atau nota beli), diarsip di folder Drive, link-nya menempel di baris transaksi.
