import { createElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { campusEngineHtml } from '../engine/engineHtml';
import { parseEngineMessage, type HostMessage } from '../engine/protocol';
import type { CampusCanvasHandle, CampusCanvasProps } from './CampusCanvas';

export type { CampusCanvasHandle, CampusCanvasProps };

/** Web build: the same campus map page in an iframe, talking over postMessage. */
export const CampusCanvas = forwardRef<CampusCanvasHandle, CampusCanvasProps>(function CampusCanvas({ onMessage, style }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(campusEngineHtml, []);
  const handler = useRef(onMessage);
  useLayoutEffect(() => {
    handler.current = onMessage;
  });
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const m = parseEngineMessage(event.data);
      if (m) handler.current(m);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);
  useImperativeHandle(ref, () => ({
    send: (m: HostMessage) => frame.current?.contentWindow?.postMessage(JSON.stringify(m), '*'),
  }), []);
  return (
    <View style={style}>
      {createElement('iframe', {
        ref: frame,
        srcDoc: html,
        title: 'IISER Kolkata territory map',
        style: { border: 0, width: '100%', height: '100%', display: 'block', background: '#050608' },
      })}
    </View>
  );
});
