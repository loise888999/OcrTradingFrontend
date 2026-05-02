import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eraser,
  PackagePlus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  XCircle
} from 'lucide-react';
import SortableTable from './SortableTable.jsx';

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function parseAliases(value) {
  return String(value || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function getExistingGood(tradeGoods, name) {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  return tradeGoods.find((good) => {
    if (normalizeName(good.name) === normalized) return true;

    const aliases = good.aliases || [];
    return aliases.some((alias) => normalizeName(alias) === normalized);
  });
}

function getPendingEditValue(edits, id, key, fallback) {
  return edits[id]?.[key] ?? fallback ?? '';
}

function PendingCandidateCard({
  candidate,
  edits,
  setEdits,
  typeOptions,
  onAccept,
  onDismiss,
  busyId
}) {
  const id = candidate.id;

  const update = (key, value) => {
    setEdits((current) => ({
      ...current,
      [id]: {
        ...(current[id] || {}),
        [key]: value
      }
    }));
  };

  const similar = candidate.similar || [];

  return (
    <article className="pending-good-card">
      <div className="pending-good-header">
        <div>
          <h3>{candidate.name}</h3>
          <p className="muted">
            Seen {candidate.seenCount || 1} time{candidate.seenCount === 1 ? '' : 's'}.
            Last seen: {formatDate(candidate.lastSeenAtUtc)}
          </p>
        </div>

        <span className="pending-status-pill">
          {candidate.status || 'Pending'}
        </span>
      </div>

      <div className="pending-good-meta">
        <span>Trade: {candidate.lastTradeType || 'Unknown'}</span>
        <span>Price: {candidate.lastPrice ?? 'Unknown'}</span>
        <span>Multiplier: {candidate.lastMultiplier ?? 'Unknown'}</span>
        <span>Confidence: {candidate.confidence != null ? `${Math.round(candidate.confidence * 100)}%` : 'Unknown'}</span>
      </div>

      {candidate.lastRawText && (
        <div className="raw-ocr-box">
          <strong>Last OCR text</strong>
          <pre>{candidate.lastRawText}</pre>
        </div>
      )}

      {similar.length > 0 && (
        <div className="similar-good-box">
          <strong>Similar existing goods</strong>
          <div className="similar-good-list">
            {similar.map((item, index) => (
              <span key={`${candidate.id}-${item.name || index}`} className="similar-good-chip">
                {item.name || item.itemName || 'Unknown'}
                {item.type ? ` / ${item.type}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <datalist id={`pending-type-options-${id}`}>
        {typeOptions.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>

      <div className="pending-good-form">
        <label className="field">
          <span>Name to add</span>
          <input
            className="input"
            value={getPendingEditValue(edits, id, 'name', candidate.name)}
            onChange={(event) => update('name', event.target.value)}
          />
        </label>

        <label className="field">
          <span>Type</span>
          <input
            className="input"
            list={`pending-type-options-${id}`}
            value={getPendingEditValue(edits, id, 'type', candidate.suggestedType)}
            onChange={(event) => update('type', event.target.value)}
            placeholder="Example: Luxury, Food, Mineral..."
          />
        </label>

        <label className="field">
          <span>Aliases</span>
          <input
            className="input"
            value={getPendingEditValue(edits, id, 'aliases', candidate.name)}
            onChange={(event) => update('aliases', event.target.value)}
            placeholder="Use | between aliases"
          />
          <small>Example: Diamond|Diamoncl|Dlamond</small>
        </label>
      </div>

      <div className="deal-actions">
        <button
          type="button"
          className="button button-success"
          disabled={busyId === id}
          onClick={() => onAccept(candidate)}
        >
          <CheckCircle2 size={16} />
          {busyId === id ? 'Adding...' : 'Accept and add'}
        </button>

        <button
          type="button"
          className="button button-secondary"
          disabled={busyId === id}
          onClick={() => onDismiss(candidate)}
        >
          <Trash2 size={16} /> Dismiss
        </button>
      </div>
    </article>
  );
}

export default function TradingOtherTab({ tradeGoods, run, api, refreshCatalogs }) {
  const [manual, setManual] = useState({
    name: '',
    type: '',
    aliases: ''
  });

  const [manualMessage, setManualMessage] = useState('');
  const [manualError, setManualError] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const [pending, setPending] = useState([]);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [pendingEdits, setPendingEdits] = useState({});
  const [busyId, setBusyId] = useState('');
  const [pendingMessage, setPendingMessage] = useState('');
  const [pendingError, setPendingError] = useState('');

  const [catalogQuery, setCatalogQuery] = useState('');

  const typeOptions = useMemo(
    () => uniqueSorted(tradeGoods.map((good) => good.type)),
    [tradeGoods]
  );

  const existingManualGood = useMemo(
    () => getExistingGood(tradeGoods, manual.name),
    [tradeGoods, manual.name]
  );

  const catalogRows = useMemo(() => {
    const query = catalogQuery.trim().toLowerCase();

    return tradeGoods
      .filter((good) => {
        if (!query) return true;

        const aliases = Array.isArray(good.aliases) ? good.aliases.join(' ') : '';
        return `${good.name} ${good.type} ${aliases}`.toLowerCase().includes(query);
      })
      .map((good) => ({
        name: good.name,
        type: good.type,
        aliases: Array.isArray(good.aliases) ? good.aliases.join(' | ') : ''
      }));
  }, [tradeGoods, catalogQuery]);

  const catalogColumns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'type', label: 'Type', sortable: true },
    { key: 'aliases', label: 'Aliases', sortable: true }
  ];

  const loadPending = async () => {
    setPendingError('');
    setPendingMessage('');

    const data = await run(
      () => api.getPendingTradeGoods({ includeResolved }),
      'Could not load pending trade goods'
    );

    if (data) {
      setPending(data);
    }
  };

  useEffect(() => {
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeResolved]);

  const updateManual = (key, value) => {
    setManual((current) => ({
      ...current,
      [key]: value
    }));

    setManualMessage('');
    setManualError('');
  };

  const checkSuggestions = async () => {
    setManualMessage('');
    setManualError('');

    if (!manual.name.trim()) {
      setManualError('Enter a trade good name first.');
      return;
    }

    const data = await run(
      () => api.getTradeGoodSuggestions({ name: manual.name, take: 8 }),
      'Could not load trade good suggestions'
    );

    if (data) {
      setSuggestions(data);
      setManualMessage(data.length ? 'Similar goods found below.' : 'No similar goods found.');
    }
  };

  const clearManual = () => {
    setManual({ name: '', type: '', aliases: '' });
    setSuggestions([]);
    setManualMessage('');
    setManualError('');
  };

  const addManualGood = async () => {
    setManualMessage('');
    setManualError('');

    const name = manual.name.trim();
    const type = manual.type.trim();

    if (!name) {
      setManualError('Trade good name is required.');
      return;
    }

    if (!type) {
      setManualError('Trade good type is required.');
      return;
    }

    const payload = {
      name,
      type,
      aliases: parseAliases(manual.aliases)
    };

    const result = await run(
      () => api.addTradeGood(payload),
      'Could not add trade good'
    );

    if (result) {
      setManualMessage(result.message || `Added ${name}.`);
      clearManual();

      if (refreshCatalogs) {
        await refreshCatalogs();
      }
    }
  };

  const acceptPending = async (candidate) => {
    setPendingMessage('');
    setPendingError('');
    setBusyId(candidate.id);

    const edit = pendingEdits[candidate.id] || {};

    const payload = {
      name: (edit.name ?? candidate.name ?? '').trim(),
      type: (edit.type ?? candidate.suggestedType ?? '').trim(),
      aliases: parseAliases(edit.aliases ?? candidate.name),
      force: true
    };

    if (!payload.name) {
      setPendingError('Name is required.');
      setBusyId('');
      return;
    }

    if (!payload.type) {
      setPendingError('Type is required.');
      setBusyId('');
      return;
    }

    const result = await run(
      () => api.acceptPendingTradeGood(candidate.id, payload),
      'Could not accept pending trade good'
    );

    if (result) {
      setPendingMessage(result.message || `Added ${payload.name}.`);
      setPendingEdits((current) => {
        const next = { ...current };
        delete next[candidate.id];
        return next;
      });

      await loadPending();

      if (refreshCatalogs) {
        await refreshCatalogs();
      }
    }

    setBusyId('');
  };

  const dismissPending = async (candidate) => {
    setPendingMessage('');
    setPendingError('');
    setBusyId(candidate.id);

    const result = await run(
      () => api.dismissPendingTradeGood(candidate.id),
      'Could not dismiss pending trade good'
    );

    if (result) {
      setPendingMessage(result.message || 'Candidate dismissed.');
      await loadPending();
    }

    setBusyId('');
  };

  return (
    <div className="trade-subtab-stack">
      <section className="card">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h2>
                <PackagePlus size={22} /> Other
              </h2>
              <p className="muted">
                Add missing trade goods to <b>Data/trade-goods.csv</b>, review OCR-detected unknown goods,
                and manage aliases.
              </p>
            </div>

            <button type="button" className="button button-secondary" onClick={loadPending}>
              <RefreshCw size={16} /> Refresh pending
            </button>
          </div>
        </div>
      </section>

      <section className="other-grid">
        <section className="card">
          <div className="card-body other-panel">
            <h3>
              <PackagePlus size={20} /> Add trade good manually
            </h3>

            <p className="muted">
              Use this when you know the item should exist but it is missing from the trade-good catalog.
            </p>

            <datalist id="manual-type-options">
              {typeOptions.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>

            <label className="field">
              <span>Name</span>
              <input
                className="input"
                value={manual.name}
                onChange={(event) => updateManual('name', event.target.value)}
                placeholder="Example: Diamond"
              />
            </label>

            <label className="field">
              <span>Type</span>
              <input
                className="input"
                list="manual-type-options"
                value={manual.type}
                onChange={(event) => updateManual('type', event.target.value)}
                placeholder="Example: Luxury, Food, Mineral..."
              />
            </label>

            <label className="field">
              <span>Aliases</span>
              <input
                className="input"
                value={manual.aliases}
                onChange={(event) => updateManual('aliases', event.target.value)}
                placeholder="Use | between aliases"
              />
              <small>Aliases help OCR match bad readings. Example: Diamond|Diamoncl|Dlamond</small>
            </label>

            {existingManualGood && (
              <div className="warning-info mini-info">
                <strong>
                  <AlertCircle size={16} /> Possible duplicate
                </strong>
                <span>
                  Existing good: {existingManualGood.name} / {existingManualGood.type}
                </span>
              </div>
            )}

            {manualError && (
              <div className="danger-info mini-info">
                <strong>
                  <XCircle size={16} /> {manualError}
                </strong>
              </div>
            )}

            {manualMessage && (
              <div className="success-info mini-info">
                <strong>
                  <CheckCircle2 size={16} /> {manualMessage}
                </strong>
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="similar-good-box">
                <strong>Similar existing goods</strong>
                <div className="similar-good-list">
                  {suggestions.map((item, index) => (
                    <button
                      key={`${item.name || index}-${index}`}
                      type="button"
                      className="similar-good-chip"
                      onClick={() => {
                        updateManual('name', item.name || item.itemName || manual.name);
                        updateManual('type', item.type || manual.type);
                      }}
                    >
                      {item.name || item.itemName || 'Unknown'}
                      {item.type ? ` / ${item.type}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="deal-actions">
              <button type="button" className="button button-secondary" onClick={checkSuggestions}>
                <Search size={16} /> Check similar
              </button>

              <button type="button" className="button button-primary" onClick={addManualGood}>
                <PackagePlus size={16} /> Add to CSV
              </button>

              <button type="button" className="button button-secondary" onClick={clearManual}>
                <Eraser size={16} /> Clear
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-body other-panel">
            <h3>
              <Sparkles size={20} /> Tips for aliases
            </h3>

            <p className="muted">
              Add aliases for OCR mistakes, not only alternate names.
            </p>

            <div className="alias-tip-list">
              <div>
                <strong>Good alias</strong>
                <span>Diamond|Diamoncl|Dlamond</span>
              </div>

              <div>
                <strong>Good alias</strong>
                <span>Malachite|Maiaclute|Malaclute</span>
              </div>

              <div>
                <strong>Avoid</strong>
                <span>Aliases that belong to another real trade good.</span>
              </div>

              <div>
                <strong>Best practice</strong>
                <span>Keep the real name clean, put OCR mistakes in aliases.</span>
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className="card">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h3>
                <AlertCircle size={20} /> OCR-detected unknown goods
              </h3>
              <p className="muted">
                These are items OCR saw that were not matched to the trade-good catalog.
                Accepting one adds it to <b>Data/trade-goods.csv</b>.
              </p>
            </div>

            <label className="inline-checkbox">
              <input
                type="checkbox"
                checked={includeResolved}
                onChange={(event) => setIncludeResolved(event.target.checked)}
              />
              Show resolved
            </label>
          </div>

          {pendingError && (
            <div className="danger-info mini-info">
              <strong>
                <XCircle size={16} /> {pendingError}
              </strong>
            </div>
          )}

          {pendingMessage && (
            <div className="success-info mini-info">
              <strong>
                <CheckCircle2 size={16} /> {pendingMessage}
              </strong>
            </div>
          )}

          <div className="pending-good-list">
            {pending.length === 0 && (
              <div className="empty-panel">
                No pending unknown trade goods.
              </div>
            )}

            {pending.map((candidate) => (
              <PendingCandidateCard
                key={candidate.id}
                candidate={candidate}
                edits={pendingEdits}
                setEdits={setPendingEdits}
                typeOptions={typeOptions}
                onAccept={acceptPending}
                onDismiss={dismissPending}
                busyId={busyId}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h3>Current trade-good catalog</h3>
              <p className="muted">
                Quick view of the current goods loaded by the frontend.
              </p>
            </div>

            <input
              className="input catalog-search-input"
              value={catalogQuery}
              onChange={(event) => setCatalogQuery(event.target.value)}
              placeholder="Search catalog..."
            />
          </div>

          <SortableTable
            columns={catalogColumns}
            rows={catalogRows}
            emptyMessage="No trade goods loaded."
            initialSortKey="name"
            initialDirection="asc"
          />
        </div>
      </section>
    </div>
  );
}