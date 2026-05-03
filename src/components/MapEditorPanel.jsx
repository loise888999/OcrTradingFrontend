import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  MapPinned,
  MousePointerClick,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { api } from '../api';

const MAP_IMAGE_URL = '/maps/world-map.png';
const MAP_PIXEL_WIDTH = 4096;
const MAP_PIXEL_HEIGHT = 2049;
const WORLD_SCALE = 4;

const MIN_VIEW_WIDTH = 180;
const MAX_VIEW_WIDTH = MAP_PIXEL_WIDTH;
const ZOOM_STEP = 1.25;
const LABEL_ZOOM_THRESHOLD = 2.4;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeMapX(value) {
  let normalized = Number(value || 0) % MAP_PIXEL_WIDTH;
  if (normalized < 0) normalized += MAP_PIXEL_WIDTH;
  return normalized;
}

function nearestWrappedX(x, referenceX) {
  const normalized = normalizeMapX(x);
  const copy = Math.round((referenceX - normalized) / MAP_PIXEL_WIDTH);
  return normalized + copy * MAP_PIXEL_WIDTH;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function parseAliases(value) {
  return String(value || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function aliasesToText(value) {
  return Array.isArray(value) ? value.join('|') : '';
}

function mapToWorld(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(normalizeMapX(number) * WORLD_SCALE) : '';
}

function emptyCityForm() {
  return {
    originalName: '',
    name: '',
    aliases: '',
    mainRegion: 'Unassigned',
    subRegion: 'Unassigned',
    seaTradeRegion: 'Unassigned',
    mapPixelX: '',
    mapPixelY: '',
    worldX: '',
    worldY: ''
  };
}

function cityToForm(city) {
  if (!city) return emptyCityForm();

  const mapPixelX = city.mapPixelX ?? city.MapPixelX ?? '';
  const mapPixelY = city.mapPixelY ?? city.MapPixelY ?? '';

  return {
    originalName: city.name || city.Name || '',
    name: city.name || city.Name || '',
    aliases: aliasesToText(city.aliases || city.Aliases),
    mainRegion: city.mainRegion || city.MainRegion || 'Unassigned',
    subRegion: city.subRegion || city.SubRegion || 'Unassigned',
    seaTradeRegion: city.seaTradeRegion || city.SeaTradeRegion || 'Unassigned',
    mapPixelX,
    mapPixelY,
    worldX: city.worldX ?? city.WorldX ?? (mapPixelX === '' ? '' : mapToWorld(mapPixelX)),
    worldY: city.worldY ?? city.WorldY ?? (mapPixelY === '' ? '' : mapToWorld(mapPixelY))
  };
}

function emptyRegionForm() {
  return {
    id: '',
    name: '',
    type: 'Custom',
    parentRegion: '',
    color: '#60a5fa',
    enabled: true,
    points: []
  };
}

function regionToForm(region) {
  if (!region) return emptyRegionForm();

  return {
    id: region.id || region.Id || '',
    name: region.name || region.Name || '',
    type: region.type || region.Type || 'Custom',
    parentRegion: region.parentRegion || region.ParentRegion || '',
    color: region.color || region.Color || '#60a5fa',
    enabled: region.enabled ?? region.Enabled ?? true,
    points: region.points || region.Points || []
  };
}

function getCityCoord(city) {
  const x = Number(city.mapPixelX ?? city.MapPixelX);
  const y = Number(city.mapPixelY ?? city.MapPixelY);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return {
    x: normalizeMapX(x),
    y
  };
}

function cityHasCoord(city) {
  return getCityCoord(city) !== null;
}

function buildCityPayload(form) {
  const rawMapPixelX = form.mapPixelX === '' ? null : Number(form.mapPixelX);
  const mapPixelX = Number.isFinite(rawMapPixelX) ? Math.round(normalizeMapX(rawMapPixelX)) : null;

  const rawMapPixelY = form.mapPixelY === '' ? null : Number(form.mapPixelY);
  const mapPixelY = Number.isFinite(rawMapPixelY)
    ? Math.round(clamp(rawMapPixelY, 0, MAP_PIXEL_HEIGHT))
    : null;

  return {
    name: form.name.trim(),
    aliases: parseAliases(form.aliases),
    mainRegion: form.mainRegion.trim() || 'Unassigned',
    subRegion: form.subRegion.trim() || 'Unassigned',
    seaTradeRegion: form.seaTradeRegion.trim() || 'Unassigned',
    mapPixelX,
    mapPixelY,
    worldX: mapPixelX == null ? null : Math.round(mapPixelX * WORLD_SCALE),
    worldY: mapPixelY == null ? null : Math.round(mapPixelY * WORLD_SCALE)
  };
}

function buildRegionPayload(form) {
  return {
    id: form.id || undefined,
    name: form.name.trim(),
    type: form.type,
    parentRegion: form.parentRegion.trim() || null,
    color: form.color || '#60a5fa',
    enabled: Boolean(form.enabled),
    points: form.points.map((point) => ({
      x: normalizeMapX(Number(point.x ?? point.X)),
      y: clamp(Number(point.y ?? point.Y), 0, MAP_PIXEL_HEIGHT)
    }))
  };
}

function normalizeApiResult(result) {
  return result?.message || result?.Message || 'Saved.';
}

function getRegionId(region) {
  return region.id || region.Id || '';
}

function getRegionName(region) {
  return region.name || region.Name || '';
}

function getRegionType(region) {
  return region.type || region.Type || 'Custom';
}

function buildOfficialRegionOptions(cities) {
  const main = new Map();
  const sub = new Map();
  const sea = new Map();

  for (const city of cities) {
    const mainRegion = city.mainRegion || city.MainRegion || '';
    const subRegion = city.subRegion || city.SubRegion || '';
    const seaTradeRegion = city.seaTradeRegion || city.SeaTradeRegion || '';

    if (mainRegion) {
      main.set(`MainRegion|${mainRegion}`, {
        type: 'MainRegion',
        name: mainRegion,
        parentRegion: ''
      });
    }

    if (subRegion) {
      sub.set(`SubRegion|${subRegion}|${mainRegion}`, {
        type: 'SubRegion',
        name: subRegion,
        parentRegion: mainRegion
      });
    }

    if (seaTradeRegion) {
      sea.set(`SeaTradeRegion|${seaTradeRegion}|${subRegion || mainRegion}`, {
        type: 'SeaTradeRegion',
        name: seaTradeRegion,
        parentRegion: subRegion || mainRegion
      });
    }
  }

  return [...main.values(), ...sub.values(), ...sea.values()].sort((a, b) =>
    `${a.type}-${a.name}`.localeCompare(`${b.type}-${b.name}`)
  );
}

function mapCopiesForView(viewBox) {
  const start = Math.floor((viewBox.x - MAP_PIXEL_WIDTH) / MAP_PIXEL_WIDTH) * MAP_PIXEL_WIDTH;
  const end = Math.ceil((viewBox.x + viewBox.width + MAP_PIXEL_WIDTH) / MAP_PIXEL_WIDTH) * MAP_PIXEL_WIDTH;

  const offsets = [];
  for (let offset = start; offset <= end; offset += MAP_PIXEL_WIDTH) {
    offsets.push(offset);
  }

  return offsets;
}

function MapClickHelp({ mode, zoomLevel }) {
  return (
    <p className="mini-info">
      {mode === 'city'
        ? 'City mode: select or create a city, then click the map to place or move it. Drag the map to pan and use mouse wheel to zoom.'
        : 'Region mode: click the map to add polygon points. Drag the map to pan. Regions can overlap and can be any shape.'}
      {' '}
      The map wraps horizontally, so you can keep moving left/right around the world. Current editor zoom: {zoomLevel.toFixed(1)}x.
    </p>
  );
}

export default function MapEditorPanel({ cities, run, refreshCatalogs }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const viewBoxRef = useRef(null);
  const [svgSize, setSvgSize] = useState({
    width: 1000,
    height: 500
  });

  const [mode, setMode] = useState('city');
  const [cityForm, setCityForm] = useState(emptyCityForm());
  const [citySearch, setCitySearch] = useState('');
  const [showUnplacedOnly, setShowUnplacedOnly] = useState(false);

  const [regions, setRegions] = useState([]);
  const [regionForm, setRegionForm] = useState(emptyRegionForm());

  const [viewBox, setViewBox] = useState({
    x: 0,
    y: 0,
    width: MAP_PIXEL_WIDTH,
    height: MAP_PIXEL_HEIGHT
  });

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  viewBoxRef.current = viewBox;

  const zoomLevel = MAP_PIXEL_WIDTH / viewBox.width;
  const showLabels = zoomLevel >= LABEL_ZOOM_THRESHOLD;
  const copyOffsets = useMemo(() => mapCopiesForView(viewBox), [viewBox]);

  const options = useMemo(() => {
    const cityMainRegions = cities.map((city) => city.mainRegion || city.MainRegion);
    const citySubRegions = cities.map((city) => city.subRegion || city.SubRegion);
    const citySeaTradeRegions = cities.map((city) => city.seaTradeRegion || city.SeaTradeRegion);

    return {
      cityNames: uniqueSorted(cities.map((city) => city.name || city.Name)),
      mainRegions: uniqueSorted([
        ...cityMainRegions,
        ...regions.filter((region) => getRegionType(region) === 'MainRegion').map(getRegionName)
      ]),
      subRegions: uniqueSorted([
        ...citySubRegions,
        ...regions.filter((region) => getRegionType(region) === 'SubRegion').map(getRegionName)
      ]),
      seaTradeRegions: uniqueSorted([
        ...citySeaTradeRegions,
        ...regions.filter((region) => getRegionType(region) === 'SeaTradeRegion').map(getRegionName)
      ])
    };
  }, [cities, regions]);

  const officialRegionOptions = useMemo(
    () => buildOfficialRegionOptions(cities),
    [cities]
  );

  const unplacedCities = useMemo(
    () => cities.filter((city) => !cityHasCoord(city)),
    [cities]
  );

  const placedCities = useMemo(
    () => cities.filter(cityHasCoord),
    [cities]
  );

  const visibleCities = useMemo(() => {
    const query = citySearch.trim().toLowerCase();
    const source = showUnplacedOnly ? unplacedCities : cities;

    return source.filter((city) => {
      if (!query) return true;

      const aliases = (city.aliases || city.Aliases || []).join(' ');
      return `${city.name || city.Name} ${aliases} ${city.mainRegion || city.MainRegion} ${city.subRegion || city.SubRegion} ${city.seaTradeRegion || city.SeaTradeRegion}`
        .toLowerCase()
        .includes(query);
    });
  }, [cities, citySearch, showUnplacedOnly, unplacedCities]);

  const visiblePlacedCities = useMemo(
    () => visibleCities.filter(cityHasCoord),
    [visibleCities]
  );

  const loadRegions = async () => {
    setError('');
    const data = await run(() => api.getMapRegions(), 'Could not load map regions');

    if (data) setRegions(data);
  };

  useEffect(() => {
    loadRegions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const updateSize = () => {
      const rect = svg.getBoundingClientRect();

      setSvgSize({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height)
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(svg);

    return () => observer.disconnect();
  }, []);

  const clampViewBox = (next) => {
    const width = clamp(next.width, MIN_VIEW_WIDTH, MAX_VIEW_WIDTH);
    const height = width * (MAP_PIXEL_HEIGHT / MAP_PIXEL_WIDTH);

    return {
      // Do not clamp X: the editor supports horizontal wraparound.
      x: next.x,
      y: clamp(next.y, 0, Math.max(0, MAP_PIXEL_HEIGHT - height)),
      width,
      height
    };
  };

  const screenToMapPoint = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;

    const matrix = svg.getScreenCTM();
    if (!matrix) return null;

    const transformed = point.matrixTransform(matrix.inverse());

    return {
      continuousX: transformed.x,
      x: Math.round(normalizeMapX(transformed.x)),
      y: Math.max(0, Math.min(MAP_PIXEL_HEIGHT, Math.round(transformed.y)))
    };
  };

  const zoomAt = (factor, clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const activeViewBox = viewBoxRef.current || viewBox;

    const point = screenToMapPoint(
      clientX ?? rect.left + rect.width / 2,
      clientY ?? rect.top + rect.height / 2
    );

    if (!point) return;

    const nextWidth = clamp(activeViewBox.width / factor, MIN_VIEW_WIDTH, MAX_VIEW_WIDTH);
    const nextHeight = nextWidth * (MAP_PIXEL_HEIGHT / MAP_PIXEL_WIDTH);

    const ratioX = (point.continuousX - activeViewBox.x) / activeViewBox.width;
    const ratioY = (point.y - activeViewBox.y) / activeViewBox.height;

    setViewBox(
      clampViewBox({
        x: point.continuousX - ratioX * nextWidth,
        y: point.y - ratioY * nextHeight,
        width: nextWidth,
        height: nextHeight
      })
    );
  };

  const resetZoom = () => {
    setViewBox({
      x: 0,
      y: 0,
      width: MAP_PIXEL_WIDTH,
      height: MAP_PIXEL_HEIGHT
    });
  };

  const centerOnPoint = (x, y, targetWidth = 700) => {
    const width = clamp(targetWidth, MIN_VIEW_WIDTH, MAX_VIEW_WIDTH);
    const height = width * (MAP_PIXEL_HEIGHT / MAP_PIXEL_WIDTH);
    const currentCenterX = viewBox.x + viewBox.width / 2;
    const centeredX = nearestWrappedX(x, currentCenterX);

    setViewBox(
      clampViewBox({
        x: Number(centeredX) - width / 2,
        y: Number(y) - height / 2,
        width,
        height
      })
    );
  };

  const centerOnSelectedCity = () => {
    if (cityForm.mapPixelX === '' || cityForm.mapPixelY === '') return;
    centerOnPoint(cityForm.mapPixelX, cityForm.mapPixelY);
  };

  const handleWheel = (event) => {
    event.preventDefault();
    event.stopPropagation();
    zoomAt(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, event.clientX, event.clientY);
  };

  // Native wheel listener is used so preventDefault always works and the whole page does not scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    svg.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      svg.removeEventListener('wheel', handleWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewBox]);

  const onMapMouseDown = (event) => {
    if (event.button !== 0) return;

    event.preventDefault();

    dragRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewBox: viewBox,
      moved: false
    };
  };

  const onMapMouseMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;

    const dxPixels = event.clientX - drag.startClientX;
    const dyPixels = event.clientY - drag.startClientY;

    if (Math.hypot(dxPixels, dyPixels) > 4) {
      drag.moved = true;
    }

    if (!drag.moved) return;

    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();

    const dxMap = (dxPixels / rect.width) * drag.startViewBox.width;
    const dyMap = (dyPixels / rect.height) * drag.startViewBox.height;

    setViewBox(
      clampViewBox({
        ...drag.startViewBox,
        x: drag.startViewBox.x - dxMap,
        y: drag.startViewBox.y - dyMap
      })
    );
  };

  const onMapMouseUp = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;

    if (drag?.moved) return;

    const targetTag = String(event.target?.tagName || '').toLowerCase();
    if (targetTag === 'circle' || targetTag === 'text') return;

    const point = screenToMapPoint(event.clientX, event.clientY);
    if (!point) return;

    setMessage('');
    setError('');

    if (mode === 'city') {
      setCityForm((current) => ({
        ...current,
        mapPixelX: point.x,
        mapPixelY: point.y,
        worldX: point.x * WORLD_SCALE,
        worldY: point.y * WORLD_SCALE
      }));

      return;
    }

    setRegionForm((current) => ({
      ...current,
      points: [...current.points, { x: point.x, y: point.y }]
    }));
  };

  const onMapMouseLeave = () => {
    dragRef.current = null;
  };

  const selectCity = (cityName) => {
    const city = cities.find((item) =>
      String(item.name || item.Name || '').toLowerCase() === String(cityName).toLowerCase()
    );

    if (!city) {
      setCityForm((current) => ({
        ...current,
        originalName: '',
        name: cityName
      }));
      return;
    }

    const form = cityToForm(city);
    setCityForm(form);

    if (form.mapPixelX !== '' && form.mapPixelY !== '') {
      centerOnPoint(form.mapPixelX, form.mapPixelY, Math.min(viewBox.width, 900));
    }
  };

  const saveCity = async () => {
    setMessage('');
    setError('');

    const payload = buildCityPayload(cityForm);

    if (!payload.name) {
      setError('City name is required.');
      return;
    }

    const result = cityForm.originalName
      ? await run(() => api.updateCity(cityForm.originalName, payload), 'Could not update city')
      : await run(() => api.addCity(payload), 'Could not add city');

    if (result) {
      setMessage(normalizeApiResult(result));
      setCityForm((current) => ({ ...current, originalName: payload.name }));

      if (refreshCatalogs) await refreshCatalogs();
    }
  };

  const deleteCity = async () => {
    setMessage('');
    setError('');

    if (!cityForm.originalName) {
      setError('Select an existing city first.');
      return;
    }

    const result = await run(() => api.deleteCity(cityForm.originalName), 'Could not delete city');

    if (result) {
      setMessage(normalizeApiResult(result));
      setCityForm(emptyCityForm());

      if (refreshCatalogs) await refreshCatalogs();
    }
  };

  const selectRegion = (regionId) => {
    const region = regions.find((item) =>
      String(getRegionId(item)).toLowerCase() === String(regionId).toLowerCase()
    );

    setRegionForm(regionToForm(region));
  };

  const selectOfficialRegion = (value) => {
    if (!value) return;

    const [type, name, parentRegion = ''] = value.split('|');

    const existingRegion = regions.find(
      (region) =>
        String(getRegionType(region)).toLowerCase() === String(type).toLowerCase() &&
        String(getRegionName(region)).toLowerCase() === String(name).toLowerCase()
    );

    if (existingRegion) {
      setRegionForm(regionToForm(existingRegion));
      return;
    }

    setRegionForm((current) => ({
      ...current,
      id: '',
      type,
      name,
      parentRegion,
      points: []
    }));
  };

  const saveRegion = async () => {
    setMessage('');
    setError('');

    const payload = buildRegionPayload(regionForm);

    if (!payload.name) {
      setError('Region name is required.');
      return;
    }

    const result = regionForm.id
      ? await run(() => api.updateMapRegion(regionForm.id, payload), 'Could not update region')
      : await run(() => api.addMapRegion(payload), 'Could not add region');

    if (result) {
      setMessage(normalizeApiResult(result));
      setRegionForm(regionToForm(result.region || result.Region || payload));
      await loadRegions();
    }
  };

  const deleteRegion = async () => {
    setMessage('');
    setError('');

    if (!regionForm.id) {
      setError('Select an existing region first.');
      return;
    }

    const result = await run(() => api.deleteMapRegion(regionForm.id), 'Could not delete region');

    if (result) {
      setMessage(normalizeApiResult(result));
      setRegionForm(emptyRegionForm());
      await loadRegions();
    }
  };

  const updateRegionPoint = (index, key, value) => {
    setRegionForm((current) => {
      const next = [...current.points];
      const rawValue = Number(value);

      next[index] = {
        ...next[index],
        [key]: key === 'x' ? normalizeMapX(rawValue) : clamp(rawValue, 0, MAP_PIXEL_HEIGHT)
      };

      return {
        ...current,
        points: next
      };
    });
  };

  const removeRegionPoint = (index) => {
    setRegionForm((current) => ({
      ...current,
      points: current.points.filter((_, pointIndex) => pointIndex !== index)
    }));
  };

  const regionPoints = regionForm.points
    .map((point) => `${Number(point.x ?? point.X)},${Number(point.y ?? point.Y)}`)
    .join(' ');

  const mapUnitsPerScreenPixel = viewBox.width / Math.max(1, svgSize.width);

  const markerRadius = clamp(8 / Math.sqrt(zoomLevel), 1.8, 7);
  const selectedMarkerRadius = clamp(12 / Math.sqrt(zoomLevel), 3.5, 12);

  // Desired visible text size in screen pixels.
  // This gets smaller as the user zooms in.
  const labelScreenPixels = clamp(15 - zoomLevel * 1.95, 12, 13);

  // Convert screen-pixel size back into map units.
  const labelFontSize = labelScreenPixels * mapUnitsPerScreenPixel;
  const labelStrokeWidth = clamp(1.2 * mapUnitsPerScreenPixel, 0.12, 1.1);
  const labelOffset = selectedMarkerRadius + 6 * mapUnitsPerScreenPixel;

  const regionStrokeWidth = Math.max(0.7, 4 / zoomLevel);

  const selectedCityContinuousX =
    cityForm.mapPixelX === ''
      ? null
      : nearestWrappedX(cityForm.mapPixelX, viewBox.x + viewBox.width / 2);

  return (
    <section className="card">
      <div className="card-body map-editor-panel">
        <div className="tab-header">
          <div>
            <h2>
              <MapPinned size={22} /> Map Editor
            </h2>
            <p className="muted">
              Add or move cities, zoom into the map, draw editable overlapping regions, and pan through the wrapped world map.
            </p>
          </div>

          <div className="deal-mode-toggle">
            <button
              type="button"
              className={mode === 'city' ? 'active' : ''}
              onClick={() => setMode('city')}
            >
              Cities
            </button>

            <button
              type="button"
              className={mode === 'region' ? 'active' : ''}
              onClick={() => setMode('region')}
            >
              Regions
            </button>
          </div>
        </div>

        <MapClickHelp mode={mode} zoomLevel={zoomLevel} />

        {message && (
          <div className="success-info mini-info">
            <strong><CheckCircle2 size={16} /> {message}</strong>
          </div>
        )}

        {error && (
          <div className="danger-info mini-info">
            <strong>{error}</strong>
          </div>
        )}

        <div className="map-editor-toolbar">
          <button type="button" className="button button-secondary" onClick={() => zoomAt(ZOOM_STEP)}>
            <ZoomIn size={16} /> Zoom in
          </button>

          <button type="button" className="button button-secondary" onClick={() => zoomAt(1 / ZOOM_STEP)}>
            <ZoomOut size={16} /> Zoom out
          </button>

          <button type="button" className="button button-secondary" onClick={resetZoom}>
            Reset view
          </button>

          <button
            type="button"
            className="button button-secondary"
            onClick={centerOnSelectedCity}
            disabled={cityForm.mapPixelX === '' || cityForm.mapPixelY === ''}
          >
            Center selected city
          </button>

          <span className="badge badge-info">
            {zoomLevel.toFixed(1)}x zoom
          </span>

          <span className="badge badge-muted">
            {placedCities.length} placed / {unplacedCities.length} unplaced
          </span>
        </div>

        <div className="map-editor-layout">
          <div className="map-editor-map-wrap">
            <svg
              ref={svgRef}
              className="map-editor-svg"
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
              onMouseDown={onMapMouseDown}
              onMouseMove={onMapMouseMove}
              onMouseUp={onMapMouseUp}
              onMouseLeave={onMapMouseLeave}
            >
              {copyOffsets.map((offset) => (
                <image
                  key={`map-copy-${offset}`}
                  href={MAP_IMAGE_URL}
                  x={offset}
                  y="0"
                  width={MAP_PIXEL_WIDTH}
                  height={MAP_PIXEL_HEIGHT}
                  preserveAspectRatio="none"
                />
              ))}

              {copyOffsets.map((offset) => (
                <g key={`regions-copy-${offset}`} transform={`translate(${offset}, 0)`}>
                  {regions
                    .filter((region) => region.enabled ?? region.Enabled ?? true)
                    .map((region) => {
                      const points = region.points || region.Points || [];
                      const pointString = points
                        .map((point) => `${Number(point.x ?? point.X)},${Number(point.y ?? point.Y)}`)
                        .join(' ');

                      if (points.length < 2) return null;

                      return (
                        <polygon
                          key={`${offset}-${region.id || region.Id}`}
                          points={pointString}
                          fill={region.color || region.Color || '#60a5fa'}
                          stroke={region.color || region.Color || '#60a5fa'}
                          opacity="0.24"
                          strokeWidth={regionStrokeWidth}
                        />
                      );
                    })}

                  {regionForm.points.length >= 2 && (
                    <polygon
                      points={regionPoints}
                      fill={regionForm.color}
                      stroke={regionForm.color}
                      opacity="0.45"
                      strokeWidth={Math.max(0.9, 5 / zoomLevel)}
                    />
                  )}
                </g>
              ))}

              {copyOffsets.map((offset) => (
                <g key={`cities-copy-${offset}`}>
                  {visiblePlacedCities.map((city) => {
                    const coord = getCityCoord(city);
                    if (!coord) return null;

                    const cityName = city.name || city.Name;
                    const selected = String(cityName).toLowerCase() === String(cityForm.originalName).toLowerCase();
                    const cx = coord.x + offset;

                    return (
                      <g key={`${offset}-${cityName}`}>
                        <circle
                          cx={cx}
                          cy={coord.y}
                          r={selected ? selectedMarkerRadius : markerRadius}
                          className={selected ? 'map-editor-city-point selected' : 'map-editor-city-point'}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            selectCity(cityName);
                            setMode('city');
                          }}
                        />

                        {(showLabels || selected) && (
                          <text
                            x={cx + labelOffset}
                            y={coord.y - selectedMarkerRadius}
                            className="map-editor-city-label"
                            style={{
                              fontSize: labelFontSize,
                              strokeWidth: labelStrokeWidth
                            }}
                          >
                            {cityName}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              ))}

              {selectedCityContinuousX != null && cityForm.mapPixelY !== '' && (
                <g>
                  <circle
                    cx={selectedCityContinuousX}
                    cy={Number(cityForm.mapPixelY)}
                    r={selectedMarkerRadius}
                    className="map-editor-new-city-point"
                  />

                  {(showLabels || !cityForm.originalName) && cityForm.name && (
                    <text
                      x={selectedCityContinuousX + labelOffset}
                      y={Number(cityForm.mapPixelY) - selectedMarkerRadius}
                      className="map-editor-city-label"
                      style={{
                        fontSize: labelFontSize,
                        strokeWidth: labelStrokeWidth
                      }}
                    >
                      {cityForm.name}
                    </text>
                  )}
                </g>
              )}

              {copyOffsets.map((offset) => (
                <g key={`region-points-copy-${offset}`} transform={`translate(${offset}, 0)`}>
                  {regionForm.points.map((point, index) => (
                    <circle
                      key={`${point.x ?? point.X}-${point.y ?? point.Y}-${index}`}
                      cx={Number(point.x ?? point.X)}
                      cy={Number(point.y ?? point.Y)}
                      r={clamp(9 / Math.sqrt(zoomLevel), 2, 8)}
                      className="map-editor-region-point"
                    />
                  ))}
                </g>
              ))}
            </svg>
          </div>

          <aside className="map-editor-side">
            {mode === 'city' && (
              <div className="map-editor-form">
                <h3>City editor</h3>

                <div className="warning-info mini-info">
                  <strong>
                    <MousePointerClick size={16} /> Finding unplaced cities
                  </strong>
                  <p>
                    Enable <b>Only unplaced cities</b>, choose a city, then click the map to place it.
                    A new dot appears immediately before saving.
                  </p>
                </div>

                <datalist id="map-editor-city-options">
                  {options.cityNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>

                <datalist id="map-editor-main-region-options">
                  {options.mainRegions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>

                <datalist id="map-editor-sub-region-options">
                  {options.subRegions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>

                <datalist id="map-editor-sea-region-options">
                  {options.seaTradeRegions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>

                <label className="inline-checkbox">
                  <input
                    type="checkbox"
                    checked={showUnplacedOnly}
                    onChange={(event) => setShowUnplacedOnly(event.target.checked)}
                  />
                  Only unplaced cities
                </label>

                {showUnplacedOnly && (
                  <label className="field">
                    <span>Choose unplaced city</span>
                    <select
                      className="input"
                      value={cityForm.originalName || cityForm.name}
                      onChange={(event) => selectCity(event.target.value)}
                    >
                      <option value="">Select a city...</option>
                      {visibleCities.map((city) => {
                        const cityName = city.name || city.Name;

                        return (
                          <option key={cityName} value={cityName}>
                            {cityName}
                          </option>
                        );
                      })}
                    </select>
                    <small>{unplacedCities.length} cities do not have coordinates yet.</small>
                  </label>
                )}

                <label className="field">
                  <span>Select existing city</span>
                  <input
                    className="input"
                    list="map-editor-city-options"
                    value={cityForm.originalName}
                    onChange={(event) => selectCity(event.target.value)}
                    placeholder="Choose a city..."
                  />
                </label>

                <label className="field">
                  <span>Filter map city markers</span>
                  <input
                    className="input"
                    value={citySearch}
                    onChange={(event) => setCitySearch(event.target.value)}
                    placeholder="Search city/region..."
                  />
                </label>

                <label className="field">
                  <span>City name</span>
                  <input
                    className="input"
                    value={cityForm.name}
                    onChange={(event) => setCityForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>

                <label className="field">
                  <span>Aliases</span>
                  <input
                    className="input"
                    value={cityForm.aliases}
                    onChange={(event) => setCityForm((current) => ({ ...current, aliases: event.target.value }))}
                    placeholder="Use | between aliases"
                  />
                </label>

                <label className="field">
                  <span>Main region</span>
                  <input
                    className="input"
                    list="map-editor-main-region-options"
                    value={cityForm.mainRegion}
                    onChange={(event) => setCityForm((current) => ({ ...current, mainRegion: event.target.value }))}
                  />
                </label>

                <label className="field">
                  <span>Sub region</span>
                  <input
                    className="input"
                    list="map-editor-sub-region-options"
                    value={cityForm.subRegion}
                    onChange={(event) => setCityForm((current) => ({ ...current, subRegion: event.target.value }))}
                  />
                </label>

                <label className="field">
                  <span>Sea trade region</span>
                  <input
                    className="input"
                    list="map-editor-sea-region-options"
                    value={cityForm.seaTradeRegion}
                    onChange={(event) => setCityForm((current) => ({ ...current, seaTradeRegion: event.target.value }))}
                  />
                </label>

                <div className="map-editor-coordinate-grid">
                  <label className="field">
                    <span>Map pixel X</span>
                    <input
                      className="input"
                      type="number"
                      value={cityForm.mapPixelX}
                      onChange={(event) => {
                        const raw = event.target.value;
                        const normalized = raw === '' ? '' : Math.round(normalizeMapX(Number(raw)));

                        setCityForm((current) => ({
                          ...current,
                          mapPixelX: normalized,
                          worldX: normalized === '' ? '' : mapToWorld(normalized)
                        }));
                      }}
                    />
                  </label>

                  <label className="field">
                    <span>Map pixel Y</span>
                    <input
                      className="input"
                      type="number"
                      value={cityForm.mapPixelY}
                      onChange={(event) => {
                        const raw = event.target.value;
                        const value = raw === '' ? '' : Math.round(clamp(Number(raw), 0, MAP_PIXEL_HEIGHT));

                        setCityForm((current) => ({
                          ...current,
                          mapPixelY: value,
                          worldY: value === '' ? '' : mapToWorld(value)
                        }));
                      }}
                    />
                  </label>

                  <label className="field">
                    <span>World X</span>
                    <input className="input" readOnly value={cityForm.worldX} />
                  </label>

                  <label className="field">
                    <span>World Y</span>
                    <input className="input" readOnly value={cityForm.worldY} />
                  </label>
                </div>

                <div className="deal-actions">
                  <button type="button" className="button button-primary" onClick={saveCity}>
                    <Save size={16} /> Save city
                  </button>

                  <button type="button" className="button button-secondary" onClick={() => setCityForm(emptyCityForm())}>
                    <Plus size={16} /> New city
                  </button>

                  <button type="button" className="button button-secondary" onClick={deleteCity} disabled={!cityForm.originalName}>
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              </div>
            )}

            {mode === 'region' && (
              <div className="map-editor-form">
                <h3>Region editor</h3>

                <div className="success-info mini-info">
                  <strong>Editable default regions</strong>
                  <p>
                    Pick an official region such as <b>Europe</b>, draw or edit its polygon, and save it.
                    This changes the visual region shape without removing your city region fields.
                  </p>
                </div>

                <datalist id="map-editor-region-options">
                  {regions.map((region) => (
                    <option key={getRegionId(region)} value={getRegionId(region)}>
                      {getRegionName(region)}
                    </option>
                  ))}
                </datalist>

                <label className="field">
                  <span>Create/edit official region</span>
                  <select
                    className="input"
                    value=""
                    onChange={(event) => selectOfficialRegion(event.target.value)}
                  >
                    <option value="">Choose from city catalog regions...</option>
                    {officialRegionOptions.map((region) => (
                      <option
                        key={`${region.type}|${region.name}|${region.parentRegion}`}
                        value={`${region.type}|${region.name}|${region.parentRegion}`}
                      >
                        {region.type}: {region.name}
                        {region.parentRegion ? ` (${region.parentRegion})` : ''}
                      </option>
                    ))}
                  </select>
                  <small>
                    This lets you create a polygon for default regions like Europe, Adriatic, or Western Mediterranean.
                  </small>
                </label>

                <label className="field">
                  <span>Select existing drawn region</span>
                  <input
                    className="input"
                    list="map-editor-region-options"
                    value={regionForm.id}
                    onChange={(event) => selectRegion(event.target.value)}
                    placeholder="Choose a region id..."
                  />
                </label>

                <label className="field">
                  <span>Region name</span>
                  <input
                    className="input"
                    value={regionForm.name}
                    onChange={(event) => setRegionForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Example: Europe"
                  />
                </label>

                <label className="field">
                  <span>Region type</span>
                  <select
                    className="input"
                    value={regionForm.type}
                    onChange={(event) => setRegionForm((current) => ({ ...current, type: event.target.value }))}
                  >
                    <option value="MainRegion">MainRegion</option>
                    <option value="SubRegion">SubRegion</option>
                    <option value="SeaTradeRegion">SeaTradeRegion</option>
                    <option value="Custom">Custom</option>
                  </select>
                </label>

                <label className="field">
                  <span>Parent region</span>
                  <input
                    className="input"
                    value={regionForm.parentRegion}
                    onChange={(event) => setRegionForm((current) => ({ ...current, parentRegion: event.target.value }))}
                    placeholder="Optional"
                  />
                </label>

                <label className="field">
                  <span>Color</span>
                  <input
                    className="input"
                    type="color"
                    value={regionForm.color}
                    onChange={(event) => setRegionForm((current) => ({ ...current, color: event.target.value }))}
                  />
                </label>

                <label className="inline-checkbox">
                  <input
                    type="checkbox"
                    checked={regionForm.enabled}
                    onChange={(event) => setRegionForm((current) => ({ ...current, enabled: event.target.checked }))}
                  />
                  Enabled
                </label>

                <div className="region-point-list">
                  <div className="map-editor-mini-header">
                    <strong>Polygon points</strong>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setRegionForm((current) => ({ ...current, points: [] }))}
                    >
                      Clear points
                    </button>
                  </div>

                  {regionForm.points.length === 0 && (
                    <p className="muted">Click the map to add points. Drag the map to move around.</p>
                  )}

                  {regionForm.points.map((point, index) => (
                    <div key={`${index}-${point.x ?? point.X}-${point.y ?? point.Y}`} className="region-point-row">
                      <input
                        className="input"
                        type="number"
                        value={point.x ?? point.X}
                        onChange={(event) => updateRegionPoint(index, 'x', event.target.value)}
                      />

                      <input
                        className="input"
                        type="number"
                        value={point.y ?? point.Y}
                        onChange={(event) => updateRegionPoint(index, 'y', event.target.value)}
                      />

                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => removeRegionPoint(index)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="deal-actions">
                  <button type="button" className="button button-primary" onClick={saveRegion}>
                    <Save size={16} /> Save region
                  </button>

                  <button type="button" className="button button-secondary" onClick={() => setRegionForm(emptyRegionForm())}>
                    <Plus size={16} /> New region
                  </button>

                  <button type="button" className="button button-secondary" onClick={deleteRegion} disabled={!regionForm.id}>
                    <Trash2 size={16} /> Delete
                  </button>

                  <button type="button" className="button button-secondary" onClick={loadRegions}>
                    <RefreshCw size={16} /> Reload
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>

        <div className="sharing-note">
          <strong>Current behavior</strong>
          <p>
            Cities keep MainRegion, SubRegion, and SeaTradeRegion in <b>cities.csv</b>.
            Region polygons are saved separately in <b>Data/map-regions.json</b>, so users can draw custom shapes,
            overlap them, and edit default region shapes like Europe without breaking city filters.
          </p>
        </div>
      </div>
    </section>
  );
}
