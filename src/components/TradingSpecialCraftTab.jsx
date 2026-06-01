import React, { useMemo, useState } from 'react';
import { Eraser, Hammer, Search, Sparkles } from 'lucide-react';
import SortableTable from './SortableTable.jsx';

const emptyFilters = {
  item: '',
  type: '',
  bonus: '',
  minBonusValue: '',
  material: '',
  location: '',
  take: 500
};

function normalizeText(value) {
  return String(value || '').trim();
}

function splitList(value) {
  return normalizeText(value)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusTone(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('incomplete')) return 'warn';
  if (text.includes('confirmed')) return 'good';
  return 'unknown';
}

function countStatus(rows) {
  return rows.reduce(
    (acc, row) => {
      const tone = statusTone(row.dataStatus);
      if (tone === 'good') acc.confirmed += 1;
      else if (tone === 'warn') acc.incomplete += 1;
      else acc.unknown += 1;
      return acc;
    },
    { confirmed: 0, incomplete: 0, unknown: 0 }
  );
}

function topLocation(rows) {
  const counts = new Map();

  for (const row of rows) {
    const location = normalizeText(row.craftLocation).split('/')[0].trim() || 'Unknown';
    counts.set(location, (counts.get(location) || 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || null;
}

function DetailText({ value }) {
  const text = normalizeText(value);
  return text ? <span className="special-craft-detail-text">{text}</span> : <span className="muted">Unknown</span>;
}

function PillList({ value }) {
  const items = splitList(value);

  if (!items.length) return <span className="muted">Unknown</span>;

  return (
    <div className="special-craft-pill-list">
      {items.map((item) => (
        <span key={item} className="special-craft-pill">
          {item}
        </span>
      ))}
    </div>
  );
}

function SourceLinks({ value }) {
  const links = normalizeText(value)
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!links.length) return null;

  return (
    <div className="special-craft-source-links">
      {links.map((link, index) => (
        <a key={link} href={link} target="_blank" rel="noreferrer">
          Source {index + 1}
        </a>
      ))}
    </div>
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

export default function TradingSpecialCraftTab({ run, api }) {
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [message, setMessage] = useState('');

  const statuses = useMemo(() => countStatus(rows), [rows]);
  const location = useMemo(() => topLocation(rows), [rows]);

  const update = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clear = () => {
    setFilters({ ...emptyFilters });
    setRows([]);
    setLastLoadedAt(null);
    setMessage('');
  };

  const search = async () => {
    setLoading(true);
    setMessage('');

    const data = await run(
      () => api.getSpecialCraftBonusItems(filters),
      'Could not load special craft bonus items'
    );

    const nextRows = data || [];
    setRows(nextRows);
    setLastLoadedAt(new Date());
    setMessage(nextRows.length ? '' : 'No special craft bonus items matched these filters.');
    setLoading(false);
  };

  const columns = [
    {
      key: 'itemName',
      label: 'Item',
      sortable: true,
      render: (row) => (
        <div className="special-craft-item-cell">
          <strong>{row.itemName}</strong>
          {row.itemNameJapanese && <span>{row.itemNameJapanese}</span>}
        </div>
      )
    },
    { key: 'itemType', label: 'Type', sortable: true },
    {
      key: 'bonusStats',
      label: 'Bonus Stats',
      sortable: true,
      render: (row) => <PillList value={row.bonusStats} />
    },
    {
      key: 'materials',
      label: 'Materials',
      sortable: true,
      render: (row) => <PillList value={row.materials} />
    },
    {
      key: 'skillRank',
      label: 'Skill / Contribution',
      sortable: true,
      render: (row) => (
        <div className="special-craft-detail-stack">
          <DetailText value={row.skillRank} />
          <DetailText value={row.contributionCost} />
        </div>
      )
    },
    {
      key: 'craftLocation',
      label: 'Craft Location',
      sortable: true,
      render: (row) => (
        <div className="special-craft-detail-stack">
          <DetailText value={row.craftLocation} />
          <DetailText value={row.npcOrFacility} />
        </div>
      )
    },
    {
      key: 'unlockConditions',
      label: 'Unlock',
      sortable: true,
      render: (row) => <DetailText value={row.unlockConditions} />
    },
    {
      key: 'dataStatus',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <div className="special-craft-detail-stack">
          <span className={`special-craft-status special-craft-status-${statusTone(row.dataStatus)}`}>
            {row.dataStatus || 'Unknown'}
          </span>
          <DetailText value={row.notes} />
          <SourceLinks value={row.sourceUrls} />
        </div>
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
                <Hammer size={22} /> Special Craft
              </h2>
              <p className="muted">
                Search special craft bonus items by item, stat bonus, material, or crafting location.
              </p>
            </div>
          </div>

          <div className="special-craft-filter-grid">
            <label className="field">
              <span>Item</span>
              <input
                className="input"
                value={filters.item}
                onChange={(event) => update('item', event.target.value)}
                placeholder="Example: Helm"
              />
            </label>

            <label className="field">
              <span>Type</span>
              <input
                className="input"
                value={filters.type}
                onChange={(event) => update('type', event.target.value)}
                placeholder="Armor, headwear..."
              />
            </label>

            <label className="field">
              <span>Bonus / stat</span>
              <input
                className="input"
                value={filters.bonus}
                onChange={(event) => update('bonus', event.target.value)}
                placeholder="Attack, Defense, Sewing..."
              />
            </label>

            <label className="field">
              <span>Minimum stat value</span>
              <input
                className="input"
                type="number"
                min="0"
                value={filters.minBonusValue}
                onChange={(event) => update('minBonusValue', event.target.value)}
                placeholder="35"
              />
            </label>

            <label className="field">
              <span>Material</span>
              <input
                className="input"
                value={filters.material}
                onChange={(event) => update('material', event.target.value)}
                placeholder="Steel, Fur..."
              />
            </label>

            <label className="field">
              <span>Location</span>
              <input
                className="input"
                value={filters.location}
                onChange={(event) => update('location', event.target.value)}
                placeholder="Florence..."
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
                  ? `Showing ${rows.length} item${rows.length === 1 ? '' : 's'} loaded at ${lastLoadedAt.toLocaleString()}.`
                  : 'Load special craft items from backend CSV.'}
              </p>
            </div>

            <div className="deal-actions">
              <button type="button" className="button button-primary big-action" onClick={search} disabled={loading}>
                <Search size={17} />
                {loading ? 'Loading...' : 'Search'}
              </button>

              <button type="button" className="button button-secondary" onClick={clear}>
                <Eraser size={16} /> Clear
              </button>
            </div>
          </div>

          {message && <p className="mini-info">{message}</p>}
        </div>
      </section>

      <section className="find-good-results-grid special-craft-summary-grid">
        <SummaryCard
          title="Matching items"
          value={rows.length}
          detail="special craft rows"
          icon={<Sparkles size={18} />}
        />
        <SummaryCard
          title="Confirmed"
          value={statuses.confirmed}
          detail={`${statuses.incomplete} incomplete / ${statuses.unknown} unknown`}
          icon={<Hammer size={18} />}
        />
        <SummaryCard
          title="Top location"
          value={location?.[0] || 'Unknown'}
          detail={location ? `${location[1]} matching item${location[1] === 1 ? '' : 's'}` : 'No rows loaded'}
          icon={<Sparkles size={18} />}
        />
      </section>

      <section className="card">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h3>Special craft bonus items</h3>
              <p className="muted">Read-only catalog from <b>uwo_special_craft_bonus_items.csv</b>.</p>
            </div>
          </div>

          <SortableTable
            columns={columns}
            rows={rows}
            emptyMessage="No special craft bonus items loaded yet."
            initialSortKey="itemName"
            initialDirection="asc"
          />
        </div>
      </section>
    </div>
  );
}
