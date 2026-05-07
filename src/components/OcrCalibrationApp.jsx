import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ocrLayoutApi } from '../ocrLayoutApi.js';

const BASE_BOXES = [
  { id: 'city', label: 'City region', path: ['zones', 'city'], color: '#22c55e' },
  { id: 'coordinate', label: 'Coordinate', path: ['zones', 'coordinate'], color: '#38bdf8' },
  { id: 'buyValidationBox', label: 'Buy region', path: ['price', 'buyValidationBox'], color: '#facc15' },
  { id: 'sellValidationBox', label: 'Sell region', path: ['price', 'sellValidationBox'], color: '#fb923c' }
];

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
      row: { name: `Row${row}`, x: 810, y, width: 560, height: 35 },
      itemName: null,
      price: null,
      multiplier: null
    };
  });
}

function createDefaultLayout() {
  return {
    version: 1,
    enabled: true,
    useLayoutForCity: true,
    useLayoutForCoordinate: true,
    useLayoutForPrice: true,
    screenWidth: null,
    screenHeight: null,
    zones: {
      city: { name: 'City', x: 1000, y: 80, width: 260, height: 45 },
      coordinate: { name: 'Coordinate', x: 40, y: 1280, width: 220, height: 45 }
    },
    price: {
      visibleRows: 4,
      useFieldBoxes: true,
      buyValidationBox: { name: 'BuyValidation', x: 900, y: 300, width: 130, height: 45 },
      sellValidationBox: { name: 'SellValidation', x: 1040, y: 300, width: 130, height: 45 },
      rows: createRows(4)
    }
  };
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
  merged.useLayoutForPrice = true;
  merged.price.useFieldBoxes = true;
  merged.price.rows = merged.price.rows.map((row) => ({
    ...row,
    row: row.row || buildWholeRowBoxFromFields(row)
  }));
  return merged;
}

function isBoxValid(box) {
  return box && Number(box.width || 0) > 0 && Number(box.height || 0) > 0;
}

function buildWholeRowBoxFromFields(row) {
  const fields = [row?.itemName, row?.price, row?.multiplier].filter(isBoxValid);

  if (fields.length === 0) return null;

  const left = Math.min(...fields.map((box) => Number(box.x || 0)));
  const top = Math.min(...fields.map((box) => Number(box.y || 0)));
  const right = Math.max(...fields.map((box) => Number(box.x || 0) + Number(box.width || 0)));
  const bottom = Math.max(...fields.map((box) => Number(box.y || 0) + Number(box.height || 0)));
  const index = row?.index ?? row?.Index ?? '';

  return {
    name: `Row${index}`,
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
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
    current[path[i]] = current[path[i]] || {};
    current = current[path[i]];
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
      row: null,
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

function fieldNameFromSelection(selection) {
  if (selection === 'city') return 'City';
  if (selection === 'coordinate') return 'Coordinate';
  if (selection === 'buyValidationBox') return 'BuyValidation';
  if (selection === 'sellValidationBox') return 'SellValidation';

  if (selection.startsWith('row-')) {
    const [, row] = selection.split('-');
    return `Row${row}`;
  }

  return selection;
}

function getBoxDefinition(selection, layout) {
  if (selection.startsWith('row-')) {
    const [, rowText] = selection.split('-');
    const rowIndex = Number(rowText);
    const row = layout.price.rows.find((item) => Number(item.index) === rowIndex);

    return {
      id: selection,
      label: `Row ${rowIndex} whole row`,
      color: '#f97316',
      box: row?.row,
      kind: selection,
      save: (nextLayout, box) => updateRowBox(nextLayout, rowIndex, 'row', box)
    };
  }

  const template = BASE_BOXES.find((item) => item.id === selection) || BASE_BOXES[0];

  return {
    ...template,
    box: getAtPath(layout, template.path),
    kind: template.id,
    save: (nextLayout, box) => setAtPath(nextLayout, template.path, box)
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

function buildApiAssetUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${ocrLayoutApi.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function GuidePreview() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="calibration-debug-preview">
      <span>Target crop guide</span>
      <img
        className="calibration-debug-guide"
        src="/ocr-preprocess-guide.png"
        alt="Good OCR crop example"
        onError={() => setVisible(false)}
      />
    </div>
  );
}

function CoordinateZoomLens({
  captureUrl,
  captureSize,
  box
}) {
  if (!captureUrl || !captureSize.width || !captureSize.height || !box) {
    return null;
  }

  const lensWidth = 320;
  const lensHeight = 180;
  const zoom = 3;
  const centerX = Math.max(0, Math.min(captureSize.width, Number(box.x || 0) + Number(box.width || 0) / 2));
  const centerY = Math.max(0, Math.min(captureSize.height, Number(box.y || 0) + Number(box.height || 0) / 2));
  const boxWidth = Math.max(1, Number(box.width || 0) * zoom);
  const boxHeight = Math.max(1, Number(box.height || 0) * zoom);

  return (
    <div className="coordinate-zoom-panel">
      <div
        className="coordinate-zoom-lens"
        style={{
          width: lensWidth,
          height: lensHeight,
          backgroundImage: `url(${captureUrl})`,
          backgroundSize: `${captureSize.width * zoom}px ${captureSize.height * zoom}px`,
          backgroundPosition: `${-(centerX * zoom - lensWidth / 2)}px ${-(centerY * zoom - lensHeight / 2)}px`
        }}
      >
        <div
          className="coordinate-zoom-box"
          style={{
            width: boxWidth,
            height: boxHeight
          }}
        />
      </div>
      <div className="coordinate-zoom-meta">
        <strong>Coordinate zoom</strong>
        <span>
          X {box.x}, Y {box.y}, W {box.width}, H {box.height}
        </span>
      </div>
    </div>
  );
}

function copyBoxFromFirstRow(layout, rowCount, rowGap) {
  const copy = clone(layout);
  const first = copy.price.rows.find((row) => Number(row.index) === 1);

  if (!first?.row) {
    return copy;
  }

  copy.price.visibleRows = rowCount;
  copy.price.rows = Array.from({ length: rowCount }, (_, index) => {
    const rowIndex = index + 1;
    const yOffset = index * rowGap;

    return {
      index: rowIndex,
      enabled: true,
      row: first.row
        ? {
            ...first.row,
            name: `Row${rowIndex}`,
            y: Number(first.row.y) + yOffset
          }
        : null,
      itemName: null,
      price: null,
      multiplier: null
    };
  });

  return copy;
}

function getWindowLabel(gameWindow) {
  if (!gameWindow) return '';

  return (
    gameWindow.title ||
    gameWindow.processName ||
    gameWindow.windowTitle ||
    gameWindow.name ||
    'Game window'
  );
}

function readNumber(value, names, fallback = 0) {
  if (!value) return fallback;

  for (const name of names) {
    const found = value[name];
    if (found !== undefined && found !== null && Number.isFinite(Number(found))) {
      return Number(found);
    }
  }

  return fallback;
}

function getGameWindowLeft(gameWindow) {
  return readNumber(gameWindow, ['left', 'Left', 'x', 'X'], 0);
}

function getGameWindowTop(gameWindow) {
  return readNumber(gameWindow, ['top', 'Top', 'y', 'Y'], 0);
}

function getGameWindowWidth(gameWindow) {
  return readNumber(gameWindow, ['width', 'Width'], 0);
}

function getGameWindowHeight(gameWindow) {
  return readNumber(gameWindow, ['height', 'Height'], 0);
}

function getGameWindowOffset(gameWindow) {
  return {
    x: getGameWindowLeft(gameWindow),
    y: getGameWindowTop(gameWindow)
  };
}

function sameOffset(a, b) {
  return Number(a?.x || 0) === Number(b?.x || 0) &&
    Number(a?.y || 0) === Number(b?.y || 0);
}

function mapScoreKeyToSelection(key) {
  if (key === 'trade-menu') return 'buyValidationBox';
  if (key === 'buy-validation') return 'buyValidationBox';
  if (key === 'sell-validation') return 'sellValidationBox';
  return key || 'city';
}

function getScoreStatusLabel(status) {
  if (status === 'pass') return 'Pass';
  if (status === 'warn') return 'Check';
  if (status === 'fail') return 'Fail';
  return 'Skip';
}

function CalibrationScorePanel({ result, onSelectCheck }) {
  const checks = Array.isArray(result?.checks) ? result.checks : [];
  const recommendations = Array.isArray(result?.recommendations) ? result.recommendations : [];
  const scorePercent = Math.round(Number(result?.score || 0) * 100);
  const shownChecks = checks
    .filter((check) => check.status !== 'skipped')
    .sort((a, b) => Number(a.score || 0) - Number(b.score || 0));

  return (
    <div className="calibration-score-panel">
      <div className="calibration-score-header">
        <div>
          <strong>{scorePercent}%</strong>
          <span>Calibration score</span>
        </div>
        <small>
          {result.passedChecks || 0} pass · {result.warningChecks || 0} check · {result.failedChecks || 0} fail
        </small>
      </div>

      {recommendations.length > 0 && (
        <div className="calibration-score-recommendations">
          {recommendations.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      )}

      <div className="calibration-score-list">
        {shownChecks.map((check) => (
          <button
            key={check.key}
            type="button"
            className={`calibration-score-check ${check.status}`}
            onClick={() => onSelectCheck(check.key)}
          >
            <span>{getScoreStatusLabel(check.status)}</span>
            <strong>{check.label}</strong>
            <small>{check.message}</small>
            {check.rawText && <code>{check.rawText}</code>}
          </button>
        ))}
      </div>
    </div>
  );
}

function GameWindowStatus({ gameWindow, gameWindowError, captureSize, captureUrl }) {
  const hasGameWindow = Boolean(gameWindow);
  const hasOverlayCapture = Boolean(captureUrl);

  return (
    <div className="calibration-status-wrapper">
      <div className="calibration-status-grid">
        <div className={`calibration-status-card ${hasGameWindow ? 'ok' : 'bad'}`}>
          <strong>Main app game selection</strong>
          <span>{hasGameWindow ? 'Selected / found' : 'Not selected / not found'}</span>
          {hasGameWindow && (
            <small>
              {getWindowLabel(gameWindow)}
              {` · ${getGameWindowLeft(gameWindow)},${getGameWindowTop(gameWindow)}`}
              {getGameWindowWidth(gameWindow) && getGameWindowHeight(gameWindow)
                ? ` · ${getGameWindowWidth(gameWindow)}×${getGameWindowHeight(gameWindow)}`
                : ''}
            </small>
          )}
        </div>

        <div className={`calibration-status-card ${hasOverlayCapture ? 'ok' : 'bad'}`}>
          <strong>Overlay helper capture</strong>
          <span>{hasOverlayCapture ? 'Screenshot loaded' : 'No screenshot yet'}</span>
          {hasOverlayCapture && <small>{captureSize.width} × {captureSize.height}</small>}
        </div>
      </div>

      {gameWindowError && <p className="calibration-error">{gameWindowError}</p>}
    </div>
  );
}

export default function OcrCalibrationApp() {
  const stageRef = useRef(null);

  const [layout, setLayout] = useState(createDefaultLayout());
  const [selection, setSelection] = useState('city');
  const [captureUrl, setCaptureUrl] = useState('');
  const [captureSize, setCaptureSize] = useState({ width: 0, height: 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const screenOffset = { x: 0, y: 0 };
  const [drag, setDrag] = useState(null);
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [rowCount, setRowCount] = useState(4);
  const [rowGap, setRowGap] = useState(45);
  const [showRowSetup, setShowRowSetup] = useState(false);
  const [showBoxNumbers, setShowBoxNumbers] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [calibrationScore, setCalibrationScore] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [gameWindow, setGameWindow] = useState(null);
  const [gameWindowError, setGameWindowError] = useState('');

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

  const imageDisplaySize = useMemo(
    () => ({
      width: captureSize.width * scale,
      height: captureSize.height * scale
    }),
    [captureSize, scale]
  );

  const selectedBox = boxDefinition.box || {
    name: fieldNameFromSelection(selection),
    x: screenOffset.x + 20,
    y: screenOffset.y + 20,
    width: 180,
    height: 40
  };

  const selectedBoxWithName = useMemo(
    () => ({
      ...selectedBox,
      name: selectedBox.name || fieldNameFromSelection(selection)
    }),
    [selectedBox, selection]
  );

  const screenBox = toScreenBox(
    selectedBoxWithName,
    scale,
    screenOffset.x,
    screenOffset.y
  );

  const updateStageSize = useCallback(() => {
    const element = stageRef.current;
    if (!element) return;

    const bounds = element.getBoundingClientRect();
    setStageSize({
      width: bounds.width,
      height: bounds.height
    });
  }, []);


  const refreshGameWindow = useCallback(async () => {
    try {
      setGameWindowError('');
      const windowInfo = await ocrLayoutApi.getGameWindow();
      setGameWindow(windowInfo);

    } catch (err) {
      setGameWindow(null);
      setGameWindowError(err?.message || 'Game window not found.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const loaded = await ocrLayoutApi.getLayout();

        if (cancelled) return;

        const normalized = normalizeLayout(loaded);
        setLayout(normalized);
        setRowCount(Number(normalized.price.visibleRows || 4));
        setMessage('Loaded OCR layout from backend.');
      } catch (err) {
        if (!cancelled) {
          setMessage(`Could not load layout: ${err?.message || 'Unknown error'}`);
        }
      }
    }

    load();
    refreshGameWindow();

    return () => {
      cancelled = true;
    };
  }, [refreshGameWindow]);


  useEffect(() => {
    updateStageSize();
    window.addEventListener('resize', updateStageSize);

    return () => window.removeEventListener('resize', updateStageSize);
  }, [updateStageSize]);

  const saveSelectedBox = useCallback(
    (box) => {
      setLayout((current) => boxDefinition.save(current, box));
    },
    [boxDefinition]
  );

  const updateSelectedBoxNumber = (key, value) => {
    saveSelectedBox({
      ...selectedBoxWithName,
      [key]: Number(value || 0)
    });
  };

  const resetSelectedBoxIntoView = () => {
    const safeWidth = Math.max(20, Number(selectedBoxWithName.width || 180));
    const safeHeight = Math.max(20, Number(selectedBoxWithName.height || 40));

    const maxVisibleX = captureSize.width
      ? screenOffset.x + Math.max(0, captureSize.width - safeWidth - 20)
      : screenOffset.x + 20;

    const maxVisibleY = captureSize.height
      ? screenOffset.y + Math.max(0, captureSize.height - safeHeight - 20)
      : screenOffset.y + 20;

    const nextBox = {
      ...selectedBoxWithName,
      name: selectedBoxWithName.name || fieldNameFromSelection(selection),
      x: Math.min(screenOffset.x + 20, maxVisibleX),
      y: Math.min(screenOffset.y + 20, maxVisibleY),
      width: safeWidth,
      height: safeHeight
    };

    saveSelectedBox(nextBox);

    setMessage(
      `Reset ${boxDefinition.label} box into the visible captured game image at X ${nextBox.x}, Y ${nextBox.y}.`
    );
  };

  const selectGameUnderMouse = async () => {
    try {
      setMessage('Move your mouse over the game window. Selection will happen in 5 seconds...');

      const selected = await ocrLayoutApi.selectWindowUnderMouseDelayed({ seconds: 5 });

      setGameWindow(selected);
      setGameWindowError('');

      setMessage('Game window selected in backend. The backend will apply the current window offset automatically when OCR is tested.');
    } catch (err) {
      setGameWindow(null);
      setGameWindowError(err?.message || 'Could not select game window.');
      setMessage(`Could not select game window: ${err?.message || 'Unknown error'}`);
    }
  };

  const startScreenCapture = async () => {
    try {
      setMessage('Choose the same game window or monitor that is selected in the main app.');
      setIsCapturing(true);

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      await new Promise((resolve) => {
        if (video.videoWidth > 0) resolve();
        else video.onloadedmetadata = resolve;
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
        `Overlay helper screenshot captured: ${canvas.width}x${canvas.height}. ` +
        'Box coordinates are saved relative to this capture; the backend applies the current game-window offset automatically.'
      );
      setTimeout(updateStageSize, 50);
    } catch (err) {
      setMessage(`Screen capture failed: ${err?.message || 'Unknown error'}`);
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

      // IMPORTANT:
      // Do not use string checks like mode.includes('e') for "move".
      // The word "move" contains "e", which caused the box width to change while dragging.
      if (drag.mode === 'move') {
        next = {
          ...next,
          left: drag.original.left + dx,
          top: drag.original.top + dy,
          width: drag.original.width,
          height: drag.original.height
        };
      } else {
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
  }, [
    drag,
    scale,
    screenOffset.x,
    screenOffset.y,
    saveSelectedBox,
    selectedBoxWithName.name,
    selection
  ]);

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
      setMessage(`Test failed: ${err?.message || 'Unknown error'}`);
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
      setMessage(`Save failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const runCalibrationScore = async () => {
    try {
      setIsScoring(true);
      setCalibrationScore(null);
      setMessage('Saving layout and scoring OCR boxes...');

      const saved = await ocrLayoutApi.saveLayout(layout);
      const normalized = normalizeLayout(saved);
      setLayout(normalized);

      const result = await ocrLayoutApi.scoreCalibration();
      setCalibrationScore(result);
      setMessage(`Calibration score: ${Math.round(Number(result.score || 0) * 100)}%.`);
    } catch (err) {
      setMessage(`Calibration score failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsScoring(false);
    }
  };

  const applyRowsFromFirstRow = () => {
    setLayout((current) => copyBoxFromFirstRow(current, Number(rowCount), Number(rowGap)));
  };

  const boxList = useMemo(() => {
    const rows = layout.price.rows
      .slice()
      .sort((a, b) => Number(a.index) - Number(b.index))
      .map((row) => ({ id: `row-${row.index}-row`, label: `Row ${row.index} whole row` }));

    return [
      ...BASE_BOXES.map((box) => ({
        id: box.id,
        label: box.label
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
          Capture the game/window, then drag and resize exact OCR boxes.
        </p>

        <GameWindowStatus
          gameWindow={gameWindow}
          gameWindowError={gameWindowError}
          captureSize={captureSize}
          captureUrl={captureUrl}
        />

        <button className="calibration-button" onClick={refreshGameWindow}>
          Refresh main app game status
        </button>

        <button className="calibration-button" onClick={selectGameUnderMouse}>
          Redo game selection here, under mouse in 5s
        </button>

        <button className="calibration-button primary" onClick={startScreenCapture} disabled={isCapturing}>
          {isCapturing ? 'Capturing...' : 'Capture screen / game window'}
        </button>

        <button className="calibration-button" onClick={saveLayout} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save layout'}
        </button>

        <button className="calibration-button primary" onClick={runCalibrationScore} disabled={isScoring}>
          {isScoring ? 'Scoring...' : 'Save + score calibration'}
        </button>

        <button className="calibration-button" onClick={() => { window.location.href = '/'; }}>
          Back to main app
        </button>

        <div className="calibration-section">
          <h2>Coordinate handling</h2>
          <p>
            First select the game window, then capture the game screen. Choose City region,
            Coordinate, or a row box from Selected box, then drag and resize the highlighted box
            over the matching text in the screenshot. Use Test selected box OCR to check the
            result before moving to the next box. When the boxes look right, save the layout.
          </p>
        </div>

        <div className="calibration-section">
          <button
            className="calibration-disclosure-button"
            type="button"
            aria-expanded={showRowSetup}
            onClick={() => setShowRowSetup((value) => !value)}
          >
            <span>Advanced row setup</span>
            <span>{showRowSetup ? 'Hide' : 'Show'}</span>
          </button>

          {showRowSetup && (
            <div className="calibration-disclosure-body">
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
                Copy row 1 setup to all rows
              </button>
            </div>
          )}
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

          <button
            className="calibration-button"
            type="button"
            onClick={resetSelectedBoxIntoView}
          >
            Reset selected box into view
          </button>

          <button className="calibration-button primary" onClick={testSelectedBox}>
            Test selected box OCR
          </button>

          <button
            className="calibration-disclosure-button"
            type="button"
            aria-expanded={showBoxNumbers}
            onClick={() => setShowBoxNumbers((value) => !value)}
          >
            <span>Manual size and position</span>
            <span>{showBoxNumbers ? 'Hide' : 'Show'}</span>
          </button>

          {showBoxNumbers && (
            <div className="calibration-disclosure-body">
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
            </div>
          )}

          {selection === 'coordinate' && (
            <CoordinateZoomLens
              captureUrl={captureUrl}
              captureSize={captureSize}
              box={selectedBoxWithName}
            />
          )}
        </div>

        {message && <div className="calibration-message">{message}</div>}

        {testResult && (
          <div className="calibration-result">
            <strong>OCR result</strong>
            {testResult.source && <small>Image source: {testResult.source}</small>}
            <pre>{testResult.rawText || '(empty)'}</pre>
            {testResult.debugImagePath && <small>{testResult.debugImagePath}</small>}
            <div className="calibration-debug-preview-grid">
              {testResult.debugImageUrl && (
                <div className="calibration-debug-preview">
                  <span>Backend OCR image</span>
                  <img
                    src={buildApiAssetUrl(testResult.debugImageUrl)}
                    alt="Preprocessed OCR crop used by backend"
                  />
                </div>
              )}
              <GuidePreview />
            </div>
            <p>
              Smaller crop zones help performance. Removing extra text, borders, and visual noise inside this test screenshot helps OCR recognition.
            </p>
          </div>
        )}

        {calibrationScore && (
          <CalibrationScorePanel
            result={calibrationScore}
            onSelectCheck={(key) => {
              setSelection(mapScoreKeyToSelection(key));
              setMessage(`Selected ${key}. Adjust the highlighted crop, then score again.`);
            }}
          />
        )}
      </aside>

      <main className="calibration-main">
        <div className="calibration-toolbar">
          <strong>{boxDefinition.label}</strong>
          <span>
            X {selectedBoxWithName.x}, Y {selectedBoxWithName.y}, W {selectedBoxWithName.width}, H {selectedBoxWithName.height}
          </span>
          <span>API: {ocrLayoutApi.baseUrl}</span>
        </div>

        <div ref={stageRef} className="calibration-stage">
          {!captureUrl && (
            <div className="calibration-empty">
              <h2>No screenshot captured yet</h2>
              <p>
                Click “Capture screen / game window”, choose the game/window, then move and resize boxes.
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
                  boxShadow: `0 0 0 9999px rgba(0,0,0,0.18), 0 0 0 2px ${boxDefinition.color}`
                }}
                onPointerDown={(event) => handlePointerDown(event, 'move')}
              >
                <span style={{ background: boxDefinition.color }}>
                  {boxDefinition.label}
                </span>

                <button
                  type="button"
                  className="handle handle-nw"
                  onPointerDown={(event) => handlePointerDown(event, 'nw')}
                  aria-label="Resize northwest"
                />

                <button
                  type="button"
                  className="handle handle-ne"
                  onPointerDown={(event) => handlePointerDown(event, 'ne')}
                  aria-label="Resize northeast"
                />

                <button
                  type="button"
                  className="handle handle-sw"
                  onPointerDown={(event) => handlePointerDown(event, 'sw')}
                  aria-label="Resize southwest"
                />

                <button
                  type="button"
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
    grid-template-columns: 400px minmax(0, 1fr);
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

  .calibration-status-wrapper {
    display: grid;
    gap: 8px;
    margin: 12px 0;
  }

  .calibration-status-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .calibration-status-card {
    display: grid;
    gap: 4px;
    border: 1px solid #334155;
    border-radius: 14px;
    padding: 10px;
    background: #020617;
  }

  .calibration-status-card.ok {
    border-color: #22c55e;
    background: rgba(34, 197, 94, 0.1);
  }

  .calibration-status-card.bad {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  .calibration-status-card span {
    font-weight: 900;
  }

  .calibration-status-card small {
    color: #cbd5e1;
  }

  .calibration-error {
    color: #fecaca !important;
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

  .calibration-disclosure-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 10px 12px;
    background: #020617;
    color: #e2e8f0;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
    text-align: left;
  }

  .calibration-disclosure-button:hover {
    background: #1e293b;
  }

  .calibration-disclosure-button span:last-child {
    color: #93c5fd;
    font-size: 12px;
    text-transform: uppercase;
  }

  .calibration-disclosure-body {
    display: grid;
    gap: 9px;
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
    margin-top: 8px;
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
    display: block;
    color: #86efac;
  }

  .calibration-result p {
    margin: 8px 0 0;
    color: #bbf7d0;
    line-height: 1.4;
  }

  .calibration-debug-preview-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    margin-top: 10px;
  }

  .calibration-debug-preview {
    display: grid;
    gap: 6px;
  }

  .calibration-debug-preview span {
    color: #bbf7d0;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .calibration-debug-preview img {
    max-width: 100%;
    max-height: 220px;
    border: 1px solid rgba(187, 247, 208, 0.35);
    border-radius: 8px;
    background: #020617;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .coordinate-zoom-panel {
    display: grid;
    gap: 8px;
    margin-top: 10px;
  }

  .coordinate-zoom-lens {
    position: relative;
    max-width: 100%;
    overflow: hidden;
    border: 1px solid #38bdf8;
    border-radius: 8px;
    background-color: #020617;
    background-repeat: no-repeat;
    image-rendering: pixelated;
  }

  .coordinate-zoom-box {
    position: absolute;
    left: 50%;
    top: 50%;
    max-width: calc(100% - 16px);
    max-height: calc(100% - 16px);
    border: 2px solid #38bdf8;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 0 999px rgba(2, 6, 23, 0.28);
    pointer-events: none;
  }

  .coordinate-zoom-meta {
    display: grid;
    gap: 2px;
    color: #cbd5e1;
    font-size: 12px;
  }

  .coordinate-zoom-meta strong {
    color: #e0f2fe;
    font-size: 13px;
  }

  .calibration-score-panel {
    display: grid;
    gap: 10px;
    margin-top: 14px;
    border: 1px solid rgba(148, 163, 184, 0.26);
    border-radius: 14px;
    padding: 12px;
    background: #020617;
  }

  .calibration-score-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 12px;
  }

  .calibration-score-header div {
    display: grid;
    gap: 2px;
  }

  .calibration-score-header strong {
    color: #ffffff;
    font-size: 30px;
    line-height: 1;
  }

  .calibration-score-header span,
  .calibration-score-header small {
    color: #cbd5e1;
    font-weight: 800;
  }

  .calibration-score-recommendations {
    display: grid;
    gap: 7px;
  }

  .calibration-score-recommendations p {
    margin: 0;
    border-left: 3px solid #f59e0b;
    padding-left: 8px;
    color: #fde68a;
    font-size: 13px;
  }

  .calibration-score-list {
    display: grid;
    gap: 8px;
    max-height: 360px;
    overflow: auto;
  }

  .calibration-score-check {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 8px;
    width: 100%;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 9px;
    background: #0f172a;
    color: #e2e8f0;
    text-align: left;
    cursor: pointer;
  }

  .calibration-score-check:hover {
    background: #1e293b;
  }

  .calibration-score-check.pass {
    border-color: rgba(34, 197, 94, 0.6);
  }

  .calibration-score-check.warn {
    border-color: rgba(245, 158, 11, 0.7);
  }

  .calibration-score-check.fail {
    border-color: rgba(239, 68, 68, 0.75);
  }

  .calibration-score-check > span {
    grid-row: span 3;
    align-self: start;
    border-radius: 8px;
    padding: 4px 6px;
    background: #334155;
    color: #ffffff;
    font-size: 11px;
    font-weight: 950;
    text-transform: uppercase;
  }

  .calibration-score-check.pass > span {
    background: #15803d;
  }

  .calibration-score-check.warn > span {
    background: #b45309;
  }

  .calibration-score-check.fail > span {
    background: #b91c1c;
  }

  .calibration-score-check strong {
    font-size: 13px;
  }

  .calibration-score-check small {
    color: #cbd5e1;
    line-height: 1.35;
  }

  .calibration-score-check code {
    overflow: hidden;
    color: #93c5fd;
    font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    background: #020617;
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
      max-height: 52vh;
      border-right: 0;
      border-bottom: 1px solid rgba(148, 163, 184, 0.24);
    }
  }
`;
