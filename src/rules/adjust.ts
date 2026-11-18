// 8.3 운동 후 조정 (다음 같은 요일에 적용)
import type { Exercise, Rpe, SetLog, UserExerciseState, WorkoutSession } from '../types';

export type AdjustResult = 'next' | 'hold' | 'repeat' | 'easier' | 'plusOne' | 'plusTwo';

// 완료 화면 표시 문구. 'test'는 4주차 측정 세트 (판정 없음)
export const RESULT_LABEL: Record<AdjustResult | 'test', string> = {
  next: '다음 단계',
  hold: '유지',
  repeat: '한 번 더',
  easier: '쉬운 단계로',
  plusOne: '+1회',
  plusTwo: '+2회',
  test: '측정',
};

function atLevel(ex: Exercise, state: UserExerciseState, level: number): UserExerciseState {
  const step = ex.steps[level];
  return { ...state, currentLevel: level, targetRepsPerSet: step.fixedReps ? step.repMin : undefined, stallCount: 0 };
}

/**
 * plannedSets: 오늘 예정된 일반 세트 수 (측정 세트 제외).
 * 측정 세트(isTest)는 여기서 빼고 계산한다.
 */
export function adjustExercise(
  ex: Exercise,
  state: UserExerciseState,
  sets: SetLog[],
  plannedSets: number,
  rpe?: Rpe,
): { state: UserExerciseState; result: AdjustResult } {
  const values = sets.filter((s) => s.exerciseId === ex.id && !s.isTest).map((s) => s.value);
  // 예정 세트를 다 채우지 못하면 판정하지 않고 유지
  if (plannedSets <= 0 || values.length < plannedSets) return { state, result: 'hold' };

  const step = ex.steps[state.currentLevel];
  const hasNext = state.currentLevel + 1 < ex.steps.length;
  const hard = rpe === 'hard';

  if (step.fixedReps) {
    const target = state.targetRepsPerSet ?? step.repMin;
    if (hard || values.some((v) => v < target)) return { state, result: 'hold' };
    if (target + 1 <= step.repMax) return { state: { ...state, targetRepsPerSet: target + 1 }, result: 'plusOne' };
    if (hasNext) return { state: atLevel(ex, state, state.currentLevel + 1), result: 'next' };
    return { state, result: 'hold' };
  }

  if (!hard && values.every((v) => v >= step.repMax)) {
    if (hasNext) return { state: atLevel(ex, state, state.currentLevel + 1), result: 'next' };
    return { state: { ...state, stallCount: 0 }, result: 'hold' };
  }
  if (values.some((v) => v < step.repMin)) {
    const stallCount = state.stallCount + 1;
    if (stallCount >= 2 && state.currentLevel > 0) return { state: atLevel(ex, state, state.currentLevel - 1), result: 'easier' };
    return { state: { ...state, stallCount }, result: 'repeat' };
  }
  return { state: { ...state, stallCount: 0 }, result: 'hold' };
}

/** 회차별 목표 대비 차이 (초/km). − 빠름, + 느림 */
export function lapPaceDiffs(laps: NonNullable<WorkoutSession['intervalLaps']>, distanceM: number, targetPace: number) {
  return laps.map((l) => l.seconds / ((l.distanceM ?? distanceM) / 1000) - targetPace);
}

export function adjustInterval(opts: {
  laps: NonNullable<WorkoutSession['intervalLaps']>;
  distanceM: number;
  targetPace: number;
  plannedReps: number;
  currentReps: number;
  maxReps: number;
  location: 'outdoor' | 'indoor';
}): { reps: number; result: AdjustResult; diffs: number[]; avgDiff?: number } {
  const keep = { reps: opts.currentReps, result: 'hold' as const };
  if (opts.location === 'indoor') return { ...keep, diffs: [] };

  const diffs = lapPaceDiffs(opts.laps, opts.distanceM, opts.targetPace);
  const avgDiff = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : undefined;
  if (avgDiff === undefined || opts.laps.length < opts.plannedReps || avgDiff >= 5) return { ...keep, diffs, avgDiff };

  // 최대 회차에 걸리면 실제로 늘어난 만큼만 표시한다
  const reps = Math.min(opts.maxReps, opts.currentReps + (avgDiff <= -10 ? 2 : 1));
  const added = reps - opts.currentReps;
  return {
    reps,
    result: added >= 2 ? 'plusTwo' : added === 1 ? 'plusOne' : 'hold',
    diffs,
    avgDiff,
  };
}
