const DEFAULT_API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'https://localhost:5001';

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
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

export const ocrLayoutApi = {
  baseUrl: DEFAULT_API_BASE,

  health: () => request('/api/health'),

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
    })
};
