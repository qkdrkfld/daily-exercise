import { useEffect, useState } from 'react';
import { db, getSettings } from '../db';
import { currentStreak, finalizeAssessment, loadPlan } from '../flow';
import { BODY_TAG, DAY_SHORT, dayTitle, distLabel, isStrength, mss, WEEKDAY_KO } from '../labels';
import { homeLine } from '../rules/coach';
import { addDays, cyclePosition, dayTypeOf, intervalPlan, isTestDate, mondayOf, parseDate, volumeFactorFor } from '../rules/routine';
import type { PlanItem } from '../rules/session';
import type { WorkoutSession } from '../types';
import { Icon, ICON } from './Icon';

export type HomeAction = 'checkin' | 'resume' | 'stretch';

interface HomeData {
  week: number;
  streak: number;
  line: string;
  plan: PlanItem[];
  interval?: ReturnType<typeof intervalPlan>;
  todaySession?: WorkoutSession;
  doneRows?: { name: string; value: string }[]; // 완료한 날은 바뀐 다음 처방 대신 오늘 한 기록을 보여 준다
  installDate: string;
  weekDays: { date: string; done: boolean }[];
}

async function doneRowsOf(s: WorkoutSession) {
  if (s.location === 'indoor') return [{ name: '실내 HIIT', value: '완료' }];
  const laps = s.intervalLaps ?? [];
  if (laps.length) return [{ name: `실외 ${distLabel(laps[0].distanceM ?? 0)}`, value: `${laps.length}회차 · ${laps.map((l) => mss(l.seconds)).join(' · ')}` }];
  const groups = new Map<string, WorkoutSession['sets']>();
  for (const set of s.sets) {
    const key = `${set.exerciseId}${set.isTest ? '-test' : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), set]);
  }
  const exercises = await db.exercises.bulkGet([...groups.values()].map((g) => g[0].exerciseId));
  return [...groups.values()].map((sets, i) => {
    const step = exercises[i]?.steps[sets[0].level];
    const values = sets.map((x) => (x.valueRight === undefined ? `${x.value}` : `${x.value}/${x.valueRight}`));
    return { name: `${step?.name ?? sets[0].exerciseId}${sets[0].isTest ? ' · 측정' : ''}`, value: `${values.join(' · ')}${step?.unit === 'sec' ? '초' : '회'}` };
  });
}

export function Home({ today, onStart, onSettings }: { today: string; onStart: (a: HomeAction) => void; onSettings: () => void }) {
  const dayType = dayTypeOf(today);
  const [data, setData] = useState<HomeData>();

  useEffect(() => {
    (async () => {
      // 금요일 측정을 못 했으면 4주차가 끝난 뒤 처음 열 때 지난 주기 측정을 저장한다 (8.5). 페이스가 바뀔 수 있어 설정보다 먼저
      const start = (await getSettings()).programStartDate;
      const prevCycle = cyclePosition(today, start).cycleIndex - 1;
      if (prevCycle >= 1) await finalizeAssessment(prevCycle, today);
      const settings = await getSettings();
      const { week, cycleIndex } = cyclePosition(today, settings.programStartDate);
      const factor = volumeFactorFor({ week, cycleIndex, declinedCycleIndex: settings.declinedCycleIndex });
      const monday = mondayOf(today);
      const weekDates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
      const yesterday = addDays(today, -1);
      const sessions = await db.sessions.where('date').between(addDays(monday, -1), addDays(monday, 6), true, true).toArray();
      const doneOn = (d: string) => sessions.some((s) => s.date === d && s.completed);
      const todaySession = sessions.find((s) => s.date === today);
      const installDate = settings.installDate ?? settings.programStartDate;
      setData({
        week,
        streak: await currentStreak(today),
        plan: isStrength(dayType) ? await loadPlan(today, factor) : [],
        interval: dayType === 'interval_short' || dayType === 'interval_long' ? intervalPlan(dayType, settings, factor, isTestDate(today, settings)) : undefined,
        todaySession,
        doneRows: todaySession?.completed ? await doneRowsOf(todaySession) : undefined,
        installDate,
        weekDays: weekDates.map((date) => ({ date, done: doneOn(date) })),
        line: homeLine({
          today: dayType,
          // 설치 첫날에는 "어제"가 없다
          yesterday: yesterday >= installDate ? { dayType: dayTypeOf(yesterday), done: doneOn(yesterday) } : undefined,
          recoveryWeek: week === 4,
          declinedWeek: week === 1 && cycleIndex === settings.declinedCycleIndex,
        }),
      });
    })();
  }, [today, dayType]);

  if (!data) return null;
  const date = parseDate(today);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="eyebrow">{date.getMonth() + 1}월 {date.getDate()}일 {WEEKDAY_KO[date.getDay()]}요일 · 4주 주기 {data.week}주차</div>
          <h1 className="title">오늘의 운동</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="pill"><Icon d={ICON.flame} size={16} color="var(--accent)" />{data.streak}일 연속</div>
          <button className="icon-btn" aria-label="설정" onClick={onSettings}><Icon d={ICON.sliders} /></button>
        </div>
      </div>

      <div className="trainer">
        <div className="badge"><Icon d={ICON.dumbbell} color="var(--on-accent)" width={2.2} /></div>
        <div>
          <span className="label">트레이너</span>
          <p>{data.line}</p>
        </div>
      </div>

      <div className="card" style={{ gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <div>
            <div className="ex-name">{dayTitle(today)}</div>
            {data.plan.length > 0 && <div className="eyebrow">{new Set(data.plan.map((p) => p.ex.id)).size}종목 · 스트레칭 포함</div>}
          </div>
          {BODY_TAG[dayType] && <span className="tag accent">{BODY_TAG[dayType]}</span>}
        </div>
        {data.doneRows ? (
          <div>
            {data.doneRows.map((r) => (
              <div className="row" key={r.name}>
                <span>{r.name}</span>
                <span className="muted">{r.value}</span>
              </div>
            ))}
          </div>
        ) : <>
        {data.plan.length > 0 && (
          <div>
            {data.plan.map((p) => (
              p.testSet ? (
                <div className="row" key={`${p.ex.id}-test`}>
                  <span>{p.testSet.name}</span>
                  <span className="tag accent">측정</span>
                </div>
              ) : (
                <div className="row" key={p.ex.id}>
                  <span>{p.step.name}</span>
                  <span className="muted">{p.sets} × {p.repMin === p.repMax ? p.repMin : `${p.repMin}~${p.repMax}`}{p.step.unit === 'sec' ? '초' : ''}{p.step.perSide ? ' (각)' : ''}</span>
                </div>
              )
            ))}
          </div>
        )}
        {data.interval && (
          <div>
            {data.interval.test ? (
              <>
                <div className="row"><span>실외 3km 측정</span><span className="tag accent">측정</span></div>
                <div className="row"><span>실내 버피 3분 (날씨 대체)</span><span className="tag accent">측정</span></div>
              </>
            ) : (
              <>
                <div className="row">
                  <span>실외 {distLabel(data.interval.distanceM)} × {data.interval.reps}</span>
                  <span className="muted">목표 {mss(data.interval.pace)}/km · 사이 조깅 {data.interval.joggingSec}초</span>
                </div>
                <div className="row">
                  <span>실내 HIIT (날씨 대체)</span>
                  <span className="muted">{data.interval.hiit.workSec}초 / {data.interval.hiit.restSec}초 × {data.interval.rounds}</span>
                </div>
              </>
            )}
          </div>
        )}
        </>}
      </div>

      <StartButton dayType={dayType} session={data.todaySession} onStart={onStart} />

      <div className="stack">
        <span className="section-title muted" style={{ fontSize: 13 }}>이번 주</span>
        <div className="week">
          {data.weekDays.map(({ date: d, done }) => {
            const t = dayTypeOf(d);
            const state = done ? 'done' : d === today ? 'today' : d < today && d >= data.installDate && t !== 'rest' ? 'missed' : '';
            return (
              <div key={d}>
                <span>{WEEKDAY_KO[parseDate(d).getDay()]}</span>
                <div className={`dot ${state}`}>{done && <Icon d={ICON.check} size={16} width={2.5} />}</div>
                <small>{DAY_SHORT[t]}</small>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function StartButton({ dayType, session, onStart }: { dayType: ReturnType<typeof dayTypeOf>; session?: WorkoutSession; onStart: (a: HomeAction) => void }) {
  if (session?.completed) return <button className="btn" disabled>오늘 운동 완료</button>;
  if (session) return <button className="btn" onClick={() => onStart('resume')}>이어서 하기<Icon d={ICON.arrow} size={18} width={2.5} /></button>;
  if (dayType === 'active_rest') return <button className="btn" onClick={() => onStart('stretch')}>스트레칭 10분 시작</button>;
  if (dayType !== 'rest') return <button className="btn" onClick={() => onStart('checkin')}>컨디션 체크하고 시작<Icon d={ICON.arrow} size={18} width={2.5} /></button>;
  return null;
}
