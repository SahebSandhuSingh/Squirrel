import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

// StrictMode is RE-ENABLED (P1-I): the camera, model-load, and WebSocket effects are now
// idempotent under StrictMode's intentional double-invoke in dev (guarded against double-open,
// stale-socket callbacks ignored, streams/landmarker stopped on cleanup). The ErrorBoundary
// (P1-E2) wraps <App/> so any lifecycle bug StrictMode surfaces shows a recoverable fallback
// instead of a blank screen.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
