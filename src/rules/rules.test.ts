import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../data/program';
import { initialState } from '../db';
import type { Assessment, Settings, SetLog, UserExerciseState } from '../types';
import { adjustExercise, adjustInterval } from './adjust';
import { applyAssessment, collectAssessment, compareAreas, miniCheck, radarValues } from './assessment';
import { verdictOf } from './checkin';
import { cyclePosition, dayTypeOf, intervalPlan, isTestDay, mondayOf, prescriptionFor, scaledCount, volumeFactorFor } from './routine';
import { streakAsOf } from './streak';
import { buildPlan, finishWorkout, hiitPosition, positionOf } from './session';
import { doneLine, homeLine } from './coach';
import { distanceM } from '../hooks';

const MON = '2026-11-16';
const exById = (id: string) => EXERCISES.find((e) => e.id === id)!;
const logs = (exerciseId: string, values: number[], level = 1): SetLog[] =>
  values.map((value, setIndex) => ({ exerciseId, level, setIndex, value }));

describe('8.1 오늘의 루틴', () => {
  it('요일 → DayType', () => {
    expect(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'].map(dayTypeOf))
      .toEqual(['legs', 'push', 'interval_short', 'pull', 'interval_long', 'active_rest', 'rest']);
  });

  it('설치한 주의 월요일', () => {
    expect(mondayOf('2026-11-19')).toBe(MON);
    expect(mondayOf('2026-11-22')).toBe(MON); // 일요일은 앞 주 월요일
  });

  it('4주 주기 위치', () => {
    expect(cyclePosition(MON, MON)).toEqual({ cycleIndex: 1, week: 1 });
    expect(cyclePosition('2026-12-07', MON)).toEqual({ cycleIndex: 1, week: 4 });
    expect(cyclePosition('2026-12-14', MON)).toEqual({ cycleIndex: 2, week: 1 });
  });

  it('4주차 측정일: 월·화·목·금, 수요일은 아님', () => {
    expect(isTestDay('legs', 4)).toBe(true);
    expect(isTestDay('interval_long', 4)).toBe(true);
    expect(isTestDay('interval_short', 4)).toBe(false);
    expect(isTestDay('legs', 3)).toBe(false);
  });
});

describe('8.2 체크인 판단과 볼륨', () => {
  const base = { fatigue: 2 as const, soreParts: [], pain: false };
  it('통증이면 무조건 휴식', () => expect(verdictOf({ ...base, fatigue: 1, pain: true }, 'push')).toBe('active_rest'));
  it('피로도 4 이상이면 70%', () => expect(verdictOf({ ...base, fatigue: 4 }, 'push')).toBe('reduced'));
  it('오늘 쓰는 부위 근육통이면 70%', () => {
    expect(verdictOf({ ...base, soreParts: ['arm'] }, 'pull')).toBe('reduced');
    expect(verdictOf({ ...base, soreParts: ['legs'] }, 'interval_short')).toBe('reduced');
  });
  it('다른 부위 근육통이면 100%', () => expect(verdictOf({ ...base, soreParts: ['legs'] }, 'push')).toBe('full'));

  it('세트 수는 반올림, 최소 1', () => {
    expect(scaledCount(3, 0.7)).toBe(2);
    expect(scaledCount(5, 0.7)).toBe(4); // 3.5 → 4 (부동소수 오차 보정)
    expect(scaledCount(3, 0.6)).toBe(2);
    expect(scaledCount(4, 0.6)).toBe(2);
    expect(scaledCount(1, 0.6)).toBe(1);
    expect(scaledCount(16, 0.7)).toBe(11);
  });

  it('배율은 곱하지 않고 가장 낮은 값', () => {
    expect(volumeFactorFor({ week: 4, cycleIndex: 1, verdict: 'reduced' })).toBe(0.6);
    expect(volumeFactorFor({ week: 2, cycleIndex: 1, verdict: 'reduced' })).toBe(0.7);
    expect(volumeFactorFor({ week: 1, cycleIndex: 2, declinedCycleIndex: 2 })).toBe(0.8);
    expect(volumeFactorFor({ week: 2, cycleIndex: 2, declinedCycleIndex: 2 })).toBe(1);
  });

  it('70%여도 횟수 목표는 유지', () => {
    const ex = exById('ring_pushup');
    expect(prescriptionFor(ex, initialState(ex), 0.7)).toMatchObject({ sets: 3, repMin: 8, repMax: 12 });
  });
});

describe('8.3 범위형 종목', () => {
  const ex = exById('ring_pushup'); // 4 × 8~12
  const st = initialState(ex);

  it('모두 repMax 이상 + 힘들지 않음 → 다음 단계', () => {
    const r = adjustExercise(ex, st, logs(ex.id, [12, 12, 12, 13]), 4, 'ok');
    expect(r.result).toBe('next');
    expect(r.state.currentLevel).toBe(2);
  });
  it('모두 repMax 이상이어도 힘들었으면 유지', () => {
    expect(adjustExercise(ex, st, logs(ex.id, [12, 12, 12, 12]), 4, 'hard').result).toBe('hold');
  });
  it('repMin 미만 1회째 → 한 번 더, 2회 연속 → 쉬운 단계', () => {
    const r1 = adjustExercise(ex, st, logs(ex.id, [10, 9, 8, 7]), 4, 'hard');
    expect(r1).toMatchObject({ result: 'repeat', state: { currentLevel: 1, stallCount: 1 } });
    const r2 = adjustExercise(ex, r1.state, logs(ex.id, [9, 8, 7, 7]), 4, 'hard');
    expect(r2).toMatchObject({ result: 'easier', state: { currentLevel: 0, stallCount: 0 } });
  });
  it('유지가 끼면 연속 정체가 끊긴다', () => {
    const r = adjustExercise(ex, { ...st, stallCount: 1 }, logs(ex.id, [10, 10, 10, 10]), 4, 'ok');
    expect(r).toMatchObject({ result: 'hold', state: { stallCount: 0 } });
  });
  it('예정 세트를 다 못 채우면 판정 없이 유지', () => {
    const r = adjustExercise(ex, st, logs(ex.id, [12, 12, 12]), 4, 'easy');
    expect(r).toEqual({ state: st, result: 'hold' });
  });
  it('측정 세트는 계산에서 뺀다', () => {
    const sets = [{ ...logs(ex.id, [5])[0], isTest: true }, ...logs(ex.id, [12], 1).map((s) => ({ ...s, setIndex: 1 }))];
    expect(adjustExercise(ex, st, sets, 1, 'ok').result).toBe('next');
  });
  it('마지막 단계에서는 더 올라가지 않음', () => {
    expect(adjustExercise(ex, { ...st, currentLevel: 2 }, logs(ex.id, [12, 12, 12, 12], 2), 4, 'ok').result).toBe('hold');
  });
  it('고정 횟수형 단계로 올라가면 시작 횟수가 정해진다', () => {
    const dip = exById('ring_dip_negative');
    const r = adjustExercise(dip, initialState(dip), logs(dip.id, [3, 3, 3]), 3, 'ok');
    expect(r.state).toMatchObject({ currentLevel: 2, targetRepsPerSet: 2 });
  });
});

describe('8.3 고정 횟수형 종목 (턱걸이 5 × 2 → 5 × 5)', () => {
  const ex = exById('pullup');
  const st = initialState(ex);
  it('시작 처방 5 × 2', () => expect(prescriptionFor(ex, st, 1)).toMatchObject({ sets: 5, repMin: 2, repMax: 2 }));
  it('다 채우면 세트당 +1회', () => {
    expect(adjustExercise(ex, st, logs(ex.id, [2, 2, 2, 2, 2]), 5, 'ok')).toMatchObject({ result: 'plusOne', state: { targetRepsPerSet: 3 } });
  });
  it('못 채우거나 힘들었으면 유지', () => {
    expect(adjustExercise(ex, st, logs(ex.id, [2, 2, 2, 2, 1]), 5, 'ok').result).toBe('hold');
    expect(adjustExercise(ex, st, logs(ex.id, [2, 2, 2, 2, 2]), 5, 'hard').result).toBe('hold');
  });
  it('목표 5 × 5 도달 후 다음 단계가 없으면 유지', () => {
    expect(adjustExercise(ex, { ...st, targetRepsPerSet: 5 }, logs(ex.id, [5, 5, 5, 5, 5]), 5, 'ok').result).toBe('hold');
  });
});

describe('8.3 인터벌', () => {
  // 400m 목표 290초/km → 116초
  const base = { distanceM: 400, targetPace: 290, plannedReps: 3, currentReps: 6, maxReps: 10, location: 'outdoor' as const };
  const laps = (secs: number[]) => secs.map((seconds, index) => ({ index, seconds }));

  it('평균 10초 이상 빠름 → +2', () => expect(adjustInterval({ ...base, laps: laps([112, 112, 112]) })).toMatchObject({ reps: 8, result: 'plusTwo' }));
  it('그 사이 → +1', () => expect(adjustInterval({ ...base, laps: laps([116, 116, 116]) })).toMatchObject({ reps: 7, result: 'plusOne' }));
  it('평균 5초 이상 느림 → 유지', () => expect(adjustInterval({ ...base, laps: laps([118, 118, 118]) }).result).toBe('hold'));
  it('최대 회차를 넘지 않음', () => expect(adjustInterval({ ...base, currentReps: 9, laps: laps([100, 100, 100]) })).toMatchObject({ reps: 10, result: 'plusOne' }));
  it('이미 최대 회차면 유지로 표시', () => expect(adjustInterval({ ...base, currentReps: 10, laps: laps([100, 100, 100]) })).toMatchObject({ reps: 10, result: 'hold' }));
  it('실내면 판정 없음', () => expect(adjustInterval({ ...base, location: 'indoor', laps: [] })).toMatchObject({ reps: 6, result: 'hold' }));
  it('회차를 다 못 채우면 유지', () => expect(adjustInterval({ ...base, laps: laps([100, 100]) }).result).toBe('hold'));
  it('회차별 차이: − 빠름, + 느림', () => {
    expect(adjustInterval({ ...base, laps: laps([114, 118, 116]) }).diffs.map(Math.round)).toEqual([-5, 5, 0]);
  });
});

describe('인터벌 진행', () => {
  const settings = { intervalShortReps: 6, intervalLongReps: 3, shortPaceSecPerKm: 290, longPaceSecPerKm: 305 } as Settings;
  it('회차와 라운드에 배율 적용', () => {
    expect(intervalPlan('interval_short', settings, 0.7)).toMatchObject({ reps: 4, rounds: 11, pace: 290, distanceM: 400 });
    expect(intervalPlan('interval_long', settings, 1)).toMatchObject({ reps: 3, rounds: 16, pace: 305, repsKey: 'intervalLongReps' });
  });
  it('HIIT 라운드와 운동/휴식 구간', () => {
    expect(hiitPosition(0, 20, 10, 16)).toMatchObject({ phase: 'work', round: 1, remain: 20 });
    expect(hiitPosition(25, 20, 10, 16)).toMatchObject({ phase: 'rest', round: 1, remain: 5 });
    expect(hiitPosition(30, 20, 10, 16)).toMatchObject({ phase: 'work', round: 2 });
    expect(hiitPosition(15 * 30 + 19, 20, 10, 16)).toMatchObject({ phase: 'work', round: 16, remain: 1 });
    // 마지막 라운드 뒤에는 휴식 없이 끝
    expect(hiitPosition(15 * 30 + 20, 20, 10, 16).phase).toBe('done');
  });
});

describe('8.4 연속 일수', () => {
  it('월~토 하면 +1, 일요일은 건너뜀', () => {
    const days = { '2026-11-16': { done: true }, '2026-11-21': { done: true }, '2026-11-23': { done: true } };
    // 화요일을 빠졌으니 초기화 → 토(+1) → 일(그대로) → 월(+1) = 2
    expect(streakAsOf(MON, '2026-11-23', days)).toBe(2);
  });
  it('통증 날은 안 해도 끊기지 않음', () => {
    expect(streakAsOf(MON, '2026-11-18', { '2026-11-16': { done: true }, '2026-11-17': { pain: true }, '2026-11-18': { done: true } })).toBe(2);
  });
  it('오늘은 아직 안 했어도 끊기지 않음', () => {
    expect(streakAsOf(MON, '2026-11-17', { '2026-11-16': { done: true } })).toBe(1);
  });
  it('설치 전 날짜는 세지 않음', () => expect(streakAsOf('2026-11-18', '2026-11-18', { '2026-11-18': { done: true } })).toBe(1));
});

describe('8.5 평가', () => {
  const a = (cycleIndex: number, v: Partial<Assessment>): Assessment => ({ id: `a${cycleIndex}`, date: MON, cycleIndex, ...v });
  const settings: Settings = { programStartDate: MON, intervalShortReps: 6, intervalLongReps: 3, shortPaceSecPerKm: 290, longPaceSecPerKm: 305, quietModeDefault: false };
  const states = EXERCISES.map(initialState);

  it('레이더: 목표 대비, 상한 1, 3km는 짧을수록 좋음, 측정 없음은 undefined', () => {
    const r = radarValues(a(1, { pullupMax: 5, pushupMax: 30, dipMax: 4, run3kSec: 810, hollowHoldSec: 200 }));
    expect(r).toEqual({ pull: 0.5, push: 0.75, legs: undefined, core: 1, grip: undefined, cardio: 1 });
  });

  it('측정일 계획: 측정 세트 1개씩 맨 앞, 그 종목의 남은 세트는 평소 순서로', () => {
    const push = EXERCISES.filter((e) => e.day === 'push');
    const plan = buildPlan(push, push.map(initialState), 0.6, 'push');
    expect(plan.slice(0, 3).map((p) => [p.ex.id, p.sets, !!p.testSet])).toEqual([
      ['ring_pushup', 1, true], ['ring_dip_negative', 1, true], ['hollow_hold', 1, true],
    ]);
    // 4세트 링 푸시업 × 0.6 = 2세트 → 측정 1 + 1세트
    expect(plan.find((p) => p.ex.id === 'ring_pushup' && !p.testSet)!.sets).toBe(1);
    expect(plan.filter((p) => !p.testSet).map((p) => p.ex.order)).toEqual([...push].sort((x, y) => x.order - y.order).map((e) => e.order));
  });

  it('측정 세트는 따로 세고, 난이도 선택과 주간 조정에서 빠진다', () => {
    const pull = EXERCISES.filter((e) => e.day === 'pull');
    const plan = buildPlan(pull, pull.map(initialState), 0.6, 'pull');
    const sess = (sets: SetLog[]) => ({ id: MON, date: MON, dayType: 'pull' as const, volumeFactor: 0.6, startedAt: 0, completed: false, sets, rpeByExercise: {} });
    const test: SetLog = { exerciseId: 'pullup', level: 1, setIndex: 0, value: 4, isTest: true };
    expect(positionOf(plan, sess([test]))).toEqual({ phase: 'work', index: 1, setIndex: 0 });
    const { results } = finishWorkout(plan, sess([test]));
    expect(results.pullup).toBe('hold'); // 측정 세트만 하고 일반 세트를 안 했으면 유지
  });

  it('4주차 기록 모으기: 측정 세트(좌·우) + 데드행 + 3km', () => {
    const s = (dayType: 'legs' | 'pull' | 'interval_long', sets: SetLog[], tests = {}) =>
      ({ id: dayType, date: MON, dayType, volumeFactor: 0.6, startedAt: 0, completed: true, rpeByExercise: {}, sets, tests });
    const r = collectAssessment([
      s('legs', [{ exerciseId: 'bulgarian_split_squat', level: 1, setIndex: 0, value: 14, valueRight: 12, isTest: true }, ...logs('bulgarian_split_squat', [20], 1)]),
      s('pull', [{ exerciseId: 'pullup', level: 1, setIndex: 0, value: 5, isTest: true }], { deadHangSec: 60 }),
      s('interval_long', [], { run3kSec: 900 }),
    ], 1, MON);
    expect(r).toEqual({ id: 'cycle-1', date: MON, cycleIndex: 1, splitSquatMaxLeft: 14, splitSquatMaxRight: 12, pullupMax: 5, deadHangSec: 60, run3kSec: 900 });
  });

  it('4주차 금요일 인터벌은 3km × 1회차 (실내는 버피 3분 1라운드)', () => {
    expect(intervalPlan('interval_long', settings, 0.6, true)).toMatchObject({ distanceM: 3000, reps: 1, rounds: 1, hiit: { workSec: 180, restSec: 0 }, test: true });
  });

  it('턱걸이 향상 → 세트당 횟수를 새 최대치의 60%로 (목표 이하)', () => {
    const r = applyAssessment(a(1, { pullupMax: 7 }), [a(0, { pullupMax: 3 })], EXERCISES, states, settings);
    expect(r.states).toEqual([{ exerciseId: 'pullup', currentLevel: 1, targetRepsPerSet: 4, stallCount: 0 }]);
  });

  it('딥스는 실제 딥스 단계일 때만 재설정', () => {
    const r = applyAssessment(a(1, { dipMax: 6 }), [a(0, { dipMax: 1 })], EXERCISES, states, settings);
    expect(r.states).toEqual([]);
    const atDip: UserExerciseState[] = states.map((s) => (s.exerciseId === 'ring_dip_negative' ? { ...s, currentLevel: 2, targetRepsPerSet: 2 } : s));
    expect(applyAssessment(a(1, { dipMax: 6 }), [a(0, { dipMax: 1 })], EXERCISES, atDip, settings).states[0].targetRepsPerSet).toBe(4);
  });

  it('하락 → 다음 주기 첫 주 0.8, 3km → 페이스 재계산', () => {
    const r = applyAssessment(a(1, { pullupMax: 2, run3kSec: 900 }), [a(0, { pullupMax: 3 })], EXERCISES, states, settings);
    expect(r.declined).toBe(true);
    expect(r.settings).toMatchObject({ declinedCycleIndex: 2, longPaceSecPerKm: 300, shortPaceSecPerKm: 290 });
  });

  it('2회 연속 정체 영역 안내, 빈 항목은 비교에서 제외', () => {
    const r = applyAssessment(a(2, { pullupMax: 3 }), [a(0, { pullupMax: 3, dipMax: 1 }), a(1, { pullupMax: 3 })], EXERCISES, states, settings);
    expect(r.stalledTwice).toEqual(['pull']);
    expect(compareAreas(a(0, { dipMax: 1 }), a(1, {})).push).toBeUndefined();
  });

  it('유산소: 3km와 버피는 서로 비교하지 않는다 (하락으로 보지 않음)', () => {
    expect(compareAreas(a(1, { run3kSec: 870 }), a(2, { burpee3minCount: 30 })).cardio).toBeUndefined();
    expect(compareAreas(a(1, { burpee3minCount: 40 }), a(2, { burpee3minCount: 30 })).cardio).toBe('down');
    expect(applyAssessment(a(2, { burpee3minCount: 30 }), [a(1, { run3kSec: 870 })], EXERCISES, states, settings).declined).toBe(false);
  });

  it('2주차 미니 체크', () => {
    const s = (date: string, level: number, values: number[]) => ({
      id: date, date, dayType: 'push' as const, volumeFactor: 1, startedAt: 0, completed: true, rpeByExercise: {},
      sets: logs('ring_pushup', values, level),
    });
    expect(miniCheck([s('2026-11-24', 2, [9, 8]), s('2026-11-17', 1, [12, 12])])).toEqual([{ exerciseId: 'ring_pushup', levelDelta: 1, bestDelta: -3 }]);
  });
});

describe('운동 진행 위치와 마무리', () => {
  const legs = EXERCISES.filter((e) => e.day === 'legs');
  const plan = buildPlan(legs, legs.map(initialState), 0.7);
  const session = (sets: SetLog[], rpeByExercise = {}) => ({
    id: MON, date: MON, dayType: 'legs' as const, volumeFactor: 0.7, startedAt: 0, completed: false, sets, rpeByExercise,
  });

  it('계획: 순서대로, 세트 수에 배율 적용', () => {
    expect(plan.map((p) => p.ex.id)[0]).toBe('bulgarian_split_squat');
    expect(plan[0].sets).toBe(2);
  });
  it('저장된 기록에서 위치 계산: 세트 → 난이도 → 다음 종목 → 끝', () => {
    expect(positionOf(plan, session([]))).toEqual({ phase: 'work', index: 0, setIndex: 0 });
    const two = logs('bulgarian_split_squat', [12, 12]);
    expect(positionOf(plan, session(two))).toEqual({ phase: 'rpe', index: 0 });
    expect(positionOf(plan, session(two, { bulgarian_split_squat: 'ok' }))).toEqual({ phase: 'work', index: 1, setIndex: 0 });
    const all = plan.flatMap((p) => logs(p.ex.id, Array(p.sets).fill(p.repMax)));
    const rpes = Object.fromEntries(plan.map((p) => [p.ex.id, 'ok']));
    expect(positionOf(plan, session(all, rpes))).toEqual({ phase: 'done' });
  });
  it('마무리: 다 한 종목만 판정, 안 한 종목은 유지', () => {
    const { results, states } = finishWorkout(plan, session(logs('bulgarian_split_squat', [12, 12]), { bulgarian_split_squat: 'ok' }));
    expect(results.bulgarian_split_squat).toBe('next');
    expect(results.plank).toBe('hold');
    expect(states.find((s) => s.exerciseId === 'bulgarian_split_squat')!.currentLevel).toBe(2);
  });
});

describe('9 트레이너 문구', () => {
  const first = () => 0;
  it('어제 완료 / 어제 빠짐 / 회복 주간', () => {
    expect(homeLine({ today: 'push', yesterday: { dayType: 'legs', done: true }, recoveryWeek: false }, first)).toBe('어제 하체 완료. 오늘은 밀기입니다.');
    expect(homeLine({ today: 'push', yesterday: { dayType: 'legs', done: false }, recoveryWeek: false }, first)).toBe('어제는 쉬었습니다. 오늘 루틴을 그대로 합니다.');
    expect(homeLine({ today: 'legs', yesterday: { dayType: 'rest', done: false }, recoveryWeek: true }, first)).toBe('오늘은 하체입니다. 이번 주는 회복 주간입니다.');
    expect(homeLine({ today: 'legs', recoveryWeek: false, declinedWeek: true }, first)).toBe('오늘은 하체입니다. 기록이 줄어 이번 주는 운동량 80%로 합니다.');
  });
  it('완료 한 줄 평', () => {
    expect(doneLine(['next', 'plusOne', 'easier', 'hold'])).toBe('2종목은 다음 같은 요일에 횟수나 단계를 올립니다. 1종목은 쉬운 단계로 바꿉니다.');
  });
});

describe('GPS 거리', () => {
  it('위도 1도는 약 111.2km', () => {
    expect(distanceM({ latitude: 37, longitude: 127 }, { latitude: 38, longitude: 127 })).toBeCloseTo(111_195, -1);
  });
});
