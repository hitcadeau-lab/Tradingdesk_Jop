# Tradingdesk

Een trading-app in de browser voor **range trading**: markt bekijken, trades plaatsen met je eigen checklist, je portfolio volgen en oefenen in de Leerschool.

De methode komt uit *Technical Analysis 101* en *Range Trading 101*. De checklist komt uit de *Trade Sheet* (PDF), en de portfolioberekeningen uit het *TradingWizard Journal* (Excel).

## Mac-app (aanbevolen)

1. Download `Tradingdesk-<versie>-mac.dmg` onder **Releases** van deze repository.
2. Open de `.dmg` en sleep **Tradingdesk** naar **Programma's**.
3. De eerste keer opent macOS de app niet, omdat hij niet door Apple ondertekend is. Kies één van twee manieren:
   - Ga naar **Systeeminstellingen → Privacy en beveiliging**, scroll naar beneden en klik op **Open toch**.
   - Of voer dit uit in de terminal: `xattr -cr /Applications/Tradingdesk.app`

**Opslag:** alles staat in `iCloud Drive/Tradingdesk/tradingdesk-data.json`, met elke dag een back-up in `iCloud Drive/Tradingdesk/backups/` (de laatste 30). Staat iCloud Drive uit, dan kiest de app `Documenten/Tradingdesk/`. Je ziet het bestand via **Portfolio → App & opslag → Toon in Finder**.

**Updates:** de app kijkt bij het starten of er een nieuwe versie is. Bij een update van de app-inhoud verschijnt bovenaan **Installeer update**: één klik, en de app herlaadt met de nieuwe versie. Je data blijft staan. Alleen als de app-schil zelf verandert, vraagt de app je om een nieuwe `.dmg` te downloaden.

**Trades overzetten vanuit de browserversie:** maak in de browser een back-up (**Portfolio → Back-up maken**) en zet die in de app terug met **Portfolio → Back-up terugzetten**.

### Hoe een update ontstaat (voor ontwikkeling)

1. Pas de webapp aan (`index.html`, `css/`, `js/`).
2. Verhoog de versie op twee plekken: `js/version.js` en `desktop/package.json` (bijv. 1.0.0 → 1.0.1).
3. Push. De GitHub Action *Release Mac-app* bouwt de `.dmg`, de web-bundel en `latest.json`, en publiceert een release.
4. Verhoog `tradingdesk.shellVersion` in `desktop/package.json` alleen als `main.js` of `preload.js` verandert. Dan installeer je een nieuwe `.dmg`.

De app haalt updates op via de openbare GitHub-API. Daarvoor moet de repository **openbaar** zijn. Je trades staan nooit op GitHub.

Lokaal starten (met Node.js): `cd desktop && npm install && npm start`. Tests: `npm test`.

## Browserversie

Open `index.html` in Safari of Chrome. Je hebt geen installatie of account nodig, wel internet voor de grafieken van TradingView.

> In de browser worden je trades **alleen in die browser** bewaard (localStorage). Maak regelmatig een back-up via **Portfolio → Back-up maken**.

## Onderdelen

| Tab | Wat |
|---|---|
| **Markt** | Watchlist met crypto en aandelen, een TradingView-grafiek, technische analyse, je eigen trades op dat ticker en een knop voor een nieuwe trade. |
| **Trades** | Alle trades, met filters. Een nieuwe trade bevat de **Trade Entry Checklist** (8 checks, groen of rood), het trade-type, de **Range** (timeframe, high en low, de mid automatisch, de trigger), entry, SL, TP1 tot TP3 met automatische R/R en positiegrootte, een trade drawing (screenshot) en het resultaat. Elke trade is klikbaar en laat terug zien wat je hebt ingevuld. |
| **Portfolio** | Het Performance Dashboard: saldo, PnL, winrate, expectancy, profit factor, drawdown, plan adherence. Verder de equity curve (klikbare punten), open posities, de resultaten per pair, het journal (klikbare rijen) en de compound projection. Export naar Excel (CSV) en back-up of terugzetten. |
| **Leerschool** | Oneindig veel multiple-choice opdrachten met gegenereerde grafieken: ranges tekenen, de mid, deviaties en swing failures, reclaim en retest, stops en targets, setup types, technische-analyse-basis (candles, S/R, trendlijnen, structuur, patronen, RSI), risk en R:R, en checklist-scenario's. Groen is goed, rood is fout, en bij elke optie staat de uitleg. |

## Berekeningen

- **R per target** = (TP − entry) / (entry − SL). **Total R/R** = R tot het verste target.
- **Risico** = saldo × risico%. **Positiegrootte** = risico / |entry − SL|.
- **Voorgestelde PnL**: Stop Loss = −1R, TP1 + BE = 50% × R(TP1), TP1 + TP2 = 50% × R(TP1) + 50% × R(TP2).
- **Mid range** = (range high + range low) / 2 (Fib 0 / 0,5 / 1).
- **Winrate** = (TP1 + TP2 en TP1 + BE) / (die twee + Stop Loss), net als in de Excel.

Geen beleggingsadvies.
