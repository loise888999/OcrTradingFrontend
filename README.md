# OCR Trading Companion Frontend

React/Vite frontend for the OCR Trading Companion app.

This app connects to the OCR Trading Backend and gives the user a visual interface for:

- starting/stopping OCR
- setting OCR zones
- viewing current city and coordinate OCR results
- viewing a world/map position history
- searching trade-good prices
- finding where to buy or sell trade goods
- finding profitable trade routes
- adding missing trade goods to the CSV catalog
- reviewing OCR-detected unknown trade goods

## Main features

### OCR status and controls

The frontend shows whether the backend is connected and whether OCR is running.

From the top status bar, the user can:

- start OCR
- stop OCR
- refresh backend data
- see the latest detected city
- see which backend URL is being used

### Coordinate map

The map tab shows recent OCR coordinate captures on the world map.

Features include:

- current coordinate marker
- coordinate history
- map zoom/pan
- waypoint offset settings
- X/Y world size settings

### Buy / Sell price history

The price history tab shows all captured trade prices.

The user can:

- search by city, good, or trade type
- sort columns
- see price, multiplier, trade type, and capture time

### Trading Options

The Trading Options section contains three main tools.

#### Find trade goods

Helps the user find where to buy or sell a trade good.

The user can switch between:

- Find where to buy
- Find where to sell

Search options include:

- good name
- good type
- selected main regions
- closest to current OCR city
- closest to selected city
- cheapest/highest price
- closest result
- balanced result
- best potential profit
- show all offers or only best offer per good
- hide old prices

#### Deal helper

Helps the user find profitable trade routes.

Simple mode lets the user:

- select one or more main regions
- choose trade style
- find best single-good route
- find best multi-good route

Advanced mode lets the user control:

- item name
- item type
- buy regions
- sell regions
- minimum profit
- multi-good requirements
- result limits

#### Other

Used for catalog management.

The user can:

- manually add a missing trade good
- set name, type, and aliases
- check for similar existing goods
- accept OCR-detected unknown goods
- dismiss bad OCR candidates
- browse the current trade-good catalog

Aliases are useful for OCR mistakes.

Example:

```text
Diamond|Diamoncl|Dlamond
```

## Backend requirement

This frontend expects the OCR Trading Backend to be running.

Default backend URL:

```text
https://localhost:5001
```

The backend also exposes HTTP on:

```text
http://localhost:5000
```

The frontend uses HTTPS by default.

## Requirements

Install these before running the frontend:

- Node.js 18 or newer
- npm
- OCR Trading Backend running locally

Recommended:

```bash
node --version
npm --version
```

## Install

Clone or open the frontend repo, then run:

```bash
npm install
```

## Run in development mode

```bash
npm run dev
```

Vite will usually start on:

```text
http://localhost:5173
```

Open that URL in your browser.

## Configure backend URL

By default, the frontend uses:

```text
https://localhost:5001
```

To override it, create a `.env` file in the frontend root:

```text
VITE_API_BASE_URL=https://localhost:5001
```

For HTTP backend testing:

```text
VITE_API_BASE_URL=http://localhost:5000
```

Then restart the Vite dev server.

## Common startup order

Recommended order:

1. Start the backend.
2. Confirm backend health works:
   ```text
   https://localhost:5001/api/health
   ```
3. Start the frontend:
   ```bash
   npm run dev
   ```
4. Open:
   ```text
   http://localhost:5173
   ```

## Troubleshooting

### Backend shows offline

Check that the backend is running.

Open:

```text
https://localhost:5001/api/health
```

If the browser warns about the HTTPS certificate, trust the .NET development certificate from the backend machine:

```bash
dotnet dev-certs https --trust
```

Then restart the browser and backend.

### CORS error

The backend currently allows frontend development origins like:

```text
http://localhost:5173
http://localhost:5174
http://localhost:3000
```

Use one of those frontend ports, or update the backend CORS policy.

### Frontend cannot find new trade goods

After adding a trade good, refresh the frontend catalog or reload the page.

The Other tab calls the backend to update `Data/trade-goods.csv`.

### OCR zones are wrong

Go to:

```text
Trading Companion -> Settings
```

Then set:

- game window
- coordinate OCR zone
- city OCR zone
- price OCR zone

OCR zones are saved relative to the selected game window.

## Useful scripts

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Project structure

```text
src/
  App.jsx
  api.js
  components/
    TradingTab.jsx
    TradingGoodLookupTab.jsx
    TradingDealAdvancedTab.jsx
    TradingOtherTab.jsx
    WrappedCoordinateMap.jsx
    SortableTable.jsx
    MultiSelectChips.jsx
  styles.css

public/
  maps/
    world-map.png
```

## Notes for future improvements

Good future frontend improvements:

- add real distance calculation if city coordinates are added
- add route distance/time estimates
- add favorite goods
- add favorite routes
- add price freshness filters by exact hours
- add import/export for trade-good catalog
- add confirmation before accepting unknown OCR goods
- add edit/delete support for existing trade goods
