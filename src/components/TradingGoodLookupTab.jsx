import React, { useMemo, useState } from 'react';
import {
  Compass,
  Eraser,
  MapPin,
  PackageSearch,
  Search,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';
import SortableTable from './SortableTable.jsx';

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

function isFreshEnough(value) {
  const tone = freshnessTone(value);
  return tone === 'fresh' || tone === 'ok';
}

function getCurrentCityInfo(cities, latestCity) {
  const currentName = sanitizeCityName(latestCity?.city);
  if (!currentName) return { name: '', city: null };

  const city = cities.find(
    (item) => String(item.name || '').toLowerCase() === currentName.toLowerCase()
  );

  return { name: currentName, city: city || null };
}

function findCity(cities, cityName) {
  if (!cityName) return null;

  return (
    cities.find((city) => String(city.name || '').toLowerCase() === String(cityName).toLowerCase()) ||
    null
  );
}

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

function toggleValue(values, value) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function PriceAgeBadge({ value }) {
  const tone = freshnessTone(value);
  return <span className={`price-age price-age-${tone}`}>{ageText(value)}</span>;
}

function ResultCard({ title, icon, children, empty }) {
  return (
    <section className={`good-result-card ${empty ? 'empty' : ''}`}>
      <div className="good-result-title">
        {icon}
        <strong>{title}</strong>
      </div>

      <div className="good-result-body">{children}</div>
    </section>
  );
}

function MainRegionPicker({ regions, selected, onChange }) {
  return (
    <div className="good-region-grid">
      {regions.map((region) => (
        <button
          key={region}
          type="button"
          className={`good-region-button ${selected.includes(region) ? 'selected' : ''}`}
          onClick={() => onChange(toggleValue(selected, region))}
        >
          {region}
        </button>
      ))}
    </div>
  );
}

function groupBestOfferPerGood(rows, tradeAction) {
  return Object.values(
    rows.reduce((acc, row) => {
      const key = row.itemName || row.item || 'Unknown';

      if (!acc[key]) {
        acc[key] = row;
        return acc;
      }

      const currentPrice = numberValue(acc[key].price);
      const nextPrice = numberValue(row.price);

      if (tradeAction === 'buy' && nextPrice < currentPrice) {
        acc[key] = row;
      }

      if (tradeAction === 'sell' && nextPrice > currentPrice) {
        acc[key] = row;
      }

      return acc;
    }, {})
  );
}

function buildComparisonLookup(rows, tradeAction) {
  return rows.reduce((acc, row) => {
    const key = String(row.itemName || '').toLowerCase();
    if (!key) return acc;

    if (!acc[key]) {
      acc[key] = row;
      return acc;
    }

    const currentPrice = numberValue(acc[key].price);
    const nextPrice = numberValue(row.price);

    // If user wants to buy, comparison is best sell price, so highest sell.
    if (tradeAction === 'buy' && nextPrice > currentPrice) {
      acc[key] = row;
    }

    // If user wants to sell, comparison is best known buy price, so lowest buy.
    if (tradeAction === 'sell' && nextPrice < currentPrice) {
      acc[key] = row;
    }

    return acc;
  }, {});
}

function sortRows(rows, sortMode, tradeAction) {
  const sorted = [...rows];

  if (sortMode === 'closest') {
    return sorted.sort((a, b) => {
      const distanceDiff = numberValue(a.distanceScore) - numberValue(b.distanceScore);
      if (distanceDiff !== 0) return distanceDiff;

      return tradeAction === 'buy'
        ? numberValue(a.price) - numberValue(b.price)
        : numberValue(b.price) - numberValue(a.price);
    });
  }

  if (sortMode === 'balanced') {
    return sorted.sort((a, b) => {
      const aScore =
        tradeAction === 'buy'
          ? numberValue(a.distanceScore) * 100000 + numberValue(a.price)
          : numberValue(a.distanceScore) * 100000 - numberValue(a.price);

      const bScore =
        tradeAction === 'buy'
          ? numberValue(b.distanceScore) * 100000 + numberValue(b.price)
          : numberValue(b.distanceScore) * 100000 - numberValue(b.price);

      return aScore - bScore;
    });
  }

  if (sortMode === 'profit') {
    return sorted.sort((a, b) => {
      const profitDiff = numberValue(b.potentialProfit) - numberValue(a.potentialProfit);
      if (profitDiff !== 0) return profitDiff;

      return tradeAction === 'buy'
        ? numberValue(a.price) - numberValue(b.price)
        : numberValue(b.price) - numberValue(a.price);
    });
  }

  return tradeAction === 'buy'
    ? sorted.sort((a, b) => numberValue(a.price) - numberValue(b.price))
    : sorted.sort((a, b) => numberValue(b.price) - numberValue(a.price));
}

function getBestRows(rows, tradeAction) {
  const bestPrice =
    [...rows].sort((a, b) =>
      tradeAction === 'buy'
        ? numberValue(a.price) - numberValue(b.price)
        : numberValue(b.price) - numberValue(a.price)
    )[0] || null;

  const closest =
    [...rows].sort((a, b) => {
      const distanceDiff = numberValue(a.distanceScore) - numberValue(b.distanceScore);
      if (distanceDiff !== 0) return distanceDiff;

      return tradeAction === 'buy'
        ? numberValue(a.price) - numberValue(b.price)
        : numberValue(b.price) - numberValue(a.price);
    })[0] || null;

  const profit =
    [...rows].sort((a, b) => {
      const profitDiff = numberValue(b.potentialProfit) - numberValue(a.potentialProfit);
      if (profitDiff !== 0) return profitDiff;

      return tradeAction === 'buy'
        ? numberValue(a.price) - numberValue(b.price)
        : numberValue(b.price) - numberValue(a.price);
    })[0] || null;

  return { bestPrice, closest, profit };
}

const emptyAdvancedFilters = {
  item: '',
  type: '',
  mainRegion: '',
  subRegion: '',
  seaTradeRegion: '',
  take: 500
};

export default function TradingGoodLookupTab({ cities, tradeGoods, latestCity, run, api }) {
  const [mode, setMode] = useState('simple');
  const [tradeAction, setTradeAction] = useState('buy');

  const [item, setItem] = useState('');
  const [type, setType] = useState('');
  const [selectedMainRegions, setSelectedMainRegions] = useState([]);
  const [locationMode, setLocationMode] = useState('current');
  const [referenceCityName, setReferenceCityName] = useState('');
  const [sortMode, setSortMode] = useState('balanced');
  const [showAllOffers, setShowAllOffers] = useState(true);
  const [includeProfit, setIncludeProfit] = useState(true);
  const [onlyFreshPrices, setOnlyFreshPrices] = useState(false);
  const [take, setTake] = useState(500);

  const [advancedFilters, setAdvancedFilters] = useState({ ...emptyAdvancedFilters });

  const [rows, setRows] = useState([]);
  const [rawPrimaryRows, setRawPrimaryRows] = useState([]);
  const [rawComparisonRows, setRawComparisonRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastSearchAt, setLastSearchAt] = useState(null);

  const currentCityInfo = useMemo(
    () => getCurrentCityInfo(cities, latestCity),
    [cities, latestCity]
  );

  const referenceCity = useMemo(() => {
    if (locationMode === 'current') return currentCityInfo.city;
    if (locationMode === 'selected') return findCity(cities, referenceCityName);
    return null;
  }, [locationMode, referenceCityName, currentCityInfo.city, cities]);

  const options = useMemo(() => {
    const filteredForAdvancedSub = cities.filter(
      (city) => !advancedFilters.mainRegion || city.mainRegion === advancedFilters.mainRegion
    );

    const filteredForAdvancedSea = filteredForAdvancedSub.filter(
      (city) => !advancedFilters.subRegion || city.subRegion === advancedFilters.subRegion
    );

    return {
      cityNames: uniqueSorted(cities.map((city) => city.name)),
      types: uniqueSorted(tradeGoods.map((good) => good.type)),
      mainRegions: uniqueSorted(cities.map((city) => city.mainRegion)),
      subRegions: uniqueSorted(filteredForAdvancedSub.map((city) => city.subRegion)),
      seaTradeRegions: uniqueSorted(filteredForAdvancedSea.map((city) => city.seaTradeRegion))
    };
  }, [cities, tradeGoods, advancedFilters.mainRegion, advancedFilters.subRegion]);

  const bestRows = useMemo(() => getBestRows(rows, tradeAction), [rows, tradeAction]);

  const actionText = tradeAction === 'buy'
    ? {
        title: 'Find where to buy',
        description: 'Find where to buy a good. Sort by cheapest, closest, balanced, or best potential profit.',
        primaryTradeType: 'Buy',
        comparisonTradeType: 'Sell',
        priceLabel: 'Buy Price',
        cityLabel: 'Buy City',
        bestPriceTitle: 'Cheapest buy offer',
        closestTitle: 'Closest buy offer',
        profitTitle: 'Best potential profit',
        showAllLabel: 'Show all buy offers',
        noResultText: 'Search a good or region to load buy offers.',
        actionVerb: 'Buy',
        comparisonVerb: 'Sell',
        comparisonColumn: 'Best Sell',
        comparedText: 'known sell price'
      }
    : {
        title: 'Find where to sell',
        description: 'Find the best places to sell a good. Sort by highest price, closest, balanced, or best profit.',
        primaryTradeType: 'Sell',
        comparisonTradeType: 'Buy',
        priceLabel: 'Sell Price',
        cityLabel: 'Sell City',
        bestPriceTitle: 'Highest sell offer',
        closestTitle: 'Closest sell offer',
        profitTitle: 'Best sell profit',
        showAllLabel: 'Show all sell offers',
        noResultText: 'Search a good or region to load sell offers.',
        actionVerb: 'Sell',
        comparisonVerb: 'Buy',
        comparisonColumn: 'Best Buy',
        comparedText: 'known buy price'
      };

  const updateAdvanced = (key, value) => {
    setAdvancedFilters((current) => {
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

  const useCurrentMainRegion = () => {
    const region = currentCityInfo.city?.mainRegion;
    if (!region) return;

    setSelectedMainRegions((current) => uniqueSorted([...current, region]));
    setLocationMode('current');
  };

  const clear = () => {
    setItem('');
    setType('');
    setSelectedMainRegions([]);
    setLocationMode('current');
    setReferenceCityName('');
    setSortMode('balanced');
    setShowAllOffers(true);
    setIncludeProfit(true);
    setOnlyFreshPrices(false);
    setTake(500);
    setAdvancedFilters({ ...emptyAdvancedFilters });
    setRows([]);
    setRawPrimaryRows([]);
    setRawComparisonRows([]);
    setLastSearchAt(null);
  };

  const buildSearchPayload = () => {
    if (mode === 'advanced') {
      return {
        item: advancedFilters.item,
        type: advancedFilters.type,
        mainRegion: advancedFilters.mainRegion,
        subRegion: advancedFilters.subRegion,
        seaTradeRegion: advancedFilters.seaTradeRegion,
        take: advancedFilters.take
      };
    }

    return {
      item,
      type,
      mainRegion: '',
      subRegion: '',
      seaTradeRegion: '',
      take
    };
  };

  const applyFrontendFiltersAndSorting = (primaryRows, comparisonRows) => {
    const comparisonLookup = buildComparisonLookup(comparisonRows, tradeAction);

    let enriched = primaryRows.map((row) => {
      const comparison = comparisonLookup[String(row.itemName || '').toLowerCase()];
      const distanceScore = getDistanceScore(row, referenceCity);
      const primaryPrice = numberValue(row.price);
      const comparisonPrice = comparison ? numberValue(comparison.price) : null;

      return {
        ...row,
        price: primaryPrice,
        distanceScore,
        distanceLabel: getDistanceLabel(distanceScore),
        comparisonCity: comparison?.city || '',
        comparisonPrice,
        potentialProfit:
          comparisonPrice === null
            ? null
            : tradeAction === 'buy'
              ? comparisonPrice - primaryPrice
              : primaryPrice - comparisonPrice,
        comparisonCapturedAtUtc: comparison?.capturedAtUtc || null
      };
    });

    if (mode === 'simple' && selectedMainRegions.length > 0) {
      enriched = enriched.filter((row) => selectedMainRegions.includes(row.mainRegion));
    }

    if (onlyFreshPrices) {
      enriched = enriched.filter((row) => isFreshEnough(row.capturedAtUtc));
    }

    if (!showAllOffers) {
      enriched = groupBestOfferPerGood(enriched, tradeAction);
    }

    return sortRows(enriched, sortMode, tradeAction);
  };

  const search = async () => {
    const payload = buildSearchPayload();

    setLoading(true);

    const [primaryData, comparisonData] = await Promise.all([
      run(
        () =>
          api.getKnownPrices({
            ...payload,
            tradeType: actionText.primaryTradeType
          }),
        `Could not load ${actionText.primaryTradeType.toLowerCase()} offers`
      ),

      includeProfit
        ? run(
            () =>
              api.getKnownPrices({
                item: payload.item,
                type: payload.type,
                tradeType: actionText.comparisonTradeType,
                take: payload.take
              }),
            `Could not load ${actionText.comparisonTradeType.toLowerCase()} prices`
          )
        : Promise.resolve([])
    ]);

    const primary = primaryData || [];
    const comparison = comparisonData || [];

    setRawPrimaryRows(primary);
    setRawComparisonRows(comparison);
    setRows(applyFrontendFiltersAndSorting(primary, comparison));
    setLastSearchAt(new Date());
    setLoading(false);
  };

  const columns = [
    { key: 'itemName', label: 'Good', sortable: true },
    { key: 'tradeGoodType', label: 'Type', sortable: true },
    {
      key: 'price',
      label: actionText.priceLabel,
      sortable: true,
      defaultDirection: tradeAction === 'buy' ? 'asc' : 'desc',
      render: (row) => <strong>{row.price}</strong>
    },
    { key: 'city', label: actionText.cityLabel, sortable: true },
    { key: 'mainRegion', label: 'Main Region', sortable: true },
    { key: 'subRegion', label: 'Sub Region', sortable: true },
    { key: 'seaTradeRegion', label: 'Sea Trade', sortable: true },
    {
      key: 'distanceScore',
      label: 'Closeness',
      sortable: true,
      defaultDirection: 'asc',
      render: (row) => (
        <span className={`closeness-pill closeness-${row.distanceScore}`}>
          {row.distanceLabel}
        </span>
      )
    },
    {
      key: 'potentialProfit',
      label: 'Potential Profit',
      sortable: true,
      defaultDirection: 'desc',
      render: (row) =>
        row.potentialProfit === null || row.potentialProfit === undefined ? (
          <span className="muted">Unknown</span>
        ) : (
          <span className={row.potentialProfit > 0 ? 'good-text' : 'bad-text'}>
            {row.potentialProfit > 0 ? '+' : ''}
            {row.potentialProfit}
          </span>
        )
    },
    {
      key: 'comparisonCity',
      label: actionText.comparisonColumn,
      sortable: true,
      render: (row) =>
        row.comparisonCity ? (
          <span>
            {row.comparisonCity} / {row.comparisonPrice}
          </span>
        ) : (
          <span className="muted">Unknown</span>
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

  return (
    <div className="trade-subtab-stack">
      <section className="card">
        <div className="card-body find-good-helper">
          <div className="find-good-header">
            <div>
              <h2>
                <PackageSearch size={22} /> Trade goods finder
              </h2>
              <p className="muted">{actionText.description}</p>
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

          <div className="trade-action-toggle">
            <button
              type="button"
              className={tradeAction === 'buy' ? 'active' : ''}
              onClick={() => {
                setTradeAction('buy');
                setRows([]);
                setRawPrimaryRows([]);
                setRawComparisonRows([]);
              }}
            >
              Find where to buy
            </button>

            <button
              type="button"
              className={tradeAction === 'sell' ? 'active' : ''}
              onClick={() => {
                setTradeAction('sell');
                setRows([]);
                setRawPrimaryRows([]);
                setRawComparisonRows([]);
              }}
            >
              Find where to sell
            </button>
          </div>

          <div className="current-city-strip">
            <span className="current-city-chip">
              <MapPin size={16} />
              Current OCR city: {currentCityInfo.name || 'Unknown'}
            </span>

            {currentCityInfo.city && (
              <>
                <span className="muted">
                  {currentCityInfo.city.mainRegion} / {currentCityInfo.city.subRegion} /{' '}
                  {currentCityInfo.city.seaTradeRegion}
                </span>

                <button type="button" className="link-button" onClick={useCurrentMainRegion}>
                  Use current main region
                </button>
              </>
            )}
          </div>

          <datalist id="find-good-options">
            {tradeGoods.map((good) => (
              <option key={good.name} value={good.name}>
                {good.type}
              </option>
            ))}
          </datalist>

          <datalist id="find-good-type-options">
            {options.types.map((goodType) => (
              <option key={goodType} value={goodType} />
            ))}
          </datalist>

          <datalist id="find-good-city-options">
            {options.cityNames.map((cityName) => (
              <option key={cityName} value={cityName} />
            ))}
          </datalist>

          <datalist id="find-good-main-region-options">
            {options.mainRegions.map((region) => (
              <option key={region} value={region} />
            ))}
          </datalist>

          <datalist id="find-good-sub-region-options">
            {options.subRegions.map((region) => (
              <option key={region} value={region} />
            ))}
          </datalist>

          <datalist id="find-good-sea-region-options">
            {options.seaTradeRegions.map((region) => (
              <option key={region} value={region} />
            ))}
          </datalist>

          {mode === 'simple' && (
            <div className="find-good-simple">
              <div className="simple-step">
                <div className="simple-step-title">
                  <span>1</span>
                  <div>
                    <strong>What good are you looking for?</strong>
                    <small>
                      You can search one good, a type, or leave it empty to browse all known {actionText.primaryTradeType.toLowerCase()} offers.
                    </small>
                  </div>
                </div>

                <div className="find-good-input-grid">
                  <label className="field">
                    <span>Good name</span>
                    <input
                      className="input"
                      list="find-good-options"
                      value={item}
                      onChange={(e) => setItem(e.target.value)}
                      placeholder="Example: Diamond"
                    />
                  </label>

                  <label className="field">
                    <span>Good type</span>
                    <input
                      className="input"
                      list="find-good-type-options"
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      placeholder="Any type"
                    />
                  </label>
                </div>
              </div>

              <div className="simple-step">
                <div className="simple-step-title">
                  <span>2</span>
                  <div>
                    <strong>Where do you want to search?</strong>
                    <small>Select main regions, or leave empty to search everywhere.</small>
                  </div>
                </div>

                <MainRegionPicker
                  regions={options.mainRegions}
                  selected={selectedMainRegions}
                  onChange={setSelectedMainRegions}
                />
              </div>

              <div className="simple-step">
                <div className="simple-step-title">
                  <span>3</span>
                  <div>
                    <strong>How should results be ranked?</strong>
                    <small>Closest uses city / sea trade / sub region / main region similarity.</small>
                  </div>
                </div>

                <div className="find-good-input-grid">
                  <label className="field">
                    <span>Reference location</span>
                    <select
                      className="input"
                      value={locationMode}
                      onChange={(e) => setLocationMode(e.target.value)}
                    >
                      <option value="current">Closest to current OCR city</option>
                      <option value="selected">Closest to selected city</option>
                      <option value="none">No closeness ranking</option>
                    </select>
                  </label>

                  {locationMode === 'selected' && (
                    <label className="field">
                      <span>Reference city</span>
                      <input
                        className="input"
                        list="find-good-city-options"
                        value={referenceCityName}
                        onChange={(e) => setReferenceCityName(e.target.value)}
                        placeholder="Choose city..."
                      />
                    </label>
                  )}

                  <label className="field">
                    <span>Sort by</span>
                    <select
                      className="input"
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value)}
                    >
                      <option value="balanced">
                        {tradeAction === 'buy' ? 'Balanced: close + cheap' : 'Balanced: close + high price'}
                      </option>
                      <option value="cheapest">
                        {tradeAction === 'buy' ? 'Cheapest price' : 'Highest sell price'}
                      </option>
                      <option value="closest">Closest location</option>
                      <option value="profit">Best potential profit</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>Limit</span>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="2000"
                      value={take}
                      onChange={(e) => setTake(Number(e.target.value || 500))}
                    />
                  </label>
                </div>

                <div className="find-good-checkbox-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={showAllOffers}
                      onChange={(e) => setShowAllOffers(e.target.checked)}
                    />
                    {actionText.showAllLabel}
                  </label>

                  <label>
                    <input
                      type="checkbox"
                      checked={includeProfit}
                      onChange={(e) => setIncludeProfit(e.target.checked)}
                    />
                    Show potential profit
                  </label>

                  <label>
                    <input
                      type="checkbox"
                      checked={onlyFreshPrices}
                      onChange={(e) => setOnlyFreshPrices(e.target.checked)}
                    />
                    Hide old prices
                  </label>
                </div>
              </div>
            </div>
          )}

          {mode === 'advanced' && (
            <div className="find-good-advanced">
              <div className="advanced-mode-title">
                <SlidersHorizontal size={18} />
                <strong>Advanced filters</strong>
                <span className="muted">Use exact region filters and more control.</span>
              </div>

              <div className="deal-filter-grid">
                <label className="field">
                  <span>Good name</span>
                  <input
                    className="input"
                    list="find-good-options"
                    value={advancedFilters.item}
                    onChange={(e) => updateAdvanced('item', e.target.value)}
                    placeholder="Type good name..."
                  />
                </label>

                <label className="field">
                  <span>Good type</span>
                  <input
                    className="input"
                    list="find-good-type-options"
                    value={advancedFilters.type}
                    onChange={(e) => updateAdvanced('type', e.target.value)}
                    placeholder="Any type"
                  />
                </label>

                <label className="field">
                  <span>Main region</span>
                  <input
                    className="input"
                    list="find-good-main-region-options"
                    value={advancedFilters.mainRegion}
                    onChange={(e) => updateAdvanced('mainRegion', e.target.value)}
                    placeholder="Any"
                  />
                </label>

                <label className="field">
                  <span>Sub region</span>
                  <input
                    className="input"
                    list="find-good-sub-region-options"
                    value={advancedFilters.subRegion}
                    onChange={(e) => updateAdvanced('subRegion', e.target.value)}
                    placeholder="Any"
                  />
                </label>

                <label className="field">
                  <span>Sea trade region</span>
                  <input
                    className="input"
                    list="find-good-sea-region-options"
                    value={advancedFilters.seaTradeRegion}
                    onChange={(e) => updateAdvanced('seaTradeRegion', e.target.value)}
                    placeholder="Any"
                  />
                </label>

                <label className="field">
                  <span>Reference city</span>
                  <input
                    className="input"
                    list="find-good-city-options"
                    value={referenceCityName}
                    onChange={(e) => {
                      setReferenceCityName(e.target.value);
                      setLocationMode('selected');
                    }}
                    placeholder="Optional"
                  />
                </label>

                <label className="field">
                  <span>Sort by</span>
                  <select
                    className="input"
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value)}
                  >
                    <option value="balanced">
                      {tradeAction === 'buy' ? 'Balanced: close + cheap' : 'Balanced: close + high price'}
                    </option>
                    <option value="cheapest">
                      {tradeAction === 'buy' ? 'Cheapest price' : 'Highest sell price'}
                    </option>
                    <option value="closest">Closest location</option>
                    <option value="profit">Best potential profit</option>
                  </select>
                </label>

                <label className="field">
                  <span>Limit</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="2000"
                    value={advancedFilters.take}
                    onChange={(e) => updateAdvanced('take', Number(e.target.value || 500))}
                  />
                </label>
              </div>

              <div className="find-good-checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={showAllOffers}
                    onChange={(e) => setShowAllOffers(e.target.checked)}
                  />
                  {actionText.showAllLabel}
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={includeProfit}
                    onChange={(e) => setIncludeProfit(e.target.checked)}
                  />
                  Show potential profit
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={onlyFreshPrices}
                    onChange={(e) => setOnlyFreshPrices(e.target.checked)}
                  />
                  Hide old prices
                </label>
              </div>
            </div>
          )}

          <div className="find-good-search-box">
            <div>
              <strong>Search summary</strong>
              <p className="muted">
                {actionText.title}
                {' — '}
                {mode === 'simple'
                  ? selectedMainRegions.length
                    ? `Regions: ${selectedMainRegions.join(', ')}`
                    : 'Searching everywhere'
                  : 'Using advanced filters'}
                {' — '}
                Sort: {sortMode}
              </p>
            </div>

            <div className="deal-actions">
              <button
                type="button"
                className="button button-primary big-action"
                onClick={search}
                disabled={loading}
              >
                <Search size={17} />
                {loading ? 'Searching...' : actionText.title}
              </button>

              <button type="button" className="button button-secondary" onClick={clear}>
                <Eraser size={16} /> Clear
              </button>
            </div>
          </div>

          {lastSearchAt && (
            <p className="mini-info">
              Showing {rows.length} result{rows.length === 1 ? '' : 's'} from {rawPrimaryRows.length} known{' '}
              {actionText.primaryTradeType.toLowerCase()} offer
              {rawPrimaryRows.length === 1 ? '' : 's'}.
              {includeProfit
                ? ` Compared with ${rawComparisonRows.length} ${actionText.comparedText}${rawComparisonRows.length === 1 ? '' : 's'}.`
                : ''}
              {' '}Last search: {lastSearchAt.toLocaleString()}.
            </p>
          )}
        </div>
      </section>

      <section className="find-good-results-grid">
        <ResultCard title={actionText.bestPriceTitle} icon={<Sparkles size={18} />} empty={!bestRows.bestPrice}>
          {bestRows.bestPrice ? (
            <>
              <strong>{bestRows.bestPrice.itemName}</strong>
              <span>
                {actionText.actionVerb} in <b>{bestRows.bestPrice.city}</b> for {bestRows.bestPrice.price}
              </span>
              <span>
                {bestRows.bestPrice.mainRegion} / {bestRows.bestPrice.subRegion}
              </span>
              <PriceAgeBadge value={bestRows.bestPrice.capturedAtUtc} />
            </>
          ) : (
            <>
              <span>No result yet.</span>
              <small>{actionText.noResultText}</small>
            </>
          )}
        </ResultCard>

        <ResultCard title={actionText.closestTitle} icon={<Compass size={18} />} empty={!bestRows.closest}>
          {bestRows.closest ? (
            <>
              <strong>{bestRows.closest.itemName}</strong>
              <span>
                {actionText.actionVerb} in <b>{bestRows.closest.city}</b> for {bestRows.closest.price}
              </span>
              <span className={`closeness-pill closeness-${bestRows.closest.distanceScore}`}>
                {bestRows.closest.distanceLabel}
              </span>
              <small>
                Reference: {referenceCity?.name || 'No reference city'}
              </small>
            </>
          ) : (
            <>
              <span>No closest result yet.</span>
              <small>Use current city or select a reference city.</small>
            </>
          )}
        </ResultCard>

        <ResultCard title={actionText.profitTitle} icon={<PackageSearch size={18} />} empty={!bestRows.profit}>
          {bestRows.profit ? (
            <>
              <strong>{bestRows.profit.itemName}</strong>
              <span>
                {actionText.actionVerb} in <b>{bestRows.profit.city}</b> for {bestRows.profit.price}
              </span>

              {bestRows.profit.comparisonCity ? (
                <>
                  <span>
                    {actionText.comparisonVerb} reference:{' '}
                    <b>{bestRows.profit.comparisonCity}</b> / {bestRows.profit.comparisonPrice}
                  </span>

                  <span className={bestRows.profit.potentialProfit > 0 ? 'summary-profit' : 'bad-text'}>
                    Potential profit: {bestRows.profit.potentialProfit > 0 ? '+' : ''}
                    {bestRows.profit.potentialProfit}
                  </span>
                </>
              ) : (
                <span className="muted">No comparison price known yet</span>
              )}
            </>
          ) : (
            <>
              <span>No profit result yet.</span>
              <small>Enable potential profit and search again.</small>
            </>
          )}
        </ResultCard>
      </section>

      <section className="card">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h3>{actionText.primaryTradeType} offers</h3>
              <p className="muted">
                This table can show all known {actionText.primaryTradeType.toLowerCase()} offers, not only the best one.
              </p>
            </div>
          </div>

          <SortableTable
            columns={columns}
            rows={rows}
            emptyMessage={`No ${actionText.primaryTradeType.toLowerCase()} offers found yet.`}
            initialSortKey={sortMode === 'closest' ? 'distanceScore' : sortMode === 'profit' ? 'potentialProfit' : 'price'}
            initialDirection={sortMode === 'profit' || tradeAction === 'sell' ? 'desc' : 'asc'}
          />
        </div>
      </section>
    </div>
  );
}