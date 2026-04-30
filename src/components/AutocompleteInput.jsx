import React, { useMemo, useRef, useState } from 'react';

function normalize(value) {
  return String(value || '').toLowerCase().trim();
}

export default function AutocompleteInput({
  label,
  value,
  onChange,
  options = [],
  placeholder = '',
  getLabel = (x) => x?.name ?? String(x ?? ''),
  getSubLabel = () => '',
  maxResults = 10
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const matches = useMemo(() => {
    const q = normalize(value);
    const source = Array.isArray(options) ? options : [];
    if (!q) return source.slice(0, maxResults);

    return source
      .map((option) => {
        const labelText = getLabel(option);
        const lower = normalize(labelText);
        let score = 0;
        if (lower === q) score = 100;
        else if (lower.startsWith(q)) score = 80;
        else if (lower.includes(q)) score = 60;
        return { option, labelText, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.labelText.localeCompare(b.labelText))
      .slice(0, maxResults)
      .map((x) => x.option);
  }, [value, options, getLabel, maxResults]);

  const choose = (option) => {
    onChange(getLabel(option));
    setOpen(false);
  };

  return (
    <label className="field autocomplete-field" ref={wrapperRef}>
      <span>{label}</span>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 140)}
      />
      {open && matches.length > 0 && (
        <div className="autocomplete-menu">
          {matches.map((option) => (
            <button
              type="button"
              className="autocomplete-option"
              key={getLabel(option)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
            >
              <strong>{getLabel(option)}</strong>
              {getSubLabel(option) && <small>{getSubLabel(option)}</small>}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}
