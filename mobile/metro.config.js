// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 3D avatar models (src/art/Avatar3DViewer.tsx) ship as .glb, and the vendored
// <model-viewer> script ships as .txt so Metro treats it as an opaque asset rather
// than source code. Both are resolved at runtime via expo-asset.
config.resolver.assetExts.push('glb', 'gltf', 'bin', 'txt');

module.exports = config;
