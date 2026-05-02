import React, { useMemo, useState } from 'react';

export default function MultiSelectChips({ label, options, selected, onChange, placeholder = 'Type to filter...' }) {
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filtered = options
    .filter((option) => option.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 80);

  const toggle = (value) => {
    if (selectedSet.has(value)) onChange(selected.filter((x) => x !== value));
    else onChange([...selected, value]);
  };

  const clear = () => onChange([]);

  return (
    <div className="multi-select-panel">
      <div className="multi-select-header">
        <strong>{label}</strong>
        {selected.length > 0 && <button type="button" className="link-button" onClick={clear}>Clear</button>}
      </div>
      <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} />
      <div className="quick-chip-row multi-chip-row">
        {filtered.map((option) => (
          <button key={option} type="button" className={selectedSet.has(option) ? 'quick-chip selected' : 'quick-chip'} onClick={() => toggle(option)}>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
