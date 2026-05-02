import React, { useMemo, useState } from 'react';
import { Eraser, PackageSearch, Search } from 'lucide-react';
import SortableTable from './SortableTable.jsx';

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const emptyFilters = {
  item: '',
  type: '',
  mainRegion: '',
  subRegion: '',
  take: 250
};

export default function TradingGoodLookupTab({ cities, tradeGoods, run, api }) {
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [rows, setRows] = useState([]);

  const regionOptions = useMemo(() => {
    const filtered = cities.filter((city) => !filters.mainRegion || city.mainRegion === filters.mainRegion);
    return {
      mainRegions: uniqueSorted(cities.map((city) => city.mainRegion)),
      subRegions: uniqueSorted(filtered.map((city) => city.subRegion)),
      types: uniqueSorted(tradeGoods.map((good) => good.type))
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
    setRows([]);
  };

  const search = async () => {
    const data = await run(() => api.lookupTradeGoods(filters), 'Could not lookup trade goods');
    if (data) setRows(data);
  };

  const columns = [
    { key: 'itemName', label: 'Good', sortable: true },
    { key: 'tradeGoodType', label: 'Type', sortable: true },
    { key: 'lowestBuyPrice', label: 'Lowest Buy', sortable: true, defaultDirection: 'asc' },
    { key: 'lowestBuyCity', label: 'Buy City', sortable: true },
    { key: 'lowestBuyMainRegion', label: 'Main Region', sortable: true },
    { key: 'lowestBuySubRegion', label: 'Sub Region', sortable: true },
    { key: 'lowestBuySeaTradeRegion', label: 'Sea Trade', sortable: true },
    { key: 'offerCount', label: 'Known Buy Offers', sortable: true, defaultDirection: 'desc' },
    { key: 'lastSeenUtc', label: 'Last Seen', sortable: true, render: (row) => row.lastSeenUtc ? new Date(row.lastSeenUtc).toLocaleString() : '' }
  ];

  return (
    <div className="trade-subtab-stack">
      <section className="card">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h2><PackageSearch size={22} /> Find trade goods</h2>
              <p className="muted">Lookup only goods available for Buy. Filter by name, type, main region, and sub region.</p>
            </div>
          </div>

          <datalist id="lookup-good-options">
            {tradeGoods.map((good) => <option key={good.name} value={good.name}>{good.type}</option>)}
          </datalist>
          <datalist id="lookup-type-options">
            {regionOptions.types.map((type) => <option key={type} value={type} />)}
          </datalist>
          <datalist id="lookup-main-region-options">
            {regionOptions.mainRegions.map((region) => <option key={region} value={region} />)}
          </datalist>
          <datalist id="lookup-sub-region-options">
            {regionOptions.subRegions.map((region) => <option key={region} value={region} />)}
          </datalist>

          <div className="deal-filter-grid">
            <label className="field"><span>Good name</span><input className="input" list="lookup-good-options" value={filters.item} onChange={(e) => update('item', e.target.value)} placeholder="Type good name..." /></label>
            <label className="field"><span>Good type</span><input className="input" list="lookup-type-options" value={filters.type} onChange={(e) => update('type', e.target.value)} placeholder="Type or choose type..." /></label>
            <label className="field"><span>Main region</span><input className="input" list="lookup-main-region-options" value={filters.mainRegion} onChange={(e) => update('mainRegion', e.target.value)} placeholder="Any" /></label>
            <label className="field"><span>Sub region</span><input className="input" list="lookup-sub-region-options" value={filters.subRegion} onChange={(e) => update('subRegion', e.target.value)} placeholder="Any" /></label>
            <label className="field"><span>Limit</span><input className="input" type="number" min="1" max="1000" value={filters.take} onChange={(e) => update('take', Number(e.target.value || 250))} /></label>
          </div>

          <div className="deal-actions">
            <button type="button" className="button button-primary" onClick={search}><Search size={16} /> Search buy goods</button>
            <button type="button" className="button button-secondary" onClick={clear}><Eraser size={16} /> Clear</button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <SortableTable columns={columns} rows={rows} emptyMessage="No buy goods found yet." initialSortKey="lowestBuyPrice" initialDirection="asc" />
        </div>
      </section>
    </div>
  );
}
