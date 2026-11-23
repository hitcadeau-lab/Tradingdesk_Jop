# Tradingdesk: werkafspraken

Webapp (`index.html`, `css/`, `js/`) en Mac-app (`desktop/`, Electron) voor range trading:
Markt, Trades (met de Trade Entry Checklist), Portfolio, Leerschool en Instellingen.
De methode volgt *Range Trading 101* en *Technical Analysis 101*. Communiceer met de gebruiker in het Nederlands.

## Werkwijze: eerst preview, pas op "push" live

1. Alle wijzigingen gaan eerst naar de **preview-branch** `claude/keen-gates-4sbkc3`. Push daar zonder te vragen.
2. De gebruiker bekijkt ze lokaal met `./preview.sh` (http://localhost:8765, haalt elke 10 s de nieuwste versie op; `preview-server.py` geeft koersdata van Kraken en Yahoo door, omdat de browser die niet zelf mag lezen). Zeg na elke push dat hij de pagina kan verversen (Cmd+R).
3. **Pas als de gebruiker "push" zegt**, gaat de wijziging naar `main`:
   - Verhoog de versie op beide plekken, gelijk: `js/version.js` en `desktop/package.json` (patch voor kleine wijzigingen, minor voor nieuwe functies).
   - Verhoog `tradingdesk.shellVersion` in `desktop/package.json` alleen als `desktop/main.js` of `desktop/preload.js` is veranderd. De gebruiker moet dan een nieuwe `.dmg` installeren; vertel dat erbij.
   - Voeg de preview-branch samen in `main` en push `main`. De GitHub Action *Release Mac-app* bouwt en publiceert de release, waarna de Mac-app de update meldt.
   - Controleer of de release-build slaagt en meld het resultaat.
4. Nooit naar `main` pushen of een release maken zonder dat de gebruiker "push" heeft gezegd.

## Controleren voor elke push

- `npm --prefix desktop test`: tests voor opslag en updates.
- `npm --prefix desktop run copy-web`: controleert dat de twee versienummers gelijk zijn.
- Open de webapp in een browser (Playwright) en controleer de gewijzigde pagina's zonder console-fouten. Voor de Leerschool: genereer veel opdrachten per template, met precies één goed antwoord en een uitleg bij elke optie.

## Opslag en data

- Mac-app: `iCloud Drive/Tradingdesk/tradingdesk-data.json` (of de map die in Instellingen is gekozen), met dagelijkse back-ups. In de browser en de preview: localStorage.
- Trades van de gebruiker komen nooit in de repository.
- Kraken API-keys: alleen via het formulier in de Mac-app, versleuteld met Electron safeStorage (macOS-sleutelhanger) in de app-map, nooit in de webapp, iCloud-data, back-ups, de chat of de repository. Alleen lees-endpoints (`desktop/lib/kraken-auth.js`); nooit keys met opnamerechten.
