import React from 'react';

export const DEFAULT_WORLD_WIDTH = 16384;
export const UNKNOWN_DISTANCE_SORT = Number.MAX_SAFE_INTEGER;

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function sanitizeCityName(value) {
  if (!value) return '';
  return String(value).split('(')[0].split('\n')[0].split('\r')[0].trim();
}

export function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function findCityByName(cities, cityName) {
  if (!cityName) return null;

  return (
    cities.find((city) => String(city.name || '').toLowerCase() === String(cityName).toLowerCase()) ||
    null
  );
}

export function getCityWorldCoordinate(city) {
  if (!city) return null;

  const x = Number(city.worldX ?? city.WorldX);
  const y = Number(city.worldY ?? city.WorldY);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x, y };
}

export function getRawCoordinate(point) {
  if (!point) return null;

  const x = Number(point.x ?? point.X);
  const y = Number(point.y ?? point.Y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x, y };
}

export function normalizeWorldX(value, worldWidth = DEFAULT_WORLD_WIDTH) {
  let normalized = Number(value || 0) % worldWidth;
  if (normalized < 0) normalized += worldWidth;
  return normalized;
}

export function getWrappedWorldDistance(from, to, worldWidth = DEFAULT_WORLD_WIDTH) {
  if (!from || !to) return null;

  const fromX = Number(from.x);
  const fromY = Number(from.y);
  const toX = Number(to.x);
  const toY = Number(to.y);

  if (
    !Number.isFinite(fromX) ||
    !Number.isFinite(fromY) ||
    !Number.isFinite(toX) ||
    !Number.isFinite(toY) ||
    !Number.isFinite(worldWidth) ||
    worldWidth <= 0
  ) {
    return null;
  }

  let dx = normalizeWorldX(toX, worldWidth) - normalizeWorldX(fromX, worldWidth);
  if (dx > worldWidth / 2) dx -= worldWidth;
  if (dx < -worldWidth / 2) dx += worldWidth;

  return Math.hypot(dx, toY - fromY);
}

export function formatWorldDistance(distance) {
  if (!Number.isFinite(distance)) return 'Unknown';
  return `${Math.round(distance).toLocaleString()} nm`;
}

export function distanceSortValue(distance) {
  return Number.isFinite(distance) ? distance : UNKNOWN_DISTANCE_SORT;
}

export function resolveTradingOrigin({ cities, latestCity, latestCoordinate, manualCityName }) {
  const manualName = String(manualCityName || '').trim();

  if (manualName) {
    const city = findCityByName(cities, manualName);
    const coordinate = getCityWorldCoordinate(city);

    return {
      mode: 'manual',
      label: coordinate && city ? city.name : 'Origin unknown',
      city,
      coordinate,
      isKnown: Boolean(coordinate)
    };
  }

  const currentCityInfo = getCurrentCityInfo(cities, latestCity);
  const currentCityCoordinate = getCityWorldCoordinate(currentCityInfo.city);

  if (currentCityCoordinate) {
    return {
      mode: 'current-city',
      label: `Auto: ${currentCityInfo.city.name}`,
      city: currentCityInfo.city,
      coordinate: currentCityCoordinate,
      isKnown: true
    };
  }

  const rawCoordinate = getRawCoordinate(latestCoordinate);

  if (rawCoordinate) {
    return {
      mode: 'raw-coordinate',
      label: `Auto: OCR X ${Math.round(rawCoordinate.x)} / Y ${Math.round(rawCoordinate.y)}`,
      city: currentCityInfo.city || null,
      coordinate: rawCoordinate,
      isKnown: true
    };
  }

  return {
    mode: 'unknown',
    label: 'Origin unknown',
    city: null,
    coordinate: null,
    isKnown: false
  };
}

export function getCityDistanceFromOrigin(cities, cityName, origin, worldWidth = DEFAULT_WORLD_WIDTH) {
  const city = findCityByName(cities, cityName);
  const coordinate = getCityWorldCoordinate(city);
  const distance = origin?.coordinate && coordinate
    ? getWrappedWorldDistance(origin.coordinate, coordinate, worldWidth)
    : null;

  return {
    city,
    coordinate,
    distance,
    distanceSort: distanceSortValue(distance),
    distanceLabel: Number.isFinite(distance) ? formatWorldDistance(distance) : 'Unknown'
  };
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export function ageText(value) {
  if (!value) return 'Unknown age';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown age';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export function freshnessTone(value) {
  if (!value) return 'unknown';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';

  const diffHours = (Date.now() - date.getTime()) / 3600000;

  if (diffHours <= 2) return 'fresh';
  if (diffHours <= 24) return 'ok';
  return 'old';
}

export function isFreshEnough(value) {
  const tone = freshnessTone(value);
  return tone === 'fresh' || tone === 'ok';
}

export function getCurrentCityInfo(cities, latestCity) {
  const name = sanitizeCityName(latestCity?.city);
  if (!name) return { name: '', city: null };

  const city = findCityByName(cities, name);

  return { name, city: city || null };
}

export function TradingOriginSelector({
  cities,
  manualCityName,
  onManualCityNameChange,
  origin,
  datalistId = 'trading-origin-city-options'
}) {
  const cityNames = uniqueSorted(cities.map((city) => city.name));

  return (
    <label className="field">
      <span>Origin</span>
      <input
        className="input"
        list={datalistId}
        value={manualCityName}
        onChange={(event) => onManualCityNameChange(event.target.value)}
        placeholder={origin?.label || 'Auto'}
      />
      <datalist id={datalistId}>
        {cityNames.map((cityName) => (
          <option key={cityName} value={cityName} />
        ))}
      </datalist>
      <small>{manualCityName ? origin?.label || 'Origin unknown' : origin?.label || 'Auto'}</small>
    </label>
  );
}

export function PriceAgeBadge({ value }) {
  const tone = freshnessTone(value);
  return <span className={`price-age price-age-${tone}`}>{ageText(value)}</span>;
}
