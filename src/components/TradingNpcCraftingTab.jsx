import React, { useMemo, useState } from 'react';
import { Eraser, Factory, Search, Sparkles } from 'lucide-react';
import SortableTable from './SortableTable.jsx';

const emptyFilters = {
  product: '',
  category: '',
  npc: '',
  skill: '',
  material: '',
  location: '',
  take: 500
};

function clean(value) {
  return String(value || '').trim();
}

function splitList(value) {
  return clean(value)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusTone(value) {
  const text = clean(value).toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('incomplete') || text.includes('to confirm')) return 'warn';
  if (text.includes('confirmed')) return 'good';
  return 'unknown';
}

function countBy(rows, field) {
  const counts = new Map();

  for (const row of rows) {
    const value = clean(row[field]) || 'Unknown';
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function countStatus(rows) {
  return rows.reduce(
    (acc, row) => {
      const tone = statusTone(row.dataStatus);
      if (tone === 'good') acc.confirmed += 1;
      else if (tone === 'warn') acc.needsCheck += 1;
      else acc.unknown += 1;
      return acc;
    },
    { confirmed: 0, needsCheck: 0, unknown: 0 }
  );
}

function DetailText({ value }) {
  const text = clean(value);
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

function SourceLink({ value }) {
  const link = clean(value);
  if (!link) return null;

  return (
    <div className="special-craft-source-links">
      <a href={link} target="_blank" rel="noreferrer">Source</a>
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

export default function TradingNpcCraftingTab({ run, api }) {
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [message, setMessage] = useState('');

  const statuses = useMemo(() => countStatus(rows), [rows]);
  const topCategory = useMemo(() => countBy(rows, 'category')[0] || null, [rows]);
  const topNpc = useMemo(() => countBy(rows, 'npcOrFacility')[0] || null, [rows]);

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
      () => api.getNpcNormalCraftingItems(filters),
      'Could not load NPC crafting list'
    );

    const nextRows = data || [];
    setRows(nextRows);
    setLastLoadedAt(new Date());
    setMessage(nextRows.length ? '' : 'No NPC crafting rows matched these filters.');
    setLoading(false);
  };

  const columns = [
    {
      key: 'product',
      label: 'Product',
      sortable: true,
      render: (row) => (
        <div className="special-craft-item-cell">
          <strong>{row.product}</strong>
          {row.recipeMethod && <span>{row.recipeMethod}</span>}
        </div>
      )
    },
    { key: 'category', label: 'Category', sortable: true },
    {
      key: 'npcOrFacility',
      label: 'NPC / Facility',
      sortable: true,
      render: (row) => (
        <div className="special-craft-detail-stack">
          <DetailText value={row.npcOrFacility} />
          <DetailText value={row.locations} />
        </div>
      )
    },
    {
      key: 'requiredSkills',
      label: 'Skill',
      sortable: true,
      render: (row) => <DetailText value={row.requiredSkills} />
    },
    {
      key: 'materials',
      label: 'Materials',
      sortable: true,
      render: (row) => <PillList value={row.materials} />
    },
    { key: 'itemType', label: 'Item Type', sortable: true },
    { key: 'scope', label: 'Scope', sortable: true },
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
          <SourceLink value={row.sourceUrl} />
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
                <Factory size={22} /> NPC Crafting
              </h2>
              <p className="muted">
                Browse normal NPC production recipes by product, skill, material, city, NPC, or category.
              </p>
            </div>
          </div>

          <div className="special-craft-filter-grid">
            <label className="field">
              <span>Product</span>
              <input
                className="input"
                value={filters.product}
                onChange={(event) => update('product', event.target.value)}
                placeholder="Gun Port, Fireworks..."
              />
            </label>

            <label className="field">
              <span>Category</span>
              <input
                className="input"
                value={filters.category}
                onChange={(event) => update('category', event.target.value)}
                placeholder="Casting, Sewing..."
              />
            </label>

            <label className="field">
              <span>NPC / Facility</span>
              <input
                className="input"
                value={filters.npc}
                onChange={(event) => update('npc', event.target.value)}
                placeholder="Shipwright..."
              />
            </label>

            <label className="field">
              <span>Skill</span>
              <input
                className="input"
                value={filters.skill}
                onChange={(event) => update('skill', event.target.value)}
                placeholder="Casting 6..."
              />
            </label>

            <label className="field">
              <span>Material</span>
              <input
                className="input"
                value={filters.material}
                onChange={(event) => update('material', event.target.value)}
                placeholder="Iron, Lumber..."
              />
            </label>

            <label className="field">
              <span>Location</span>
              <input
                className="input"
                value={filters.location}
                onChange={(event) => update('location', event.target.value)}
                placeholder="Plymouth..."
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
                  ? `Showing ${rows.length} recipe${rows.length === 1 ? '' : 's'} loaded at ${lastLoadedAt.toLocaleString()}.`
                  : 'Load NPC crafting recipes from backend CSV.'}
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
          title="Matching recipes"
          value={rows.length}
          detail="normal NPC production rows"
          icon={<Sparkles size={18} />}
        />
        <SummaryCard
          title="Top category"
          value={topCategory?.[0] || 'Unknown'}
          detail={topCategory ? `${topCategory[1]} matching recipe${topCategory[1] === 1 ? '' : 's'}` : 'No rows loaded'}
          icon={<Factory size={18} />}
        />
        <SummaryCard
          title="Top NPC"
          value={topNpc?.[0] || 'Unknown'}
          detail={topNpc ? `${topNpc[1]} matching recipe${topNpc[1] === 1 ? '' : 's'}` : 'No rows loaded'}
          icon={<Factory size={18} />}
        />
        <SummaryCard
          title="Confirmed"
          value={statuses.confirmed}
          detail={`${statuses.needsCheck} need check / ${statuses.unknown} unknown`}
          icon={<Sparkles size={18} />}
        />
      </section>

      <section className="card">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h3>NPC normal crafting list</h3>
              <p className="muted">Read-only catalog from <b>uwo_npc_normal_crafting_list_v1.csv</b>.</p>
            </div>
          </div>

          <SortableTable
            columns={columns}
            rows={rows}
            emptyMessage="No NPC crafting recipes loaded yet."
            initialSortKey="product"
            initialDirection="asc"
          />
        </div>
      </section>
    </div>
  );
}
