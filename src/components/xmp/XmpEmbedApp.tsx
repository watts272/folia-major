/**
 * XMP Embed root — 复用 ObsWebSourceApp + 官方 VisualizerRenderer
 * AGPL-3.0
 */
import React, { useEffect, useMemo, useState } from 'react';
import ObsWebSourceApp from '../obs/ObsWebSourceApp';
import { createXmpEmbedSource } from './xmpEmbedSource';
import type { ObsWebAppearance } from '../../utils/obsWebAppearance';
import type { VisualizerMode } from '../../types';

const DEFAULT_MODE = 'classic' as VisualizerMode;

function buildAppearance(mode: string | null): ObsWebAppearance {
  return {
    mode: ((mode as VisualizerMode) || DEFAULT_MODE),
    isDaylight: false,
    transparent: false,
    staticMode: false,
    visualizerOpacity: 1,
    lyricsFontScale: 1,
    subtitleFontScale: 1,
    showHarmonySubtitle: false,
    hideTranslationSubtitle: false,
    showSubtitleTranslation: false,
    visualizerTunings: {},
    background: { type: 'common' },
  } as ObsWebAppearance;
}

const XmpEmbedApp: React.FC = () => {
  const source = useMemo(() => createXmpEmbedSource(), []);
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState<string | null>('classic');

  useEffect(() => {
    document.title = 'Folia Embed (XMP)';
    document.documentElement.style.background = '#000';
    document.body.style.background = '#000';
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';

    const unsub = source.subscribe(() => {
      const m = source.getModeHint();
      if (m) setMode(m);
      setTick((n) => n + 1);
    });

    const onMsg = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || typeof data !== 'object') return;
      if (String(data.type || '').indexOf('xmp-folia-') !== 0) return;
      source.applyMessage(data);
    };
    window.addEventListener('message', onMsg);

    // 通知父页面：子页已就绪，请推送 session
    const hello = () => {
      try {
        window.parent.postMessage({ type: 'xmp-folia-ready' }, '*');
      } catch {
        /* ignore */
      }
    };
    hello();
    const t1 = window.setTimeout(hello, 200);
    const t2 = window.setTimeout(hello, 800);

    return () => {
      window.removeEventListener('message', onMsg);
      unsub();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [source]);

  const appearance = useMemo(() => buildAppearance(mode), [mode]);

  // tick 变化强制子树刷新（ObsWebSourceApp 读 source.state）
  void tick;

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', background: '#000' }}>
      <ObsWebSourceApp key={`xmp-${tick > 0 ? 'live' : 'boot'}-${mode}`} source={source} appearance={appearance} />
    </div>
  );
};

export default XmpEmbedApp;
