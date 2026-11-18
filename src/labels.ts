// 화면에 쓰는 표시 문구
import { INTERVAL } from './data/program';
import { dayTypeOf, parseDate } from './rules/routine';
import type { DayType, Rpe, Settings } from './types';

export const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

export const DAY_LABEL: Record<DayType, string> = {
  legs: '하체', push: '밀기', pull: '당기기', interval_short: '짧은 인터벌', interval_long: '긴 인터벌',
  active_rest: '가벼운 휴식', rest: '완전 휴식',
};

export const DAY_SHORT: Record<DayType, string> = {
  legs: '하체', push: '밀기', pull: '당기기', interval_short: '인터벌', interval_long: '인터벌',
  active_rest: '스트레칭', rest: '휴식',
};

export const BODY_TAG: Partial<Record<DayType, string>> = {
  legs: '하체 · 코어', push: '가슴 · 어깨 · 삼두', pull: '등 · 이두 · 복근',
};

export const RPE_LABEL: Record<Rpe, string> = { easy: '쉬웠음', ok: '적당함', hard: '힘들었음' };

export const isStrength = (t: DayType) => t === 'legs' || t === 'push' || t === 'pull';

export const mmss = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** '화 · 밀기' */
export const dayTitle = (date: string) => `${WEEKDAY_KO[parseDate(date).getDay()]} · ${DAY_LABEL[dayTypeOf(date)]}`;

/** '수 · 짧은 인터벌 400m × 6' 처럼 그날 할 일을 한 줄로 */
export function daySummary(date: string, settings: Settings): string {
  const t = dayTypeOf(date);
  const head = `${WEEKDAY_KO[parseDate(date).getDay()]} · ${DAY_LABEL[t]}`;
  if (t === 'interval_short') return `${head} ${INTERVAL.interval_short.distanceM}m × ${settings.intervalShortReps}`;
  if (t === 'interval_long') return `${head} 1km × ${settings.intervalLongReps}`;
  if (t === 'active_rest') return `${head} · 스트레칭 10분`;
  return head;
}

/** 페이스, 구간 시간: '4:50' */
export const mss = (sec: number) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 목표 대비 차이: '−3초' 빠름, '+5초' 느림 */
export const signedSec = (n: number) => `${Math.round(n) < 0 ? '−' : '+'}${Math.abs(Math.round(n))}초`;

export const distLabel = (m: number) => (m >= 1000 ? `${m / 1000}km` : `${m}m`);
