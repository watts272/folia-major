/**
 * XMP Embed root — 复用 ObsWebSourceApp + 官方 VisualizerRenderer
 * AGPL-3.0
 */
import React, { useEffect, useMemo, useState } from 'react';
import ObsWebSourceApp from '../obs/ObsWebSourceApp';
import { createXmpEmbedSource } from './xmpEmbedSource';
import type { ObsWebAppearance } from '../../utils/obsWebAppearance';
import type { VisualizerMode } from '../../types';

const DEFAULT_MODE: VisualizerMode = 'classic' as VisualizerMode;

function buildAppearance(mode: string | null): ObsWebAppearance {
  // 字段以你本地 Folia 的 ObsWebAppearance 为准；缺失字段会在 tsc 时补全
  return {
    mode: (mode as VisualizerMode) || DEFAULT_MODE,
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
  const [, bump] = useState(0);
  const [mode, setMode] = useState<string | null>('classic');

  useEffect(() => {
    document.title = 'Folia Embed (XMP)';
    const unsub = source.subscribe(() => {
      const m = source.getModeHint();
      if (m) setMode(m);
      bump((n) => n + 1);
    });
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || typeof data !== 'object') return;
      if (String(data.type || '').indexOf('xmp-folia-') !== 0) return;
      source.applyMessage(data);
    };
    window.addEventListener('message', onMsg);
    try {
      window.parent.postMessage({ type: 'xmp-folia-ready' }, '*');
    } catch { /* ignore */ }
    return () => {
      window.removeEventListener('message', onMsg);
      unsub();
    };
  }, [source]);

  const appearance = useMemo(() => buildAppearance(mode), [mode]);

  // 强制重渲染：ObsWebSourceApp 读 source.state 需随消息更新
  void bump;

  return <ObsWebSourceApp source={source} appearance={appearance} />;
};

export default XmpEmbedApp;
