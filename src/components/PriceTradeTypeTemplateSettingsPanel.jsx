import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Crosshair, Gauge, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api.js';

const DEFAULT_SETTINGS = {
  priceTradeTypeReadMode: 'NormalOcr',
  priceTradeTypeTemplateFallbackToNormalOcr: true,
  priceTradeTypeTemplateAutoProfileEnabled: true,
  priceTradeTypeTemplateMaxTemplatesPerType: 5,
  priceTradeTypeTemplateMaxScore: 0.18,
  priceTradeTypeTemplateCountFailedReadsForRecalibration: true,
  priceTradeTypeTemplateRecalibrationFailureLimit: 5,
  priceTradeTypeTemplateProbeIntervalMs: 250
};

function readSetting(source, key) {
  if (!source) return undefined;
  const pascal = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  return source[key] ?? source[pascal];
}

function normalizeSettings(value) {
  return {
    priceTradeTypeReadMode:
      readSetting(value, 'priceTradeTypeReadMode') || DEFAULT_SETTINGS.priceTradeTypeReadMode,
    priceTradeTypeTemplateFallbackToNormalOcr: Boolean(
      readSetting(value, 'priceTradeTypeTemplateFallbackToNormalOcr') ??
        DEFAULT_SETTINGS.priceTradeTypeTemplateFallbackToNormalOcr
    ),
    priceTradeTypeTemplateAutoProfileEnabled: Boolean(
      readSetting(value, 'priceTradeTypeTemplateAutoProfileEnabled') ??
        DEFAULT_SETTINGS.priceTradeTypeTemplateAutoProfileEnabled
    ),
    priceTradeTypeTemplateMaxTemplatesPerType: Number(
      readSetting(value, 'priceTradeTypeTemplateMaxTemplatesPerType') ??
        DEFAULT_SETTINGS.priceTradeTypeTemplateMaxTemplatesPerType
    ),
    priceTradeTypeTemplateMaxScore: Number(
      readSetting(value, 'priceTradeTypeTemplateMaxScore') ??
        DEFAULT_SETTINGS.priceTradeTypeTemplateMaxScore
    ),
    priceTradeTypeTemplateCountFailedReadsForRecalibration: Boolean(
      readSetting(value, 'priceTradeTypeTemplateCountFailedReadsForRecalibration') ??
        DEFAULT_SETTINGS.priceTradeTypeTemplateCountFailedReadsForRecalibration
    ),
    priceTradeTypeTemplateRecalibrationFailureLimit: Number(
      readSetting(value, 'priceTradeTypeTemplateRecalibrationFailureLimit') ??
        DEFAULT_SETTINGS.priceTradeTypeTemplateRecalibrationFailureLimit
    ),
    priceTradeTypeTemplateProbeIntervalMs: Number(
      readSetting(value, 'priceTradeTypeTemplateProbeIntervalMs') ??
        DEFAULT_SETTINGS.priceTradeTypeTemplateProbeIntervalMs
    )
  };
}

function normalizeBoxTest(value) {
  if (!value) return null;
  return {
    region: readSetting(value, 'region') || '',
    capturedAtUtc: readSetting(value, 'capturedAtUtc') || '',
    textVisible: Boolean(readSetting(value, 'textVisible')),
    contrast: Number(readSetting(value, 'contrast') || 0),
    edgePixelsPercent: Number(readSetting(value, 'edgePixelsPercent') || 0),
    imageDataUrl: readSetting(value, 'imageDataUrl') || '',
    normalOcrRawText: readSetting(value, 'normalOcrRawText') || '',
    normalOcrDetectedTradeType: readSetting(value, 'normalOcrDetectedTradeType') || 'Unknown',
    fastTemplateDetectedTradeType: readSetting(value, 'fastTemplateDetectedTradeType') || 'Unknown',
    fastTemplateSuccess: Boolean(readSetting(value, 'fastTemplateSuccess')),
    fastTemplateScore: readSetting(value, 'fastTemplateScore'),
    fastTemplateReason: readSetting(value, 'fastTemplateReason') || '',
    learnedTemplate: Boolean(readSetting(value, 'learnedTemplate')),
    debugImagePath: readSetting(value, 'debugImagePath') || ''
  };
}

function normalizeProfile(value) {
  const profile = value?.profile || value?.Profile || value || {};
  return {
    profileReady: Boolean(readSetting(profile, 'profileReady')),
    profileId: readSetting(profile, 'profileId') || '',
    buyReady: Boolean(readSetting(profile, 'buyReady')),
    sellReady: Boolean(readSetting(profile, 'sellReady')),
    missingTemplates: readSetting(profile, 'missingTemplates') || [],
    buyTemplateCount: Number(readSetting(profile, 'buyTemplateCount') || 0),
    sellTemplateCount: Number(readSetting(profile, 'sellTemplateCount') || 0),
    sampleCount: Number(readSetting(profile, 'sampleCount') || 0),
    failedReadCount: Number(readSetting(profile, 'failedReadCount') || 0),
    needsRecalibration: Boolean(readSetting(profile, 'needsRecalibration')),
    lastMessage: readSetting(profile, 'lastMessage') || '',
    autoProfileEnabled: Boolean(readSetting(profile, 'autoProfileEnabled')),
    updatedAtUtc: readSetting(profile, 'updatedAtUtc') || '',
    lastSuccessfulBuySetupProof: normalizeBoxTest(readSetting(profile, 'lastSuccessfulBuySetupProof')),
    lastSuccessfulSellSetupProof: normalizeBoxTest(readSetting(profile, 'lastSuccessfulSellSetupProof')),
    lastAttempts: readSetting(profile, 'lastAttempts') || []
  };
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(3) : 'n/a';
}

function StatusPill({ ok, children }) {
  return (
    <span className={`coordinate-ocr-pill ${ok ? 'ok' : 'warn'}`}>
      {ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      {children}
    </span>
  );
}

export default function PriceTradeTypeTemplateSettingsPanel({ run }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState(normalizeProfile(null));
  const [savingKey, setSavingKey] = useState('');
  const [boxTests, setBoxTests] = useState({
    Buy: null,
    Sell: null
  });

  const load = useCallback(async () => {
    const loaded = await run(
      () => api.getPriceTradeTypeTemplateStatus(),
      'Could not load Buy/Sell fast OCR settings'
    );

    if (!loaded) return;

    setSettings(normalizeSettings(loaded.settings || loaded.Settings));
    setProfile(normalizeProfile(loaded.profile || loaded.Profile));
  }, [run]);

  useEffect(() => {
    load();
  }, [load]);

  const savePatch = async (key, value) => {
    const next = {
      ...settings,
      [key]: value
    };

    setSettings(next);
    setSavingKey(key);

    const saved = await run(
      () => api.updatePriceTradeTypeTemplateSettings(next),
      'Could not save Buy/Sell fast OCR settings'
    );

    setSavingKey('');

    if (saved) {
      setSettings(normalizeSettings(saved));
      await load();
    }
  };

  const setAutoProfile = async (enabled) => {
    setSavingKey('autoProfile');

    const saved = await run(
      () =>
        enabled
          ? api.startPriceTradeTypeTemplateAutoProfile()
          : api.stopPriceTradeTypeTemplateAutoProfile(),
      enabled ? 'Could not start Buy/Sell auto build' : 'Could not stop Buy/Sell auto build'
    );

    setSavingKey('');

    if (saved) await load();
  };

  const deleteProfile = async () => {
    setSavingKey('deleteProfile');

    const deleted = await run(
      () => api.deletePriceTradeTypeTemplateProfile(),
      'Could not delete Buy/Sell template profile'
    );

    setSavingKey('');

    if (deleted) {
      setBoxTests({ Buy: null, Sell: null });
      await load();
    }
  };

  const testBox = async (region, learnIfNormalOcrMatches = false) => {
    setSavingKey(`${region}-${learnIfNormalOcrMatches ? 'learn' : 'test'}`);

    const result = await run(
      () => api.testPriceTradeTypeTemplateBox({ region, learnIfNormalOcrMatches }),
      learnIfNormalOcrMatches
        ? `Could not learn ${region} template`
        : `Could not test ${region} box`
    );

    setSavingKey('');

    if (result) {
      setBoxTests((current) => ({
        ...current,
        [region]: normalizeBoxTest(result)
      }));
      await load();
    }
  };

  const statusTone = useMemo(() => {
    if (settings.priceTradeTypeReadMode !== 'FastTemplate') return 'Normal OCR active';
    if (!profile.profileReady) return 'Profile incomplete';
    if (profile.needsRecalibration) return 'Recalibration needed';
    return 'Fast template active';
  }, [settings.priceTradeTypeReadMode, profile.profileReady, profile.needsRecalibration]);

  return (
    <div className="coordinate-ocr-settings-panel">
      <div className="coordinate-ocr-header">
        <div>
          <h3>
            <Gauge size={20} /> Buy/Sell fast OCR
          </h3>
          <p className="muted">
            Learns whole-box templates for Buy and Sell validation regions, then skips normal OCR when a match is strong.
          </p>
        </div>

        <div className="button-row">
          <button className="button button-secondary" type="button" onClick={load}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => window.open('/?calibration=1&box=buyValidationBox', '_blank', 'noopener,noreferrer')}
          >
            <Crosshair size={16} /> Buy box
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => window.open('/?calibration=1&box=sellValidationBox', '_blank', 'noopener,noreferrer')}
          >
            <Crosshair size={16} /> Sell box
          </button>
        </div>
      </div>

      <div className="coordinate-ocr-status-row">
        <StatusPill ok={settings.priceTradeTypeReadMode === 'NormalOcr' || (profile.profileReady && !profile.needsRecalibration)}>
          {statusTone}
        </StatusPill>
        <span>Buy: {profile.buyReady ? `${profile.buyTemplateCount} templates` : 'Missing'}</span>
        <span>Sell: {profile.sellReady ? `${profile.sellTemplateCount} templates` : 'Missing'}</span>
        <span>Failed reads: {profile.failedReadCount}</span>
        <span>Updated: {formatDate(profile.updatedAtUtc)}</span>
      </div>

      {profile.lastMessage && (
        <div className="coordinate-ocr-message">
          {profile.lastMessage}
        </div>
      )}

      <div className="coordinate-ocr-mode-grid">
        <button
          type="button"
          className={`coordinate-ocr-mode-card ${settings.priceTradeTypeReadMode === 'NormalOcr' ? 'active' : ''}`}
          onClick={() => savePatch('priceTradeTypeReadMode', 'NormalOcr')}
          disabled={savingKey === 'priceTradeTypeReadMode'}
        >
          <strong>Normal OCR</strong>
          <span>Use current OCR to detect Buy/Sell validation text.</span>
        </button>

        <button
          type="button"
          className={`coordinate-ocr-mode-card ${settings.priceTradeTypeReadMode === 'FastTemplate' ? 'active' : ''}`}
          onClick={() => savePatch('priceTradeTypeReadMode', 'FastTemplate')}
          disabled={savingKey === 'priceTradeTypeReadMode'}
        >
          <strong>Fast template</strong>
          <span>Match current Buy/Sell box against saved whole-box templates.</span>
        </button>
      </div>

      <div className="coordinate-ocr-calibration-card">
        <div className="coordinate-ocr-calibration-header">
          <div>
            <h4>Auto build templates</h4>
            <p className="muted">Keep auto build on, open Buy and Sell menus once, and normal OCR will save templates when it reads the label.</p>
          </div>
          <StatusPill ok={settings.priceTradeTypeTemplateAutoProfileEnabled}>
            {settings.priceTradeTypeTemplateAutoProfileEnabled ? 'Auto build on' : 'Auto build off'}
          </StatusPill>
        </div>

        <div className="coordinate-ocr-auto-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={savingKey === 'autoProfile' || settings.priceTradeTypeTemplateAutoProfileEnabled}
            onClick={() => setAutoProfile(true)}
          >
            <CheckCircle2 size={16} /> Start auto build
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={savingKey === 'autoProfile' || !settings.priceTradeTypeTemplateAutoProfileEnabled}
            onClick={() => setAutoProfile(false)}
          >
            <AlertCircle size={16} /> Stop auto build
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={savingKey === 'deleteProfile'}
            onClick={deleteProfile}
          >
            <Trash2 size={16} /> Delete profile
          </button>
        </div>

        <div className="coordinate-ocr-profile-meta">
          <span>Missing: {profile.missingTemplates.length ? profile.missingTemplates.join(', ') : 'None'}</span>
          <span>Samples: {profile.sampleCount}</span>
          <span>Score limit: {settings.priceTradeTypeTemplateMaxScore}</span>
          <span>Template cap: {settings.priceTradeTypeTemplateMaxTemplatesPerType}</span>
        </div>
      </div>

      <div className="coordinate-ocr-calibration-card">
        <div className="coordinate-ocr-calibration-header">
          <div>
            <h4>Setup helper</h4>
            <p className="muted">Capture each validation box, preview what backend sees, and learn only when setup OCR identifies the expected label.</p>
          </div>
        </div>

        <div className="price-trade-type-helper-grid">
          {['Buy', 'Sell'].map((region) => {
            const persisted = region === 'Buy'
              ? profile.lastSuccessfulBuySetupProof
              : profile.lastSuccessfulSellSetupProof;
            const result = boxTests[region] || persisted;
            const normalMatches = result?.normalOcrDetectedTradeType === region;
            return (
              <div className="price-trade-type-helper-card" key={region}>
                <div className="coordinate-ocr-calibration-header">
                  <div>
                    <h4>{region} box</h4>
                    <p className="muted">
                      {result
                        ? `Setup OCR sees ${result.normalOcrDetectedTradeType}. Fast sees ${result.fastTemplateDetectedTradeType}.`
                        : 'No saved setup capture yet.'}
                    </p>
                  </div>
                  <StatusPill ok={Boolean(result && normalMatches)}>
                    {result && normalMatches ? `${region} identified` : 'Needs test'}
                  </StatusPill>
                </div>

                {result?.imageDataUrl && (
                  <div className="price-trade-type-preview">
                    <img src={result.imageDataUrl} alt={`${region} validation box capture`} />
                  </div>
                )}

                <div className="coordinate-ocr-profile-meta">
                  <span>Visible: {result ? (result.textVisible ? 'Yes' : 'No') : 'Unknown'}</span>
                  <span>Normal OCR: {result?.normalOcrDetectedTradeType || 'Unknown'}</span>
                  <span>Raw: {result?.normalOcrRawText || 'None'}</span>
                  <span>Fast score: {formatScore(result?.fastTemplateScore)}</span>
                  <span>Fast reason: {result?.fastTemplateReason || 'None'}</span>
                  <span>Learned: {result?.learnedTemplate ? 'Yes' : 'No'}</span>
                  <span>Saved: {result?.capturedAtUtc ? formatDate(result.capturedAtUtc) : 'No'}</span>
                </div>

                <div className="coordinate-ocr-auto-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={savingKey === `${region}-test`}
                    onClick={() => testBox(region, false)}
                  >
                    <RefreshCw size={16} /> Test {region} box
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={savingKey === `${region}-learn` || !normalMatches}
                    onClick={() => testBox(region, true)}
                  >
                    <CheckCircle2 size={16} /> Learn {region} template
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="coordinate-ocr-options-grid">
        <label className="inline-checkbox coordinate-ocr-option">
          <input
            type="checkbox"
            checked={settings.priceTradeTypeTemplateCountFailedReadsForRecalibration}
            onChange={(event) =>
              savePatch('priceTradeTypeTemplateCountFailedReadsForRecalibration', event.target.checked)
            }
          />
          <span>Count visible fast failures toward recalibration</span>
        </label>
      </div>

      <div className="coordinate-ocr-number-grid">
        <label className="field">
          <span>Fast match max score</span>
          <input
            className="input"
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={settings.priceTradeTypeTemplateMaxScore}
            onChange={(event) =>
              savePatch('priceTradeTypeTemplateMaxScore', Number(event.target.value || 0))
            }
          />
        </label>

        <label className="field">
          <span>Max templates per type</span>
          <input
            className="input"
            type="number"
            min="1"
            max="50"
            value={settings.priceTradeTypeTemplateMaxTemplatesPerType}
            onChange={(event) =>
              savePatch('priceTradeTypeTemplateMaxTemplatesPerType', Number(event.target.value || 1))
            }
          />
        </label>

        <label className="field">
          <span>Failure limit before recalibration</span>
          <input
            className="input"
            type="number"
            min="1"
            max="100"
            value={settings.priceTradeTypeTemplateRecalibrationFailureLimit}
            onChange={(event) =>
              savePatch('priceTradeTypeTemplateRecalibrationFailureLimit', Number(event.target.value || 1))
            }
          />
        </label>

        <label className="field">
          <span>Buy/Sell probe interval ms</span>
          <input
            className="input"
            type="number"
            min="25"
            max="60000"
            value={settings.priceTradeTypeTemplateProbeIntervalMs}
            onChange={(event) =>
              savePatch('priceTradeTypeTemplateProbeIntervalMs', Number(event.target.value || 25))
            }
          />
        </label>
      </div>

      <div className="coordinate-ocr-calibration-card">
        <div className="coordinate-ocr-calibration-header">
          <div>
            <h4>Last attempts</h4>
            <p className="muted">Shows runtime fast probes and setup OCR reads for Buy/Sell validation boxes.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Region</th>
                <th>Mode</th>
                <th>Result</th>
                <th>Score</th>
                <th>Raw OCR</th>
                <th>Reason</th>
                <th>Image</th>
              </tr>
            </thead>
            <tbody>
              {profile.lastAttempts.length === 0 && (
                <tr>
                  <td colSpan="8">No Buy/Sell fast OCR attempts yet.</td>
                </tr>
              )}
              {profile.lastAttempts.map((attempt, index) => {
                const debugImagePath = readSetting(attempt, 'debugImagePath');
                return (
                  <tr key={`${readSetting(attempt, 'capturedAtUtc') || index}-${index}`}>
                    <td>{formatDate(readSetting(attempt, 'capturedAtUtc'))}</td>
                    <td>{readSetting(attempt, 'region') || 'Unknown'}</td>
                    <td>{readSetting(attempt, 'usedNormalOcr') ? 'Normal OCR' : 'Fast'}</td>
                    <td>
                      {readSetting(attempt, 'success') ? (
                        <span className="coordinate-ocr-pill ok">Matched</span>
                      ) : (
                        <span className="coordinate-ocr-pill warn">Miss</span>
                      )}
                      {readSetting(attempt, 'learnedTemplate') ? ' + learned' : ''}
                    </td>
                    <td>{formatScore(readSetting(attempt, 'score'))}</td>
                    <td>{readSetting(attempt, 'rawText') || ''}</td>
                    <td>{readSetting(attempt, 'reason') || ''}</td>
                    <td>
                      {debugImagePath ? (
                        <a href={api.ocrDebugImageUrl(debugImagePath)} target="_blank" rel="noreferrer">
                          open
                        </a>
                      ) : (
                        ''
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="coordinate-ocr-footer">
        <button
          type="button"
          className="button button-secondary"
          onClick={async () => {
            setSettings(DEFAULT_SETTINGS);
            const saved = await run(
              () => api.updatePriceTradeTypeTemplateSettings(DEFAULT_SETTINGS),
              'Could not reset Buy/Sell fast OCR settings'
            );
            if (saved) await load();
          }}
        >
          <RotateCcw size={16} /> Reset Buy/Sell OCR defaults
        </button>
      </div>
    </div>
  );
}
