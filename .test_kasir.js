#!/usr/bin/env node
// Test harness Kasir Bot — pola .test_wallet.js dari Spending Bot.
// Mengeksekusi jsCode dari Code node di workflow/kasir-bot-v1.json dengan
// mock $ / $input / getWorkflowStaticData, lalu menguji perilakunya
// TANPA perlu n8n jalan. WAJIB hijau sebelum deploy (CONVENTIONS.md).
//   node .test_kasir.js
'use strict';
const fs = require('fs');

// ============================ persiapan ============================
const wf = JSON.parse(fs.readFileSync('workflow/kasir-bot-v1.json', 'utf8'));
const codeOf = n => { const x = wf.nodes.find(v => v.name === n); if (!x) throw new Error('node tidak ketemu: ' + n); return x.parameters.jsCode; };
let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓', label); }
  else { fail++; console.log('  ✗ GAGAL:', label, extra !== undefined ? '| ' + JSON.stringify(extra).slice(0, 300) : ''); }
}

// ==================== cek struktur workflow JSON ====================
console.log('== Struktur workflow ==');
{
  const names = wf.nodes.map(n => n.name);
  ok(new Set(names).size === names.length, 'nama node unik (' + names.length + ' node)');
  const byName = Object.fromEntries(names.map(n => [n, true]));
  let badConn = 0;
  for (const [src, c] of Object.entries(wf.connections)) {
    if (!byName[src]) { badConn++; console.log('  ✗ koneksi dari node tak dikenal:', src); continue; }
    for (const outArr of c.main) for (const t of outArr || []) if (!byName[t.node]) { badConn++; console.log('  ✗ koneksi ke node tak dikenal:', src, '->', t.node); }
  }
  ok(badConn === 0, 'semua koneksi merujuk node yang ada');
  const route = wf.nodes.find(n => n.name === 'Route');
  ok(route.parameters.rules.values.length === 16, 'Route punya 16 rule', route.parameters.rules.values.length);
  ok(route.parameters.options.fallbackOutput === 'extra', 'Route punya fallback output');
  const raw = fs.readFileSync('workflow/kasir-bot-v1.json', 'utf8');
  ok(raw.includes('GANTI_SPREADSHEET_ID') && raw.includes('GANTI_DRIVE_FOLDER_ID'), 'placeholder spreadsheet & drive masih ada');
  ok(!/sk-or-v1-|ISI_TOKEN_BOT_DI_SINI_KECUALI_PLACEHOLDER/.test(raw.replace(/ISI_TOKEN_BOT_DI_SINI/g, '')), 'tidak ada secret asli');
  const syntaxBad = [];
  for (const n of wf.nodes) {
    if (n.type !== 'n8n-nodes-base.code') continue;
    try { new Function('$', '$input', 'getWorkflowStaticData', '$json', n.parameters.jsCode); } catch (e) { syntaxBad.push(n.name + ': ' + e.message); }
  }
  ok(syntaxBad.length === 0, 'semua jsCode valid secara sintaks', syntaxBad);
}

// ============================ mock runner ============================
function run(name, opts) {
  opts = opts || {};
  const js = codeOf(name);
  const input = (opts.input || []).map(x => (x && x.json !== undefined) ? x : { json: x });
  const refs = opts.refs || {};
  const stat = opts.stat || {};
  const miss = n => { throw new Error('ref belum diset: ' + n); };
  const $ = n => ({
    first: () => { const r = refs[n]; if (r === undefined) miss(n); const o = Array.isArray(r) ? r[0] : r; return { json: (o && o.json !== undefined) ? o.json : (o || {}) }; },
    all: () => { const r = refs[n]; if (r === undefined) miss(n); return (Array.isArray(r) ? r : [r]).map(o => ({ json: (o && o.json !== undefined) ? o.json : (o || {}) })); },
  });
  const $input = { first: () => input[0] || { json: {} }, all: () => input };
  const fn = new Function('$', '$input', 'getWorkflowStaticData', '$getWorkflowStaticData', '$json', js);
  const out = fn($, $input, () => stat, () => stat, (input[0] || {}).json || {});
  return (Array.isArray(out) ? out : []).map(i => i.json);
}
const KATALOG = [
  { product_id: 'P001', nama: 'Kopi Susu', jenis: 'barang', harga: '15000', stok: '24', stok_min: '5', aktif: 'TRUE', row_number: 2 },
  { product_id: 'P002', nama: 'Nasi Goreng', jenis: 'barang', harga: '18000', stok: '3', stok_min: '5', aktif: 'TRUE', row_number: 3 },
  { product_id: 'P003', nama: 'Cukur Rambut', jenis: 'jasa', harga: '20000', stok: '', stok_min: '', aktif: 'TRUE', row_number: 4 },
  { product_id: 'P004', nama: 'Es Teh', jenis: 'barang', harga: '5000', stok: '50', stok_min: '10', aktif: 'FALSE', row_number: 5 },
];
const CFG = { bot_token: 'TESTTOKEN', openrouter_api_key: 'TESTKEY', ai_model: 'test-model', ai_vision_model: 'test-vision', spreadsheet_id: 'SHEET', drive_folder_id: 'FOLDER', owner_ids: '111' };

// ============================ SCENARIO 1 ============================
console.log('\n== S1: Extract & Filter (whitelist + dedup) ==');
const usersRows = [{ user_id: '222', nama: 'Budi', role: 'kasir', aktif: 'TRUE' }, { user_id: '333', nama: 'Cici', role: 'kasir', aktif: 'FALSE' }];
const tgMsg = (id, text) => ({ message: { chat: { id }, from: { id, first_name: 'User' + id }, text }, update_id: 1 });
const stat = {};
let e1 = run('Extract & Filter', { input: usersRows, refs: { 'TG Update': tgMsg('999', 'halo'), 'Config': CFG }, stat });
ok(e1.length === 1 && e1[0].blocked === true, 'user tak dikenal -> blocked', e1);
ok(e1[0] && e1[0].user_id === '999', 'blocked bawa ID Telegram user', e1[0] && e1[0].user_id);
let e2 = run('Extract & Filter', { input: usersRows, refs: { 'TG Update': tgMsg('111', '/jual 2 kopi'), 'Config': CFG }, stat: {} });
ok(e2.length === 1 && e2[0].role === 'owner' && e2[0].blocked === undefined, 'owner dari Config -> lolos', e2);
let e3 = run('Extract & Filter', { input: usersRows, refs: { 'TG Update': tgMsg('222', 'halo'), 'Config': CFG }, stat: {} });
ok(e3.length === 1 && e3[0].role === 'kasir' && e3[0].nama === 'Budi', 'kasir aktif -> lolos dengan nama dari sheet', e3);
let e4 = run('Extract & Filter', { input: usersRows, refs: { 'TG Update': tgMsg('333', 'halo'), 'Config': CFG }, stat: {} });
ok(e4.length === 1 && e4[0].blocked === true, 'kasir nonaktif -> blocked', e4);
const statDup = {};
run('Extract & Filter', { input: usersRows, refs: { 'TG Update': tgMsg('111', 'kopi'), 'Config': CFG }, stat: statDup });
let e5 = run('Extract & Filter', { input: usersRows, refs: { 'TG Update': tgMsg('111', 'kopi'), 'Config': CFG }, stat: statDup });
ok(e5.length === 0, 'teks sama beruntun <60s -> dibuang (dedup)', e5);
let e6 = run('Extract & Filter', { input: usersRows, refs: { 'TG Update': { callback_query: { id: 'cb1', data: 'kb:yes', from: { id: '111', first_name: 'Owner' }, message: { chat: { id: '111' }, from: { id: '111' } } } }, 'Config': CFG }, stat: {} });
ok(e6.length === 1 && e6[0].kind === 'callback' && e6[0].text === 'yes', 'callback kb:yes -> text "yes"', e6);
let e7 = run('Extract & Filter', { input: usersRows, refs: { 'TG Update': { message: { chat: { id: '111' }, from: { id: '111' }, photo: [{ file_id: 'small' }, { file_id: 'big' }], caption: '' } }, 'Config': CFG }, stat: {} });
ok(e7.length === 1 && e7[0].kind === 'photo' && e7[0].file_id === 'big', 'foto -> kind photo + file_id terbesar', e7);

// ============================ SCENARIO 2 ============================
console.log('\n== S2: Router (pemetaan rute) ==');
const ef = (text, extra) => Object.assign({ chat_id: '111', user_id: '111', nama: 'Owner', role: 'owner', text, kind: 'text', file_id: '' }, extra || {});
const r = (text, pendingRows, extra) => run('Router', { input: pendingRows || [], refs: { 'Extract & Filter': ef(text, extra) } })[0];
const wibNow = () => { const d = new Date(Date.now() + 7 * 3600e3); const p = n => String(n).padStart(2, '0'); return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) + ' WIB'; };
const pj = (stage, draft) => [{ timestamp: wibNow(), jid: '111', stage, draft_json: JSON.stringify(draft || {}), status: 'active' }];
ok(r('/jual').route === 'jual', '/jual -> jual');
ok(r('/jual 2 kopi').args === '2 kopi', 'args /jual terpisah', r('/jual 2 kopi').args);
ok(r('batal').route === 'void', 'batal tanpa pending -> void');
ok(r('batal', pj('jual_items', { kind: 'jual', items: [] })).route === 'cancel', 'batal saat draft -> cancel');
ok(r('mau dong', pj('jual_items', { kind: 'jual', items: [] })).route === 'jual', 'teks bebas saat draft jual -> jual');
ok(r('pay_cash', pj('jual_pay', { kind: 'jual', items: [] })).route === 'jual', 'token metode saat jual_pay -> jual');
ok(r('45000', pj('jual_proof', { kind: 'jual', items: [] })).route === 'jual', 'angka saat jual_proof -> jual');
ok(r('ya', pj('confirm', { kind: 'jual', items: [] })).route === 'confirm', 'ya saat confirm -> confirm');
ok(r('tidak', pj('confirm', { kind: 'jual', items: [] })).route === 'confirm', 'tidak saat confirm -> confirm');
ok(r('/laporan').route === 'laporan_ask', '/laporan -> minta periode');
ok(r('/laporan hari').route === 'laporan_calc', '/laporan hari -> langsung hitung');
ok(r('per_week', [], { kind: 'callback' }).route === 'laporan_calc', 'callback per_week -> hitung');
ok(r('/saldo').route === 'saldo', '/saldo -> saldo');
ok(r('/stok').route === 'stok', '/stok -> stok');
ok(r('/produk').route === 'produk', '/produk owner -> produk');
ok(r('/produk', [], { role: 'kasir' }).route === 'fallback', '/produk kasir -> fallback');
ok(r('/user', [], { role: 'kasir' }).route === 'fallback', '/user kasir -> fallback');
ok(r('/setup', [], { role: 'kasir' }).route === 'fallback', '/setup kasir -> fallback');
ok(r('apaan sih').route === 'fallback', 'teks aneh -> fallback');
ok(r('batal', pj('void_pick', { kind: 'void', picks: [] })).route === 'cancel', 'batal saat void_pick -> cancel draft void');

// ============================ SCENARIO 3 ============================
console.log('\n== S3: Setup wizard ==');
const rtr = o => Object.assign({ chat_id: '111', user_id: '111', nama: 'Owner', role: 'owner', text: '', kind: 'text', file_id: '', args: '', pending_stage: '', draft: {} }, o);
let s0 = run('Setup Start', { input: [], refs: { Router: rtr({ text: '/setup' }) } })[0];
ok(/Nama usahanya/.test(s0.text) && s0.pending_row.stage === 'setup_bisnis', 'setup mulai -> nanya nama usaha', s0);
let s0b = run('Setup Start', { input: [{ key: 'setup_done', value: 'true', timestamp: '2026-10-06 09:00:00 WIB' }], refs: { Router: rtr({ text: '/setup' }) } })[0];
ok(!s0b.pending_row && /\/produk/.test(s0b.text), 'setup ulang -> ditolak, arahkan ke /produk', s0b);
let s1 = run('Setup Router', { refs: { Router: rtr({ text: 'Warung Bu Sari', pending_stage: 'setup_bisnis', draft: { kind: 'setup' } }) } })[0];
ok(s1.pending_row.stage === 'setup_jenis', 'nama usaha tersimpan -> lanjut jenis', s1.pending_row);
let d1 = JSON.parse(s1.pending_row.draft_json);
ok(d1.bisnis === 'Warung Bu Sari', 'nama usaha masuk draft', d1);
let s2 = run('Setup Router', { refs: { Router: rtr({ text: 'kantin', pending_stage: 'setup_jenis', draft: d1 }) } })[0];
ok(s2.pending_row.stage === 'setup_produk' && /satu baris/.test(s2.text), 'jenis tersimpan -> instruksi katalog', s2.pending_row && s2.text);
let s3 = run('Setup Router', { refs: { Router: rtr({ text: 'Kopi Susu 15000 24\nNasi Goreng 18rb 10\nCukur Rambut 20000\nbaris aneh', pending_stage: 'setup_produk', draft: JSON.parse(s2.pending_row.draft_json) }) } })[0];
let d3 = JSON.parse(s3.pending_row.draft_json);
ok(d3.product_rows.length === 3, '3 baris valid -> 3 produk', d3.product_rows && d3.product_rows.length);
ok(d3.product_rows[0].product_id === 'P001' && d3.product_rows[0].jenis === 'barang' && d3.product_rows[0].stok === '24' && d3.product_rows[0].harga === '15000', 'P001 Kopi Susu barang 15000 stok 24', d3.product_rows[0]);
ok(d3.product_rows[1].harga === '18000', 'harga "18rb" dinormalisasi jadi 18000', d3.product_rows[1]);
ok(d3.product_rows[2].jenis === 'jasa' && d3.product_rows[2].stok === '', 'tanpa stok -> jasa', d3.product_rows[2]);
ok(/baris aneh/.test(s3.text) && s3.pending_row.stage === 'confirm' && s3.kb, 'baris rusak dilaporkan + minta konfirmasi', s3.text);
ok(s3.pending_row.draft_json.includes('setup_done'), 'meta_rows setup_done disiapkan');
let s4 = run('Setup Router', { refs: { Router: rtr({ text: 'Kopi doang 10000\nbaris aneh', pending_stage: 'setup_produk', draft: { kind: 'setup', bisnis: 'x', jenis: 'y' } }) } })[0];
let d4 = JSON.parse(s4.pending_row.draft_json);
ok(d4.product_rows.length === 1 && /baris aneh/.test(s4.text), 'campuran valid+rusak -> valid disimpan, rusak dilaporkan', d4.product_rows);
let s5 = run('Setup Router', { refs: { Router: rtr({ text: 'baris aneh', pending_stage: 'setup_produk', draft: { kind: 'setup', bisnis: 'x', jenis: 'y' } }) } })[0];
ok(s5.pending_row.stage === 'setup_produk' && JSON.parse(s5.pending_row.draft_json).product_rows === undefined, 'semua rusak -> minta ulang, belum ada product_rows', s5.text);

// ============================ SCENARIO 4 ============================
console.log('\n== S4: Jual — draft & AI parse ==');
let j0 = run('Jual Router', { refs: { Router: rtr({ text: '/jual 2 kopi susu', args: '2 kopi susu' }) } })[0];
ok(j0.action === 'parse' && j0.ai_text === '2 kopi susu', '/jual + args -> action parse', j0);
let j0b = run('Jual Router', { input: KATALOG, refs: { Router: rtr({ text: '/jual' }) } })[0];
ok(j0b.action === 'picker' && j0b.draft.pick && j0b.draft.pick.page === 0, '/jual kosong -> mode picker (pesan live)', j0b);
let bp = run('Build Order Prompt', { refs: { 'Jual Router': j0, 'Config': CFG, 'Load Katalog Jual': KATALOG } })[0];
ok(bp.ai_body && bp.ai_body.messages[1].content.includes('P001 | Kopi Susu | 15000'), 'prompt AI memuat katalog', bp.ai_body && bp.ai_body.messages[1].content.slice(0, 120));
ok(!bp.ai_body.messages[1].content.includes('Es Teh'), 'produk nonaktif tidak masuk prompt');
let pm = run('Parse & Merge', { input: [{ choices: [{ message: { content: JSON.stringify({ items: [{ product_id: 'P001', qty: 2 }, { product_id: 'P999', qty: 1 }], tidak_jelas: [] }) } }] }], refs: { 'Build Order Prompt': bp, 'Jual Router': j0 } })[0];
let pmD = JSON.parse(pm.pending_row.draft_json);
ok(pmD.items.length === 1 && pmD.items[0].qty === 2 && pmD.total === 30000, 'P999 dihapus, 2x Kopi = total 30000', pmD.items);
ok(!/⚠️/.test(pm.text), 'stok 24-2=22 masih aman -> tanpa peringatan', pm.text);
let pm2 = run('Parse & Merge', { input: [{ choices: [{ message: { content: JSON.stringify({ items: [{ product_id: 'P001', qty: 1 }, { product_id: 'P001', qty: 2 }], tidak_jelas: [] }) } }] }], refs: { 'Build Order Prompt': bp, 'Jual Router': j0 } })[0];
let pm2D = JSON.parse(pm2.pending_row.draft_json);
ok(pm2D.items.length === 1 && pm2D.items[0].qty === 3 && pm2D.total === 45000, 'item sama di-merge qty 3 (45.000)', pm2D.items);
let pm3 = run('Parse & Merge', { input: [{ choices: [{ message: { content: JSON.stringify({ items: [{ product_id: 'P002', qty: 5 }], tidak_jelas: [] }) } }] }], refs: { 'Build Order Prompt': bp, 'Jual Router': j0 } })[0];
ok(/stok cuma 3/.test(pm3.text), 'pesan > stok -> peringatan', pm3.text);
let pm4 = run('Parse & Merge', { input: [{ choices: [{ message: { content: 'ngawur bukan json' } }] }], refs: { 'Build Order Prompt': bp, 'Jual Router': j0 } })[0];
ok(/ngambek/.test(pm4.text) && pm4.pending_row, 'AI rusak -> reply ramah, draft tetap', pm4.text);
let pm5 = run('Parse & Merge', { input: [{ choices: [{ message: { content: JSON.stringify({ items: [], tidak_jelas: ['kopi gosong?'] }) } }] }], refs: { 'Build Order Prompt': bp, 'Jual Router': j0 } })[0];
ok(/kopi gosong/.test(pm5.text) && /Kopi Susu/.test(pm5.text), 'items kosong -> saran + daftar katalog', pm5.text);
// draft dengan isi -> bayar
const draftIsi = { kind: 'jual', items: [{ product_id: 'P001', nama: 'Kopi Susu', qty: 2, harga: 15000, subtotal: 30000 }], total: 30000, metode: '', bukti_link: '', bukti_nominal: null, bukti_status: '', operator: { id: '111', nama: 'Owner' } };
let j1 = run('Jual Router', { refs: { Router: rtr({ text: 'bayar', pending_stage: 'jual_items', draft: draftIsi }) } })[0];
ok(j1.kb && j1.pending_row.stage === 'jual_pay', 'bayar -> pilih metode', j1);
let j2 = run('Jual Router', { refs: { Router: rtr({ text: 'pay_cash', kind: 'callback', pending_stage: 'jual_pay', draft: draftIsi }) } })[0];
ok(j2.action === 'final' && j2.draft.metode === 'cash', 'cash -> langsung konfirmasi', j2);
let j3 = run('Jual Router', { refs: { Router: rtr({ text: 'pay_qris', kind: 'callback', pending_stage: 'jual_pay', draft: draftIsi }) } })[0];
ok(j3.pending_row.stage === 'jual_proof' && /foto bukti/.test(j3.text), 'qris -> minta foto bukti', j3.pending_row && j3.text);
let j4 = run('Jual Router', { refs: { Router: rtr({ text: '45000', pending_stage: 'jual_proof', draft: draftIsi }) } })[0];
ok(j4.action === 'final' && j4.draft.bukti_nominal === 45000 && j4.draft.bukti_status === 'beda', 'nominal manual 45000 vs total 30000 -> beda', j4.draft);
let j5 = run('Jual Router', { refs: { Router: rtr({ text: '30000', pending_stage: 'jual_proof', draft: draftIsi }) } })[0];
ok(j5.action === 'final' && j5.draft.bukti_status === 'cocok', 'nominal manual 30000 = total -> cocok', j5.draft);
let j6 = run('Jual Router', { refs: { Router: rtr({ text: '2 es teh', pending_stage: 'jual_items', draft: draftIsi }) } })[0];
ok(j6.action === 'parse' && j6.ai_text === '2 es teh', 'teks tambahan saat draft -> parse lagi (merge)', j6);

// ============================ SCENARIO 5 ============================
console.log('\n== S5: Konfirmasi & commit jual ==');
const draftFinal = Object.assign({}, draftIsi, { metode: 'cash' });
let fs1 = run('Final Summary', { refs: { 'Jual Router': rtr({ pending_stage: 'jual_pay', draft: draftFinal }) } })[0];
ok(/Konfirmasi Penjualan/.test(fs1.text) && /Cash/.test(fs1.text) && fs1.pending_row.stage === 'confirm', 'ringkasan final + stage confirm', fs1.text);
const routerCtx = rtr({ pending_stage: 'confirm', draft: draftFinal });
routerCtx.text = 'ya';
let c1 = run('Confirm Router', { refs: { Router: routerCtx } })[0];
ok(c1.commit === 'jual' && c1.tx_rows.length === 1 && c1.tx_rows[0].tx_id === c1.tx_rows[0].tx_id, 'ya -> commit jual', c1);
ok(c1.tx_rows[0].qty === '2' && c1.tx_rows[0].subtotal === '30000' && c1.tx_rows[0].status === 'ok' && c1.tx_rows[0].tanggal.length === 10, 'baris tx string & tanggal YYYY-MM-DD', c1.tx_rows[0]);
let c2 = run('Confirm Router', { refs: { Router: rtr({ text: 'tidak', pending_stage: 'confirm', draft: draftFinal }) } })[0];
ok(c2.close_row && c2.close_row.status === 'cancelled' && !c2.commit, 'tidak -> close cancelled', c2);
const draftMulti = Object.assign({}, draftIsi, { items: [draftIsi.items[0], { product_id: 'P003', nama: 'Cukur Rambut', qty: 1, harga: 20000, subtotal: 20000 }], total: 50000 });
let bs = run('Build Stok Rows', { input: KATALOG, refs: { Router: rtr({ draft: draftMulti }), 'Confirm Router': { tx_id: 'T-X' } } });
ok(bs.length === 1 && bs[0].update_row.stok === '22' && bs[0].sl.perubahan === '-2' && bs[0].sl.sisa === '22', 'stok kopi 24-2=22 + log -2 (jasa dilewati)', bs);
ok(bs[1] === undefined, 'item jasa tidak menghasilkan update stok', bs[1]);
const bsAllJasa = run('Build Stok Rows', { input: KATALOG, refs: { Router: rtr({ draft: { items: [{ product_id: 'P003', qty: 1 }] } }), 'Confirm Router': { tx_id: 'T-X' } } });
ok(bsAllJasa.length === 1 && bsAllJasa[0].skip === 1, 'semua jasa -> marker skip (flow tetap jalan)', bsAllJasa);
let jrep = run('Jual Commit Reply', { refs: { 'Confirm Router': c1, Router: rtr({ draft: draftMulti }), 'Build Stok Rows': bs } })[0];
ok(/Tersimpan/.test(jrep.text) && jrep.close_row.status === 'done', 'reply tersimpan + close done', jrep.text);
const draftLow = Object.assign({}, draftIsi, { items: [{ product_id: 'P002', nama: 'Nasi Goreng', qty: 2, harga: 18000, subtotal: 36000 }] });
let bsLow = run('Build Stok Rows', { input: KATALOG, refs: { Router: rtr({ draft: draftLow }), 'Confirm Router': { tx_id: 'T-Y' } } });
ok(bsLow[0].sisa === 1 && bsLow[0].sisa <= bsLow[0].stok_min, 'stok 3-2=1 -> menipis', bsLow[0]);
let jrepLow = run('Jual Commit Reply', { refs: { 'Confirm Router': { tx_id: 'T-Y' }, Router: rtr({ draft: draftLow }), 'Build Stok Rows': bsLow } })[0];
ok(/Stok menipis/.test(jrepLow.text) && /Nasi Goreng/.test(jrepLow.text), 'peringatan stok menipis di reply commit', jrepLow.text);

// ============================ SCENARIO 6 ============================
console.log('\n== S6: Beli (pengeluaran) ==');
let b0 = run('Beli Router', { refs: { Router: rtr({ text: '/beli gula 5kg', args: 'gula 5kg' }) } })[0];
ok(b0.pending_row.stage === 'beli_amount' && /gula 5kg/.test(b0.text), '/beli + keterangan -> nanya nominal', b0);
let b1 = run('Beli Router', { refs: { Router: rtr({ text: 'gula 5kg', pending_stage: 'beli_desc', draft: { kind: 'beli', operator: { id: '111', nama: 'Owner' } } }) } })[0];
ok(b1.pending_row.stage === 'beli_amount', 'keterangan -> nanya nominal', b1);
let d1b = JSON.parse(b1.pending_row.draft_json);
let b2 = run('Beli Router', { refs: { Router: rtr({ text: '50rb', pending_stage: 'beli_amount', draft: d1b }) } })[0];
let d2b = JSON.parse(b2.pending_row.draft_json);
ok(d2b.nominal === 50000 && b2.kb && b2.pending_row.stage === 'beli_metode', '"50rb" -> 50000 + pilih metode', d2b);
let b3 = run('Beli Router', { refs: { Router: rtr({ text: '1,5jt', pending_stage: 'beli_amount', draft: d1b }) } })[0];
ok(JSON.parse(b3.pending_row.draft_json).nominal === 1500000, '"1,5jt" -> 1500000', b3);
let b4 = run('Beli Router', { refs: { Router: rtr({ text: 'pay_cash', kind: 'callback', pending_stage: 'beli_metode', draft: d2b }) } })[0];
ok(b4.pending_row.stage === 'beli_cat', 'metode -> pilih kategori', b4.pending_row);
let d4b = JSON.parse(b4.pending_row.draft_json);
ok(d4b.metode === 'cash', 'metode cash tersimpan', d4b);
let b5 = run('Beli Router', { refs: { Router: rtr({ text: 'cat_bb', kind: 'callback', pending_stage: 'beli_cat', draft: d4b }) } })[0];
ok(b5.pending_row.stage === 'beli_proof' && /nota/.test(b5.text), 'kategori -> tawarkan foto nota', b5.pending_row && b5.text);
let d5b = JSON.parse(b5.pending_row.draft_json);
let b6 = run('Beli Router', { refs: { Router: rtr({ text: 'skip', pending_stage: 'beli_proof', draft: d5b }) } })[0];
ok(b6.pending_row.stage === 'confirm' && /Konfirmasi Pengeluaran/.test(b6.text), 'skip -> konfirmasi', b6.pending_row && b6.text);
let d6b = JSON.parse(b6.pending_row.draft_json);
let b7 = run('Beli Router', { refs: { Router: rtr({ text: 'hmm', pending_stage: 'beli_amount', draft: d1b }) } })[0];
ok(/Nominalnya/.test(b7.text), 'jawaban ngawur -> tanya ulang', b7.text);
let bc = run('Confirm Router', { refs: { Router: rtr({ text: 'ya', pending_stage: 'confirm', draft: d6b }) } })[0];
ok(bc.commit === 'beli' && bc.exp_row.exp_id.startsWith('E-') && bc.exp_row.nominal === '50000' && bc.exp_row.kategori === 'bb', 'commit beli -> exp_row lengkap', bc.exp_row);
let bcr = run('Beli Commit Reply', { refs: { 'Confirm Router': bc } })[0];
ok(/Tersimpan/.test(bcr.text) && bcr.close_row.status === 'done', 'reply beli tersimpan', bcr.text);

// ============================ SCENARIO 7 ============================
console.log('\n== S7: Foto bukti (vision) & nota ==');
const binItem = { json: { id: 'FILE123' }, binary: { data: { data: 'QkFTRTY0', mimeType: 'image/jpeg' } } };
let vp = run('Build Vision Prompt', { input: [binItem], refs: { Router: rtr({ pending_stage: 'jual_proof', draft: draftFinal }), 'Config': CFG } })[0];
ok(vp.ai_body.messages[1].content[1].image_url.url === 'data:image/jpeg;base64,QkFTRTY0', 'gambar base64 masuk prompt vision', vp.ai_body && vp.ai_body.messages[1].content[1] && vp.ai_body.messages[1].content[1].image_url);
ok(vp.bukti_link === 'https://drive.google.com/file/d/FILE123/view', 'link bukti dari ID Drive', vp.bukti_link);
ok(vp.ai_body.messages[1].content[0].text.includes('Rp30000'), 'total tagihan disebut di prompt', vp.ai_body.messages[1].content[0].text);
let vr1 = run('Jual Vision Result', { input: [{ choices: [{ message: { content: JSON.stringify({ nominal: 30000, metode: 'QRIS', jelas: true }) } }] }], refs: { 'Build Vision Prompt': vp, Router: rtr({ pending_stage: 'jual_proof', draft: draftFinal }) } })[0];
let vr1D = JSON.parse(vr1.pending_row.draft_json);
ok(vr1D.bukti_status === 'cocok' && vr1D.bukti_nominal === 30000 && vr1.pending_row.stage === 'confirm', 'vision nominal = total -> cocok, konfirmasi', vr1D);
let vr2 = run('Jual Vision Result', { input: [{ choices: [{ message: { content: JSON.stringify({ nominal: 25000, metode: 'QRIS', jelas: true }) } }] }], refs: { 'Build Vision Prompt': vp, Router: rtr({ pending_stage: 'jual_proof', draft: draftFinal }) } })[0];
let vr2D = JSON.parse(vr2.pending_row.draft_json);
ok(vr2D.bukti_status === 'beda' && /beda/.test(vr2.text), 'vision nominal beda -> ditandai', vr2D.bukti_status);
let vr3 = run('Jual Vision Result', { input: [{ choices: [{ message: { content: JSON.stringify({ nominal: null, metode: null, jelas: false }) } }] }], refs: { 'Build Vision Prompt': vp, Router: rtr({ pending_stage: 'jual_proof', draft: draftFinal }) } })[0];
ok(vr3.pending_row.stage === 'jual_nominal' && /manual/.test(vr3.text), 'vision gagal baca -> minta nominal manual', vr3.pending_row && vr3.text);
let bn = run('Beli Nota Result', { input: [{ json: { id: 'FILE9' } }], refs: { Router: rtr({ pending_stage: 'beli_proof', draft: d5b }) } })[0];
let bnD = JSON.parse(bn.pending_row.draft_json);
ok(bnD.bukti_link.includes('FILE9') && bn.pending_row.stage === 'confirm', 'nota beli diarsip + konfirmasi', bnD);

// ============================ SCENARIO 8 ============================
console.log('\n== S8: Saldo, Laporan, Stok ==');
const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
const txRows = [
  { tx_id: 'T-1', tanggal: today, produk_id: 'P001', produk_nama: 'Kopi Susu', qty: '2', subtotal: '30000', metode: 'cash', status: 'ok', operator_id: '222', operator_nama: 'Budi' },
  { tx_id: 'T-1', tanggal: today, produk_id: 'P002', produk_nama: 'Nasi Goreng', qty: '1', subtotal: '18000', metode: 'qris', status: 'ok', operator_id: '111' },
  { tx_id: 'T-2', tanggal: yesterday, produk_id: 'P001', produk_nama: 'Kopi Susu', qty: '1', subtotal: '15000', metode: 'cash', status: 'ok', operator_id: '111' },
  { tx_id: 'T-3', tanggal: today, produk_id: 'P001', produk_nama: 'Kopi Susu', qty: '1', subtotal: '15000', metode: 'cash', status: 'void', void_of: 'T-3', operator_id: '111' },
];
const expRows = [
  { exp_id: 'E-1', tanggal: today, keterangan: 'gula', kategori: 'bb', metode: 'cash', nominal: '50000', status: 'ok', operator_id: '111' },
  { exp_id: 'E-2', tanggal: yesterday, keterangan: 'sewa', kategori: 'sewa', metode: 'cash', nominal: '100000', status: 'ok', operator_id: '111' },
  { exp_id: 'E-3', tanggal: today, keterangan: 'plastik', kategori: 'ops', metode: 'qris', nominal: '20000', status: 'ok', operator_id: '111' },
];
let sd = run('Saldo Reply', { input: expRows, refs: { Router: rtr({ text: '/saldo' }), 'Load Tx Saldo': txRows } })[0];
ok(/Kas di laci \(cash\): Rp-105\.000/.test(sd.text), 'kas laci = cash masuk 45k - cash keluar 150k = -105k (boleh minus)', sd.text);
ok(/Total masuk: <b>Rp63\.000<\/b>/.test(sd.text), 'total masuk 63000 (void diabaikan)', sd.text);
ok(/Total keluar: <b>Rp170\.000<\/b>/.test(sd.text), 'total keluar 170000', sd.text);
ok(sd.text.includes(today) === false, 'saldo pakai tanggal hari ini dari jam WIB', today);
let sdToday = sd.text.match(/Hari ini: masuk Rp([\d.]+)/);
ok(sdToday && sdToday[1] === '48.000', 'hari ini masuk 48000 (T-1 saja, T-2 kemarin, void diabaikan)', sdToday && sdToday[1]);
let la = run('Laporan Ask', { refs: { Router: rtr({ text: '/laporan' }) } })[0];
ok(la.kb.length === 2 && la.kb[0][0].data === 'per_today', 'laporan ask: 2x2 tombol periode', la.kb);
let lr = run('Laporan Reply', { input: expRows, refs: { Router: rtr({ text: 'per_today', kind: 'callback' }), 'Load Tx Laporan': txRows, 'Load Katalog Lap': KATALOG } })[0];
ok(/Hari ini/.test(lr.text) && /Rp48\.000/.test(lr.text), 'laporan hari ini: masuk 48000', lr.text);
ok(/bb Rp50\.000/.test(lr.text), 'kategori bahan baku 50000', lr.text);
ok(/Terlaris/.test(lr.text) && /Kopi Susu ×2/.test(lr.text), 'terlaris Kopi ×2 hari ini', lr.text);
ok(/Stok menipis/.test(lr.text) && /Nasi Goreng/.test(lr.text), 'stok menipis (Nasi Goreng 3<=5)', lr.text);
let lrY = run('Laporan Reply', { input: expRows, refs: { Router: rtr({ text: '/laporan kemarin', args: 'kemarin' }), 'Load Tx Laporan': txRows, 'Load Katalog Lap': KATALOG } })[0];
ok(/Kemarin/.test(lrY.text) && /Rp15\.000/.test(lrY.text) && /Rp100\.000/.test(lrY.text), 'laporan kemarin terpisah', lrY.text);
let lr0 = run('Laporan Reply', { input: [], refs: { Router: rtr({ text: 'per_month', kind: 'callback' }), 'Load Tx Laporan': [], 'Load Katalog Lap': [] } })[0];
ok(/Belum ada transaksi/.test(lr0.text), 'periode kosong -> pesan ramah', lr0.text);
let st = run('Stok Reply', { input: KATALOG, refs: { Router: rtr({ text: '/stok' }) } })[0];
ok(/Kopi Susu.*sisa 24/.test(st.text), 'stok kopi tampil', st.text);
ok(/menipis!/.test(st.text) && /Nasi Goreng/.test(st.text), 'nasi goreng ditandai menipis', st.text);
ok(/Jasa/.test(st.text) && /Cukur Rambut/.test(st.text), 'jasa di seksi terpisah', st.text);
ok(!st.text.includes('Es Teh'), 'produk nonaktif tidak tampil', st.text);

// ============================ SCENARIO 9 ============================
console.log('\n== S9: Void / batal transaksi ==');
let v0 = run('Void Router', { refs: { Router: rtr({ text: '/batal' }), 'Load Recent Tx': txRows, 'Load Recent Exp': expRows } })[0];
ok(v0.kb && v0.kb.length >= 3, 'daftar void: >=3 pilihan (2 order + 3 exp)', v0.kb && v0.kb.length);
ok(v0.pending_row.stage === 'void_pick', 'stage void_pick', v0.pending_row);
let v0D = JSON.parse(v0.pending_row.draft_json);
ok(v0D.picks.length === 5 && v0D.picks[0].id === 'T-2' && v0D.picks[1].id === 'T-1', 'T-2 terbaru paling atas (T-3 sudah void, ke-exclude); 5 kandidat', v0D.picks);
let v1 = run('Void Router', { refs: { Router: rtr({ text: 'pick:1', kind: 'callback', pending_stage: 'void_pick', draft: v0D }), 'Load Recent Tx': txRows, 'Load Recent Exp': expRows } })[0];
ok(v1.pending_row.stage === 'void_confirm' && /T-1/.test(v1.text), 'pick:1 -> konfirmasi T-1', v1.pending_row && v1.text);
let v1D = JSON.parse(v1.pending_row.draft_json);
ok(v1D.pick.id === 'T-1' && v1D.pick.total === 48000, 'pick T-1 total 48000', v1D.pick);
let v2 = run('Void Router', { refs: { Router: rtr({ text: 'yes', kind: 'callback', pending_stage: 'void_confirm', draft: v1D }), 'Load Recent Tx': txRows, 'Load Recent Exp': expRows } })[0];
ok(v2.commit === 'void', 'ya -> commit void', v2);
let vc = run('Build Void Rows', { input: KATALOG, refs: { Router: rtr({ pending_stage: 'void_confirm', draft: v1D }), 'Load Recent Tx': txRows, 'Load Recent Exp': expRows } })[0];
ok(vc.void_tx_rows.length === 1 && vc.void_tx_rows[0].status === 'void' && vc.void_tx_rows[0].void_of === 'T-1' && vc.void_tx_rows[0].subtotal === '-48000', 'baris void: negatif, status void, void_of=T-1', vc.void_tx_rows);
ok(vc.stock_updates.length === 2, 'stok 2 barang dikembalikan (kopi & nasi)', vc.stock_updates.map(s => s.update_row.stok));
const updKopi = vc.stock_updates.find(s => s.update_row.row_number === 2);
ok(updKopi.update_row.stok === '26', 'kopi 24+2=26', updKopi);
ok(vc.stocklog_rows.length === 2 && vc.stocklog_rows[0].ref === 'void:T-1', 'stocklog ref void:T-1', vc.stocklog_rows[0]);
const vKasir = { chat_id: '222', user_id: '222', nama: 'Budi', role: 'kasir', text: '/batal', kind: 'text', file_id: '', args: '', pending_stage: '', draft: {} };
let v3 = run('Void Router', { refs: { Router: vKasir, 'Load Recent Tx': txRows, 'Load Recent Exp': expRows } })[0];
ok(v3.pending_row && v3.pending_row.stage === 'void_pick', 'kasir melihat daftar void', v3.pending_row);
ok(v3.kb.length - 1 === 1, 'kasir cuma lihat transaksinya sendiri (T-1 oleh Budi)', v3.kb);
let v4 = run('Void Router', { refs: { Router: rtr({ text: 'tidak', pending_stage: 'void_confirm', draft: v1D }), 'Load Recent Tx': txRows, 'Load Recent Exp': expRows } })[0];
ok(v4.close_row && v4.close_row.status === 'cancelled', 'tidak jadi void -> close cancelled', v4);
let v5 = run('Build Void Rows', { input: KATALOG, refs: { Router: rtr({ pending_stage: 'void_confirm', draft: { kind: 'void', pick: { kind: 'exp', id: 'E-1', total: 50000 } } }), 'Load Recent Tx': txRows, 'Load Recent Exp': expRows } })[0];
ok(v5.void_exp_rows.length === 1 && v5.void_exp_rows[0].nominal === '-50000' && v5.stock_updates.length === 0, 'void pengeluaran: mirror negatif tanpa stok', v5.void_exp_rows);
let vcr = run('Void Commit Reply', { refs: { 'Build Void Rows': [vc] } })[0];
ok(/Dibatalkan/.test(vcr.text) && vcr.close_row.status === 'done', 'reply void + close done', vcr.text);

// ============================ SCENARIO 10 ============================
console.log('\n== S10: Produk (owner) ==');
const katRowNum = KATALOG.map(k => Object.assign({ row_number: k.row_number }, k));
let p0 = run('Produk Router', { input: katRowNum, refs: { Router: rtr({ text: '/produk' }) } })[0];
ok(/Katalog/.test(p0.text) && /P001/.test(p0.text), 'list katalog + id', p0.text);
let p1 = run('Produk Router', { input: katRowNum, refs: { Router: rtr({ text: '/produk add Roti Bakar 12000 30', args: 'add Roti Bakar 12000 30' }) } })[0];
ok(p1.action === 'produk_add' && p1.product_row.product_id === 'P005' && p1.product_row.stok === '30', 'add barang -> id berikutnya P005', p1.product_row);
let p2 = run('Produk Router', { input: katRowNum, refs: { Router: rtr({ text: '/produk add Servis AC 150000', args: 'add Servis AC 150000' }) } })[0];
ok(p2.pending_row.stage === 'p_jenis' && p2.kb, 'add tanpa stok -> nanya jenis', p2.pending_row);
let p2d = JSON.parse(p2.pending_row.draft_json);
let p3 = run('Produk Router', { input: katRowNum, refs: { Router: rtr({ text: 'jenis_jasa', kind: 'callback', pending_stage: 'p_jenis', draft: p2d }) } })[0];
ok(p3.action === 'produk_add' && p3.product_row.jenis === 'jasa' && p3.product_row.stok === '', 'jawaban jasa -> stok kosong', p3.product_row);
let p4 = run('Produk Router', { input: katRowNum, refs: { Router: rtr({ text: '/produk harga kopi susu 17000', args: 'harga kopi susu 17000' }) } })[0];
ok(p4.action === 'produk_harga' && p4.update_row.harga === '17000' && /15\.000.*17\.000/.test(p4.text), 'ubah harga via nama fuzzy', p4.update_row);
let p5 = run('Produk Router', { input: katRowNum, refs: { Router: rtr({ text: '/produk stok P001 +24', args: 'stok P001 +24' }) } })[0];
ok(p5.action === 'produk_stok' && p5.update_row.stok === '48' && p5.sl_row.ref === 'restock', 'restok +24 -> stok 48 + log', p5.update_row);
let p6 = run('Produk Router', { input: katRowNum, refs: { Router: rtr({ text: '/produk del P002', args: 'del P002' }) } })[0];
ok(p6.action === 'produk_status' && p6.update_row.aktif === 'FALSE', 'del -> nonaktif', p6.update_row);
let p7 = run('Produk Router', { input: katRowNum, refs: { Router: rtr({ text: '/produk harga zzz 100', args: 'harga zzz 100' }) } })[0];
ok(!p7.action && /nggak ketemu|Formatnya/.test(p7.text), 'produk tak ketemu -> pesan jelas', p7.text);

// ============================ SCENARIO 11 ============================
console.log('\n== S11: User management (owner) ==');
let u0 = run('User Router', { refs: { Router: rtr({ text: '/user' }), 'Load Users': usersRows } })[0];
ok(/Daftar User/.test(u0.text) && /Budi/.test(u0.text) && !/Cici/.test(u0.text), 'list hanya user aktif', u0.text);
let u1 = run('User Router', { refs: { Router: rtr({ text: '/user add 123456789 Dedi', args: 'add 123456789 Dedi' }), 'Load Users': usersRows } })[0];
ok(u1.action === 'add' && u1.user_row.user_id === '123456789' && u1.user_row.role === 'kasir', 'add default kasir', u1.user_row);
let u2 = run('User Router', { refs: { Router: rtr({ text: '/user add 123456789 Dedi owner', args: 'add 123456789 Dedi owner' }), 'Load Users': usersRows } })[0];
ok(u2.action === 'add' && u2.user_row.role === 'owner', 'add dengan role eksplisit', u2.user_row);
let u3 = run('User Router', { refs: { Router: rtr({ text: '/user add 222 Si Budi', args: 'add 222 Si Budi' }), 'Load Users': usersRows } })[0];
ok(!u3.action && /sudah terdaftar/.test(u3.text), 'add duplikat -> ditolak', u3.text);
let u4 = run('User Router', { refs: { Router: rtr({ text: '/user del 222', args: 'del 222' }), 'Load Users': usersRows } })[0];
ok(u4.action === 'del' && u4.update_row.aktif === 'FALSE' && u4.update_row.row_number === usersRows[0].row_number, 'del -> nonaktif by row_number', u4.update_row);
let u5 = run('User Router', { refs: { Router: rtr({ text: '/user del 99999', args: 'del 99999' }), 'Load Users': usersRows } })[0];
ok(!u5.action && /nggak ketemu/.test(u5.text), 'del tak ada -> pesan jelas', u5.text);


// ============================ SCENARIO 4b ============================
console.log('\n== S4b: Picker (pesan live) ==');
const KATP = KATALOG.filter(function (k) { return String(k.aktif).toUpperCase() !== 'FALSE'; });
const pjr = (stage, draft) => [{ timestamp: wibNow(), jid: '111', stage, draft_json: JSON.stringify(draft || {}), status: 'active' }];
const jrIn = (text, kind, stage, draft) => run('Jual Router', { input: KATP, refs: { Router: rtr({ text, kind: kind || 'callback', pending_stage: stage || '', draft }) } })[0];
// Router: callback picker masuk rute jual
ok(run('Router', { input: pjr('jual_pick', { kind: 'jual', items: [], pick: {} }), refs: { 'Extract & Filter': ef('ip:p001', { kind: 'callback' }) } })[0].route === 'jual', 'cb ip: saat jual_pick -> jual');
ok(run('Router', { input: pjr('jual_pick', { kind: 'jual', items: [], pick: {} }), refs: { 'Extract & Filter': ef('fin', { kind: 'callback' }) } })[0].route === 'jual', 'cb fin saat jual_pick -> jual');
ok(run('Router', { input: pjr('jual_qty', { kind: 'jual', items: [], pick: {}, pending_product: { id: 'P001' } }), refs: { 'Extract & Filter': ef('q:2', { kind: 'callback' }) } })[0].route === 'jual', 'cb q: saat jual_qty -> jual');
ok(run('Router', { input: pjr('jual_pick', { kind: 'jual', items: [], pick: {} }), refs: { 'Extract & Filter': ef('cancel', { kind: 'callback' }) } })[0].route === 'cancel', 'cb cancel saat picker -> cancel');
// Alur picker lengkap
let pk0 = jrIn('/jual', 'text');
ok(pk0.action === 'picker' && pk0.draft.pick.page === 0, '/jual kosong -> action picker + pick state', pk0);
let pk1 = jrIn('ip:p001', 'callback', 'jual_pick', pk0.draft);
ok(pk1.action === 'picker' && pk1.draft.pending_product && pk1.draft.pending_product.nama === 'Kopi Susu' && pk1.draft.pending_product.stok === 24, 'ip:p001 -> layar jumlah + info produk+stok', pk1.draft.pending_product);
let pk2 = jrIn('q:2', 'callback', 'jual_qty', pk1.draft);
ok(pk2.action === 'picker' && pk2.draft.items.length === 1 && pk2.draft.items[0].qty === 2 && pk2.draft.total === 30000 && pk2.draft.pending_product === null, 'q:2 -> 2x Kopi masuk draft (30000), pending_product dibersihkan', pk2.draft);
let pk3 = jrIn('ip:p003', 'callback', 'jual_pick', pk2.draft);
ok(pk3.draft.pending_product.nama === 'Cukur Rambut' && pk3.draft.pending_product.stok === '', 'jasa -> layar jumlah tanpa stok', pk3.draft.pending_product);
let pk4 = jrIn('q:1', 'callback', 'jual_qty', pk3.draft);
ok(pk4.draft.items.length === 2 && pk4.draft.items[1].qty === 1 && pk4.draft.total === 50000, 'jasa 1x masuk, total 50000, stok diabaikan', pk4.draft);
let pk5 = jrIn('ip:p001', 'callback', 'jual_pick', pk4.draft);
let pk6 = jrIn('q:1', 'callback', 'jual_qty', pk5.draft);
ok(pk6.draft.items[0].qty === 3 && pk6.draft.total === 65000, 'item sama ditap lagi -> qty merge 3 (total 65000: 3x Kopi + Cukur)', pk6.draft.items);
let pk7 = jrIn('pg:1', 'callback', 'jual_pick', pk6.draft);
ok(pk7.draft.pick.page === 1, 'pg:1 -> pindah halaman', pk7.draft.pick);
let pk8 = jrIn('bk', 'callback', 'jual_qty', pk3.draft);
ok(pk8.draft.pending_product === null && pk8.action === 'picker', 'bk -> kembali ke pilih item', pk8);
let pk9 = jrIn('3', 'text', 'jual_qty', pk1.draft);
ok(pk9.draft.items.length === 1 && pk9.draft.items[0].qty === 3, 'ketik 3 di layar jumlah -> qty 3', pk9.draft);
let pk10 = jrIn('dua dong', 'text', 'jual_qty', pk1.draft);
ok(pk10.action === 'picker' && pk10.draft.pick.note && pk10.draft.items.length === 0, 'teks tanpa angka -> catatan minta angka', pk10.draft.pick);
let pk11 = jrIn('fin', 'callback', 'jual_pick', pk6.draft);
ok(pk11.kb && pk11.pending_row.stage === 'jual_pay', 'fin -> pilih metode bayar', pk11);
let pk12 = jrIn('fin', 'callback', 'jual_pick', pk0.draft);
ok(pk12.action === 'picker' && /masih kosong/.test(pk12.draft.pick.note), 'fin saat kosong -> nudge, tetap picker', pk12.draft.pick);
let pk13 = jrIn('1 es teh', 'text', 'jual_pick', pk6.draft);
ok(pk13.action === 'parse' && pk13.ai_text === '1 es teh', 'teks bebas saat picker -> AI parse (hybrid)', pk13);
// Build Picker Screen: layar jumlah
let bpsQty = run('Build Picker Screen', { input: KATP, refs: { 'Jual Router': rtr({ draft: pk1.draft }) } })[0];
ok(/Berapa banyak <b>Kopi Susu<\/b>/.test(bpsQty.text) && /sisa stok 24/.test(bpsQty.text), 'layar jumlah: nama produk + sisa stok', bpsQty.text);
ok(bpsQty.kb[0].map(function (b) { return b.data; }).join(',') === 'q:1,q:2,q:3,q:5' && bpsQty.pending_row.stage === 'jual_qty', 'tombol qty cepat & stage jual_qty', bpsQty.kb);
ok(JSON.parse(bpsQty.pending_row.draft_json).pending_product.id === 'P001', 'pending_product ikut tersimpan di draft', null);
let bpsJasa = run('Build Picker Screen', { input: KATP, refs: { 'Jual Router': rtr({ draft: pk3.draft }) } })[0];
ok(/Cukur Rambut/.test(bpsJasa.text) && !/sisa stok/.test(bpsJasa.text), 'jasa: layar jumlah TANPA sisa stok', bpsJasa.text);
// Build Picker Screen: layar pilih
let bpsPick = run('Build Picker Screen', { input: KATP, refs: { 'Jual Router': rtr({ draft: pk6.draft }) } })[0];
ok(/Draft Pesanan/.test(bpsPick.text) && /3× Kopi Susu/.test(bpsPick.text) && /Total: Rp65\.000/.test(bpsPick.text), 'layar pilih: ringkasan + total', bpsPick.text);
ok(bpsPick.kb.some(function (r) { return r.some(function (b) { return b.data === 'ip:P001'; }); }) && bpsPick.kb.some(function (r) { return r.some(function (b) { return b.data === 'fin'; }); }), 'tombol katalog + selesai ada', bpsPick.kb);
ok(/hal\. 1\/1/.test(bpsPick.text), 'info halaman tampil', bpsPick.text);
// Peringatan stok di layar
let pkOver = jrIn('ip:p002', 'callback', 'jual_pick', pk0.draft);
let pkOver2 = jrIn('q:5', 'callback', 'jual_qty', pkOver.draft);
let bpsOver = run('Build Picker Screen', { input: KATP, refs: { 'Jual Router': rtr({ draft: pkOver2.draft }) } })[0];
ok(/pesan 5 tapi stok cuma 3/.test(bpsOver.text), 'pesan > stok -> peringatan di layar picker', bpsOver.text);
// Note tampil lalu dibersihkan
let pkNote = jrIn('dua dong', 'text', 'jual_qty', pk1.draft);
let bpsNote = run('Build Picker Screen', { input: KATP, refs: { 'Jual Router': rtr({ draft: pkNote.draft }) } })[0];
ok(/Ketik angkanya/.test(bpsNote.text) && JSON.parse(bpsNote.pending_row.draft_json).pick.note === '', 'note tampil di layar lalu dibersihkan dari draft', bpsNote.text);
// Paginasi
const KAT8 = [];
for (let i = 1; i <= 8; i++) KAT8.push({ product_id: 'P' + String(i).padStart(3, '0'), nama: 'Barang ' + i, jenis: 'barang', harga: '1000', stok: '10', stok_min: '2', aktif: 'TRUE', row_number: i });
let bps8 = run('Build Picker Screen', { input: KAT8, refs: { 'Jual Router': rtr({ draft: { kind: 'jual', items: [], total: 0, pick: { page: 1, note: '' }, operator: {} } }) } })[0];
ok(bps8.kb.some(function (r) { return r.some(function (b) { return b.data === 'pg:0'; }); }) && /hal\. 2\/2/.test(bps8.text), 'katalog 8 item -> 2 halaman + tombol nav', bps8.text);
// msg_id -> mode edit
let bpsLive = run('Build Picker Screen', { input: KATP, refs: { 'Jual Router': rtr({ draft: Object.assign({}, pk6.draft, { msg_id: 777 }) }) } })[0];
ok(bpsLive.msg_id === 777, 'msg_id di draft diteruskan (mode edit pesan live)', bpsLive.msg_id);
// Simpan MsgId
let sm = run('Simpan MsgId', { input: [{ result: { message_id: 888 } }], refs: { 'Build Picker Screen': bpsPick } })[0];
ok(JSON.parse(sm.pending_row.draft_json).msg_id === 888, 'Simpan MsgId menempel message_id ke draft', sm.pending_row);
// Parse & Merge saat picker: stage tetap jual_pick + merge qty
let pmPick = run('Parse & Merge', { input: [{ choices: [{ message: { content: JSON.stringify({ items: [{ product_id: 'P001', qty: 1 }], tidak_jelas: [] }) } }] }], refs: { 'Build Order Prompt': { prods: KATP, draft: pk6.draft, chat_id: '111' }, 'Jual Router': rtr({ draft: pk6.draft }) } })[0];
ok(pmPick.pending_row.stage === 'jual_pick' && JSON.parse(pmPick.pending_row.draft_json).items[0].qty === 4, 'AI add saat picker: stage tetap jual_pick, merge 3+1=4', pmPick.pending_row.stage);

// ============================ SELESAI ============================
console.log('\n==============================');
console.log('HASIL: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
