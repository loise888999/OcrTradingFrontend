import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Compass,
  Eraser,
  MapPin,
  PackageSearch,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import SortableTable from './SortableTable.jsx';
import {
  PriceAgeBadge,
  TradingOriginSelector,
  ageText,
  distanceSortValue,
  formatDate,
  getCityDistanceFromOrigin,
  freshnessTone,
  getCurrentCityInfo,
  isFreshEnough,
  numberValue,
  resolveTradingOrigin,
  uniqueSorted
} from './tradingUtils.jsx';

function getDistanceScore(row, referenceCity) {
  if (!referenceCity) return 9;

  const rowCity = String(row.city || '').toLowerCase();
  const refCity = String(referenceCity.name || '').toLowerCase();

  if (rowCity && rowCity === refCity) return 0;
  if (row.seaTradeRegion && row.seaTradeRegion === referenceCity.seaTradeRegion) return 1;
  if (row.subRegion && row.subRegion === referenceCity.subRegion) return 2;
  if (row.mainRegion && row.mainRegion === referenceCity.mainRegion) return 3;

  return 9;
}

function getDistanceLabel(score) {
  if (score === 0) return 'Same city';
  if (score === 1) return 'Same sea trade';
  if (score === 2) return 'Same sub region';
  if (score === 3) return 'Same main region';
  return 'Far / unknown';
}

function DossierCard({ title, icon, children, empty }) {
  return (
    <section className={`good-result-card dossier-card ${empty ? 'empty' : ''}`}>
      <div className="good-result-title">
        {icon}
        <strong>{title}</strong>
      </div>

      <div className="good-result-body">{children}</div>
    </section>
  );
}

function normalizeOffer(row, tradeType, origin, cities) {
  const price = numberValue(row.price);
  const referenceCity = origin?.city || null;
  const distanceScore = getDistanceScore(row, referenceCity);
  const distanceInfo = getCityDistanceFromOrigin(cities, row.city, origin);

  return {
    ...row,
    tradeType,
    price,
    distance: distanceInfo.distance,
    distanceSort: distanceInfo.distanceSort,
    distanceWorldLabel: distanceInfo.distanceLabel,
    distanceScore,
    distanceLabel: getDistanceLabel(distanceScore)
  };
}

function sortByDateAsc(left, right) {
  const leftTime = new Date(left.capturedAtUtc || 0).getTime();
  const rightTime = new Date(right.capturedAtUtc || 0).getTime();
  return leftTime - rightTime;
}

function pickCheapest(rows) {
  return [...rows].sort((a, b) => numberValue(a.price) - numberValue(b.price))[0] || null;
}

function pickHighest(rows) {
  return [...rows].sort((a, b) => numberValue(b.price) - numberValue(a.price))[0] || null;
}

function pickClosestUseful(buyRows, sellRows) {
  const candidates = [
    ...buyRows.map((row) => ({ ...row, actionLabel: 'Buy' })),
    ...sellRows.map((row) => ({ ...row, actionLabel: 'Sell' }))
  ];

  return [...candidates].sort((a, b) => {
    const coordinateDistanceDiff = distanceSortValue(a.distance) - distanceSortValue(b.distance);
    if (coordinateDistanceDiff !== 0) return coordinateDistanceDiff;

    const distanceDiff = numberValue(a.distanceScore) - numberValue(b.distanceScore);
    if (distanceDiff !== 0) return distanceDiff;

    if (a.actionLabel !== b.actionLabel) return a.actionLabel.localeCompare(b.actionLabel);

    return a.actionLabel === 'Buy'
      ? numberValue(a.price) - numberValue(b.price)
      : numberValue(b.price) - numberValue(a.price);
  })[0] || null;
}

function buildFreshness(rows) {
  if (!rows.length) {
    return {
      newest: null,
      oldest: null,
      oldCount: 0,
      freshCount: 0
    };
  }

  const sorted = [...rows].filter((row) => row.capturedAtUtc).sort(sortByDateAsc);
  const oldCount = rows.filter((row) => freshnessTone(row.capturedAtUtc) === 'old').length;
  const freshCount = rows.filter((row) => freshnessTone(row.capturedAtUtc) === 'fresh').length;

  return {
    newest: sorted[sorted.length - 1] || null,
    oldest: sorted[0] || null,
    oldCount,
    freshCount
  };
}

function buildCoverageRows(buyRows, sellRows) {
  const grouped = new Map();

  for (const row of [...buyRows, ...sellRows]) {
    const region = row.mainRegion || 'Unassigned';

    if (!grouped.has(region)) {
      grouped.set(region, {
        mainRegion: region,
        buyCities: new Set(),
        sellCities: new Set(),
        buyOffers: 0,
        sellOffers: 0
      });
    }

    const entry = grouped.get(region);
    const city = row.city || 'Unknown';

    if (row.tradeType === 'Buy') {
      entry.buyCities.add(city);
      entry.buyOffers += 1;
    } else {
      entry.sellCities.add(city);
      entry.sellOffers += 1;
    }
  }

  return [...grouped.values()]
    .map((row) => ({
      mainRegion: row.mainRegion,
      buyCities: row.buyCities.size,
      sellCities: row.sellCities.size,
      buyOffers: row.buyOffers,
      sellOffers: row.sellOffers,
      totalCities: new Set([...row.buyCities, ...row.sellCities]).size,
      totalOffers: row.buyOffers + row.sellOffers
    }))
    .sort((a, b) => b.totalOffers - a.totalOffers || a.mainRegion.localeCompare(b.mainRegion));
}

const emptyFilters = {
  item: '',
  type: '',
  mainRegion: '',
  subRegion: '',
  seaTradeRegion: '',
  take: 500
};

export default function TradingGoodLookupTab({ cities, tradeGoods, latestCity, latestCoordinate, run, api }) {
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [originCityName, setOriginCityName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [onlyFreshPrices, setOnlyFreshPrices] = useState(false);
  const [buyRows, setBuyRows] = useState([]);
  const [sellRows, setSellRows] = useState([]);
  const [rawBuyRows, setRawBuyRows] = useState([]);
  const [rawSellRows, setRawSellRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastSearchAt, setLastSearchAt] = useState(null);
  const [message, setMessage] = useState('');

  const currentCityInfo = useMemo(
    () => getCurrentCityInfo(cities, latestCity),
    [cities, latestCity]
  );

  const origin = useMemo(
    () => resolveTradingOrigin({
      cities,
      latestCity,
      latestCoordinate,
      manualCityName: originCityName
    }),
    [cities, latestCity, latestCoordinate, originCityName]
  );

  const options = useMemo(() => {
    const filteredForSub = cities.filter(
      (city) => !filters.mainRegion || city.mainRegion === filters.mainRegion
    );

    const filteredForSea = filteredForSub.filter(
      (city) => !filters.subRegion || city.subRegion === filters.subRegion
    );

    return {
      cityNames: uniqueSorted(cities.map((city) => city.name)),
      types: uniqueSorted(tradeGoods.map((good) => good.type)),
      mainRegions: uniqueSorted(cities.map((city) => city.mainRegion)),
      subRegions: uniqueSorted(filteredForSub.map((city) => city.subRegion)),
      seaTradeRegions: uniqueSorted(filteredForSea.map((city) => city.seaTradeRegion))
    };
  }, [cities, tradeGoods, filters.mainRegion, filters.subRegion]);

  const allRows = useMemo(() => [...buyRows, ...sellRows], [buyRows, sellRows]);
  const cheapestBuy = useMemo(() => pickCheapest(buyRows), [buyRows]);
  const highestSell = useMemo(() => pickHighest(sellRows), [sellRows]);
  const closestUseful = useMemo(() => pickClosestUseful(buyRows, sellRows), [buyRows, sellRows]);
  const freshness = useMemo(() => buildFreshness(allRows), [allRows]);
  const coverageRows = useMemo(() => buildCoverageRows(buyRows, sellRows), [buyRows, sellRows]);

  const profit = cheapestBuy && highestSell
    ? numberValue(highestSell.price) - numberValue(cheapestBuy.price)
    : null;

  const updateFilter = (key, value) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };

      if (key === 'mainRegion') {
        next.subRegion = '';
        next.seaTradeRegion = '';
      }

      if (key === 'subRegion') {
        next.seaTradeRegion = '';
      }

      return next;
    });
  };

  const clear = () => {
    setFilters({ ...emptyFilters });
    setOriginCityName('');
    setOnlyFreshPrices(false);
    setBuyRows([]);
    setSellRows([]);
    setRawBuyRows([]);
    setRawSellRows([]);
    setLastSearchAt(null);
    setMessage('');
  };

  const applyLocalFilters = (rows, tradeType) => {
    let normalized = rows.map((row) => normalizeOffer(row, tradeType, origin, cities));

    if (onlyFreshPrices) {
      normalized = normalized.filter((row) => isFreshEnough(row.capturedAtUtc));
    }

    return normalized;
  };

  useEffect(() => {
    setBuyRows(applyLocalFilters(rawBuyRows, 'Buy'));
    setSellRows(applyLocalFilters(rawSellRows, 'Sell'));
  }, [rawBuyRows, rawSellRows, onlyFreshPrices, origin, cities]);

  const analyze = async () => {
    const item = filters.item.trim();

    if (!item) {
      setMessage('Choose a good first.');
      setBuyRows([]);
      setSellRows([]);
      setRawBuyRows([]);
      setRawSellRows([]);
      setLastSearchAt(null);
      return;
    }

    setLoading(true);
    setMessage('');

    const payload = {
      item,
      type: filters.type,
      mainRegion: filters.mainRegion,
      subRegion: filters.subRegion,
      seaTradeRegion: filters.seaTradeRegion,
      take: filters.take
    };

    const [buyData, sellData] = await Promise.all([
      run(
        () => api.getKnownPrices({ ...payload, tradeType: 'Buy' }),
        'Could not load buy offers'
      ),
      run(
        () => api.getKnownPrices({ ...payload, tradeType: 'Sell' }),
        'Could not load sell offers'
      )
    ]);

    const nextRawBuyRows = buyData || [];
    const nextRawSellRows = sellData || [];

    setRawBuyRows(nextRawBuyRows);
    setRawSellRows(nextRawSellRows);
    setBuyRows(applyLocalFilters(nextRawBuyRows, 'Buy'));
    setSellRows(applyLocalFilters(nextRawSellRows, 'Sell'));
    setLastSearchAt(new Date());
    setLoading(false);
  };

  const priceColumns = [
    { key: 'itemName', label: 'Good', sortable: true },
    { key: 'tradeGoodType', label: 'Type', sortable: true },
    {
      key: 'price',
      label: 'Price',
      sortable: true,
      render: (row) => <strong>{row.price}</strong>
    },
    { key: 'city', label: 'City', sortable: true },
    { key: 'mainRegion', label: 'Main Region', sortable: true },
    { key: 'subRegion', label: 'Sub Region', sortable: true },
    { key: 'seaTradeRegion', label: 'Sea Trade', sortable: true },
    {
      key: 'distanceSort',
      label: 'Distance',
      sortable: true,
      defaultDirection: 'asc',
      render: (row) => (
        <span className={`closeness-pill closeness-${row.distanceScore}`}>
          {row.distanceWorldLabel}
        </span>
      )
    },
    {
      key: 'distanceScore',
      label: 'Region',
      sortable: true,
      defaultDirection: 'asc',
      render: (row) => (
        <span className={`closeness-pill closeness-${row.distanceScore}`}>{row.distanceLabel}</span>
      )
    },
    {
      key: 'capturedAtUtc',
      label: 'Last Seen',
      sortable: true,
      render: (row) => (
        <span className="captured-cell">
          {formatDate(row.capturedAtUtc)}
          <PriceAgeBadge value={row.capturedAtUtc} />
        </span>
      )
    }
  ];

  const coverageColumns = [
    { key: 'mainRegion', label: 'Main Region', sortable: true },
    { key: 'totalCities', label: 'Known Cities', sortable: true },
    { key: 'buyCities', label: 'Buy Cities', sortable: true },
    { key: 'sellCities', label: 'Sell Cities', sortable: true },
    { key: 'buyOffers', label: 'Buy Offers', sortable: true },
    { key: 'sellOffers', label: 'Sell Offers', sortable: true }
  ];

  return (
    <div className="trade-subtab-stack">
      <section className="card">
        <div className="card-body find-good-helper">
          <div className="find-good-header">
            <div>
              <h2>
                <PackageSearch size={22} /> Trade good dossier
              </h2>
              <p className="muted">
                Analyze one good: best buy, best sell, profit spread, freshness, and known market coverage.
              </p>
            </div>

            <button
              type="button"
              className={`map-compact-button ${showAdvanced ? 'active' : ''}`}
              onClick={() => setShowAdvanced((value) => !value)}
            >
              <SlidersHorizontal size={16} /> Advanced
            </button>
          </div>

          <div className="current-city-strip">
            <span className="current-city-chip">
              <MapPin size={16} />
              Current OCR city: {currentCityInfo.name || 'Unknown'}
            </span>

            <span className="muted">Origin: {origin.label}</span>
          </div>

          <datalist id="dossier-good-options">
            {tradeGoods.map((good) => (
              <option key={good.name} value={good.name}>
                {good.type}
              </option>
            ))}
          </datalist>

          <datalist id="dossier-good-type-options">
            {options.types.map((goodType) => (
              <option key={goodType} value={goodType} />
            ))}
          </datalist>

          <datalist id="dossier-main-region-options">
            {options.mainRegions.map((region) => (
              <option key={region} value={region} />
            ))}
          </datalist>

          <datalist id="dossier-sub-region-options">
            {options.subRegions.map((region) => (
              <option key={region} value={region} />
            ))}
          </datalist>

          <datalist id="dossier-sea-region-options">
            {options.seaTradeRegions.map((region) => (
              <option key={region} value={region} />
            ))}
          </datalist>

          <div className="dossier-search-grid">
            <label className="field">
              <span>Good name</span>
              <input
                className="input"
                list="dossier-good-options"
                value={filters.item}
                onChange={(event) => updateFilter('item', event.target.value)}
                placeholder="Example: Diamond"
              />
            </label>

            <TradingOriginSelector
              cities={cities}
              manualCityName={originCityName}
              onManualCityNameChange={setOriginCityName}
              origin={origin}
              datalistId="dossier-origin-city-options"
            />

            <label className="field">
              <span>Limit</span>
              <input
                className="input"
                type="number"
                min="1"
                max="2000"
                value={filters.take}
                onChange={(event) => updateFilter('take', Number(event.target.value || 500))}
              />
            </label>
          </div>

          {showAdvanced && (
            <div className="find-good-advanced">
              <div className="advanced-mode-title">
                <SlidersHorizontal size={18} />
                <strong>Advanced filters</strong>
                <span className="muted">Limit dossier data by catalog type or region.</span>
              </div>

              <div className="deal-filter-grid">
                <label className="field">
                  <span>Good type</span>
                  <input
                    className="input"
                    list="dossier-good-type-options"
                    value={filters.type}
                    onChange={(event) => updateFilter('type', event.target.value)}
                    placeholder="Any type"
                  />
                </label>

                <label className="field">
                  <span>Main region</span>
                  <input
                    className="input"
                    list="dossier-main-region-options"
                    value={filters.mainRegion}
                    onChange={(event) => updateFilter('mainRegion', event.target.value)}
                    placeholder="Any"
                  />
                </label>

                <label className="field">
                  <span>Sub region</span>
                  <input
                    className="input"
                    list="dossier-sub-region-options"
                    value={filters.subRegion}
                    onChange={(event) => updateFilter('subRegion', event.target.value)}
                    placeholder="Any"
                  />
                </label>

                <label className="field">
                  <span>Sea trade region</span>
                  <input
                    className="input"
                    list="dossier-sea-region-options"
                    value={filters.seaTradeRegion}
                    onChange={(event) => updateFilter('seaTradeRegion', event.target.value)}
                    placeholder="Any"
                  />
                </label>
              </div>
            </div>
          )}

          <div className="find-good-search-box">
            <div>
              <strong>Analysis summary</strong>
              <p className="muted">
                {filters.item ? `Good: ${filters.item}` : 'Choose a good to analyze'}
                {' | '}
                Origin: {origin.label}
                {' | '}
                Prices: {onlyFreshPrices ? 'fresh only' : 'all known'}
              </p>
            </div>

            <div className="deal-actions">
              <label className="dossier-fresh-toggle">
                <input
                  type="checkbox"
                  checked={onlyFreshPrices}
                  onChange={(event) => setOnlyFreshPrices(event.target.checked)}
                />
                Hide old prices
              </label>

              <button
                type="button"
                className="button button-primary big-action"
                onClick={analyze}
                disabled={loading}
              >
                <Search size={17} />
                {loading ? 'Analyzing...' : 'Analyze good'}
              </button>

              <button type="button" className="button button-secondary" onClick={clear}>
                <Eraser size={16} /> Clear
              </button>
            </div>
          </div>

          {message && <p className="mini-info bad-text">{message}</p>}

          {lastSearchAt && (
            <p className="mini-info">
              Buy offers: {buyRows.length}/{rawBuyRows.length}. Sell offers: {sellRows.length}/{rawSellRows.length}.
              {' '}Last analysis: {lastSearchAt.toLocaleString()}.
            </p>
          )}
        </div>
      </section>

      <section className="find-good-results-grid dossier-results-grid">
        <DossierCard title="Best action" icon={<TrendingUp size={18} />} empty={!cheapestBuy || !highestSell}>
          {cheapestBuy && highestSell ? (
            <>
              <strong>{filters.item}</strong>
              <span>
                Buy in <b>{cheapestBuy.city}</b> for {cheapestBuy.price}
              </span>
              <span>
                Sell in <b>{highestSell.city}</b> for {highestSell.price}
              </span>
              <span className={profit > 0 ? 'summary-profit' : 'bad-text'}>
                Spread: {profit > 0 ? '+' : ''}{profit}
              </span>
            </>
          ) : (
            <>
              <span>Need both buy and sell data.</span>
              <small>Analyze a good with known buy and sell prices.</small>
            </>
          )}
        </DossierCard>

        <DossierCard title="Best buy" icon={<Sparkles size={18} />} empty={!cheapestBuy}>
          {cheapestBuy ? (
            <>
              <strong>{cheapestBuy.city}</strong>
              <span>Buy for {cheapestBuy.price}</span>
              <span>{cheapestBuy.mainRegion} / {cheapestBuy.subRegion}</span>
              <PriceAgeBadge value={cheapestBuy.capturedAtUtc} />
            </>
          ) : (
            <>
              <span>No buy offer found.</span>
              <small>Try clearing region filters.</small>
            </>
          )}
        </DossierCard>

        <DossierCard title="Best sell" icon={<BarChart3 size={18} />} empty={!highestSell}>
          {highestSell ? (
            <>
              <strong>{highestSell.city}</strong>
              <span>Sell for {highestSell.price}</span>
              <span>{highestSell.mainRegion} / {highestSell.subRegion}</span>
              <PriceAgeBadge value={highestSell.capturedAtUtc} />
            </>
          ) : (
            <>
              <span>No sell offer found.</span>
              <small>Try clearing region filters.</small>
            </>
          )}
        </DossierCard>

        <DossierCard title="Closest useful city" icon={<Compass size={18} />} empty={!closestUseful}>
          {closestUseful ? (
            <>
              <strong>{closestUseful.city}</strong>
              <span>
                {closestUseful.actionLabel} for {closestUseful.price}
              </span>
              <span>{closestUseful.distanceWorldLabel}</span>
              <span className={`closeness-pill closeness-${closestUseful.distanceScore}`}>
                {closestUseful.distanceLabel}
              </span>
              <small>Origin: {origin.label}</small>
            </>
          ) : (
            <>
              <span>No useful city yet.</span>
              <small>Analyze a good first.</small>
            </>
          )}
        </DossierCard>

        <DossierCard title="Data freshness" icon={<PackageSearch size={18} />} empty={!allRows.length}>
          {allRows.length ? (
            <>
              <strong>{allRows.length} known offers</strong>
              <span>Fresh rows: {freshness.freshCount}</span>
              <span>Old rows: {freshness.oldCount}</span>
              <small>Newest: {freshness.newest ? ageText(freshness.newest.capturedAtUtc) : 'Unknown'}</small>
              <small>Oldest: {freshness.oldest ? ageText(freshness.oldest.capturedAtUtc) : 'Unknown'}</small>
            </>
          ) : (
            <>
              <span>No data loaded.</span>
              <small>Analyze a good to inspect data age.</small>
            </>
          )}
        </DossierCard>
      </section>

      <section className="card">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h3>Buy offers</h3>
              <p className="muted">Known cities where this good can be bought.</p>
            </div>
          </div>

          <SortableTable
            columns={priceColumns}
            rows={buyRows}
            emptyMessage="No buy offers found yet."
            initialSortKey="price"
            initialDirection="asc"
          />
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h3>Sell offers</h3>
              <p className="muted">Known cities where this good can be sold.</p>
            </div>
          </div>

          <SortableTable
            columns={priceColumns}
            rows={sellRows}
            emptyMessage="No sell offers found yet."
            initialSortKey="price"
            initialDirection="desc"
          />
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h3>Market coverage</h3>
              <p className="muted">Known offer coverage grouped by main region.</p>
            </div>
          </div>

          <SortableTable
            columns={coverageColumns}
            rows={coverageRows}
            emptyMessage="No market coverage loaded yet."
            initialSortKey="totalOffers"
            initialDirection="desc"
          />
        </div>
      </section>
    </div>
  );
}
