import React, { useMemo, useState } from 'react';
import { Check, EyeOff, RefreshCw, X } from 'lucide-react';
import AutocompleteInput from './AutocompleteInput.jsx';
import { api } from '../api';

export default function PendingTradeGoodPanel({ candidates = [], tradeGoods = [], run, onChanged }) {
  const [enabled, setEnabled] = useState(true);
  const [editing, setEditing] = useState({});

  const typeOptions = useMemo(() => {
    const map = new Map();
    tradeGoods.forEach((good) => {
      if (good?.type) map.set(good.type.toLowerCase(), { name: good.type });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tradeGoods]);

  const updateEdit = (id, key, value) => setEditing((current) => ({ ...current, [id]: { ...(current[id] || {}), [key]: value } }));

  const accept = async (candidate) => {
    const edit = editing[candidate.id] || {};
    const result = await run(
      () => api.acceptPendingTradeGood(candidate.id, {
        name: edit.name || candidate.name,
        type: edit.type || candidate.suggestedType || '',
        aliases: (edit.aliases || '').split(';').map((x) => x.trim()).filter(Boolean),
        force: Boolean(edit.force)
      }),
      'Could not accept pending trade good'
    );
    if (result) await onChanged?.();
  };

  const dismiss = async (candidate) => {
    const result = await run(() => api.dismissPendingTradeGood(candidate.id), 'Could not dismiss pending trade good');
    if (result) await onChanged?.();
  };

  if (!enabled) {
    return <section className="pending-good-panel collapsed-panel"><div className="tab-header"><div><h3><EyeOff size={20} /> Pending OCR trade goods hidden</h3><p className="muted">Toggle this back on if you want OCR suggestions to show here.</p></div><button type="button" className="button button-secondary" onClick={() => setEnabled(true)}>Show suggestions</button></div></section>;
  }

  return (
    <section className="pending-good-panel">
      <div className="tab-header">
        <div>
          <h3>OCR found possible new trade goods</h3>
          <p className="muted">These are unknown item names OCR saw beside a valid-looking price/multiplier. Accept only if they are real trade goods.</p>
        </div>
        <div className="button-row">
          <button type="button" className="button button-secondary" onClick={onChanged}><RefreshCw size={16} /> Refresh</button>
          <button type="button" className="button button-secondary" onClick={() => setEnabled(false)}><EyeOff size={16} /> Hide section</button>
        </div>
      </div>

      {candidates.length === 0 && <div className="mini-info">No pending OCR trade-good suggestions.</div>}

      {candidates.length > 0 && (
        <div className="pending-good-list">
          {candidates.map((candidate) => {
            const edit = editing[candidate.id] || {};
            return (
              <article className="pending-good-card" key={candidate.id}>
                <div className="pending-good-summary">
                  <strong>{candidate.name}</strong>
                  <span>Confidence {Math.round((candidate.confidence || 0) * 100)}%</span>
                  <span>Seen {candidate.seenCount} time(s)</span>
                  <span>{candidate.lastTradeType} price {candidate.lastPrice ?? ''} {candidate.lastMultiplier ? `(${candidate.lastMultiplier}%)` : ''}</span>
                </div>

                {candidate.similar?.length > 0 && (
                  <div className="suggestion-box">
                    <strong>Similar existing goods</strong>
                    <div className="suggestion-list">
                      {candidate.similar.map((s) => <span className="suggestion-chip" key={s.name}>{s.name} <small>{s.type} / {Math.round(s.score * 100)}%</small></span>)}
                    </div>
                  </div>
                )}

                <div className="filter-grid pending-accept-grid">
                  <label className="field"><span>Name</span><input className="input" value={edit.name ?? candidate.name} onChange={(e) => updateEdit(candidate.id, 'name', e.target.value)} /></label>
                  <AutocompleteInput label="Type" value={edit.type ?? candidate.suggestedType ?? ''} onChange={(value) => updateEdit(candidate.id, 'type', value)} options={typeOptions} placeholder="Type or choose a type..." getLabel={(item) => item.name} />
                  <label className="field"><span>Aliases</span><input className="input" value={edit.aliases ?? ''} onChange={(e) => updateEdit(candidate.id, 'aliases', e.target.value)} placeholder="Optional; separated by ;" /></label>
                  <label className="field checkbox-field"><span>Force</span><input type="checkbox" checked={Boolean(edit.force)} onChange={(e) => updateEdit(candidate.id, 'force', e.target.checked)} /></label>
                </div>

                <div className="button-row">
                  <button type="button" className="button button-success" onClick={() => accept(candidate)}><Check size={16} /> Accept as trade good</button>
                  <button type="button" className="button button-secondary" onClick={() => dismiss(candidate)}><X size={16} /> Dismiss</button>
                </div>

                {candidate.lastRawText && <div className="mini-info">Raw: {candidate.lastRawText}</div>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
