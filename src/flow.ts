// 화면 흐름에서 쓰는 DB 작업: 시작, 마무리, 연속 일수
import { db, getSettings } from './db';
import { daySummary, distLabel, mss, signedSec } from './labels';
import { adjustInterval, type AdjustResult } from './rules/adjust';
import { AREA_LABEL, applyAssessment, collectAssessment } from './rules/assessment';
import { doneLine, intervalDoneLine, pick } from './rules/coach';
import { addDays, cyclePosition, dayTypeOf, type IntervalDay, intervalPlan, isTestDate, volumeFactorFor } from './rules/routine';
import { buildPlan, finishWorkout } from './rules/session';
import { type DayRecord, streakAsOf } from './rules/streak';
import type { CheckIn, Rpe, UserExerciseState } from './types';

export async function loadPlan(date: string, factor: number) {
  const dayType = dayTypeOf(date);
  const exercises = await db.exercises.where('day').equals(dayType).toArray();
  const states = await db.userStates.bulkGet(exercises.map((e) => e.id));
  const test = isTestDate(date, await getSettings());
  return buildPlan(exercises, states as UserExerciseState[], factor, test ? dayType : undefined);
}

export async function currentStreak(today: string): Promise<number> {
  const settings = await getSettings();
  const days: Record<string, DayRecord> = {};
  for (const c of await db.checkins.toArray()) if (c.pain) days[c.date] = { pain: true };
  for (const s of await db.sessions.toArray()) if (s.completed) days[s.date] = { ...days[s.date], done: true };
  return streakAsOf(settings.installDate ?? settings.programStartDate, today, days);
}

/** 체크인 저장 후, 근력 날이면 진행 중 세션을 만든다 (세션 id = 날짜, 하루 하나) */
export async function startWorkout(checkin: CheckIn) {
  await db.checkins.put(checkin);
  if (checkin.verdict === 'active_rest') return;
  const settings = await getSettings();
  const { week, cycleIndex } = cyclePosition(checkin.date, settings.programStartDate);
  const volumeFactor = volumeFactorFor({ week, cycleIndex, verdict: checkin.verdict, declinedCycleIndex: settings.declinedCycleIndex });
  await db.sessions.put({
    id: checkin.date, date: checkin.date, dayType: dayTypeOf(checkin.date), volumeFactor,
    startedAt: Date.now(), sets: [], rpeByExercise: {}, completed: false,
  });
}

export interface DoneData {
  heading: string;
  stats: { label: string; value: string }[];
  rows: { name: string; done: string; result: AdjustResult | 'test' }[];
  line: string;
  tomorrow: string;
  reportCycle?: number; // 측정 리포트가 방금 저장됐으면 그 주기 번호
}

const RPE_SCORE: Record<Rpe, number> = { easy: 0, ok: 1, hard: 2 };
const SCORE_LABEL = ['쉬웠음', '적당함', '힘들었음'];

export async function completeWorkout(date: string): Promise<DoneData> {
  // 한 트랜잭션 안에서 읽고 쓴다. 이미 완료된 세션이면 조정을 다시 적용하지 않는다 (두 번 누름 방지)
  const { session, plan, results } = await db.transaction('rw', [db.sessions, db.userStates, db.exercises, db.settings], async () => {
    const s = (await db.sessions.get(date))!;
    const plan = await loadPlan(date, s.volumeFactor);
    const { states, results } = finishWorkout(plan, s);
    if (s.completed) return { session: s, plan, results };
    const done = { ...s, endedAt: Date.now(), completed: true };
    await db.sessions.put(done);
    await db.userStates.bulkPut(states);
    return { session: done, plan, results };
  });

  const rpes = Object.values(session.rpeByExercise).map((r) => RPE_SCORE[r]);
  const unit = (sec: boolean) => (sec ? '초' : '회');
  const rows = plan
    .map((p) => ({
      p,
      values: session.sets
        .filter((s) => s.exerciseId === p.ex.id && !!s.isTest === !!p.testSet)
        .map((s) => (s.valueRight === undefined ? `${s.value}` : `왼 ${s.value} / 오 ${s.valueRight}`)),
    }))
    .filter(({ values }) => values.length)
    .map(({ p, values }) => ({
      name: p.testSet?.name ?? p.step.name,
      done: `${values.join(' · ')}${unit((p.testSet?.unit ?? p.step.unit) === 'sec')}`,
      result: p.testSet ? 'test' as const : results[p.ex.id],
    }));

  return {
    heading: '오늘 운동을 마쳤습니다.',
    stats: [
      { label: '운동 시간', value: `${Math.max(1, Math.round((session.endedAt! - session.startedAt) / 60_000))}분` },
      { label: '총 세트', value: `${session.sets.length}세트` },
      { label: '평균 난이도', value: rpes.length ? SCORE_LABEL[Math.round(rpes.reduce((a, b) => a + b, 0) / rpes.length)] : '-' },
      { label: '연속 운동', value: `${await currentStreak(date)}일` },
    ],
    rows,
    line: doneLine(Object.values(results)),
    tomorrow: daySummary(addDays(date, 1), await getSettings()),
  };
}

export async function completeInterval(date: string): Promise<DoneData> {
  const { session, plan, adj } = await db.transaction('rw', db.sessions, db.settings, async () => {
    const s = (await db.sessions.get(date))!;
    const settings = await getSettings();
    const plan = intervalPlan(s.dayType as IntervalDay, settings, s.volumeFactor, isTestDate(date, settings));
    const adj = adjustInterval({
      laps: s.intervalLaps ?? [], distanceM: plan.distanceM, targetPace: plan.pace,
      plannedReps: plan.reps, currentReps: plan.currentReps, maxReps: plan.maxReps, location: s.location ?? 'outdoor',
    });
    if (s.completed) return { session: s, plan, adj };
    // 측정 날은 회차를 조정하지 않고 3km 기록만 남긴다 (버피 개수는 진행 화면에서 저장)
    const run3kSec = s.location !== 'indoor' ? s.intervalLaps?.[0]?.seconds : undefined;
    const done = { ...s, endedAt: Date.now(), completed: true, ...(plan.test && run3kSec && { tests: { ...s.tests, run3kSec } }) };
    await db.sessions.put(done);
    if (!plan.test) await db.settings.put({ ...settings, [plan.repsKey]: adj.reps }, 'main');
    return { session: done, plan, adj };
  });

  const indoor = session.location === 'indoor';
  const laps = session.intervalLaps ?? [];
  if (plan.test) {
    const { run3kSec, burpee3minCount } = session.tests ?? {};
    const { cycleIndex } = cyclePosition(date, (await getSettings()).programStartDate);
    const saved = await finalizeAssessment(cycleIndex, date);
    return {
      heading: '측정을 마쳤습니다.',
      stats: [
        { label: '운동 시간', value: `${Math.max(1, Math.round((session.endedAt! - session.startedAt) / 60_000))}분` },
        indoor
          ? { label: '버피 3분', value: burpee3minCount === undefined ? '-' : `${burpee3minCount}개` }
          : { label: '3km 기록', value: run3kSec === undefined ? '-' : mss(run3kSec) },
        { label: '연속 운동', value: `${await currentStreak(date)}일` },
      ],
      rows: [],
      line: saved ? '이번 주 측정 기록을 저장했습니다. 리포트에서 지난번과 비교합니다.' : '측정 기록이 없어 리포트를 만들지 않았습니다.',
      tomorrow: daySummary(addDays(date, 1), await getSettings()),
      reportCycle: saved ? cycleIndex : undefined,
    };
  }
  return {
    heading: '오늘 운동을 마쳤습니다.',
    stats: [
      { label: '운동 시간', value: `${Math.max(1, Math.round((session.endedAt! - session.startedAt) / 60_000))}분` },
      // 실내는 페이스 기록이 없어 평균 칸을 뺀다
      ...(indoor
        ? [{ label: '실내 HIIT', value: `${plan.rounds}라운드` }]
        : [{ label: '회차', value: `${laps.length} / ${plan.reps}` },
          { label: '평균 (목표 대비)', value: adj.avgDiff === undefined ? '-' : signedSec(adj.avgDiff) }]),
      { label: '연속 운동', value: `${await currentStreak(date)}일` },
    ],
    rows: [indoor
      ? { name: `실내 HIIT ${plan.rounds}라운드`, done: `운동 ${plan.hiit.workSec}초 / 휴식 ${plan.hiit.restSec}초`, result: adj.result }
      : {
        name: `${distLabel(plan.distanceM)} × ${plan.reps} · 목표 ${mss(plan.pace)}/km`,
        done: laps.length ? adj.diffs.map(signedSec).join(' · ') : '기록 없음',
        result: adj.result,
      }],
    line: intervalDoneLine(adj.result, indoor),
    tomorrow: daySummary(addDays(date, 1), await getSettings()),
  };
}

/** 토요일 스트레칭, 통증 날 스트레칭 */
export async function completeStretch(date: string, startedAt: number): Promise<DoneData> {
  const endedAt = Date.now();
  const existing = await db.sessions.get(date);
  if (!existing?.completed) {
    await db.sessions.put({ id: date, date, dayType: 'active_rest', volumeFactor: 1, startedAt, endedAt, sets: [], rpeByExercise: {}, completed: true });
  }
  return {
    heading: '스트레칭을 마쳤습니다.',
    stats: [
      { label: '스트레칭 시간', value: `${Math.max(1, Math.round((endedAt - startedAt) / 60_000))}분` },
      { label: '연속 운동', value: `${await currentStreak(date)}일` },
    ],
    rows: [],
    line: pick(['연속 일수가 이어집니다.', '오늘 할 일을 마쳤습니다. 연속 일수가 이어집니다.']),
    tomorrow: daySummary(addDays(date, 1), await getSettings()),
  };
}

/**
 * cycleIndex 주기의 4주차 기록을 모아 Assessment를 저장하고 측정 결과 처리(8.5)를 적용한다.
 * 이미 저장된 주기면 아무것도 하지 않는다 (두 번 눌러도 한 번만 적용). 그 주기 측정이 저장돼 있으면 true
 */
export async function finalizeAssessment(cycleIndex: number, date: string): Promise<boolean> {
  return db.transaction('rw', [db.assessments, db.sessions, db.userStates, db.exercises, db.settings], async () => {
    if (await db.assessments.where('cycleIndex').equals(cycleIndex).count()) return true;
    const settings = await getSettings();
    const week4 = addDays(settings.programStartDate, (cycleIndex - 1) * 28 + 21);
    const sessions = await db.sessions.where('date').between(week4, addDays(week4, 6), true, true).toArray();
    const curr = collectAssessment(sessions, cycleIndex, date);
    // shortcut: 한 항목도 못 잰 주기는 저장하지 않는다 (빈 측정이 다음 비교 기준이 되지 않게). 앱을 한 주기 통째로 안 쓴 경우에만 해당
    const { id, date: _, cycleIndex: __, ...values } = curr;
    if (Object.values(values).every((v) => v === undefined)) return false;
    const history = await db.assessments.where('cycleIndex').below(cycleIndex).sortBy('cycleIndex');
    const exercises = await db.exercises.toArray();
    const r = applyAssessment(curr, history, exercises, await db.userStates.toArray(), settings);

    const notes = r.states.map((st) => `${exercises.find((e) => e.id === st.exerciseId)!.name} 세트당 ${st.targetRepsPerSet}회로 올립니다 (새 최대치의 60%).`);
    if (curr.run3kSec) notes.push(`긴 인터벌 ${mss(r.settings.longPaceSecPerKm)}/km, 짧은 인터벌 ${mss(r.settings.shortPaceSecPerKm)}/km로 바꿉니다.`);
    if (r.declined) notes.push('기록이 줄어든 영역이 있어 다음 주기 첫 주는 운동량 80%로 합니다. 컨디션 기록을 확인해 보세요.');
    if (r.stalledTwice.length) notes.push(`${r.stalledTwice.map((k) => AREA_LABEL[k]).join(', ')} 기록이 2회 연속 그대로입니다. 동작을 바꿔 볼 때입니다.`);
    if (!notes.length) notes.push('다음 4주도 지금 세트·횟수로 시작합니다. 주간 조정은 그대로 합니다.');

    await db.assessments.put({ ...curr, notes });
    await db.userStates.bulkPut(r.states);
    await db.settings.put(r.settings, 'main');
    return true;
  });
}
