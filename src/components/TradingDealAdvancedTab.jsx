import React, { useMemo, useState } from 'react';
import { Eraser, Layers, Route, Search, TrendingUp } from 'lucide-react';
import SortableTable from './SortableTable.jsx';
import MultiSelectChips from './MultiSelectChips.jsx';

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
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

export default function TradingDealAdvancedTab({ cities, tradeGoods, run, api }) {
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [knownPrices, setKnownPrices] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [multiRoutes, setMultiRoutes] = useState([]);
  const [buyRegions, setBuyRegions] = useState([]);
  const [sellRegions, setSellRegions] = useState([]);

  const options = useMemo(() => {
    const filtered = cities.filter((city) => !filters.mainRegion || city.mainRegion === filters.mainRegion);
    return {
      types: uniqueSorted(tradeGoods.map((good) => good.type)),
      mainRegions: uniqueSorted(cities.map((city) => city.mainRegion)),
      subRegions: uniqueSorted(filtered.map((city) => city.subRegion)),
      seaTradeRegions: uniqueSorted(cities.map((city) => city.seaTradeRegion)),
      allRegions: uniqueSorted(cities.flatMap((city) => [city.mainRegion, city.subRegion, city.seaTradeRegion]))
    };
  }, [cities, tradeGoods, filters.mainRegion]);

  const update = (key, value) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === 'mainRegion') next.subRegion = '';
      return next;
    });
  };

  const clear = () => {
    setFilters({ ...emptyFilters });
    setKnownPrices([]);
    setRoutes([]);
    setMultiRoutes([]);
    setBuyRegions([]);
    setSellRegions([]);
  };

  const loadKnownPrices = async () => {
    const data = await run(() => api.getKnownPrices(filters), 'Could not load known prices');
    if (data) setKnownPrices(data);
  };

  const findRoutes = async () => {
    const data = await run(() => api.getAdvancedRoutes({ ...filters, buyRegions, sellRegions }), 'Could not find routes');
    if (data) setRoutes(data);
  };

  const findMultiRoutes = async () => {
    const data = await run(() => api.getMultiGoodRoutes({ ...filters, buyRegions, sellRegions }), 'Could not find multi-good routes');
    if (data) setMultiRoutes(data);
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
    { key: 'capturedAtUtc', label: 'Captured', sortable: true, render: (row) => row.capturedAtUtc ? new Date(row.capturedAtUtc).toLocaleString() : '' }
  ];

  const routeColumns = [
    { key: 'itemName', label: 'Good', sortable: true },
    { key: 'tradeGoodType', label: 'Type', sortable: true },
    { key: 'buyCity', label: 'Buy City', sortable: true },
    { key: 'buyPrice', label: 'Buy Price', sortable: true, defaultDirection: 'asc' },
    { key: 'sellCity', label: 'Sell City', sortable: true },
    { key: 'sellPrice', label: 'Sell Price', sortable: true, defaultDirection: 'desc' },
    { key: 'profit', label: 'Profit', sortable: true, defaultDirection: 'desc', render: (row) => <span className="good-text">{row.profit}</span> }
  ];

  const multiColumns = [
    { key: 'buyCity', label: 'Buy City', sortable: true },
    { key: 'sellCity', label: 'Sell City', sortable: true },
    { key: 'itemCount', label: 'Goods', sortable: true, defaultDirection: 'desc' },
    { key: 'totalProfit', label: 'Total Profit', sortable: true, defaultDirection: 'desc', render: (row) => <span className="good-text">{row.totalProfit}</span> },
    { key: 'items', label: 'Items', sortable: false, render: (row) => row.items?.map((item) => `${item.itemName} +${item.profit}`).join(', ') }
  ];

  return (
    <div className="trade-subtab-stack">
      <section className="card">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h2><TrendingUp size={22} /> Deal helper</h2>
              <p className="muted">Find sell prices, best routes, and optional multi-good routes. You can select multiple buy/sell regions at once.</p>
            </div>
          </div>

          <datalist id="deal-good-options">{tradeGoods.map((good) => <option key={good.name} value={good.name}>{good.type}</option>)}</datalist>
          <datalist id="deal-type-options">{options.types.map((type) => <option key={type} value={type} />)}</datalist>
          <datalist id="deal-main-region-options">{options.mainRegions.map((region) => <option key={region} value={region} />)}</datalist>
          <datalist id="deal-sub-region-options">{options.subRegions.map((region) => <option key={region} value={region} />)}</datalist>
          <datalist id="deal-sea-region-options">{options.seaTradeRegions.map((region) => <option key={region} value={region} />)}</datalist>

          <div className="deal-filter-grid">
            <label className="field"><span>Good name</span><input className="input" list="deal-good-options" value={filters.item} onChange={(e) => update('item', e.target.value)} placeholder="Optional good name..." /></label>
            <label className="field"><span>Good type</span><input className="input" list="deal-type-options" value={filters.type} onChange={(e) => update('type', e.target.value)} placeholder="Optional type..." /></label>
            <label className="field"><span>Known price trade</span><select className="input" value={filters.tradeType} onChange={(e) => update('tradeType', e.target.value)}><option>Sell</option><option>Buy</option><option>Any</option></select></label>
            <label className="field"><span>Limit</span><input className="input" type="number" min="1" max="1000" value={filters.take} onChange={(e) => update('take', Number(e.target.value || 250))} /></label>
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
            <button type="button" className="button button-secondary" onClick={loadKnownPrices}><Search size={16} /> Known prices</button>
            <button type="button" className="button button-primary" onClick={findRoutes}><Route size={16} /> Find trade routes</button>
            <button type="button" className="button button-success" onClick={findMultiRoutes}><Layers size={16} /> Multi-good routes</button>
            <button type="button" className="button button-secondary" onClick={clear}><Eraser size={16} /> Clear</button>
          </div>
        </div>
      </section>

      <section className="card"><div className="card-body"><h3>Known city prices</h3><SortableTable columns={knownPriceColumns} rows={knownPrices} emptyMessage="No known prices loaded yet." initialSortKey="price" initialDirection="desc" /></div></section>
      <section className="card"><div className="card-body"><h3>Trade routes</h3><SortableTable columns={routeColumns} rows={routes} emptyMessage="No route results yet." initialSortKey="profit" initialDirection="desc" /></div></section>
      <section className="card"><div className="card-body"><h3>Multi-good route bonuses</h3><SortableTable columns={multiColumns} rows={multiRoutes} emptyMessage="No multi-good routes yet." initialSortKey="totalProfit" initialDirection="desc" /></div></section>
    </div>
  );
}
