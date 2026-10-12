#!/usr/bin/env python3
# Telegram long-polling -> forward update ke n8n webhook (internal Docker).
# Stdlib saja: tidak perlu pip. Kebalikan webhook: bot yang menarik pesan,
# jadi tidak butuh domain/publik. Kalau nanti switch ke webhook (Cloudflare
# Tunnel), container ini cukup di-stop.
import json
import os
import time
import urllib.request

TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
N8N = os.environ.get("N8N_WEBHOOK_URL", "http://n8n:5678/webhook/kasir-bot-in")
API = f"https://api.telegram.org/bot{TOKEN}"


def post_json(url, payload, timeout):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def log(msg):
    print(f"[tg-poller] {msg}", flush=True)


log(f"polling dimulai -> {N8N}")
offset = 0
while True:
    try:
        res = post_json(f"{API}/getUpdates", {"timeout": 30, "offset": offset}, 45)
        for u in res.get("result", []):
            offset = u["update_id"] + 1
            msg = u.get("message") or {}
            chat = (msg.get("chat") or {}).get("id", "?")
            frm = (msg.get("from") or {}).get("id", "?")
            text = (msg.get("text") or "")[:60]
            log(f"update_id={u['update_id']} chat_id={chat} from={frm} text={text!r}")
            try:
                post_json(N8N, u, 10)
                log(f"update_id={u['update_id']} diteruskan ke n8n")
            except Exception as e:
                log(f"forward gagal (update_id={u['update_id']}): {e}")
    except Exception as e:
        log(f"error: {e} — coba lagi 3 detik")
        time.sleep(3)
