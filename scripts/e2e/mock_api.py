"""API falsa pro teste de ponta a ponta (scripts/e2e/run.ps1).

Fala o formato Chat Completions em http://127.0.0.1:<porta>/v1 e devolve
`E2E[<texto recebido>]`, então o teste sabe exatamente o que o app enviou.

  POST /v1/chat/completions   → responde (depois de `delay` segundos)
  POST /config {"delay": 1.5} → muda o atraso das próximas respostas
  GET  /count                 → quantos pedidos de refino chegaram
"""
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {"delay": 0.0, "count": 0}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send(200, {"count": STATE["count"], "delay": STATE["delay"]})

    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        data = json.loads(raw or b"{}")
        if self.path.rstrip("/") == "/config":
            STATE["delay"] = float(data.get("delay", 0))
            return self._send(200, {"ok": True})
        STATE["count"] += 1
        users = [m.get("content", "") for m in data.get("messages", []) if m.get("role") == "user"]
        time.sleep(STATE["delay"])
        self._send(200, {
            "choices": [{"message": {"role": "assistant", "content": f"E2E[{users[-1] if users else ''}]"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
        })

    def log_message(self, *_):  # silencioso
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
