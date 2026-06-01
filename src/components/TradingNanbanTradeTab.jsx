import React, { useEffect, useMemo, useState } from 'react';
import { Anchor, Eraser, Search, Sparkles, TrendingUp } from 'lucide-react';
import SortableTable from './SortableTable.jsx';

const NANBAN_SOURCE_URL = 'https://web.archive.org/web/20140214020456/http://uwodbmirror.ivyro.net/eg/main.php?id=85000037';

const emptyFilters = {
  tradeGood: '',
  sellArea: '',
  category: '',
  marketSignal: '',
  minPrice: 1,
  maxPrice: '',
  take: 1000
};

function clean(value) {
  return String(value || '').trim();
}

function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Unknown';
  return number.toLocaleString();
}

function countBy(rows, field) {
  const counts = new Map();

  for (const row of rows) {
    const value = clean(row[field]) || 'Unknown';
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function bestRow(rows) {
  return rows.reduce((best, row) => {
    if (!best || Number(row.price) > Number(best.price)) return row;
    return best;
  }, null);
}

function SignalPill({ value }) {
  const text = clean(value);

  if (!text) return <span className="muted">Normal</span>;

  return (
    <span className="special-craft-pill">
      {text}
    </span>
  );
}

function SummaryCard({ title, value, detail, icon }) {
  return (
    <section className="good-result-card special-craft-summary-card">
      <div className="good-result-title">
        {icon}
        <strong>{title}</strong>
      </div>
      <div className="good-result-body">
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </section>
  );
}

export default function TradingNanbanTradeTab({ run, api }) {
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [message, setMessage] = useState('');

  const best = useMemo(() => bestRow(rows), [rows]);
  const topArea = useMemo(() => countBy(rows, 'sellArea')[0] || null, [rows]);
  const topGood = useMemo(() => countBy(rows, 'tradeGood')[0] || null, [rows]);

  const update = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const load = async (nextFilters = filters) => {
    setLoading(true);
    setMessage('');

    const data = await run(
      () => api.getNanbanMarketRates(nextFilters),
      'Could not load Nanban market rates'
    );

    const nextRows = data || [];
    setRows(nextRows);
    setLastLoadedAt(new Date());
    setMessage(nextRows.length ? '' : 'No Nanban market rates matched these filters.');
    setLoading(false);
  };

  const clear = async () => {
    const nextFilters = { ...emptyFilters };
    setFilters(nextFilters);
    await load(nextFilters);
  };

  useEffect(() => {
    load({ ...emptyFilters });
    // Load default backend catalog once when tab opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    {
      key: 'price',
      label: 'Price',
      sortable: true,
      defaultDirection: 'desc',
      render: (row) => <strong>{formatPrice(row.price)}</strong>
    },
    {
      key: 'tradeGood',
      label: 'Trade Good',
      sortable: true,
      render: (row) => (
        <div className="special-craft-item-cell">
          <strong>{row.tradeGood}</strong>
          <span>{row.category}</span>
        </div>
      )
    },
    { key: 'sellArea', label: 'Sell Area', sortable: true },
    {
      key: 'marketSignal',
      label: 'Signal',
      sortable: true,
      render: (row) => <SignalPill value={row.marketSignal} />
    },
    { key: 'sourceMarket', label: 'Source Market', sortable: true }
  ];

  return (
    <div className="trade-subtab-stack">
      <section className="card">
        <div className="card-body find-good-helper">
          <div className="find-good-header">
            <div>
              <h2>
                <Anchor size={22} /> Nanban Trade
              </h2>
              <p className="muted">
                Search Japan Nanban market rates by trade good, sell area, category, price, or high-price signal.
              </p>
            </div>
          </div>

          <div className="special-craft-filter-grid">
            <label className="field">
              <span>Trade good</span>
              <input
                className="input"
                value={filters.tradeGood}
                onChange={(event) => update('tradeGood', event.target.value)}
                placeholder="Tanegashima Rifle, Saori..."
              />
            </label>

            <label className="field">
              <span>Sell area</span>
              <input
                className="input"
                value={filters.sellArea}
                onChange={(event) => update('sellArea', event.target.value)}
                placeholder="Turkey, Iberia..."
              />
            </label>

            <label className="field">
              <span>Category</span>
              <input
                className="input"
                value={filters.category}
                onChange={(event) => update('category', event.target.value)}
                placeholder="Firearms, Crafts..."
              />
            </label>

            <label className="field">
              <span>Signal</span>
              <select
                className="input"
                value={filters.marketSignal}
                onChange={(event) => update('marketSignal', event.target.value)}
              >
                <option value="">Any</option>
                <option value="High price">High price</option>
                <option value="Very high price">Very high price</option>
              </select>
            </label>

            <label className="field">
              <span>Minimum price</span>
              <input
                className="input"
                type="number"
                min="0"
                value={filters.minPrice}
                onChange={(event) => update('minPrice', event.target.value)}
              />
            </label>

            <label className="field">
              <span>Maximum price</span>
              <input
                className="input"
                type="number"
                min="0"
                value={filters.maxPrice}
                onChange={(event) => update('maxPrice', event.target.value)}
                placeholder="No max"
              />
            </label>

            <label className="field">
              <span>Limit</span>
              <input
                className="input"
                type="number"
                min="1"
                max="5000"
                value={filters.take}
                onChange={(event) => update('take', Number(event.target.value || 500))}
              />
            </label>
          </div>

          <div className="find-good-search-box">
            <div>
              <strong>Search summary</strong>
              <p className="muted">
                {lastLoadedAt
                  ? `Showing ${rows.length} Nanban rate${rows.length === 1 ? '' : 's'} loaded at ${lastLoadedAt.toLocaleString()}.`
                  : 'Loading Nanban rates from backend CSV.'}
              </p>
            </div>

            <div className="deal-actions">
              <button type="button" className="button button-primary big-action" onClick={() => load()} disabled={loading}>
                <Search size={17} />
                {loading ? 'Loading...' : 'Search'}
              </button>

              <button type="button" className="button button-secondary" onClick={clear} disabled={loading}>
                <Eraser size={16} /> Clear
              </button>
            </div>
          </div>

          {message && <p className="mini-info">{message}</p>}
        </div>
      </section>

      <section className="find-good-results-grid special-craft-summary-grid">
        <SummaryCard
          title="Matching rates"
          value={rows.length}
          detail="Japan Nanban sell-area rows"
          icon={<Sparkles size={18} />}
        />
        <SummaryCard
          title="Best price"
          value={best ? formatPrice(best.price) : 'Unknown'}
          detail={best ? `${best.tradeGood} to ${best.sellArea}` : 'No rows loaded'}
          icon={<TrendingUp size={18} />}
        />
        <SummaryCard
          title="Top area"
          value={topArea?.[0] || 'Unknown'}
          detail={topArea ? `${topArea[1]} matching rate${topArea[1] === 1 ? '' : 's'}` : 'No rows loaded'}
          icon={<Anchor size={18} />}
        />
        <SummaryCard
          title="Top good"
          value={topGood?.[0] || 'Unknown'}
          detail={topGood ? `${topGood[1]} matching area${topGood[1] === 1 ? '' : 's'}` : 'No rows loaded'}
          icon={<Sparkles size={18} />}
        />
      </section>

      <section className="card">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h3>Nanban market rates</h3>
              <p className="muted">Read-only backend catalog from <b>uwo_nanban_market_rates_japan.csv</b>.</p>
            </div>
          </div>

          <SortableTable
            columns={columns}
            rows={rows}
            emptyMessage="No Nanban market rates loaded yet."
            initialSortKey="price"
            initialDirection="desc"
          />

          <div className="special-craft-source-links">
            <a href={NANBAN_SOURCE_URL} target="_blank" rel="noreferrer">
              Archived UWO DB source
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
