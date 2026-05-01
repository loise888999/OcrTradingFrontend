const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://localhost:5001';

async function request(path, options = {}) {
  const response = await fetch(`${DEFAULT_API_BASE}${path}`, {
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
  if (contentType.includes('application/json')) return response.json();
  return response.text();
}

function params(query) {
  const p = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') p.set(key, String(value));
  });
  return p.toString();
}

export const api = {
  baseUrl: DEFAULT_API_BASE,
  health: () => request('/api/health'),
  getMousePosition: () => request('/api/system/mouse-position'),
  getSettings: () => request('/api/settings'),
  saveOcrZone: (zone) => request('/api/settings/ocr-zone', { method: 'POST', body: JSON.stringify(zone) }),
  saveSetting: (setting) => request('/api/settings/value', { method: 'POST', body: JSON.stringify(setting) }),
  startOcr: () => request('/api/ocr/start', { method: 'POST' }),
  stopOcr: () => request('/api/ocr/stop', { method: 'POST' }),
  getOcrStatus: () => request('/api/ocr/status'),
  getLatestCoordinates: ({ take = 20 } = {}) =>
    request(`/api/coordinates/latest?${params({ take })}`),
  getLatestCity: () => request('/api/cities/latest'),

  getGameWindow: () => request('/api/system/game-window'),

  getWindowUnderMouseDelayed: ({ seconds = 5 } = {}) =>
    request(`/api/system/window-under-mouse-delayed?${params({ seconds })}`),

  selectWindowUnderMouseDelayed: ({ seconds = 5 } = {}) =>
    request(`/api/system/select-window-under-mouse-delayed?${params({ seconds })}`),


  clearSelectedGameWindow: () =>
    request('/api/system/clear-selected-game-window', {
      method: 'POST'
    }),
  getCities: () => request('/api/cities'),
  getGameWindow: () => request('/api/system/game-window'),
  getTradeGoods: () => request('/api/trade-goods'),
  getTradeGoodSuggestions: ({ name, take = 8 }) => request(`/api/trade-goods/suggestions?${params({ name, take })}`),
  addTradeGood: (payload) => request('/api/trade-goods', { method: 'POST', body: JSON.stringify(payload) }),
  getPendingTradeGoods: ({ includeResolved = false } = {}) => request(`/api/pending-trade-goods?${params({ includeResolved })}`),
  acceptPendingTradeGood: (id, payload) => request(`/api/pending-trade-goods/${id}/accept`, { method: 'POST', body: JSON.stringify(payload) }),
  dismissPendingTradeGood: (id) => request(`/api/pending-trade-goods/${id}/dismiss`, { method: 'POST' }),
  getPriceHistory: ({ city = '', item = '', tradeType = '', take = 250 } = {}) =>
    request(`/api/prices/history?${params({ city, item, tradeType, take })}`),
  searchTrading: ({ city = '', item = '', tradeType = 'Any', take = 250 } = {}) =>
    request(`/api/trading/search?${params({ city, item, tradeType, take })}`),
  getCityGoods: ({ city, tradeType = 'Any', take = 250 }) =>
    request(`/api/trading/city-goods?${params({ city, tradeType, take })}`),
  getGoodLocations: ({ item, tradeType = 'Any', take = 250 }) =>
    request(`/api/trading/good-locations?${params({ item, tradeType, take })}`),
  getRecommendations: () => request('/api/trading/recommendations'),
  importPricesCsv: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${DEFAULT_API_BASE}/api/import/prices.csv`, { method: 'POST', body: formData });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
    }
    return response.json();
  },
  exportPricesUrl: () => `${DEFAULT_API_BASE}/api/export/prices.csv`
};
