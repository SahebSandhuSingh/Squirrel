/* Skeleton.tsx — C3 Skeleton Overlay driven by REAL MediaPipe landmarks, plus the live
   camera <video> backdrop (replaces the prototype's mock studio gradient + interpPose).
   The board is a fixed 1280×720 surface; landmarks are normalized (0..1) so they map by
   simple scale. Flagged joints recolor per the active correction severity. */
import type { CSSProperties } from 'react'
import type { EngineState, FlaggedJoint, FlaggedSide } from '../types'
import { Q } from '../tokens'
import { isDimmed } from '../selectors'
import { LANDMARK_VIS_FLOOR } from '../config'

const W = 1280
const H = 720

// BlazePose 33-landmark indices we draw (skip face mesh / hands tips for a clean figure).
const I = {
  nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28,
}
const LIMBS: [number, number][] = [
  [I.lShoulder, I.rShoulder], [I.lShoulder, I.lElbow], [I.lElbow, I.lWrist],
  [I.rShoulder, I.rElbow], [I.rElbow, I.rWrist],
  [I.lShoulder, I.lHip], [I.rShoulder, I.rHip], [I.lHip, I.rHip],
  [I.lHip, I.lKnee], [I.lKnee, I.lAnkle], [I.rHip, I.rKnee], [I.rKnee, I.rAnkle],
]
const JOINTS = [
  I.nose, I.lShoulder, I.rShoulder, I.lElbow, I.rElbow, I.lWrist, I.rWrist,
  I.lHip, I.rHip, I.lKnee, I.rKnee, I.lAnkle, I.rAnkle,
]

// Which landmark indices a flagged joint group highlights.
const FLAG_INDICES: Record<NonNullable<FlaggedJoint>, number[]> = {
  knees: [I.lKnee, I.rKnee],
  legs: [I.lHip, I.rHip, I.lKnee, I.rKnee, I.lAnkle, I.rAnkle],
  shins: [I.lKnee, I.rKnee, I.lAnkle, I.rAnkle],
  trunk: [I.lShoulder, I.rShoulder, I.lHip, I.rHip],
  hips: [I.lHip, I.rHip],
  ankles: [I.lAnkle, I.rAnkle],
  shoulders: [I.lShoulder, I.rShoulder],
  elbows: [I.lElbow, I.rElbow],
  wrists: [I.lWrist, I.rWrist],
}

// Groups that recolor SPECIFIC limbs instead of every limb touching a flagged joint.
// A shrug is read across the shoulder line, so that line is what turns red — reddening the arms
// hanging off it would blame the arms for a fault measured between the shoulders. Groups absent
// here keep the original behaviour: any limb touching a flagged joint recolors.
//
// A lateral torso lean is read as the shoulder line's angle over the hip line, so the fault lives
// in the torso QUADRILATERAL — both shoulders, both hips, and the four segments joining them.
// Without this entry the fallback reddens the arms and legs too, because they hang off those same
// four joints, blaming limbs for a fault measured across the torso.
const FLAG_LIMBS: Partial<Record<NonNullable<FlaggedJoint>, [number, number][]>> = {
  shoulders: [[I.lShoulder, I.rShoulder]],
  trunk: [
    [I.lShoulder, I.rShoulder],
    [I.lShoulder, I.lHip],
    [I.rShoulder, I.rHip],
    [I.lHip, I.rHip],
  ],
}

// Groups whose fault is genuinely ONE-SIDED, so the highlight follows the reported side.
// Elbow flare is the elbow leaving its corridor beside the torso, so the arm that drifted AND the
// torso side it drifted away from both turn red — showing the gap that opened up. The opposite arm
// is not at fault and stays green, which the side-agnostic fallback could not express.
const SIDE_LIMBS: Partial<
  Record<NonNullable<FlaggedJoint>, Record<'left' | 'right', [number, number][]>>
> = {
  // High Knee reports the lifted side, so only that hip-to-knee-to-ankle chain is blamed. A setup
  // failure has no side and therefore resolves to both complete leg chains.
  legs: {
    left: [[I.lHip, I.lKnee], [I.lKnee, I.lAnkle]],
    right: [[I.rHip, I.rKnee], [I.rKnee, I.rAnkle]],
  },
  // Setup stance readiness is communicated only through the lower-leg line. Hip-to-knee remains
  // green so the pre-check does not imply that the whole leg is at fault.
  shins: {
    left: [[I.lKnee, I.lAnkle]],
    right: [[I.rKnee, I.rAnkle]],
  },
  elbows: {
    left: [[I.lShoulder, I.lElbow], [I.lElbow, I.lWrist], [I.lShoulder, I.lHip]],
    right: [[I.rShoulder, I.rElbow], [I.rElbow, I.rWrist], [I.rShoulder, I.rHip]],
  },
}

/* Limbs to redden for this group, honouring the reported side when the group has one.
   A side-aware group with NO reported side falls back to both sides rather than guessing. */
function resolveFlaggedLimbs(
  joint: FlaggedJoint,
  side: FlaggedSide,
): [number, number][] | undefined {
  if (!joint) return undefined
  const sided = SIDE_LIMBS[joint]
  if (sided) {
    if (side === 'left' || side === 'right') return sided[side]
    return [...sided.left, ...sided.right]
  }
  return FLAG_LIMBS[joint]
}

export function CameraVideo({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) {
  // The live feed fills the board. Mirrored to match a front-facing "selfie" view, which is
  // how the user expects to see themselves (and matches MediaPipe's left/right labeling here).
  return (
    <video
      ref={videoRef}
      playsInline
      muted
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', transform: 'scaleX(-1)', background: '#0a0c10',
      }}
    />
  )
}

export function SkeletonOverlay(
  { s, solid = false, visFloor = LANDMARK_VIS_FLOOR }:
  { s: EngineState; solid?: boolean; visFloor?: number },
) {
  const landmarks = s.poseLandmarks
  if (!landmarks || landmarks.length < 29) return null

  // `solid` forces the live-workout look (no dim/dash). The prep stages (F2) never drive
  // trackingConfidence, so isDimmed would otherwise be permanently true there.
  const dim = !solid && isDimmed(s)
  const sev = s.correctionSeverity
  const flagColor = sev === 'error' ? Q.red : sev === 'warning' ? Q.amber : Q.green
  const flaggedLimbs = resolveFlaggedLimbs(s.flaggedJoint, s.flaggedSide)
  // When specific limbs are named, the dots follow them exactly, so joints and lines never disagree
  // about which side is at fault.
  const flagged = new Set(
    flaggedLimbs
      ? flaggedLimbs.flat()
      : s.flaggedJoint ? FLAG_INDICES[s.flaggedJoint] : [],
  )
  const base = Q.green

  // The video is mirrored (scaleX(-1)); mirror landmark x to stay aligned with the body.
  const px = (i: number): [number, number] => {
    const lm = landmarks[i]
    return [(1 - lm.x) * W, lm.y * H]
  }
  // Draw only joints at/above `visFloor`. Calibration passes the stricter backend floor so the
  // skeleton matches the "x/33 body visible" count exactly — no phantom limbs to off-frame,
  // low-confidence joints (which read as a broken detection).
  const visible = (i: number) => (landmarks[i]?.visibility ?? 0) > visFloor
  const limbColor = (a: number, b: number) => {
    if (flaggedLimbs) {
      const hit = flaggedLimbs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
      return hit ? flagColor : base
    }
    return (flagged.has(a) || flagged.has(b)) ? flagColor : base
  }
  const opacity = dim ? 0.42 : 0.95
  const svgStyle: CSSProperties = {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    transition: 'opacity .35s', opacity, filter: `drop-shadow(0 0 6px ${base}40)`,
  }

  return (
    <svg width={W} height={H} style={svgStyle}>
      {LIMBS.map(([a, b], i) => {
        if (!visible(a) || !visible(b)) return null
        const [x1, y1] = px(a), [x2, y2] = px(b)
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={limbColor(a, b)} strokeWidth={5} strokeLinecap="round"
          strokeDasharray={dim ? '2 9' : 'none'} style={{ transition: 'stroke .35s' }} />
      })}
      {JOINTS.map((j) => {
        if (!visible(j)) return null
        const [x, y] = px(j)
        const isF = flagged.has(j)
        const c = isF ? flagColor : base
        const r = j === I.nose ? 11 : (isF ? 8 : 6)
        return (
          <g key={j}>
            {isF && <circle cx={x} cy={y} r={r + 6} fill="none" stroke={c} strokeWidth={2} opacity={0.5} />}
            <circle cx={x} cy={y} r={r} fill={c} stroke="rgba(0,0,0,0.35)" strokeWidth={1.5} style={{ transition: 'fill .35s' }} />
          </g>
        )
      })}
    </svg>
  )
}
