const CONFIGURED_API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const DEFAULT_API_BASE = 'https://localhost:5001';
const FALLBACK_API_BASE = 'http://localhost:5000';
const API_BASE_CANDIDATES = CONFIGURED_API_BASE
  ? [CONFIGURED_API_BASE]
  : [DEFAULT_API_BASE, FALLBACK_API_BASE];
const API_BASE_PROBE_TIMEOUT_MS = 1500;

let currentApiBase = API_BASE_CANDIDATES[0];
let resolvedApiBasePromise = null;

function normalizeApiBase(value) {
  return String(value || '').replace(/\/+$/, '');
}

async function canReachApiBase(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_BASE_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      cache: 'no-store',
      signal: controller.signal
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function getCurrentApiBase() {
  return currentApiBase;
}

export async function resolveApiBase({ force = false } = {}) {
  if (!force && resolvedApiBasePromise) {
    return resolvedApiBasePromise;
  }

  resolvedApiBasePromise = (async () => {
    for (const candidate of API_BASE_CANDIDATES.map(normalizeApiBase)) {
      if (await canReachApiBase(candidate)) {
        currentApiBase = candidate;
        return candidate;
      }
    }

    currentApiBase = normalizeApiBase(API_BASE_CANDIDATES[0]);
    return currentApiBase;
  })();

  return resolvedApiBasePromise;
}
