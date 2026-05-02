import React, { useMemo, useState } from 'react';
import { Anchor, Compass, Eraser, MapPin, Route, Search, Sparkles, Target, TrendingUp } from 'lucide-react';

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

export const defaultTradingFilters = {
  city: '',
  item: '',
  tradeType: 'Any',
  mainRegion: '',
  subRegion: '',
  seaTradeRegion: '',
  buyMainRegion: '',
  buySubRegion: '',
  buySeaTradeRegion: '',
  sellMainRegion: '',
  sellSubRegion: '',
  sellSeaTradeRegion: '',
  routesPerItem: 1,
  minProfit: 1,
  take: 250
};

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

    return {
      mainRegions: uniqueSorted(cities.map((city) => city.mainRegion)),
      subRegions: uniqueSorted(filteredGeneral.map((city) => city.subRegion)),
      seaTradeRegions: uniqueSorted(filteredGeneral.map((city) => city.seaTradeRegion))
    };
  }, [cities, filters.mainRegion, filters.subRegion]);

  const currentCity = useMemo(() => {
    const name = clean(latestCity?.city);
    if (!name || name.toLowerCase() === 'unknown') return null;
    return cities.find((city) => city.name.toLowerCase() === name.toLowerCase()) || null;
  }, [cities, latestCity]);

  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const updateRegion = (key, value) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === 'mainRegion') { next.subRegion = ''; next.seaTradeRegion = ''; }
      if (key === 'subRegion') next.seaTradeRegion = '';
      if (key === 'buyMainRegion') { next.buySubRegion = ''; next.buySeaTradeRegion = ''; }
      if (key === 'buySubRegion') next.buySeaTradeRegion = '';
      if (key === 'sellMainRegion') { next.sellSubRegion = ''; next.sellSeaTradeRegion = ''; }
      if (key === 'sellSubRegion') next.sellSeaTradeRegion = '';
      return next;
    });
  };

  const clearAll = () => {
    setActivePreset('best');
    setFilters({ ...defaultTradingFilters });
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
        sellMainRegion: '',
        sellSubRegion: '',
        sellSeaTradeRegion: '',
        routesPerItem: 10
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
        sellSeaTradeRegion: currentCity.seaTradeRegion || '',
        routesPerItem: 10
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
        sellSeaTradeRegion: '',
        routesPerItem: 1,
        minProfit: 1
      }));
      return;
    }

    if (preset === 'good-routes') {
      setFilters((current) => ({ ...current, routesPerItem: 25, tradeType: 'Any' }));
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
    sellSeaTradeRegion: filters.sellSeaTradeRegion,
    item: filters.item,
    routesPerItem: filters.routesPerItem,
    take: filters.take,
    minProfit: filters.minProfit
  };

  const presetButtons = [
    { key: 'best', icon: Sparkles, label: 'Best everywhere', hint: 'No region restriction' },
    { key: 'near-current', icon: MapPin, label: 'Near current city', hint: currentCity ? currentCity.name : 'Needs known city' },
    { key: 'same-sea', icon: Anchor, label: 'Same sea route', hint: currentCity?.seaTradeRegion || 'Needs known city' },
    { key: 'good-routes', icon: Compass, label: 'Best routes for good', hint: filters.item ? filters.item : 'Choose a good first' }
  ];

  return (
    <section className="deal-helper">
      <div className="deal-helper-header">
        <div>
          <h3><Target size={20} /> Deal helper</h3>
          <p className="muted">
            Sort columns in the result tables, type directly in any field, and use quick presets for profitable routes.
          </p>
        </div>
        <div className="current-city-chip"><MapPin size={15} /> Current: {currentCity ? cityLabel(currentCity) : 'Unknown'}</div>
      </div>

      <div className="preset-grid">
        {presetButtons.map((preset) => {
          const Icon = preset.icon;
          return (
            <button type="button" key={preset.key} className={`preset-card ${activePreset === preset.key ? 'active' : ''}`} onClick={() => applyPreset(preset.key)}>
              <Icon size={18} />
              <strong>{preset.label}</strong>
              <small>{preset.hint}</small>
            </button>
          );
        })}
      </div>

      <datalist id="city-options">{cities.map((city) => <option key={city.name} value={city.name}>{cityLabel(city)}</option>)}</datalist>
      <datalist id="good-options">{tradeGoods.map((good) => <option key={good.name} value={good.name}>{good.type}</option>)}</datalist>
      <datalist id="main-region-options">{regionOptions.mainRegions.map((region) => <option key={region} value={region} />)}</datalist>
      <datalist id="sub-region-options">{regionOptions.subRegions.map((region) => <option key={region} value={region} />)}</datalist>
      <datalist id="sea-region-options">{regionOptions.seaTradeRegions.map((region) => <option key={region} value={region} />)}</datalist>

      <div className="deal-filter-grid">
        <label className="field"><span>City</span><input className="input" list="city-options" value={filters.city} onChange={(e) => update('city', e.target.value)} placeholder="Type city or choose..." /></label>
        <label className="field"><span>Trade good</span><input className="input" list="good-options" value={filters.item} onChange={(e) => update('item', e.target.value)} placeholder="Type good or choose..." /></label>
        <label className="field"><span>Trade type</span><select className="input" value={filters.tradeType} onChange={(e) => update('tradeType', e.target.value)}><option>Any</option><option>Buy</option><option>Sell</option></select></label>
        <label className="field"><span>Result limit</span><input className="input" type="number" min="1" max="500" value={filters.take} onChange={(e) => update('take', Number(e.target.value || 250))} /></label>
      </div>

      <div className="region-panels">
        <div className="region-panel">
          <h4>General search area</h4>
          <input className="input" list="main-region-options" placeholder="Main region" value={filters.mainRegion} onChange={(e) => updateRegion('mainRegion', e.target.value)} />
          <input className="input" list="sub-region-options" placeholder="Sub region" value={filters.subRegion} onChange={(e) => updateRegion('subRegion', e.target.value)} />
          <input className="input" list="sea-region-options" placeholder="Sea trade region" value={filters.seaTradeRegion} onChange={(e) => updateRegion('seaTradeRegion', e.target.value)} />
        </div>
        <div className="region-panel buy-panel">
          <h4>Buy side</h4>
          <input className="input" list="main-region-options" placeholder="Buy main region" value={filters.buyMainRegion} onChange={(e) => updateRegion('buyMainRegion', e.target.value)} />
          <input className="input" placeholder="Buy sub region" value={filters.buySubRegion} onChange={(e) => updateRegion('buySubRegion', e.target.value)} />
          <input className="input" placeholder="Buy sea trade region" value={filters.buySeaTradeRegion} onChange={(e) => updateRegion('buySeaTradeRegion', e.target.value)} />
        </div>
        <div className="region-panel sell-panel">
          <h4>Sell side</h4>
          <input className="input" list="main-region-options" placeholder="Sell main region" value={filters.sellMainRegion} onChange={(e) => updateRegion('sellMainRegion', e.target.value)} />
          <input className="input" placeholder="Sell sub region" value={filters.sellSubRegion} onChange={(e) => updateRegion('sellSubRegion', e.target.value)} />
          <input className="input" placeholder="Sell sea trade region" value={filters.sellSeaTradeRegion} onChange={(e) => updateRegion('sellSeaTradeRegion', e.target.value)} />
        </div>
      </div>

      <div className="advanced-route-options">
        <label className="field"><span>Profitable routes per good</span><input className="input" type="number" min="1" max="100" value={filters.routesPerItem} onChange={(e) => update('routesPerItem', Number(e.target.value || 1))} /></label>
        <label className="field"><span>Minimum profit</span><input className="input" type="number" min="1" value={filters.minProfit} onChange={(e) => update('minProfit', Number(e.target.value || 1))} /></label>
      </div>

      <div className="quick-region-list">
        {regionOptions.mainRegions.slice(0, 10).map((region) => <button key={region} type="button" className="region-chip" onClick={() => updateRegion('mainRegion', region)}>{region}</button>)}
      </div>

      <div className="deal-actions">
        <button type="button" className="button button-primary" onClick={() => onSearch('search')}><Search size={16} /> Search deals</button>
        <button type="button" className="button button-secondary" onClick={() => onSearch('city')} disabled={!clean(filters.city)}><MapPin size={16} /> Goods in city</button>
        <button type="button" className="button button-secondary" onClick={() => onSearch('good')} disabled={!clean(filters.item)}><TrendingUp size={16} /> Locations for good</button>
        <button type="button" className="button button-success" onClick={() => onRecommendations(recommendationFilter)}><Route size={16} /> Best route</button>
        <button type="button" className="button button-secondary" onClick={clearAll}><Eraser size={16} /> Clear form</button>
      </div>
    </section>
  );
}
