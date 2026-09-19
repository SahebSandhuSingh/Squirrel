import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Stage 0 compatibility policy for pre-existing UI code. These are deliberately scoped to
  // the exact legacy modules reported by ESLint 10; new files receive the full rule set above.
  // Remove each exception when its owning module is structurally refactored and tested.
  {
    files: ['src/flow/report/SessionReport.tsx', 'src/useSessionClock.ts'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['src/flow/report/charts.tsx'],
    rules: {
      'react-hooks/immutability': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/pose/usePose.ts'],
    rules: {
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/refs': 'off',
    },
  },
  {
    files: ['src/tokens.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
