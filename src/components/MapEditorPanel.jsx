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

function isEmptyRegionValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'unassigned';
}

function cleanRegionValue(value) {
  return isEmptyRegionValue(value) ? '' : String(value || '').trim();
}

function uniqueSorted(values) {
  return [...new Set(values.map(cleanRegionValue).filter(Boolean))].sort((a, b) => a.localeCompare(b));
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
    mainRegion: '',
    subRegion: '',
    seaTradeRegion: '',
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
    mainRegion: cleanRegionValue(city.mainRegion || city.MainRegion),
    subRegion: cleanRegionValue(city.subRegion || city.SubRegion),
    seaTradeRegion: cleanRegionValue(city.seaTradeRegion || city.SeaTradeRegion),
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
    type: 'MainRegion',
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
    type: region.type || region.Type || 'MainRegion',
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
    name: String(form.name || '').trim(),
    aliases: parseAliases(form.aliases),
    mainRegion: cleanRegionValue(form.mainRegion),
    subRegion: cleanRegionValue(form.subRegion),
    seaTradeRegion: cleanRegionValue(form.seaTradeRegion),
    mapPixelX,
    mapPixelY,
    worldX: mapPixelX == null ? null : Math.round(mapPixelX * WORLD_SCALE),
    worldY: mapPixelY == null ? null : Math.round(mapPixelY * WORLD_SCALE)
  };
}

function buildRegionPayload(form) {
  return {
    id: form.id || undefined,
    name: String(form.name || '').trim(),
    type: form.type,
    parentRegion: String(form.parentRegion || '').trim() || null,
    color: form.color || '#60a5fa',
    enabled: Boolean(form.enabled),
    // Keep X continuous so wrap-crossing polygons do not jump across the map.
    points: form.points.map((point) => ({
      x: Number(point.x ?? point.X),
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

    if (!isEmptyRegionValue(mainRegion)) {
      main.set(`MainRegion|${mainRegion}`, {
        type: 'MainRegion',
        name: mainRegion,
        parentRegion: ''
      });
    }

    if (!isEmptyRegionValue(subRegion)) {
      sub.set(`SubRegion|${subRegion}|${mainRegion}`, {
        type: 'SubRegion',
        name: subRegion,
        parentRegion: cleanRegionValue(mainRegion)
      });
    }

    if (!isEmptyRegionValue(seaTradeRegion)) {
      sea.set(`SeaTradeRegion|${seaTradeRegion}|${subRegion || mainRegion}`, {
        type: 'SeaTradeRegion',
        name: seaTradeRegion,
        parentRegion: cleanRegionValue(subRegion || mainRegion)
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

function getRegionPointX(point) {
  return Number(point?.x ?? point?.X ?? 0);
}

function getRegionPointY(point) {
  return Number(point?.y ?? point?.Y ?? 0);
}

function unwrapRegionPoints(points) {
  if (!points?.length) return [];

  const validPoints = points
    .map((point) => ({
      x: getRegionPointX(point),
      y: getRegionPointY(point)
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (!validPoints.length) return [];

  const result = [validPoints[0]];

  for (let index = 1; index < validPoints.length; index += 1) {
    const previous = result[result.length - 1];
    const current = validPoints[index];

    result.push({
      x: nearestWrappedX(current.x, previous.x),
      y: current.y
    });
  }

  return result;
}

function regionPointsToString(points) {
  return unwrapRegionPoints(points)
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
}

function polygonCenterX(points) {
  const unwrapped = unwrapRegionPoints(points);
  if (!unwrapped.length) return 0;

  return unwrapped.reduce((sum, point) => sum + point.x, 0) / unwrapped.length;
}

function isPointInsidePolygon(point, polygonPoints) {
  const polygon = unwrapRegionPoints(polygonPoints);
  if (polygon.length < 3) return false;

  const referenceX = polygonCenterX(polygon);
  const x = nearestWrappedX(point.x, referenceX);
  const y = point.y;

  let inside = false;

  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];

    const intersects =
      currentPoint.y > y !== previousPoint.y > y &&
      x <
        ((previousPoint.x - currentPoint.x) * (y - currentPoint.y)) /
          ((previousPoint.y - currentPoint.y) || Number.EPSILON) +
          currentPoint.x;

    if (intersects) inside = !inside;
  }

  return inside;
}

function getCityName(city) {
  return city.name || city.Name || '';
}

function getCityAliases(city) {
  return city.aliases || city.Aliases || [];
}

function getCityField(city, camel, pascal, fallback = '') {
  return city[camel] ?? city[pascal] ?? fallback;
}

function buildCityUpdatePayload(city, overrides = {}) {
  const mapPixelX = getCityField(city, 'mapPixelX', 'MapPixelX', null);
  const mapPixelY = getCityField(city, 'mapPixelY', 'MapPixelY', null);

  return {
    name: overrides.name ?? getCityName(city),
    aliases: overrides.aliases ?? getCityAliases(city),
    mainRegion: overrides.mainRegion ?? cleanRegionValue(getCityField(city, 'mainRegion', 'MainRegion', '')),
    subRegion: overrides.subRegion ?? cleanRegionValue(getCityField(city, 'subRegion', 'SubRegion', '')),
    seaTradeRegion:
      overrides.seaTradeRegion ?? cleanRegionValue(getCityField(city, 'seaTradeRegion', 'SeaTradeRegion', '')),
    mapPixelX: overrides.mapPixelX ?? (mapPixelX === '' ? null : mapPixelX),
    mapPixelY: overrides.mapPixelY ?? (mapPixelY === '' ? null : mapPixelY),
    worldX: overrides.worldX ?? getCityField(city, 'worldX', 'WorldX', null),
    worldY: overrides.worldY ?? getCityField(city, 'worldY', 'WorldY', null)
  };
}

function regionFieldForType(type) {
  if (type === 'MainRegion') return 'mainRegion';
  if (type === 'SubRegion') return 'subRegion';
  if (type === 'SeaTradeRegion') return 'seaTradeRegion';
  return null;
}

function isEditableRegionType(type) {
  return type === 'MainRegion' || type === 'SubRegion' || type === 'SeaTradeRegion';
}

function MapClickHelp({ mode, zoomLevel }) {
  return (
    <p className="mini-info">
      {mode === 'city'
        ? 'City mode: use Find city to load a city, then click the map to place or move it. Choosing an exact city from the dropdown opens it automatically.'
        : 'Region mode: click the map to add points. Right-click removes the last point. Saving applies the region to cities inside the polygon.'}
      {' '}
      The map wraps horizontally. Current editor zoom: {zoomLevel.toFixed(1)}x.
    </p>
  );
}

export default function MapEditorPanel({ cities, run, refreshCatalogs }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const rightClickUndoRef = useRef(0);
  const viewBoxRef = useRef(null);

  const [svgSize, setSvgSize] = useState({
    width: 1000,
    height: 500
  });

  const [mode, setMode] = useState('city');
  const [cityForm, setCityForm] = useState(emptyCityForm());
  const cityFormRef = useRef(cityForm);
  const cityDirtyRef = useRef(false);
  const [cityHasUnsavedChanges, setCityHasUnsavedChanges] = useState(false);

  const [citySearch, setCitySearch] = useState('');
  const [cityPickerText, setCityPickerText] = useState('');
  const [showUnplacedOnly, setShowUnplacedOnly] = useState(false);
  const [showCityAdvanced, setShowCityAdvanced] = useState(false);
  const [showRegionAdvanced, setShowRegionAdvanced] = useState(false);

  const [regions, setRegions] = useState([]);
  const [regionForm, setRegionForm] = useState(emptyRegionForm());

  const [viewBox, setViewBox] = useState({
    x: 0,
    y: 0,
    width: MAP_PIXEL_WIDTH,
    height: MAP_PIXEL_HEIGHT
  });

  const [saveNotice, setSaveNotice] = useState(null);

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
    const data = await run(() => api.getMapRegions(), 'Could not load map regions');

    if (data) setRegions(data);
  };

  useEffect(() => {
    loadRegions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cityFormRef.current = cityForm;
  }, [cityForm]);

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

  const markCityDirty = () => {
    cityDirtyRef.current = true;
    setCityHasUnsavedChanges(true);
  };

  const clearCityDirty = () => {
    cityDirtyRef.current = false;
    setCityHasUnsavedChanges(false);
  };

  const showSaveNotice = (text, kind = 'success') => {
    setSaveNotice({
      id: Date.now(),
      text,
      kind
    });
  };

  useEffect(() => {
    if (!saveNotice) return;

    const timer = setTimeout(() => {
      setSaveNotice(null);
    }, 1800);

    return () => clearTimeout(timer);
  }, [saveNotice]);

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

  const removeLastRegionPoint = () => {
    if (!regionForm.points.length) {
      showSaveNotice('No region point to remove.', 'info');
      return false;
    }

    const nextPointCount = Math.max(0, regionForm.points.length - 1);

    setRegionForm((current) => ({
      ...current,
      points: current.points.slice(0, -1)
    }));

    showSaveNotice(
      `Removed last region point. ${nextPointCount} point${nextPointCount === 1 ? '' : 's'} remaining.`,
      'info'
    );

    return true;
  };

  const onMapMouseDown = (event) => {
    if (event.button === 2 && mode === 'region') {
      event.preventDefault();
      event.stopPropagation();

      rightClickUndoRef.current = Date.now();
      dragRef.current = null;
      removeLastRegionPoint();

      return;
    }

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
    if (event.button !== 0) return;

    const drag = dragRef.current;
    dragRef.current = null;

    if (drag?.moved) return;

    const targetTag = String(event.target?.tagName || '').toLowerCase();
    if (targetTag === 'circle' || targetTag === 'text') return;

    const point = screenToMapPoint(event.clientX, event.clientY);
    if (!point) return;

    if (mode === 'city') {
      const wasExistingCity = Boolean(cityFormRef.current.originalName);

      const updatedCityForm = {
        ...cityFormRef.current,
        mapPixelX: point.x,
        mapPixelY: point.y,
        worldX: point.x * WORLD_SCALE,
        worldY: point.y * WORLD_SCALE
      };

      cityFormRef.current = updatedCityForm;
      setCityForm(updatedCityForm);

      if (wasExistingCity) {
        markCityDirty();
        showSaveNotice('City moved. Click another city dot or the moved dot to save.', 'info');
      }

      return;
    }

    setRegionForm((current) => {
      const previousPoint = current.points[current.points.length - 1];
      const previousX = previousPoint ? getRegionPointX(previousPoint) : null;

      return {
        ...current,
        points: [
          ...current.points,
          {
            // Keep the X near the previous clicked point.
            // This makes a click near the right edge and then the left edge connect across the wrap seam.
            x: previousX == null ? point.continuousX : nearestWrappedX(point.x, previousX),
            y: point.y
          }
        ]
      };
    });
  };

  const onMapContextMenu = (event) => {
    if (mode !== 'region') return;

    event.preventDefault();
    event.stopPropagation();

    dragRef.current = null;

    // Most browsers fire contextmenu after mouse down.
    // If mouse down already removed the point, do not remove a second point.
    if (Date.now() - rightClickUndoRef.current < 350) return;

    rightClickUndoRef.current = Date.now();
    removeLastRegionPoint();
  };

  const onMapMouseLeave = () => {
    dragRef.current = null;
  };

  const clearSelectedCity = ({ clearPicker = true } = {}) => {
    const empty = emptyCityForm();

    clearCityDirty();
    cityFormRef.current = empty;
    setCityForm(empty);

    if (clearPicker) {
      setCityPickerText('');
    }
  };

  const saveCityForm = async (
    formToSave = cityFormRef.current,
    { auto = false, deselectAfterSave = true } = {}
  ) => {
    const payload = buildCityPayload(formToSave);

    if (!payload.name) {
      if (!auto) showSaveNotice('City name is required.', 'danger');
      return false;
    }

    // Auto-save is only for existing cities that were moved.
    // New cities still require the Save city button.
    if (auto && !formToSave.originalName) {
      return true;
    }

    const result = formToSave.originalName
      ? await run(() => api.updateCity(formToSave.originalName, payload), 'Could not update city')
      : await run(() => api.addCity(payload), 'Could not add city');

    if (!result) return false;

    clearCityDirty();

    const successMessage = auto ? `Saved moved city '${payload.name}'.` : normalizeApiResult(result);
    showSaveNotice(successMessage);

    if (deselectAfterSave) {
      clearSelectedCity();
    } else {
      setCityForm((current) => {
        const shouldUpdateCurrentForm =
          current.originalName === formToSave.originalName ||
          current.name === formToSave.name ||
          current.name === payload.name;

        if (!shouldUpdateCurrentForm) return current;

        const updated = {
          ...current,
          originalName: payload.name,
          name: payload.name,
          mapPixelX: payload.mapPixelX ?? '',
          mapPixelY: payload.mapPixelY ?? '',
          worldX: payload.worldX ?? '',
          worldY: payload.worldY ?? ''
        };

        cityFormRef.current = updated;
        setCityPickerText(updated.originalName);

        return updated;
      });
    }

    if (refreshCatalogs) await refreshCatalogs();

    return true;
  };

  const saveCity = async () => {
    await saveCityForm(cityFormRef.current, { auto: false });
  };

  const autoSaveMovedCity = async ({ deselectAfterSave = true } = {}) => {
    if (!cityDirtyRef.current) return true;

    const formToSave = cityFormRef.current;

    if (!formToSave.originalName) return true;

    return saveCityForm(formToSave, {
      auto: true,
      deselectAfterSave
    });
  };

  const selectCity = (cityName, { center = true, quiet = false } = {}) => {
    const cleanName = String(cityName || '').trim();

    if (!cleanName) {
      if (!quiet) showSaveNotice('Choose a city first.', 'info');
      return false;
    }

    const city = cities.find((item) =>
      String(item.name || item.Name || '').toLowerCase() === cleanName.toLowerCase()
    );

    if (!city) {
      if (!quiet) {
        showSaveNotice('No exact city match yet. Keep typing or choose from the list.', 'info');
      }

      return false;
    }

    const form = cityToForm(city);

    clearCityDirty();
    cityFormRef.current = form;
    setCityForm(form);
    setCityPickerText(form.originalName);

    if (center && form.mapPixelX !== '' && form.mapPixelY !== '') {
      centerOnPoint(form.mapPixelX, form.mapPixelY, Math.min(viewBox.width, 900));
    } else if (!quiet && (form.mapPixelX === '' || form.mapPixelY === '')) {
      showSaveNotice(`${form.originalName} loaded. Click the map to place it.`, 'info');
    }

    return true;
  };

  const loadCityFromPicker = async (cityName = cityPickerText) => {
    const cleanName = String(cityName || '').trim();

    if (!cleanName) {
      showSaveNotice('Choose a city first.', 'info');
      return false;
    }

    // If the currently selected city was moved, save that position first.
    // Keep the editor ready to load/place the city selected from Find city.
    if (cityDirtyRef.current) {
      const saved = await autoSaveMovedCity({ deselectAfterSave: false });
      if (!saved) return false;
    }

    return selectCity(cleanName);
  };

  const handleCityMarkerClick = async (cityName) => {
    const currentName = cityFormRef.current.originalName;
    const wasDirty = cityDirtyRef.current;

    // If the user clicks the moved city itself, that click saves it and unselects it.
    if (
      wasDirty &&
      currentName &&
      String(currentName).toLowerCase() === String(cityName).toLowerCase()
    ) {
      await autoSaveMovedCity({ deselectAfterSave: true });
      return;
    }

    // If the user clicks another city, save the moved city first,
    // then open the city they clicked.
    const saved = await autoSaveMovedCity({ deselectAfterSave: false });
    if (!saved) return;

    selectCity(cityName);
    setMode('city');
  };

  const deleteCity = async () => {
    if (!cityForm.originalName) {
      showSaveNotice('Select an existing city first.', 'danger');
      return;
    }

    const result = await run(() => api.deleteCity(cityForm.originalName), 'Could not delete city');

    if (result) {
      showSaveNotice(normalizeApiResult(result));

      clearSelectedCity();

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

  const applyRegionToCities = async (regionPayload) => {
    const regionType = regionPayload.type;
    const field = regionFieldForType(regionType);
    const regionName = String(regionPayload.name || '').trim();

    if (!field || !regionName) {
      return { assigned: 0, cleared: 0, skipped: 0, failed: 0 };
    }

    const points = regionPayload.points || [];
    const hasPolygon = points.length >= 3;

    let assigned = 0;
    let cleared = 0;
    let skipped = 0;
    let failed = 0;

    for (const city of cities) {
      const name = getCityName(city);
      if (!name) {
        skipped += 1;
        continue;
      }

      const coord = getCityCoord(city);
      const currentValue = String(getCityField(city, field, field[0].toUpperCase() + field.slice(1), '')).trim();

      const inside = hasPolygon && coord ? isPointInsidePolygon(coord, points) : false;
      const nextValue = inside ? regionName : currentValue === regionName ? '' : currentValue;

      if (nextValue === currentValue) {
        skipped += 1;
        continue;
      }

      const payload = buildCityUpdatePayload(city, {
        [field]: nextValue
      });

      if (inside && regionPayload.parentRegion) {
        if (regionType === 'SubRegion') {
          payload.mainRegion = regionPayload.parentRegion;
        }

        if (regionType === 'SeaTradeRegion') {
          payload.subRegion = regionPayload.parentRegion;
        }
      }

      const result = await run(
        () => api.updateCity(name, payload),
        `Could not update city region for ${name}`
      );

      if (result) {
        if (inside) assigned += 1;
        else cleared += 1;
      } else {
        failed += 1;
      }
    }

    return { assigned, cleared, skipped, failed };
  };

  const clearRegionFromCities = async (regionName, regionType) => {
    const field = regionFieldForType(regionType);

    if (!field || !regionName) {
      return { cleared: 0, skipped: 0, failed: 0 };
    }

    let cleared = 0;
    let skipped = 0;
    let failed = 0;

    for (const city of cities) {
      const name = getCityName(city);
      if (!name) {
        skipped += 1;
        continue;
      }

      const currentValue = String(getCityField(city, field, field[0].toUpperCase() + field.slice(1), '')).trim();

      if (currentValue !== regionName) {
        skipped += 1;
        continue;
      }

      const payload = buildCityUpdatePayload(city, {
        [field]: ''
      });

      const result = await run(
        () => api.updateCity(name, payload),
        `Could not clear city region for ${name}`
      );

      if (result) cleared += 1;
      else failed += 1;
    }

    return { cleared, skipped, failed };
  };

  const saveRegion = async () => {
    const payload = buildRegionPayload(regionForm);

    if (!payload.name) {
      showSaveNotice('Region name is required.', 'danger');
      return;
    }

    if (!isEditableRegionType(payload.type)) {
      showSaveNotice('Choose MainRegion, SubRegion, or SeaTradeRegion before saving.', 'danger');
      return;
    }

    if (!payload.points || payload.points.length < 3) {
      showSaveNotice('A region needs at least 3 points before it can be applied to cities.', 'danger');
      return;
    }

    const result = regionForm.id
      ? await run(() => api.updateMapRegion(regionForm.id, payload), 'Could not update region')
      : await run(() => api.addMapRegion(payload), 'Could not add region');

    if (result) {
      const savedRegion = result.region || result.Region || payload;
      const normalizedRegion = buildRegionPayload(regionToForm(savedRegion));
      const cityResult = await applyRegionToCities(normalizedRegion);

      showSaveNotice(
        `${normalizeApiResult(result)} Applied to ${cityResult.assigned} city/cities and cleared ${cityResult.cleared}.`,
        cityResult.failed ? 'danger' : 'success'
      );

      setRegionForm(regionToForm(savedRegion));
      await loadRegions();

      if (refreshCatalogs) await refreshCatalogs();
    }
  };

  const deleteRegion = async () => {
    const regionName = String(regionForm.name || '').trim();
    const regionType = regionForm.type;

    if (!regionName || !isEditableRegionType(regionType)) {
      showSaveNotice('Select or name a MainRegion, SubRegion, or SeaTradeRegion first.', 'danger');
      return;
    }

    const cityResult = await clearRegionFromCities(regionName, regionType);

    if (regionForm.id) {
      const result = await run(() => api.deleteMapRegion(regionForm.id), 'Could not delete region');

      if (!result) return;
    }

    showSaveNotice(
      `Deleted ${regionType} '${regionName}'. Cleared ${cityResult.cleared} city/cities.`,
      cityResult.failed ? 'danger' : 'success'
    );

    setRegionForm(emptyRegionForm());
    await loadRegions();

    if (refreshCatalogs) await refreshCatalogs();
  };

  const updateRegionPoint = (index, key, value) => {
    setRegionForm((current) => {
      const next = [...current.points];
      const rawValue = Number(value);

      next[index] = {
        ...next[index],
        [key]: key === 'x' ? rawValue : clamp(rawValue, 0, MAP_PIXEL_HEIGHT)
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

  const regionPreviewPoints = useMemo(
    () => unwrapRegionPoints(regionForm.points),
    [regionForm.points]
  );

  const regionPoints = useMemo(
    () => regionPreviewPoints.map((point) => `${point.x},${point.y}`).join(' '),
    [regionPreviewPoints]
  );

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

  const selectedCityLabel = cityForm.name || cityForm.originalName || 'No city selected';
  const selectedCityHasLocation = cityForm.mapPixelX !== '' && cityForm.mapPixelY !== '';
  const regionPointCount = regionForm.points.length;
  const activeRegionLabel = regionForm.name || 'No region selected';

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

        {saveNotice && (
          <div
            key={saveNotice.id}
            className={`map-editor-save-notice map-editor-save-notice-${saveNotice.kind}`}
            role="status"
            aria-live="polite"
          >
            <CheckCircle2 size={18} />
            <strong>{saveNotice.text}</strong>
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
          <div
            className="map-editor-map-wrap"
            onContextMenu={onMapContextMenu}
          >
            <svg
              ref={svgRef}
              className="map-editor-svg"
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
              onMouseDown={onMapMouseDown}
              onMouseMove={onMapMouseMove}
              onMouseUp={onMapMouseUp}
              onMouseLeave={onMapMouseLeave}
              onContextMenu={onMapContextMenu}
              onContextMenuCapture={onMapContextMenu}
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
                      const pointString = regionPointsToString(points);

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

                  {regionPreviewPoints.length >= 2 && (
                    <polyline
                      points={regionPoints}
                      fill="none"
                      stroke={regionForm.color}
                      strokeWidth={Math.max(1.2, 6 / zoomLevel)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.92"
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
                          onClick={async (event) => {
                            event.stopPropagation();
                            await handleCityMarkerClick(cityName);
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
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={async (event) => {
                              event.stopPropagation();
                              await handleCityMarkerClick(cityName);
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
                    style={{
                      pointerEvents: cityHasUnsavedChanges ? 'auto' : 'none',
                      cursor: cityHasUnsavedChanges ? 'pointer' : 'default'
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={async (event) => {
                      event.stopPropagation();
                      await autoSaveMovedCity();
                    }}
                  />

                  {(showLabels || !cityForm.originalName) && cityForm.name && (
                    <text
                      x={selectedCityContinuousX + labelOffset}
                      y={Number(cityForm.mapPixelY) - selectedMarkerRadius}
                      className="map-editor-city-label"
                      style={{
                        fontSize: labelFontSize,
                        strokeWidth: labelStrokeWidth,
                        pointerEvents: cityHasUnsavedChanges ? 'auto' : 'none',
                        cursor: cityHasUnsavedChanges ? 'pointer' : 'default'
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={async (event) => {
                        event.stopPropagation();
                        await autoSaveMovedCity();
                      }}
                    >
                      {cityForm.name}
                    </text>
                  )}
                </g>
              )}

              {copyOffsets.map((offset) => (
                <g key={`region-points-copy-${offset}`} transform={`translate(${offset}, 0)`}>
                  {regionPreviewPoints.map((point, index) => (
                    <circle
                      key={`${point.x}-${point.y}-${index}`}
                      cx={point.x}
                      cy={point.y}
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
              <div className="map-editor-form map-editor-compact-form">
                <div className="map-editor-form-header">
                  <div>
                    <h3>City editor</h3>
                    <p className="muted">
                      Find city only searches. It does not rename or save the selected city.
                    </p>
                  </div>

                  <span className={selectedCityHasLocation ? 'badge badge-success' : 'badge badge-muted'}>
                    {selectedCityHasLocation ? 'Placed' : 'Unplaced'}
                  </span>
                </div>

                <div className="map-editor-action-bar">
                  <button type="button" className="button button-primary" onClick={saveCity}>
                    <Save size={16} /> Save city
                  </button>

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={async () => {
                      if (cityDirtyRef.current) {
                        const saved = await autoSaveMovedCity({ deselectAfterSave: true });
                        if (!saved) return;
                      }

                      clearSelectedCity();
                      showSaveNotice('Ready to add a new city.', 'info');
                    }}
                  >
                    <Plus size={16} /> New
                  </button>

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={deleteCity}
                    disabled={!cityForm.originalName}
                  >
                    <Trash2 size={16} /> Delete
                  </button>
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

                <div className="map-editor-picker-row">
                  <label className="field map-editor-picker-field">
                    <span>Find city</span>
                    <input
                      className="input"
                      list="map-editor-city-options"
                      value={cityPickerText}
                      onChange={(event) => {
                        const value = event.target.value;
                        setCityPickerText(value);

                        const exactCity = cities.find((city) =>
                          String(city.name || city.Name || '').toLowerCase() ===
                          String(value || '').trim().toLowerCase()
                        );

                        if (exactCity) {
                          void loadCityFromPicker(value);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void loadCityFromPicker(event.currentTarget.value);
                        }
                      }}
                      placeholder="Type to search, then press Open..."
                    />
                  </label>

                  <button
                    type="button"
                    className="button button-secondary map-editor-open-button"
                    onClick={() => {
                      void loadCityFromPicker();
                    }}
                  >
                    Open
                  </button>
                </div>

                <label className="field">
                  <span>Filter map markers</span>
                  <input
                    className="input"
                    value={citySearch}
                    onChange={(event) => setCitySearch(event.target.value)}
                    placeholder="City or region..."
                  />
                </label>

                <label className="inline-checkbox map-editor-checkbox-line">
                  <input
                    type="checkbox"
                    checked={showUnplacedOnly}
                    onChange={(event) => setShowUnplacedOnly(event.target.checked)}
                  />
                  Only unplaced cities
                  <span className="muted">({unplacedCities.length})</span>
                </label>

                {showUnplacedOnly && (
                  <label className="field">
                    <span>Choose unplaced city</span>
                    <select
                      className="input"
                      value={cityPickerText}
                      onChange={(event) => {
                        const cityName = event.target.value;
                        setCityPickerText(cityName);
                        void loadCityFromPicker(cityName);
                      }}
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
                  </label>
                )}

                <label className="field">
                  <span>City name</span>
                  <input
                    className="input"
                    value={cityForm.name}
                    onChange={(event) => setCityForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Example: Lisbon"
                  />
                </label>

                <div className="map-editor-location-summary">
                  <strong>{selectedCityLabel}</strong>
                  <span>
                    {selectedCityHasLocation
                      ? `Map ${cityForm.mapPixelX}, ${cityForm.mapPixelY} · World ${cityForm.worldX}, ${cityForm.worldY}`
                      : 'No map position yet. Click on the map to place it.'}
                  </span>
                </div>

                <button
                  type="button"
                  className="map-editor-collapse-button"
                  onClick={() => setShowCityAdvanced((current) => !current)}
                >
                  {showCityAdvanced ? 'Hide advanced city fields' : 'Show advanced city fields'}
                </button>

                {showCityAdvanced && (
                  <div className="map-editor-advanced-panel">
                    <label className="field">
                      <span>Aliases</span>
                      <input
                        className="input"
                        value={cityForm.aliases}
                        onChange={(event) => setCityForm((current) => ({ ...current, aliases: event.target.value }))}
                        placeholder="Use | between aliases"
                      />
                    </label>

                    <div className="map-editor-quick-grid">
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
                    </div>

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

                            const updated = {
                              ...cityFormRef.current,
                              mapPixelX: normalized,
                              worldX: normalized === '' ? '' : mapToWorld(normalized)
                            };

                            const wasExistingCity = Boolean(cityFormRef.current.originalName);
                            cityFormRef.current = updated;
                            setCityForm(updated);

                            if (wasExistingCity) {
                              markCityDirty();
                            }
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

                            const updated = {
                              ...cityFormRef.current,
                              mapPixelY: value,
                              worldY: value === '' ? '' : mapToWorld(value)
                            };

                            const wasExistingCity = Boolean(cityFormRef.current.originalName);
                            cityFormRef.current = updated;
                            setCityForm(updated);

                            if (wasExistingCity) {
                              markCityDirty();
                            }
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
                  </div>
                )}
              </div>
            )}

            {mode === 'region' && (
              <div className="map-editor-form map-editor-compact-form">
                <div className="map-editor-form-header">
                  <div>
                    <h3>Region editor</h3>
                    <p className="muted">
                      Choose MainRegion, SubRegion, or SeaTradeRegion. Right-click removes the last point.
                    </p>
                  </div>

                  <span className="badge badge-info">
                    {regionPointCount} point{regionPointCount === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="map-editor-action-bar">
                  <button type="button" className="button button-primary" onClick={saveRegion}>
                    <Save size={16} /> Save region
                  </button>

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      setRegionForm(emptyRegionForm());
                      showSaveNotice('Ready to draw a new region.', 'info');
                    }}
                  >
                    <Plus size={16} /> New
                  </button>

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={deleteRegion}
                    disabled={!regionForm.name || !isEditableRegionType(regionForm.type)}
                  >
                    <Trash2 size={16} /> Delete
                  </button>
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

                <div className="map-editor-quick-grid">
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
                    </select>
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
                </div>

                <div className="map-editor-location-summary">
                  <strong>{activeRegionLabel}</strong>
                  <span>
                    Click the map to add points. Right-click removes the last point. Saving updates every city inside this region and clears cities outside it that used this region.
                  </span>
                </div>

                <button
                  type="button"
                  className="map-editor-collapse-button"
                  onClick={() => setShowRegionAdvanced((current) => !current)}
                >
                  {showRegionAdvanced ? 'Hide advanced region fields' : 'Show advanced region fields'}
                </button>

                {showRegionAdvanced && (
                  <div className="map-editor-advanced-panel">
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
                      <span>Parent region</span>
                      <input
                        className="input"
                        value={regionForm.parentRegion}
                        onChange={(event) => setRegionForm((current) => ({ ...current, parentRegion: event.target.value }))}
                        placeholder="Optional"
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
                          onClick={() => {
                            setRegionForm((current) => ({ ...current, points: [] }));
                            showSaveNotice('Cleared region points.', 'info');
                          }}
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

                    <button type="button" className="button button-secondary" onClick={loadRegions}>
                      <RefreshCw size={16} /> Reload regions
                    </button>
                  </div>
                )}
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
