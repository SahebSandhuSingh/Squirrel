/* ErrorBoundary.tsx — top-level recovery boundary (P1-E2).
   Wraps <App/> in main.tsx (OUTSIDE App's own hooks) so a throw from useEngine / usePose /
   any render path shows a recoverable fallback instead of a blank white screen. This is the
   safety net that lets us re-enable StrictMode (P1-I): if a lifecycle bug surfaces in dev,
   it's caught here rather than crashing the tab.

   Error routing (the rest of the "toast policy"):
     • Camera / model errors  → persistent copy in the F1 start gate (usePose → App, P1-E1).
     • WebSocket reconnect     → dedicated F3 "Reconnecting…" banner (P0-D).
     • Malformed WS frames     → rate-limited console.warn (useEngine warnThrottled, P0-E).
   This boundary handles only the unexpected-throw case. */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface for debugging; a real deployment would forward this to error reporting (P2/D5).
    console.error('[error-boundary] uncaught error:', error, info.componentStack)
  }

  private handleReload = () => {
    // Full reload is the safe recovery — it re-runs calibration from F1.
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
        background: 'radial-gradient(120% 90% at 50% 0%, #0c0f14, #060708 70%)', color: '#edeff4',
        fontFamily: 'Barlow, system-ui, sans-serif', padding: 24, textAlign: 'center',
      }}>
        <div style={{ maxWidth: 460 }}>
          <div style={{ fontSize: 30, fontWeight: 700, marginBottom: 12 }}>Something went wrong</div>
          <div style={{ fontSize: 16, color: 'rgba(237,239,244,0.7)', marginBottom: 24, lineHeight: 1.5 }}>
            The app hit an unexpected error. Reloading will start a fresh session from calibration.
          </div>
          <button onClick={this.handleReload} style={{
            padding: '14px 28px', borderRadius: 13, border: 'none', background: '#46d39a',
            color: '#08090c', fontSize: 16, fontWeight: 700, cursor: 'pointer',
          }}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
