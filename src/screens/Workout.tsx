import { useEffect, useState } from 'react';
import { db } from '../db';
import { loadPlan } from '../flow';
import { useCountdown, useNow, useWakeLock } from '../hooks';
import { dayTitle, mmss, RPE_LABEL } from '../labels';
import { TEST_REST_SEC } from '../rules/assessment';
import { type PlanItem, positionOf } from '../rules/session';
import type { Rpe, WorkoutSession } from '../types';
import { Counter } from './Counter';
import { Icon, ICON } from './Icon';

export function Workout({ today, onFinish }: { today: string; onFinish: () => void }) {
  useWakeLock();
  const [session, setSession] = useState<WorkoutSession>();
  const [plan, setPlan] = useState<PlanItem[]>();
  const [rest, setRest] = useState<{ endsAt: number; label: string }>();
  const [value, setValue] = useState(0);
  const [right, setRight] = useState(0); // 측정 세트의 오른쪽 다리
  const now = useNow(1000);
  const restRemain = useCountdown(rest?.endsAt, () => setRest(undefined));

  useEffect(() => {
    (async () => {
      const s = (await db.sessions.get(today))!;
      setPlan(await loadPlan(today, s.volumeFactor));
      setSession(s);
    })();
  }, [today]);

  const pos = session && plan ? positionOf(plan, session) : undefined;
  const item = pos && pos.phase !== 'done' ? plan![pos.index] : undefined;

  // 새 세트가 시작되면 입력값을 이 종목의 직전 세트 값(없으면 목표 하한)으로 맞춘다
  const setKey = pos?.phase === 'work' ? `${pos.index}-${pos.setIndex}` : '';
  useEffect(() => {
    if (!item || pos?.phase !== 'work') return;
    const prev = session!.sets.filter((s) => s.exerciseId === item.ex.id && !!s.isTest === !!item.testSet).at(-1);
    setValue(prev?.value ?? item.repMin);
    setRight(item.repMin);
  }, [setKey]);

  useEffect(() => {
    if (pos?.phase === 'done') onFinish();
  }, [pos?.phase]);

  if (!session || !plan || !pos || pos.phase === 'done' || !item) return null;

  const save = async (next: WorkoutSession) => {
    await db.sessions.put(next);
    setSession(next);
  };

  const t = item.testSet;
  const nextItem = plan[pos.index + 1];

  const finishSet = async () => {
    if (pos.phase !== 'work') return;
    const log = { exerciseId: item.ex.id, level: item.state.currentLevel, setIndex: pos.setIndex, value, ...(t && { isTest: true }), ...(t?.fieldRight && { valueRight: right }) };
    await save({ ...session, sets: [...session.sets, log] });
    // 측정 세트 사이와 뒤에는 3분 쉰다 (8.5)
    if (t) { if (nextItem) setRest({ endsAt: Date.now() + TEST_REST_SEC * 1000, label: `다음: ${nextItem.testSet?.name ?? nextItem.step.name}` }); }
    else if (pos.setIndex + 1 < item.sets) setRest({ endsAt: Date.now() + item.ex.restSec * 1000, label: `다음은 세트 ${pos.setIndex + 2}` });
  };

  const pickRpe = async (rpe: Rpe) => {
    await save({ ...session, rpeByExercise: { ...session.rpeByExercise, [item.ex.id]: rpe } });
    if (nextItem) setRest({ endsAt: Date.now() + item.ex.restSec * 1000, label: `다음 종목: ${nextItem.step.name}` });
  };

  const stop = () => {
    if (confirm('여기서 운동을 마치고 쿨다운으로 넘어갈까요? 기록한 세트는 저장되고 세트를 다 채우지 못한 종목은 다음에도 같은 세트·횟수로 합니다.')) onFinish();
  };

  const sec = (t?.unit ?? item.step.unit) === 'sec';
  const unit = sec ? '초' : '회';
  const target = t ? '최대' : item.repMin === item.repMax ? `${item.repMin}${unit}` : `${item.repMin}~${item.repMax}${unit}`;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="icon-btn" aria-label="운동 마치기" onClick={stop}><Icon d={ICON.close} /></button>
        <span className="muted" style={{ fontSize: 14, fontWeight: 700 }}>종목 {pos.index + 1} / {plan.length} · {dayTitle(today)}</span>
        <span className="muted" style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{mmss(Math.floor((now - session.startedAt) / 1000))}</span>
      </div>
      <div className="progress" style={{ gridTemplateColumns: `repeat(${plan.length}, minmax(0, 1fr))` }}>
        {plan.map((p, i) => <div key={`${p.ex.id}${p.testSet ? '-test' : ''}`} className={i <= pos.index ? 'on' : ''} />)}
      </div>

      <a className="video" href={item.ex.videoUrl} target="_blank" rel="noreferrer">
        <div className="play"><svg width="22" height="22" viewBox="0 0 24 24" fill="var(--on-accent)" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></div>
        자세 영상 보기 (유튜브)
      </a>

      <div className="stack" style={{ gap: 6 }}>
        {t && <span className="label">4주 측정</span>}
        <h1 className="ex-name">{t?.name ?? item.step.name}</h1>
        <p className="cues">{t ? t.cue : <>{item.ex.cues}{item.step.tempoNote && ` ${item.step.tempoNote}.`}</>}</p>
      </div>

      {rest ? (
        <>
          <div className="timer-card" aria-live="polite">
            <span style={{ fontSize: 14, fontWeight: 700 }}>휴식 중 · {rest.label}</span>
            <b>{mmss(restRemain)}</b>
            <span style={{ fontSize: 14, fontWeight: 500 }}>시간이 되면 알림이 울립니다.</span>
          </div>
          <button className="btn secondary" onClick={() => setRest(undefined)}>휴식 건너뛰기</button>
        </>
      ) : pos.phase === 'work' ? (
        <>
          <div className="card" style={{ gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="section-title">{t ? '측정 1세트' : `세트 ${pos.setIndex + 1} / ${item.sets}`}</span>
              <span className="muted" style={{ fontSize: 14 }}>목표 {target}</span>
            </div>
            {t?.fieldRight ? (
              <>
                <Counter value={value} onChange={setValue} caption="왼쪽" />
                <Counter value={right} onChange={setRight} caption="오른쪽" />
              </>
            ) : (
              <Counter value={value} onChange={setValue} sec={sec}
                caption={item.step.perSide && !t ? '덜 한 쪽 기준' : sec ? '버틴 시간 (초)' : '실제 한 횟수'} />
            )}
            <span className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
              {t ? '지치기 전에 최대 기록을 잽니다.' : '세트마다 1~2회 여유를 남기고 끝냅니다.'}
            </span>
          </div>
          <button className="btn" onClick={finishSet}>
            {t ? (nextItem ? '측정 완료 · 휴식 3분' : '측정 완료') : pos.setIndex + 1 < item.sets ? `세트 완료 · 휴식 ${item.ex.restSec}초` : '마지막 세트 완료'}
          </button>
        </>
      ) : (
        <div className="card" style={{ gap: 12 }}>
          <span className="label">{item.step.name} 완료</span>
          <span style={{ fontSize: 18, fontWeight: 900 }}>이 종목 체감 난이도는?</span>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {(['easy', 'ok', 'hard'] as Rpe[]).map((r) => (
              <button key={r} className="choice" style={{ height: 52, borderRadius: 12 }} onClick={() => pickRpe(r)}>{RPE_LABEL[r]}</button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
