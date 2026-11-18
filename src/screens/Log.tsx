import { useEffect, useState } from 'react';
import { db } from '../db';
import { DAY_LABEL, mss, RPE_LABEL } from '../labels';
import { VERDICT_TEXT } from '../rules/coach';
import { addDays, dayTypeOf, mondayOf, parseDate, toDateStr } from '../rules/routine';
import type { CheckIn, Exercise, WorkoutSession } from '../types';
import { FATIGUE, PARTS } from './Checkin';
import { Icon, ICON } from './Icon';

interface LogData {
  sessions: Record<string, WorkoutSession>;
  checkins: Record<string, CheckIn>;
  exercises: Record<string, Exercise>;
}

const byKey = <T,>(rows: T[], key: (r: T) => string) => Object.fromEntries(rows.map((r) => [key(r), r]));

export function Log({ today }: { today: string }) {
  const [data, setData] = useState<LogData>();
  const [month, setMonth] = useState(() => parseDate(today.slice(0, 8) + '01'));
  const [selected, setSelected] = useState(today);

  // shortcut: 기록을 전부 읽는다. 한 사람이 몇 년 써도 수천 건이라 충분. 느려지면 달 단위로 where('date').between 조회
  useEffect(() => {
    (async () => {
      setData({
        sessions: byKey(await db.sessions.toArray(), (s) => s.date),
        checkins: byKey(await db.checkins.toArray(), (c) => c.date),
        exercises: byKey(await db.exercises.toArray(), (e) => e.id),
      });
    })();
  }, []);

  if (!data) return null;

  const first = toDateStr(month);
  const nextFirst = toDateStr(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const cells: string[] = [];
  for (let d = mondayOf(first); d < nextFirst || cells.length % 7; d = addDays(d, 1)) cells.push(d);
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <>
      <h1 className="title">기록</h1>

      <div className="card" style={{ gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="icon-btn" aria-label="이전 달" onClick={() => shift(-1)}><Icon d={ICON.back} /></button>
          <span className="section-title">{month.getFullYear()}년 {month.getMonth() + 1}월</span>
          <button className="icon-btn" aria-label="다음 달" onClick={() => shift(1)} style={{ transform: 'scaleX(-1)' }}><Icon d={ICON.back} /></button>
        </div>
        <div className="week">
          {['월', '화', '수', '목', '금', '토', '일'].map((w) => <div key={w}>{w}</div>)}
          {cells.map((d) => {
            if (d < first || d >= nextFirst) return <div key={d} />;
            const done = data.sessions[d]?.completed;
            const state = done ? 'done' : d === today ? 'today' : '';
            return (
              <div key={d}>
                <button className={`dot cal ${state}`} aria-pressed={d === selected} onClick={() => setSelected(d)}
                  aria-label={`${parseDate(d).getDate()}일${done ? ', 운동 완료' : ''}`}>
                  {parseDate(d).getDate()}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <DayDetail date={selected} data={data} />
    </>
  );
}

function DayDetail({ date, data }: { date: string; data: LogData }) {
  const s = data.sessions[date];
  const c = data.checkins[date];
  const dt = parseDate(date);
  const head = `${dt.getMonth() + 1}월 ${dt.getDate()}일 · ${DAY_LABEL[s?.dayType ?? dayTypeOf(date)]}`;

  if (!s && !c) {
    return (
      <div className="stack">
        <span className="section-title">{head}</span>
        <span className="muted" style={{ fontSize: 14 }}>기록이 없습니다.</span>
      </div>
    );
  }

  // 종목 순서대로 세트를 묶는다
  const groups = new Map<string, NonNullable<typeof s>['sets']>();
  for (const set of s?.sets ?? []) groups.set(set.exerciseId, [...(groups.get(set.exerciseId) ?? []), set]);

  return (
    <div className="stack">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className="section-title">{head}</span>
        {s && <span className={s.completed ? 'tag accent' : 'tag'}>{s.completed ? '완료' : '마치지 않음'}</span>}
      </div>

      {c && (
        <div className="card" style={{ padding: '6px 16px' }}>
          <div className="row"><span>컨디션</span><span className="muted">피로도 {c.fatigue} · {FATIGUE[c.fatigue - 1]}</span></div>
          <div className="row">
            <span>근육통</span>
            <span className="muted">{c.soreParts.length ? PARTS.filter(([p]) => c.soreParts.includes(p)).map(([, l]) => l).join(', ') : '없음'}{c.pain && ' · 통증 있음'}</span>
          </div>
          <div className="row"><span>운동량</span><span className="muted">{VERDICT_TEXT[c.verdict].title}</span></div>
        </div>
      )}

      {s && (s.endedAt || s.sets.length > 0 || s.location) && (
        <div className="card" style={{ padding: '6px 16px' }}>
          {s.endedAt && <div className="row"><span>운동 시간</span><span className="muted">{Math.max(1, Math.round((s.endedAt - s.startedAt) / 60_000))}분</span></div>}
          {[...groups].map(([id, sets]) => {
            const ex = data.exercises[id];
            const step = ex?.steps[sets[0].level];
            const unit = step?.unit === 'sec' ? '초' : '회';
            const values = sets.map((x) => (x.valueRight === undefined ? `${x.value}` : `${x.value}/${x.valueRight}`));
            return (
              <div className="row" key={id} style={{ gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{step?.name ?? id}{sets.some((x) => x.isTest) && ' · 측정'}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{values.join(' · ')}{unit}</span>
                </div>
                {s.rpeByExercise[id] && <span className="tag">{RPE_LABEL[s.rpeByExercise[id]]}</span>}
              </div>
            );
          })}
          {s.location && <div className="row"><span>장소</span><span className="muted">{s.location === 'indoor' ? '실내 HIIT' : '실외'}</span></div>}
          {s.intervalLaps?.map((l) => (
            <div className="row" key={l.index}><span>{l.index}회차</span><span className="muted">{mss(l.seconds)}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
