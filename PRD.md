# PRD — Kasir Bot

## Latar belakang

Pemilik sebuah usaha kecil (kantin/jasa — ditentukan saat `/setup`) mencatat penjualan dengan cara manual: nota kertas / hitungan ingatan. Akibatnya: uang di laci sering tidak cocok, stok barang habis tanpa sadar, dan rekap harian/bulanan harus dihitung ulang. Yang dibutuhkan bukan POS penuh, tapi **pencatatan kas yang cukup gampang sehingga benar-benar dipakai** — maka wujudnya bot chat, bukan aplikasi.

Proyek ini diminta dibangun dengan stack yang sudah terbukti di *Spending Bot* (n8n + Docker + Telegram + Google Sheets), dengan repo terpisah.

## Pengguna

- **Owner** — pemilik usaha; setup awal, kelola katalog & kasir, lihat semua laporan.
- **Kasir** — 1–5 orang; menjual, mencatat belanja, cek saldo/stok; hanya bisa membatalkan transaksinya sendiri.
- Semua interaksi lewat **chat pribadi** dengan bot (grup tidak didukung di v1).

## Goals (v1)

1. Mencatat penjualan multi-item dengan konfirmasi sebelum simpan (salah parse masih bisa dibenerin).
2. Bukti bayar cashless terarsip (Drive) + dibaca AI untuk verifikasi nominal.
3. Uang masuk/keluar terpisah per metode → tahu "kas di laci" kapan pun.
4. Stok barang berkurang otomatis + peringatan menipis; jasa tanpa stok.
5. Koreksi tanpa kehilangan data (void append-only).
6. Laporan on-demand (hari/kemarin/7 hari/bulan) + item terlaris.
7. Multi-user dengan role & jejak operator di tiap transaksi.

## Non-goals (v1 — disengaja)

- Cetak struk fisik, QRIS dinamis (bot tidak menerima uang, hanya mencatat).
- Manajemen HPP/labah-labah bersih, pajak, multi-outlet, grup Telegram.
- OCR nota belanja (foto nota hanya diarsip; nominalnya diketik).
- Stok otomatis dari pembelian (restok manual via `/produk stok`).
- Auto-push laporan terjadwal (arsitektur siap — tinggal tambah schedule trigger).

## Keputusan desain & alasan

| # | Keputusan | Alasan |
|---|---|---|
| 1 | **Telegram, bukan WhatsApp** | WhatsApp Business API berbayar & ribet; Telegram bot token gratis, long-polling tanpa domain publik. |
| 2 | **Google Sheets sebagai DB** | Data harus bisa diolah pemilik (pivot/formula) tanpa app baru; pattern sudah terbukti di Spending Bot; volume usaha kecil aman. Konsekuensi: race condition pada transaksi serentak diterima (dicatat di Risks). |
| 3 | **Foto bukti dibaca AI vision** | Keinginan user (opsi yang dipilih saat perencanaan): memangkas ketik manual. Desainnya *assistive*, bukan *authoritative*: nominal AI dibandingkan total, beda/tidak-jelas → konfirmasi manual. Foto tetap diarsip apa pun hasilnya. |
| 4 | **AI hanya memetakan, bot menghitung** | Anti-halusinasi (pola Spending Bot): AI memilih product_id/qty dari katalog yang di-inject; harga, total, stok dihitung bot. AI rusak/429 → alur tetap aman. |
| 5 | **Konfirmasi sebelum commit + state machine `Pending`** | Salah parse tidak langsung jadi data; draft bisa dikoreksi/dibatalkan; percakapan multi-langkah tahan restart. |
| 6 | **Void append-only, tanpa delete** | Jejak audit utuh (siapa membatalkan apa); perhitungan cukup `status=ok`; pola terbukti di Spending Bot. |
| 7 | **Multi-user dengan role** | Jawaban keputusan perencanaan: dipakai owner + kasir. Whitelist dari tab `Users` (dikelola via `/user`), owner bootstrap dari Config. |
| 8 | **Stok dengan ledger `StockLog`** | Jawaban keputusan: stok diperlukan. Kolom `stok` = cache nilai kini; ledger untuk audit & penyesuaian. Jasa = tanpa stok (kolom kosong). |
| 9 | **Laporan on-demand** | Jawaban keputusan: cukup on-demand; auto-push mudah ditambah belakangan (schedule trigger). |
| 10 | **Kirim pesan via HTTP Telegram API, bukan node Telegram** | Keyboard inline harus dinamis (daftar void bisa N baris) — builder UI node Telegram bersifat statis. Bonus: tidak butuh Telegram credential, token cukup di Config. |
| 11 | **Repo terpisah dari Spending Bot** | Target deploy berbeda (VPS Spending Bot terblokir Docker), owner/domain data berbeda (usaha orang lain vs keuangan pribadi), ritme rilis berbeda. Biaya: duplikasi ~150 baris infra script — murah dibanding kopling dua produk. |
| 12 | **Long-polling sidecar (tg-poller)** | Tidak butuh domain/HTTPS/sertifikat; pola identik Spending Bot sehingga operasi sudah familier. |
| 13 | **Picker katalog sebagai default `/jual` (hybrid)** | Tap item → tap jumlah jauh lebih cepat & bebas typo ketimbang mengetik; hemat panggilan AI. Dirender sebagai SATU pesan live (editMessageText) supaya terasa seperti layar aplikasi. Jalur teks (AI parse) dipertahankan untuk pesanan panjang — keduanya bermuara ke draft yang sama. Jasa lewat jalur yang sama, tanpa sentuh stok. |

## Risiko & limitasi (diketahui, diterima)

- **Race condition** bila dua kasir commit di detik yang sama (Sheets tanpa transaksi) — volume usaha kecil: risiko rendah; gejala: stok meleset sedikit, bisa dikoreksi `/produk stok`.
- **Model vision gratisan OpenRouter** bisa didelist/429 — model di Config, ganti tanpa ubah kode; jalur manual selalu tersedia.
- **Foto draft yang dibatalkan** tetap jadi file di Drive (orphan) — acceptable, dibersihkan manual.
- **Sheets rate limit** (±60 req/menit/user) — jauh di atas kebutuhan satu usaha.
- **Deploy target**: bila memakai VPS LXC yang sama dengan Spending Bot, Docker terblokir seccomp → pakai host lain atau fallback native n8n (SQLite + PM2) — dibahas terpisah bila terjadi.

## Sukses itu seperti apa

Pemilik tidak lagi menutup buku dengan hitungan manual: setiap penjualan tercatat <30 detik lewat chat, saldo laci cocok tiap malam, dan akhir bulan `/laporan` bulan ini sudah menjawab "jualan apa yang paling laris".
