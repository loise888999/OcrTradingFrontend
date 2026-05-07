import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Crosshair, Monitor, RefreshCw, XCircle } from 'lucide-react';
import { api } from '../api';

export default function GameWindowPanel({ run }) {
  const [windowInfo, setWindowInfo] = useState(null);
  const [mouseWindowInfo, setMouseWindowInfo] = useState(null);
  const [checked, setChecked] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [message, setMessage] = useState('');

  const checkWindow = async () => {
    setChecked(true);
    setMessage('Checking selected/detected game window...');

    const result = await run(
      () => api.getGameWindow(),
      'Could not find game window. Select it with the mouse or check backend GameWindow settings.'
    );

    setWindowInfo(result || null);
    setMessage(result ? 'Game window is selected/detected.' : 'Game window not found. Use Select window with mouse.');
  };

  const inspectWindowUnderMouse = async () => {
    setSelecting(true);
    setMouseWindowInfo(null);
    setMessage('Move your mouse over the game window. Reading window under mouse in 5 seconds...');

    const result = await run(
      () => api.getWindowUnderMouseDelayed({ seconds: 5 }),
      'Could not read window under mouse.'
    );

    setMouseWindowInfo(result || null);
    setSelecting(false);
    setMessage(result ? 'Window under mouse was detected.' : 'No window found under mouse.');
  };

  const selectWindowUnderMouse = async () => {
    setSelecting(true);
    setWindowInfo(null);
    setMessage('Move your mouse over the game window. Selecting it in 5 seconds...');

    const result = await run(
      () => api.selectWindowUnderMouseDelayed({ seconds: 5 }),
      'Could not select game window under mouse.'
    );

    setWindowInfo(result || null);
    setChecked(true);
    setSelecting(false);
    setMessage(result ? 'Game window selected. OCR zones will follow this window.' : 'No window selected. Try again with mouse over the game window.');
  };

  const clearSelectedWindow = async () => {
    setMessage('Clearing selected game window...');
    const result = await run(
      () => api.clearSelectedGameWindow(),
      'Could not clear selected game window.'
    );

    if (result) {
      setWindowInfo(null);
      setMouseWindowInfo(null);
      setChecked(false);
      setMessage('Selected game window cleared. Select it again before OCR setup.');
    }
  };

  const forgetRememberedWindow = async () => {
    setMessage('Forgetting remembered game window...');
    const result = await run(
      () => api.forgetRememberedGameWindow(),
      'Could not forget remembered game window.'
    );

    if (result) {
      setWindowInfo(null);
      setMouseWindowInfo(null);
      setChecked(false);
      setMessage('Remembered game window forgotten. Select it again with the mouse.');
    }
  };

  const renderWindowInfo = (info, title) => (
    <div className="mini-info success-info">
      <strong><CheckCircle2 size={16} /> {title}</strong>
      <div>Process: {info.processName}</div>
      <div>Title: {info.title || '(no title)'}</div>
      <div>
        Position: X {info.left}, Y {info.top}, Width {info.width}, Height {info.height}
      </div>
      {info.mouseX != null && info.mouseY != null && (
        <div>Mouse: X {info.mouseX}, Y {info.mouseY}</div>
      )}
    </div>
  );

  return (
    <section className="game-window-panel">
      <div className="tab-header">
        <div>
          <h3><Monitor size={20} /> Game window anchor</h3>
          <p className="muted">
            Select the game window by putting your mouse over it. OCR zones are saved relative to that window,
            so after one setup they follow the window if you move it.
          </p>
        </div>
      </div>

      <div className="button-row wrap-buttons">
        <button type="button" className="button button-secondary" onClick={checkWindow} disabled={selecting}>
          <RefreshCw size={16} /> Check selected window
        </button>
        <button type="button" className="button button-secondary" onClick={inspectWindowUnderMouse} disabled={selecting}>
          <Crosshair size={16} /> Inspect window under mouse
        </button>
        <button type="button" className="button button-primary" onClick={selectWindowUnderMouse} disabled={selecting}>
          <Monitor size={16} /> Select window with mouse
        </button>
        <button type="button" className="button button-warning" onClick={clearSelectedWindow} disabled={selecting}>
          <XCircle size={16} /> Clear selected window
        </button>
        <button type="button" className="button button-warning" onClick={forgetRememberedWindow} disabled={selecting}>
          <XCircle size={16} /> Forget remembered app
        </button>
      </div>

      {message && <div className="mini-info">{message}</div>}

      {checked && windowInfo && renderWindowInfo(windowInfo, 'Selected/detected game window')}

      {mouseWindowInfo && renderWindowInfo(mouseWindowInfo, 'Window under mouse')}

      {checked && !windowInfo && !selecting && (
        <div className="mini-info warning-info">
          <strong><AlertCircle size={16} /> Game window not selected</strong>
          <div>
            Click <strong>Select window with mouse</strong>, then move your mouse over the game window within 5 seconds.
          </div>
        </div>
      )}

      <div className="mini-info">
        <strong>Recommended setup flow</strong>
        <ol className="setup-steps">
          <li>Start the game and keep the game window visible.</li>
          <li>Click <strong>Select window with mouse</strong>.</li>
          <li>Move the mouse over the game window and wait for the 5-second capture.</li>
          <li>Use the normal OCR zone capture for Coordinate, City, and Price.</li>
          <li>The backend saves each zone relative to the selected game window.</li>
          <li>If you restart the backend, select the game window again.</li>
        </ol>
      </div>
    </section>
  );
}
