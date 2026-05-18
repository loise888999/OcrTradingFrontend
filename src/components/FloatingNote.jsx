import React, { useCallback, useEffect, useRef } from 'react';
import { GripHorizontal, Minus, Plus, StickyNote, X } from 'lucide-react';

export const FLOATING_NOTE_SETTING_KEY = 'floatingNoteState';

const NOTE_VERSION = 1;
const VIEWPORT_MARGIN = 12;
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 220;
const MIN_WIDTH = 240;
const MIN_HEIGHT = 160;
const SIZE_STEP = 40;

function getViewportSize() {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 720 };
  }

  return {
    width: Math.max(320, window.innerWidth || 1280),
    height: Math.max(320, window.innerHeight || 720)
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function numberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createDefaultFloatingNoteState(overrides = {}) {
  const viewport = getViewportSize();
  const width = Math.min(DEFAULT_WIDTH, viewport.width - VIEWPORT_MARGIN * 2);
  const height = Math.min(DEFAULT_HEIGHT, viewport.height - VIEWPORT_MARGIN * 2);

  return normalizeFloatingNoteState({
    version: NOTE_VERSION,
    visible: false,
    text: '',
    width,
    height,
    x: viewport.width - width - 24,
    y: viewport.height - height - 24,
    ...overrides
  });
}

export function normalizeFloatingNoteState(value, fallback = null) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }

  const base = fallback && typeof fallback === 'object'
    ? fallback
    : {
        version: NOTE_VERSION,
        visible: false,
        text: ''
      };
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const viewport = getViewportSize();
  const maxWidth = Math.max(MIN_WIDTH, viewport.width - VIEWPORT_MARGIN * 2);
  const maxHeight = Math.max(MIN_HEIGHT, viewport.height - VIEWPORT_MARGIN * 2);
  const width = clamp(
    numberOrDefault(source.width, numberOrDefault(base.width, DEFAULT_WIDTH)),
    Math.min(MIN_WIDTH, maxWidth),
    maxWidth
  );
  const height = clamp(
    numberOrDefault(source.height, numberOrDefault(base.height, DEFAULT_HEIGHT)),
    Math.min(MIN_HEIGHT, maxHeight),
    maxHeight
  );
  const defaultX = viewport.width - width - 24;
  const defaultY = viewport.height - height - 24;
  const maxX = viewport.width - width - VIEWPORT_MARGIN;
  const maxY = viewport.height - height - VIEWPORT_MARGIN;

  return {
    version: NOTE_VERSION,
    visible: Boolean(source.visible ?? base.visible ?? false),
    text: typeof source.text === 'string'
      ? source.text
      : typeof base.text === 'string'
        ? base.text
        : '',
    width,
    height,
    x: clamp(
      numberOrDefault(source.x, numberOrDefault(base.x, defaultX)),
      VIEWPORT_MARGIN,
      maxX
    ),
    y: clamp(
      numberOrDefault(source.y, numberOrDefault(base.y, defaultY)),
      VIEWPORT_MARGIN,
      maxY
    )
  };
}

export function resetFloatingNoteLayout(state = {}) {
  return createDefaultFloatingNoteState({
    visible: Boolean(state.visible ?? true),
    text: typeof state.text === 'string' ? state.text : ''
  });
}

export default function FloatingNote({ note, onChange }) {
  const dragRef = useRef(null);

  const updateNote = useCallback((next) => {
    onChange((current) => {
      const raw = typeof next === 'function' ? next(current) : { ...current, ...next };
      return normalizeFloatingNoteState(raw, current);
    });
  }, [onChange]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;

      if (drag.mode === 'move') {
        updateNote({
          x: drag.startX + dx,
          y: drag.startY + dy
        });
        return;
      }

      updateNote({
        width: drag.startWidth + dx,
        height: drag.startHeight + dy
      });
    };

    const handlePointerUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [updateNote]);

  useEffect(() => {
    const handleResize = () => {
      updateNote((current) => current);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateNote]);

  if (!note?.visible) return null;

  const startDrag = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('button')) return;

    dragRef.current = {
      mode: 'move',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: note.x,
      startY: note.y,
      startWidth: note.width,
      startHeight: note.height
    };
    event.preventDefault();
  };

  const startResize = (event) => {
    if (event.button !== undefined && event.button !== 0) return;

    dragRef.current = {
      mode: 'resize',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: note.x,
      startY: note.y,
      startWidth: note.width,
      startHeight: note.height
    };
    event.preventDefault();
  };

  const resizeBy = (delta) => {
    updateNote((current) => ({
      ...current,
      width: current.width + delta,
      height: current.height + delta
    }));
  };

  return (
    <aside
      className="floating-note"
      style={{
        left: `${note.x}px`,
        top: `${note.y}px`,
        width: `${note.width}px`,
        height: `${note.height}px`
      }}
      aria-label="Floating note"
    >
      <div className="floating-note-header" onPointerDown={startDrag}>
        <GripHorizontal size={16} aria-hidden="true" />
        <span className="floating-note-title">
          <StickyNote size={15} aria-hidden="true" /> Note
        </span>
        <div className="floating-note-actions">
          <button
            type="button"
            className="floating-note-icon-button"
            onClick={() => resizeBy(-SIZE_STEP)}
            title="Smaller"
            aria-label="Make note smaller"
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            className="floating-note-icon-button"
            onClick={() => resizeBy(SIZE_STEP)}
            title="Bigger"
            aria-label="Make note bigger"
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="floating-note-icon-button"
            onClick={() => updateNote({ visible: false })}
            title="Hide"
            aria-label="Hide note"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <textarea
        className="floating-note-textarea"
        value={note.text}
        onChange={(event) => updateNote({ text: event.target.value })}
        spellCheck="true"
        aria-label="Note text"
      />

      <button
        type="button"
        className="floating-note-resize-handle"
        onPointerDown={startResize}
        title="Resize"
        aria-label="Resize note"
      />
    </aside>
  );
}
