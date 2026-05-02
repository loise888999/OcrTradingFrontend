import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Crosshair,
  Download,
  Map,
  MousePointer2,
  Pause,
  Play,
  RefreshCw,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { api } from './api';
import AddTradeGoodPanel from './components/AddTradeGoodPanel.jsx';
import ImportPricesCsvPanel from './components/ImportPricesCsvPanel.jsx';
import PendingTradeGoodPanel from './components/PendingTradeGoodPanel.jsx';
import GameWindowPanel from './components/GameWindowPanel.jsx';
import OcrQuickControls from './components/OcrQuickControls.jsx';
import TradingDealHelper from './components/TradingDealHelper.jsx';

const DEFAULT_WORLD_WIDTH = 16384;
const DEFAULT_WORLD_HEIGHT = 8192;
const DEFAULT_X_ZERO_OFFSET = 8192;
const DEFAULT_WAYPOINT_OFFSET_X = 8192;
const DEFAULT_WAYPOINT_OFFSET_Y = -620;
const DEFAULT_OCR_INTERVAL = 1;
const DEFAULT_CITY_INTERVAL = 8;
const MAP_IMAGE_URL = '/maps/world-map.png';

const zoneNames = {
  coordinate: 'Coordinate',
  city: 'City',
  price: 'Price'
};

function sanitizeCityName(value) {
  if (!value) return '';
  return String(value).split('(')[0].split('\n')[0].split('\r')[0].trim();
}

function normalizeX(value, width) {
  let normalized = value % width;
  if (normalized < 0) normalized += width;
  return normalized;
}

function normalizePanX(panX, worldWidth, zoom) {
  const tilePx = worldWidth * zoom;
  if (!Number.isFinite(tilePx) || tilePx <= 0) return panX;
  let normalized = panX % tilePx;
  if (normalized > 0) normalized -= tilePx;
  if (normalized <= -tilePx) normalized += tilePx;
  return normalized;
}

function clampY(value, height) {
  return Math.max(0, Math.min(height, value));
}

function applyWaypointOffset(point, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight) {
  return {
    ...point,
    x: normalizeX(Number(point.x) + Number(waypointOffsetX || 0), worldWidth),
    y: clampY(Number(point.y) + Number(waypointOffsetY || 0), worldHeight)
  };
}

function unwrapDx(previousX, latestX, width) {
  let dx = latestX - previousX;
  if (dx > width / 2) dx -= width;
  if (dx < -width / 2) dx += width;
  return dx;
}

function buildSlopeLine(points, worldWidth, worldHeight, sampleCount = 12) {
  if (points.length < 2) return null;

  const recent = points.slice(-Math.max(2, sampleCount));
  let currentX = Number(recent[0].x);
  const unwrapped = [{ ...recent[0], unwrappedX: currentX, t: 0 }];

  for (let i = 1; i < recent.length; i += 1) {
    currentX += unwrapDx(Number(recent[i - 1].x), Number(recent[i].x), worldWidth);
    unwrapped.push({ ...recent[i], unwrappedX: currentX, t: i });
  }

  const n = unwrapped.length;
  const meanT = unwrapped.reduce((sum, point) => sum + point.t, 0) / n;
  const meanX = unwrapped.reduce((sum, point) => sum + point.unwrappedX, 0) / n;
  const meanY = unwrapped.reduce((sum, point) => sum + Number(point.y), 0) / n;

  let denominator = 0;
  let numeratorX = 0;
  let numeratorY = 0;

  for (const point of unwrapped) {
    const dt = point.t - meanT;
    denominator += dt * dt;
    numeratorX += dt * (point.unwrappedX - meanX);
    numeratorY += dt * (Number(point.y) - meanY);
  }

  if (denominator === 0) return null;

  const dxPerStep = numeratorX / denominator;
  const dyPerStep = numeratorY / denominator;
  if (Math.abs(dxPerStep) < 0.001 && Math.abs(dyPerStep) < 0.001) return null;

  const latest = unwrapped[unwrapped.length - 1];
  const latestUnwrappedX = latest.unwrappedX;
  const latestY = Number(latest.y);
  const candidates = [];

  if (dxPerStep > 0) {
    const nextBoundary = Math.ceil(latestUnwrappedX / worldWidth) * worldWidth;
    const boundary = nextBoundary <= latestUnwrappedX ? nextBoundary + worldWidth : nextBoundary;
    candidates.push((boundary - latestUnwrappedX) / dxPerStep);
  }

  if (dxPerStep < 0) {
    const previousBoundary = Math.floor(latestUnwrappedX / worldWidth) * worldWidth;
    const boundary = previousBoundary >= latestUnwrappedX ? previousBoundary - worldWidth : previousBoundary;
    candidates.push((boundary - latestUnwrappedX) / dxPerStep);
  }

  if (dyPerStep > 0) candidates.push((worldHeight - latestY) / dyPerStep);
  if (dyPerStep < 0) candidates.push((0 - latestY) / dyPerStep);

  const positive = candidates.filter((value) => Number.isFinite(value) && value > 0);
  const t = positive.length ? Math.min(...positive) : 1;

  return {
    start: { ...latest, x: normalizeX(latestUnwrappedX, worldWidth), y: clampY(latestY, worldHeight) },
    end: { x: normalizeX(latestUnwrappedX + dxPerStep * t, worldWidth), y: clampY(latestY + dyPerStep * t, worldHeight) }
  };
}

function offsetSlopeLine(rawSlopeLine, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight) {
  if (!rawSlopeLine) return null;
  return {
    start: applyWaypointOffset(rawSlopeLine.start, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight),
    end: applyWaypointOffset(rawSlopeLine.end, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight)
  };
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function Button({ children, className = '', variant = 'primary', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}

function Card({ children, className = '' }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function Badge({ children, tone = 'default' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" className={`toggle ${checked ? 'toggle-on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="toggle-switch" />
      <span>{label}</span>
    </button>
  );
}

function StatusBar({ backendStatus, ocrStatus, latestCity, error, onRefresh, startOcr, stopOcr, refreshStatus }) {
  const connected = backendStatus?.status === 'ok';
  const cityName = sanitizeCityName(latestCity?.city) || 'Unknown';

  return (
    <Card className="status-bar">
      <div className="status-left">
        <Badge tone={connected ? 'success' : 'danger'}>
          {connected ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          Backend {connected ? 'Connected' : 'Offline'}
        </Badge>
        <Badge tone="info">City: {cityName}</Badge>
        <span className="api-url">API: {api.baseUrl}</span>
      </div>
      <div className="status-right">
        {error && <span className="error-text">{error}</span>}
        <OcrQuickControls
          ocrStatus={ocrStatus}
          startOcr={startOcr}
          stopOcr={stopOcr}
          refreshStatus={refreshStatus || onRefresh}
        />
        <Button variant="secondary" onClick={onRefresh}><RefreshCw size={16} /> Refresh all</Button>
      </div>
    </Card>
  );
}

function CoordinateMap({ coordinates, worldWidth, worldHeight, xZeroOffset, waypointOffsetX, waypointOffsetY, refreshCoordinates }) {
  const [zoom, setZoom] = useState(0.075);
  const [pan, setPan] = useState({ x: 70, y: 70 });
  const [dragging, setDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [keepCentered, setKeepCentered] = useState(false);
  const [showMovementTracking, setShowMovementTracking] = useState(true);

  const stageRef = useRef(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  const displayCoordinates = useMemo(
    () => coordinates.map((point) => applyWaypointOffset(point, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight)),
    [coordinates, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight]
  );

  const rawSlopeLine = useMemo(() => buildSlopeLine(coordinates, worldWidth, worldHeight, 12), [coordinates, worldWidth, worldHeight]);
  const slopeLine = useMemo(() => offsetSlopeLine(rawSlopeLine, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight), [rawSlopeLine, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight]);

  const current = coordinates[coordinates.length - 1];
  const displayCurrent = displayCoordinates[displayCoordinates.length - 1];
  const visualZeroX = normalizeX(xZeroOffset, worldWidth);

  const tileOffsets = useMemo(() => {
    const tilePx = worldWidth * zoom;
    const visibleTiles = tilePx > 0 ? Math.ceil(viewportWidth / tilePx) : 3;
    const count = Math.max(3, visibleTiles + 4);
    return Array.from({ length: count * 2 + 1 }, (_, index) => (index - count) * worldWidth);
  }, [viewportWidth, worldWidth, zoom]);

  const gridLines = [];
  const verticalStep = Math.max(500, Math.round(worldWidth / 16));
  const horizontalStep = Math.max(300, Math.round(worldHeight / 12));
  for (let x = 0; x <= worldWidth; x += verticalStep) gridLines.push(<line key={`v-${x}`} x1={x} y1={0} x2={x} y2={worldHeight} />);
  for (let y = 0; y <= worldHeight; y += horizontalStep) gridLines.push(<line key={`h-${y}`} x1={0} y1={y} x2={worldWidth} y2={y} />);

  const centerOnCurrent = useCallback((targetZoom = zoomRef.current) => {
    if (!displayCurrent || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const nextPan = {
      x: normalizePanX(rect.width / 2 - displayCurrent.x * targetZoom, worldWidth, targetZoom),
      y: rect.height / 2 - displayCurrent.y * targetZoom
    };
    panRef.current = nextPan;
    setPan(nextPan);
  }, [displayCurrent, worldWidth]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateSize = () => setViewportWidth(stage.getBoundingClientRect().width || 1200);
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (keepCentered) centerOnCurrent();
  }, [displayCurrent?.x, displayCurrent?.y, keepCentered, centerOnCurrent]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      const rect = stage.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const worldMouseX = (mouseX - currentPan.x) / currentZoom;
      const worldMouseY = (mouseY - currentPan.y) / currentZoom;
      const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14;
      const nextZoom = Math.max(0.018, Math.min(0.75, currentZoom * factor));

      const nextPan = keepCentered && displayCurrent
        ? {
          x: normalizePanX(rect.width / 2 - displayCurrent.x * nextZoom, worldWidth, nextZoom),
          y: rect.height / 2 - displayCurrent.y * nextZoom
        }
        : {
          x: normalizePanX(mouseX - worldMouseX * nextZoom, worldWidth, nextZoom),
          y: mouseY - worldMouseY * nextZoom
        };

      zoomRef.current = nextZoom;
      panRef.current = nextPan;
      setZoom(nextZoom);
      setPan(nextPan);
    };

    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [keepCentered, displayCurrent, worldWidth]);

  const onMouseDown = (event) => {
    event.preventDefault();
    setDragging(true);
    setLastMouse({ x: event.clientX, y: event.clientY });
  };

  const onMouseMove = (event) => {
    if (!dragging || !lastMouse) return;
    const currentZoom = zoomRef.current;
    const nextPan = {
      x: normalizePanX(panRef.current.x + event.clientX - lastMouse.x, worldWidth, currentZoom),
      y: panRef.current.y + event.clientY - lastMouse.y
    };
    setPan(nextPan);
    panRef.current = nextPan;
    setLastMouse({ x: event.clientX, y: event.clientY });
    if (keepCentered) setKeepCentered(false);
  };

  const endDrag = () => {
    setDragging(false);
    setLastMouse(null);
  };

  const zoomByButton = (factor) => {
    const nextZoom = Math.max(0.018, Math.min(0.75, zoom * factor));
    setZoom(nextZoom);
    zoomRef.current = nextZoom;
    if (keepCentered) centerOnCurrent(nextZoom);
    else {
      const nextPan = { ...panRef.current, x: normalizePanX(panRef.current.x, worldWidth, nextZoom) };
      setPan(nextPan);
      panRef.current = nextPan;
    }
  };

  const renderMapCopy = (offset) => (
    <g key={offset} transform={`translate(${offset}, 0)`}>
      <rect x="0" y="0" width={worldWidth} height={worldHeight} className="world-rect" rx="120" />
      <image href={MAP_IMAGE_URL} x="0" y="0" width={worldWidth} height={worldHeight} preserveAspectRatio="none" className="map-image" />
      <g className="grid-lines">{gridLines}</g>
      <line x1={visualZeroX} y1="0" x2={visualZeroX} y2={worldHeight} className="zero-line" />
      <text x={visualZeroX + 100} y="260" className="zero-label">visual X=0</text>
    </g>
  );

  const renderCoordinateLayer = (offset) => (
    <g key={`points-${offset}`} transform={`translate(${offset}, 0)`}>
      {showMovementTracking && displayCoordinates.length > 1 && (
        <polyline points={displayCoordinates.map((point) => `${point.x},${point.y}`).join(' ')} className="history-line" />
      )}
      {showMovementTracking && slopeLine && (
        <line x1={slopeLine.start.x} y1={slopeLine.start.y} x2={slopeLine.end.x} y2={slopeLine.end.y} className="slope-line" />
      )}
      {(showMovementTracking ? displayCoordinates : displayCurrent ? [displayCurrent] : []).map((point, index, arr) => (
        <circle
          key={`${offset}-${point.id || index}-${point.x}-${point.y}`}
          cx={point.x}
          cy={point.y}
          r={index === arr.length - 1 ? 18 : 12}
          className={index === arr.length - 1 ? 'point current-point' : 'point'}
        />
      ))}
    </g>
  );

  return (
    <div className="full-map-shell">
      <Card className="map-card full-map-card">
        <div className="card-header dark-header compact-header">
          <div>
            <h2><Map size={22} /> Full Window Wrapped Map</h2>
            <p>Drag to move. Mouse wheel zooms only this map. Map dimensions are 16384 x 8192.</p>
          </div>
          <div className="map-controls">
            <div className="button-row">
              <Button variant="secondary" onClick={() => zoomByButton(1 / 1.14)}><ZoomOut size={16} /></Button>
              <Button variant="secondary" onClick={() => zoomByButton(1.14)}><ZoomIn size={16} /></Button>
              <Button variant="secondary" onClick={() => centerOnCurrent()}>Center current</Button>
              <Button variant="secondary" onClick={refreshCoordinates}><RefreshCw size={16} /> Refresh</Button>
            </div>
            <div className="toggle-row">
              <Toggle checked={keepCentered} onChange={setKeepCentered} label="Keep centered" />
              <Toggle checked={showMovementTracking} onChange={setShowMovementTracking} label="Track movement" />
            </div>
          </div>
        </div>
        <div ref={stageRef} className="map-stage fullscreen-map-stage" onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag}>
          <svg className="map-svg">
            <rect width="100%" height="100%" className="map-bg" />
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {tileOffsets.map(renderMapCopy)}
              {tileOffsets.map(renderCoordinateLayer)}
            </g>
          </svg>
          <div className="map-info">
            <strong>Current coordinate</strong>
            <span>{current ? `OCR X ${current.x} / Y ${current.y}` : 'No coordinate yet'}</span>
            <span>{displayCurrent ? `Map X ${displayCurrent.x} / Y ${displayCurrent.y}` : ''}</span>
            <span>Zoom {(zoom * 100).toFixed(1)}%</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function PricesTab({ prices, refreshPrices }) {
  const [query, setQuery] = useState('');
  const rows = prices.filter((row) => `${sanitizeCityName(row.city)} ${row.itemName || row.item} ${row.tradeType || row.type}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <Card>
      <div className="card-body">
        <div className="tab-header">
          <div>
            <h2><ShoppingCart size={24} /> Buy / Sell Price History</h2>
            <p className="muted">Timestamps are stored as UTC and displayed in your local time.</p>
          </div>
          <div className="button-row">
            <input className="input" placeholder="Search city or item..." value={query} onChange={(event) => setQuery(event.target.value)} />
            <Button variant="secondary" onClick={refreshPrices}><RefreshCw size={16} /> Refresh</Button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>City</th><th>Item</th><th>Type</th><th>Trade</th><th>Price</th><th>Multiplier</th><th>Captured</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan="7" className="empty-cell">No price history yet.</td></tr>}
              {rows.map((row, index) => (
                <tr key={`${row.id || index}-${row.city}-${row.itemName}`}>
                  <td>{sanitizeCityName(row.city)}</td>
                  <td>{row.itemName}</td>
                  <td>{row.tradeGoodType}</td>
                  <td><Badge tone={row.tradeType === 'Buy' ? 'success' : row.tradeType === 'Sell' ? 'info' : 'muted'}>{row.tradeType}</Badge></td>
                  <td>{row.price}</td>
                  <td>{row.multiplier == null ? 'Missing' : `${Number(row.multiplier).toFixed(0)}%`}</td>
                  <td>{formatDate(row.capturedAtUtc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function ResultTable({ rows }) {
  return (
    <div className="table-wrap trade-results-table">
      <table>
        <thead><tr><th>City</th><th>Item</th><th>Type</th><th>Trade</th><th>Price</th><th>Multiplier</th><th>Captured</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan="7" className="empty-cell">No search results yet.</td></tr>}
          {rows.map((row, index) => (
            <tr key={`${row.city}-${row.itemName}-${row.tradeType}-${index}`}>
              <td>{sanitizeCityName(row.city)}</td>
              <td>{row.itemName}</td>
              <td>{row.tradeGoodType}</td>
              <td><Badge tone={row.tradeType === 'Buy' ? 'success' : row.tradeType === 'Sell' ? 'info' : 'muted'}>{row.tradeType}</Badge></td>
              <td>{row.price}</td>
              <td>{row.multiplier == null ? '' : `${Number(row.multiplier).toFixed(0)}%`}</td>
              <td>{formatDate(row.capturedAtUtc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecommendationsTable({ rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Item</th><th>Type</th><th>Buy City</th><th>Buy Price</th><th>Sell City</th><th>Sell Price</th><th>Profit</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan="7" className="empty-cell">No recommendations yet.</td></tr>}
          {rows.map((row, index) => (
            <tr key={`${row.itemName}-${row.buyCity}-${row.sellCity}-${index}`}>
              <td>{row.itemName}</td>
              <td>{row.tradeGoodType}</td>
              <td>{sanitizeCityName(row.buyCity)}</td>
              <td>{row.buyPrice}</td>
              <td>{sanitizeCityName(row.sellCity)}</td>
              <td>{row.sellPrice}</td>
              <td className="good-text">{row.profit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradingTab({ recommendations, refreshRecommendations, setRecommendations, latestCity, cities, tradeGoods, pendingTradeGoods, run, refreshCatalogs, refreshPrices, refreshPendingTradeGoods }) {
  const [results, setResults] = useState([]);
  const [resultTitle, setResultTitle] = useState('Search results');
  const [filters, setFilters] = useState({
    city: '',
    item: '',
    tradeType: 'Any',
    mainRegion: '',
    subRegion: '',
    seaTradeRegion: '',
    buyMainRegion: '',
    buySubRegion: '',
    buySeaTradeRegion: '',
    sellMainRegion: '',
    sellSubRegion: '',
    sellSeaTradeRegion: '',
    take: 250
  });

  const execute = async (mode = 'search') => {
    let data = null;

    if (mode === 'city') {
      if (!filters.city) return;
      setResultTitle('Goods available in city');
      data = await run(() => api.getCityGoods(filters), 'Could not load city goods');
    } else if (mode === 'good') {
      if (!filters.item) return;
      setResultTitle('Locations for good');
      data = await run(() => api.getGoodLocations(filters), 'Could not load good locations');
    } else {
      setResultTitle('Search results');
      data = await run(() => api.searchTrading(filters), 'Could not search trading data');
    }

    if (data) setResults(data);
  };

  const runRecommendations = async (regionFilter = {}) => {
    const data = await run(() => api.getRecommendations(regionFilter), 'Could not load recommendations');
    if (data) setRecommendations(data);
  };

  return (
    <div className="stack">
      <Card>
        <div className="card-body">
          <TradingDealHelper
            cities={cities}
            tradeGoods={tradeGoods}
            filters={filters}
            setFilters={setFilters}
            latestCity={latestCity}
            onSearch={execute}
            onRecommendations={runRecommendations}
          />
        </div>
      </Card>

      <Card>
        <div className="card-body">
          <h3>{resultTitle}</h3>
          <ResultTable rows={results} />
        </div>
      </Card>

      <Card>
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h3><TrendingUp size={20} /> Best profit route suggestions</h3>
              <p className="muted">Uses the deal helper region filters when you click Find best route.</p>
            </div>
            <Button variant="secondary" onClick={() => refreshRecommendations()}><RefreshCw size={16} /> Refresh default routes</Button>
          </div>
          <RecommendationsTable rows={recommendations} />
        </div>
      </Card>

      <div className="bottom-trading-tools three-tools">
        <Card><div className="card-body"><ImportPricesCsvPanel run={run} onImported={() => Promise.all([refreshPrices?.(), refreshRecommendations?.()])} /></div></Card>
        <Card><div className="card-body"><PendingTradeGoodPanel candidates={pendingTradeGoods} tradeGoods={tradeGoods} run={run} onChanged={() => Promise.all([refreshPendingTradeGoods?.(), refreshCatalogs?.()])} /></div></Card>
        <Card><div className="card-body"><AddTradeGoodPanel run={run} onAdded={refreshCatalogs} tradeGoods={tradeGoods} /></div></Card>
      </div>
    </div>
  );
}

function OcrZoneCard({ title, name, description, zone, onSave }) {
  const [local, setLocal] = useState(zone || { name, topLeftX: 0, topLeftY: 0, bottomRightX: 0, bottomRightY: 0 });
  const [captureStatus, setCaptureStatus] = useState('Manual values');

  useEffect(() => setLocal(zone || { name, topLeftX: 0, topLeftY: 0, bottomRightX: 0, bottomRightY: 0 }), [zone, name]);

  const update = (key, value) => setLocal((current) => ({ ...current, [key]: Number(value) }));

  const waitWithCountdown = async (prefix) => {
    for (let seconds = 5; seconds > 0; seconds -= 1) {
      setCaptureStatus(`${prefix} Capturing in ${seconds} second${seconds === 1 ? '' : 's'}...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };

  const captureFlow = async () => {
    try {
      await waitWithCountdown('Move mouse to TOP LEFT.');
      const topLeft = await api.getMousePosition();
      setLocal((current) => ({ ...current, topLeftX: topLeft.x, topLeftY: topLeft.y }));
      setCaptureStatus(`Top left captured at X ${topLeft.x}, Y ${topLeft.y}.`);
      await new Promise((resolve) => setTimeout(resolve, 650));
      await waitWithCountdown('Move mouse to BOTTOM RIGHT.');
      const bottomRight = await api.getMousePosition();
      const updatedZone = { ...local, name, topLeftX: topLeft.x, topLeftY: topLeft.y, bottomRightX: bottomRight.x, bottomRightY: bottomRight.y };
      setLocal(updatedZone);
      setCaptureStatus('Capture complete. Saving relative to selected game window if found...');
      await onSave(updatedZone);
      setCaptureStatus(`Saved. Top left: ${topLeft.x},${topLeft.y}. Bottom right: ${bottomRight.x},${bottomRight.y}.`);
    } catch (err) {
      setCaptureStatus(`Capture failed: ${err?.message || 'Unknown error'}`);
    }
  };

  return (
    <Card>
      <div className="card-body">
        <h3><Crosshair size={20} /> {title}</h3>
        <p className="muted">{description}</p>
        <div className="zone-grid">
          <Field label="Top left X"><input className="input" type="number" value={local.topLeftX} onChange={(event) => update('topLeftX', event.target.value)} /></Field>
          <Field label="Top left Y"><input className="input" type="number" value={local.topLeftY} onChange={(event) => update('topLeftY', event.target.value)} /></Field>
          <Field label="Bottom right X"><input className="input" type="number" value={local.bottomRightX} onChange={(event) => update('bottomRightX', event.target.value)} /></Field>
          <Field label="Bottom right Y"><input className="input" type="number" value={local.bottomRightY} onChange={(event) => update('bottomRightY', event.target.value)} /></Field>
        </div>
        <p className="mini-info">{captureStatus}</p>
        <div className="button-row">
          <Button variant="secondary" onClick={captureFlow}><MousePointer2 size={16} /> 5 sec capture flow</Button>
          <Button onClick={() => onSave(local)}>Save zone</Button>
        </div>
      </div>
    </Card>
  );
}

function SettingsTab({ settings, zones, saveZone, saveSetting, setSettings, run }) {
  const getZone = (name) => zones.find((zone) => zone.name === name);
  const saveMapSetting = async (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    await saveSetting({ key, value: String(value) });
  };

  return (
    <div className="stack">
      <Card className="dark-panel">
        <div className="card-body">
          <h2><Settings size={24} /> OCR + Map Settings</h2>
          <p>OCR zones are saved relative to the selected game window after setup.</p>
        </div>
      </Card>

      <Card>
        <div className="card-body">
          <GameWindowPanel run={run} />
        </div>
      </Card>

      <div className="settings-grid">
        <Card>
          <div className="card-body">
            <h3><SlidersHorizontal size={20} /> Fine tune map</h3>
            <Field label="World width / X wrap limit"><input className="input" type="number" value={settings.worldWidth} onChange={(event) => saveMapSetting('worldWidth', Number(event.target.value || DEFAULT_WORLD_WIDTH))} /></Field>
            <Field label="World height / Y max"><input className="input" type="number" value={settings.worldHeight} onChange={(event) => saveMapSetting('worldHeight', Number(event.target.value || DEFAULT_WORLD_HEIGHT))} /></Field>
            <Field label="Visual X=0 offset"><input className="input" type="number" value={settings.xZeroOffset} onChange={(event) => saveMapSetting('xZeroOffset', Number(event.target.value || DEFAULT_X_ZERO_OFFSET))} /></Field>
            <Field label="Waypoint offset X"><input className="input" type="number" value={settings.waypointOffsetX} onChange={(event) => saveMapSetting('waypointOffsetX', Number(event.target.value || 0))} /></Field>
            <Field label="Waypoint offset Y"><input className="input" type="number" value={settings.waypointOffsetY} onChange={(event) => saveMapSetting('waypointOffsetY', Number(event.target.value || 0))} /></Field>
          </div>
        </Card>
        <Card>
          <div className="card-body">
            <h3><RefreshCw size={20} /> OCR timing</h3>
            <Field label="Coordinate / main OCR interval"><input className="input" type="number" min="1" value={settings.ocrInterval} onChange={(event) => saveMapSetting('ocrInterval', Number(event.target.value || DEFAULT_OCR_INTERVAL))} /></Field>
            <Field label="City OCR interval"><input className="input" type="number" min="1" value={settings.cityInterval} onChange={(event) => saveMapSetting('cityInterval', Number(event.target.value || DEFAULT_CITY_INTERVAL))} /></Field>
          </div>
        </Card>
      </div>

      <div className="zone-cards">
        <OcrZoneCard title="Coordinate OCR zone" name={zoneNames.coordinate} description="One-time setup. Backend stores this zone relative to the selected game window." zone={getZone(zoneNames.coordinate)} onSave={saveZone} />
        <OcrZoneCard title="City OCR zone" name={zoneNames.city} description="One-time setup. Backend follows the game window after this is saved." zone={getZone(zoneNames.city)} onSave={saveZone} />
        <OcrZoneCard title="Item price OCR zone" name={zoneNames.price} description="One-time setup for the trade-good/price area." zone={getZone(zoneNames.price)} onSave={saveZone} />
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('map');
  const [backendStatus, setBackendStatus] = useState(null);
  const [ocrStatus, setOcrStatus] = useState(null);
  const [latestCity, setLatestCity] = useState(null);
  const [coordinates, setCoordinates] = useState([]);
  const [prices, setPrices] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [zones, setZones] = useState([]);
  const [cities, setCities] = useState([]);
  const [tradeGoods, setTradeGoods] = useState([]);
  const [pendingTradeGoods, setPendingTradeGoods] = useState([]);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState({
    worldWidth: DEFAULT_WORLD_WIDTH,
    worldHeight: DEFAULT_WORLD_HEIGHT,
    xZeroOffset: DEFAULT_X_ZERO_OFFSET,
    waypointOffsetX: DEFAULT_WAYPOINT_OFFSET_X,
    waypointOffsetY: DEFAULT_WAYPOINT_OFFSET_Y,
    ocrInterval: DEFAULT_OCR_INTERVAL,
    cityInterval: DEFAULT_CITY_INTERVAL
  });

  const run = useCallback(async (fn, fallbackMessage = 'Request failed') => {
    try {
      setError('');
      return await fn();
    } catch (err) {
      setError(err?.message || fallbackMessage);
      return null;
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    const health = await run(() => api.health(), 'Backend unavailable');
    if (health) setBackendStatus(health);
    const status = await run(() => api.getOcrStatus(), 'Could not load OCR status');
    if (status) setOcrStatus(status);
    const city = await run(() => api.getLatestCity(), 'Could not load latest city');
    if (city) setLatestCity(city);
  }, [run]);

  const refreshCoordinates = useCallback(async () => {
    const data = await run(() => api.getLatestCoordinates({ take: 20 }), 'Could not load coordinates');
    if (data) setCoordinates(data);
  }, [run]);

  const refreshPrices = useCallback(async () => {
    const data = await run(() => api.getPriceHistory({ take: 500 }), 'Could not load prices');
    if (data) setPrices(data);
  }, [run]);

  const refreshRecommendations = useCallback(async (filters = {}) => {
    const data = await run(() => api.getRecommendations(filters), 'Could not load recommendations');
    if (data) setRecommendations(data);
  }, [run]);

  const refreshSettings = useCallback(async () => {
    const data = await run(() => api.getSettings(), 'Could not load settings');
    if (data?.zones) setZones(data.zones);
  }, [run]);

  const refreshCatalogs = useCallback(async () => {
    const loadedCities = await run(() => api.getCities(), 'Could not load cities');
    if (loadedCities) setCities(loadedCities);
    const loadedGoods = await run(() => api.getTradeGoods(), 'Could not load trade goods');
    if (loadedGoods) setTradeGoods(loadedGoods);
  }, [run]);

  const refreshPendingTradeGoods = useCallback(async () => {
    const data = await run(() => api.getPendingTradeGoods(), 'Could not load pending trade goods');
    if (data) setPendingTradeGoods(data);
  }, [run]);

  const refreshAll = useCallback(async () => Promise.all([
    refreshStatus(),
    refreshCoordinates(),
    refreshPrices(),
    refreshRecommendations(),
    refreshSettings(),
    refreshCatalogs(),
    refreshPendingTradeGoods()
  ]), [refreshStatus, refreshCoordinates, refreshPrices, refreshRecommendations, refreshSettings, refreshCatalogs, refreshPendingTradeGoods]);

  useEffect(() => {
    refreshAll();
    const timer = setInterval(() => {
      refreshStatus();
      refreshCoordinates();
      refreshPrices();
      refreshPendingTradeGoods();
    }, Math.max(1, settings.ocrInterval) * 1000);
    return () => clearInterval(timer);
  }, [refreshAll, refreshStatus, refreshCoordinates, refreshPrices, refreshPendingTradeGoods, settings.ocrInterval]);

  const saveZone = async (zone) => {
    const saved = await run(() => api.saveOcrZone(zone), 'Could not save OCR zone');
    if (saved) await refreshSettings();
  };

  const saveSetting = async (setting) => {
    await run(() => api.saveSetting(setting), 'Could not save setting');
  };

  const startOcr = async () => {
    await run(() => api.startOcr(), 'Could not start OCR');
    await refreshStatus();
  };

  const stopOcr = async () => {
    await run(() => api.stopOcr(), 'Could not stop OCR');
    await refreshStatus();
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <h1>OCR Trading Companion</h1>
          <p>Window-relative OCR zones, OCR quick control, region trading helper, map tracking, price sharing, and route recommendations.</p>
        </div>
        <Badge tone="info">React + C# Backend</Badge>
      </header>

      <StatusBar
        backendStatus={backendStatus}
        ocrStatus={ocrStatus}
        latestCity={latestCity}
        error={error}
        onRefresh={refreshAll}
        startOcr={startOcr}
        stopOcr={stopOcr}
        refreshStatus={refreshStatus}
      />

      <nav className="tabs">
        <button className={activeTab === 'map' ? 'active' : ''} onClick={() => setActiveTab('map')}><Map size={17} /> Coordinate Map</button>
        <button className={activeTab === 'prices' ? 'active' : ''} onClick={() => setActiveTab('prices')}><ShoppingCart size={17} /> Buy / Sell Prices</button>
        <button className={activeTab === 'trading' ? 'active' : ''} onClick={() => setActiveTab('trading')}><TrendingUp size={17} /> Trading Options</button>
        <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}><Settings size={17} /> Settings</button>
      </nav>

      <main>
        {activeTab === 'map' && (
          <CoordinateMap
            coordinates={coordinates}
            worldWidth={settings.worldWidth}
            worldHeight={settings.worldHeight}
            xZeroOffset={settings.xZeroOffset}
            waypointOffsetX={settings.waypointOffsetX}
            waypointOffsetY={settings.waypointOffsetY}
            refreshCoordinates={refreshCoordinates}
          />
        )}

        {activeTab === 'prices' && <PricesTab prices={prices} refreshPrices={refreshPrices} />}

        {activeTab === 'trading' && (
          <TradingTab
            recommendations={recommendations}
            refreshRecommendations={refreshRecommendations}
            setRecommendations={setRecommendations}
            latestCity={latestCity}
            cities={cities}
            tradeGoods={tradeGoods}
            pendingTradeGoods={pendingTradeGoods}
            run={run}
            refreshCatalogs={refreshCatalogs}
            refreshPrices={refreshPrices}
            refreshPendingTradeGoods={refreshPendingTradeGoods}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            setSettings={setSettings}
            zones={zones}
            saveZone={saveZone}
            saveSetting={saveSetting}
            run={run}
          />
        )}
      </main>
    </div>
  );
}
