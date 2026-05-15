import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eraser,
  Layers,
  MapPin,
  Route,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import SortableTable from './SortableTable.jsx';
import MultiSelectChips from './MultiSelectChips.jsx';
import {
  PriceAgeBadge,
  formatDate,
  getCurrentCityInfo,
  numberValue,
  uniqueSorted
} from './tradingUtils.jsx';

function pickBestRoute(routes) {
  return [...routes]
    .sort((a, b) => numberValue(b.profit) - numberValue(a.profit))[0] || null;
}

function pickBestMultiRoute(routes) {
  return [...routes]
    .sort((a, b) => numberValue(b.totalProfit) - numberValue(a.totalProfit))[0] || null;
}

function profitLabel(value) {
  const profit = numberValue(value);

  if (profit >= 2000) return 'Excellent';
  if (profit >= 800) return 'Good';
  if (profit >= 250) return 'Okay';
  return 'Low';
}

function toggleValue(values, value) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function RegionButtonGrid({ regions, selected, onChange }) {
  return (
    <div className="simple-region-grid">
      {regions.map((region) => (
        <button
          key={region}
          type="button"
          className={`simple-region-button ${selected.includes(region) ? 'selected' : ''}`}
          onClick={() => onChange(toggleValue(selected, region))}
        >
          {region}
        </button>
      ))}
    </div>
  );
}

function SimpleResultCard({ title, icon, children, empty }) {
  return (
    <div className={`simple-result-card ${empty ? 'empty' : ''}`}>
      <div className="simple-result-card-title">
        {icon}
        <strong>{title}</strong>
      </div>
      <div className="simple-result-card-body">{children}</div>
    </div>
  );
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

const tradeStyles = [
  {
    key: 'inside',
    title: 'Trade inside selected regions',
    description: 'Buy and sell only inside the regions you selected.'
  },
  {
    key: 'buyHere',
    title: 'Buy here, sell anywhere',
    description: 'Find goods to buy in selected regions and sell elsewhere.'
  },
  {
    key: 'sellHere',
    title: 'Bring goods here',
    description: 'Find goods to buy anywhere and sell in selected regions.'
  },
  {
    key: 'between',
    title: 'Choose buy/sell regions',
    description: 'Advanced simple mode: choose buy and sell regions separately.'
  }
];

export default function TradingDealAdvancedTab({ cities, tradeGoods, latestCity, run, api }) {
  const [mode, setMode] = useState('simple');

  const [simpleRegions, setSimpleRegions] = useState([]);
  const [simpleBuyRegions, setSimpleBuyRegions] = useState([]);
  const [simpleSellRegions, setSimpleSellRegions] = useState([]);
  const [simpleTradeStyle, setSimpleTradeStyle] = useState('inside');
  const [simpleType, setSimpleType] = useState('');
  const [simpleResultType, setSimpleResultType] = useState('both');
  const [simpleLoading, setSimpleLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const [filters, setFilters] = useState({ ...emptyFilters });
  const [knownPrices, setKnownPrices] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [multiRoutes, setMultiRoutes] = useState([]);
  const [buyRegions, setBuyRegions] = useState([]);
  const [sellRegions, setSellRegions] = useState([]);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);

  const currentCityInfo = useMemo(
    () => getCurrentCityInfo(cities, latestCity),
    [cities, latestCity]
  );

  const options = useMemo(() => {
    const filtered = cities.filter(
      (city) => !filters.mainRegion || city.mainRegion === filters.mainRegion
    );

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

  const simpleRegionSummary = useMemo(() => {
    if (simpleTradeStyle === 'between') {
      const buyText = simpleBuyRegions.length ? simpleBuyRegions.join(', ') : 'Anywhere';
      const sellText = simpleSellRegions.length ? simpleSellRegions.join(', ') : 'Anywhere';
      return `Buy: ${buyText} → Sell: ${sellText}`;
    }

    return simpleRegions.length ? simpleRegions.join(', ') : 'Anywhere';
  }, [simpleTradeStyle, simpleRegions, simpleBuyRegions, simpleSellRegions]);

  const update = (key, value) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === 'mainRegion') next.subRegion = '';
      return next;
    });
  };

  const getSimpleRegionPayload = () => {
    if (simpleTradeStyle === 'inside') {
      return {
        buyRegions: simpleRegions,
        sellRegions: simpleRegions
      };
    }

    if (simpleTradeStyle === 'buyHere') {
      return {
        buyRegions: simpleRegions,
        sellRegions: []
      };
    }

    if (simpleTradeStyle === 'sellHere') {
      return {
        buyRegions: [],
        sellRegions: simpleRegions
      };
    }

    return {
      buyRegions: simpleBuyRegions,
      sellRegions: simpleSellRegions
    };
  };

  const useCurrentMainRegion = () => {
    const region = currentCityInfo.city?.mainRegion;
    if (!region) return;

    if (simpleTradeStyle === 'between') {
      setSimpleBuyRegions((current) => uniqueSorted([...current, region]));
      return;
    }

    setSimpleRegions((current) => uniqueSorted([...current, region]));
  };

  const useCurrentAsBuyRegion = () => {
    const region = currentCityInfo.city?.mainRegion;
    if (!region) return;
    setSimpleTradeStyle('between');
    setSimpleBuyRegions((current) => uniqueSorted([...current, region]));
  };

  const useCurrentAsSellRegion = () => {
    const region = currentCityInfo.city?.mainRegion;
    if (!region) return;
    setSimpleTradeStyle('between');
    setSimpleSellRegions((current) => uniqueSorted([...current, region]));
  };

  const findSimpleDeals = async () => {
    const regionPayload = getSimpleRegionPayload();

    setSimpleLoading(true);
    setKnownPrices([]);

    const shouldLoadSingle = simpleResultType === 'single' || simpleResultType === 'both';
    const shouldLoadMulti = simpleResultType === 'multi' || simpleResultType === 'both';

    const [singleResult, multiResult] = await Promise.all([
      shouldLoadSingle
        ? run(
            () =>
              api.getAdvancedRoutes({
                item: '',
                type: simpleType,
                buyRegions: regionPayload.buyRegions,
                sellRegions: regionPayload.sellRegions,
                minProfit: 1,
                routesPerItem: 10,
                take: 50
              }),
            'Could not find simple trade routes'
          )
        : Promise.resolve([]),

      shouldLoadMulti
        ? run(
            () =>
              api.getMultiGoodRoutes({
                type: simpleType,
                buyRegions: regionPayload.buyRegions,
                sellRegions: regionPayload.sellRegions,
                minProfitPerGood: 1,
                minTotalProfit: 1,
                minItems: 2,
                take: 25
              }),
            'Could not find simple multi-good routes'
          )
        : Promise.resolve([])
    ]);

    if (singleResult) setRoutes(singleResult);
    if (multiResult) setMultiRoutes(multiResult);

    setLastLoadedAt(new Date());
    setSimpleLoading(false);
  };

  const clearSimple = () => {
    setSimpleRegions([]);
    setSimpleBuyRegions([]);
    setSimpleSellRegions([]);
    setSimpleTradeStyle('inside');
    setSimpleType('');
    setSimpleResultType('both');
    setKnownPrices([]);
    setRoutes([]);
    setMultiRoutes([]);
    setLastLoadedAt(null);
  };

  const clearAll = () => {
    clearSimple();
    setFilters({ ...emptyFilters });
    setBuyRegions([]);
    setSellRegions([]);
    setShowDetails(false);
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

  const findAdvancedDeals = async () => {
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
      render: (row) => (
        <span className="good-text">
          +{row.profit} <small>({profitLabel(row.profit)})</small>
        </span>
      )
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
      render: (row) => (
        <span className="good-text">
          +{row.totalProfit} <small>({profitLabel(row.totalProfit)})</small>
        </span>
      )
    },
    {
      key: 'items',
      label: 'Items',
      sortable: false,
      render: (row) => (
        <div className="multi-route-items">
          {(row.items || []).slice(0, 8).map((item) => (
            <span
              key={`${row.buyCity}-${row.sellCity}-${item.itemName}`}
              className="mini-profit-chip"
            >
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
        <div className="card-body simple-deal-helper">
          <div className="simple-deal-header">
            <div>
              <h2>
                <TrendingUp size={22} /> Deal helper
              </h2>
              <p className="muted">
                Simple mode gives a quick answer. Advanced mode lets you control every filter.
              </p>
            </div>

            <div className="deal-mode-toggle">
              <button
                type="button"
                className={mode === 'simple' ? 'active' : ''}
                onClick={() => setMode('simple')}
              >
                Simple
              </button>

              <button
                type="button"
                className={mode === 'advanced' ? 'active' : ''}
                onClick={() => setMode('advanced')}
              >
                Advanced
              </button>
            </div>
          </div>

          <div className="current-city-strip">
            <span className="current-city-chip">
              <MapPin size={16} />
              Current OCR city: {currentCityInfo.name || 'Unknown'}
            </span>

            {currentCityInfo.city && (
              <>
                <span className="muted">
                  {currentCityInfo.city.mainRegion} / {currentCityInfo.city.subRegion} / {currentCityInfo.city.seaTradeRegion}
                </span>

                <button type="button" className="link-button" onClick={useCurrentMainRegion}>
                  Use current region
                </button>

                <button type="button" className="link-button" onClick={useCurrentAsBuyRegion}>
                  Use as buy region
                </button>

                <button type="button" className="link-button" onClick={useCurrentAsSellRegion}>
                  Use as sell region
                </button>
              </>
            )}
          </div>

          {mode === 'simple' && (
            <div className="simple-mode-panel">
              <div className="simple-step">
                <div className="simple-step-title">
                  <span>1</span>
                  <div>
                    <strong>Choose where you want to trade</strong>
                    <small>Select one or more main regions. Leave empty to search everywhere.</small>
                  </div>
                </div>

                {simpleTradeStyle !== 'between' ? (
                  <RegionButtonGrid
                    regions={options.mainRegions}
                    selected={simpleRegions}
                    onChange={setSimpleRegions}
                  />
                ) : (
                  <div className="simple-between-grid">
                    <div>
                      <h4>Buy regions</h4>
                      <RegionButtonGrid
                        regions={options.mainRegions}
                        selected={simpleBuyRegions}
                        onChange={setSimpleBuyRegions}
                      />
                    </div>

                    <div>
                      <h4>Sell regions</h4>
                      <RegionButtonGrid
                        regions={options.mainRegions}
                        selected={simpleSellRegions}
                        onChange={setSimpleSellRegions}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="simple-step">
                <div className="simple-step-title">
                  <span>2</span>
                  <div>
                    <strong>Choose trade style</strong>
                    <small>This controls how the selected regions are used.</small>
                  </div>
                </div>

                <div className="trade-style-grid">
                  {tradeStyles.map((style) => (
                    <button
                      key={style.key}
                      type="button"
                      className={`trade-style-card ${simpleTradeStyle === style.key ? 'active' : ''}`}
                      onClick={() => setSimpleTradeStyle(style.key)}
                    >
                      <strong>{style.title}</strong>
                      <small>{style.description}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="simple-step">
                <div className="simple-step-title">
                  <span>3</span>
                  <div>
                    <strong>Optional filters</strong>
                    <small>Most users can leave these as default.</small>
                  </div>
                </div>

                <div className="simple-options-grid">
                  <label className="field">
                    <span>Good type</span>
                    <input
                      className="input"
                      list="simple-type-options"
                      value={simpleType}
                      onChange={(e) => setSimpleType(e.target.value)}
                      placeholder="Any type"
                    />
                  </label>

                  <label className="field">
                    <span>Result type</span>
                    <select
                      className="input"
                      value={simpleResultType}
                      onChange={(e) => setSimpleResultType(e.target.value)}
                    >
                      <option value="both">Best single + multi-good</option>
                      <option value="single">Single item only</option>
                      <option value="multi">Multi-good only</option>
                    </select>
                  </label>
                </div>

                <datalist id="simple-type-options">
                  {options.types.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </div>

              <div className="simple-search-box">
                <div>
                  <strong>Search summary</strong>
                  <p className="muted">
                    {simpleRegionSummary}
                    {simpleType ? ` — Type: ${simpleType}` : ' — Any good type'}
                  </p>
                </div>

                <div className="deal-actions">
                  <button
                    type="button"
                    className="button button-primary big-action"
                    onClick={findSimpleDeals}
                    disabled={simpleLoading}
                  >
                    <Sparkles size={18} />
                    {simpleLoading ? 'Finding best trade...' : 'Find Best Trade'}
                  </button>

                  <button type="button" className="button button-secondary" onClick={clearSimple}>
                    <Eraser size={16} /> Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {mode === 'advanced' && (
            <div className="advanced-mode-panel">
              <div className="advanced-mode-title">
                <SlidersHorizontal size={18} />
                <strong>Advanced filters</strong>
                <span className="muted">Use these when you want exact control.</span>
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
                <button type="button" className="button button-primary" onClick={findAdvancedDeals}>
                  <Sparkles size={16} /> Find Best Advanced Deals
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

                <button type="button" className="button button-secondary" onClick={clearAll}>
                  <Eraser size={16} /> Clear
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="simple-results-layout">
        <SimpleResultCard title="Best single-good route" icon={<Route size={18} />} empty={!bestRoute}>
          {bestRoute ? (
            <>
              <strong>{bestRoute.itemName}</strong>

              <span>
                Buy in <b>{bestRoute.buyCity}</b> for {bestRoute.buyPrice}
              </span>

              <span>
                Sell in <b>{bestRoute.sellCity}</b> for {bestRoute.sellPrice}
              </span>

              <span className="summary-profit">
                Profit: +{bestRoute.profit} <small>{profitLabel(bestRoute.profit)}</small>
              </span>

              <small>
                Best single item route found with your selected trade area.
              </small>
            </>
          ) : (
            <>
              <span>No single-good result yet.</span>
              <small>Choose a region and click Find Best Trade.</small>
            </>
          )}
        </SimpleResultCard>

        <SimpleResultCard title="Best multi-good route" icon={<Layers size={18} />} empty={!bestMultiRoute}>
          {bestMultiRoute ? (
            <>
              <strong>
                {bestMultiRoute.buyCity} → {bestMultiRoute.sellCity}
              </strong>

              <span>{bestMultiRoute.itemCount} profitable goods</span>

              <span className="summary-profit">
                Total profit: +{bestMultiRoute.totalProfit}{' '}
                <small>{profitLabel(bestMultiRoute.totalProfit)}</small>
              </span>

              <div className="multi-route-items">
                {(bestMultiRoute.items || []).slice(0, 6).map((item) => (
                  <span key={item.itemName} className="mini-profit-chip">
                    {item.itemName} +{item.profit}
                  </span>
                ))}
              </div>

              <small>
                Best route for buying multiple goods in one city and selling them in another.
              </small>
            </>
          ) : (
            <>
              <span>No multi-good result yet.</span>
              <small>Choose a region and click Find Best Trade.</small>
            </>
          )}
        </SimpleResultCard>
      </section>

      <section className="card">
        <div className="card-body detail-toggle-row">
          <div>
            <h3>Detailed results</h3>
            <p className="muted">
              Use this when you want to inspect all routes and known prices.
              {lastLoadedAt ? ` Last search: ${lastLoadedAt.toLocaleString()}.` : ''}
            </p>
          </div>

          <button
            type="button"
            className="button button-secondary"
            onClick={() => setShowDetails((value) => !value)}
          >
            {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
        </div>
      </section>

      {showDetails && (
        <>
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
        </>
      )}
    </div>
  );
}
