// 근력 운동 진행: 오늘의 계획, 현재 위치, 마무리 조정
import type { DayType, Exercise, SetLog, UserExerciseState, WorkoutSession } from '../types';
import { adjustExercise, type AdjustResult } from './adjust';
import { TEST_SETS, type TestSet } from './assessment';
import { prescriptionFor } from './routine';

// testSet이 있으면 4주차 측정 세트 항목 (1세트, 난이도 선택 없음)
export type PlanItem = ReturnType<typeof prescriptionFor> & { ex: Exercise; state: UserExerciseState; testSet?: TestSet };

/** testDay: 4주차 측정일이면 그날 DayType. 측정 세트를 맨 앞에 몰고, 그 종목의 남은 세트는 평소 순서로 (8.5) */
export function buildPlan(exercises: Exercise[], states: UserExerciseState[], factor: number, testDay?: DayType): PlanItem[] {
  const plan: PlanItem[] = [...exercises]
    .sort((a, b) => a.order - b.order)
    .map((ex) => {
      const state = states.find((s) => s.exerciseId === ex.id)!;
      return { ex, state, ...prescriptionFor(ex, state, factor) };
    });
  const tests = (testDay && TEST_SETS[testDay]) || [];
  const testItems = tests.flatMap((t) => {
    const p = plan.find((x) => x.ex.id === t.exerciseId);
    return p ? [{ ...p, sets: 1, testSet: t }] : [];
  });
  const rest = plan
    .map((p) => (tests.some((t) => t.exerciseId === p.ex.id) ? { ...p, sets: p.sets - 1 } : p))
    .filter((p) => p.sets > 0);
  return [...testItems, ...rest];
}

const isItemSet = (item: PlanItem, s: SetLog) => s.exerciseId === item.ex.id && !!s.isTest === !!item.testSet;

export type Position =
  | { phase: 'work'; index: number; setIndex: number }
  | { phase: 'rpe'; index: number }
  | { phase: 'done' };

/** 저장된 세트 기록에서 지금 할 차례를 계산한다. 앱이 다시 열려도 이어서 할 수 있다 */
export function positionOf(plan: PlanItem[], session: WorkoutSession): Position {
  for (let index = 0; index < plan.length; index++) {
    const item = plan[index];
    const done = session.sets.filter((s) => isItemSet(item, s)).length;
    if (done < item.sets) return { phase: 'work', index, setIndex: done };
    if (!item.testSet && !session.rpeByExercise[item.ex.id]) return { phase: 'rpe', index };
  }
  return { phase: 'done' };
}

/** 8.3 조정을 종목마다 적용한다. 중간에 그만둔 종목은 adjustExercise가 유지로 처리 */
export function finishWorkout(plan: PlanItem[], session: WorkoutSession) {
  const states: UserExerciseState[] = [];
  const results: Record<string, AdjustResult> = {};
  for (const item of plan) {
    if (item.testSet) continue;
    const r = adjustExercise(item.ex, item.state, session.sets, item.sets, session.rpeByExercise[item.ex.id]);
    states.push(r.state);
    results[item.ex.id] = r.result;
  }
  return { states, results };
}

/** 실내 HIIT: 시작 후 경과 초로 지금 라운드(1부터)와 운동/휴식 구간을 계산. 마지막 라운드 뒤에는 휴식 없음 */
export function hiitPosition(elapsedSec: number, workSec: number, restSec: number, rounds: number) {
  const cycle = workSec + restSec;
  const i = Math.floor(elapsedSec / cycle);
  const t = elapsedSec - i * cycle;
  if (i >= rounds || (i === rounds - 1 && t >= workSec)) return { phase: 'done' as const, round: rounds, remain: 0 };
  return t < workSec
    ? { phase: 'work' as const, round: i + 1, remain: workSec - t }
    : { phase: 'rest' as const, round: i + 1, remain: cycle - t };
}
