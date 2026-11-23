#!/bin/bash
# Lokale preview van de nieuwste (nog niet gelanceerde) wijzigingen.
# Gebruik:  ./preview.sh   → opent http://localhost:8765
# Haalt elke 10 seconden de nieuwste wijzigingen op; ververs de pagina (Cmd+R) om ze te zien.
# Verandert de preview-server zelf, dan herstart die vanzelf.
# Stoppen: Ctrl+C. Je echte Mac-app en je trades worden niet aangeraakt.
set -e
cd "$(dirname "$0")"
BRANCH="claude/keen-gates-4sbkc3"
PORT=8765

echo "Preview-branch ophalen ($BRANCH)…"
git fetch -q origin "$BRANCH"
git checkout -q "$BRANCH"
git pull -q --ff-only origin "$BRANCH"

# Op de achtergrond nieuwe wijzigingen ophalen zolang de preview draait.
( while true; do sleep 10; git pull -q --ff-only origin "$BRANCH" >/dev/null 2>&1 || true; done ) &
PULLER=$!
SERVER=""
trap 'kill $PULLER $SERVER 2>/dev/null; echo; echo "Preview gestopt."; exit 0' INT TERM EXIT

echo "Preview draait op http://localhost:$PORT  (stoppen met Ctrl+C)"
( sleep 1; open "http://localhost:$PORT" 2>/dev/null || true ) &

# Server starten en herstarten zodra preview-server.py verandert.
stamp() { git hash-object preview-server.py 2>/dev/null; }
while true; do
  CUR=$(stamp)
  python3 preview-server.py "$PORT" &
  SERVER=$!
  while kill -0 $SERVER 2>/dev/null && [ "$(stamp)" = "$CUR" ]; do sleep 2; done
  kill $SERVER 2>/dev/null || true
  wait $SERVER 2>/dev/null || true
  echo "Preview-server bijgewerkt, herstart…"
  sleep 1
done
