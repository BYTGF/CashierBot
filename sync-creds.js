#!/usr/bin/env node
// sync-creds — inject/scrub secret di node Config workflow kasir-bot.
// Nilai asli TIDAK pernah di-commit: disimpan di creds.local.json (gitignored).
//   node sync-creds.js inject  → isi nilai asli dari creds.local.json ke workflow (untuk deploy/import)
//   node sync-creds.js scrub   → ganti nilai di workflow jadi placeholder (WAJIB sebelum commit/push)
//   node sync-creds.js status  → tampilkan kondisi (nilai di-mask)
//
// creds.local.json format:
//   { "bot_token": "123456:ABC...", "openrouter_api_key": "sk-or-v1-..." }
//
// CATATAN: bot_token juga harus diisi manual di .env (TELEGRAM_BOT_TOKEN)
// untuk container tg-poller — dua tempat, karena poller jalan di luar n8n.
const fs = require('fs');
const CREDS = 'creds.local.json';
const FIELDS = [
  { key: 'bot_token', placeholder: 'ISI_TOKEN_BOT_DI_SINI' },
  { key: 'openrouter_api_key', placeholder: 'ISI_API_KEY_OPENROUTER_DI_SINI' },
];
const FILES = ['workflow/kasir-bot-v1.json'];
const cmd = process.argv[2] || 'status';

function configs(file) {
  const w = JSON.parse(fs.readFileSync(file, 'utf8'));
  const nodes = w.nodes.filter(n => /^Config/.test(n.name));
  return { w, nodes, file };
}

if (cmd === 'status') {
  for (const f of FILES) {
    const { nodes } = configs(f);
    for (const n of nodes) {
      for (const fd of FIELDS) {
        const a = n.parameters.assignments.assignments.find(x => x.name === fd.key);
        const v = a ? String(a.value) : '(tidak ada field)';
        const masked = v === fd.placeholder || !v ? v : v.slice(0, 6) + '…(REAL)';
        console.log(`${f} :: ${n.name}.${fd.key} = ${masked}`);
      }
    }
  }
  console.log('creds.local.json:', fs.existsSync(CREDS) ? 'ada (gitignored)' : 'TIDAK ADA — buat dulu: {"bot_token":"...","openrouter_api_key":"..."}');
  process.exit(0);
}

const creds = JSON.parse(fs.readFileSync(CREDS, 'utf8'));
for (const fd of FIELDS) {
  if (cmd === 'inject' && !creds[fd.key]) throw new Error(`creds.local.json tidak berisi ${fd.key}`);
}
for (const f of FILES) {
  const { w, nodes } = configs(f);
  let n = 0;
  for (const node of nodes) {
    for (const a of node.parameters.assignments.assignments) {
      const fd = FIELDS.find(x => x.name === a.name || x.key === a.name);
      if (!fd) continue;
      const target = cmd === 'inject' ? creds[fd.key] : fd.placeholder;
      if (a.value !== target) { a.value = target; n++; }
    }
  }
  if (cmd === 'scrub') {
    for (const fd of FIELDS) {
      if (creds[fd.key] && JSON.stringify(w).includes(creds[fd.key])) {
        throw new Error(`${f}: ${fd.key} masih ada di luar field Config — scrub manual!`);
      }
    }
  }
  fs.writeFileSync(f, JSON.stringify(w, null, 2));
  console.log(`${cmd} ${f}: ${n} field diubah`);
}
