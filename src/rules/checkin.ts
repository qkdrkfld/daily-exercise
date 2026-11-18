// 8.2 컨디션 체크인 → 판단
import type { CheckIn, DayType, SorePart } from '../types';

const PARTS_USED: Record<DayType, SorePart[]> = {
  push: ['chest', 'shoulder', 'arm'],
  pull: ['back', 'arm'],
  legs: ['legs'],
  interval_short: ['legs'],
  interval_long: ['legs'],
  active_rest: [],
  rest: [],
};

export function verdictOf(input: Pick<CheckIn, 'fatigue' | 'soreParts' | 'pain'>, dayType: DayType): CheckIn['verdict'] {
  if (input.pain) return 'active_rest';
  if (input.fatigue >= 4) return 'reduced';
  if (input.soreParts.some((p) => PARTS_USED[dayType].includes(p))) return 'reduced';
  return 'full';
}
