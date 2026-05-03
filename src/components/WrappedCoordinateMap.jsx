import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, Map, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

const MAP_IMAGE_URL = '/maps/world-map.png';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const MAX_SESSION_TRAIL_POINTS = 10000;

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
  return String(
    point?.id ??
      point?.capturedAtUtc ??
      point?.createdAtUtc ??
      point?.timeUtc ??
      point?.timestamp ??
      `${point?.x}:${point?.y}:${index}`
  );
}

function pruneTrail(points, trailWindow) {
  if (!points.length) return [];

  let next = points;

  if (trailWindow === '30m' || trailWindow === '2h') {
    const windowMs = trailWindow === '30m' ? THIRTY_MINUTES_MS : TWO_HOURS_MS;
    const now = Date.now();

    const timestamped = next.filter((point) => getPointTimestamp(point) != null);

    if (timestamped.length > 0) {
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
    start: {
      ...latest,
      x: normalizeX(latestUnwrappedX, worldWidth),
      y: clampY(latestY, worldHeight)
    },
    end: {
      x: normalizeX(latestUnwrappedX + dxPerStep * t, worldWidth),
      y: clampY(latestY + dyPerStep * t, worldHeight)
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

export default function WrappedCoordinateMap({
  coordinates,
  worldWidth,
  worldHeight,
  xZeroOffset,
  waypointOffsetX,
  waypointOffsetY,
  refreshCoordinates
}) {
  const [zoom, setZoom] = useState(0.075);
  const [pan, setPan] = useState({ x: 70, y: 70 });
  const [dragging, setDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [keepCentered, setKeepCentered] = useState(false);

  const [precisionMode, setPrecisionMode] = useState(false);
  const [showTrailLayer, setShowTrailLayer] = useState(true);
  const [showPointsLayer, setShowPointsLayer] = useState(true);
  const [showDirectionLayer, setShowDirectionLayer] = useState(true);
  const [trailWindow, setTrailWindow] = useState('2h');

  const [sessionTrailRaw, setSessionTrailRaw] = useState([]);

  const stageRef = useRef(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

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

  const trailSegments = useMemo(
    () => splitWrappedSegments(displayTrailCoordinates, worldWidth),
    [displayTrailCoordinates, worldWidth]
  );

  const rawSlopeLine = useMemo(
    () => buildSlopeLine(coordinates, worldWidth, worldHeight, 12),
    [coordinates, worldWidth, worldHeight]
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

  const tileOffsets = useMemo(() => {
    const tilePx = worldWidth * zoom;
    const visibleTiles = tilePx > 0 ? Math.ceil(viewportWidth / tilePx) : 3;
    const count = Math.max(3, visibleTiles + 4);

    return Array.from({ length: count * 2 + 1 }, (_, index) => (index - count) * worldWidth);
  }, [viewportWidth, worldWidth, zoom]);

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
    <div className="full-map-shell">
      <Card className="map-card full-map-card">
        <div className="card-header dark-header compact-header">
          <div>
            <h2>
              <Map size={22} /> Full Window Wrapped Map
            </h2>
            <p>
              Drag to move. Mouse wheel zooms only this map. Trail is separate from direction calculation.
            </p>
          </div>

          <div className="map-controls">
            <div className="button-row">
              <Button onClick={() => zoomByButton(1 / 1.14)}>
                <ZoomOut size={16} />
              </Button>

              <Button onClick={() => zoomByButton(1.14)}>
                <ZoomIn size={16} />
              </Button>

              <Button onClick={() => centerOnCurrent()}>
                Center current
              </Button>

              <Button onClick={eraseTrail} disabled={!current}>
                <Eraser size={16} /> Erase trail
              </Button>

              <Button onClick={refreshCoordinates}>
                <RefreshCw size={16} /> Refresh
              </Button>
            </div>

            <div className="toggle-row">
              <Toggle checked={keepCentered} onChange={setKeepCentered} label="Keep centered" />
              <Toggle checked={precisionMode} onChange={setPrecisionMode} label="Precision mode" />
              <Toggle checked={showTrailLayer} onChange={setShowTrailLayer} label="Path trail" />
              <Toggle checked={showPointsLayer} onChange={setShowPointsLayer} label="Points" />
              <Toggle checked={showDirectionLayer} onChange={setShowDirectionLayer} label="Direction" />

              <select
                className="input"
                value={trailWindow}
                onChange={(event) => setTrailWindow(event.target.value)}
                style={{ width: 150 }}
                title="Trail duration"
              >
                <option value="30m">Trail: 30 min</option>
                <option value="2h">Trail: 2 hours</option>
                <option value="session">Trail: session</option>
              </select>
            </div>
          </div>
        </div>

        <div
          ref={stageRef}
          className="map-stage fullscreen-map-stage wrapped-map-stage"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
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
            <span>Trail points: {sessionTrailRaw.length}</span>
            <span>Trail mode: {trailWindow === '2h' ? '2 hours' : trailWindow === '30m' ? '30 min' : 'session'}</span>
            <span>Zoom {(zoom * 100).toFixed(1)}%</span>
          </div>
        </div>
      </Card>
    </div>
  );
}