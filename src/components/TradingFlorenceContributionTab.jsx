import React, { useMemo, useState } from 'react';
import { Eraser, Landmark, Search, Sparkles } from 'lucide-react';
import SortableTable from './SortableTable.jsx';

const emptyFilters = {
  good: '',
  skill: '',
  take: 500
};

const FLORENCE_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1qD74nt3NxZLfP-pDdcIsC7bgpfnlIsYSpYmy3n3DDX4/edit?gid=0#gid=0';

function clean(value) {
  return String(value || '').trim();
}

function countBy(rows, field) {
  const counts = new Map();

  for (const row of rows) {
    const value = clean(row[field]) || 'Unknown';
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function scoreRange(row) {
  const min = row.scoreMin ?? '';
  const max = row.scoreMax ?? '';
  if (min === '' && max === '') return 'Unknown';
  return min === max ? String(min) : `${min}-${max}`;
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

export default function TradingFlorenceContributionTab({ run, api }) {
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [message, setMessage] = useState('');

  const topSkill = useMemo(() => countBy(rows, 'contributionSkill')[0] || null, [rows]);
  const averageScore = useMemo(() => {
    const scores = rows
      .map((row) => Number(row.scoreAvg))
      .filter((value) => Number.isFinite(value));

    if (!scores.length) return 'Unknown';
    return (scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1);
  }, [rows]);

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
      () => api.getFlorenceCraftsmanContributions({
        good: filters.good,
        skill: filters.skill,
        take: filters.take
      }),
      'Could not load Florence craftsman contribution list'
    );

    const nextRows = data || [];
    setRows(nextRows);
    setLastLoadedAt(new Date());
    setMessage(nextRows.length ? '' : 'No Florence contribution rows matched these filters.');
    setLoading(false);
  };

  const columns = [
    {
      key: 'tradeGood',
      label: 'Trade Good Name',
      sortable: true,
      render: (row) => (
        <div className="special-craft-item-cell">
          <strong>{row.tradeGood}</strong>
        </div>
      )
    },
    { key: 'contributionSkill', label: 'Skill It Will Increase', sortable: true },
    {
      key: 'scoreMin',
      label: 'Min Points',
      sortable: true,
      defaultDirection: 'desc',
      render: (row) => row.scoreMin ?? 'Unknown'
    },
    {
      key: 'scoreMax',
      label: 'Max Points',
      sortable: true,
      defaultDirection: 'desc',
      render: (row) => row.scoreMax ?? 'Unknown'
    },
    {
      key: 'scoreAvg',
      label: 'Average Points',
      sortable: true,
      defaultDirection: 'desc',
      render: (row) => row.scoreAvg ?? scoreRange(row)
    }
  ];

  return (
    <div className="trade-subtab-stack">
      <section className="card">
        <div className="card-body find-good-helper">
          <div className="find-good-header">
            <div>
              <h2>
                <Landmark size={22} /> Florence Contribution
              </h2>
              <p className="muted">
                Search Florence craftsman contribution goods by trade good name or skill.
              </p>
            </div>
          </div>

          <div className="special-craft-filter-grid">
            <label className="field">
              <span>Trade good</span>
              <input
                className="input"
                value={filters.good}
                onChange={(event) => update('good', event.target.value)}
                placeholder="Tumbaga, Opah..."
              />
            </label>

            <label className="field">
              <span>Skill</span>
              <input
                className="input"
                value={filters.skill}
                onChange={(event) => update('skill', event.target.value)}
                placeholder="Handicrafts, Cooking..."
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
                  ? `Showing ${rows.length} contribution row${rows.length === 1 ? '' : 's'} loaded at ${lastLoadedAt.toLocaleString()}.`
                  : 'Load Florence contribution rows from backend CSV.'}
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
          title="Matching goods"
          value={rows.length}
          detail="Florence contribution rows"
          icon={<Sparkles size={18} />}
        />
        <SummaryCard
          title="Top skill"
          value={topSkill?.[0] || 'Unknown'}
          detail={topSkill ? `${topSkill[1]} matching row${topSkill[1] === 1 ? '' : 's'}` : 'No rows loaded'}
          icon={<Landmark size={18} />}
        />
        <SummaryCard
          title="Average score"
          value={averageScore}
          detail="from matching rows"
          icon={<Sparkles size={18} />}
        />
      </section>

      <section className="card">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h3>Florence craftsman contribution</h3>
              <p className="muted">Read-only catalog from <b>uwo_florence_craftsman_contribution.csv</b>.</p>
            </div>
          </div>

          <SortableTable
            columns={columns}
            rows={rows}
            emptyMessage="No Florence contribution rows loaded yet."
            initialSortKey="scoreAvg"
            initialDirection="desc"
          />

          <div className="special-craft-source-links">
            <a href={FLORENCE_SOURCE_URL} target="_blank" rel="noreferrer">
              Source spreadsheet
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
