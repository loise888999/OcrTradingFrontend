import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ocrLayoutApi } from '../ocrLayoutApi.js';

const BOX_TEMPLATES = [
  { id: 'city', label: 'City', path: ['zones', 'city'], color: '#22c55e' },
  { id: 'coordinate', label: 'Coordinate', path: ['zones', 'coordinate'], color: '#38bdf8' },
  { id: 'buyValidationBox', label: 'Buy validation', path: ['price', 'buyValidationBox'], color: '#facc15' },
  { id: 'sellValidationBox', label: 'Sell validation', path: ['price', 'sellValidationBox'], color: '#fb923c' }
];

function createDefaultLayout() {
  return {
    version: 1,
    enabled: true,
    useLayoutForCity: true,
    useLayoutForCoordinate: true,
    useLayoutForPrice: false,
    screenWidth: null,
    screenHeight: null,
    zones: {
      city: { name: 'City', x: 1000, y: 80, width: 260, height: 45 },
      coordinate: { name: 'Coordinate', x: 40, y: 1280, width: 220, height: 45 }
    },
    price: {
      visibleRows: 4,
      useFieldBoxes: false,
      buyValidationBox: { name: 'BuyValidation', x: 900, y: 300, width: 130, height: 45 },
      sellValidationBox: { name: 'SellValidation', x: 1040, y: 300, width: 130, height: 45 },
      rows: createRows(4)
    }
  };
}

function createRows(count) {
  const safeCount = Math.max(1, Math.min(20, Number(count || 4)));
  const startY = 380;
  const rowGap = 45;

  return Array.from({ length: safeCount }, (_, index) => {
    const row = index + 1;
    const y = startY + index * rowGap;

    return {
      index: row,
      enabled: true,
      itemName: { name: `Row${row}ItemName`, x: 820, y, width: 260, height: 35 },
      price: { name: `Row${row}Price`, x: 1160, y, width: 100, height: 35 },
      multiplier: { name: `Row${row}Multiplier`, x: 1270, y, width: 90, height: 35 }
    };
  });
}

function normalizeLayout(layout) {
  const base = createDefaultLayout();
  const merged = {
    ...base,
    ...(layout || {}),
    zones: {
      ...base.zones,
      ...(layout?.zones || {})
    },
    price: {
      ...base.price,
      ...(layout?.price || {}),
      rows: Array.isArray(layout?.price?.rows) && layout.price.rows.length > 0
        ? layout.price.rows
        : base.price.rows
    }
  };

  merged.price.visibleRows = Math.max(1, Math.min(20, Number(merged.price.visibleRows || 4)));

  return merged;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getAtPath(obj, path) {
  return path.reduce((current, key) => current?.[key], obj);
}

function setAtPath(obj, path, value) {
  const copy = clone(obj);
  let current = copy;

  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    current[key] = current[key] || {};
    current = current[key];
  }

  current[path[path.length - 1]] = value;
  return copy;
}

function updateRowBox(layout, rowIndex, field, box) {
  const copy = clone(layout);
  copy.price = copy.price || {};
  copy.price.rows = Array.isArray(copy.price.rows) ? copy.price.rows : [];

  let row = copy.price.rows.find((item) => Number(item.index) === Number(rowIndex));

  if (!row) {
    row = {
      index: Number(rowIndex),
      enabled: true,
      itemName: null,
      price: null,
      multiplier: null
    };
    copy.price.rows.push(row);
    copy.price.rows.sort((a, b) => Number(a.index) - Number(b.index));
  }

  row[field] = box;
  return copy;
}

function getBoxDefinition(selection, layout) {
  if (selection.startsWith('row-')) {
    const [, rowText, field] = selection.split('-');
    const rowIndex = Number(rowText);
    const row = layout.price.rows.find((item) => Number(item.index) === rowIndex);
    const fieldLabel = field === 'itemName' ? 'Item name' : field === 'price' ? 'Price' : 'Multiplier';

    return {
      id: selection,
      label: `Row ${rowIndex} ${fieldLabel}`,
      color: field === 'itemName' ? '#a855f7' : field === 'price' ? '#ef4444' : '#14b8a6',
      box: row?.[field],
      save: (nextLayout, box) => updateRowBox(nextLayout, rowIndex, field, box),
      kind: selection
    };
  }

  const template = BOX_TEMPLATES.find((item) => item.id === selection) || BOX_TEMPLATES[0];

  return {
    ...template,
    box: getAtPath(layout, template.path),
    save: (nextLayout, box) => setAtPath(nextLayout, template.path, box),
    kind: template.id
  };
}

function toScreenBox(box, scale, offsetX = 0, offsetY = 0) {
  return {
    left: (Number(box.x || 0) - offsetX) * scale,
    top: (Number(box.y || 0) - offsetY) * scale,
    width: Number(box.width || 0) * scale,
    height: Number(box.height || 0) * scale
  };
}

function toLayoutBox(rect, scale, offsetX = 0, offsetY = 0, name = '') {
  const safeScale = scale || 1;

  return {
    name,
    x: Math.round(rect.left / safeScale + offsetX),
    y: Math.round(rect.top / safeScale + offsetY),
    width: Math.max(1, Math.round(rect.width / safeScale)),
    height: Math.max(1, Math.round(rect.height / safeScale))
  };
}

function fieldNameFromSelection(selection) {
  if (selection === 'city') return 'City';
  if (selection === 'coordinate') return 'Coordinate';
  if (selection === 'buyValidationBox') return 'BuyValidation';
  if (selection === 'sellValidationBox') return 'SellValidation';

  if (selection.startsWith('row-')) {
    const [, row, field] = selection.split('-');
    const suffix = field === 'itemName' ? 'ItemName' : field === 'price' ? 'Price' : 'Multiplier';
    return `Row${row}${suffix}`;
  }

  return selection;
}

function copyBoxFromFirstRow(layout, rowCount, rowGap) {
  const copy = clone(layout);
  const first = copy.price.rows.find((row) => Number(row.index) === 1);

  if (!first?.itemName || !first?.price || !first?.multiplier) {
    return copy;
  }

  copy.price.visibleRows = rowCount;
  copy.price.rows = Array.from({ length: rowCount }, (_, index) => {
    const rowIndex = index + 1;
    const yOffset = index * rowGap;

    return {
      index: rowIndex,
      enabled: true,
      itemName: {
        ...first.itemName,
        name: `Row${rowIndex}ItemName`,
        y: Number(first.itemName.y) + yOffset
      },
      price: {
        ...first.price,
        name: `Row${rowIndex}Price`,
        y: Number(first.price.y) + yOffset
      },
      multiplier: {
        ...first.multiplier,
        name: `Row${rowIndex}Multiplier`,
        y: Number(first.multiplier.y) + yOffset
      }
    };
  });

  return copy;
}

export default function OcrCalibrationApp() {
  const imageRef = useRef(null);
  const stageRef = useRef(null);

  const [layout, setLayout] = useState(createDefaultLayout());
  const [selection, setSelection] = useState('city');
  const [captureUrl, setCaptureUrl] = useState('');
  const [captureSize, setCaptureSize] = useState({ width: 0, height: 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [screenOffset, setScreenOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(null);
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [rowCount, setRowCount] = useState(4);
  const [rowGap, setRowGap] = useState(45);
  const [isSaving, setIsSaving] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const boxDefinition = useMemo(
    () => getBoxDefinition(selection, layout),
    [selection, layout]
  );

  const scale = useMemo(() => {
    if (!captureSize.width || !captureSize.height || !stageSize.width || !stageSize.height) {
      return 1;
    }

    return Math.min(stageSize.width / captureSize.width, stageSize.height / captureSize.height);
  }, [captureSize, stageSize]);

  const imageDisplaySize = useMemo(() => ({
    width: captureSize.width * scale,
    height: captureSize.height * scale
  }), [captureSize, scale]);

  const selectedBox = boxDefinition.box || {
    name: fieldNameFromSelection(selection),
    x: screenOffset.x + 20,
    y: screenOffset.y + 20,
    width: 180,
    height: 40
  };

  const screenBox = toScreenBox(selectedBox, scale, screenOffset.x, screenOffset.y);

  const updateStageSize = useCallback(() => {
    const element = stageRef.current;
    if (!element) return;

    const bounds = element.getBoundingClientRect();
    setStageSize({
      width: bounds.width,
      height: bounds.height
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const loaded = await ocrLayoutApi.getLayout();
        if (!cancelled) {
          const normalized = normalizeLayout(loaded);
          setLayout(normalized);
          setRowCount(Number(normalized.price.visibleRows || 4));
          setMessage('Loaded OCR layout from backend.');
        }
      } catch (err) {
        if (!cancelled) {
          setMessage(`Could not load layout: ${err.message}`);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    updateStageSize();
    window.addEventListener('resize', updateStageSize);
    return () => window.removeEventListener('resize', updateStageSize);
  }, [updateStageSize]);

  const selectedBoxWithName = useMemo(() => ({
    ...selectedBox,
    name: selectedBox.name || fieldNameFromSelection(selection)
  }), [selectedBox, selection]);

  const saveSelectedBox = useCallback((box) => {
    setLayout((current) => boxDefinition.save(current, box));
  }, [boxDefinition]);

  const updateSelectedBoxNumber = (key, value) => {
    saveSelectedBox({
      ...selectedBoxWithName,
      [key]: Number(value || 0)
    });
  };

  const startScreenCapture = async () => {
    try {
      setMessage('');
      setIsCapturing(true);

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always'
        },
        audio: false
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      await new Promise((resolve) => {
        if (video.videoWidth > 0) {
          resolve();
        } else {
          video.onloadedmetadata = resolve;
        }
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      stream.getTracks().forEach((track) => track.stop());

      const dataUrl = canvas.toDataURL('image/png');

      setCaptureUrl(dataUrl);
      setCaptureSize({
        width: canvas.width,
        height: canvas.height
      });
      setLayout((current) => ({
        ...current,
        screenWidth: canvas.width,
        screenHeight: canvas.height
      }));

      setMessage(
        `Captured ${canvas.width}x${canvas.height}. If this is a secondary monitor, set Screen offset X/Y before saving boxes.`
      );

      setTimeout(updateStageSize, 50);
    } catch (err) {
      setMessage(`Screen capture failed: ${err.message}`);
    } finally {
      setIsCapturing(false);
    }
  };

  const handlePointerDown = (event, mode) => {
    event.preventDefault();
    event.stopPropagation();

    setDrag({
      mode,
      startX: event.clientX,
      startY: event.clientY,
      original: { ...screenBox }
    });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (event) => {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;

      let next = { ...drag.original };

      if (drag.mode === 'move') {
        next.left += dx;
        next.top += dy;
      }

      if (drag.mode.includes('e')) {
        next.width = Math.max(8, drag.original.width + dx);
      }

      if (drag.mode.includes('s')) {
        next.height = Math.max(8, drag.original.height + dy);
      }

      if (drag.mode.includes('w')) {
        next.left = drag.original.left + dx;
        next.width = Math.max(8, drag.original.width - dx);
      }

      if (drag.mode.includes('n')) {
        next.top = drag.original.top + dy;
        next.height = Math.max(8, drag.original.height - dy);
      }

      const box = toLayoutBox(
        next,
        scale,
        Number(screenOffset.x || 0),
        Number(screenOffset.y || 0),
        selectedBoxWithName.name || fieldNameFromSelection(selection)
      );

      saveSelectedBox(box);
    };

    const onUp = () => setDrag(null);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, scale, screenOffset.x, screenOffset.y, saveSelectedBox, selectedBoxWithName.name, selection]);

  const testSelectedBox = async () => {
    try {
      setTestResult(null);
      setMessage('Testing selected box...');

      const result = await ocrLayoutApi.testBox({
        kind: boxDefinition.kind,
        preprocess: true,
        box: selectedBoxWithName
      });

      setTestResult(result);
      setMessage('Box tested.');
    } catch (err) {
      setMessage(`Test failed: ${err.message}`);
    }
  };

  const saveLayout = async () => {
    try {
      setIsSaving(true);
      setMessage('Saving layout...');

      const saved = await ocrLayoutApi.saveLayout(layout);
      setLayout(normalizeLayout(saved));
      setMessage('Layout saved to backend local layout file.');
    } catch (err) {
      setMessage(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const applyRowsFromFirstRow = () => {
    setLayout((current) => copyBoxFromFirstRow(current, Number(rowCount), Number(rowGap)));
  };

  const togglePriceFieldMode = (checked) => {
    setLayout((current) => ({
      ...current,
      useLayoutForPrice: checked,
      price: {
        ...current.price,
        useFieldBoxes: checked
      }
    }));
  };

  const boxList = useMemo(() => {
    const rows = layout.price.rows
      .slice()
      .sort((a, b) => Number(a.index) - Number(b.index))
      .flatMap((row) => [
        { id: `row-${row.index}-itemName`, label: `Row ${row.index} item`, color: '#a855f7' },
        { id: `row-${row.index}-price`, label: `Row ${row.index} price`, color: '#ef4444' },
        { id: `row-${row.index}-multiplier`, label: `Row ${row.index} multiplier`, color: '#14b8a6' }
      ]);

    return [
      ...BOX_TEMPLATES.map((box) => ({
        id: box.id,
        label: box.label,
        color: box.color
      })),
      ...rows
    ];
  }, [layout.price.rows]);

  return (
    <div className="calibration-shell">
      <style>{calibrationCss}</style>

      <aside className="calibration-sidebar">
        <h1>OCR Calibration</h1>
        <p>
          Cross-platform editor: capture your screen/window, move the boxes on the screenshot,
          then save the layout to the backend.
        </p>

        <button className="calibration-button primary" onClick={startScreenCapture} disabled={isCapturing}>
          {isCapturing ? 'Capturing...' : 'Capture screen / game window'}
        </button>

        <button className="calibration-button" onClick={saveLayout} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save layout'}
        </button>

        <button className="calibration-button" onClick={() => window.location.href = '/'}>
          Back to main app
        </button>

        <div className="calibration-section">
          <h2>Screen offset</h2>
          <p>
            Use 0,0 for primary monitor. For a secondary monitor, set its global top-left offset.
          </p>

          <label>
            Offset X
            <input
              type="number"
              value={screenOffset.x}
              onChange={(event) => setScreenOffset((current) => ({ ...current, x: Number(event.target.value || 0) }))}
            />
          </label>

          <label>
            Offset Y
            <input
              type="number"
              value={screenOffset.y}
              onChange={(event) => setScreenOffset((current) => ({ ...current, y: Number(event.target.value || 0) }))}
            />
          </label>
        </div>

        <div className="calibration-section">
          <h2>Mode</h2>

          <label className="calibration-checkbox">
            <input
              type="checkbox"
              checked={Boolean(layout.useLayoutForCity)}
              onChange={(event) => setLayout((current) => ({ ...current, useLayoutForCity: event.target.checked }))}
            />
            Use layout for City
          </label>

          <label className="calibration-checkbox">
            <input
              type="checkbox"
              checked={Boolean(layout.useLayoutForCoordinate)}
              onChange={(event) => setLayout((current) => ({ ...current, useLayoutForCoordinate: event.target.checked }))}
            />
            Use layout for Coordinate
          </label>

          <label className="calibration-checkbox">
            <input
              type="checkbox"
              checked={Boolean(layout.useLayoutForPrice && layout.price.useFieldBoxes)}
              onChange={(event) => togglePriceFieldMode(event.target.checked)}
            />
            Use exact price field boxes
          </label>
        </div>

        <div className="calibration-section">
          <h2>Rows</h2>

          <label>
            Visible trade-good rows
            <input
              type="number"
              min="1"
              max="20"
              value={rowCount}
              onChange={(event) => setRowCount(Number(event.target.value || 1))}
            />
          </label>

          <label>
            Row gap in pixels
            <input
              type="number"
              value={rowGap}
              onChange={(event) => setRowGap(Number(event.target.value || 45))}
            />
          </label>

          <button className="calibration-button" onClick={applyRowsFromFirstRow}>
            Copy row 1 boxes to all rows
          </button>
        </div>

        <div className="calibration-section">
          <h2>Selected box</h2>

          <select value={selection} onChange={(event) => setSelection(event.target.value)}>
            {boxList.map((box) => (
              <option key={box.id} value={box.id}>
                {box.label}
              </option>
            ))}
          </select>

          <label>
            X
            <input
              type="number"
              value={selectedBoxWithName.x}
              onChange={(event) => updateSelectedBoxNumber('x', event.target.value)}
            />
          </label>

          <label>
            Y
            <input
              type="number"
              value={selectedBoxWithName.y}
              onChange={(event) => updateSelectedBoxNumber('y', event.target.value)}
            />
          </label>

          <label>
            Width
            <input
              type="number"
              value={selectedBoxWithName.width}
              onChange={(event) => updateSelectedBoxNumber('width', event.target.value)}
            />
          </label>

          <label>
            Height
            <input
              type="number"
              value={selectedBoxWithName.height}
              onChange={(event) => updateSelectedBoxNumber('height', event.target.value)}
            />
          </label>

          <button className="calibration-button primary" onClick={testSelectedBox}>
            Test selected box OCR
          </button>
        </div>

        {message && (
          <div className="calibration-message">
            {message}
          </div>
        )}

        {testResult && (
          <div className="calibration-result">
            <strong>OCR result</strong>
            <pre>{testResult.rawText || '(empty)'}</pre>
            {testResult.debugImagePath && <small>{testResult.debugImagePath}</small>}
          </div>
        )}
      </aside>

      <main className="calibration-main">
        <div className="calibration-toolbar">
          <strong>{boxDefinition.label}</strong>
          <span>
            Box: X {selectedBoxWithName.x}, Y {selectedBoxWithName.y}, W {selectedBoxWithName.width}, H {selectedBoxWithName.height}
          </span>
          <span>
            API: {ocrLayoutApi.baseUrl}
          </span>
        </div>

        <div ref={stageRef} className="calibration-stage">
          {!captureUrl && (
            <div className="calibration-empty">
              <h2>No screenshot captured yet</h2>
              <p>
                Click “Capture screen / game window”, select the monitor or game window, then move and resize the boxes.
              </p>
            </div>
          )}

          {captureUrl && (
            <div
              className="calibration-image-wrap"
              style={{
                width: imageDisplaySize.width,
                height: imageDisplaySize.height
              }}
            >
              <img
                ref={imageRef}
                alt="Captured game screen"
                src={captureUrl}
                draggable={false}
                onLoad={updateStageSize}
              />

              <div
                className="calibration-box"
                style={{
                  left: screenBox.left,
                  top: screenBox.top,
                  width: screenBox.width,
                  height: screenBox.height,
                  borderColor: boxDefinition.color,
                  boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.18), 0 0 0 2px ${boxDefinition.color}`
                }}
                onPointerDown={(event) => handlePointerDown(event, 'move')}
              >
                <span style={{ background: boxDefinition.color }}>
                  {boxDefinition.label}
                </span>

                <button
                  className="handle handle-nw"
                  onPointerDown={(event) => handlePointerDown(event, 'nw')}
                  aria-label="Resize northwest"
                />
                <button
                  className="handle handle-ne"
                  onPointerDown={(event) => handlePointerDown(event, 'ne')}
                  aria-label="Resize northeast"
                />
                <button
                  className="handle handle-sw"
                  onPointerDown={(event) => handlePointerDown(event, 'sw')}
                  aria-label="Resize southwest"
                />
                <button
                  className="handle handle-se"
                  onPointerDown={(event) => handlePointerDown(event, 'se')}
                  aria-label="Resize southeast"
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const calibrationCss = `
  body {
    margin: 0;
    background: #020617;
  }

  .calibration-shell {
    display: grid;
    grid-template-columns: 380px minmax(0, 1fr);
    width: 100vw;
    height: 100vh;
    color: #e2e8f0;
    background: #020617;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .calibration-sidebar {
    overflow: auto;
    border-right: 1px solid rgba(148, 163, 184, 0.24);
    padding: 18px;
    background: #0f172a;
  }

  .calibration-sidebar h1 {
    margin: 0 0 6px;
    font-size: 28px;
  }

  .calibration-sidebar p {
    margin: 0 0 14px;
    color: #94a3b8;
    line-height: 1.45;
  }

  .calibration-section {
    display: grid;
    gap: 9px;
    margin-top: 16px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 16px;
    padding: 12px;
    background: rgba(15, 23, 42, 0.76);
  }

  .calibration-section h2 {
    margin: 0;
    font-size: 16px;
  }

  .calibration-section label {
    display: grid;
    gap: 5px;
    color: #cbd5e1;
    font-weight: 800;
    font-size: 13px;
  }

  .calibration-section input,
  .calibration-section select {
    width: 100%;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 8px 10px;
    background: #020617;
    color: #e2e8f0;
    font: inherit;
  }

  .calibration-checkbox {
    grid-template-columns: 20px 1fr;
    align-items: center;
  }

  .calibration-checkbox input {
    width: 18px;
    height: 18px;
  }

  .calibration-button {
    width: 100%;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 10px 12px;
    background: #1e293b;
    color: #e2e8f0;
    font-weight: 900;
    cursor: pointer;
  }

  .calibration-button:hover:not(:disabled) {
    background: #334155;
  }

  .calibration-button.primary {
    border-color: #2563eb;
    background: #2563eb;
    color: #ffffff;
  }

  .calibration-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .calibration-message,
  .calibration-result {
    margin-top: 14px;
    border-radius: 14px;
    padding: 12px;
    background: #172554;
    color: #dbeafe;
  }

  .calibration-result {
    background: #052e16;
    color: #dcfce7;
  }

  .calibration-result pre {
    overflow: auto;
    white-space: pre-wrap;
    border-radius: 10px;
    padding: 10px;
    background: rgba(2, 6, 23, 0.45);
  }

  .calibration-result small {
    color: #86efac;
  }

  .calibration-main {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
  }

  .calibration-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    padding: 12px 16px;
    background: #020617;
    color: #cbd5e1;
  }

  .calibration-toolbar strong {
    color: #ffffff;
  }

  .calibration-stage {
    position: relative;
    overflow: auto;
    display: grid;
    place-items: start center;
    min-width: 0;
    min-height: 0;
    padding: 18px;
    background:
      linear-gradient(45deg, rgba(148, 163, 184, 0.12) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(148, 163, 184, 0.12) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(148, 163, 184, 0.12) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(148, 163, 184, 0.12) 75%);
    background-size: 28px 28px;
    background-position: 0 0, 0 14px, 14px -14px, -14px 0;
  }

  .calibration-empty {
    max-width: 620px;
    margin: 80px auto;
    border: 1px dashed rgba(226, 232, 240, 0.3);
    border-radius: 22px;
    padding: 30px;
    background: rgba(15, 23, 42, 0.82);
    text-align: center;
  }

  .calibration-empty h2 {
    margin-top: 0;
  }

  .calibration-empty p {
    color: #94a3b8;
  }

  .calibration-image-wrap {
    position: relative;
    flex: none;
    background: #000000;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
  }

  .calibration-image-wrap img {
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
    pointer-events: none;
  }

  .calibration-box {
    position: absolute;
    border: 2px solid;
    cursor: move;
    user-select: none;
    touch-action: none;
  }

  .calibration-box span {
    position: absolute;
    left: -2px;
    top: -26px;
    max-width: 260px;
    overflow: hidden;
    border-radius: 8px 8px 0 0;
    padding: 5px 8px;
    color: #020617;
    font-size: 12px;
    font-weight: 950;
    white-space: nowrap;
  }

  .handle {
    position: absolute;
    width: 13px;
    height: 13px;
    border: 2px solid #020617;
    border-radius: 999px;
    background: #ffffff;
    cursor: pointer;
  }

  .handle-nw {
    left: -8px;
    top: -8px;
    cursor: nwse-resize;
  }

  .handle-ne {
    right: -8px;
    top: -8px;
    cursor: nesw-resize;
  }

  .handle-sw {
    left: -8px;
    bottom: -8px;
    cursor: nesw-resize;
  }

  .handle-se {
    right: -8px;
    bottom: -8px;
    cursor: nwse-resize;
  }

  @media (max-width: 960px) {
    .calibration-shell {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
    }

    .calibration-sidebar {
      max-height: 50vh;
      border-right: 0;
      border-bottom: 1px solid rgba(148, 163, 184, 0.24);
    }
  }
`;
