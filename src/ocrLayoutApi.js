import { getCurrentApiBase, resolveApiBase } from './apiBase.js';

function buildQuery(query = {}) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    const text = String(value).trim();
    if (text !== '') params.set(key, text);
  });

  return params.toString();
}

function withQuery(path, query = {}) {
  const queryString = buildQuery(query);
  return queryString ? `${path}?${queryString}` : path;
}

async function request(path, options = {}) {
  const apiBase = await resolveApiBase();
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

export const ocrLayoutApi = {
  get baseUrl() {
    return getCurrentApiBase();
  },

  health: () => request('/api/health'),

  getGameWindow: () => request('/api/system/game-window'),

  selectWindowUnderMouseDelayed: ({ seconds = 5 } = {}) =>
    request(withQuery('/api/system/select-window-under-mouse-delayed', { seconds })),

  forgetRememberedGameWindow: () =>
    request('/api/system/forget-remembered-game-window', {
      method: 'POST'
    }),

  getLayout: () => request('/api/ocr-layout'),

  saveLayout: (layout) =>
    request('/api/ocr-layout', {
      method: 'POST',
      body: JSON.stringify({ layout })
    }),

  testBox: ({ kind, preprocess = true, box }) =>
    request('/api/ocr-layout/test-box', {
      method: 'POST',
      body: JSON.stringify({
        kind,
        preprocess,
        box
      })
    }),

  scoreCalibration: () =>
    request('/api/ocr-layout/calibration-score', {
      method: 'POST'
    })
};
