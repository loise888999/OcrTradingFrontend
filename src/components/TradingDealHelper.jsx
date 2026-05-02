import React, { useMemo, useState } from 'react';
import { Anchor, Compass, MapPin, Route, Search, Sparkles, Target, TrendingUp } from 'lucide-react';

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function cityLabel(city) {
  if (!city) return '';
  return `${city.name}${city.subRegion ? ` — ${city.subRegion}` : ''}${city.mainRegion ? ` (${city.mainRegion})` : ''}`;
}

export default function TradingDealHelper({
  cities,
  tradeGoods,
  filters,
  setFilters,
  onSearch,
  onRecommendations,
  latestCity
}) {
  const [activePreset, setActivePreset] = useState('best');

  const regionOptions = useMemo(() => {
    const filteredGeneral = cities
      .filter((city) => !filters.mainRegion || city.mainRegion === filters.mainRegion)
      .filter((city) => !filters.subRegion || city.subRegion === filters.subRegion);

    const filteredBuy = cities
      .filter((city) => !filters.buyMainRegion || city.mainRegion === filters.buyMainRegion)
      .filter((city) => !filters.buySubRegion || city.subRegion === filters.buySubRegion);

    const filteredSell = cities
      .filter((city) => !filters.sellMainRegion || city.mainRegion === filters.sellMainRegion)
      .filter((city) => !filters.sellSubRegion || city.subRegion === filters.sellSubRegion);

    return {
      mainRegions: uniqueSorted(cities.map((city) => city.mainRegion)),
      subRegions: uniqueSorted(filteredGeneral.map((city) => city.subRegion)),
      seaTradeRegions: uniqueSorted(filteredGeneral.map((city) => city.seaTradeRegion)),
      buyMainRegions: uniqueSorted(cities.map((city) => city.mainRegion)),
      buySubRegions: uniqueSorted(filteredBuy.map((city) => city.subRegion)),
      buySeaTradeRegions: uniqueSorted(filteredBuy.map((city) => city.seaTradeRegion)),
      sellMainRegions: uniqueSorted(cities.map((city) => city.mainRegion)),
      sellSubRegions: uniqueSorted(filteredSell.map((city) => city.subRegion)),
      sellSeaTradeRegions: uniqueSorted(filteredSell.map((city) => city.seaTradeRegion))
    };
  }, [cities, filters]);

  const currentCity = useMemo(() => {
    const name = clean(latestCity?.city);
    if (!name || name.toLowerCase() === 'unknown') return null;
    return cities.find((city) => city.name.toLowerCase() === name.toLowerCase()) || null;
  }, [cities, latestCity]);

  const update = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const updateRegion = (key, value) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };

      if (key === 'mainRegion') {
        next.subRegion = '';
        next.seaTradeRegion = '';
      }
      if (key === 'subRegion') next.seaTradeRegion = '';

      if (key === 'buyMainRegion') {
        next.buySubRegion = '';
        next.buySeaTradeRegion = '';
      }
      if (key === 'buySubRegion') next.buySeaTradeRegion = '';

      if (key === 'sellMainRegion') {
        next.sellSubRegion = '';
        next.sellSeaTradeRegion = '';
      }
      if (key === 'sellSubRegion') next.sellSeaTradeRegion = '';

      return next;
    });
  };

  const applyPreset = (preset) => {
    setActivePreset(preset);

    if (preset === 'near-current' && currentCity) {
      setFilters((current) => ({
        ...current,
        city: currentCity.name,
        mainRegion: currentCity.mainRegion || '',
        subRegion: currentCity.subRegion || '',
        seaTradeRegion: currentCity.seaTradeRegion || '',
        buyMainRegion: currentCity.mainRegion || '',
        buySubRegion: currentCity.subRegion || '',
        buySeaTradeRegion: currentCity.seaTradeRegion || '',
        sellMainRegion: currentCity.mainRegion || '',
        sellSubRegion: '',
        sellSeaTradeRegion: ''
      }));
      return;
    }

    if (preset === 'same-sea' && currentCity) {
      setFilters((current) => ({
        ...current,
        mainRegion: '',
        subRegion: '',
        seaTradeRegion: currentCity.seaTradeRegion || '',
        buySeaTradeRegion: currentCity.seaTradeRegion || '',
        sellSeaTradeRegion: currentCity.seaTradeRegion || ''
      }));
      return;
    }

    if (preset === 'best') {
      setFilters((current) => ({
        ...current,
        tradeType: 'Any',
        mainRegion: '',
        subRegion: '',
        seaTradeRegion: '',
        buyMainRegion: '',
        buySubRegion: '',
        buySeaTradeRegion: '',
        sellMainRegion: '',
        sellSubRegion: '',
        sellSeaTradeRegion: ''
      }));
      return;
    }

    if (preset === 'buy-here-sell-away' && currentCity) {
      setFilters((current) => ({
        ...current,
        buyMainRegion: currentCity.mainRegion || '',
        buySubRegion: currentCity.subRegion || '',
        buySeaTradeRegion: currentCity.seaTradeRegion || '',
        sellMainRegion: '',
        sellSubRegion: '',
        sellSeaTradeRegion: ''
      }));
    }
  };

  const recommendationFilter = {
    mainRegion: filters.mainRegion,
    subRegion: filters.subRegion,
    seaTradeRegion: filters.seaTradeRegion,
    buyMainRegion: filters.buyMainRegion,
    buySubRegion: filters.buySubRegion,
    buySeaTradeRegion: filters.buySeaTradeRegion,
    sellMainRegion: filters.sellMainRegion,
    sellSubRegion: filters.sellSubRegion,
    sellSeaTradeRegion: filters.sellSeaTradeRegion
  };

  const presetButtons = [
    { key: 'best', icon: Sparkles, label: 'Best everywhere', hint: 'No region restriction' },
    { key: 'near-current', icon: MapPin, label: 'Near current city', hint: currentCity ? currentCity.name : 'Needs known city' },
    { key: 'same-sea', icon: Anchor, label: 'Same sea route', hint: currentCity?.seaTradeRegion || 'Needs known city' },
    { key: 'buy-here-sell-away', icon: Compass, label: 'Buy here, sell away', hint: currentCity ? currentCity.subRegion : 'Needs known city' }
  ];

  return (
    <section className="deal-helper">
      <div className="deal-helper-header">
        <div>
          <h3><Target size={20} /> Deal helper</h3>
          <p className="muted">
            Type directly in any field, or use quick presets and region lists to find nearby routes or cross-region opportunities.
          </p>
        </div>
        <div className="current-city-chip">
          <MapPin size={15} /> Current: {currentCity ? cityLabel(currentCity) : 'Unknown'}
        </div>
      </div>

      <div className="preset-grid">
        {presetButtons.map((preset) => {
          const Icon = preset.icon;
          return (
            <button
              type="button"
              key={preset.key}
              className={`preset-card ${activePreset === preset.key ? 'active' : ''}`}
              onClick={() => applyPreset(preset.key)}
            >
              <Icon size={18} />
              <strong>{preset.label}</strong>
              <small>{preset.hint}</small>
            </button>
          );
        })}
      </div>

      <datalist id="city-options">
        {cities.map((city) => <option key={city.name} value={city.name}>{cityLabel(city)}</option>)}
      </datalist>
      <datalist id="good-options">
        {tradeGoods.map((good) => <option key={good.name} value={good.name}>{good.type}</option>)}
      </datalist>
      <datalist id="main-region-options">
        {regionOptions.mainRegions.map((region) => <option key={region} value={region} />)}
      </datalist>
      <datalist id="sub-region-options">
        {regionOptions.subRegions.map((region) => <option key={region} value={region} />)}
      </datalist>
      <datalist id="sea-region-options">
        {regionOptions.seaTradeRegions.map((region) => <option key={region} value={region} />)}
      </datalist>

      <div className="deal-filter-grid">
        <label className="field">
          <span>City</span>
          <input className="input" list="city-options" value={filters.city} onChange={(event) => update('city', event.target.value)} placeholder="Type city or choose..." />
        </label>
        <label className="field">
          <span>Trade good</span>
          <input className="input" list="good-options" value={filters.item} onChange={(event) => update('item', event.target.value)} placeholder="Type good or choose..." />
        </label>
        <label className="field">
          <span>Trade type</span>
          <select className="input" value={filters.tradeType} onChange={(event) => update('tradeType', event.target.value)}>
            <option>Any</option>
            <option>Buy</option>
            <option>Sell</option>
          </select>
        </label>
        <label className="field">
          <span>Result limit</span>
          <input className="input" type="number" min="1" max="2000" value={filters.take} onChange={(event) => update('take', Number(event.target.value || 250))} />
        </label>
      </div>

      <div className="region-panels">
        <div className="region-panel">
          <h4>General search area</h4>
          <input className="input" list="main-region-options" placeholder="Main region" value={filters.mainRegion} onChange={(event) => updateRegion('mainRegion', event.target.value)} />
          <input className="input" list="sub-region-options" placeholder="Sub region" value={filters.subRegion} onChange={(event) => updateRegion('subRegion', event.target.value)} />
          <input className="input" list="sea-region-options" placeholder="Sea trade region" value={filters.seaTradeRegion} onChange={(event) => updateRegion('seaTradeRegion', event.target.value)} />
        </div>

        <div className="region-panel buy-panel">
          <h4>Buy side</h4>
          <input className="input" list="main-region-options" placeholder="Buy main region" value={filters.buyMainRegion} onChange={(event) => updateRegion('buyMainRegion', event.target.value)} />
          <input className="input" placeholder="Buy sub region" value={filters.buySubRegion} onChange={(event) => updateRegion('buySubRegion', event.target.value)} />
          <input className="input" placeholder="Buy sea trade region" value={filters.buySeaTradeRegion} onChange={(event) => updateRegion('buySeaTradeRegion', event.target.value)} />
        </div>

        <div className="region-panel sell-panel">
          <h4>Sell side</h4>
          <input className="input" list="main-region-options" placeholder="Sell main region" value={filters.sellMainRegion} onChange={(event) => updateRegion('sellMainRegion', event.target.value)} />
          <input className="input" placeholder="Sell sub region" value={filters.sellSubRegion} onChange={(event) => updateRegion('sellSubRegion', event.target.value)} />
          <input className="input" placeholder="Sell sea trade region" value={filters.sellSeaTradeRegion} onChange={(event) => updateRegion('sellSeaTradeRegion', event.target.value)} />
        </div>
      </div>

      <div className="quick-region-list">
        {regionOptions.mainRegions.slice(0, 10).map((region) => (
          <button key={region} type="button" className="region-chip" onClick={() => updateRegion('mainRegion', region)}>
            {region}
          </button>
        ))}
      </div>

      <div className="deal-actions">
        <button type="button" className="button button-primary" onClick={() => onSearch('search')}>
          <Search size={16} /> Search deals
        </button>
        <button type="button" className="button button-secondary" onClick={() => onSearch('city')} disabled={!clean(filters.city)}>
          <MapPin size={16} /> Goods in city
        </button>
        <button type="button" className="button button-secondary" onClick={() => onSearch('good')} disabled={!clean(filters.item)}>
          <TrendingUp size={16} /> Locations for good
        </button>
        <button type="button" className="button button-success" onClick={() => onRecommendations(recommendationFilter)}>
          <Route size={16} /> Find best route
        </button>
      </div>
    </section>
  );
}
