/**
 * Pinch / pan / programmatic zoom kept outside React: gestures drive Animated values (native
 * driver where available) and never re-render the map. Listeners hear about zoom only when a
 * gesture ends or a programmatic move starts — that's when clustering recomputes.
 */
import { Animated, PanResponder, type GestureResponderEvent } from 'react-native';
import { NATIVE } from '@/components/ui';

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;

export class PanZoom {
  scale = new Animated.Value(1);
  tx = new Animated.Value(0);
  ty = new Animated.Value(0);
  /** 1/scale — keeps markers a constant size on screen. */
  inverse = Animated.divide(1, this.scale);
  private cur = { s: 1, x: 0, y: 0 };
  private start = { s: 1, x: 0, y: 0, dist: 0 };
  private box = { w: 0, h: 0 };
  private interactive = true;
  private zoomListeners = new Set<(s: number) => void>();

  setBox(w: number, h: number) {
    this.box = { w, h };
  }
  setInteractive(v: boolean) {
    this.interactive = v;
  }
  get zoom() {
    return this.cur.s;
  }
  onZoom(l: (s: number) => void) {
    this.zoomListeners.add(l);
    return () => void this.zoomListeners.delete(l);
  }
  private notify() {
    this.zoomListeners.forEach((l) => l(this.cur.s));
  }
  private static dist(e: GestureResponderEvent) {
    const t = e.nativeEvent.touches;
    return t.length >= 2 ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY) : 0;
  }
  private clamp(s: number, x: number, y: number) {
    const maxX = ((s - 1) * this.box.w) / 2 + this.box.w * 0.15;
    const maxY = ((s - 1) * this.box.h) / 2 + this.box.h * 0.15;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }
  apply(s: number, x: number, y: number, animate = false) {
    const c = this.clamp(s, x, y);
    this.cur = { s, x: c.x, y: c.y };
    if (animate) {
      Animated.parallel([
        Animated.spring(this.scale, { toValue: s, useNativeDriver: NATIVE, speed: 16, bounciness: 3 }),
        Animated.spring(this.tx, { toValue: c.x, useNativeDriver: NATIVE, speed: 16, bounciness: 3 }),
        Animated.spring(this.ty, { toValue: c.y, useNativeDriver: NATIVE, speed: 16, bounciness: 3 }),
      ]).start();
      this.notify();
    } else {
      this.scale.setValue(s);
      this.tx.setValue(c.x);
      this.ty.setValue(c.y);
    }
  }
  zoomBy(f: number) {
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.cur.s * f));
    this.apply(s, this.cur.x * (s / this.cur.s), this.cur.y * (s / this.cur.s), true);
  }
  /** Put view point (vx, vy) — unscaled view coordinates — at the centre, at scale s. */
  centerOn(vx: number, vy: number, s = Math.max(this.cur.s, 2.2)) {
    const ss = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    this.apply(ss, -ss * (vx - this.box.w / 2), -ss * (vy - this.box.h / 2), true);
  }
  reset() {
    this.apply(1, 0, 0, true);
  }
  responder = PanResponder.create({
    // Taps go to zones/markers; a pinch, or a drag, takes over.
    onMoveShouldSetPanResponder: (e, g) => this.interactive && (e.nativeEvent.touches.length >= 2 || Math.abs(g.dx) + Math.abs(g.dy) > 6),
    onPanResponderGrant: (e) => {
      this.start = { ...this.cur, dist: PanZoom.dist(e) };
    },
    onPanResponderMove: (e, g) => {
      const d = PanZoom.dist(e);
      if (d && this.start.dist) {
        const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (this.start.s * d) / this.start.dist));
        this.apply(s, this.start.x * (s / this.start.s), this.start.y * (s / this.start.s));
      } else if (d && !this.start.dist) {
        this.start = { ...this.cur, dist: d };
      } else {
        this.apply(this.cur.s, this.start.x + g.dx, this.start.y + g.dy);
      }
    },
    onPanResponderRelease: () => this.notify(),
    onPanResponderTerminate: () => this.notify(),
    onPanResponderTerminationRequest: () => true,
  });
}
