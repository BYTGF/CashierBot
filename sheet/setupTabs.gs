/**
 * Kasir Bot — setup tab Google Sheets.
 *
 * CARA PAKAI:
 * 1. Buka spreadsheet baru (atau yang sudah ada) di Google Sheets.
 * 2. Menu Extensions > Apps Script, tempel seluruh file ini, save.
 * 3. Pilih fungsi `setupTabs` lalu Run (authorize bila diminta).
 * 4. Cek: 7 tab terbentuk dengan baris header sesuai skema di bawah.
 *
 * Node Google Sheets di n8n TIDAK bisa membuat tab — tab wajib sudah ada
 * sebelum workflow diaktifkan (lihat README §Setup).
 *
 * Aturan skema (CONVENTIONS.md):
 * - Baris 1 = header, tidak pernah diubah manual.
 * - Semua angka ditulis sebagai teks polos tanpa pemisah (mis. "15000")
 *   — parsing dilakukan bot, bukan format cell.
 * - Append-only: bot tidak pernah menghapus/menimpa baris transaksi;
 *   koreksi = baris baru bertanda status=void + void_of.
 */

var TABS = {
  Products: [
    'product_id', 'nama', 'jenis', 'harga', 'stok', 'stok_min', 'aktif',
    'created_at', 'updated_at'
  ],
  Transactions: [
    'tx_id', 'timestamp', 'tanggal', 'operator_id', 'operator_nama',
    'produk_id', 'produk_nama', 'qty', 'harga_satuan', 'subtotal',
    'metode', 'bukti_link', 'status', 'void_of'
  ],
  Expenses: [
    'exp_id', 'timestamp', 'tanggal', 'operator_id', 'operator_nama',
    'keterangan', 'kategori', 'metode', 'nominal', 'bukti_link',
    'status', 'void_of'
  ],
  StockLog: [
    'timestamp', 'product_id', 'produk_nama', 'perubahan', 'sisa',
    'ref', 'catatan'
  ],
  Users: [
    'user_id', 'nama', 'role', 'aktif', 'added_at'
  ],
  Pending: [
    'timestamp', 'jid', 'stage', 'draft_json', 'status'
  ],
  Meta: [
    'timestamp', 'key', 'value'
  ]
};

function setupTabs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    var header = TABS[name];
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  });
  // Hapus tab default "Sheet1" kalau masih kosong dan bukan salah satu tab skema.
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  Logger.log('Selesai. Tab: ' + Object.keys(TABS).join(', '));
}
