/**
 * XMP Host → Folia WebLyricSource
 * AGPL-3.0: 本文件用于与 Folia(AGPL) 同构建，衍生作品须遵守 AGPL。
 */
import type { LyricData, Line } from '../../types';
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

function toLyricData(lines: Array<{ t: number; text: string; tr?: string }> | undefined): LyricData | null {
  if (!lines || !lines.length) return null;
  const out: Line[] = lines.map((L, i) => ({
    id: `xmp-${i}`,
    startTime: Math.max(0, Number(L.t) || 0),
    // Folia Line 字段因版本略有差异；Obs 路径主要用 startTime + words/fullText
    endTime: undefined as unknown as number,
    fullText: String(L.text || ''),
    text: String(L.text || ''),
    words: [],
    translation: L.tr ? String(L.tr) : undefined,
  })) as Line[];
  // 填 endTime
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    (out[i] as { endTime?: number }).endTime = next
      ? next.startTime
      : out[i].startTime + 5;
  }
  return { lines: out } as LyricData;
}

export function createXmpEmbedSource(): WebLyricSource & {
  applyMessage: (data: XmpHostMessage) => void;
  getModeHint: () => string | null;
} {
  let state: WebLyricSourceState = {
    ...initialWebLyricSourceState(),
    connectionStatus: 'connecting',
  };
  let modeHint: string | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    listeners.forEach((fn) => {
      try { fn(); } catch { /* ignore */ }
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
      return c.positionSec + dt;
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getModeHint() {
      return modeHint;
    },
    applyMessage(data: XmpHostMessage) {
      if (!data || !data.type) return;
      if (data.type === 'xmp-folia-ping') {
        try {
          window.parent.postMessage({ type: 'xmp-folia-pong' }, '*');
        } catch { /* ignore */ }
        return;
      }
      if (data.type === 'xmp-folia-session') {
        const position = Math.max(0, Number(data.position) || 0);
        const duration = Math.max(0, Number(data.duration) || 0);
        const playing = !!data.playing;
        if (data.mode) modeHint = String(data.mode);
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
          lyrics: data.lines ? toLyricData(data.lines) : state.lyrics,
          clock: {
            positionSec: position,
            durationSec: duration || state.clock.durationSec,
            anchoredAtMs: Date.now(),
            playing,
          },
        };
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
            durationSec: data.duration != null ? Number(data.duration) : state.clock.durationSec,
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
