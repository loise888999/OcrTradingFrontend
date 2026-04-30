import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '../api';

export default function ImportPricesCsvPanel({ run, onImported }) {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);

  const importCsv = async () => {
    if (!file) {
      setMessage('Choose a CSV file first.');
      return;
    }
    setMessage('');
    setMessages([]);
    const result = await run(() => api.importPricesCsv(file), 'Could not import CSV');
    if (result) {
      setMessage(`Imported ${result.imported} row(s). Skipped ${result.skipped} row(s).`);
      setMessages(result.messages || []);
      await onImported?.();
    }
  };

  return (
    <section className="import-csv-panel">
      <div>
        <h3><Upload size={20} /> Import prices CSV</h3>
        <p className="muted">Import a CSV exported by another copy of this app to share price data.</p>
      </div>
      <div className="button-row">
        <input className="input file-input" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button type="button" className="button button-primary" onClick={importCsv}><Upload size={16} /> Import CSV</button>
      </div>
      {message && <div className="mini-info">{message}</div>}
      {messages.length > 0 && (
        <ul className="import-message-list">
          {messages.slice(0, 10).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
        </ul>
      )}
    </section>
  );
}
