# Tradingdesk

Een trading-app in de browser voor **range trading**: markt bekijken, trades plaatsen met je eigen checklist, je portfolio volgen en oefenen in de Leerschool.

De methode komt uit *Technical Analysis 101* en *Range Trading 101*. De checklist komt uit de *Trade Sheet* (PDF), en de portfolioberekeningen uit het *TradingWizard Journal* (Excel).

## Gebruiken

Open `index.html` in Safari of Chrome. Je hebt geen installatie of account nodig, wel internet voor de grafieken van TradingView.

> Je trades worden **alleen in deze browser** bewaard (localStorage). Maak regelmatig een back-up via **Portfolio → Back-up maken**.

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
