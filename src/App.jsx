import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Crosshair,
  Map,
  RefreshCw,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  TrendingUp
} from 'lucide-react';
import { api } from './api';
import GameWindowPanel from './components/GameWindowPanel.jsx';
import OcrQuickControls from './components/OcrQuickControls.jsx';
import TradingTab from './components/TradingTab.jsx';
import SortableTable from './components/SortableTable.jsx';
import WrappedCoordinateMap from './components/WrappedCoordinateMap.jsx';
import CoordinateOcrSettingsPanel from './components/CoordinateOcrSettingsPanel.jsx';
import PriceTradeTypeTemplateSettingsPanel from './components/PriceTradeTypeTemplateSettingsPanel.jsx';
import DataSharingPanel from './components/DataSharingPanel.jsx';
import MapEditorPanel from './components/MapEditorPanel.jsx';

const DEFAULT_WORLD_WIDTH = 16384;
const DEFAULT_WORLD_HEIGHT = 8192;
const DEFAULT_X_ZERO_OFFSET = 0;
const DEFAULT_WAYPOINT_OFFSET_X = 0;
const DEFAULT_WAYPOINT_OFFSET_Y = 0;
const DEFAULT_OCR_INTERVAL = 1;
const DEFAULT_CITY_INTERVAL = 8;
const DEFAULT_MAP_SLOPE_POINT_COUNT = 10;
const DEFAULT_MAP_SLOPE_OUTLIER_FILTER = 'balanced';
const MAP_IMAGE_URL = '/maps/world-map.png';
const PRICE_HISTORY_INITIAL_VISIBLE = 20;
const PRICE_HISTORY_LOAD_STEP = 20;
const PRICE_HISTORY_MAX_VISIBLE = 500;
const PRICE_REFRESH_INTERVAL_MS = 10 * 1000;
const COORDINATE_STREAM_HISTORY = 30;
const MAX_REALTIME_COORDINATES = 1000;
const COORDINATE_STREAM_STALE_MS = 5 * 1000;

function sanitizeCityName(value) {
  if (!value) return '';
  return String(value).split('(')[0].split('\n')[0].split('\r')[0].trim();
}

function normalizeX(value, width) {
  let normalized = Number(value || 0) % width;
  if (normalized < 0) normalized += width;
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

function normalizeMapSlopeOutlierFilter(value) {
  const normalized = String(value || DEFAULT_MAP_SLOPE_OUTLIER_FILTER).trim().toLowerCase();
  return ['off', 'balanced', 'strict'].includes(normalized)
    ? normalized
    : DEFAULT_MAP_SLOPE_OUTLIER_FILTER;
}

function applyWaypointOffset(point, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight) {
  return {
    ...point,
    x: normalizeX(Number(point.x) + Number(waypointOffsetX || 0), worldWidth),
    y: clampY(Number(point.y) + Number(waypointOffsetY || 0), worldHeight)
  };
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function getPriceRowId(row) {
  return row?.id ?? row?.priceHistoryId ?? row?.priceId ?? row?.Id ?? null;
}

function getPriceRowItem(row) {
  return row?.itemName || row?.item || row?.name || '';
}

function getPriceRowTradeType(row) {
  return row?.tradeType || row?.type || '';
}

function getPriceRowCapturedTime(row) {
  const value = row?.capturedAtUtc ?? row?.CapturedAtUtc ?? row?.createdAtUtc ?? row?.CreatedAtUtc;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}
function getCoordinateRowTime(row) {
  const value = row?.capturedAtUtc ?? row?.CapturedAtUtc ?? row?.createdAtUtc ?? row?.CreatedAtUtc ?? row?.timeUtc ?? row?.timestamp;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getCoordinateRowKey(row) {
  const id = row?.id ?? row?.Id;
  if (id !== undefined && id !== null && Number(id) !== 0) {
    return `id:${id}`;
  }

  const time =
    row?.capturedAtUtc ??
    row?.CapturedAtUtc ??
    row?.createdAtUtc ??
    row?.CreatedAtUtc ??
    row?.timeUtc ??
    row?.timestamp ??
    '';

  return `point:${row?.x ?? row?.X}:${row?.y ?? row?.Y}:${time}:${row?.rawText ?? row?.RawText ?? ''}`;
}

function normalizeCoordinateRow(row) {
  if (!row) return null;

  const x = Number(row.x ?? row.X);
  const y = Number(row.y ?? row.Y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    ...row,
    x,
    y,
    rawText: row.rawText ?? row.RawText ?? '',
    capturedAtUtc:
      row.capturedAtUtc ??
      row.CapturedAtUtc ??
      row.createdAtUtc ??
      row.CreatedAtUtc ??
      row.timeUtc ??
      row.timestamp ??
      new Date().toISOString()
  };
}

function getCoordinatePayloadRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  if (Array.isArray(payload.coordinates)) return payload.coordinates;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.data)) return payload.data;

  return [payload];
}

function appendCoordinateRows(currentRows, incomingRows, maxRows = MAX_REALTIME_COORDINATES) {
  const merged = new globalThis.Map();

  for (const row of currentRows || []) {
    const normalized = normalizeCoordinateRow(row);
    if (normalized) {
      merged.set(getCoordinateRowKey(normalized), normalized);
    }
  }

  const incoming = getCoordinatePayloadRows(incomingRows);

  for (const row of incoming) {
    const normalized = normalizeCoordinateRow(row);
    if (normalized) {
      merged.set(getCoordinateRowKey(normalized), normalized);
    }
  }

  return [...merged.values()]
    .sort((left, right) => getCoordinateRowTime(left) - getCoordinateRowTime(right))
    .slice(-maxRows);
}

function getLatestPriceRowsByCityGood(rows) {
  const latestByCityGood = new globalThis.Map();

  rows.forEach((row, index) => {
    const city = sanitizeCityName(row.city);
    const item = getPriceRowItem(row);
    const tradeType = getPriceRowTradeType(row);
    const key = `${city.toLowerCase()}|${item.toLowerCase()}|${tradeType.toLowerCase()}`;
    const capturedTime = getPriceRowCapturedTime(row);
    const current = latestByCityGood.get(key);

    if (!current || capturedTime > current.capturedTime || (capturedTime === current.capturedTime && index > current.index)) {
      latestByCityGood.set(key, { row, capturedTime, index });
    }
  });

  return [...latestByCityGood.values()]
    .sort((left, right) => right.capturedTime - left.capturedTime || right.index - left.index)
    .map((entry) => entry.row);
}

function Button({ children, className = '', variant = 'primary', ...props }) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Card({ children, className = '' }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function Badge({ children, tone = 'default' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function StatusBar({
  backendStatus,
  gameWindowStatus,
  ocrStatus,
  latestCity,
  error,
  onRefresh,
  startOcr,
  stopOcr,
  refreshStatus
}) {
  const connected = backendStatus?.status === 'ok';
  const gameSelected = Boolean(gameWindowStatus);
  const cityName = sanitizeCityName(latestCity?.city) || 'Unknown';

  return (
    <Card className="status-bar">
      <div className="status-left">
        <Badge tone={connected ? 'success' : 'danger'}>
          {connected ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          Backend {connected ? 'Connected' : 'Offline'}
        </Badge>

        <Badge tone={gameSelected ? 'success' : 'danger'}>
          {gameSelected ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          Game {gameSelected ? 'Selected' : 'Not Found'}
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

        <Button variant="secondary" onClick={onRefresh}>
          <RefreshCw size={16} /> Refresh all
        </Button>
      </div>
    </Card>
  );
}

function CoordinateMap({
  coordinates,
  worldWidth,
  worldHeight,
  xZeroOffset,
  waypointOffsetX,
  waypointOffsetY,
  refreshCoordinates
}) {
  const [zoom, setZoom] = useState(0.075);

  const displayCoordinates = useMemo(
    () =>
      coordinates.map((point) =>
        applyWaypointOffset(point, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight)
      ),
    [coordinates, waypointOffsetX, waypointOffsetY, worldWidth, worldHeight]
  );

  const current = coordinates[coordinates.length - 1];
  const displayCurrent = displayCoordinates[displayCoordinates.length - 1];
  const visualZeroX = normalizeX(xZeroOffset, worldWidth);

  return (
    <Card className="map-card full-map-card">
      <div className="card-header dark-header compact-header">
        <div>
          <h2>
            <Map size={22} /> Coordinate Map
          </h2>
          <p>
            World size: {worldWidth} x {worldHeight}. Image relationship: 4096 x 2048 scaled by 4.
          </p>
        </div>

        <div className="button-row">
          <Button
            variant="secondary"
            onClick={() => setZoom((z) => Math.max(0.018, z / 1.14))}
          >
            Zoom out
          </Button>

          <Button
            variant="secondary"
            onClick={() => setZoom((z) => Math.min(0.75, z * 1.14))}
          >
            Zoom in
          </Button>

          <Button variant="secondary" onClick={refreshCoordinates}>
            <RefreshCw size={16} /> Refresh
          </Button>
        </div>
      </div>

      <div className="map-stage fullscreen-map-stage">
        <svg className="map-svg" viewBox={`0 0 ${worldWidth} ${worldHeight}`}>
          <rect x="0" y="0" width={worldWidth} height={worldHeight} className="map-bg" />

          <g transform={`scale(${zoom * 12})`}>
            <image
              href={MAP_IMAGE_URL}
              x="0"
              y="0"
              width={worldWidth}
              height={worldHeight}
              preserveAspectRatio="none"
              className="map-image"
            />

            <line
              x1={visualZeroX}
              y1="0"
              x2={visualZeroX}
              y2={worldHeight}
              className="zero-line"
            />

            {displayCoordinates.map((point, index) => (
              <circle
                key={`${point.id || index}-${point.x}-${point.y}`}
                cx={point.x}
                cy={point.y}
                r={index === displayCoordinates.length - 1 ? 18 : 10}
                className={index === displayCoordinates.length - 1 ? 'point current-point' : 'point'}
              />
            ))}
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
  );
}

function PricesTab({ prices, refreshPrices, run }) {
  const [query, setQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(PRICE_HISTORY_INITIAL_VISIBLE);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteMatching, setDeleteMatching] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const normalizedQuery = query.trim().toLowerCase();
  const hasSearch = normalizedQuery.length > 0;

  useEffect(() => {
    setVisibleLimit(PRICE_HISTORY_INITIAL_VISIBLE);
  }, [normalizedQuery]);

  const latestRows = useMemo(() => getLatestPriceRowsByCityGood(prices), [prices]);

  const matchingRows = useMemo(
    () =>
      latestRows.filter((row) =>
        `${sanitizeCityName(row.city)} ${getPriceRowItem(row)} ${getPriceRowTradeType(row)} ${row.tradeGoodType || ''}`
          .toLowerCase()
          .includes(normalizedQuery)
      ),
    [latestRows, normalizedQuery]
  );

  const cappedRows = matchingRows.slice(0, PRICE_HISTORY_MAX_VISIBLE);
  const rows = cappedRows.slice(0, visibleLimit);
  const canLoadMore = rows.length < cappedRows.length;
  const hiddenCount = Math.max(0, cappedRows.length - rows.length);

  const loadMoreRows = () => {
    setVisibleLimit((current) =>
      Math.min(PRICE_HISTORY_MAX_VISIBLE, current + PRICE_HISTORY_LOAD_STEP)
    );
  };

  const openDeleteConfirm = (row) => {
    setDeleteTarget(row);
    setDeleteMatching(false);
  };

  const closeDeleteConfirm = () => {
    if (isDeleting) return;
    setDeleteTarget(null);
    setDeleteMatching(false);
  };

  const deleteSelectedPrice = async () => {
    if (!deleteTarget) return;

    const id = getPriceRowId(deleteTarget);
    if (!deleteMatching && id == null) return;

    setIsDeleting(true);
    const city = sanitizeCityName(deleteTarget.city);
    const item = getPriceRowItem(deleteTarget);
    const tradeType = getPriceRowTradeType(deleteTarget);

    const result = await run(
      () =>
        deleteMatching
          ? api.deletePriceHistoryMatches({ city, item, tradeType })
          : api.deletePriceHistoryEntry(id),
      'Could not delete price history'
    );

    setIsDeleting(false);

    if (result !== null) {
      setDeleteTarget(null);
      setDeleteMatching(false);
      await refreshPrices();
    }
  };

  const columns = [
    {
      key: 'city',
      label: 'City',
      sortable: true,
      render: (row) => sanitizeCityName(row.city)
    },
    {
      key: 'itemName',
      label: 'Item',
      sortable: true
    },
    {
      key: 'tradeGoodType',
      label: 'Type',
      sortable: true
    },
    {
      key: 'tradeType',
      label: 'Trade',
      sortable: true,
      render: (row) => (
        <Badge
          tone={
            row.tradeType === 'Buy'
              ? 'success'
              : row.tradeType === 'Sell'
                ? 'info'
                : 'muted'
          }
        >
          {row.tradeType}
        </Badge>
      )
    },
    {
      key: 'price',
      label: 'Price',
      sortable: true
    },
    {
      key: 'multiplier',
      label: 'Multiplier',
      sortable: true,
      render: (row) => (row.multiplier == null ? 'Missing' : `${Number(row.multiplier).toFixed(0)}%`)
    },
    {
      key: 'capturedAtUtc',
      label: 'Captured',
      sortable: true,
      render: (row) => formatDate(row.capturedAtUtc)
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <Button
          variant="danger"
          className="compact-action price-delete-button"
          onClick={() => openDeleteConfirm(row)}
          title="Delete this price history entry"
          aria-label={`Delete ${getPriceRowItem(row)} price history entry`}
        >
          <Trash2 size={16} /> Delete
        </Button>
      )
    }
  ];

  const deleteTargetId = getPriceRowId(deleteTarget);
  const deleteTargetCity = sanitizeCityName(deleteTarget?.city);
  const deleteTargetItem = getPriceRowItem(deleteTarget);
  const deleteTargetTradeType = getPriceRowTradeType(deleteTarget);
  const canConfirmDelete = Boolean(deleteTarget) && (deleteMatching || deleteTargetId != null);

  return (
    <Card>
      <div className="card-body">
        <div className="tab-header">
          <div>
            <h2>
              <ShoppingCart size={24} /> Buy / Sell Price History
            </h2>
            <p className="muted">Click any column header to sort.</p>
          </div>

          <div className="button-row">
            <input
              className="input"
              placeholder="Search city or item..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            <Button variant="secondary" onClick={refreshPrices}>
              <RefreshCw size={16} /> Refresh
            </Button>
          </div>
        </div>

        <div className="price-history-summary">
          <span>
            Showing {rows.length} of {cappedRows.length} latest city + trade-good records
            {hasSearch ? ` matching "${query.trim()}"` : ''}.
          </span>
          {matchingRows.length > PRICE_HISTORY_MAX_VISIBLE && (
            <span>Limited to newest {PRICE_HISTORY_MAX_VISIBLE} matches.</span>
          )}
        </div>

        <SortableTable
          columns={columns}
          rows={rows}
          emptyMessage="No price history yet."
          initialSortKey="capturedAtUtc"
          initialDirection="desc"
        />

        {canLoadMore && (
          <div className="price-history-load-more">
            <Button variant="secondary" onClick={loadMoreRows}>
              Load 20 more
            </Button>
            <span className="muted">{hiddenCount} more available</span>
          </div>
        )}

        {deleteTarget && (
          <div className="modal-backdrop" role="presentation">
            <div
              className="confirm-dialog price-delete-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-price-title"
            >
              <div>
                <h3 id="delete-price-title">
                  <Trash2 size={20} /> Delete price entry?
                </h3>
                <p className="muted">
                  Remove bad OCR data from Buy / Sell Price History.
                </p>
              </div>

              <dl className="delete-price-details">
                <div>
                  <dt>City</dt>
                  <dd>{deleteTargetCity || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Item</dt>
                  <dd>{deleteTargetItem || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Trade</dt>
                  <dd>{deleteTargetTradeType || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Price</dt>
                  <dd>{deleteTarget.price || 'No price'}</dd>
                </div>
                <div>
                  <dt>Captured</dt>
                  <dd>{formatDate(deleteTarget.capturedAtUtc) || 'Unknown'}</dd>
                </div>
              </dl>

              {deleteTargetId == null && !deleteMatching && (
                <div className="danger-info mini-info">
                  This row has no stable id, so single-row delete is unavailable. Choose matching delete to remove city + item + Buy/Sell records.
                </div>
              )}

              <label className="inline-checkbox delete-matching-checkbox">
                <input
                  type="checkbox"
                  checked={deleteMatching}
                  onChange={(event) => setDeleteMatching(event.target.checked)}
                  disabled={isDeleting}
                />
                <span>Delete all matching records for this city, item, and Buy/Sell type</span>
              </label>

              <div className="deal-actions price-delete-actions">
                <Button variant="secondary" onClick={closeDeleteConfirm} disabled={isDeleting}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={deleteSelectedPrice}
                  disabled={isDeleting || !canConfirmDelete}
                >
                  <Trash2 size={16} />
                  {isDeleting ? 'Deleting...' : deleteMatching ? 'Delete matching' : 'Delete entry'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function SettingsTab({
  settings,
  saveSetting,
  setSettings,
  run,
  refreshPrices,
  refreshCatalogs,
  cities
}) {
  const [settingsSubtab, setSettingsSubtab] = useState('general');

  const saveMapSetting = async (key, value) => {
    setSettings((current) => ({
      ...current,
      [key]: value
    }));

    await saveSetting({
      key,
      value: String(value)
    });
  };

  return (
    <div className="stack">
      <Card className="dark-panel">
        <div className="card-body">
          <div className="tab-header">
            <div>
              <h2>
                <Settings size={24} /> OCR + Map Settings
              </h2>
              <p>OCR zones are saved relative to the selected game window after setup.</p>
            </div>

            <Button
              variant="secondary"
              onClick={() => {
                window.open('/?calibration=1', '_blank', 'noopener,noreferrer');
              }}
            >
              <Crosshair size={16} /> Open OCR calibration overlay
            </Button>
          </div>
        </div>
      </Card>

      <div className="settings-subtabs">
        <button
          type="button"
          className={settingsSubtab === 'general' ? 'active' : ''}
          onClick={() => setSettingsSubtab('general')}
        >
          <Settings size={16} /> General
        </button>
        <button
          type="button"
          className={settingsSubtab === 'coordinate-ocr' ? 'active' : ''}
          onClick={() => setSettingsSubtab('coordinate-ocr')}
        >
          <Crosshair size={16} /> Coordinate OCR
        </button>
        <button
          type="button"
          className={settingsSubtab === 'buy-sell-ocr' ? 'active' : ''}
          onClick={() => setSettingsSubtab('buy-sell-ocr')}
        >
          <ShoppingCart size={16} /> Buy/Sell OCR
        </button>
      </div>

      {settingsSubtab === 'coordinate-ocr' && (
        <Card>
          <div className="card-body">
            <CoordinateOcrSettingsPanel run={run} />
          </div>
        </Card>
      )}

      {settingsSubtab === 'buy-sell-ocr' && (
        <Card>
          <div className="card-body">
            <PriceTradeTypeTemplateSettingsPanel run={run} />
          </div>
        </Card>
      )}

      {settingsSubtab === 'general' && (
        <>
      <Card>
        <div className="card-body">
          <GameWindowPanel run={run} />
        </div>
      </Card>

      <DataSharingPanel
        run={run}
        refreshPrices={refreshPrices}
        refreshCatalogs={refreshCatalogs}
      />

      <MapEditorPanel
        cities={cities}
        run={run}
        refreshCatalogs={refreshCatalogs}
      />

      <div className="settings-grid">
        <Card>
          <div className="card-body">
            <h3>
              <SlidersHorizontal size={20} /> Fine tune map
            </h3>

            <Field label="World width / X wrap limit">
              <input
                className="input"
                type="number"
                value={settings.worldWidth}
                onChange={(event) =>
                  saveMapSetting('worldWidth', Number(event.target.value || DEFAULT_WORLD_WIDTH))
                }
              />
            </Field>

            <Field label="World height / Y max">
              <input
                className="input"
                type="number"
                value={settings.worldHeight}
                onChange={(event) =>
                  saveMapSetting('worldHeight', Number(event.target.value || DEFAULT_WORLD_HEIGHT))
                }
              />
            </Field>

            <Field label="Visual X=0 offset">
              <input
                className="input"
                type="number"
                value={settings.xZeroOffset}
                onChange={(event) =>
                  saveMapSetting('xZeroOffset', Number(event.target.value || DEFAULT_X_ZERO_OFFSET))
                }
              />
            </Field>

            <Field label="Waypoint offset X">
              <input
                className="input"
                type="number"
                value={settings.waypointOffsetX}
                onChange={(event) =>
                  saveMapSetting('waypointOffsetX', Number(event.target.value || 0))
                }
              />
            </Field>

            <Field label="Waypoint offset Y">
              <input
                className="input"
                type="number"
                value={settings.waypointOffsetY}
                onChange={(event) =>
                  saveMapSetting('waypointOffsetY', Number(event.target.value || 0))
                }
              />
            </Field>

            <Field
              label="Direction slope points"
              hint="More points = smoother direction but slower to react. Fewer points = faster reaction but more jitter."
            >
              <input
                className="input"
                type="number"
                min="3"
                max="25"
                value={settings.mapSlopePointCount}
                onChange={(event) =>
                  saveMapSetting('mapSlopePointCount', clampMapSlopePointCount(event.target.value))
                }
              />
            </Field>

            <Field
              label="Direction OCR cleanup"
              hint="Removes bad one-point coordinate spikes before calculating slope direction."
            >
              <select
                className="input"
                value={settings.mapSlopeOutlierFilter}
                onChange={(event) =>
                  saveMapSetting(
                    'mapSlopeOutlierFilter',
                    normalizeMapSlopeOutlierFilter(event.target.value)
                  )
                }
              >
                <option value="off">Off</option>
                <option value="balanced">Balanced</option>
                <option value="strict">Strict</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card>
          <div className="card-body">
            <h3>
              <RefreshCw size={20} /> OCR timing
            </h3>

            <Field label="Coordinate / main OCR interval">
              <input
                className="input"
                type="number"
                min="1"
                value={settings.ocrInterval}
                onChange={(event) =>
                  saveMapSetting('ocrInterval', Number(event.target.value || DEFAULT_OCR_INTERVAL))
                }
              />
            </Field>

            <Field label="City OCR interval">
              <input
                className="input"
                type="number"
                min="1"
                value={settings.cityInterval}
                onChange={(event) =>
                  saveMapSetting('cityInterval', Number(event.target.value || DEFAULT_CITY_INTERVAL))
                }
              />
            </Field>
          </div>
        </Card>
      </div>
        </>
      )}

    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('map');
  const [backendStatus, setBackendStatus] = useState(null);
  const [gameWindowStatus, setGameWindowStatus] = useState(null);
  const [ocrStatus, setOcrStatus] = useState(null);
  const [latestCity, setLatestCity] = useState(null);
  const [coordinates, setCoordinates] = useState([]);
  const [prices, setPrices] = useState([]);
  const [cities, setCities] = useState([]);
  const [tradeGoods, setTradeGoods] = useState([]);
  const [error, setError] = useState('');
  const [coordinateStreamStatus, setCoordinateStreamStatus] = useState('connecting');
  const coordinateStreamConnectedRef = useRef(false);
  const coordinateFallbackRefreshStartedRef = useRef(false);
  const lastCoordinateUpdateAtRef = useRef(0);

  const [settings, setSettings] = useState({
    worldWidth: DEFAULT_WORLD_WIDTH,
    worldHeight: DEFAULT_WORLD_HEIGHT,
    xZeroOffset: DEFAULT_X_ZERO_OFFSET,
    waypointOffsetX: DEFAULT_WAYPOINT_OFFSET_X,
    waypointOffsetY: DEFAULT_WAYPOINT_OFFSET_Y,
    ocrInterval: DEFAULT_OCR_INTERVAL,
    cityInterval: DEFAULT_CITY_INTERVAL,
    mapSlopePointCount: DEFAULT_MAP_SLOPE_POINT_COUNT,
    mapSlopeOutlierFilter: DEFAULT_MAP_SLOPE_OUTLIER_FILTER
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

    try {
      const gameWindow = await api.getGameWindow();
      setGameWindowStatus(gameWindow || null);
    } catch {
      setGameWindowStatus(null);
    }

    const status = await run(() => api.getOcrStatus(), 'Could not load OCR status');
    if (status) setOcrStatus(status);

    const city = await run(() => api.getLatestCity(), 'Could not load latest city');
    if (city) setLatestCity(city);
  }, [run]);

  const refreshCoordinates = useCallback(async () => {
    const data = await run(
      () => api.getLatestCoordinates({ take: COORDINATE_STREAM_HISTORY }),
      'Could not load coordinates'
    );

    const rows = getCoordinatePayloadRows(data);

    if (rows.length) {
      lastCoordinateUpdateAtRef.current = Date.now();
      setCoordinates((current) =>
        appendCoordinateRows(current, rows, MAX_REALTIME_COORDINATES)
      );
    }
  }, [run]);
  useEffect(() => {
    let source = null;
    let closed = false;

    coordinateStreamConnectedRef.current = false;
    coordinateFallbackRefreshStartedRef.current = false;
    setCoordinateStreamStatus('connecting');

    const startFallbackPolling = () => {
      if (closed) return;

      coordinateStreamConnectedRef.current = false;
      setCoordinateStreamStatus('fallback polling');

      if (!coordinateFallbackRefreshStartedRef.current) {
        coordinateFallbackRefreshStartedRef.current = true;
        refreshCoordinates();
      }
    };

    const openCoordinateStream = async () => {
      const nextSource = await api.streamCoordinates({
        history: COORDINATE_STREAM_HISTORY,
        onOpen: () => {
          if (closed) return;

          coordinateStreamConnectedRef.current = true;
          coordinateFallbackRefreshStartedRef.current = false;
          setCoordinateStreamStatus('connected');
        },
        onError: startFallbackPolling,
        onCoordinate: (point) => {
          if (closed) return;

          lastCoordinateUpdateAtRef.current = Date.now();
          setCoordinates((current) =>
            appendCoordinateRows(current, point, MAX_REALTIME_COORDINATES)
          );
        }
      });

      if (closed) {
        nextSource?.close();
        return;
      }

      source = nextSource;

      if (!source) {
        startFallbackPolling();
      }
    };

    openCoordinateStream();

    return () => {
      closed = true;
      coordinateStreamConnectedRef.current = false;
      source?.close();
    };
  }, [refreshCoordinates]);

  const refreshPrices = useCallback(async () => {
    const data = await run(
      async () => {
        try {
          return await api.getLatestCityGoods({ take: 50000 });
        } catch {
          // Allows the frontend to still run if the backend has not been updated yet.
          return api.getPriceHistory({ take: 2000 });
        }
      },
      'Could not load latest city goods'
    );

    if (data) setPrices(data);
  }, [run]);

  const refreshSettings = useCallback(async () => {
    const data = await run(() => api.getSettings(), 'Could not load settings');

    if (data?.settings) {
      setSettings((current) => ({
        ...current,
        worldWidth: Number(data.settings.worldWidth ?? current.worldWidth),
        worldHeight: Number(data.settings.worldHeight ?? current.worldHeight),
        xZeroOffset: Number(data.settings.xZeroOffset ?? current.xZeroOffset),
        waypointOffsetX: Number(data.settings.waypointOffsetX ?? current.waypointOffsetX),
        waypointOffsetY: Number(data.settings.waypointOffsetY ?? current.waypointOffsetY),
        ocrInterval: Number(data.settings.ocrInterval ?? current.ocrInterval),
        cityInterval: Number(data.settings.cityInterval ?? current.cityInterval),
        mapSlopePointCount: clampMapSlopePointCount(
          data.settings.mapSlopePointCount ?? current.mapSlopePointCount
        ),
        mapSlopeOutlierFilter: normalizeMapSlopeOutlierFilter(
          data.settings.mapSlopeOutlierFilter ?? current.mapSlopeOutlierFilter
        )
      }));
    }
  }, [run]);

  const refreshCatalogs = useCallback(async () => {
    const loadedCities = await run(() => api.getCities(), 'Could not load cities');
    if (loadedCities) setCities(loadedCities);

    const loadedGoods = await run(() => api.getTradeGoods(), 'Could not load trade goods');
    if (loadedGoods) setTradeGoods(loadedGoods);
  }, [run]);

  const refreshAll = useCallback(
    async () =>
      Promise.all([
        refreshStatus(),
        refreshCoordinates(),
        refreshPrices(),
        refreshSettings(),
        refreshCatalogs()
      ]),
    [refreshStatus, refreshCoordinates, refreshPrices, refreshSettings, refreshCatalogs]
  );

  useEffect(() => {
    refreshAll();

    let lastPriceRefreshAt = 0;

    const timer = setInterval(() => {
      refreshStatus();
      refreshCoordinates();

      const now = Date.now();
      if (now - lastPriceRefreshAt >= PRICE_REFRESH_INTERVAL_MS) {
        lastPriceRefreshAt = now;
        refreshPrices();
      }
    }, Math.max(1, settings.ocrInterval) * 1000);

    return () => clearInterval(timer);
  }, [refreshAll, refreshStatus, refreshCoordinates, refreshPrices, settings.ocrInterval]);

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
          <p>
            Window-relative OCR zones, OCR quick control, split trading tabs, price sharing,
            editable map cities, custom regions, and route recommendations.
          </p>
        </div>

        <Badge tone="info">React + C# Backend</Badge>
      </header>

      <StatusBar
        backendStatus={backendStatus}
        gameWindowStatus={gameWindowStatus}
        ocrStatus={ocrStatus}
        latestCity={latestCity}
        error={error}
        onRefresh={refreshAll}
        startOcr={startOcr}
        stopOcr={stopOcr}
        refreshStatus={refreshStatus}
      />

      <nav className="tabs">
        <button
          className={activeTab === 'map' ? 'active' : ''}
          onClick={() => setActiveTab('map')}
        >
          <Map size={17} /> Coordinate Map
        </button>

        <button
          className={activeTab === 'prices' ? 'active' : ''}
          onClick={() => setActiveTab('prices')}
        >
          <ShoppingCart size={17} /> Buy / Sell Prices
        </button>

        <button
          className={activeTab === 'trading' ? 'active' : ''}
          onClick={() => setActiveTab('trading')}
        >
          <TrendingUp size={17} /> Trading Options
        </button>

        <button
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={17} /> Settings
        </button>
      </nav>

      <main>
        {activeTab === 'map' && (
          <WrappedCoordinateMap
            coordinates={coordinates}
            coordinateStreamStatus={coordinateStreamStatus}
            cities={cities}
            prices={prices}
            ocrStatus={ocrStatus}
            latestCity={latestCity}
            worldWidth={settings.worldWidth}
            worldHeight={settings.worldHeight}
            xZeroOffset={settings.xZeroOffset}
            waypointOffsetX={settings.waypointOffsetX}
            waypointOffsetY={settings.waypointOffsetY}
            mapSlopePointCount={settings.mapSlopePointCount}
            mapSlopeOutlierFilter={settings.mapSlopeOutlierFilter}
            refreshCoordinates={refreshCoordinates}
          />
        )}

        {activeTab === 'prices' && (
          <PricesTab
            prices={prices}
            refreshPrices={refreshPrices}
            run={run}
          />
        )}

        {activeTab === 'trading' && (
          <TradingTab
            cities={cities}
            tradeGoods={tradeGoods}
            latestCity={latestCity}
            run={run}
            api={api}
            refreshCatalogs={refreshCatalogs}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            setSettings={setSettings}
            saveSetting={saveSetting}
            run={run}
            refreshPrices={refreshPrices}
            refreshCatalogs={refreshCatalogs}
            cities={cities}
          />
        )}
      </main>
    </div>
  );
}
