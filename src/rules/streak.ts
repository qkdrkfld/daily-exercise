// 8.4 연속 일수
import { addDays, dayTypeOf } from './routine';

export interface DayRecord {
  done?: boolean; // 그날 운동(또는 스트레칭)을 완료했는가
  pain?: boolean; // 체크인에서 통증
}

/** installDate(앱 설치일)부터 today까지 하루씩 진행하며 계산한다. 설치 전 날짜는 세지 않는다 */
export function streakAsOf(installDate: string, today: string, days: Record<string, DayRecord>): number {
  let streak = 0;
  for (let d = installDate; d <= today; d = addDays(d, 1)) {
    const rec = days[d] ?? {};
    if (dayTypeOf(d) === 'rest') continue; // 일요일: 끊기지 않음
    if (rec.done) streak++;
    // 통증 날, 그리고 아직 자정이 지나지 않은 오늘은 안 해도 끊지 않는다
    else if (!rec.pain && d !== today) streak = 0;
  }
  return streak;
}
