/* CoachStub.tsx — a camera-free placeholder for the pose-coach, so the onboarding
   flow (landing → onboarding → modes → welcome-back) can be clicked through without
   starting the webcam / MediaPipe / WebSocket.

   Drop-in shape-compatible with CoachApp ({ userId, purpose, onExit }). Toggle
   between this and the real coach with USE_COACH_STUB in App.tsx. */
import { TYPE } from '../tokens'
import type { CoachPurpose } from '../CoachApp'
import { Stage } from '../Stage'
import { ACCENT, GhostButton, Mark, PrimaryButton, Screen, Wordmark } from './ui'

export default function CoachStub(
  { userId, onExit }:
  { userId?: string; purpose: CoachPurpose; onExit: () => void },
) {
  return (
    <Stage>
    <Screen style={{ display: 'grid', placeItems: 'center' }}>
      <div style={{ position: 'absolute', top: 36, left: 44, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Mark size={30} />
        <Wordmark size={18} />
      </div>

      {/* Exit chip mirrors the real coach overlay. */}
      <button type="button" onClick={onExit} className="fs-coach-chip" style={{ top: 22, left: 22 }}>← Exit</button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxWidth: 620 }}>
        <span style={{ ...TYPE.label, fontSize: 12, color: ACCENT, letterSpacing: '.18em' }}>Stub · camera off</span>
        <h1 style={{ ...TYPE.hero, fontSize: 64, margin: '14px 0 0', lineHeight: 0.96 }}>
          Solo Training
        </h1>
        <p style={{ ...TYPE.body, fontSize: 17, color: 'var(--ink-dim)', margin: '16px 0 0', lineHeight: 1.45 }}>
          The real coach runs the live workout here. This placeholder skips the webcam so you can test the flow.
        </p>
        <code style={{
          ...TYPE.body, fontSize: 13, color: 'var(--ink-dim)', marginTop: 18,
          background: 'rgba(255,255,255,0.05)', border: '1px solid var(--hairline)',
          borderRadius: 10, padding: '8px 14px',
        }}>
          {`user_id: ${userId ?? '(none)'}`}
        </code>

        <div style={{ display: 'flex', gap: 14, marginTop: 36 }}>
          <PrimaryButton onClick={onExit} style={{ fontSize: 16, padding: '15px 40px' }}>
            End session →
          </PrimaryButton>
          <GhostButton onClick={onExit} style={{ fontSize: 16, padding: '15px 30px' }}>Back to sessions</GhostButton>
        </div>
      </div>
    </Screen>
    </Stage>
  )
}
