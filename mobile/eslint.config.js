// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'web-build/*', '.expo/*', 'assets/*'],
  },
  {
    rules: {
      // `react-hooks/refs` is the React Compiler's rule and rejects the standard React Native
      // pattern `const v = useRef(new Animated.Value(0)).current`, which the whole animation
      // layer (art/, components/ui.tsx) is built on and which is fine without the compiler.
      // The other compiler rules (purity, set-state-in-effect, immutability…) stay on.
      'react-hooks/refs': 'off',
    },
  },
]);
