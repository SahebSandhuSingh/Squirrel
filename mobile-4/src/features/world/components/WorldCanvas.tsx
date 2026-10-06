import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { engineHtml } from '../engine/engineHtml';
import { parseEngineMessage, type EngineMessage, type HostMessage } from '../engine/protocol';

export type WorldCanvasHandle = { send: (m: HostMessage) => void };
export type WorldCanvasProps = { onMessage: (m: EngineMessage) => void; style?: StyleProp<ViewStyle> };

/**
 * Phones: the map page in a WebView (GPU-accelerated WebGL). The https base URL gives the page a
 * secure origin so it can fetch tiles and fonts; nothing else is loaded from it.
 */
export const WorldCanvas = forwardRef<WorldCanvasHandle, WorldCanvasProps>(function WorldCanvas({ onMessage, style }, ref) {
  const web = useRef<WebView>(null);
  const html = useMemo(engineHtml, []);
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
        style={{ flex: 1, backgroundColor: '#06070A' }}
        containerStyle={{ backgroundColor: '#06070A' }}
        onError={(e) => handler.current({ type: 'error', detail: e.nativeEvent.description })}
      />
    </View>
  );
});
