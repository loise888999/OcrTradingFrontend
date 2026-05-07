import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, Map, MapPin, Maximize2, Minimize2, RefreshCw, SlidersHorizontal, X, ZoomIn, ZoomOut } from 'lucide-react';

const MAP_IMAGE_URL = '/maps/world-map.png';
const MAP_PIXEL_WIDTH = 4096;
const MAP_PIXEL_HEIGHT = 2049;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const MAX_SESSION_TRAIL_POINTS = 10000;
const MAX_SLOPE_WORLD_LENGTH_RATIO = 0.75;
const CITY_CLICK_MOVE_THRESHOLD_PX = 5;
const DEFAULT_MAP_SLOPE_POINT_COUNT = 8;

function normalizeX(value, width) {
  let normalized = Number(value || 0) % width;
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
  return Math.max(0, Math.min(height, Number(value || 0)));
}

function clampMapSlopePointCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAP_SLOPE_POINT_COUNT;
  return Math.max(3, Math.min(25, Math.round(parsed)));
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

function scaledStrokeWidth(zoom, targetPixels, min = 1, max = 120) {
  if (!Number.isFinite(zoom) || zoom <= 0) return targetPixels;
  return Math.max(min, Math.min(max, targetPixels / zoom));
}

function scaledRadius(zoom, targetPixels, min = 2, max = 160) {
  if (!Number.isFinite(zoom) || zoom <= 0) return targetPixels;
  return Math.max(min, Math.min(max, targetPixels / zoom));
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function normalizeName(value) {
  return cleanText(value).toLowerCase();
}

function sanitizeCityName(value) {
  if (!value) return '';
  return String(value).split('(')[0].split('\n')[0].split('\r')[0].trim();
}

function getPointTimestamp(point) {
  const value =
    point?.capturedAtUtc ||
    point?.createdAtUtc ||
    point?.timeUtc ||
    point?.timestamp;

  if (!value) return null;

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function getPointKey(point, index = 0) {
  const timestamp =
    point?.capturedAtUtc ||
    point?.createdAtUtc ||
    point?.timeUtc ||
    point?.timestamp ||
    '';

  return String(
    point?.id ??
      `${point?.x}:${point?.y}:${timestamp || index}`
  );
}

function pruneTrail(points, trailWindow) {
  if (!points.length) return [];

  let next = points;

  if (trailWindow === '30m' || trailWindow === '2h') {
    const windowMs = trailWindow === '30m' ? THIRTY_MINUTES_MS : TWO_HOURS_MS;
    const now = Date.now();

    const hasTimestamps = next.some((point) => getPointTimestamp(point) != null);

    if (hasTimestamps) {
      next = next.filter((point) => {
        const time = getPointTimestamp(point);
        return time == null || now - time <= windowMs;
      });
    }
  }

  if (next.length > MAX_SESSION_TRAIL_POINTS) {
    next = next.slice(-MAX_SESSION_TRAIL_POINTS);
  }

  return next;
}

function splitWrappedSegments(points, worldWidth) {
  if (!points || points.length < 2) return points?.length ? [points] : [];

  const segments = [[points[0]]];

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];

    const dx = Math.abs(Number(current.x) - Number(previous.x));

    if (dx > worldWidth / 2) {
      segments.push([current]);
    } else {
      segments[segments.length - 1].push(current);
    }
  }

  return segments.filter((segment) => segment.length >= 2);
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
  const speedPerStep = Math.hypot(dxPerStep, dyPerStep);

  if (speedPerStep < 0.001) return null;

  const latest = unwrapped[unwrapped.length - 1];

  const latestUnwrappedX = latest.unwrappedX;
  const latestY = Number(latest.y);

  const maxSlopeLength = worldWidth * MAX_SLOPE_WORLD_LENGTH_RATIO;
  const maxTByLength = maxSlopeLength / speedPerStep;

  const candidates = [maxTByLength];

  if (dyPerStep > 0) {
    candidates.push((worldHeight - latestY) / dyPerStep);
  }

  if (dyPerStep < 0) {
    candidates.push((0 - latestY) / dyPerStep);
  }

  const positive = candidates.filter((value) => Number.isFinite(value) && value > 0);
  const t = positive.length ? Math.min(...positive) : 1;

  const endUnwrappedX = latestUnwrappedX + dxPerStep * t;
  const endY = clampY(latestY + dyPerStep * t, worldHeight);

  const startX = normalizeX(latestUnwrappedX, worldWidth);
  const dx = endUnwrappedX - latestUnwrappedX;

  return {
    start: {
      ...latest,
      x: startX,
      y: clampY(latestY, worldHeight)
    },
    end: {
      x: startX + dx,
      y: endY
    },
    length: Math.hypot(dx, endY - latestY)
  };
}

function offsetSlopeLine(rawSlopeLine, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight) {
  if (!rawSlopeLine) return null;

  const startX = normalizeX(
    Number(rawSlopeLine.start.x) + Number(waypointOffsetX || 0),
    worldWidth
  );

  const dx = Number(rawSlopeLine.end.x) - Number(rawSlopeLine.start.x);

  return {
    start: {
      ...rawSlopeLine.start,
      x: startX,
      y: clampY(Number(rawSlopeLine.start.y) + Number(waypointOffsetY || 0), worldHeight)
    },
    end: {
      ...rawSlopeLine.end,
      x: startX + dx,
      y: clampY(Number(rawSlopeLine.end.y) + Number(waypointOffsetY || 0), worldHeight)
    },
    length: rawSlopeLine.length
  };
}

function getCityName(city) {
  return cleanText(city?.name ?? city?.Name);
}

function getCityField(city, camel, pascal, fallback = '') {
  return city?.[camel] ?? city?.[pascal] ?? fallback;
}

function getCityCoord(city, worldWidth, worldHeight) {
  const worldX = Number(getCityField(city, 'worldX', 'WorldX', NaN));
  const worldY = Number(getCityField(city, 'worldY', 'WorldY', NaN));
  const mapPixelX = Number(getCityField(city, 'mapPixelX', 'MapPixelX', NaN));
  const mapPixelY = Number(getCityField(city, 'mapPixelY', 'MapPixelY', NaN));

  const x = Number.isFinite(worldX)
    ? worldX
    : Number.isFinite(mapPixelX)
      ? mapPixelX * (worldWidth / MAP_PIXEL_WIDTH)
      : NaN;

  const y = Number.isFinite(worldY)
    ? worldY
    : Number.isFinite(mapPixelY)
      ? mapPixelY * (worldHeight / MAP_PIXEL_HEIGHT)
      : NaN;

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return {
    x: normalizeX(x, worldWidth),
    y: clampY(y, worldHeight)
  };
}

function getPriceCity(row) {
  return cleanText(row?.city ?? row?.City);
}

function getPriceItem(row) {
  return cleanText(row?.itemName ?? row?.item ?? row?.ItemName ?? row?.Item);
}

function getPriceTradeType(row) {
  return cleanText(row?.tradeType ?? row?.type ?? row?.TradeType ?? row?.Type);
}

function getPriceCapturedTime(row) {
  const value = row?.capturedAtUtc ?? row?.CapturedAtUtc ?? row?.createdAtUtc ?? row?.CreatedAtUtc;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}


function formatMultiplier(value) {
  if (value == null || value === '') return 'Missing multiplier';
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(0)}%` : String(value);
}

function buildLatestCityGoods(prices, cityName) {
  const target = normalizeName(cityName);
  if (!target) return [];

  const latestByGood = new globalThis.Map();

  for (const row of prices || []) {
    if (normalizeName(getPriceCity(row)) !== target) continue;

    const item = getPriceItem(row);
    const tradeType = getPriceTradeType(row) || 'Unknown';
    if (!item) continue;

    const key = `${normalizeName(tradeType)}|${normalizeName(item)}`;
    const capturedTime = getPriceCapturedTime(row);
    const current = latestByGood.get(key);

    if (!current || capturedTime >= current.capturedTime) {
      latestByGood.set(key, {
        item,
        tradeType,
        price: row?.price ?? row?.Price ?? '',
        multiplier: row?.multiplier ?? row?.Multiplier ?? null,
        capturedTime
      });
    }
  }

  return [...latestByGood.values()].sort((a, b) => {
    const tradeCompare = a.tradeType.localeCompare(b.tradeType);
    if (tradeCompare !== 0) return tradeCompare;
    return a.item.localeCompare(b.item);
  });
}

function Button({ children, className = '', variant = 'secondary', ...props }) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Card({ children, className = '' }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? 'toggle-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-switch" />
      <span>{label}</span>
    </button>
  );
}

function CityGoodsColumn({ title, rows, emptyMessage, tone = 'default' }) {
  return (
    <div className={`city-goods-column city-goods-column-${tone}`}>
      <h4>{title}</h4>

      {rows.length === 0 ? (
        <div className="city-goods-empty">{emptyMessage}</div>
      ) : (
        <div className="city-goods-list">
          {rows.map((row) => (
            <div key={`${row.tradeType}-${row.item}`} className="city-good-row">
              <div>
                <div className="city-good-name">{row.item}</div>
                <div className="city-good-meta">
                  <span>{formatMultiplier(row.multiplier)}</span>
                </div>
              </div>

              <span className="city-good-price">{row.price || 'No price'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectedCityPanel({ city, goods, onClose }) {
  const panelRef = useRef(null);

  const stopPanelEvent = (event) => {
    event.stopPropagation();
  };

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;

    const stopNativeWheel = (event) => {
      // Do not call preventDefault here. The panel still needs to scroll.
      // Capture + stopPropagation prevents the map stage native wheel listener from zooming the map.
      event.stopPropagation();
    };

    panel.addEventListener('wheel', stopNativeWheel, { passive: false, capture: true });

    return () => {
      panel.removeEventListener('wheel', stopNativeWheel, { capture: true });
    };
  }, []);

  const cityName = getCityName(city);
  const mainRegion = getCityField(city, 'mainRegion', 'MainRegion', 'Unassigned');
  const subRegion = getCityField(city, 'subRegion', 'SubRegion', 'Unassigned');
  const seaTradeRegion = getCityField(city, 'seaTradeRegion', 'SeaTradeRegion', 'Unassigned');

  const sellGoods = goods.filter((row) => normalizeName(row.tradeType) === 'sell');
  const buyGoods = goods.filter((row) => normalizeName(row.tradeType) === 'buy');
  const otherGoods = goods.filter((row) => !['sell', 'buy'].includes(normalizeName(row.tradeType)));

  return (
    <aside
      ref={panelRef}
      className="map-city-selection-panel map-city-side-panel"
      onWheelCapture={stopPanelEvent}
      onWheel={stopPanelEvent}
      onMouseDown={stopPanelEvent}
      onMouseMove={stopPanelEvent}
      onMouseUp={stopPanelEvent}
      onClick={stopPanelEvent}
    >
      <div className="map-city-selection-header">
        <div>
          <h3>
            <MapPin size={20} /> {cityName}
          </h3>
          <p className="muted">Click a city dot to see what this city buys and sells.</p>
          <div className="map-city-region-line">
            <span>Main: {mainRegion || 'Unassigned'}</span>
            <span>Sub: {subRegion || 'Unassigned'}</span>
            <span>Sea: {seaTradeRegion || 'Unassigned'}</span>
          </div>
        </div>

        <button
          type="button"
          className="map-city-close-button"
          onClick={onClose}
          aria-label="Close city goods panel"
          title="Close"
        >
          <X size={18} />
        </button>
      </div>

      <div className="city-goods-grid">
        <CityGoodsColumn
          title="Buy"
          rows={buyGoods}
          emptyMessage="No Buy records found for this city yet."
          tone="buy"
        />

        <CityGoodsColumn
          title="Sell"
          rows={sellGoods}
          emptyMessage="No Sell records found for this city yet."
          tone="sell"
        />
      </div>

      {otherGoods.length > 0 && (
        <CityGoodsColumn
          title="Other known records"
          rows={otherGoods}
          emptyMessage="No other records."
          tone="default"
        />
      )}
    </aside>
  );
}


function getOcrRunningState(ocrStatus) {
  if (!ocrStatus) return null;

  const negativeWords = ['stopped', 'stop', 'idle', 'off', 'disabled', 'not running', 'notrunning', 'false'];
  const positiveWords = ['running', 'run', 'active', 'started', 'start', 'on', 'enabled', 'capturing', 'watching'];
  const booleanFields = ['running', 'isRunning', 'active', 'isActive', 'started', 'isStarted', 'enabled', 'isEnabled'];

  for (const field of booleanFields) {
    if (typeof ocrStatus[field] === 'boolean') {
      return ocrStatus[field];
    }
  }

  const rawText = [
    ocrStatus.status,
    ocrStatus.state,
    ocrStatus.ocrStatus,
    ocrStatus.message,
    ocrStatus.mode,
    ocrStatus.Status,
    ocrStatus.State,
    ocrStatus.Message
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(' ');

  const text = normalizeName(rawText);
  if (!text) return null;

  if (negativeWords.some((word) => text.includes(word))) return false;
  if (positiveWords.some((word) => text.includes(word))) return true;

  return null;
}

export default function WrappedCoordinateMap({
  coordinates,
  cities = [],
  prices = [],
  ocrStatus = null,
  latestCity = null,
  worldWidth,
  worldHeight,
  xZeroOffset,
  waypointOffsetX,
  waypointOffsetY,
  mapSlopePointCount = DEFAULT_MAP_SLOPE_POINT_COUNT,
  refreshCoordinates
}) {
  const [zoom, setZoom] = useState(0.075);
  const [pan, setPan] = useState({ x: 70, y: 70 });
  const [dragging, setDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState(null);
  const [viewportSize, setViewportSize] = useState({ width: 1200, height: 700 });
  const [keepCentered, setKeepCentered] = useState(false);
  const [isFullBrowserMap, setIsFullBrowserMap] = useState(false);
  const [showMapSettings, setShowMapSettings] = useState(false);

  const [precisionMode, setPrecisionMode] = useState(false);
  const [showTrailLayer, setShowTrailLayer] = useState(true);
  const [showPointsLayer, setShowPointsLayer] = useState(false);
  const [showDirectionLayer, setShowDirectionLayer] = useState(true);
  const [showCityLayer, setShowCityLayer] = useState(true);
  const [selectedCityName, setSelectedCityName] = useState('');
  const [cityGoodSearch, setCityGoodSearch] = useState('');
  const [trailWindow, setTrailWindow] = useState('2h');

  const [sessionTrailRaw, setSessionTrailRaw] = useState([]);

  const stageRef = useRef(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const cityClickRef = useRef(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    if (!showCityLayer) {
      setSelectedCityName('');
      setCityGoodSearch('');
    }
  }, [showCityLayer]);

  useEffect(() => {
    if (!isFullBrowserMap) return undefined;

    document.body.classList.add('map-full-browser-active');

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsFullBrowserMap(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('map-full-browser-active');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullBrowserMap]);

  const current = coordinates[coordinates.length - 1];

  useEffect(() => {
    if (!coordinates.length) return;

    setSessionTrailRaw((currentTrail) => {
      const known = new Set(
        currentTrail.map((point, index) => getPointKey(point, index))
      );

      const newPoints = coordinates.filter((point, index) => {
        const key = getPointKey(point, index);
        return !known.has(key);
      });

      if (!newPoints.length) {
        return pruneTrail(currentTrail, trailWindow);
      }

      return pruneTrail([...currentTrail, ...newPoints], trailWindow);
    });
  }, [coordinates, trailWindow]);

  const displayCoordinates = useMemo(
    () =>
      coordinates.map((point) =>
        applyWaypointOffset(point, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight)
      ),
    [coordinates, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight]
  );

  const displayTrailCoordinates = useMemo(
    () =>
      sessionTrailRaw.map((point) =>
        applyWaypointOffset(point, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight)
      ),
    [sessionTrailRaw, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight]
  );

  const cityMarkers = useMemo(
    () =>
      (cities || [])
        .map((city) => ({
          city,
          name: getCityName(city),
          coord: getCityCoord(city, worldWidth, worldHeight)
        }))
        .filter((marker) => marker.name && marker.coord),
    [cities, worldWidth, worldHeight]
  );

  const selectedCity = useMemo(
    () => cityMarkers.find((marker) => normalizeName(marker.name) === normalizeName(selectedCityName))?.city || null,
    [cityMarkers, selectedCityName]
  );

  const selectedCityGoods = useMemo(
    () => buildLatestCityGoods(prices, selectedCityName),
    [prices, selectedCityName]
  );

  const cityGoodSearchQuery = cityGoodSearch.trim();
  const hasCityGoodSearch = cityGoodSearchQuery.length > 0;

  const highlightedBuyCityNames = useMemo(() => {
    const query = normalizeName(cityGoodSearchQuery);
    const matches = new Set();

    if (!query) return matches;

    for (const row of prices || []) {
      if (normalizeName(getPriceTradeType(row)) !== 'buy') continue;
      if (!normalizeName(getPriceItem(row)).includes(query)) continue;

      const cityName = getPriceCity(row);
      if (cityName) matches.add(normalizeName(cityName));
    }

    return matches;
  }, [prices, cityGoodSearchQuery]);

  const buyGoodOptions = useMemo(() => {
    const options = new Set();

    for (const row of prices || []) {
      if (normalizeName(getPriceTradeType(row)) !== 'buy') continue;

      const item = getPriceItem(row);
      if (item) options.add(item);
    }

    return [...options].sort((a, b) => a.localeCompare(b));
  }, [prices]);

  const latestCityName = sanitizeCityName(latestCity?.city || latestCity?.name || latestCity?.Name || '');
  const ocrRunningState = getOcrRunningState(ocrStatus);
  const ocrRunning = ocrRunningState === true;
  const ocrStatusLabel = ocrRunningState == null ? 'Unknown' : ocrRunning ? 'Running' : 'Stopped';

  const trailSegments = useMemo(
    () => splitWrappedSegments(displayTrailCoordinates, worldWidth),
    [displayTrailCoordinates, worldWidth]
  );

  const slopePointCount = clampMapSlopePointCount(mapSlopePointCount);

  const rawSlopeLine = useMemo(
    () => buildSlopeLine(coordinates, worldWidth, worldHeight, slopePointCount),
    [coordinates, worldWidth, worldHeight, slopePointCount]
  );

  const slopeLine = useMemo(
    () => offsetSlopeLine(rawSlopeLine, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight),
    [rawSlopeLine, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight]
  );

  const displayCurrent = displayCoordinates[displayCoordinates.length - 1];
  const visualZeroX = normalizeX(xZeroOffset, worldWidth);

  const trailLineWidth = precisionMode
    ? scaledStrokeWidth(zoom, 0.8, 0.45, 45)
    : scaledStrokeWidth(zoom, 1.4, 0.7, 70);

  const slopeLineWidth = precisionMode
    ? scaledStrokeWidth(zoom, 1.4, 0.7, 70)
    : scaledStrokeWidth(zoom, 4, 2, 140);

  const currentPointRadius = precisionMode
    ? scaledRadius(zoom, 4, 2, 80)
    : scaledRadius(zoom, 8, 4, 160);

  const oldPointRadius = precisionMode
    ? scaledRadius(zoom, 2.2, 1.3, 50)
    : scaledRadius(zoom, 5, 3, 120);

  const cityPointRadius = precisionMode
    ? scaledRadius(zoom, 4.6, 2.6, 90)
    : scaledRadius(zoom, 6.5, 3.2, 120);

  const selectedCityPointRadius = precisionMode
    ? scaledRadius(zoom, 7, 3.6, 120)
    : scaledRadius(zoom, 9.5, 4.5, 150);


  const tileOffsets = useMemo(() => {
    const tilePx = worldWidth * zoom;
    const visibleTiles = tilePx > 0 ? Math.ceil(viewportSize.width / tilePx) : 3;
    const count = Math.max(3, visibleTiles + 4);

    return Array.from({ length: count * 2 + 1 }, (_, index) => (index - count) * worldWidth);
  }, [viewportSize.width, worldWidth, zoom]);

  const visibleCityMarkers = useMemo(() => {
    if (!showCityLayer || !cityMarkers.length || !tileOffsets.length) return [];

    const paddingPx = 80;
    const visible = [];

    for (const offset of tileOffsets) {
      for (const marker of cityMarkers) {
        const worldX = offset + marker.coord.x;
        const screenX = worldX * zoom + pan.x;
        const screenY = marker.coord.y * zoom + pan.y;

        if (
          screenX < -paddingPx ||
          screenX > viewportSize.width + paddingPx ||
          screenY < -paddingPx ||
          screenY > viewportSize.height + paddingPx
        ) {
          continue;
        }

        visible.push({
          ...marker,
          renderX: worldX,
          renderY: marker.coord.y,
          renderKey: `${offset}-${marker.name}`
        });
      }
    }

    return visible;
  }, [showCityLayer, cityMarkers, tileOffsets, pan.x, pan.y, zoom, viewportSize.width, viewportSize.height]);

  const gridLines = [];
  const verticalStep = Math.max(500, Math.round(worldWidth / 16));
  const horizontalStep = Math.max(300, Math.round(worldHeight / 12));

  for (let x = 0; x <= worldWidth; x += verticalStep) {
    gridLines.push(<line key={`v-${x}`} x1={x} y1={0} x2={x} y2={worldHeight} />);
  }

  for (let y = 0; y <= worldHeight; y += horizontalStep) {
    gridLines.push(<line key={`h-${y}`} x1={0} y1={y} x2={worldWidth} y2={y} />);
  }

  const centerOnCurrent = useCallback(
    (targetZoom = zoomRef.current) => {
      if (!displayCurrent || !stageRef.current) return;

      const rect = stageRef.current.getBoundingClientRect();

      const nextPan = {
        x: normalizePanX(rect.width / 2 - displayCurrent.x * targetZoom, worldWidth, targetZoom),
        y: rect.height / 2 - displayCurrent.y * targetZoom
      };

      panRef.current = nextPan;
      setPan(nextPan);
    },
    [displayCurrent, worldWidth]
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateSize = () => {
      const rect = stage.getBoundingClientRect();

      setViewportSize({
        width: rect.width || 1200,
        height: rect.height || 700
      });
    };

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

      const nextPan =
        keepCentered && displayCurrent
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

    cityClickRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };

    setDragging(true);
    setLastMouse({ x: event.clientX, y: event.clientY });
  };

  const onMouseMove = (event) => {
    if (!dragging || !lastMouse) return;

    if (cityClickRef.current) {
      const distance = Math.hypot(
        event.clientX - cityClickRef.current.startX,
        event.clientY - cityClickRef.current.startY
      );

      if (distance > CITY_CLICK_MOVE_THRESHOLD_PX) {
        cityClickRef.current.moved = true;
      }
    }

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
    cityClickRef.current = null;
  };

  const selectCityFromCleanClick = (event, city) => {
    event.preventDefault();
    event.stopPropagation();

    const clickState = cityClickRef.current;
    const wasCleanClick = !clickState || !clickState.moved;

    setDragging(false);
    setLastMouse(null);
    cityClickRef.current = null;

    if (!showCityLayer || !wasCleanClick) return;

    setSelectedCityName(getCityName(city));
  };

  const zoomByButton = (factor) => {
    const nextZoom = Math.max(0.018, Math.min(0.75, zoom * factor));

    setZoom(nextZoom);
    zoomRef.current = nextZoom;

    if (keepCentered) {
      centerOnCurrent(nextZoom);
    } else {
      const nextPan = {
        ...panRef.current,
        x: normalizePanX(panRef.current.x, worldWidth, nextZoom)
      };

      setPan(nextPan);
      panRef.current = nextPan;
    }
  };

  const eraseTrail = () => {
    setSessionTrailRaw(current ? [current] : []);
  };

  const renderMapCopy = (offset) => (
    <g key={offset} transform={`translate(${offset}, 0)`}>
      <rect x="0" y="0" width={worldWidth} height={worldHeight} className="world-rect" rx="120" />

      <image
        href={MAP_IMAGE_URL}
        x="0"
        y="0"
        width={worldWidth}
        height={worldHeight}
        preserveAspectRatio="none"
        className="map-image"
      />

      <g className="grid-lines">{gridLines}</g>

      <line
        x1={visualZeroX}
        y1="0"
        x2={visualZeroX}
        y2={worldHeight}
        className="zero-line"
      />

      <text x={visualZeroX + 100} y="260" className="zero-label">
        visual X=0
      </text>
    </g>
  );

  const renderCityLayer = () => {
    if (!showCityLayer || !visibleCityMarkers.length) return null;

    return (
      <g className="city-map-layer">
        {visibleCityMarkers.map((marker) => {
          const normalizedCityName = normalizeName(marker.name);
          const selected = normalizedCityName === normalizeName(selectedCityName);
          const buyGoodMatch = hasCityGoodSearch && highlightedBuyCityNames.has(normalizedCityName);
          const mutedBySearch = hasCityGoodSearch && !buyGoodMatch;
          const radius = selected
            ? selectedCityPointRadius
            : buyGoodMatch
              ? cityPointRadius * 1.15
              : mutedBySearch
                ? cityPointRadius * 0.62
                : cityPointRadius;

          const markerClassName = [
            'city-map-marker',
            selected ? 'selected' : '',
            buyGoodMatch ? 'buy-good-match' : '',
            mutedBySearch ? 'buy-good-muted' : ''
          ].filter(Boolean).join(' ');

          const dotClassName = [
            'city-map-dot',
            selected ? 'city-map-dot-selected' : '',
            buyGoodMatch ? 'city-map-dot-buy-match' : '',
            mutedBySearch ? 'city-map-dot-muted' : ''
          ].filter(Boolean).join(' ');

          return (
            <g
              key={`city-${marker.renderKey}`}
              className={markerClassName}
              onMouseUp={(event) => selectCityFromCleanClick(event, marker.city)}
            >
              <circle
                cx={marker.renderX}
                cy={marker.renderY}
                r={radius}
                className={dotClassName}
              />

              <title>
                {hasCityGoodSearch
                  ? buyGoodMatch
                    ? `${marker.name} buys ${cityGoodSearchQuery}`
                    : marker.name
                  : marker.name}
              </title>
            </g>
          );
        })}
      </g>
    );
  };

  const renderCoordinateLayer = (offset) => {
    const pointsToRender = showPointsLayer
      ? precisionMode
        ? displayCurrent
          ? [displayCurrent]
          : []
        : displayCoordinates
      : displayCurrent
        ? [displayCurrent]
        : [];

    return (
      <g key={`points-${offset}`} transform={`translate(${offset}, 0)`}>
        {showTrailLayer &&
          trailSegments.map((segment, index) => (
            <polyline
              key={`trail-${offset}-${index}`}
              points={segment.map((point) => `${point.x},${point.y}`).join(' ')}
              className="history-line trail-line"
              strokeWidth={trailLineWidth}
              style={{
                opacity: precisionMode ? 0.85 : 0.72
              }}
            />
          ))}

        {showDirectionLayer && slopeLine && (
          <line
            x1={slopeLine.start.x}
            y1={slopeLine.start.y}
            x2={slopeLine.end.x}
            y2={slopeLine.end.y}
            className="slope-line"
            strokeWidth={slopeLineWidth}
            style={{
              opacity: precisionMode ? 0.85 : 1
            }}
          />
        )}

        {pointsToRender.map((point, index, arr) => (
          <circle
            key={`${offset}-${point.id || index}-${point.x}-${point.y}`}
            cx={point.x}
            cy={point.y}
            r={index === arr.length - 1 ? currentPointRadius : oldPointRadius}
            className={index === arr.length - 1 ? 'point current-point' : 'point'}
            style={{
              opacity: precisionMode && index !== arr.length - 1 ? 0.35 : 1
            }}
          />
        ))}
      </g>
    );
  };

  return (
    <div className={`full-map-shell coordinate-map-shell ${isFullBrowserMap ? 'map-full-browser-shell' : ''}`}>
      <Card className={`map-card full-map-card coordinate-map-card ${isFullBrowserMap ? 'map-full-browser-card' : ''}`}>
        <div className="map-compact-toolbar dark-header compact-header">
          <div className="map-toolbar-main-row">
            <div className="map-title-block">
              <h2>
                <Map size={20} /> Full Window Wrapped Map
              </h2>

              <div className="map-status-pills">
                <span className={`map-status-pill ${ocrRunning ? 'status-running' : ocrRunningState == null ? 'status-unknown' : 'status-stopped'}`}>
                  OCR: {ocrStatusLabel}
                </span>
                <span className="map-status-pill status-city">
                  City: {latestCityName || 'Unknown'}
                </span>
                {showCityLayer && (
                  <span className="map-status-pill status-city-links">
                    City links: {visibleCityMarkers.length}/{cityMarkers.length}
                  </span>
                )}
              </div>
            </div>

            <div className="map-toolbar-actions">
              <Button className="map-icon-button" onClick={() => zoomByButton(1 / 1.14)} title="Zoom out">
                <ZoomOut size={16} />
              </Button>

              <Button className="map-icon-button" onClick={() => zoomByButton(1.14)} title="Zoom in">
                <ZoomIn size={16} />
              </Button>

              <Button className="map-compact-button" onClick={() => centerOnCurrent()}>
                Center
              </Button>

              <Button className="map-compact-button" onClick={eraseTrail} disabled={!current}>
                <Eraser size={16} /> Trail
              </Button>

              <Toggle checked={showCityLayer} onChange={setShowCityLayer} label={`City links (${cityMarkers.length})`} />

              <Button
                className={`map-icon-button ${showMapSettings ? 'active' : ''}`}
                onClick={() => setShowMapSettings((value) => !value)}
                title="Map settings"
              >
                <SlidersHorizontal size={16} />
              </Button>

              <Button
                className="map-icon-button"
                onClick={() => setIsFullBrowserMap((value) => !value)}
                title={isFullBrowserMap ? 'Exit full browser map' : 'Full browser map'}
              >
                {isFullBrowserMap ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </Button>

              <Button className="map-icon-button" onClick={refreshCoordinates} title="Refresh coordinates">
                <RefreshCw size={16} />
              </Button>
            </div>
          </div>

          <div className="map-toolbar-quick-row">
            <label className="map-toolbar-select-field" title="Trail duration">
              <span>Trail</span>
              <select
                className="input"
                value={trailWindow}
                onChange={(event) => setTrailWindow(event.target.value)}
              >
                <option value="30m">30 min</option>
                <option value="2h">2 hours</option>
                <option value="session">Session</option>
              </select>
            </label>

            {showCityLayer && (
              <label className="city-good-filter-field" title="Highlight cities where this good can be bought">
                <span>Buy good</span>
                <input
                  className="input city-good-filter-input"
                  value={cityGoodSearch}
                  onChange={(event) => setCityGoodSearch(event.target.value)}
                  placeholder="Example: Diamond"
                  list="map-buy-good-options"
                />

                <datalist id="map-buy-good-options">
                  {buyGoodOptions.slice(0, 300).map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>

                {cityGoodSearch && (
                  <button
                    type="button"
                    className="city-good-filter-clear"
                    onClick={() => setCityGoodSearch('')}
                    aria-label="Clear buy-good search"
                    title="Clear"
                  >
                    ×
                  </button>
                )}
              </label>
            )}

            {showCityLayer && hasCityGoodSearch && (
              <span className="map-filter-summary">
                {highlightedBuyCityNames.size} buy city{highlightedBuyCityNames.size === 1 ? '' : 'ies'} match
              </span>
            )}
          </div>

          {showMapSettings && (
            <div className="map-settings-drawer">
              <Toggle checked={keepCentered} onChange={setKeepCentered} label="Keep centered" />
              <Toggle checked={precisionMode} onChange={setPrecisionMode} label="Precision mode" />
              <Toggle checked={showTrailLayer} onChange={setShowTrailLayer} label="Path trail" />
              <Toggle checked={showPointsLayer} onChange={setShowPointsLayer} label="Points" />
              <Toggle checked={showDirectionLayer} onChange={setShowDirectionLayer} label="Direction" />
            </div>
          )}
        </div>

        <div
          ref={stageRef}
          className={`map-stage fullscreen-map-stage wrapped-map-stage ${isFullBrowserMap ? 'map-stage-full-browser' : ''} ${showCityLayer && selectedCity ? 'city-side-panel-open' : ''}`}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
          <svg className="map-svg">
            <rect width="100%" height="100%" className="map-bg" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {tileOffsets.map(renderMapCopy)}
              {renderCityLayer()}
              {tileOffsets.map(renderCoordinateLayer)}
            </g>
          </svg>

          <div className="map-info">
            <strong>Current coordinate</strong>
            <span>{current ? `OCR X ${current.x} / Y ${current.y}` : 'No coordinate yet'}</span>
            <span>{displayCurrent ? `Map X ${displayCurrent.x} / Y ${displayCurrent.y}` : ''}</span>
            <span>Trail points: {sessionTrailRaw.length}</span>
            <span>
              Trail mode:{' '}
              {trailWindow === '2h' ? '2 hours' : trailWindow === '30m' ? '30 min' : 'session'}
            </span>
            <span>
              Direction max: {(MAX_SLOPE_WORLD_LENGTH_RATIO * 100).toFixed(0)}% map width
            </span>
            <span>Zoom {(zoom * 100).toFixed(1)}%</span>
            {showCityLayer && <span>City links: {cityMarkers.length} cities / {visibleCityMarkers.length} visible</span>}
            {showCityLayer && hasCityGoodSearch && (
              <span>Buy good matches: {highlightedBuyCityNames.size}</span>
            )}
          </div>

          {showCityLayer && selectedCity && (
            <SelectedCityPanel
              city={selectedCity}
              goods={selectedCityGoods}
              onClose={() => setSelectedCityName('')}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
