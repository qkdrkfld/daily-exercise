// 8.1 오늘의 루틴 결정 + 볼륨 배율
import { INTERVAL, WEEKDAY_DAYTYPE } from '../data/program';
import type { CheckIn, DayType, Exercise, Settings, UserExerciseState } from '../types';

// 날짜는 모두 로컬 기준 'YYYY-MM-DD' 문자열로 다룬다
export function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDateStr(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function addDays(date: string, days: number): string {
  const dt = parseDate(date);
  dt.setDate(dt.getDate() + days);
  return toDateStr(dt);
}

// UTC로 계산해서 서머타임이 있는 지역에서도 하루 = 1
export function daysBetween(from: string, to: string): number {
  const utc = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

export const dayTypeOf = (date: string): DayType => WEEKDAY_DAYTYPE[parseDate(date).getDay()];

export const mondayOf = (date: string): string => addDays(date, -((parseDate(date).getDay() + 6) % 7));

/** cycleIndex: 1부터 시작하는 4주 주기 번호 (0은 온보딩 측정용), week: 1~4 */
export function cyclePosition(date: string, programStartDate: string) {
  const days = Math.max(0, daysBetween(programStartDate, date));
  return { cycleIndex: Math.floor(days / 28) + 1, week: (Math.floor(days / 7) % 4) + 1 };
}

/** 겹치는 배율은 곱하지 않고 가장 낮은 값 하나만 쓴다 (8.2) */
export function volumeFactorFor(opts: {
  week: number;
  cycleIndex: number;
  verdict?: CheckIn['verdict'];
  declinedCycleIndex?: Settings['declinedCycleIndex'];
}): number {
  const factors = [1];
  if (opts.week === 4) factors.push(0.6);
  if (opts.week === 1 && opts.cycleIndex === opts.declinedCycleIndex) factors.push(0.8);
  if (opts.verdict === 'reduced') factors.push(0.7);
  return Math.min(...factors);
}

/** 세트·회차·라운드 수 = max(1, round(n × 배율)). 5 × 0.7 = 3.4999… 같은 부동소수 오차를 보정 */
export const scaledCount = (n: number, factor: number) => Math.max(1, Math.round(n * factor + 1e-9));

/** 4주차의 월·화·목은 근력 측정, 금은 긴 인터벌 대신 3km 측정. 수요일은 평소대로 */
export const isTestDay = (dayType: DayType, week: number) =>
  week === 4 && (dayType === 'legs' || dayType === 'push' || dayType === 'pull' || dayType === 'interval_long');

export const isTestDate = (date: string, settings: Settings) =>
  isTestDay(dayTypeOf(date), cyclePosition(date, settings.programStartDate).week);

/** 종목의 오늘 처방 */
export function prescriptionFor(ex: Exercise, state: UserExerciseState, factor: number) {
  const step = ex.steps[state.currentLevel];
  const target = step.fixedReps ? (state.targetRepsPerSet ?? step.repMin) : undefined;
  return {
    step,
    sets: scaledCount(step.sets, factor),
    repMin: target ?? step.repMin,
    repMax: target ?? step.repMax,
  };
}

export type IntervalDay = 'interval_short' | 'interval_long';

/**
 * 인터벌 날의 오늘 처방. 회차(실외)와 라운드(실내)는 세트처럼 배율을 적용한다 (8.2).
 * test: 4주차 금요일 측정. 3000m × 1회차, 실내는 버피 3분 1라운드 (8.5)
 */
export function intervalPlan(dayType: IntervalDay, settings: Settings, factor: number, test = false) {
  const cfg = INTERVAL[dayType];
  const short = dayType === 'interval_short';
  const repsKey = short ? 'intervalShortReps' : 'intervalLongReps';
  return {
    ...cfg,
    ...(test && { distanceM: 3000, hiit: { workSec: 180, restSec: 0, rounds: 1 } }),
    repsKey,
    currentReps: settings[repsKey],
    reps: test ? 1 : scaledCount(settings[repsKey], factor),
    rounds: test ? 1 : scaledCount(cfg.hiit.rounds, factor),
    pace: short ? settings.shortPaceSecPerKm : settings.longPaceSecPerKm,
    test,
  } as const;
}
