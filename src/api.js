const DEFAULT_API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'https://localhost:5001';

function buildQuery(query = {}) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      const joined = value
        .filter((item) => item !== undefined && item !== null && String(item).trim() !== '')
        .join('|');

      if (joined) params.set(key, joined);
      return;
    }

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
  const response = await fetch(`${DEFAULT_API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

export const api = {
  baseUrl: DEFAULT_API_BASE,

  // Health
  health: () => request('/api/health'),

  // System / window
  getGameWindow: () => request('/api/system/game-window'),

  getWindowUnderMouseDelayed: ({ seconds = 5 } = {}) =>
    request(withQuery('/api/system/window-under-mouse-delayed', { seconds })),

  selectWindowUnderMouseDelayed: ({ seconds = 5 } = {}) =>
    request(withQuery('/api/system/select-window-under-mouse-delayed', { seconds })),

  clearSelectedGameWindow: () =>
    request('/api/system/clear-selected-game-window', {
      method: 'POST'
    }),

  forgetRememberedGameWindow: () =>
    request('/api/system/forget-remembered-game-window', {
      method: 'POST'
    }),

  // City editor
  addCity: (payload) =>
    request('/api/cities', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateCity: (name, payload) =>
    request(`/api/cities/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  deleteCity: (name) =>
    request(`/api/cities/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    }),

  importCitiesCsv: async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${DEFAULT_API_BASE}/api/import/cities.csv`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
    }

    return response.json();
  },

  exportCitiesUrl: () => `${DEFAULT_API_BASE}/api/export/cities.csv`,

  // Map region editor
  getMapRegions: () => request('/api/map-regions'),

  addMapRegion: (payload) =>
    request('/api/map-regions', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateMapRegion: (id, payload) =>
    request(`/api/map-regions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  deleteMapRegion: (id) =>
    request(`/api/map-regions/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    }),

  // Settings
  getSettings: () => request('/api/settings'),

  saveSetting: (setting) =>
    request('/api/settings/value', {
      method: 'POST',
      body: JSON.stringify(setting)
    }),

  // OCR controls
  startOcr: () =>
    request('/api/ocr/start', {
      method: 'POST'
    }),

  stopOcr: () =>
    request('/api/ocr/stop', {
      method: 'POST'
    }),

  getOcrStatus: () => request('/api/ocr/status'),

  // OCR results
  getLatestCoordinates: ({ take = 20 } = {}) =>
    request(withQuery('/api/coordinates/latest', { take })),

  getLatestCity: () => request('/api/cities/latest'),

  getPriceHistory: ({ city = '', item = '', tradeType = '', take = 250 } = {}) =>
    request(withQuery('/api/prices/history', { city, item, tradeType, take })),

  // Catalogs
  getCities: () => request('/api/cities'),

  getTradeGoods: () => request('/api/trade-goods'),

  getTradeGoodSuggestions: ({ name, take = 8 } = {}) =>
    request(withQuery('/api/trade-goods/suggestions', { name, take })),

  addTradeGood: (payload) =>
    request('/api/trade-goods', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getPendingTradeGoods: ({ includeResolved = false } = {}) =>
    request(withQuery('/api/pending-trade-goods', { includeResolved })),

  acceptPendingTradeGood: (id, payload) =>
    request(`/api/pending-trade-goods/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  dismissPendingTradeGood: (id) =>
    request(`/api/pending-trade-goods/${id}/dismiss`, {
      method: 'POST'
    }),

  // Regions
  getMainRegions: () => request('/api/regions/main'),

  getSubRegions: ({ mainRegion } = {}) =>
    request(withQuery('/api/regions/sub', { mainRegion })),

  getSeaTradeRegions: ({ mainRegion, subRegion } = {}) =>
    request(withQuery('/api/regions/sea-trade', { mainRegion, subRegion })),

  // Trading search
  searchTrading: ({
    city = '',
    item = '',
    tradeType = '',
    mainRegion = '',
    subRegion = '',
    seaTradeRegion = '',
    take = 250
  } = {}) =>
    request(
      withQuery('/api/trading/search', {
        city,
        item,
        tradeType,
        mainRegion,
        subRegion,
        seaTradeRegion,
        take
      })
    ),

  getCityGoods: ({
    city = '',
    tradeType = '',
    mainRegion = '',
    subRegion = '',
    seaTradeRegion = '',
    take = 250
  } = {}) =>
    request(
      withQuery('/api/trading/city-goods', {
        city,
        tradeType,
        mainRegion,
        subRegion,
        seaTradeRegion,
        take
      })
    ),

  getGoodLocations: ({
    item = '',
    tradeType = '',
    mainRegion = '',
    subRegion = '',
    seaTradeRegion = '',
    take = 250
  } = {}) =>
    request(
      withQuery('/api/trading/good-locations', {
        item,
        tradeType,
        mainRegion,
        subRegion,
        seaTradeRegion,
        take
      })
    ),

  // New trading logic
  lookupTradeGoods: ({
    item = '',
    type = '',
    mainRegion = '',
    subRegion = '',
    take = 250
  } = {}) =>
    request(
      withQuery('/api/trading/good-lookup', {
        item,
        type,
        mainRegion,
        subRegion,
        take
      })
    ),

  getKnownPrices: ({
    item = '',
    type = '',
    tradeType = '',
    mainRegion = '',
    subRegion = '',
    seaTradeRegion = '',
    take = 500
  } = {}) =>
    request(
      withQuery('/api/trading/known-prices', {
        item,
        type,
        tradeType,
        mainRegion,
        subRegion,
        seaTradeRegion,
        take
      })
    ),

  getAdvancedRoutes: ({
    item = '',
    type = '',
    buyRegions = [],
    sellRegions = [],
    minProfit = 1,
    routesPerItem = 25,
    take = 100
  } = {}) =>
    request(
      withQuery('/api/trading/advanced-routes', {
        item,
        type,
        buyRegions,
        sellRegions,
        minProfit,
        routesPerItem,
        take
      })
    ),

  getMultiGoodRoutes: ({
    type = '',
    buyRegions = [],
    sellRegions = [],
    minProfitPerGood = 1,
    minTotalProfit = 1,
    minItems = 2,
    take = 100
  } = {}) =>
    request(
      withQuery('/api/trading/multi-good-routes', {
        type,
        buyRegions,
        sellRegions,
        minProfitPerGood,
        minTotalProfit,
        minItems,
        take
      })
    ),

  getRecommendations: ({
    mainRegion = '',
    subRegion = '',
    seaTradeRegion = '',
    buyMainRegion = '',
    buySubRegion = '',
    buySeaTradeRegion = '',
    sellMainRegion = '',
    sellSubRegion = '',
    sellSeaTradeRegion = '',
    item = '',
    routesPerItem = 1,
    take = 50,
    minProfit = 1
  } = {}) =>
    request(
      withQuery('/api/trading/recommendations', {
        mainRegion,
        subRegion,
        seaTradeRegion,
        buyMainRegion,
        buySubRegion,
        buySeaTradeRegion,
        sellMainRegion,
        sellSubRegion,
        sellSeaTradeRegion,
        item,
        routesPerItem,
        take,
        minProfit
      })
    ),

  // CSV import / export
  importPricesCsv: async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${DEFAULT_API_BASE}/api/import/prices.csv`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
    }

    return response.json();
  },

  exportPricesUrl: () => `${DEFAULT_API_BASE}/api/export/prices.csv`,

  importTradeGoodsCsv: async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${DEFAULT_API_BASE}/api/import/trade-goods.csv`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
    }

    return response.json();
  },

  exportTradeGoodsUrl: () => `${DEFAULT_API_BASE}/api/export/trade-goods.csv`
};
