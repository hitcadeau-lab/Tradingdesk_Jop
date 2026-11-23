#!/bin/bash
# Lokale preview van de nieuwste (nog niet gelanceerde) wijzigingen.
# Gebruik:  ./preview.sh   → opent http://localhost:8765
# Haalt elke 10 seconden de nieuwste wijzigingen op; ververs de pagina (Cmd+R) om ze te zien.
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
trap 'kill $PULLER 2>/dev/null; echo; echo "Preview gestopt."' EXIT

echo "Preview draait op http://localhost:$PORT  (stoppen met Ctrl+C)"
( sleep 1; open "http://localhost:$PORT" ) &
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1
