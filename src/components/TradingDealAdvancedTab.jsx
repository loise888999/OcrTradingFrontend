import React, { useMemo, useState } from 'react';
import {
  Eraser,
  Layers,
  MapPin,
  PackageCheck,
  Route,
  Search,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import SortableTable from './SortableTable.jsx';
import MultiSelectChips from './MultiSelectChips.jsx';

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function sanitizeCityName(value) {
  if (!value) return '';
  return String(value).split('(')[0].split('\n')[0].split('\r')[0].trim();
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function ageText(value) {
  if (!value) return 'Unknown age';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown age';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function freshnessTone(value) {
  if (!value) return 'unknown';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';

  const diffHours = (Date.now() - date.getTime()) / 3600000;

  if (diffHours <= 2) return 'fresh';
  if (diffHours <= 24) return 'ok';
  return 'old';
}

function pickBestRoute(routes) {
  return [...routes].sort((a, b) => numberValue(b.profit) - numberValue(a.profit))[0] || null;
}

function pickBestMultiRoute(routes) {
  return [...routes].sort((a, b) => numberValue(b.totalProfit) - numberValue(a.totalProfit))[0] || null;
}

function pickHighestSellPrice(rows) {
  return [...rows]
    .filter((row) => row.tradeType === 'Sell')
    .sort((a, b) => numberValue(b.price) - numberValue(a.price))[0] || null;
}

function pickCheapestBuyPrice(rows) {
  return [...rows]
    .filter((row) => row.tradeType === 'Buy')
    .sort((a, b) => numberValue(a.price) - numberValue(b.price))[0] || null;
}

function getCurrentCityInfo(cities, latestCity) {
  const currentName = sanitizeCityName(latestCity?.city);
  if (!currentName) return { name: '', city: null };

  const city = cities.find(
    (item) => String(item.name || '').toLowerCase() === currentName.toLowerCase()
  );

  return { name: currentName, city: city || null };
}

const emptyFilters = {
  item: '',
  type: '',
  tradeType: 'Sell',
  mainRegion: '',
  subRegion: '',
  seaTradeRegion: '',
  minProfit: 1,
  routesPerItem: 25,
  take: 250,
  minProfitPerGood: 1,
  minTotalProfit: 1,
  minItems: 2
};

const helperModes = [
  {
    key: 'best',
    title: 'Find best deals',
    description: 'Load known prices, single routes, and multi-good routes together.'
  },
  {
    key: 'sell',
    title: 'I already have goods',
    description: 'Focus on where to sell for the highest known price.'
  },
  {
    key: 'buy',
    title: 'I want to buy goods',
    description: 'Focus on cheap buy prices and profitable destinations.'
  },
  {
    key: 'multi',
    title: 'Multi-good route',
    description: 'Find cities where several goods are profitable together.'
  }
];

function SummaryCard({ title, icon, children, empty }) {
  return (
    <div className={`deal-summary-card ${empty ? 'empty' : ''}`}>
      <div className="deal-summary-title">
        {icon}
        <strong>{title}</strong>
      </div>
      <div className="deal-summary-body">{children}</div>
    </div>
  );
}

function PriceAgeBadge({ value }) {
  const tone = freshnessTone(value);
  return <span className={`price-age price-age-${tone}`}>{ageText(value)}</span>;
}

export default function TradingDealAdvancedTab({ cities, tradeGoods, latestCity, run, api }) {
  const [activeMode, setActiveMode] = useState('best');
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [knownPrices, setKnownPrices] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [multiRoutes, setMultiRoutes] = useState([]);
  const [buyRegions, setBuyRegions] = useState([]);
  const [sellRegions, setSellRegions] = useState([]);
  const [isLoadingBestDeals, setIsLoadingBestDeals] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);

  const currentCityInfo = useMemo(
    () => getCurrentCityInfo(cities, latestCity),
    [cities, latestCity]
  );

  const options = useMemo(() => {
    const filtered = cities.filter((city) => !filters.mainRegion || city.mainRegion === filters.mainRegion);

    return {
      types: uniqueSorted(tradeGoods.map((good) => good.type)),
      mainRegions: uniqueSorted(cities.map((city) => city.mainRegion)),
      subRegions: uniqueSorted(filtered.map((city) => city.subRegion)),
      seaTradeRegions: uniqueSorted(cities.map((city) => city.seaTradeRegion)),
      allRegions: uniqueSorted(
        cities.flatMap((city) => [city.mainRegion, city.subRegion, city.seaTradeRegion])
      )
    };
  }, [cities, tradeGoods, filters.mainRegion]);

  const bestRoute = useMemo(() => pickBestRoute(routes), [routes]);
  const bestMultiRoute = useMemo(() => pickBestMultiRoute(multiRoutes), [multiRoutes]);
  const highestSellPrice = useMemo(() => pickHighestSellPrice(knownPrices), [knownPrices]);
  const cheapestBuyPrice = useMemo(() => pickCheapestBuyPrice(knownPrices), [knownPrices]);

  const update = (key, value) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === 'mainRegion') next.subRegion = '';
      return next;
    });
  };

  const updateMany = (values) => {
    setFilters((current) => ({ ...current, ...values }));
  };

  const applyMode = (mode) => {
    setActiveMode(mode);

    if (mode === 'sell') {
      updateMany({ tradeType: 'Sell' });
    }

    if (mode === 'buy') {
      updateMany({ tradeType: 'Buy' });
    }

    if (mode === 'multi') {
      updateMany({
        minProfitPerGood: Math.max(1, numberValue(filters.minProfitPerGood)),
        minTotalProfit: Math.max(1, numberValue(filters.minTotalProfit)),
        minItems: Math.max(2, numberValue(filters.minItems))
      });
    }
  };

  const clear = () => {
    setActiveMode('best');
    setFilters({ ...emptyFilters });
    setKnownPrices([]);
    setRoutes([]);
    setMultiRoutes([]);
    setBuyRegions([]);
    setSellRegions([]);
    setLastLoadedAt(null);
  };

  const useCurrentMainRegionAsBuyRegion = () => {
    const region = currentCityInfo.city?.mainRegion;
    if (!region) return;
    setBuyRegions((current) => uniqueSorted([...current, region]));
  };

  const useCurrentMainRegionAsSellRegion = () => {
    const region = currentCityInfo.city?.mainRegion;
    if (!region) return;
    setSellRegions((current) => uniqueSorted([...current, region]));
  };

  const useCurrentSubRegionAsBuyRegion = () => {
    const region = currentCityInfo.city?.subRegion;
    if (!region) return;
    setBuyRegions((current) => uniqueSorted([...current, region]));
  };

  const useCurrentSubRegionAsSellRegion = () => {
    const region = currentCityInfo.city?.subRegion;
    if (!region) return;
    setSellRegions((current) => uniqueSorted([...current, region]));
  };

  const loadKnownPrices = async () => {
    const data = await run(() => api.getKnownPrices(filters), 'Could not load known prices');
    if (data) {
      setKnownPrices(data);
      setLastLoadedAt(new Date());
    }
  };

  const findRoutes = async () => {
    const data = await run(
      () => api.getAdvancedRoutes({ ...filters, buyRegions, sellRegions }),
      'Could not find routes'
    );

    if (data) {
      setRoutes(data);
      setLastLoadedAt(new Date());
    }
  };

  const findMultiRoutes = async () => {
    const data = await run(
      () => api.getMultiGoodRoutes({ ...filters, buyRegions, sellRegions }),
      'Could not find multi-good routes'
    );

    if (data) {
      setMultiRoutes(data);
      setLastLoadedAt(new Date());
    }
  };

  const findBestDeals = async () => {
    setIsLoadingBestDeals(true);

    const [known, singleRoutes, multiGoodRoutes] = await Promise.all([
      run(() => api.getKnownPrices(filters), 'Could not load known prices'),
      run(
        () =>
          api.getAdvancedRoutes({
            ...filters,
            buyRegions,
            sellRegions
          }),
        'Could not find routes'
      ),
      run(
        () =>
          api.getMultiGoodRoutes({
            ...filters,
            buyRegions,
            sellRegions
          }),
        'Could not find multi-good routes'
      )
    ]);

    if (known) setKnownPrices(known);
    if (singleRoutes) setRoutes(singleRoutes);
    if (multiGoodRoutes) setMultiRoutes(multiGoodRoutes);

    setLastLoadedAt(new Date());
    setIsLoadingBestDeals(false);
  };

  const knownPriceColumns = [
    { key: 'city', label: 'City', sortable: true },
    { key: 'itemName', label: 'Good', sortable: true },
    { key: 'tradeGoodType', label: 'Type', sortable: true },
    { key: 'tradeType', label: 'Trade', sortable: true },
    { key: 'price', label: 'Price', sortable: true, defaultDirection: 'desc' },
    { key: 'mainRegion', label: 'Main Region', sortable: true },
    { key: 'subRegion', label: 'Sub Region', sortable: true },
    { key: 'seaTradeRegion', label: 'Sea Trade', sortable: true },
    {
      key: 'capturedAtUtc',
      label: 'Captured',
      sortable: true,
      render: (row) => (
        <span className="captured-cell">
          {formatDate(row.capturedAtUtc)}
          <PriceAgeBadge value={row.capturedAtUtc} />
        </span>
      )
    }
  ];

  const routeColumns = [
    { key: 'itemName', label: 'Good', sortable: true },
    { key: 'tradeGoodType', label: 'Type', sortable: true },
    { key: 'buyCity', label: 'Buy City', sortable: true },
    { key: 'buyPrice', label: 'Buy Price', sortable: true, defaultDirection: 'asc' },
    { key: 'sellCity', label: 'Sell City', sortable: true },
    { key: 'sellPrice', label: 'Sell Price', sortable: true, defaultDirection: 'desc' },
    {
      key: 'profit',
      label: 'Profit',
      sortable: true,
      defaultDirection: 'desc',
      render: (row) => <span className="good-text">+{row.profit}</span>
    }
  ];

  const multiColumns = [
    { key: 'buyCity', label: 'Buy City', sortable: true },
    { key: 'sellCity', label: 'Sell City', sortable: true },
    { key: 'itemCount', label: 'Goods', sortable: true, defaultDirection: 'desc' },
    {
      key: 'totalProfit',
      label: 'Total Profit',
      sortable: true,
      defaultDirection: 'desc',
      render: (row) => <span className="good-text">+{row.totalProfit}</span>
    },
    {
      key: 'items',
      label: 'Items',
      sortable: false,
      render: (row) => (
        <div className="multi-route-items">
          {(row.items || []).slice(0, 8).map((item) => (
            <span key={`${row.buyCity}-${row.sellCity}-${item.itemName}`} className="mini-profit-chip">
              {item.itemName} +{item.profit}
            </span>
          ))}
          {(row.items || []).length > 8 && (
            <span className="mini-profit-chip muted-chip">
              +{row.items.length - 8} more
            </span>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="trade-subtab-stack">
      <section className="card">
        <div className="card-body deal-helper">
          <div className="deal-helper-header">
            <div>
              <h2>
                <TrendingUp size={22} /> Deal helper
              </h2>
              <p className="muted">
                Use this like a trading assistant: pick what you want to do, then let it find the best known deals.
              </p>
            </div>

            <div className="current-city-box">
              <span className="current-city-chip">
                <MapPin size={16} />
                Current city: {currentCityInfo.name || 'Unknown'}
              </span>

              {currentCityInfo.city && (
                <small>
                  {currentCityInfo.city.mainRegion} / {currentCityInfo.city.subRegion} / {currentCityInfo.city.seaTradeRegion}
                </small>
              )}
            </div>
          </div>

          <div className="preset-grid">
            {helperModes.map((mode) => (
              <button
                key={mode.key}
                type="button"
                className={`preset-card ${activeMode === mode.key ? 'active' : ''}`}
                onClick={() => applyMode(mode.key)}
              >
                <strong>{mode.title}</strong>
                <small>{mode.description}</small>
              </button>
            ))}
          </div>

          <div className="deal-summary-grid">
            <SummaryCard title="Best single-good route" icon={<Route size={18} />} empty={!bestRoute}>
              {bestRoute ? (
                <>
                  <strong>{bestRoute.itemName}</strong>
                  <span>
                    Buy in <b>{bestRoute.buyCity}</b> for {bestRoute.buyPrice}
                  </span>
                  <span>
                    Sell in <b>{bestRoute.sellCity}</b> for {bestRoute.sellPrice}
                  </span>
                  <span className="summary-profit">Profit: +{bestRoute.profit}</span>
                  <small>
                    This is the highest single-good profit found with your current filters.
                  </small>
                </>
              ) : (
                <span>No single-good route loaded yet.</span>
              )}
            </SummaryCard>

            <SummaryCard title="Best multi-good route" icon={<Layers size={18} />} empty={!bestMultiRoute}>
              {bestMultiRoute ? (
                <>
                  <strong>
                    {bestMultiRoute.buyCity} → {bestMultiRoute.sellCity}
                  </strong>
                  <span>{bestMultiRoute.itemCount} profitable goods</span>
                  <span className="summary-profit">Total profit: +{bestMultiRoute.totalProfit}</span>
                  <small>
                    Best combined route when buying several goods in one city and selling them in another.
                  </small>
                </>
              ) : (
                <span>No multi-good route loaded yet.</span>
              )}
            </SummaryCard>

            <SummaryCard title="Highest known sell price" icon={<Sparkles size={18} />} empty={!highestSellPrice}>
              {highestSellPrice ? (
                <>
                  <strong>{highestSellPrice.itemName}</strong>
                  <span>
                    Sell in <b>{highestSellPrice.city}</b> for {highestSellPrice.price}
                  </span>
                  <span>
                    {highestSellPrice.mainRegion} / {highestSellPrice.subRegion}
                  </span>
                  <PriceAgeBadge value={highestSellPrice.capturedAtUtc} />
                </>
              ) : (
                <span>No sell price loaded yet.</span>
              )}
            </SummaryCard>

            <SummaryCard title="Cheapest known buy price" icon={<PackageCheck size={18} />} empty={!cheapestBuyPrice}>
              {cheapestBuyPrice ? (
                <>
                  <strong>{cheapestBuyPrice.itemName}</strong>
                  <span>
                    Buy in <b>{cheapestBuyPrice.city}</b> for {cheapestBuyPrice.price}
                  </span>
                  <span>
                    {cheapestBuyPrice.mainRegion} / {cheapestBuyPrice.subRegion}
                  </span>
                  <PriceAgeBadge value={cheapestBuyPrice.capturedAtUtc} />
                </>
              ) : (
                <span>No buy price loaded yet.</span>
              )}
            </SummaryCard>
          </div>

          <datalist id="deal-good-options">
            {tradeGoods.map((good) => (
              <option key={good.name} value={good.name}>
                {good.type}
              </option>
            ))}
          </datalist>

          <datalist id="deal-type-options">
            {options.types.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>

          <datalist id="deal-main-region-options">
            {options.mainRegions.map((region) => (
              <option key={region} value={region} />
            ))}
          </datalist>

          <datalist id="deal-sub-region-options">
            {options.subRegions.map((region) => (
              <option key={region} value={region} />
            ))}
          </datalist>

          <datalist id="deal-sea-region-options">
            {options.seaTradeRegions.map((region) => (
              <option key={region} value={region} />
            ))}
          </datalist>

          <div className="deal-filter-grid">
            <label className="field">
              <span>Good name</span>
              <input
                className="input"
                list="deal-good-options"
                value={filters.item}
                onChange={(e) => update('item', e.target.value)}
                placeholder="Optional good name..."
              />
            </label>

            <label className="field">
              <span>Good type</span>
              <input
                className="input"
                list="deal-type-options"
                value={filters.type}
                onChange={(e) => update('type', e.target.value)}
                placeholder="Optional type..."
              />
            </label>

            <label className="field">
              <span>Known price trade</span>
              <select
                className="input"
                value={filters.tradeType}
                onChange={(e) => update('tradeType', e.target.value)}
              >
                <option>Sell</option>
                <option>Buy</option>
                <option>Any</option>
              </select>
            </label>

            <label className="field">
              <span>Limit</span>
              <input
                className="input"
                type="number"
                min="1"
                max="1000"
                value={filters.take}
                onChange={(e) => update('take', Number(e.target.value || 250))}
              />
            </label>
          </div>

          <div className="region-panels">
            <div className="region-panel">
              <h4>Known price filter</h4>

              <input
                className="input"
                list="deal-main-region-options"
                placeholder="Main region"
                value={filters.mainRegion}
                onChange={(e) => update('mainRegion', e.target.value)}
              />

              <input
                className="input"
                list="deal-sub-region-options"
                placeholder="Sub region"
                value={filters.subRegion}
                onChange={(e) => update('subRegion', e.target.value)}
              />

              <input
                className="input"
                list="deal-sea-region-options"
                placeholder="Sea trade region"
                value={filters.seaTradeRegion}
                onChange={(e) => update('seaTradeRegion', e.target.value)}
              />
            </div>

            <div className="region-panel">
              <h4>Route profit rules</h4>

              <input
                className="input"
                type="number"
                min="1"
                placeholder="Min profit"
                value={filters.minProfit}
                onChange={(e) => update('minProfit', Number(e.target.value || 1))}
              />

              <input
                className="input"
                type="number"
                min="1"
                max="100"
                placeholder="Routes per good"
                value={filters.routesPerItem}
                onChange={(e) => update('routesPerItem', Number(e.target.value || 25))}
              />
            </div>

            <div className="region-panel">
              <h4>Multi-good route rules</h4>

              <input
                className="input"
                type="number"
                min="1"
                placeholder="Min profit per good"
                value={filters.minProfitPerGood}
                onChange={(e) => update('minProfitPerGood', Number(e.target.value || 1))}
              />

              <input
                className="input"
                type="number"
                min="1"
                placeholder="Min total profit"
                value={filters.minTotalProfit}
                onChange={(e) => update('minTotalProfit', Number(e.target.value || 1))}
              />

              <input
                className="input"
                type="number"
                min="2"
                placeholder="Min goods"
                value={filters.minItems}
                onChange={(e) => update('minItems', Number(e.target.value || 2))}
              />
            </div>
          </div>

          {currentCityInfo.city && (
            <div className="current-region-actions">
              <strong>Use current OCR city as context</strong>

              <div className="quick-region-list">
                <button type="button" className="region-chip" onClick={useCurrentMainRegionAsBuyRegion}>
                  Buy from main region
                </button>

                <button type="button" className="region-chip" onClick={useCurrentSubRegionAsBuyRegion}>
                  Buy from sub region
                </button>

                <button type="button" className="region-chip" onClick={useCurrentMainRegionAsSellRegion}>
                  Sell to main region
                </button>

                <button type="button" className="region-chip" onClick={useCurrentSubRegionAsSellRegion}>
                  Sell to sub region
                </button>
              </div>
            </div>
          )}

          <div className="region-route-grid">
            <MultiSelectChips
              label="Buy regions — select many"
              options={options.allRegions}
              selected={buyRegions}
              onChange={setBuyRegions}
            />

            <MultiSelectChips
              label="Sell regions — select many"
              options={options.allRegions}
              selected={sellRegions}
              onChange={setSellRegions}
            />
          </div>

          <div className="deal-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={findBestDeals}
              disabled={isLoadingBestDeals}
            >
              <Sparkles size={16} />
              {isLoadingBestDeals ? 'Finding best deals...' : 'Find Best Deals'}
            </button>

            <button type="button" className="button button-secondary" onClick={loadKnownPrices}>
              <Search size={16} /> Known prices
            </button>

            <button type="button" className="button button-secondary" onClick={findRoutes}>
              <Route size={16} /> Single routes
            </button>

            <button type="button" className="button button-success" onClick={findMultiRoutes}>
              <Layers size={16} /> Multi-good routes
            </button>

            <button type="button" className="button button-secondary" onClick={clear}>
              <Eraser size={16} /> Clear
            </button>
          </div>

          {lastLoadedAt && (
            <p className="mini-info">
              Last search: {lastLoadedAt.toLocaleString()}. Price freshness depends on when OCR captured each city.
            </p>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <h3>Known city prices</h3>
          <SortableTable
            columns={knownPriceColumns}
            rows={knownPrices}
            emptyMessage="No known prices loaded yet."
            initialSortKey="price"
            initialDirection="desc"
          />
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <h3>Single-good trade routes</h3>
          <SortableTable
            columns={routeColumns}
            rows={routes}
            emptyMessage="No route results yet."
            initialSortKey="profit"
            initialDirection="desc"
          />
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <h3>Multi-good route bonuses</h3>
          <SortableTable
            columns={multiColumns}
            rows={multiRoutes}
            emptyMessage="No multi-good routes yet."
            initialSortKey="totalProfit"
            initialDirection="desc"
          />
        </div>
      </section>
    </div>
  );
}