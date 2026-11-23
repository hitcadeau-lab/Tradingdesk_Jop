# Tradingdesk

Een trading-app in de browser voor **range trading**: markt bekijken, trades plaatsen met je eigen checklist, je portfolio volgen en oefenen in de Leerschool.

De methode komt uit *Technical Analysis 101* en *Range Trading 101*. De checklist komt uit de *Trade Sheet* (PDF), en de portfolioberekeningen uit het *TradingWizard Journal* (Excel).

## Mac-app (aanbevolen)

1. Download `Tradingdesk-<versie>-mac.dmg` onder **Releases** van deze repository.
2. Open de `.dmg` en sleep **Tradingdesk** naar **Programma's**.
3. De eerste keer opent macOS de app niet, omdat hij niet door Apple ondertekend is. Kies één van twee manieren:
   - Ga naar **Systeeminstellingen → Privacy en beveiliging**, scroll naar beneden en klik op **Open toch**.
   - Of voer dit uit in de terminal: `xattr -cr /Applications/Tradingdesk.app`

**Opslag:** alles staat in `iCloud Drive/Tradingdesk/tradingdesk-data.json`, met elke dag een back-up in `iCloud Drive/Tradingdesk/backups/` (de laatste 30). Staat iCloud Drive uit, dan kiest de app `Documenten/Tradingdesk/`. Via **Instellingen** (rechtsboven) zie je het bestand in Finder, kies je een andere map (je data verhuist mee) of ga je terug naar de standaardmap.

**Updates:** de app kijkt bij het starten of er een nieuwe versie is. Bij een update van de app-inhoud verschijnt bovenaan **Installeer update**: één klik, en de app herlaadt met de nieuwe versie. Je data blijft staan. Alleen als de app-schil zelf verandert, vraagt de app je om een nieuwe `.dmg` te downloaden.

**Trades overzetten vanuit de browserversie:** maak in de browser een back-up (**Instellingen → Back-up maken**) en zet die in de app terug met **Instellingen → Back-up terugzetten**.

### Hoe een update ontstaat

1. Wijzigingen komen eerst op de preview-branch (`claude/keen-gates-4sbkc3`).
2. Bekijk ze lokaal: `./preview.sh` opent `http://localhost:8765`. Het script haalt elke 10 seconden de nieuwste wijzigingen op; ververs de pagina om ze te zien. De preview gebruikt eigen browserdata, dus je echte app en trades worden niet aangeraakt.
3. Goedgekeurd? Dan gaan de wijzigingen naar `main`. Daar bouwt de GitHub Action *Release Mac-app* de officiële versie (`.dmg`, web-bundel en `latest.json`) en publiceert die, mits de versie in `desktop/package.json` en `js/version.js` hoger is dan de vorige release. Je app meldt daarna de update.
4. Verhoog `tradingdesk.shellVersion` in `desktop/package.json` alleen als `main.js` of `preload.js` verandert. Dan installeer je een nieuwe `.dmg`.

De app haalt updates op via de openbare GitHub-API. Daarvoor moet de repository **openbaar** zijn. Je trades staan nooit op GitHub.

Lokaal starten (met Node.js): `cd desktop && npm install && npm start`. Tests: `npm test`.

## Browserversie

Open `index.html` in Safari of Chrome. Je hebt geen installatie of account nodig, wel internet voor de grafieken van TradingView.

> In de browser worden je trades **alleen in die browser** bewaard (localStorage). Maak regelmatig een back-up via **Instellingen → Back-up maken**.

## Onderdelen

| Tab | Wat |
|---|---|
| **Markt** | Watchlist met crypto en aandelen, een TradingView-grafiek, technische analyse, je eigen trades op dat ticker en een knop voor een nieuwe trade. |
| **Trades** | Alle trades, met filters. Een nieuwe trade bevat de **Trade Entry Checklist** (8 checks, groen of rood), het trade-type, de **Range** (timeframe, high en low, de mid automatisch, de trigger), entry, SL, TP1 tot TP3 met automatische R/R en positiegrootte, een trade drawing (screenshot) en het resultaat. Elke trade is klikbaar en laat terug zien wat je hebt ingevuld. |
| **Portfolio** | Het Performance Dashboard: saldo, PnL, winrate, expectancy, profit factor, drawdown, plan adherence. Verder de equity curve (klikbare punten), open posities, de resultaten per pair, het journal (klikbare rijen) en de compound projection. Export naar Excel (CSV) en back-up of terugzetten. |
| **Notifier** | Scant de pairs en timeframes (15m, 1H, 4H) die je aanvinkt op range-setups volgens *Range Trading 101*: de range van begin tot einde van de laatste push of dump, en dan een deviatie (close buiten de range) gevolgd door een reclaim, met de retest als trigger. Je krijgt een melding als **"BTCUSDT – Long – 4H"**, ook als macOS-melding. Per melding zie je de range automatisch getekend (TradingView Lightweight Charts™) met entry, SL, TP1 (mid), TP2 en R:R, en met één klik plaats je de trade. Crypto-data komt van Kraken Futures (de perpetual waarop je handelt, bijv. PF_XBTUSD) in de Mac-app en de preview, met Binance als reserve als een pair niet op Kraken staat; aandelen-data (Yahoo Finance) werkt alleen in de Mac-app. In **Markt** schakel je de grafiek om naar **Range 1H / 4H**. |
| **Advise** | Klik bij een melding op **Get advise**. De setup wordt beoordeeld op de range-principes (structuur, mid sluit aan op S/R, trigger, diepte van de deviatie, swing failures, R:R, snelheid en verdeling, timeframe), met een eindoordeel: **Speelbaar**, **Twijfel** of **Niet spelen**. Vul een bedrag in (inzet of maximaal risico) en zie direct de uitkomst bij de SL, TP1 + BE, TP1 + TP2 en alles op TP2, inclusief kosten en de winrate die je minimaal nodig hebt. Verder: de actuele koers ten opzichte van je niveaus, notities, en **Trade plaatsen** met het bedrag omgerekend naar risico-%. |
| **Exchange (papier)** | Instellingen → Exchange → **Papier-modus**: bij een nieuwe trade een gesimuleerde order bij **Kraken Futures** (perpetuals) op echte koersen. Limit- of markt-entry, stop loss, 50% op TP1 met de stop naar break-even, en de rest op TP2. Met Kraken-fees, EU-retailmarges (max 10x) en een liquidatiecheck. Je journal wordt automatisch gesloten met de echte PnL. In het overzicht zie je of de order gevuld is en de live open PnL. Sluiten doe je via de positieknoppen (ook in het bewerkformulier), niet met de hand. Er gaat geen echt geld om. |
| **Leerschool** | Oneindig veel multiple-choice opdrachten met gegenereerde grafieken: ranges tekenen, de mid, deviaties en swing failures, reclaim en retest, stops en targets, setup types, technische-analyse-basis (candles, S/R, trendlijnen, structuur, patronen, RSI), risk en R:R, en checklist-scenario's. Groen is goed, rood is fout, en bij elke optie staat de uitleg. |

## Berekeningen

- **R per target** = (TP − entry) / (entry − SL). **Total R/R** = R tot het verste target.
- **Risico** = saldo × risico%. **Positiegrootte** = risico / |entry − SL|.
- **Voorgestelde PnL**: Stop Loss = −1R, TP1 + BE = 50% × R(TP1), TP1 + TP2 = 50% × R(TP1) + 50% × R(TP2).
- **Mid range** = (range high + range low) / 2 (Fib 0 / 0,5 / 1).
- **Winrate** = (TP1 + TP2 en TP1 + BE) / (die twee + Stop Loss), net als in de Excel.

Geen beleggingsadvies.
