import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Crosshair, Gauge, RefreshCw, RotateCcw } from 'lucide-react';
import { api } from '../api.js';

const DEFAULT_SETTINGS = {
  coordinateReadMode: 'NormalOcr',
  coordinateTemplateFallbackToNormalOcr: false,
  coordinateTemplateCountFailedReadsForRecalibration: true,
  coordinateTemplateRecalibrationFailureLimit: 5,
  coordinateTemplateRequireVisibleTextForFailure: true,
  coordinateTemplateMinTextPixelsPercent: 0.35,
  coordinateTemplateMinContrast: 18,
  coordinateTemplateAutoProfileEnabled: false,
  coordinateTemplateAutoProfileOnlyWhenNormalOcrMode: true,
  coordinateTemplateAutoProfileMaxSamples: 200,
  coordinateTemplateAutoProfileValidationMaxDigitScore: 0.18,
  coordinateTemplateMaxTemplatesPerDigit: 5,
  coordinateTemplateBrightnessThreshold: 180
};

function readSetting(source, key) {
  if (!source) return undefined;
  const pascal = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  return source[key] ?? source[pascal];
}

function normalizeSettings(value) {
  return {
    coordinateReadMode: readSetting(value, 'coordinateReadMode') || DEFAULT_SETTINGS.coordinateReadMode,
    coordinateTemplateFallbackToNormalOcr: Boolean(
      readSetting(value, 'coordinateTemplateFallbackToNormalOcr') ??
        DEFAULT_SETTINGS.coordinateTemplateFallbackToNormalOcr
    ),
    coordinateTemplateCountFailedReadsForRecalibration: Boolean(
      readSetting(value, 'coordinateTemplateCountFailedReadsForRecalibration') ??
        DEFAULT_SETTINGS.coordinateTemplateCountFailedReadsForRecalibration
    ),
    coordinateTemplateRecalibrationFailureLimit: Number(
      readSetting(value, 'coordinateTemplateRecalibrationFailureLimit') ??
        DEFAULT_SETTINGS.coordinateTemplateRecalibrationFailureLimit
    ),
    coordinateTemplateRequireVisibleTextForFailure: Boolean(
      readSetting(value, 'coordinateTemplateRequireVisibleTextForFailure') ??
        DEFAULT_SETTINGS.coordinateTemplateRequireVisibleTextForFailure
    ),
    coordinateTemplateMinTextPixelsPercent: Number(
      readSetting(value, 'coordinateTemplateMinTextPixelsPercent') ??
        DEFAULT_SETTINGS.coordinateTemplateMinTextPixelsPercent
    ),
    coordinateTemplateMinContrast: Number(
      readSetting(value, 'coordinateTemplateMinContrast') ??
        DEFAULT_SETTINGS.coordinateTemplateMinContrast
    ),
    coordinateTemplateAutoProfileEnabled: Boolean(
      readSetting(value, 'coordinateTemplateAutoProfileEnabled') ??
        DEFAULT_SETTINGS.coordinateTemplateAutoProfileEnabled
    ),
    coordinateTemplateAutoProfileOnlyWhenNormalOcrMode: Boolean(
      readSetting(value, 'coordinateTemplateAutoProfileOnlyWhenNormalOcrMode') ??
        DEFAULT_SETTINGS.coordinateTemplateAutoProfileOnlyWhenNormalOcrMode
    ),
    coordinateTemplateAutoProfileMaxSamples: Number(
      readSetting(value, 'coordinateTemplateAutoProfileMaxSamples') ??
        DEFAULT_SETTINGS.coordinateTemplateAutoProfileMaxSamples
    ),
    coordinateTemplateAutoProfileValidationMaxDigitScore: Number(
      readSetting(value, 'coordinateTemplateAutoProfileValidationMaxDigitScore') ??
        DEFAULT_SETTINGS.coordinateTemplateAutoProfileValidationMaxDigitScore
    ),
    coordinateTemplateMaxTemplatesPerDigit: Number(
      readSetting(value, 'coordinateTemplateMaxTemplatesPerDigit') ??
        DEFAULT_SETTINGS.coordinateTemplateMaxTemplatesPerDigit
    ),
    coordinateTemplateBrightnessThreshold: Number(
      readSetting(value, 'coordinateTemplateBrightnessThreshold') ??
        DEFAULT_SETTINGS.coordinateTemplateBrightnessThreshold
    )
  };
}

function normalizeStatus(value) {
  const fastTemplate = value?.fastTemplate || value?.FastTemplate || value || {};

  return {
    failedReadCount: Number(readSetting(fastTemplate, 'failedReadCount') || 0),
    needsRecalibration: Boolean(readSetting(fastTemplate, 'needsRecalibration')),
    lastFailureReason: readSetting(fastTemplate, 'lastFailureReason') || '',
    updatedAtUtc: readSetting(fastTemplate, 'updatedAtUtc') || ''
  };
}

function normalizeSetupProof(value) {
  if (!value) return null;

  return {
    capturedAtUtc: readSetting(value, 'capturedAtUtc') || '',
    source: readSetting(value, 'source') || 'coordinate-template',
    imageDataUrl: readSetting(value, 'imageDataUrl') || '',
    imagePath: readSetting(value, 'imagePath') || '',
    visibleCoordinate: readSetting(value, 'visibleCoordinate') || '',
    normalOcrRawText: readSetting(value, 'normalOcrRawText') || '',
    normalOcrParsedCoordinate: readSetting(value, 'normalOcrParsedCoordinate') || '',
    fastTemplateRawText: readSetting(value, 'fastTemplateRawText') || readSetting(value, 'rawText') || '',
    fastTemplateParsedCoordinate: readSetting(value, 'fastTemplateParsedCoordinate') || '',
    fastTemplateSuccess: Boolean(readSetting(value, 'fastTemplateSuccess') ?? readSetting(value, 'success')),
    fastTemplateReason: readSetting(value, 'fastTemplateReason') || readSetting(value, 'reason') || ''
  };
}

function normalizeDigitPreview(value) {
  return {
    digit: String(readSetting(value, 'digit') || ''),
    ready: Boolean(readSetting(value, 'ready')),
    imageDataUrl: readSetting(value, 'imageDataUrl') || '',
    imagePath: readSetting(value, 'imagePath') || '',
    width: Number(readSetting(value, 'width') || 0),
    height: Number(readSetting(value, 'height') || 0),
    side: readSetting(value, 'side') || '',
    distanceFromSeparator: Number(readSetting(value, 'distanceFromSeparator') || 0),
    touchesCropEdge: Boolean(readSetting(value, 'touchesCropEdge')),
    qualityScore: Number(readSetting(value, 'qualityScore') || 0)
  };
}

function normalizeProfile(value) {
  const profile = value?.profile || value?.Profile || value || {};

  return {
    profileReady: Boolean(readSetting(profile, 'profileReady')),
    profileId: readSetting(profile, 'profileId') || '',
    brightnessWhiteThreshold: Number(readSetting(profile, 'brightnessWhiteThreshold') ?? 180),
    learnedDigits: readSetting(profile, 'learnedDigits') || [],
    missingDigitTemplates: readSetting(profile, 'missingDigitTemplates') || [],
    templateCount: Number(readSetting(profile, 'templateCount') || 0),
    sampleCount: Number(readSetting(profile, 'sampleCount') || 0),
    lastAutoSampleCoordinate: readSetting(profile, 'lastAutoSampleCoordinate') || '',
    lastAutoSampleMessage: readSetting(profile, 'lastAutoSampleMessage') || '',
    autoProfileEnabled: Boolean(readSetting(profile, 'autoProfileEnabled')),
    lastValidatedDigits: readSetting(profile, 'lastValidatedDigits') || [],
    lastLearnedDigits: readSetting(profile, 'lastLearnedDigits') || [],
    lastRejectedDigits: readSetting(profile, 'lastRejectedDigits') || [],
    lastValidationMessage: readSetting(profile, 'lastValidationMessage') || '',
    lastSampleAccepted: Boolean(readSetting(profile, 'lastSampleAccepted')),
    lastOcrComparisonText: readSetting(profile, 'lastOcrComparisonText') || '',
    lastOcrComparisonMessage: readSetting(profile, 'lastOcrComparisonMessage') || '',
    lastOcrComparisonMatched: Boolean(readSetting(profile, 'lastOcrComparisonMatched')),
    lastSegmentationMode: readSetting(profile, 'lastSegmentationMode') || '',
    lastLowQualityDigits: readSetting(profile, 'lastLowQualityDigits') || [],
    lastCalibrationMessage: readSetting(profile, 'lastCalibrationMessage') || '',
    lastSuccessfulSetupProof: normalizeSetupProof(readSetting(profile, 'lastSuccessfulSetupProof')),
    digitTemplatePreviews: (readSetting(profile, 'digitTemplatePreviews') || []).map(normalizeDigitPreview),
    createdAtUtc: readSetting(profile, 'createdAtUtc') || '',
    updatedAtUtc: readSetting(profile, 'updatedAtUtc') || ''
  };
}

function validateVisibleCoordinate(value) {
  const match = String(value || '').trim().match(/^(\d{1,5})\s*,\s*(\d{1,4})$/);

  if (!match) return 'Use format 12345,6789.';

  const longitude = Number(match[1]);
  const latitude = Number(match[2]);

  if (longitude < 0 || longitude > 16384) return 'Longitude must be 0 to 16384.';
  if (latitude < 0 || latitude > 8192) return 'Latitude must be 0 to 8192.';

  return '';
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function StatusPill({ ok, children }) {
  return (
    <span className={`coordinate-ocr-pill ${ok ? 'ok' : 'warn'}`}>
      {ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      {children}
    </span>
  );
}

export default function CoordinateOcrSettingsPanel({ run }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [status, setStatus] = useState(normalizeStatus(null));
  const [profile, setProfile] = useState(normalizeProfile(null));
  const [visibleCoordinate, setVisibleCoordinate] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [savingKey, setSavingKey] = useState('');

  const load = useCallback(async () => {
    const loaded = await run(
      () => api.getCoordinateOcrStatus(),
      'Could not load coordinate OCR settings'
    );

    if (!loaded) return;

    setSettings(normalizeSettings(loaded.settings || loaded.Settings));
    setStatus(normalizeStatus(loaded));
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
      () => api.updateCoordinateOcrSettings(next),
      'Could not save coordinate OCR settings'
    );

    setSavingKey('');

    if (saved) {
      setSettings(normalizeSettings(saved));
      await load();
    }
  };

  const statusTone = useMemo(() => {
    if (settings.coordinateReadMode !== 'FastTemplate') return 'Normal OCR active';
    if (!profile.profileReady) return 'Profile missing';
    if (status.needsRecalibration) return 'Recalibration needed';
    return 'Fast OCR selected';
  }, [settings.coordinateReadMode, status.needsRecalibration, profile.profileReady]);

  const createProfile = async () => {
    const validation = validateVisibleCoordinate(visibleCoordinate);

    if (validation) {
      setProfileMessage(validation);
      return;
    }

    setProfileMessage('');
    setSavingKey('createProfile');

    const saved = await run(
      () => api.createCoordinateTemplateProfile({ visibleCoordinate }),
      'Could not create fast coordinate profile'
    );

    setSavingKey('');

    if (saved) {
      const nextProfile = normalizeProfile(saved);
      setProfile(nextProfile);
      setStatus(normalizeStatus(saved.runtime || saved.Runtime));
      setTestResult(nextProfile.lastSuccessfulSetupProof);
      setProfileMessage(readSetting(saved, 'lastCalibrationMessage') || 'Fast coordinate profile created.');
      await load();
    }
  };

  const testCurrentBox = async () => {
    setSavingKey('testCurrent');
    setProfileMessage('');

    const result = await run(
      () => api.testCurrentCoordinateTemplate(),
      'Could not test current coordinate box'
    );

    setSavingKey('');

    if (result) {
      setTestResult(normalizeSetupProof(result));
      setStatus(normalizeStatus(result));
      setProfile(normalizeProfile(result.profile || result.Profile));
      await load();
    }
  };

  const setAutoProfile = async (enabled) => {
    setSavingKey('autoProfile');

    const saved = await run(
      () =>
        enabled
          ? api.startCoordinateTemplateAutoProfile()
          : api.stopCoordinateTemplateAutoProfile(),
      enabled ? 'Could not start auto profile builder' : 'Could not stop auto profile builder'
    );

    setSavingKey('');

    if (saved) {
      setSettings((current) => ({
        ...current,
        coordinateTemplateAutoProfileEnabled: enabled
      }));
      await load();
    }
  };

  const digitProgress = '0123456789'.split('');
  const setupPreview = testResult || profile.lastSuccessfulSetupProof;
  const digitPreviews = profile.digitTemplatePreviews.length
    ? profile.digitTemplatePreviews
    : digitProgress.map((digit) => ({ digit, ready: profile.learnedDigits.includes(digit) }));
  const thresholdMismatch =
    Boolean(profile.profileId) &&
    profile.brightnessWhiteThreshold !== settings.coordinateTemplateBrightnessThreshold;

  return (
    <div className="coordinate-ocr-settings-panel">
      <div className="coordinate-ocr-header">
        <div>
          <h3>
            <Gauge size={20} /> Coordinate OCR mode
          </h3>
          <p className="muted">
            Normal OCR uses current backend reader. Fast template mode uses calibrated coordinate profile when available.
          </p>
        </div>

        <div className="button-row">
          <button className="button button-secondary" type="button" onClick={load}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => window.open('/?calibration=1&box=coordinate', '_blank', 'noopener,noreferrer')}
          >
            <Crosshair size={16} /> Coordinate calibration
          </button>
        </div>
      </div>

      <div className="coordinate-ocr-status-row">
        <StatusPill ok={settings.coordinateReadMode === 'NormalOcr' || (profile.profileReady && !status.needsRecalibration)}>
          {statusTone}
        </StatusPill>
        <span>Profile: {profile.profileReady ? `${profile.templateCount} templates` : 'Missing'}</span>
        <span>Fast threshold: {settings.coordinateTemplateBrightnessThreshold}</span>
        <span>Failed reads: {status.failedReadCount}</span>
        <span>Updated: {formatDate(status.updatedAtUtc)}</span>
      </div>

      {status.lastFailureReason && (
        <div className="coordinate-ocr-message">
          {status.lastFailureReason}
        </div>
      )}

      {thresholdMismatch && (
        <div className="coordinate-ocr-message">
          Profile was learned with threshold {profile.brightnessWhiteThreshold}; current fast digit threshold is {settings.coordinateTemplateBrightnessThreshold}. Recreate or relearn profile if fast reads worsen.
        </div>
      )}

      <div className="coordinate-ocr-mode-grid">
        <button
          type="button"
          className={`coordinate-ocr-mode-card ${settings.coordinateReadMode === 'NormalOcr' ? 'active' : ''}`}
          onClick={() => savePatch('coordinateReadMode', 'NormalOcr')}
          disabled={savingKey === 'coordinateReadMode'}
        >
          <strong>Normal OCR</strong>
          <span>Stable current Paddle OCR coordinate read.</span>
        </button>

        <button
          type="button"
          className={`coordinate-ocr-mode-card ${settings.coordinateReadMode === 'FastTemplate' ? 'active' : ''}`}
          onClick={() => savePatch('coordinateReadMode', 'FastTemplate')}
          disabled={savingKey === 'coordinateReadMode'}
        >
          <strong>Fast template OCR</strong>
          <span>Uses calibrated digit template profile for tiny coordinate crop.</span>
        </button>
      </div>

      <div className="coordinate-ocr-calibration-card">
        <div className="coordinate-ocr-calibration-header">
          <div>
            <h4>Fast calibration</h4>
            <p className="muted">Draw a tight coordinate box, type the visible coordinate, then create digit templates from one tiny capture.</p>
          </div>
          <StatusPill ok={profile.profileReady}>
            {profile.profileReady ? 'Profile ready' : 'Profile missing'}
          </StatusPill>
        </div>

        <div className="coordinate-ocr-calibration-grid">
          <label className="field">
            <span>Visible coordinate</span>
            <input
              className="input"
              value={visibleCoordinate}
              placeholder="12345,6789"
              onChange={(event) => setVisibleCoordinate(event.target.value)}
            />
            <small>Longitude before comma, latitude after comma.</small>
          </label>

          <button
            type="button"
            className="button button-secondary"
            onClick={() => window.open('/?calibration=1&box=coordinate', '_blank', 'noopener,noreferrer')}
          >
            <Crosshair size={16} /> Use current coordinate box
          </button>

          <button
            type="button"
            className="button button-secondary"
            disabled={savingKey === 'testCurrent'}
            onClick={testCurrentBox}
          >
            <RefreshCw size={16} /> Test current box
          </button>

          <button
            type="button"
            className="button button-primary"
            disabled={savingKey === 'createProfile'}
            onClick={createProfile}
          >
            <CheckCircle2 size={16} /> Create fast OCR profile
          </button>
        </div>

        {(profileMessage || profile.lastCalibrationMessage) && (
          <div className="coordinate-ocr-message">
            {profileMessage || profile.lastCalibrationMessage}
          </div>
        )}

        <div className="coordinate-ocr-profile-meta">
          <span>Missing digits: {profile.missingDigitTemplates.length ? profile.missingDigitTemplates.join(', ') : 'None'}</span>
          <span>Templates: {profile.templateCount}</span>
          <span>Learned threshold: {profile.brightnessWhiteThreshold}</span>
          <span>Samples: {profile.sampleCount}</span>
          <span>Profile updated: {formatDate(profile.updatedAtUtc)}</span>
        </div>

        <div className="coordinate-template-proof">
          <div className="coordinate-ocr-calibration-header">
            <div>
              <h4>Captured coordinate proof</h4>
              <p className="muted">
                {setupPreview
                  ? `Saved ${formatDate(setupPreview.capturedAtUtc)} from ${setupPreview.source}.`
                  : 'No saved coordinate setup proof yet.'}
              </p>
            </div>
            <StatusPill ok={Boolean(setupPreview?.fastTemplateSuccess)}>
              {setupPreview?.fastTemplateSuccess ? 'Fast read matched' : 'Needs proof'}
            </StatusPill>
          </div>

          {setupPreview?.imageDataUrl && (
            <div className="price-trade-type-preview">
              <img src={setupPreview.imageDataUrl} alt="Coordinate OCR crop captured by backend" />
            </div>
          )}

          <div className="coordinate-ocr-profile-meta">
            <span>Visible: {setupPreview?.visibleCoordinate || 'None'}</span>
            <span>Normal parsed: {setupPreview?.normalOcrParsedCoordinate || 'Unknown'}</span>
            <span>Normal raw: {setupPreview?.normalOcrRawText || 'None'}</span>
            <span>Fast parsed: {setupPreview?.fastTemplateParsedCoordinate || 'Unknown'}</span>
            <span>Fast raw: {setupPreview?.fastTemplateRawText || 'None'}</span>
            <span>Reason: {setupPreview?.fastTemplateReason || 'None'}</span>
          </div>
        </div>
      </div>

      <div className="coordinate-ocr-calibration-card">
        <div className="coordinate-ocr-calibration-header">
          <div>
            <h4>Saved digit templates</h4>
            <p className="muted">These are the 0-9 digit images saved in the backend profile.</p>
          </div>
          <StatusPill ok={profile.profileReady}>
            {profile.profileReady ? 'All digits saved' : 'Digits missing'}
          </StatusPill>
        </div>

        <div className="coordinate-template-grid">
          {digitPreviews.map((digit) => (
            <div className={`coordinate-template-tile ${digit.ready ? 'ready' : 'missing'}`} key={digit.digit}>
              <strong>{digit.digit}</strong>
              {digit.imageDataUrl ? (
                <img src={digit.imageDataUrl} alt={`Saved coordinate digit ${digit.digit}`} />
              ) : (
                <span>Missing</span>
              )}
              <small>
                {digit.ready
                  ? `${digit.width || '?'}x${digit.height || '?'} q${Math.round(Number(digit.qualityScore || 0))}`
                  : 'No template'}
              </small>
            </div>
          ))}
        </div>
      </div>

      <div className="coordinate-ocr-calibration-card">
        <div className="coordinate-ocr-calibration-header">
          <div>
            <h4>Auto build from normal OCR</h4>
            <p className="muted">Leave normal OCR running and this will learn missing digit templates from successful coordinate reads.</p>
          </div>
          <StatusPill ok={settings.coordinateTemplateAutoProfileEnabled}>
            {settings.coordinateTemplateAutoProfileEnabled ? 'Auto build on' : 'Auto build off'}
          </StatusPill>
        </div>

        <div className="coordinate-ocr-auto-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={savingKey === 'autoProfile' || settings.coordinateTemplateAutoProfileEnabled}
            onClick={() => setAutoProfile(true)}
          >
            <CheckCircle2 size={16} /> Start auto build
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={savingKey === 'autoProfile' || !settings.coordinateTemplateAutoProfileEnabled}
            onClick={() => setAutoProfile(false)}
          >
            <AlertCircle size={16} /> Stop auto build
          </button>
        </div>

        <div className="coordinate-ocr-digit-progress" aria-label="Learned digit templates">
          {digitProgress.map((digit) => {
            const learned = profile.learnedDigits.includes(digit);
            const validated = profile.lastValidatedDigits.includes(digit);
            const rejected = profile.lastRejectedDigits.includes(digit);
            const justLearned = profile.lastLearnedDigits.includes(digit);
            return (
              <span
                key={digit}
                className={[
                  learned ? 'learned' : '',
                  validated ? 'validated' : '',
                  rejected ? 'rejected' : '',
                  justLearned ? 'just-learned' : ''
                ].filter(Boolean).join(' ')}
              >
                {digit}
              </span>
            );
          })}
        </div>

        <div className="coordinate-ocr-profile-meta">
          <span>Last sample: {profile.lastAutoSampleCoordinate || 'None'}</span>
          <span>Missing: {profile.missingDigitTemplates.length ? profile.missingDigitTemplates.join(', ') : 'None'}</span>
          <span>Validated: {profile.lastValidatedDigits.length ? profile.lastValidatedDigits.join(', ') : 'None'}</span>
          <span>Learned: {profile.lastLearnedDigits.length ? profile.lastLearnedDigits.join(', ') : 'None'}</span>
          <span>Rejected: {profile.lastRejectedDigits.length ? profile.lastRejectedDigits.join(', ') : 'None'}</span>
          <span>Segmentation: {profile.lastSegmentationMode || 'None'}</span>
          <span>Low quality: {profile.lastLowQualityDigits.length ? profile.lastLowQualityDigits.join(', ') : 'None'}</span>
          <span>Full profile check: {profile.lastOcrComparisonMatched ? 'Matched normal OCR' : 'Not matched yet'}</span>
          <span>Limit: {settings.coordinateTemplateAutoProfileMaxSamples}</span>
        </div>

        {(profile.lastAutoSampleMessage || profile.lastValidationMessage || profile.lastOcrComparisonMessage) && (
          <div className="coordinate-ocr-message">
            {[profile.lastValidationMessage, profile.lastAutoSampleMessage, profile.lastOcrComparisonMessage].filter(Boolean).join(' ')}
          </div>
        )}
      </div>

      <div className="coordinate-ocr-options-grid">
        <label className="inline-checkbox coordinate-ocr-option">
          <input
            type="checkbox"
            checked={settings.coordinateTemplateFallbackToNormalOcr}
            onChange={(event) =>
              savePatch('coordinateTemplateFallbackToNormalOcr', event.target.checked)
            }
          />
          <span>Fallback to normal OCR if fast read fails</span>
        </label>

        <label className="inline-checkbox coordinate-ocr-option">
          <input
            type="checkbox"
            checked={settings.coordinateTemplateCountFailedReadsForRecalibration}
            onChange={(event) =>
              savePatch('coordinateTemplateCountFailedReadsForRecalibration', event.target.checked)
            }
          />
          <span>Count failed fast reads toward recalibration</span>
        </label>

        <label className="inline-checkbox coordinate-ocr-option">
          <input
            type="checkbox"
            checked={settings.coordinateTemplateRequireVisibleTextForFailure}
            onChange={(event) =>
              savePatch('coordinateTemplateRequireVisibleTextForFailure', event.target.checked)
            }
          />
          <span>Only count failures when coordinate pixels are visible</span>
        </label>

        <label className="inline-checkbox coordinate-ocr-option">
          <input
            type="checkbox"
            checked={settings.coordinateTemplateAutoProfileOnlyWhenNormalOcrMode}
            onChange={(event) =>
              savePatch('coordinateTemplateAutoProfileOnlyWhenNormalOcrMode', event.target.checked)
            }
          />
          <span>Auto build only while Normal OCR mode is selected</span>
        </label>
      </div>

      <div className="coordinate-ocr-number-grid">
        <label className="field">
          <span>Failure limit before recalibration</span>
          <input
            className="input"
            type="number"
            min="1"
            max="100"
            value={settings.coordinateTemplateRecalibrationFailureLimit}
            onChange={(event) =>
              savePatch(
                'coordinateTemplateRecalibrationFailureLimit',
                Number(event.target.value || 1)
              )
            }
          />
        </label>

        <label className="field">
          <span>Visible text pixel percent</span>
          <input
            className="input"
            type="number"
            min="0"
            max="100"
            step="0.05"
            value={settings.coordinateTemplateMinTextPixelsPercent}
            onChange={(event) =>
              savePatch(
                'coordinateTemplateMinTextPixelsPercent',
                Number(event.target.value || 0)
              )
            }
          />
        </label>

        <label className="field">
          <span>Visible text contrast</span>
          <input
            className="input"
            type="number"
            min="0"
            max="255"
            value={settings.coordinateTemplateMinContrast}
            onChange={(event) =>
              savePatch('coordinateTemplateMinContrast', Number(event.target.value || 0))
            }
          />
        </label>

        <label className="field">
          <span>Fast digit threshold</span>
          <input
            className="input"
            type="number"
            min="0"
            max="255"
            value={settings.coordinateTemplateBrightnessThreshold}
            onChange={(event) =>
              savePatch('coordinateTemplateBrightnessThreshold', Number(event.target.value || 0))
            }
          />
          <small>Lower accepts darker pixels; higher requires brighter pixels.</small>
        </label>

        <label className="field">
          <span>Auto profile sample limit</span>
          <input
            className="input"
            type="number"
            min="1"
            max="10000"
            value={settings.coordinateTemplateAutoProfileMaxSamples}
            onChange={(event) =>
              savePatch('coordinateTemplateAutoProfileMaxSamples', Number(event.target.value || 1))
            }
          />
        </label>

        <label className="field">
          <span>Validation max digit score</span>
          <input
            className="input"
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={settings.coordinateTemplateAutoProfileValidationMaxDigitScore}
            onChange={(event) =>
              savePatch(
                'coordinateTemplateAutoProfileValidationMaxDigitScore',
                Number(event.target.value || 0)
              )
            }
          />
        </label>

        <label className="field">
          <span>Max templates per digit</span>
          <input
            className="input"
            type="number"
            min="1"
            max="100"
            value={settings.coordinateTemplateMaxTemplatesPerDigit}
            onChange={(event) =>
              savePatch('coordinateTemplateMaxTemplatesPerDigit', Number(event.target.value || 1))
            }
          />
        </label>
      </div>

      <div className="coordinate-ocr-footer">
        <button
          type="button"
          className="button button-secondary"
          onClick={async () => {
            setSettings(DEFAULT_SETTINGS);
            const saved = await run(
              () => api.updateCoordinateOcrSettings(DEFAULT_SETTINGS),
              'Could not reset coordinate OCR settings'
            );
            if (saved) await load();
          }}
        >
          <RotateCcw size={16} /> Reset coordinate OCR defaults
        </button>
      </div>
    </div>
  );
}
