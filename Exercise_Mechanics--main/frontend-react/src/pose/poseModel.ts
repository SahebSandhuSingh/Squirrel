/* poseModel.ts — selectable MediaPipe Pose Landmarker model config (for benchmarking).
   The three official variants share the SAME 33-landmark output contract ({x,y,z,v}),
   so switching is drop-in — no backend change. They trade download size + per-frame
   inference cost for landmark accuracy:

     lite  (complexity 0) — smallest/fastest, lowest accuracy
     full  (complexity 1) — medium size/cost, medium accuracy     ← current default
     heavy (complexity 2) — largest/slowest, highest accuracy

   Pick a variant to validate WITHOUT editing code, then reload:
     • URL query:    ?model=full          (and optionally &delegate=cpu)
     • or localStorage: fitsync_pose_model = 'heavy', fitsync_pose_delegate = 'cpu'
   Precedence: query param → localStorage → default. The choice is read once at model
   load; switching requires a page reload (the landmarker is a per-session singleton).

   To measure the real cost of each: open DevTools → Network (download size of the
   .task file) and Performance/console (detectForVideo timing — see usePose's logger). */

export type ModelComplexity = 'lite' | 'full' | 'heavy'
export type Delegate = 'GPU' | 'CPU'

/** Change this one line to switch the shipped default for everyone. */
export const DEFAULT_COMPLEXITY: ModelComplexity = 'lite'
export const DEFAULT_DELEGATE: Delegate = 'GPU'

/** WASM bundle (shared by every variant). */
export const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm'

/** Official float16 model bundles. Heavy is ~5–6× the download of lite. */
export const MODEL_URLS: Record<ModelComplexity, string> = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  heavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
}

const COMPLEXITIES: ModelComplexity[] = ['lite', 'full', 'heavy']

function readOverride(queryKey: string, storageKey: string): string | null {
  try {
    const q = new URLSearchParams(location.search).get(queryKey)
    if (q) return q.toLowerCase()
    const s = localStorage.getItem(storageKey)
    if (s) return s.toLowerCase()
  } catch { /* SSR / private mode — fall through to default */ }
  return null
}

/** Resolve the active variant: query param → localStorage → default (validated). */
export function resolveComplexity(): ModelComplexity {
  const o = readOverride('model', 'fitsync_pose_model')
  return (o && (COMPLEXITIES as string[]).includes(o)) ? (o as ModelComplexity) : DEFAULT_COMPLEXITY
}

/** Resolve the inference backend: 'CPU' is useful for apples-to-apples benchmarking. */
export function resolveDelegate(): Delegate {
  const o = readOverride('delegate', 'fitsync_pose_delegate')
  return o === 'cpu' ? 'CPU' : o === 'gpu' ? 'GPU' : DEFAULT_DELEGATE
}

/** Opt-in inference profiler: ?posebench=1 logs a rolling avg/max of detectForVideo
   (ms) every ~2s to the console, so you can compare variants apples-to-apples. */
export function benchEnabled(): boolean {
  try { return new URLSearchParams(location.search).get('posebench') === '1' } catch { return false }
}

export type PoseModelConfig = { complexity: ModelComplexity; modelUrl: string; delegate: Delegate; wasmUrl: string }

/** The full resolved config used to build the PoseLandmarker. */
export function resolvePoseModelConfig(): PoseModelConfig {
  const complexity = resolveComplexity()
  return { complexity, modelUrl: MODEL_URLS[complexity], delegate: resolveDelegate(), wasmUrl: WASM_URL }
}
