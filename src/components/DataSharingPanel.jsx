import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  FileText,
  RefreshCw,
  Share2,
  Upload
} from 'lucide-react';
import { api } from '../api';

function ResultMessage({ tone = 'success', children }) {
  if (!children) return null;

  return (
    <div className={`${tone === 'danger' ? 'danger-info' : 'success-info'} mini-info`}>
      <strong>
        {tone === 'danger' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
        {children}
      </strong>
    </div>
  );
}

function ImportResultDetails({ result }) {
  if (!result) return null;

  const messages = result.messages || result.Messages || [];

  return (
    <div className="import-result-box">
      <div className="import-result-stats">
        <span>Imported: {result.imported ?? result.Imported ?? 0}</span>
        <span>Skipped: {result.skipped ?? result.Skipped ?? 0}</span>
        <span>Failed: {result.failed ?? result.Failed ?? 0}</span>
      </div>

      {messages.length > 0 && (
        <details>
          <summary>Show import messages</summary>
          <ul>
            {messages.slice(0, 50).map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
          {messages.length > 50 && (
            <p className="muted">Only showing first 50 messages.</p>
          )}
        </details>
      )}
    </div>
  );
}

export default function DataSharingPanel({ run, refreshPrices, refreshCatalogs }) {
  const [priceFile, setPriceFile] = useState(null);
  const [tradeGoodsFile, setTradeGoodsFile] = useState(null);

  const [priceResult, setPriceResult] = useState(null);
  const [tradeGoodsResult, setTradeGoodsResult] = useState(null);

  const [priceMessage, setPriceMessage] = useState('');
  const [priceError, setPriceError] = useState('');

  const [tradeGoodsMessage, setTradeGoodsMessage] = useState('');
  const [tradeGoodsError, setTradeGoodsError] = useState('');

  const [isImportingPrices, setIsImportingPrices] = useState(false);
  const [isImportingTradeGoods, setIsImportingTradeGoods] = useState(false);

  const importPrices = async () => {
    setPriceMessage('');
    setPriceError('');
    setPriceResult(null);

    if (!priceFile) {
      setPriceError('Choose a prices CSV file first.');
      return;
    }

    setIsImportingPrices(true);

    const result = await run(
      () => api.importPricesCsv(priceFile),
      'Could not import prices CSV'
    );

    if (result) {
      setPriceResult(result);
      setPriceMessage('Price data imported successfully.');

      if (refreshPrices) {
        await refreshPrices();
      }
    }

    setIsImportingPrices(false);
  };

  const importTradeGoods = async () => {
    setTradeGoodsMessage('');
    setTradeGoodsError('');
    setTradeGoodsResult(null);

    if (!tradeGoodsFile) {
      setTradeGoodsError('Choose a trade-goods CSV file first.');
      return;
    }

    setIsImportingTradeGoods(true);

    const result = await run(
      () => api.importTradeGoodsCsv(tradeGoodsFile),
      'Could not import trade-goods CSV'
    );

    if (result) {
      setTradeGoodsResult(result);
      setTradeGoodsMessage('Trade-good catalog imported successfully.');

      if (refreshCatalogs) {
        await refreshCatalogs();
      }
    }

    setIsImportingTradeGoods(false);
  };

  return (
    <section className="card">
      <div className="card-body data-sharing-panel">
        <div className="tab-header">
          <div>
            <h2>
              <Share2 size={22} /> Import / Export Sharing
            </h2>
            <p className="muted">
              Share discovered price data and trade-good catalog updates with other users.
            </p>
          </div>

          <span className="badge badge-info">
            CSV Sharing
          </span>
        </div>

        <div className="sharing-grid">
          <div className="sharing-card">
            <div className="sharing-card-header">
              <Database size={22} />
              <div>
                <h3>Price discovery data</h3>
                <p className="muted">
                  Export or import discovered buy/sell prices captured by OCR.
                </p>
              </div>
            </div>

            <div className="sharing-info-box">
              <strong>Use this when:</strong>
              <span>You want to share refreshed prices from your exploration with another user.</span>
            </div>

            <div className="deal-actions">
              <a
                className="button button-secondary"
                href={api.exportPricesUrl()}
                download="prices.csv"
              >
                <Download size={16} /> Export prices
              </a>
            </div>

            <label className="field">
              <span>Import prices CSV</span>
              <input
                className="input"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setPriceFile(event.target.files?.[0] || null)}
              />
              <small>
                This imports discovered price rows into the local database.
              </small>
            </label>

            <div className="deal-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={importPrices}
                disabled={isImportingPrices}
              >
                <Upload size={16} />
                {isImportingPrices ? 'Importing...' : 'Import prices'}
              </button>

              {refreshPrices && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={refreshPrices}
                >
                  <RefreshCw size={16} /> Refresh prices
                </button>
              )}
            </div>

            <ResultMessage tone="danger">{priceError}</ResultMessage>
            <ResultMessage>{priceMessage}</ResultMessage>
            <ImportResultDetails result={priceResult} />
          </div>

          <div className="sharing-card">
            <div className="sharing-card-header">
              <FileText size={22} />
              <div>
                <h3>Trade-good catalog</h3>
                <p className="muted">
                  Export or import known trade goods, types, and OCR aliases.
                </p>
              </div>
            </div>

            <div className="sharing-info-box">
              <strong>Use this when:</strong>
              <span>
                You found new trade goods or added OCR aliases and want another user to have the same catalog.
              </span>
            </div>

            <div className="deal-actions">
              <a
                className="button button-secondary"
                href={api.exportTradeGoodsUrl()}
                download="trade-goods.csv"
              >
                <Download size={16} /> Export trade goods
              </a>
            </div>

            <label className="field">
              <span>Import trade-goods CSV</span>
              <input
                className="input"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setTradeGoodsFile(event.target.files?.[0] || null)}
              />
              <small>
                Import mode is merge-only. Existing goods are skipped; new goods are added.
              </small>
            </label>

            <div className="deal-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={importTradeGoods}
                disabled={isImportingTradeGoods}
              >
                <Upload size={16} />
                {isImportingTradeGoods ? 'Importing...' : 'Import trade goods'}
              </button>

              {refreshCatalogs && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={refreshCatalogs}
                >
                  <RefreshCw size={16} /> Refresh catalog
                </button>
              )}
            </div>

            <ResultMessage tone="danger">{tradeGoodsError}</ResultMessage>
            <ResultMessage>{tradeGoodsMessage}</ResultMessage>
            <ImportResultDetails result={tradeGoodsResult} />
          </div>
        </div>

        <div className="sharing-note">
          <strong>Recommended sharing workflow</strong>
          <ol>
            <li>One user explores and refreshes prices with OCR.</li>
            <li>That user exports <b>prices.csv</b> and optionally <b>trade-goods.csv</b>.</li>
            <li>Another user imports those files in Settings.</li>
            <li>The second user refreshes the frontend and immediately has the shared price/catalog data.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}