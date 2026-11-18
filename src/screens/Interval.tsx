import { useEffect, useState } from 'react';
import { HIIT_MOVES, QUIET_SUBSTITUTE, WARMUP_JOG_MIN } from '../data/program';
import { db, getSettings } from '../db';
import { signal, useCountdown, useGpsDistance, useNow, useWakeLock } from '../hooks';
import { dayTitle, distLabel, mmss, mss, signedSec } from '../labels';
import { lapPaceDiffs } from '../rules/adjust';
import { type IntervalDay, intervalPlan, isTestDate } from '../rules/routine';
import { hiitPosition } from '../rules/session';
import type { WorkoutSession } from '../types';
import { Counter } from './Counter';
import { Icon, ICON } from './Icon';

type Plan = ReturnType<typeof intervalPlan>;
type Save = (next: WorkoutSession) => Promise<void>;

export function Interval({ today, onFinish }: { today: string; onFinish: () => void }) {
  useWakeLock();
  const [session, setSession] = useState<WorkoutSession>();
  const [plan, setPlan] = useState<Plan>();
  const [hiitStartedAt, setHiitStartedAt] = useState<number>();
  const [gpsOn, setGpsOn] = useState(false);
  const now = useNow(1000);

  useEffect(() => {
    (async () => {
      const s = (await db.sessions.get(today))!;
      const settings = await getSettings();
      setGpsOn(!!settings.gpsPace);
      setPlan(intervalPlan(s.dayType as IntervalDay, settings, s.volumeFactor, isTestDate(today, settings)));
      setSession({ ...s, location: s.location ?? 'outdoor', quietMode: s.quietMode ?? settings.quietModeDefault });
    })();
  }, [today]);

  if (!session || !plan) return null;

  const save: Save = async (next) => {
    await db.sessions.put(next);
    setSession(next);
  };

  const stop = () => {
    if (confirm('여기서 마치고 쿨다운 스트레칭으로 넘어갈까요? 회차를 다 채우지 못하면 다음 주도 같은 회차로 합니다.')) onFinish();
  };

  // 시작한 뒤에는 장소를 바꾸지 않는다 (실외 랩과 실내 라운드가 섞이지 않게)
  const locked = !!session.intervalLaps?.length || hiitStartedAt !== undefined;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="icon-btn" aria-label="운동 마치기" onClick={stop}><Icon d={ICON.close} /></button>
        <span className="muted" style={{ fontSize: 14, fontWeight: 700 }}>{plan.test ? `${dayTitle(today).split(' · ')[0]} · 4주 측정` : dayTitle(today)}</span>
        <span className="muted" style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{mmss(Math.floor((now - session.startedAt) / 1000))}</span>
      </div>

      <div className="grid" role="group" aria-label="장소 선택" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {(['outdoor', 'indoor'] as const).map((loc) => (
          <button key={loc} className="choice" style={{ height: 44, borderRadius: 12 }} disabled={locked}
            aria-pressed={session.location === loc} onClick={() => save({ ...session, location: loc })}>
            {loc === 'outdoor' ? (plan.test ? '실외 3km' : '실외 달리기') : (plan.test ? '실내 버피 3분' : '실내 HIIT')}
          </button>
        ))}
      </div>

      {session.location === 'indoor'
        ? <Indoor session={session} plan={plan} save={save} startedAt={hiitStartedAt} onStart={() => setHiitStartedAt(Date.now())} onFinish={onFinish} />
        : <Outdoor session={session} plan={plan} save={save} gpsOn={gpsOn} onFinish={onFinish} />}
    </>
  );
}

// 실외 진행 단계. 랩 기록만 DB에 저장하고, 앱을 다시 열면 랩 수에서 이어서 시작한다
type Run =
  | { phase: 'warmup' | 'jog' | 'cooldown'; endsAt: number }
  | { phase: 'ready' }
  | { phase: 'run'; startedAt: number };

const jogEnd = () => Date.now() + WARMUP_JOG_MIN * 60_000;

function Outdoor({ session, plan, save, gpsOn, onFinish }: { session: WorkoutSession; plan: Plan; save: Save; gpsOn: boolean; onFinish: () => void }) {
  const laps = session.intervalLaps ?? [];
  const [run, setRun] = useState<Run>(() =>
    !laps.length ? { phase: 'warmup', endsAt: jogEnd() } : laps.length >= plan.reps ? { phase: 'cooldown', endsAt: jogEnd() } : { phase: 'ready' });
  const now = useNow(250);
  const remain = useCountdown('endsAt' in run ? run.endsAt : undefined, () => {
    if (run.phase !== 'cooldown') setRun({ phase: 'ready' });
  });

  const n = laps.length + 1;
  const dist = distLabel(plan.distanceM);
  const segmentSec = (plan.distanceM / 1000) * plan.pace;
  const diffs = lapPaceDiffs(laps, plan.distanceM, plan.pace);
  const gps = useGpsDistance(gpsOn && run.phase === 'run');
  // 50m 전에는 페이스가 크게 튀어서 거리만 보여 준다
  const gpsLine = gps.failed ? 'GPS를 쓸 수 없습니다. 랩 버튼으로 기록합니다.'
    : gps.track === undefined ? 'GPS 위치를 찾는 중입니다.'
    : `${Math.round(gps.track.meters)}m / ${plan.distanceM}m` + (gps.track.meters >= 50
      ? ` · 페이스 ${mss(gps.track.sec / (gps.track.meters / 1000))}/km` : '');

  const lap = async () => {
    if (run.phase !== 'run') return;
    const seconds = Math.round((Date.now() - run.startedAt) / 1000);
    await save({ ...session, intervalLaps: [...laps, { index: n, seconds, distanceM: plan.distanceM }] });
    setRun(n >= plan.reps ? { phase: 'cooldown', endsAt: jogEnd() } : { phase: 'jog', endsAt: Date.now() + plan.joggingSec * 1000 });
  };

  const card = {
    warmup: { head: `천천히 조깅 ${WARMUP_JOG_MIN}분`, big: mmss(remain), foot: plan.test ? `끝나면 ${dist}를 잽니다.` : `끝나면 1회차 ${dist}를 뜁니다.` },
    jog: { head: `사이 조깅 · 다음은 ${n} / ${plan.reps}회차`, big: mmss(remain), foot: '시간이 되면 알림이 울립니다.' },
    cooldown: { head: `마무리 조깅 ${WARMUP_JOG_MIN}분`, big: mmss(remain), foot: plan.test ? '측정을 마쳤습니다.' : '회차를 모두 마쳤습니다.' },
    ready: { head: plan.test ? `${dist} 측정` : `${n} / ${plan.reps}회차 · 빠르게 ${dist}`, big: mss(segmentSec), foot: `${plan.test ? '참고 ' : ''}구간 목표 시간 · ${mss(plan.pace)}/km` },
    run: { head: plan.test ? `${dist} 측정` : `${n} / ${plan.reps}회차 · 빠르게 ${dist}`, big: run.phase === 'run' ? mss(Math.floor((now - run.startedAt) / 1000)) : '', foot: `목표 ${mss(segmentSec)} · ${dist} 지점에서 ${plan.test ? '종료' : '랩'}` },
  }[run.phase];

  return (
    <>
      <div className="timer-card" aria-live="polite">
        <span style={{ fontSize: 14, fontWeight: 700 }}>{card.head}</span>
        <b>{card.big}</b>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{card.foot}</span>
        {gpsOn && run.phase === 'run' && <span style={{ fontSize: 13, fontWeight: 500 }}>{gpsLine}</span>}
      </div>

      {plan.test && laps[0] && (
        <label className="stack" style={{ gap: 6 }}>
          <span className="muted" style={{ fontSize: 13 }}>기록 시간 (분:초). 잘못 눌렀으면 고칩니다.</span>
          {/* iOS 숫자 키패드에는 ':'가 없어서 일반 키보드 */}
          <input className="input" inputMode="text" defaultValue={mss(laps[0].seconds)} key={laps[0].seconds}
            onBlur={(e) => {
              const m = /^(\d{1,3}):([0-5]\d)$/.exec(e.target.value.trim());
              if (!m) { e.target.value = mss(laps[0].seconds); return; }
              save({ ...session, intervalLaps: [{ ...laps[0], seconds: Number(m[1]) * 60 + Number(m[2]) }] });
            }} />
        </label>
      )}

      {laps.length > 0 && (
        <div className="card" style={{ padding: '4px 16px' }}>
          {laps.map((l, i) => (
            // 양옆 칸 너비를 같게 고정해 가운데 시간 열이 줄마다 같은 자리에 오게 한다
            <div className="row" key={l.index} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr' }}>
              <span className="muted">{l.index}회차</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{mss(l.seconds)}</span>
              <span className="muted" style={{ textAlign: 'right' }}>{signedSec(diffs[i])}</span>
            </div>
          ))}
          <div className="row">
            <span className="muted">평균 (목표 대비)</span>
            <span style={{ fontWeight: 700 }}>{signedSec(diffs.reduce((a, b) => a + b, 0) / diffs.length)}</span>
          </div>
        </div>
      )}

      <div className="spacer" />
      {run.phase === 'ready' && <button className="btn" onClick={() => setRun({ phase: 'run', startedAt: Date.now() })}>{plan.test ? '측정 시작' : `${n}회차 시작`}</button>}
      {run.phase === 'run' && <button className="btn" onClick={lap}>{plan.test ? `종료 · ${dist} 도착` : `랩 · ${dist} 도착`}</button>}
      {(run.phase === 'warmup' || run.phase === 'jog') && <button className="btn secondary" onClick={() => setRun({ phase: 'ready' })}>조깅 건너뛰기</button>}
      {run.phase === 'cooldown' && <button className={remain > 0 ? 'btn secondary' : 'btn'} onClick={onFinish}>쿨다운 스트레칭으로</button>}
    </>
  );
}

// 측정은 지난번과 비교하려고 저소음 대체 없이 버피로만 한다
const moveOf = (round: number, quiet?: boolean, test?: boolean) => {
  if (test) return '버피';
  const m = HIIT_MOVES[(round - 1) % HIIT_MOVES.length];
  return quiet ? (QUIET_SUBSTITUTE[m] ?? m) : m;
};

function Indoor({ session, plan, save, startedAt, onStart, onFinish }: {
  session: WorkoutSession; plan: Plan; save: Save; startedAt?: number; onStart: () => void; onFinish: () => void;
}) {
  const now = useNow(250);
  const { workSec, restSec } = plan.hiit;
  const pos = startedAt === undefined ? undefined : hiitPosition((now - startedAt) / 1000, workSec, restSec, plan.rounds);

  // 운동/휴식이 바뀔 때마다 소리/진동
  const key = pos && `${pos.phase}-${pos.round}`;
  useEffect(() => {
    if (key) signal();
  }, [key]);

  const quiet = session.quietMode;
  const [count, setCount] = useState(session.tests?.burpee3minCount ?? 0);
  const round = pos?.round ?? 1;
  const nextLine = !pos || pos.phase === 'done' ? undefined
    : pos.phase === 'work'
      ? round < plan.rounds && { head: `다음 ${restSec}초 휴식 후`, move: `${moveOf(round + 1, quiet)} · ${workSec}초` }
      : { head: '휴식 후', move: `${moveOf(round + 1, quiet)} · ${workSec}초` };

  return (
    <>
      <div className="timer-card" aria-live="polite">
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          {pos?.phase === 'done' ? `${plan.rounds}라운드 완료` : `${round} / ${plan.rounds} 라운드 · ${pos?.phase === 'rest' ? `휴식 ${restSec}초` : `운동 ${workSec}초`}`}
        </span>
        <b>{mmss(pos ? Math.ceil(pos.remain) : workSec)}</b>
        {pos?.phase !== 'done' && <span style={{ fontSize: 22, fontWeight: 900 }}>{pos?.phase === 'rest' ? '휴식' : moveOf(round, quiet, plan.test)}</span>}
      </div>

      {plan.test && pos?.phase === 'done' && (
        <div className="card" style={{ gap: 14 }}>
          <span className="section-title">버피 개수</span>
          <Counter value={count} onChange={setCount} caption="3분 동안 한 개수" />
        </div>
      )}

      {!plan.test && <div className="card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div className="stack" style={{ gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>저소음 모드</span>
          <span className="muted" style={{ fontSize: 13 }}>점프 동작을 소리가 덜 나는 동작으로 바꿉니다.</span>
        </div>
        <button className="choice chip" aria-pressed={!!quiet} onClick={() => save({ ...session, quietMode: !quiet })}>{quiet ? '켜짐' : '꺼짐'}</button>
      </div>}

      {nextLine && (
        <div className="stack" style={{ gap: 4, padding: '14px 16px', borderRadius: 16, border: '1px solid var(--border)' }}>
          <span className="muted" style={{ fontSize: 13 }}>{nextLine.head}</span>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{nextLine.move}</span>
        </div>
      )}

      <div className="spacer" />
      {!pos && <button className="btn" onClick={onStart}>{plan.test ? '버피 3분 시작' : `HIIT 시작 · ${plan.rounds}라운드`}</button>}
      {pos?.phase === 'done' && (
        <button className="btn" onClick={async () => {
          if (plan.test) await save({ ...session, tests: { ...session.tests, burpee3minCount: count } });
          onFinish();
        }}>쿨다운 스트레칭으로</button>
      )}
    </>
  );
}
