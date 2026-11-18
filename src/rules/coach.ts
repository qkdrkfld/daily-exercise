// 9장 트레이너 말투: 담백하게, 사실과 할 일만. 상황별 템플릿에서 무작위로 골라 반복을 줄인다
import { DAY_LABEL } from '../labels';
import type { CheckIn, DayType } from '../types';
import type { AdjustResult } from './adjust';

export const pick = <T>(xs: T[], rnd = Math.random): T => xs[Math.floor(rnd() * xs.length)];

export function homeLine(
  opts: { today: DayType; yesterday?: { dayType: DayType; done: boolean }; recoveryWeek: boolean; declinedWeek?: boolean },
  rnd = Math.random,
): string {
  const t = DAY_LABEL[opts.today];
  if (opts.today === 'rest') return pick(['오늘은 완전 휴식입니다. 연속 일수는 이어집니다.', '오늘은 쉽니다. 내일 루틴을 확인해 둡니다.'], rnd);

  const y = opts.yesterday;
  let line: string;
  if (opts.today === 'active_rest') line = pick(['오늘은 스트레칭 10분입니다. 하면 연속 일수가 이어집니다.', '오늘은 가벼운 휴식입니다. 스트레칭 10분만 합니다.'], rnd);
  else if (y && y.dayType !== 'rest' && !y.done) line = pick(['어제는 쉬었습니다. 오늘 루틴을 그대로 합니다.', '어제는 기록이 없습니다. 오늘 루틴대로 갑니다.'], rnd);
  else if (y?.done) line = pick([`어제 ${DAY_LABEL[y.dayType]} 완료. 오늘은 ${t}입니다.`, `어제 ${DAY_LABEL[y.dayType]}까지 마쳤습니다. 오늘은 ${t}입니다.`], rnd);
  else line = `오늘은 ${t}입니다.`;

  if (opts.declinedWeek && opts.today !== 'active_rest') line += ' 기록이 줄어 이번 주는 운동량 80%로 합니다.';
  return opts.recoveryWeek ? `${line} 이번 주는 회복 주간입니다.` : line;
}

export const VERDICT_TEXT: Record<CheckIn['verdict'], { title: string; details: string[] }> = {
  full: { title: '계획대로 100%', details: ['오늘 루틴을 그대로 합니다.', '정해 둔 세트·횟수대로 합니다.'] },
  reduced: { title: '운동량 70%', details: ['오늘은 세트 수를 줄입니다. 자세는 그대로 지킵니다.', '세트 수만 줄이고 횟수 목표는 그대로 둡니다.'] },
  active_rest: { title: '스트레칭 10분으로 변경', details: ['통증이 있어 스트레칭 10분으로 바꿉니다. 연속 일수는 이어집니다.'] },
};

export function doneLine(results: AdjustResult[], rnd = Math.random): string {
  const ups = results.filter((r) => r === 'next' || r === 'plusOne' || r === 'plusTwo').length;
  const easier = results.filter((r) => r === 'easier').length;
  const parts: string[] = [];
  if (ups) parts.push(`${ups}종목은 다음 같은 요일에 횟수나 단계를 올립니다.`);
  if (easier) parts.push(`${easier}종목은 쉬운 단계로 바꿉니다.`);
  if (!parts.length) parts.push(pick(['다음 같은 요일에도 오늘과 같은 세트·횟수로 합니다.', '다음 주도 같은 세트·횟수로 합니다.'], rnd));
  return parts.join(' ');
}

export function intervalDoneLine(result: AdjustResult, indoor: boolean, rnd = Math.random): string {
  if (indoor) return '실내로 한 날은 다음 주 회차를 그대로 둡니다.';
  if (result === 'plusTwo') return '다음 주는 회차를 2회 늘립니다.';
  if (result === 'plusOne') return '다음 주는 회차를 1회 늘립니다.';
  return pick(['다음 주도 같은 회차로 합니다.', '다음 주도 오늘과 같은 회차로 합니다.'], rnd);
}
