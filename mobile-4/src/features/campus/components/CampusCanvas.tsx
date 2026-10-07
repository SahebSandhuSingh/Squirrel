import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { campusEngineHtml } from '../engine/engineHtml';
import { parseEngineMessage, type EngineMessage, type HostMessage } from '../engine/protocol';

export type CampusCanvasHandle = { send: (m: HostMessage) => void };
export type CampusCanvasProps = { onMessage: (m: EngineMessage) => void; style?: StyleProp<ViewStyle> };

/** Phones: the campus map page in a WebView (GPU-accelerated WebGL). */
export const CampusCanvas = forwardRef<CampusCanvasHandle, CampusCanvasProps>(function CampusCanvas({ onMessage, style }, ref) {
  const web = useRef<WebView>(null);
  const html = useMemo(campusEngineHtml, []);
  const handler = useRef(onMessage);
  useLayoutEffect(() => {
    handler.current = onMessage;
  });
  useImperativeHandle(ref, () => ({
    send: (m) => web.current?.injectJavaScript(`window.__host && window.__host(${JSON.stringify(JSON.stringify(m))}); true;`),
  }), []);
  return (
    <View style={style}>
      <WebView
        ref={web}
        source={{ html, baseUrl: 'https://squirrelsocial.app/' }}
        originWhitelist={['*']}
        onMessage={(e: WebViewMessageEvent) => {
          const m = parseEngineMessage(e.nativeEvent.data);
          if (m) handler.current(m);
        }}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setBuiltInZoomControls={false}
        allowsLinkPreview={false}
        androidLayerType="hardware"
        style={{ flex: 1, backgroundColor: '#050608' }}
        containerStyle={{ backgroundColor: '#050608' }}
        onError={(e) => handler.current({ type: 'error', detail: e.nativeEvent.description })}
      />
    </View>
  );
});
