/**
 * XMP Host → Folia WebLyricSource
 * AGPL-3.0：与 Folia 同构建，衍生作品须遵守 AGPL。
 *
 * Folia Line 必须包含 words[]（逐字/词时间），仅 fullText 时多数模式不渲染歌词。
 */
import type { LyricData, Line, Word } from '../../types';
import type {
  WebLyricSource,
  WebLyricSourceState,
} from '../../types/webLyricSource';
import { initialWebLyricSourceState } from '../../types/webLyricSource';

export type XmpHostMessage =
  | {
      type: 'xmp-folia-session';
      track?: { name?: string; artist?: string; coverUrl?: string | null; id?: string };
      lines?: Array<{ t: number; text: string; tr?: string }>;
      duration?: number;
      position?: number;
      playing?: boolean;
      mode?: string;
    }
  | {
      type: 'xmp-folia-clock';
      position: number;
      playing?: boolean;
      duration?: number;
    }
  | { type: 'xmp-folia-ping' };

/** 把一行文本拆成 Word[]，时间均分在 [start, end) */
function buildWords(text: string, start: number, end: number): Word[] {
  const raw = String(text || '');
  if (!raw) return [{ text: ' ', startTime: start, endTime: end }];

  // 优先按空白分词；无空白则按字符（中文歌词）
  const hasSpace = /\s/.test(raw);
  let parts: string[];
  if (hasSpace) {
    parts = raw.split(/(\s+)/).filter((p) => p.length > 0);
  } else {
    parts = Array.from(raw);
  }

  const dur = Math.max(0.05, end - start);
  const n = Math.max(1, parts.length);
  const slice = dur / n;
  const words: Word[] = [];
  for (let i = 0; i < parts.length; i++) {
    const t0 = start + i * slice;
    const t1 = i === parts.length - 1 ? end : start + (i + 1) * slice;
    words.push({ text: parts[i], startTime: t0, endTime: t1 });
  }
  return words;
}

function toLyricData(
  lines: Array<{ t: number; text: string; tr?: string }> | undefined,
  durationHint?: number
): LyricData | null {
  if (!lines || !lines.length) return null;

  const out: Line[] = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const start = Math.max(0, Number(L.t) || 0);
    const nextT = i + 1 < lines.length ? Math.max(0, Number(lines[i + 1].t) || 0) : 0;
    let end =
      nextT > start
        ? nextT
        : durationHint && durationHint > start
          ? Math.min(durationHint, start + 5)
          : start + 4;
    if (end <= start) end = start + 0.5;

    const fullText = String(L.text || '').trim() || ' ';
    const words = buildWords(fullText, start, end);
    out.push({
      id: `xmp-${i}`,
      startTime: start,
      endTime: end,
      fullText,
      words,
      translation: L.tr ? String(L.tr) : undefined,
    });
  }

  return {
    lines: out,
    isWordByWord: false,
  };
}

export function createXmpEmbedSource(): WebLyricSource & {
  applyMessage: (data: XmpHostMessage) => void;
  getModeHint: () => string | null;
  subscribe: (fn: () => void) => () => void;
} {
  let state: WebLyricSourceState = {
    ...initialWebLyricSourceState(),
    connectionStatus: 'connecting',
  };
  let modeHint: string | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  };

  const api = {
    get state() {
      return state;
    },
    getCurrentTimeSec(nowMs: number) {
      const c = state.clock;
      if (!c.playing || !c.anchoredAtMs) return c.positionSec;
      const dt = Math.max(0, (nowMs - c.anchoredAtMs) / 1000);
      const t = c.positionSec + dt;
      if (c.durationSec > 0) return Math.min(t, c.durationSec);
      return t;
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getModeHint() {
      return modeHint;
    },
    applyMessage(data: XmpHostMessage) {
      if (!data || !data.type) return;
      if (data.type === 'xmp-folia-ping') {
        try {
          window.parent.postMessage({ type: 'xmp-folia-pong', ok: true }, '*');
        } catch {
          /* ignore */
        }
        return;
      }
      if (data.type === 'xmp-folia-session') {
        const position = Math.max(0, Number(data.position) || 0);
        const duration = Math.max(0, Number(data.duration) || 0);
        const playing = !!data.playing;
        if (data.mode) modeHint = String(data.mode);

        const lyrics = data.lines
          ? toLyricData(data.lines, duration)
          : state.lyrics;

        state = {
          connectionStatus: 'connected',
          playerState: playing ? 'playing' : 'paused',
          track: data.track
            ? {
                name: data.track.name || '',
                artist: data.track.artist || '',
                coverUrl: data.track.coverUrl || null,
                seed: data.track.id || data.track.name || 'xmp',
              }
            : state.track,
          lyrics,
          clock: {
            positionSec: position,
            durationSec: duration || state.clock.durationSec,
            anchoredAtMs: Date.now(),
            playing,
          },
        };
        try {
          window.parent.postMessage(
            {
              type: 'xmp-folia-pong',
              ok: true,
              lines: lyrics?.lines?.length || 0,
            },
            '*'
          );
        } catch {
          /* ignore */
        }
        notify();
        return;
      }
      if (data.type === 'xmp-folia-clock') {
        const position = Math.max(0, Number(data.position) || 0);
        const playing = data.playing != null ? !!data.playing : state.clock.playing;
        state = {
          ...state,
          connectionStatus: 'connected',
          playerState: playing ? 'playing' : 'paused',
          clock: {
            positionSec: position,
            durationSec:
              data.duration != null ? Number(data.duration) : state.clock.durationSec,
            anchoredAtMs: Date.now(),
            playing,
          },
        };
        notify();
      }
    },
  };

  return api;
}
