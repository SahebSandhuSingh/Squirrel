import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { WebView } from 'react-native-webview';
import { colors, fonts } from '@/theme';
// Vendored copy of @google/model-viewer (BSD-3-Clause, see assets/vendor/model-viewer-LICENSE.txt).
// Stored as .txt so Metro bundles it as an opaque asset instead of parsing it as source.
import MODEL_VIEWER_JS from '../../assets/vendor/model-viewer-umd.min.js.txt';

/**
 * Renders a .glb inside a WebView using Google's <model-viewer> web component.
 *
 * How the files get into the page — and why it's done this way:
 *  - Neither Chromium (Android WebView) nor WebKit (WKWebView) lets `fetch()` read a
 *    `file://` URL, and three.js's GLTFLoader uses fetch. So the model can't simply be
 *    pointed at with `src="file://…"`.
 *  - Both engines DO allow XMLHttpRequest to a sibling file when the page itself was
 *    loaded from a `file://` URL and the WebView grants read access to that directory
 *    (`allowFileAccessFromFileURLs` on Android, `allowingReadAccessToURL` on iOS).
 *  - So we stage everything in one cache folder: the vendored model-viewer script, the
 *    .glb, and a small viewer.html. The page XHRs the .glb into a Blob and hands
 *    model-viewer a blob: URL. Nothing is fetched from the network.
 *
 * Deliberately NOT native three.js/expo-gl: that needs a custom dev client, while
 * react-native-webview, expo-asset and expo-file-system are all bundled in Expo Go.
 *
 * Web has no WebView; the avatar screen hides the 3D toggle there.
 */

const STAGE_DIR_NAME = 'avatar3d';
const LIB_NAME = 'model-viewer-umd.min.js';

async function stageAsset(module: number, dir: Directory, fileName: string): Promise<File> {
  const dest = new File(dir, fileName);
  if (dest.exists) return dest;
  const asset = await Asset.fromModule(module).downloadAsync();
  const src = asset.localUri ?? asset.uri;
  await new File(src).copy(dest, { overwrite: true });
  return dest;
}

const viewerHtml = (modelFileName: string) => `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; height: 100%; }
      model-viewer { width: 100%; height: 100%; --poster-color: transparent; }
      #err { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; font: 12px sans-serif; color: #8A93A6; text-align: center; padding: 16px; }
    </style>
    <script src="./${LIB_NAME}"></script>
  </head>
  <body>
    <model-viewer
      id="mv"
      camera-controls
      auto-rotate
      auto-rotate-delay="0"
      rotation-per-second="18deg"
      touch-action="pan-y"
      shadow-intensity="0.7"
      exposure="1.0"
      camera-orbit="0deg 80deg 105%"
      interaction-prompt="none"
    ></model-viewer>
    <div id="err">Couldn't load the 3D model.</div>
    <script>
      (function () {
        var post = function (msg) {
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
        };
        var fail = function (why) {
          document.getElementById('err').style.display = 'flex';
          post('error:' + why);
        };
        var mv = document.getElementById('mv');
        mv.addEventListener('load', function () { post('loaded'); });
        mv.addEventListener('error', function (e) { fail((e && e.detail && e.detail.type) || 'model'); });
        var xhr = new XMLHttpRequest();
        xhr.open('GET', './${modelFileName}', true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function () {
          if (xhr.status !== 200 && xhr.status !== 0) return fail('http-' + xhr.status);
          if (!xhr.response || !xhr.response.byteLength) return fail('empty');
          var blob = new Blob([xhr.response], { type: 'model/gltf-binary' });
          mv.src = URL.createObjectURL(blob);
        };
        xhr.onerror = function () { fail('xhr'); };
        xhr.send();
      })();
    </script>
  </body>
</html>`;

type Stage = { htmlUri: string; dirUri: string };

/** Copies the script and the requested model into the cache folder and writes viewer.html next to them. */
async function prepareStage(modelFile: number): Promise<Stage> {
  const dir = new Directory(Paths.cache, STAGE_DIR_NAME);
  dir.create({ intermediates: true, idempotent: true });
  await stageAsset(MODEL_VIEWER_JS, dir, LIB_NAME);
  const asset = Asset.fromModule(modelFile);
  const modelName = `${asset.hash ?? asset.name}.glb`;
  await stageAsset(modelFile, dir, modelName);
  const html = new File(dir, `viewer-${asset.hash ?? asset.name}.html`);
  if (!html.exists) html.write(viewerHtml(modelName));
  return { htmlUri: html.uri, dirUri: dir.uri };
}

export function Avatar3DViewer({ modelFile, size = 260 }: { modelFile: number; size?: number }) {
  const [stage, setStage] = useState<Stage | null>(null);
  // No WebView on web: fail fast with a friendly note. (The parent remounts this component
  // per model, so there's no stale state to reset when `modelFile` changes.)
  const [failed, setFailed] = useState<string | null>(Platform.OS === 'web' ? 'web' : null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    prepareStage(modelFile)
      .then((s) => {
        if (!cancelled) setStage(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setFailed(e instanceof Error ? e.message : 'stage');
      });
    return () => {
      cancelled = true;
    };
  }, [modelFile]);

  const box = [styles.box, { width: size, height: size }];

  if (failed) {
    return (
      <View style={box}>
        <Text style={styles.note}>{failed === 'web' ? '3D preview is available in the mobile app.' : "Couldn't load the 3D preview."}</Text>
      </View>
    );
  }

  if (!stage) {
    return (
      <View style={box}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={box}>
      <WebView
        originWhitelist={['*']}
        source={{ uri: stage.htmlUri }}
        style={{ backgroundColor: 'transparent' }}
        // Android: let the file:// page XHR its sibling .glb.
        allowFileAccess
        allowFileAccessFromFileURLs
        // iOS: grant the page read access to the whole staging folder.
        allowingReadAccessToURL={stage.dirUri}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        onMessage={(e) => {
          const msg = String(e.nativeEvent.data ?? '');
          if (msg.startsWith('error:')) setFailed(msg);
        }}
        renderLoading={() => (
          <View style={[styles.box, StyleSheet.absoluteFill]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  note: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center', paddingHorizontal: 24 },
});
