# CONVENTIONS — Kasir Bot

Aturan teknis proyek. Untuk aturan scope & disiplin kerja agent, lihat [AGENTS.md](AGENTS.md) (file ini yang dirujuk untuk detail teknis).

## 1. Format & penamaan

| Hal | Konvensi | Contoh |
|---|---|---|
| ID transaksi | `T-<YYYYMMDDHHMMSS WIB>` | `T-20261006143305` |
| ID pengeluaran | `E-<timestamp sama>` | `E-20261006143305` |
| ID produk | `P` + 3 digit urut | `P001`, `P012` |
| Timestamp kolom | `YYYY-MM-DD HH:MM:SS WIB` | `2026-10-06 14:33:05 WIB` |
| Kolom `tanggal` | `YYYY-MM-DD` (WIB) | `2026-10-06` |
| Angka di sheet | teks polos tanpa pemisah | `15000` (bukan `15.000`) |
| Format rupiah di chat | `Rp` + `id-ID` | `Rp15.000` |
| Callback data | `kb:` + token | `kb:pay_cash`, `kb:pick:3`, `kb:per_today` |
| Nama file bukti | `bukti-<chat_id>-<ts>.jpg` | — |

Token callback yang sudah dipakai (jangan pakai ulang dengan arti lain):
`pay, pay_cash, pay_qris, pay_transfer, pay_ewallet, yes, no, cancel, per_today, per_yesterday, per_week, per_month, cat_bb, cat_ops, cat_sewa, cat_gaji, cat_lain, jenis_barang, jenis_jasa, pick:<n>, ip:<product_id> (pilih item), q:<n> (jumlah cepat), qty (minta ketik jumlah), bk (kembali), pg:<n> (halaman katalog), fin (selesai & bayar)`.

Stage Pending: `setup_bisnis, setup_jenis, setup_produk, jual_pick (pesan live picker), jual_qty (layar jumlah), jual_items (jalur teks/lama), jual_pay, jual_proof, jual_nominal, confirm, beli_desc, beli_amount, beli_metode, beli_cat, beli_proof, void_pick, void_confirm, p_jenis` (+ status `active/done/cancelled`). Draft picker menyimpan `pick: {page, note}` dan `msg_id` (message_id pesan live untuk editMessageText) di dalam draft_json.

## 2. Workflow JSON

- Satu file per versi besar: `workflow/kasir-bot-v<N>.json`. **Hanya satu versi yang active** di n8n (semua memakai path webhook `kasir-bot-in` — dua versi aktif = pesan diproses dobel).
- `path` webhook: `kasir-bot-in`. Mengganti path = edit juga `N8N_WEBHOOK_URL` tg-poller di compose.
- `documentId` semua node Sheets berupa ekspresi `={{ $('Config').first().json.spreadsheet_id }}` — spreadsheet ID hanya diset di Config, tidak pernah di-hardcode.
- **Higienitas secret**: `bot_token` & `openrouter_api_key` hanya boleh ada di node `Config`. State repo = ter-scrub (`node sync-creds.js scrub`), wajib scrub sebelum commit/push. `creds.local.json` (gitignored) menyimpan nilai asli.
- Setelah import ke n8n, binding Google credentials sengaja hilang → re-link manual. Ini gotcha n8n, bukan bug.
- Node bernama `Config` adalah satu-satunya Set node konfigurasi — jangan pecah.

## 3. Code node (JavaScript)

- Pure JS tanpa `require`; helper (`nowWib`, `fmtIDR`, `esc`, `normHarga`, `pr`, `cr`, `METODE`, `KATEGORI`) diduplikasi di setiap node yang perlu — scope antar Code node tidak saling kenal (gotcha n8n).
- Nilai dari Sheets **selalu string** → konversi eksplisit `Number()` saat menghitung, `String()` saat menulis.
- Perhitungan uang & stok **tidak pernah** dipercayakan ke AI. AI hanya memetakan/membaca (product_id, qty, nominal bukti); bot yang memvalidasi terhadap sheet.
- Balasan memakai HTML (`parse_mode: 'HTML'`) — teks bebas dari user/sheet wajib lewat `esc()`. Pola output Code node: `{ chat_id, text, kb?, pending_row?, close_row? }`.
- Parser baris katalog/pesanan memakai strategi dua-opsi (token terakhir = stok lalu harga; kalau gagal, token terakhir = harga). Kalau mengubahnya, S3/S10 di harness adalah regression guard-nya.

## 4. Data & perhitungan

- Append-only: tidak ada delete/update baris transaksi. Koreksi = mirror `void` (subtotal/nominal negatif, `void_of` terisi) + StockLog pengembalian.
- `Products.stok` = nilai terkini yang di-update bot; sumber kebenaran jangka panjang = StockLog (opening + Σ perubahan). Jangan update stok tanpa menulis StockLog.
- Harga di Transactions adalah snapshot; laporan lama tidak berubah saat harga naik.
- Perubahan `Transactions`/`Expenses`/`Products` **wajib lewat draft + konfirmasi** — tidak ada penulisan langsung dari satu pesan.

## 5. Testing

- `node .test_kasir.js` **wajib hijau (0 fail)** sebelum deploy perubahan apa pun yang menyentuh Code node. Harness mengeksekusi jsCode asli dari workflow JSON dengan mock `$/$input/$getWorkflowStaticData`.
- Perbaikan bug → tambahkan assertion yang menangkap kelas kegagalan itu (satu assertion per kelas, bukan per fix).

## 6. Git & docs

- Commit: pesan ringkas bahasa Indonesia, satu topik (`feat: restok via /produk`, `fix: regex metode bayar`).
- Setiap sesi yang mengubah kode/konfigurasi **wajib** menambah entri [CHANGELOG.md](CHANGELOG.md) (paling atas) dan memperbarui README/PRD/OVERVIEW bila perilaku berubah.
- `.env` dan `creds.local.json` tidak pernah di-commit.

## 7. Deploy

- Port host n8n: **5679** (hindari tabrakan dengan Spending Bot di 5678). Default bind `127.0.0.1` — akses via SSH tunnel; jangan dibuka ke publik.
- Nama container/volume ber-awalan `kasir-bot` / `kasir_` — jangan diubah (backup & dokumen merujuk nama ini).
- Update infra: `docker compose pull && docker compose up -d` dari folder repo ini saja.
