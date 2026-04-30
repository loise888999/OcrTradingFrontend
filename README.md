# OCR Trading Companion Frontend v8 Full

This full frontend includes the latest **Pending OCR Trade Goods** feature.

## Included

- Pending OCR trade-good suggestions panel in Trading Options.
- Hide/show toggle for the pending suggestions panel.
- Accept pending OCR item as a new trade good.
- Dismiss pending OCR item.
- Trade Finder and Search Results side-by-side.
- CSV import/export.
- Add trade good panel at bottom.
- Type autocomplete from existing trade-good types.
- Case-insensitive autocomplete for city and goods.
- Existing map features.

## Backend requirement

This frontend expects the backend endpoints:

```text
GET  /api/pending-trade-goods
POST /api/pending-trade-goods/{id}/accept
POST /api/pending-trade-goods/{id}/dismiss
```

## Run

```bash
npm install
npm run dev
```

Default backend:

```text
https://localhost:5001
```

If needed, create `.env`:

```text
VITE_API_BASE_URL=https://localhost:5001
```
