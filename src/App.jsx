import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Crosshair,
  Map,
  MousePointer2,
  RefreshCw,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp
} from 'lucide-react';
import { api } from './api';
import GameWindowPanel from './components/GameWindowPanel.jsx';
import OcrQuickControls from './components/OcrQuickControls.jsx';
import TradingTab from './components/TradingTab.jsx';
import SortableTable from './components/SortableTable.jsx';
import WrappedCoordinateMap from './components/WrappedCoordinateMap.jsx';
import DataSharingPanel from './components/DataSharingPanel.jsx';
import MapEditorPanel from './components/MapEditorPanel.jsx';

const DEFAULT_WORLD_WIDTH = 16384;
const DEFAULT_WORLD_HEIGHT = 8192;
const DEFAULT_X_ZERO_OFFSET = 0;
const DEFAULT_WAYPOINT_OFFSET_X = 0;
const DEFAULT_WAYPOINT_OFFSET_Y = 0;
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
  let normalized = Number(value || 0) % width;
  if (normalized < 0) normalized += width;
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

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
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
  ocrStatus,
  latestCity,
  error,
  onRefresh,
  startOcr,
  stopOcr,
  refreshStatus
}) {
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

function PricesTab({ prices, refreshPrices }) {
  const [query, setQuery] = useState('');

  const rows = prices.filter((row) =>
    `${sanitizeCityName(row.city)} ${row.itemName || row.item} ${row.tradeType || row.type}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

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
    }
  ];

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

        <SortableTable
          columns={columns}
          rows={rows}
          emptyMessage="No price history yet."
          initialSortKey="capturedAtUtc"
          initialDirection="desc"
        />
      </div>
    </Card>
  );
}

function OcrZoneCard({ title, name, description, zone, onSave }) {
  const [local, setLocal] = useState(
    zone || {
      name,
      topLeftX: 0,
      topLeftY: 0,
      bottomRightX: 0,
      bottomRightY: 0
    }
  );

  const [captureStatus, setCaptureStatus] = useState('Manual values');

  useEffect(() => {
    setLocal(
      zone || {
        name,
        topLeftX: 0,
        topLeftY: 0,
        bottomRightX: 0,
        bottomRightY: 0
      }
    );
  }, [zone, name]);

  const update = (key, value) => {
    setLocal((current) => ({
      ...current,
      [key]: Number(value)
    }));
  };

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

      await new Promise((resolve) => setTimeout(resolve, 650));

      await waitWithCountdown('Move mouse to BOTTOM RIGHT.');
      const bottomRight = await api.getMousePosition();

      const updatedZone = {
        ...local,
        name,
        topLeftX: topLeft.x,
        topLeftY: topLeft.y,
        bottomRightX: bottomRight.x,
        bottomRightY: bottomRight.y
      };

      setLocal(updatedZone);
      setCaptureStatus('Capture complete. Saving relative to selected game window if found...');

      await onSave(updatedZone);

      setCaptureStatus(
        `Saved. Top left: ${topLeft.x},${topLeft.y}. Bottom right: ${bottomRight.x},${bottomRight.y}.`
      );
    } catch (err) {
      setCaptureStatus(`Capture failed: ${err?.message || 'Unknown error'}`);
    }
  };

  return (
    <Card>
      <div className="card-body">
        <h3>
          <Crosshair size={20} /> {title}
        </h3>

        <p className="muted">{description}</p>

        <div className="zone-grid">
          <Field label="Top left X">
            <input
              className="input"
              type="number"
              value={local.topLeftX}
              onChange={(event) => update('topLeftX', event.target.value)}
            />
          </Field>

          <Field label="Top left Y">
            <input
              className="input"
              type="number"
              value={local.topLeftY}
              onChange={(event) => update('topLeftY', event.target.value)}
            />
          </Field>

          <Field label="Bottom right X">
            <input
              className="input"
              type="number"
              value={local.bottomRightX}
              onChange={(event) => update('bottomRightX', event.target.value)}
            />
          </Field>

          <Field label="Bottom right Y">
            <input
              className="input"
              type="number"
              value={local.bottomRightY}
              onChange={(event) => update('bottomRightY', event.target.value)}
            />
          </Field>
        </div>

        <p className="mini-info">{captureStatus}</p>

        <div className="button-row">
          <Button variant="secondary" onClick={captureFlow}>
            <MousePointer2 size={16} /> 5 sec capture flow
          </Button>

          <Button onClick={() => onSave(local)}>
            Save zone
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SettingsTab({
  settings,
  zones,
  saveZone,
  saveSetting,
  setSettings,
  run,
  refreshPrices,
  refreshCatalogs,
  cities
}) {
  const getZone = (name) => zones.find((zone) => zone.name === name);

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
          <h2>
            <Settings size={24} /> OCR + Map Settings
          </h2>
          <p>OCR zones are saved relative to the selected game window after setup.</p>
        </div>
      </Card>

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

      <div className="zone-cards">
        <OcrZoneCard
          title="Coordinate OCR zone"
          name={zoneNames.coordinate}
          description="One-time setup. Backend stores this zone relative to the selected game window."
          zone={getZone(zoneNames.coordinate)}
          onSave={saveZone}
        />

        <OcrZoneCard
          title="City OCR zone"
          name={zoneNames.city}
          description="One-time setup. Backend follows the game window after this is saved."
          zone={getZone(zoneNames.city)}
          onSave={saveZone}
        />

        <OcrZoneCard
          title="Item price OCR zone"
          name={zoneNames.price}
          description="One-time setup for the trade-good/price area."
          zone={getZone(zoneNames.price)}
          onSave={saveZone}
        />
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
  const [zones, setZones] = useState([]);
  const [cities, setCities] = useState([]);
  const [tradeGoods, setTradeGoods] = useState([]);
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
    const data = await run(
      () => api.getLatestCoordinates({ take: 20 }),
      'Could not load coordinates'
    );

    if (data) setCoordinates(data);
  }, [run]);

  const refreshPrices = useCallback(async () => {
    const data = await run(
      () => api.getPriceHistory({ take: 500 }),
      'Could not load prices'
    );

    if (data) setPrices(data);
  }, [run]);

  const refreshSettings = useCallback(async () => {
    const data = await run(() => api.getSettings(), 'Could not load settings');

    if (data?.zones) {
      setZones(data.zones);
    }

    if (data?.settings) {
      setSettings((current) => ({
        ...current,
        worldWidth: Number(data.settings.worldWidth ?? current.worldWidth),
        worldHeight: Number(data.settings.worldHeight ?? current.worldHeight),
        xZeroOffset: Number(data.settings.xZeroOffset ?? current.xZeroOffset),
        waypointOffsetX: Number(data.settings.waypointOffsetX ?? current.waypointOffsetX),
        waypointOffsetY: Number(data.settings.waypointOffsetY ?? current.waypointOffsetY),
        ocrInterval: Number(data.settings.ocrInterval ?? current.ocrInterval),
        cityInterval: Number(data.settings.cityInterval ?? current.cityInterval)
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

    const timer = setInterval(() => {
      refreshStatus();
      refreshCoordinates();
      refreshPrices();
    }, Math.max(1, settings.ocrInterval) * 1000);

    return () => clearInterval(timer);
  }, [refreshAll, refreshStatus, refreshCoordinates, refreshPrices, settings.ocrInterval]);

  const saveZone = async (zone) => {
    const saved = await run(() => api.saveOcrZone(zone), 'Could not save OCR zone');

    if (saved) {
      await refreshSettings();
    }
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
          <p>
            Window-relative OCR zones, OCR quick control, split trading tabs, price sharing,
            editable map cities, custom regions, and route recommendations.
          </p>
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
            cities={cities}
            prices={prices}
            ocrStatus={ocrStatus}
            latestCity={latestCity}
            worldWidth={settings.worldWidth}
            worldHeight={settings.worldHeight}
            xZeroOffset={settings.xZeroOffset}
            waypointOffsetX={settings.waypointOffsetX}
            waypointOffsetY={settings.waypointOffsetY}
            refreshCoordinates={refreshCoordinates}
          />
        )}

        {activeTab === 'prices' && (
          <PricesTab
            prices={prices}
            refreshPrices={refreshPrices}
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
            zones={zones}
            saveZone={saveZone}
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