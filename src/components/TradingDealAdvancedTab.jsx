import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Compass,
  Eraser,
  Layers,
  MapPin,
  PackageCheck,
  Route,
  Search,
  SlidersHorizontal,
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

function profitQuality(value) {
  const profit = numberValue(value);
  if (profit >= 2000) return 'Excellent';
  if (profit >= 1000) return 'Great';
  if (profit >= 500) return 'Good';
  if (profit > 0) return 'Low';
  return 'Unknown';
}

function pickBestRoute(routes) {
  return [...routes].sort((a, b) => numberValue(b.profit) - numberValue(a.profit))[0] || null;
}

function pickBestMultiRoute(routes) {
  return [...routes].sort((a, b) => numberValue(b.totalProfit) - numberValue(a.totalProfit))[0] || null;
}

function getCurrentCityInfo(cities, latestCity) {
  const currentName = sanitizeCityName(latestCity?.city);
  if (!currentName) return { name: '', city: null };

  const city = cities.find(
    (item) => String(item.name || '').toLowerCase() === currentName.toLowerCase()
  );

  return { name: currentName, city: city || null };
}

function PriceAgeBadge({ value }) {
  const tone = freshnessTone(value);
  return <span className={`price-age price-age-${tone}`}>{ageText(value)}</span>;
}

function RegionSelector({ label, description, options, selected, onChange }) {
  const toggle = (region) => {
    if (selected.includes(region)) {
      onChange(selected.filter((item) => item !== region));
      return;
    }

    onChange(uniqueSorted([...selected, region]));
  };

  return (
    <div className="simple-region-selector">
      <div className="simple-region-header">
        <strong>{label}</strong>
        {selected.length > 0 && (
          <button type="button" className="link-button" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>

      {description && <p className="muted">{description}</p>}

      <div className="main-region-grid">
        {options.map((region) => (
          <button
            key={region}
            type="button"
            className={`main-region-button ${selected.includes(region) ? 'active' : ''}`}
            onClick={() => toggle(region)}
          >
            {region}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultCard({ title, icon, children, empty = false }) {
  return (
    <div className={`simple-result-card ${empty ? 'empty' : ''}`}>
      <div className="simple-result-title">
        {icon}
        <strong>{title}</strong>
      </div>
      <div className="simple-result-body">{children}</div>
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
    description: 'Buy and sell only inside the regions you choose.'
  },
  {
    key: 'buyHere',
    title: 'Buy here, sell anywhere',
    description: 'Find goods to buy in your selected regions and sell anywhere.'
  },
  {
    key: 'sellHere',
    title: 'Bring goods here to sell',
    description: 'Find goods to buy anywhere and sell in your selected regions.'
  },
  {
    key: 'between',
    title: 'Choose buy and sell regions',
    description: 'Advanced simple mode: choose separate buy and sell region groups.'
  }
];

export default function TradingDealAdvancedTab({ cities, tradeGoods, latestCity, run, api }) {
  const [viewMode, setViewMode] = useState('simple');
  const [showDetails, setShowDetails] = useState(false);
  const [simpleTradeStyle, setSimpleTradeStyle] = useState('inside');
  const [simpleRegions, setSimpleRegions] = useState([]);
  const [simpleBuyRegions, setSimpleBuyRegions] = useState([]);
  const [simpleSellRegions, setSimpleSellRegions] = useState([]);
  const [simpleType, setSimpleType] = useState('');
  const [simpleMinProfit, setSimpleMinProfit] = useState(1);

  const [filters, setFilters] = useState({ ...emptyFilters });
  const [knownPrices, setKnownPrices] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [multiRoutes, setMultiRoutes] = useState([]);
  const [buyRegions, setBuyRegions] = useState([]);
  const [sellRegions, setSellRegions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [lastSearchLabel, setLastSearchLabel] = useState('');
  const [localLatestCity, setLocalLatestCity] = useState(latestCity || null);

  useEffect(() => {
    if (latestCity) {
      setLocalLatestCity(latestCity);
      return;
    }

    let alive = true;
    run(() => api.getLatestCity(), 'Could not load current city').then((city) => {
      if (alive && city) setLocalLatestCity(city);
    });

    return () => {
      alive = false;
    };
  }, [api, latestCity, run]);

  const currentCityInfo = useMemo(
    () => getCurrentCityInfo(cities, localLatestCity),
    [cities, localLatestCity]
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

  const simpleRegionConfig = useMemo(() => {
    if (simpleTradeStyle === 'buyHere') {
      return {
        buyRegions: simpleRegions,
        sellRegions: [],
        label: simpleRegions.length
          ? `Buying in ${simpleRegions.join(', ')} and selling anywhere`
          : 'Buying anywhere and selling anywhere'
      };
    }

    if (simpleTradeStyle === 'sellHere') {
      return {
        buyRegions: [],
        sellRegions: simpleRegions,
        label: simpleRegions.length
          ? `Buying anywhere and selling in ${simpleRegions.join(', ')}`
          : 'Buying anywhere and selling anywhere'
      };
    }

    if (simpleTradeStyle === 'between') {
      return {
        buyRegions: simpleBuyRegions,
        sellRegions: simpleSellRegions,
        label: `Buying in ${simpleBuyRegions.length ? simpleBuyRegions.join(', ') : 'any region'} and selling in ${simpleSellRegions.length ? simpleSellRegions.join(', ') : 'any region'}`
      };
    }

    return {
      buyRegions: simpleRegions,
      sellRegions: simpleRegions,
      label: simpleRegions.length
        ? `Trading inside ${simpleRegions.join(', ')}`
        : 'Trading anywhere'
    };
  }, [simpleTradeStyle, simpleRegions, simpleBuyRegions, simpleSellRegions]);

  const update = (key, value) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === 'mainRegion') next.subRegion = '';
      return next;
    });
  };

  const clearSimple = () => {
    setSimpleTradeStyle('inside');
    setSimpleRegions([]);
    setSimpleBuyRegions([]);
    setSimpleSellRegions([]);
    setSimpleType('');
    setSimpleMinProfit(1);
    setRoutes([]);
    setMultiRoutes([]);
    setKnownPrices([]);
    setShowDetails(false);
    setLastLoadedAt(null);
    setLastSearchLabel('');
  };

  const clearAdvanced = () => {
    setFilters({ ...emptyFilters });
    setKnownPrices([]);
    setRoutes([]);
    setMultiRoutes([]);
    setBuyRegions([]);
    setSellRegions([]);
    setLastLoadedAt(null);
    setLastSearchLabel('');
  };

  const useCurrentRegion = () => {
    const region = currentCityInfo.city?.mainRegion;
    if (!region) return;

    if (simpleTradeStyle === 'between') {
      setSimpleBuyRegions((current) => uniqueSorted([...current, region]));
      return;
    }

    setSimpleRegions((current) => uniqueSorted([...current, region]));
  };

  const useCurrentRegionAsSellRegion = () => {
    const region = currentCityInfo.city?.mainRegion;
    if (!region) return;
    setSimpleTradeStyle('between');
    setSimpleSellRegions((current) => uniqueSorted([...current, region]));
  };

  const findSimpleDeals = async () => {
    setIsLoading(true);

    const [singleRoutes, multiGoodRoutes] = await Promise.all([
      run(
        () =>
          api.getAdvancedRoutes({
            type: simpleType,
            buyRegions: simpleRegionConfig.buyRegions,
            sellRegions: simpleRegionConfig.sellRegions,
            minProfit: simpleMinProfit,
            routesPerItem: 20,
            take: 50
          }),
        'Could not find simple trade routes'
      ),
      run(
        () =>
          api.getMultiGoodRoutes({
            type: simpleType,
            buyRegions: simpleRegionConfig.buyRegions,
            sellRegions: simpleRegionConfig.sellRegions,
            minProfitPerGood: simpleMinProfit,
            minTotalProfit: simpleMinProfit,
            minItems: 2,
            take: 30
          }),
        'Could not find simple multi-good routes'
      )
    ]);

    if (singleRoutes) setRoutes(singleRoutes);
    if (multiGoodRoutes) setMultiRoutes(multiGoodRoutes);

    setKnownPrices([]);
    setLastLoadedAt(new Date());
    setLastSearchLabel(simpleRegionConfig.label);
    setIsLoading(false);
  };

  const loadKnownPrices = async () => {
    setIsLoading(true);
    const data = await run(() => api.getKnownPrices(filters), 'Could not load known prices');
    if (data) {
      setKnownPrices(data);
      setLastLoadedAt(new Date());
      setLastSearchLabel('Known prices search');
    }
    setIsLoading(false);
  };

  const findRoutes = async () => {
    setIsLoading(true);
    const data = await run(
      () => api.getAdvancedRoutes({ ...filters, buyRegions, sellRegions }),
      'Could not find routes'
    );

    if (data) {
      setRoutes(data);
      setLastLoadedAt(new Date());
      setLastSearchLabel('Advanced single route search');
    }
    setIsLoading(false);
  };

  const findMultiRoutes = async () => {
    setIsLoading(true);
    const data = await run(
      () => api.getMultiGoodRoutes({ ...filters, buyRegions, sellRegions }),
      'Could not find multi-good routes'
    );

    if (data) {
      setMultiRoutes(data);
      setLastLoadedAt(new Date());
      setLastSearchLabel('Advanced multi-good route search');
    }
    setIsLoading(false);
  };

  const findAdvancedDeals = async () => {
    setIsLoading(true);

    const [known, singleRoutes, multiGoodRoutes] = await Promise.all([
      run(() => api.getKnownPrices(filters), 'Could not load known prices'),
      run(
        () => api.getAdvancedRoutes({ ...filters, buyRegions, sellRegions }),
        'Could not find routes'
      ),
      run(
        () => api.getMultiGoodRoutes({ ...filters, buyRegions, sellRegions }),
        'Could not find multi-good routes'
      )
    ]);

    if (known) setKnownPrices(known);
    if (singleRoutes) setRoutes(singleRoutes);
    if (multiGoodRoutes) setMultiRoutes(multiGoodRoutes);

    setLastLoadedAt(new Date());
    setLastSearchLabel('Advanced full search');
    setIsLoading(false);
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
        <span className="profit-with-quality">
          <span className="good-text">+{row.profit}</span>
          <small>{profitQuality(row.profit)}</small>
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
        <span className="profit-with-quality">
          <span className="good-text">+{row.totalProfit}</span>
          <small>{profitQuality(row.totalProfit)}</small>
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

  const shouldShowDetails = viewMode === 'advanced' || showDetails;

  return (
    <div className="trade-subtab-stack">
      <section className="card">
        <div className="card-body deal-helper simple-deal-helper">
          <div className="deal-helper-header">
            <div>
              <h2>
                <TrendingUp size={22} /> Deal helper
              </h2>
              <p className="muted">
                Simple mode gives one clear trade recommendation. Advanced mode keeps all filters and tables.
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

          <div className="mode-switcher">
            <button
              type="button"
              className={viewMode === 'simple' ? 'active' : ''}
              onClick={() => setViewMode('simple')}
            >
              <Sparkles size={16} /> Simple
            </button>
            <button
              type="button"
              className={viewMode === 'advanced' ? 'active' : ''}
              onClick={() => setViewMode('advanced')}
            >
              <SlidersHorizontal size={16} /> Advanced
            </button>
          </div>

          {viewMode === 'simple' && (
            <div className="simple-panel">
              <div className="simple-step-card">
                <div className="simple-step-number">1</div>
                <div>
                  <h3>Choose your trade area</h3>
                  <p className="muted">
                    Select one or more main regions. Leave empty to search every region.
                  </p>
                </div>
              </div>

              {simpleTradeStyle !== 'between' ? (
                <RegionSelector
                  label="Main regions"
                  description="The helper will use these regions based on the trade style below."
                  options={options.mainRegions}
                  selected={simpleRegions}
                  onChange={setSimpleRegions}
                />
              ) : (
                <div className="simple-between-grid">
                  <RegionSelector
                    label="Buy regions"
                    description="Goods must be bought in these regions."
                    options={options.mainRegions}
                    selected={simpleBuyRegions}
                    onChange={setSimpleBuyRegions}
                  />
                  <RegionSelector
                    label="Sell regions"
                    description="Goods must be sold in these regions."
                    options={options.mainRegions}
                    selected={simpleSellRegions}
                    onChange={setSimpleSellRegions}
                  />
                </div>
              )}

              {currentCityInfo.city && (
                <div className="current-region-actions compact-current-actions">
                  <strong>Current OCR region: {currentCityInfo.city.mainRegion}</strong>
                  <div className="quick-region-list">
                    <button type="button" className="region-chip" onClick={useCurrentRegion}>
                      Use current region
                    </button>
                    <button type="button" className="region-chip" onClick={useCurrentRegionAsSellRegion}>
                      Use current region as sell destination
                    </button>
                  </div>
                </div>
              )}

              <div className="simple-step-card">
                <div className="simple-step-number">2</div>
                <div>
                  <h3>Choose what you want to do</h3>
                  <p className="muted">This controls how the selected regions are used.</p>
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

              <div className="simple-step-card">
                <div className="simple-step-number">3</div>
                <div>
                  <h3>Optional filters</h3>
                  <p className="muted">Keep these empty for the easiest search.</p>
                </div>
              </div>

              <div className="simple-options-grid">
                <label className="field">
                  <span>Good type</span>
                  <input
                    className="input"
                    list="deal-type-options"
                    value={simpleType}
                    onChange={(e) => setSimpleType(e.target.value)}
                    placeholder="Any type"
                  />
                </label>

                <label className="field">
                  <span>Minimum profit</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={simpleMinProfit}
                    onChange={(e) => setSimpleMinProfit(Number(e.target.value || 1))}
                  />
                </label>
              </div>

              <div className="simple-search-summary">
                <Compass size={18} />
                <span>{simpleRegionConfig.label}</span>
                {simpleType && <span>Good type: {simpleType}</span>}
              </div>

              <div className="deal-actions simple-main-actions">
                <button
                  type="button"
                  className="button button-primary button-large"
                  onClick={findSimpleDeals}
                  disabled={isLoading}
                >
                  <Sparkles size={17} />
                  {isLoading ? 'Finding best trade...' : 'Find Best Trade'}
                </button>

                <button type="button" className="button button-secondary" onClick={clearSimple}>
                  <Eraser size={16} /> Clear
                </button>
              </div>
            </div>
          )}

          {viewMode === 'advanced' && (
            <div className="advanced-panel">
              <datalist id="deal-good-options">
                {tradeGoods.map((good) => (
                  <option key={good.name} value={good.name}>
                    {good.type}
                  </option>
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
                  <input className="input" list="deal-main-region-options" placeholder="Main region" value={filters.mainRegion} onChange={(e) => update('mainRegion', e.target.value)} />
                  <input className="input" list="deal-sub-region-options" placeholder="Sub region" value={filters.subRegion} onChange={(e) => update('subRegion', e.target.value)} />
                  <input className="input" list="deal-sea-region-options" placeholder="Sea trade region" value={filters.seaTradeRegion} onChange={(e) => update('seaTradeRegion', e.target.value)} />
                </div>

                <div className="region-panel">
                  <h4>Route profit rules</h4>
                  <input className="input" type="number" min="1" placeholder="Min profit" value={filters.minProfit} onChange={(e) => update('minProfit', Number(e.target.value || 1))} />
                  <input className="input" type="number" min="1" max="100" placeholder="Routes per good" value={filters.routesPerItem} onChange={(e) => update('routesPerItem', Number(e.target.value || 25))} />
                </div>

                <div className="region-panel">
                  <h4>Multi-good route rules</h4>
                  <input className="input" type="number" min="1" placeholder="Min profit per good" value={filters.minProfitPerGood} onChange={(e) => update('minProfitPerGood', Number(e.target.value || 1))} />
                  <input className="input" type="number" min="1" placeholder="Min total profit" value={filters.minTotalProfit} onChange={(e) => update('minTotalProfit', Number(e.target.value || 1))} />
                  <input className="input" type="number" min="2" placeholder="Min goods" value={filters.minItems} onChange={(e) => update('minItems', Number(e.target.value || 2))} />
                </div>
              </div>

              <div className="region-route-grid">
                <MultiSelectChips label="Buy regions — select many" options={options.allRegions} selected={buyRegions} onChange={setBuyRegions} />
                <MultiSelectChips label="Sell regions — select many" options={options.allRegions} selected={sellRegions} onChange={setSellRegions} />
              </div>

              <div className="deal-actions">
                <button type="button" className="button button-primary" onClick={findAdvancedDeals} disabled={isLoading}>
                  <Sparkles size={16} /> Find Best Deals
                </button>
                <button type="button" className="button button-secondary" onClick={loadKnownPrices} disabled={isLoading}>
                  <Search size={16} /> Known prices
                </button>
                <button type="button" className="button button-secondary" onClick={findRoutes} disabled={isLoading}>
                  <Route size={16} /> Single routes
                </button>
                <button type="button" className="button button-success" onClick={findMultiRoutes} disabled={isLoading}>
                  <Layers size={16} /> Multi-good routes
                </button>
                <button type="button" className="button button-secondary" onClick={clearAdvanced}>
                  <Eraser size={16} /> Clear
                </button>
              </div>
            </div>
          )}

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

          <div className="simple-results-section">
            <div className="simple-results-header">
              <div>
                <h3>
                  <PackageCheck size={20} /> Recommendation
                </h3>
                <p className="muted">
                  Results are based on the latest OCR prices saved in your database.
                </p>
              </div>

              {lastLoadedAt && (
                <span className="last-search-pill">
                  {lastSearchLabel || 'Last search'} · {lastLoadedAt.toLocaleTimeString()}
                </span>
              )}
            </div>

            <div className="simple-result-grid">
              <ResultCard title="Best single item" icon={<Route size={18} />} empty={!bestRoute}>
                {bestRoute ? (
                  <>
                    <strong>{bestRoute.itemName}</strong>
                    <span>
                      Buy in <b>{bestRoute.buyCity}</b> for {bestRoute.buyPrice}
                    </span>
                    <span>
                      Sell in <b>{bestRoute.sellCity}</b> for {bestRoute.sellPrice}
                    </span>
                    <span className="summary-profit">+{bestRoute.profit} profit</span>
                    <span className="quality-pill">{profitQuality(bestRoute.profit)}</span>
                    <small>Best route found for one item with the current filters.</small>
                  </>
                ) : (
                  <span>Choose regions and click Find Best Trade.</span>
                )}
              </ResultCard>

              <ResultCard title="Best full cargo route" icon={<Layers size={18} />} empty={!bestMultiRoute}>
                {bestMultiRoute ? (
                  <>
                    <strong>
                      {bestMultiRoute.buyCity} <ArrowRightLeft size={14} /> {bestMultiRoute.sellCity}
                    </strong>
                    <span>{bestMultiRoute.itemCount} profitable goods</span>
                    <span className="summary-profit">+{bestMultiRoute.totalProfit} total profit</span>
                    <span className="quality-pill">{profitQuality(bestMultiRoute.totalProfit)}</span>
                    <small>
                      Best route found when buying several goods in one city and selling them in another.
                    </small>
                  </>
                ) : (
                  <span>No multi-good route found yet.</span>
                )}
              </ResultCard>
            </div>

            {bestMultiRoute?.items?.length > 0 && (
              <div className="simple-route-breakdown">
                <strong>Goods to buy on the best full cargo route</strong>
                <div className="multi-route-items">
                  {bestMultiRoute.items.slice(0, 12).map((item) => (
                    <span key={`${bestMultiRoute.buyCity}-${bestMultiRoute.sellCity}-${item.itemName}`} className="mini-profit-chip">
                      {item.itemName}: {item.buyPrice} → {item.sellPrice} (+{item.profit})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {viewMode === 'simple' && (
              <button type="button" className="button button-secondary" onClick={() => setShowDetails((current) => !current)}>
                <SlidersHorizontal size={16} />
                {showDetails ? 'Hide details' : 'Show more results'}
              </button>
            )}
          </div>
        </div>
      </section>

      {shouldShowDetails && (
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
                emptyMessage="No known prices loaded yet. Use Advanced mode if you want to inspect raw known prices."
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
