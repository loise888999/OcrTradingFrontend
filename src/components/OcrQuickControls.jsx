import React from 'react';
import { Activity, Pause, Play, RefreshCw } from 'lucide-react';

export default function OcrQuickControls({ ocrStatus, startOcr, stopOcr, refreshStatus }) {
  const running = Boolean(ocrStatus?.enabled);

  return (
    <div className="ocr-quick-controls">
      <span className={`ocr-state-pill ${running ? 'running' : 'stopped'}`}>
        <Activity size={14} /> OCR {running ? 'Running' : 'Stopped'}
      </span>
      {running ? (
        <button type="button" className="button button-warning compact-action" onClick={stopOcr}>
          <Pause size={15} /> Stop OCR
        </button>
      ) : (
        <button type="button" className="button button-success compact-action" onClick={startOcr}>
          <Play size={15} /> Start OCR
        </button>
      )}
      <button type="button" className="button button-secondary compact-action" onClick={refreshStatus}>
        <RefreshCw size={15} /> Check
      </button>
    </div>
  );
}
