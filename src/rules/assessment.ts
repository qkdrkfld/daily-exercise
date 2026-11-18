// 8.5 평가
import type { Assessment, DayType, Exercise, Settings, UserExerciseState, WorkoutSession } from '../types';

// 레이더 목표치. 바꾸고 싶으면 여기만 고친다
export const TARGETS = {
  pullup: 10,
  dip: 8,
  pushup: 30,
  splitSquat: 20,
  hollowSec: 90,
  deadHangSec: 90,
  run3kSec: 13 * 60 + 30,
  burpee3min: 50, // 추정치
};

export type Area = 'pull' | 'push' | 'legs' | 'core' | 'grip' | 'cardio';
export const AREAS: Area[] = ['pull', 'push', 'legs', 'core', 'grip', 'cardio'];
export const AREA_LABEL: Record<Area, string> = {
  pull: '당기기', push: '밀기', legs: '하체', core: '코어', grip: '그립', cardio: '유산소',
};

type TestField = 'pullupMax' | 'dipMax' | 'pushupMax' | 'splitSquatMaxLeft' | 'splitSquatMaxRight' | 'hollowHoldSec';
export interface TestSet {
  exerciseId: string;
  name: string;
  cue: string;
  unit: 'reps' | 'sec';
  field: TestField;
  fieldRight?: TestField; // 좌·우를 따로 재는 종목
}

/** 4주차 각 요일의 측정 세트 (해당 종목의 첫 세트, 이 순서로 맨 앞에 몰아서). 데드행은 쿨다운, 3km는 인터벌 화면에서 잰다 */
export const TEST_SETS: Partial<Record<DayType, TestSet[]>> = {
  legs: [{ exerciseId: 'bulgarian_split_squat', name: '스플릿 스쿼트 최대 횟수', cue: '다리마다 최대 횟수를 잽니다.', unit: 'reps', field: 'splitSquatMaxLeft', fieldRight: 'splitSquatMaxRight' }],
  push: [
    { exerciseId: 'ring_pushup', name: '바닥 푸시업 최대 횟수', cue: '링 대신 바닥에서 합니다. 링 높이와 상관없이 비교하려고 바닥에서 잽니다.', unit: 'reps', field: 'pushupMax' },
    { exerciseId: 'ring_dip_negative', name: '딥스 최대 횟수', cue: '링에서 내려갔다 올라오는 딥스를 최대 횟수로 합니다.', unit: 'reps', field: 'dipMax' },
    { exerciseId: 'hollow_hold', name: '할로우 홀드 최대 시간', cue: '허리가 바닥에서 뜨면 멈춥니다.', unit: 'sec', field: 'hollowHoldSec' },
  ],
  pull: [{ exerciseId: 'pullup', name: '턱걸이 최대 횟수', cue: '반동 없이, 팔을 끝까지 펴고 합니다.', unit: 'reps', field: 'pullupMax' }],
};
export const TEST_REST_SEC = 180;

/** 4주차 세션들의 측정 기록을 Assessment 하나로 모은다. 못 잰 항목은 비워 둔다 */
export function collectAssessment(sessions: WorkoutSession[], cycleIndex: number, date: string): Assessment {
  const a: Assessment = { id: `cycle-${cycleIndex}`, date, cycleIndex };
  const tests = Object.values(TEST_SETS).flat();
  for (const s of sessions) {
    for (const set of s.sets) {
      const t = set.isTest && tests.find((x) => x?.exerciseId === set.exerciseId);
      if (!t) continue;
      a[t.field] = set.value;
      if (t.fieldRight) a[t.fieldRight] = set.valueRight;
    }
    Object.assign(a, s.tests);
  }
  return a;
}

const avg = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};
const ratio = (value: number | undefined, target: number) => (value === undefined ? undefined : value / target);

/** 영역별 목표 대비 비율 (상한 없음). 측정 없는 영역은 undefined */
export function areaScores(a: Assessment): Record<Area, number | undefined> {
  return {
    pull: ratio(a.pullupMax, TARGETS.pullup),
    push: avg([ratio(a.dipMax, TARGETS.dip), ratio(a.pushupMax, TARGETS.pushup)]),
    legs: ratio(avg([a.splitSquatMaxLeft, a.splitSquatMaxRight]), TARGETS.splitSquat),
    core: ratio(a.hollowHoldSec, TARGETS.hollowSec),
    grip: ratio(a.deadHangSec, TARGETS.deadHangSec),
    // 3km는 짧을수록 좋다
    cardio: a.run3kSec ? TARGETS.run3kSec / a.run3kSec : ratio(a.burpee3minCount, TARGETS.burpee3min),
  };
}

/** 레이더 차트 값 0~1. undefined는 "측정 없음"으로 표시할 것 (0으로 그리지 않는다) */
export function radarValues(a: Assessment): Record<Area, number | undefined> {
  const s = areaScores(a);
  return Object.fromEntries(AREAS.map((k) => [k, s[k] === undefined ? undefined : Math.min(1, s[k]!)])) as Record<Area, number | undefined>;
}

export type Trend = 'up' | 'same' | 'down';

export function compareAreas(prev: Assessment, curr: Assessment): Record<Area, Trend | undefined> {
  const p = areaScores(prev);
  const c = areaScores(curr);
  // 3km와 버피 3분은 다른 측정이라 서로 비교하지 않는다
  const sameCardio = (prev.run3kSec === undefined) === (curr.run3kSec === undefined);
  return Object.fromEntries(AREAS.map((k) => {
    if (p[k] === undefined || c[k] === undefined || (k === 'cardio' && !sameCardio)) return [k, undefined];
    const d = c[k]! - p[k]!;
    return [k, Math.abs(d) < 1e-9 ? 'same' : d > 0 ? 'up' : 'down'];
  })) as Record<Area, Trend | undefined>;
}

/**
 * 측정 결과 처리. history는 이전 측정들 (cycleIndex 오름차순, 온보딩 0 포함).
 * 바뀐 종목 상태와 새 설정, 리포트 안내용 정보를 돌려준다.
 */
export function applyAssessment(
  curr: Assessment,
  history: Assessment[],
  exercises: Exercise[],
  states: UserExerciseState[],
  settings: Settings,
) {
  const prev = history.at(-1);
  const prevPrev = history.at(-2);
  const trends = prev ? compareAreas(prev, curr) : undefined;
  const older = prev && prevPrev ? compareAreas(prevPrev, prev) : undefined;

  // 턱걸이·딥스만, 세트당 고정 횟수형 단계에 있을 때 처방을 새 최대치의 60%로 재설정
  const updatedStates: UserExerciseState[] = [];
  const resets: [string, number | undefined, number | undefined][] = [
    ['pullup', curr.pullupMax, prev?.pullupMax],
    ['ring_dip_negative', curr.dipMax, prev?.dipMax],
  ];
  for (const [id, now, before] of resets) {
    const ex = exercises.find((e) => e.id === id);
    const st = states.find((s) => s.exerciseId === id);
    if (!ex || !st || now === undefined || before === undefined || now <= before) continue;
    const step = ex.steps[st.currentLevel];
    if (!step.fixedReps) continue;
    const current = st.targetRepsPerSet ?? step.repMin;
    // 목표 횟수(repMax)를 넘기면 8.3 규칙이 다음 단계로 넘기지 못하므로 상한을 둔다
    const target = Math.min(step.repMax, Math.max(current, Math.round(now * 0.6)));
    if (target !== current) updatedStates.push({ ...st, targetRepsPerSet: target });
  }

  const declined = trends ? AREAS.some((k) => trends[k] === 'down') : false;
  const stalledTwice = trends && older ? AREAS.filter((k) => trends[k] === 'same' && older[k] === 'same') : [];

  const newSettings: Settings = { ...settings };
  if (declined) newSettings.declinedCycleIndex = curr.cycleIndex + 1;
  if (curr.run3kSec) {
    newSettings.longPaceSecPerKm = Math.round(curr.run3kSec / 3);
    newSettings.shortPaceSecPerKm = newSettings.longPaceSecPerKm - 10;
  }

  return { states: updatedStates, settings: newSettings, trends, declined, stalledTwice };
}

/** 2주차 미니 체크: 기간 안 첫 기록과 마지막 기록의 종목별 단계·최고 횟수 변화 */
export function miniCheck(sessions: WorkoutSession[]) {
  const byExercise = new Map<string, { level: number; best: number }[]>();
  for (const s of [...sessions].filter((s) => s.completed).sort((a, b) => a.date.localeCompare(b.date))) {
    const perEx = new Map<string, { level: number; best: number }>();
    for (const set of s.sets) {
      if (set.isTest) continue;
      const cur = perEx.get(set.exerciseId);
      perEx.set(set.exerciseId, { level: set.level, best: Math.max(cur?.best ?? 0, set.value) });
    }
    for (const [id, v] of perEx) byExercise.set(id, [...(byExercise.get(id) ?? []), v]);
  }
  return [...byExercise]
    .filter(([, recs]) => recs.length >= 2)
    .map(([exerciseId, recs]) => ({
      exerciseId,
      levelDelta: recs.at(-1)!.level - recs[0].level,
      bestDelta: recs.at(-1)!.best - recs[0].best,
    }));
}
