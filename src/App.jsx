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
  Route,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { api } from './api';
import AutocompleteInput from './components/AutocompleteInput.jsx';
import AddTradeGoodPanel from './components/AddTradeGoodPanel.jsx';
import ImportPricesCsvPanel from './components/ImportPricesCsvPanel.jsx';
import PendingTradeGoodPanel from './components/PendingTradeGoodPanel.jsx';

const DEFAULT_WORLD_WIDTH = 16300;
const DEFAULT_WORLD_HEIGHT = 7200;
const DEFAULT_X_ZERO_OFFSET = 0;

// Your calibrated map waypoint offset.
const DEFAULT_WAYPOINT_OFFSET_X = 0;
const DEFAULT_WAYPOINT_OFFSET_Y = 20;

const DEFAULT_OCR_INTERVAL = 3;
const DEFAULT_CITY_INTERVAL = 8;
const MAP_IMAGE_URL = '/maps/world-map.png';

const zoneNames = {
  coordinate: 'Coordinate',
  city: 'City',
  price: 'Price'
};

function sanitizeCityName(value) {
  if (!value) return '';
  return String(value)
    .split('(')[0]
    .split('\n')[0]
    .split('\r')[0]
    .trim();
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

function buildSlopeLine(points, worldWidth, worldHeight) {
  if (points.length < 2) return null;

  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const dx = unwrapDx(previous.x, latest.x, worldWidth);
  const dy = latest.y - previous.y;

  if (dx === 0 && dy === 0) return null;

  const candidates = [];
  if (dx > 0) candidates.push((worldWidth - latest.x) / dx);
  if (dx < 0) candidates.push((0 - latest.x) / dx);
  if (dy > 0) candidates.push((worldHeight - latest.y) / dy);
  if (dy < 0) candidates.push((0 - latest.y) / dy);

  const positive = candidates.filter((value) => Number.isFinite(value) && value > 0);
  const t = positive.length ? Math.min(...positive) : 1;

  return {
    start: latest,
    end: {
      x: normalizeX(latest.x + dx * t, worldWidth),
      y: clampY(latest.y + dy * t, worldHeight)
    }
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

function StatusBar({ backendStatus, ocrStatus, latestCity, error, onRefresh }) {
  const connected = backendStatus?.status === 'ok';
  const cityName = sanitizeCityName(latestCity?.city) || 'Unknown';

  return (
    <Card className="status-bar">
      <div className="status-left">
        <Badge tone={connected ? 'success' : 'danger'}>
          {connected ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          Backend {connected ? 'Connected' : 'Offline'}
        </Badge>
        <Badge tone={ocrStatus?.enabled ? 'success' : 'muted'}>
          <Activity size={14} /> OCR {ocrStatus?.enabled ? 'Running' : 'Stopped'}
        </Badge>
        <Badge tone="info">City: {cityName}</Badge>
        <span className="api-url">API: {api.baseUrl}</span>
      </div>
      <div className="status-right">
        {error && <span className="error-text">{error}</span>}
        <Button variant="secondary" onClick={onRefresh}><RefreshCw size={16} /> Refresh</Button>
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

  // Important fix:
  // Build the movement slope from the RAW OCR coordinates first, then apply the visual/map offset.
  // This avoids a negative Y offset clamping points before the slope math and breaking the direction line.
  const rawSlopeLine = useMemo(
    () => buildSlopeLine(coordinates, worldWidth, worldHeight),
    [coordinates, worldWidth, worldHeight]
  );

  const slopeLine = useMemo(
    () => offsetSlopeLine(rawSlopeLine, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight),
    [rawSlopeLine, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight]
  );

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

      let nextPan;
      if (keepCentered && displayCurrent) {
        nextPan = {
          x: normalizePanX(rect.width / 2 - displayCurrent.x * nextZoom, worldWidth, nextZoom),
          y: rect.height / 2 - displayCurrent.y * nextZoom
        };
      } else {
        nextPan = {
          x: normalizePanX(mouseX - worldMouseX * nextZoom, worldWidth, nextZoom),
          y: mouseY - worldMouseY * nextZoom
        };
      }

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
      {showMovementTracking
        ? displayCoordinates.map((point, index) => (
          <g key={`${offset}-${point.id || index}-${point.x}-${point.y}`}>
            <circle cx={point.x} cy={point.y} r={index === displayCoordinates.length - 1 ? 18 : 12} className={index === displayCoordinates.length - 1 ? 'point current-point' : 'point'} />
          </g>
        ))
        : displayCurrent && (
          <g key={`${offset}-current-only-${displayCurrent.x}-${displayCurrent.y}`}>
            <circle cx={displayCurrent.x} cy={displayCurrent.y} r="18" className="point current-point" />
          </g>
        )}
    </g>
  );

  return (
    <div className="full-map-shell">
      <Card className="map-card full-map-card">
        <div className="card-header dark-header compact-header">
          <div>
            <h2><Map size={22} /> Full Window Wrapped Map</h2>
            <p>Drag to move. Mouse wheel zooms only this map. Horizontal pan is normalized for continuous wrap.</p>
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
            <span>Centered: {keepCentered ? 'On' : 'Off'} / Tracking: {showMovementTracking ? 'On' : 'Off'}</span>
            <span>Waypoint offset X {waypointOffsetX} / Y {waypointOffsetY}</span>
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
            <p className="muted">SQLite-backed price history from the backend.</p>
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

function TradingTab({ recommendations, refreshRecommendations, ocrStatus, startOcr, stopOcr, cities, tradeGoods, pendingTradeGoods, run, refreshCatalogs, refreshPrices, refreshPendingTradeGoods }) {
  const [filters, setFilters] = useState({ city: '', item: '', tradeType: 'Any', take: 250 });
  const [results, setResults] = useState([]);
  const [mode, setMode] = useState('search');

  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const execute = async (nextMode = mode) => {
    setMode(nextMode);
    let data = null;
    if (nextMode === 'city') {
      if (!filters.city) return;
      data = await run(() => api.getCityGoods({ city: filters.city, tradeType: filters.tradeType, take: filters.take }), 'Could not load city goods');
    } else if (nextMode === 'good') {
      if (!filters.item) return;
      data = await run(() => api.getGoodLocations({ item: filters.item, tradeType: filters.tradeType, take: filters.take }), 'Could not load good locations');
    } else {
      data = await run(() => api.searchTrading(filters), 'Could not search trading data');
    }
    if (data) setResults(data);
  };

  const refreshAfterImport = async () => Promise.all([refreshPrices?.(), refreshRecommendations?.()]);
  const refreshAfterPendingChange = async () => Promise.all([refreshPendingTradeGoods?.(), refreshCatalogs?.()]);

  return (
    <div className="stack">
      <Card>
        <div className="tab-header card-body">
          <div>
            <h2><TrendingUp size={24} /> Trading Options</h2>
            <p className="muted">Search where to buy/sell goods, what goods are available in a city, or the best locations for one good.</p>
          </div>
          <div className="button-row">
            {ocrStatus?.enabled ? <Button variant="warning" onClick={stopOcr}><Pause size={16} /> Stop OCR</Button> : <Button variant="success" onClick={startOcr}><Play size={16} /> Start OCR</Button>}
            <a className="button button-secondary" href={api.exportPricesUrl()} target="_blank" rel="noreferrer"><Download size={16} /> Export CSV</a>
          </div>
        </div>
      </Card>

      <div className="trade-search-layout">
        <Card>
          <div className="card-body">
            <h3><Search size={20} /> Trade Finder</h3>
            <div className="filter-grid vertical-filter-grid">
              <AutocompleteInput label="City" value={filters.city} onChange={(value) => update('city', value)} options={cities} placeholder="Type or choose a city..." getLabel={(city) => city.name} />
              <AutocompleteInput label="Good" value={filters.item} onChange={(value) => update('item', value)} options={tradeGoods} placeholder="Type or choose a trade good..." getLabel={(good) => good.name} getSubLabel={(good) => good.type} />
              <Field label="Trade type"><select className="input" value={filters.tradeType} onChange={(event) => update('tradeType', event.target.value)}><option>Any</option><option>Buy</option><option>Sell</option></select></Field>
              <Field label="Limit"><input className="input" type="number" min="1" max="2000" value={filters.take} onChange={(event) => update('take', Number(event.target.value || 250))} /></Field>
            </div>
            <div className="button-row stacked-buttons">
              <Button onClick={() => execute('search')}><Search size={16} /> Search all filters</Button>
              <Button variant="secondary" onClick={() => execute('city')} disabled={!filters.city}>Goods in selected city</Button>
              <Button variant="secondary" onClick={() => execute('good')} disabled={!filters.item}>Locations for selected good</Button>
              <Button variant="secondary" onClick={refreshRecommendations}><Route size={16} /> Refresh best routes</Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="card-body">
            <h3>{mode === 'city' ? 'Goods available in city' : mode === 'good' ? 'Locations for good' : 'Search results'}</h3>
            <div className="table-wrap trade-results-table">
              <table>
                <thead><tr><th>City</th><th>Item</th><th>Type</th><th>Trade</th><th>Price</th><th>Multiplier</th><th>Captured</th></tr></thead>
                <tbody>
                  {results.length === 0 && <tr><td colSpan="7" className="empty-cell">No search results yet.</td></tr>}
                  {results.map((row, index) => (
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
          </div>
        </Card>
      </div>

      <Card>
        <div className="card-body">
          <h3>Best profit route suggestions</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Type</th><th>Buy City</th><th>Buy Price</th><th>Sell City</th><th>Sell Price</th><th>Profit</th></tr></thead>
              <tbody>
                {recommendations.length === 0 && <tr><td colSpan="7" className="empty-cell">No recommendations yet.</td></tr>}
                {recommendations.map((row, index) => (
                  <tr key={`${row.itemName}-${index}`}>
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
        </div>
      </Card>

      <div className="bottom-trading-tools three-tools">
        <Card><div className="card-body"><ImportPricesCsvPanel run={run} onImported={refreshAfterImport} /></div></Card>
        <Card><div className="card-body"><PendingTradeGoodPanel candidates={pendingTradeGoods} tradeGoods={tradeGoods} run={run} onChanged={refreshAfterPendingChange} /></div></Card>
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
      setCaptureStatus('Capture complete. Saving...');
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

function SettingsTab({ settings, zones, saveZone, saveSetting, setSettings }) {
  const getZone = (name) => zones.find((zone) => zone.name === name);
  const saveMapSetting = async (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    await saveSetting({ key, value: String(value) });
  };

  return (
    <div className="stack">
      <Card className="dark-panel"><div className="card-body"><h2><Settings size={24} /> OCR + Map Settings</h2><p>City names and trade goods are controlled by backend CSV files.</p></div></Card>
      <div className="settings-grid">
        <Card><div className="card-body"><h3><SlidersHorizontal size={20} /> Fine tune map</h3>
          <Field label="World width / X wrap limit"><input className="input" type="number" value={settings.worldWidth} onChange={(event) => saveMapSetting('worldWidth', Number(event.target.value || DEFAULT_WORLD_WIDTH))} /></Field>
          <Field label="World height / Y max"><input className="input" type="number" value={settings.worldHeight} onChange={(event) => saveMapSetting('worldHeight', Number(event.target.value || DEFAULT_WORLD_HEIGHT))} /></Field>
          <Field label="Visual X=0 offset"><input className="input" type="number" value={settings.xZeroOffset} onChange={(event) => saveMapSetting('xZeroOffset', Number(event.target.value || DEFAULT_X_ZERO_OFFSET))} /></Field>
          <Field label="Waypoint offset X"><input className="input" type="number" value={settings.waypointOffsetX} onChange={(event) => saveMapSetting('waypointOffsetX', Number(event.target.value || 0))} /></Field>
          <Field label="Waypoint offset Y"><input className="input" type="number" value={settings.waypointOffsetY} onChange={(event) => saveMapSetting('waypointOffsetY', Number(event.target.value || 0))} /></Field>
        </div></Card>
        <Card><div className="card-body"><h3><RefreshCw size={20} /> OCR timing</h3>
          <Field label="Coordinate / price OCR interval"><input className="input" type="number" min="1" value={settings.ocrInterval} onChange={(event) => saveMapSetting('ocrInterval', Number(event.target.value || DEFAULT_OCR_INTERVAL))} /></Field>
          <Field label="City OCR interval"><input className="input" type="number" min="1" value={settings.cityInterval} onChange={(event) => saveMapSetting('cityInterval', Number(event.target.value || DEFAULT_CITY_INTERVAL))} /></Field>
        </div></Card>
      </div>
      <div className="zone-cards">
        <OcrZoneCard title="Coordinate OCR zone" name={zoneNames.coordinate} description="Reads coordinates like 123,456." zone={getZone(zoneNames.coordinate)} onSave={saveZone} />
        <OcrZoneCard title="City OCR zone" name={zoneNames.city} description="Only accepted if city is in backend Data/cities.csv." zone={getZone(zoneNames.city)} onSave={saveZone} />
        <OcrZoneCard title="Item price OCR zone" name={zoneNames.price} description="Reads item, price, optional multiplier, Buy/Sell." zone={getZone(zoneNames.price)} onSave={saveZone} />
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
    const data = await run(() => api.getLatestCoordinates(), 'Could not load coordinates');
    if (data) setCoordinates(data);
  }, [run]);

  const refreshPrices = useCallback(async () => {
    const data = await run(() => api.getPriceHistory({ take: 500 }), 'Could not load prices');
    if (data) setPrices(data);
  }, [run]);

  const refreshRecommendations = useCallback(async () => {
    const data = await run(() => api.getRecommendations(), 'Could not load recommendations');
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
          <p>City whitelist OCR, trade-good filters, pending OCR suggestions, map tracking, Buy/Sell search, CSV import/export, and best route recommendations.</p>
        </div>
        <Badge tone="info">React + C# Backend</Badge>
      </header>

      <StatusBar backendStatus={backendStatus} ocrStatus={ocrStatus} latestCity={latestCity} error={error} onRefresh={refreshAll} />

      <nav className="tabs">
        <button className={activeTab === 'map' ? 'active' : ''} onClick={() => setActiveTab('map')}><Map size={17} /> Coordinate Map</button>
        <button className={activeTab === 'prices' ? 'active' : ''} onClick={() => setActiveTab('prices')}><ShoppingCart size={17} /> Buy / Sell Prices</button>
        <button className={activeTab === 'trading' ? 'active' : ''} onClick={() => setActiveTab('trading')}><TrendingUp size={17} /> Trading Options</button>
        <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}><Settings size={17} /> Settings</button>
      </nav>

      <main>
        {activeTab === 'map' && <CoordinateMap coordinates={coordinates} worldWidth={settings.worldWidth} worldHeight={settings.worldHeight} xZeroOffset={settings.xZeroOffset} waypointOffsetX={settings.waypointOffsetX} waypointOffsetY={settings.waypointOffsetY} refreshCoordinates={refreshCoordinates} />}
        {activeTab === 'prices' && <PricesTab prices={prices} refreshPrices={refreshPrices} />}
        {activeTab === 'trading' && <TradingTab recommendations={recommendations} refreshRecommendations={refreshRecommendations} ocrStatus={ocrStatus} startOcr={startOcr} stopOcr={stopOcr} cities={cities} tradeGoods={tradeGoods} pendingTradeGoods={pendingTradeGoods} run={run} refreshCatalogs={refreshCatalogs} refreshPrices={refreshPrices} refreshPendingTradeGoods={refreshPendingTradeGoods} />}
        {activeTab === 'settings' && <SettingsTab settings={settings} setSettings={setSettings} zones={zones} saveZone={saveZone} saveSetting={saveSetting} />}
      </main>
    </div>
  );
}
