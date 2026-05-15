import React from 'react';

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

  const city = cities.find(
    (item) => String(item.name || '').toLowerCase() === name.toLowerCase()
  );

  return { name, city: city || null };
}

export function PriceAgeBadge({ value }) {
  const tone = freshnessTone(value);
  return <span className={`price-age price-age-${tone}`}>{ageText(value)}</span>;
}
