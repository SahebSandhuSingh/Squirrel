import { describe, it, expect } from "vitest";
import { computeXp, exerciseSessionXp, runLines, xpDay, type ActivityRow } from "./rules.js";

let seq = 0;
function row(over: Partial<ActivityRow> & { started_at: Date }): ActivityRow {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    type: "run",
    source_module: "run_module",
    duration_s: 1800,
    metrics: { distance_m: 5000, territory_claimed: true, rejection_reason: null },
    created_at: over.started_at,
    ...over,
  };
}

const IST = "Asia/Kolkata";
const at = (iso: string): Date => new Date(iso);

describe("run XP", () => {
  it("a 5 km run that captures territory earns 125 (50 + 50 + 25)", () => {
    expect(computeXp([row({ started_at: at("2026-09-26T01:00:00Z") })], IST)).toEqual({
      xp: 125,
      updated_at: at("2026-09-26T01:00:00Z"),
      breakdown: [
        { reason: "run_completed", xp: 50 },
        { reason: "run_distance", xp: 50 },
        { reason: "territory_captured", xp: 25 },
      ],
    });
  });

  it("distance is 1 XP per whole 100 m; no territory, no territory XP", () => {
    expect(runLines({ distance_m: 799, territory_claimed: false, rejection_reason: null })).toEqual([
      { reason: "run_completed", xp: 50 },
      { reason: "run_distance", xp: 7 },
    ]);
  });

  it("a rejected run earns nothing", () => {
    const rejected = row({
      started_at: at("2026-09-26T01:00:00Z"),
      metrics: { distance_m: 5000, territory_claimed: false, rejection_reason: "anticheat_rejected" },
    });
    expect(computeXp([rejected], IST)).toEqual({ xp: 0, updated_at: null, breakdown: [] });
  });

  it("caps runs at 150 XP a day, cutting the latest runs, and shows the cap as a line", () => {
    const rows = [
      row({ started_at: at("2026-09-26T03:00:00Z") }), // 125
      row({ started_at: at("2026-09-26T05:00:00Z") }), // 125 → only 25 left
      row({ started_at: at("2026-09-26T07:00:00Z") }), // 125 → 0 left
    ];
    const summary = computeXp(rows, IST);
    expect(summary.xp).toBe(150);
    expect(summary.breakdown.find((l) => l.reason === "run_daily_cap")).toEqual({ reason: "run_daily_cap", xp: -225 });
    // XP last went up with the second run; the third earned nothing.
    expect(summary.updated_at).toEqual(at("2026-09-26T05:00:00Z"));
  });

  it("the cap follows the Indian calendar day, not UTC", () => {
    // 23:00 UTC on the 25th is 04:30 IST on the 26th: same IST day as the 10:00 UTC run.
    const rows = [row({ started_at: at("2026-09-25T23:00:00Z") }), row({ started_at: at("2026-09-26T10:00:00Z") })];
    expect(computeXp(rows, IST).xp).toBe(150);
    expect(computeXp(rows, "UTC").xp).toBe(250);
    expect(xpDay(at("2026-09-25T23:00:00Z"), IST)).toBe("2026-09-26");
  });

  it("the order rows arrive in does not change the result", () => {
    const rows = [
      row({ started_at: at("2026-09-26T07:00:00Z"), metrics: { distance_m: 0, territory_claimed: false, rejection_reason: null } }),
      row({ started_at: at("2026-09-26T03:00:00Z") }),
      row({ started_at: at("2026-09-26T05:00:00Z") }),
    ];
    expect(computeXp(rows, IST)).toEqual(computeXp([...rows].reverse(), IST));
  });
});

describe("exercise XP", () => {
  it("scores a session by its length", () => {
    expect(exerciseSessionXp(9 * 60 + 59)).toBe(0);
    expect(exerciseSessionXp(10 * 60)).toBe(30);
    expect(exerciseSessionXp(19 * 60 + 59)).toBe(30);
    expect(exerciseSessionXp(20 * 60)).toBe(50);
    expect(exerciseSessionXp(44 * 60 + 59)).toBe(50);
    expect(exerciseSessionXp(45 * 60)).toBe(70);
    expect(exerciseSessionXp(3 * 3600)).toBe(70);
  });

  const workout = (iso: string, minutes: number): ActivityRow =>
    row({ started_at: at(iso), type: "exercise", source_module: "exercise_module", duration_s: minutes * 60, metrics: { reps: 30 } });

  it("caps exercise at 150 XP a day, separately from runs", () => {
    const rows = [
      workout("2026-09-26T02:00:00Z", 50), // 70
      workout("2026-09-26T04:00:00Z", 50), // 70
      workout("2026-09-26T06:00:00Z", 50), // 70 → 10
      row({ started_at: at("2026-09-26T08:00:00Z") }), // run: 125, its own cap
    ];
    const summary = computeXp(rows, IST);
    expect(summary.xp).toBe(150 + 125);
    expect(summary.breakdown).toEqual([
      { reason: "run_completed", xp: 50 },
      { reason: "run_distance", xp: 50 },
      { reason: "territory_captured", xp: 25 },
      { reason: "exercise_session", xp: 210 },
      { reason: "exercise_daily_cap", xp: -60 },
    ]);
  });

  it("a short session earns nothing and does not move updated_at", () => {
    expect(computeXp([workout("2026-09-26T02:00:00Z", 5)], IST)).toEqual({ xp: 0, updated_at: null, breakdown: [] });
  });

  it("counts a row only when the module that owns its type wrote it", () => {
    const forged = [
      row({ started_at: at("2026-09-26T02:00:00Z"), type: "exercise", source_module: "run_module", duration_s: 3600 }),
      row({ started_at: at("2026-09-26T03:00:00Z"), type: "run", source_module: "exercise_module" }),
      row({ started_at: at("2026-09-26T04:00:00Z"), type: "yoga", source_module: "exercise_module", duration_s: 3600 }),
    ];
    expect(computeXp(forged, IST).xp).toBe(0);
  });

  it("a new user has 0 XP, never null", () => {
    expect(computeXp([], IST)).toEqual({ xp: 0, updated_at: null, breakdown: [] });
  });
});
