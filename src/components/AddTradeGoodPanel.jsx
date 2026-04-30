import React, { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { api } from '../api';
import AutocompleteInput from './AutocompleteInput.jsx';

export default function AddTradeGoodPanel({ onAdded, run, tradeGoods = [] }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [aliases, setAliases] = useState('');
  const [force, setForce] = useState(false);
  const [message, setMessage] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const typeOptions = useMemo(() => {
    const unique = new Map();
    tradeGoods.forEach((good) => {
      if (good?.type) unique.set(good.type.toLowerCase(), { name: good.type });
    });
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tradeGoods]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!name.trim()) {
        setSuggestions([]);
        return;
      }
      const data = await run(() => api.getTradeGoodSuggestions({ name, take: 6 }), 'Could not load similar trade goods');
      if (data) setSuggestions(data);
    }, 250);
    return () => clearTimeout(timer);
  }, [name, run]);

  const add = async () => {
    setMessage('');
    const payload = {
      name: name.trim(),
      type: type.trim(),
      aliases: aliases.split(';').map((x) => x.trim()).filter(Boolean),
      force
    };
    const result = await run(() => api.addTradeGood(payload), 'Could not add trade good');
    if (result) {
      setMessage(result.message || 'Trade good added.');
      if (result.suggestions) setSuggestions(result.suggestions);
      if (result.added) {
        setName('');
        setType('');
        setAliases('');
        setForce(false);
        await onAdded?.();
      }
    }
  };

  return (
    <section className="add-good-panel">
      <div>
        <h3><Plus size={20} /> Add trade good</h3>
        <p className="muted">Use this when OCR finds an item that is missing from Data/trade-goods.csv.</p>
      </div>
      <div className="filter-grid compact-filter-grid">
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Example: Zanzibar Cloves" />
        </label>
        <AutocompleteInput label="Type" value={type} onChange={setType} options={typeOptions} placeholder="Type or choose a type..." getLabel={(item) => item.name} />
        <label className="field">
          <span>Aliases</span>
          <input className="input" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Optional; separated by ;" />
        </label>
        <label className="field checkbox-field">
          <span>Force add</span>
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
        </label>
      </div>
      {suggestions.length > 0 && (
        <div className="suggestion-box">
          <strong>Similar existing goods</strong>
          <div className="suggestion-list">
            {suggestions.map((s) => (
              <button type="button" key={s.name} className="suggestion-chip" onClick={() => { setName(s.name); setType(s.type || type); }}>
                {s.name} <small>{s.type} / {Math.round(s.score * 100)}%</small>
              </button>
            ))}
          </div>
          <p className="muted">If one of these is the same item, use the existing name or add your OCR spelling as an alias instead.</p>
        </div>
      )}
      {message && <div className="mini-info">{message}</div>}
      <div className="button-row">
        <button type="button" className="button button-primary" onClick={add}><Plus size={16} /> Add trade good</button>
        <button type="button" className="button button-secondary" onClick={onAdded}><RefreshCw size={16} /> Refresh lists</button>
      </div>
    </section>
  );
}
