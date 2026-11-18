import { useEffect, useState } from 'react';
import { COOLDOWN_STRETCH, WARMUP_STRETCH } from '../data/program';
import { db, getSettings } from '../db';
import { useCountdown, useWakeLock } from '../hooks';
import { mmss } from '../labels';
import { dayTypeOf, isTestDate } from '../rules/routine';
import { Counter } from './Counter';
import { Icon, ICON } from './Icon';

export type StretchKind = 'warmup' | 'cooldown' | 'rest';

function content(kind: StretchKind, today: string) {
  const t = dayTypeOf(today);
  if (kind === 'warmup') return { sub: '동적 스트레칭', title: '워밍업 5분', minutes: 5, items: WARMUP_STRETCH, cta: '운동 시작' };
  if (kind === 'cooldown') {
    const items = COOLDOWN_STRETCH[t === 'push' || t === 'pull' ? t : 'legs'];
    return { sub: '정적 스트레칭 · 각 20~30초', title: '쿨다운 5분', minutes: 5, items, cta: '운동 마무리' };
  }
  const items = [...new Set([...WARMUP_STRETCH, ...Object.values(COOLDOWN_STRETCH).flat()])];
  return { sub: '가벼운 휴식', title: '스트레칭 10분', minutes: 10, items, cta: '스트레칭 완료' };
}

export function Stretch({ kind, today, onExit, onDone }: {
  kind: StretchKind; today: string; onExit: () => void; onDone: (startedAt: number) => void;
}) {
  useWakeLock();
  const c = content(kind, today);
  const [startedAt] = useState(Date.now());
  const remain = useCountdown(startedAt + c.minutes * 60_000);
  // 4주차 당기기 날은 쿨다운의 데드행으로 그립을 잰다 (8.5). undefined면 측정 날이 아님
  const [hang, setHang] = useState<number>();
  useEffect(() => {
    if (kind !== 'cooldown' || dayTypeOf(today) !== 'pull') return;
    getSettings().then((st) => isTestDate(today, st) && setHang(0));
  }, [kind, today]);

  const done = async () => {
    // 0초는 재지 않은 것으로 보고 비워 둔다
    if (hang) {
      const s = await db.sessions.get(today);
      if (s) await db.sessions.put({ ...s, tests: { ...s.tests, deadHangSec: hang } });
    }
    onDone(startedAt);
  };

  return (
    <>
      <div className="header">
        <button className="icon-btn" aria-label="홈으로" onClick={onExit}><Icon d={ICON.close} /></button>
        <div>
          <div className="sub">{c.sub}</div>
          <h1>{c.title}</h1>
        </div>
      </div>

      <div className="timer-card">
        <span style={{ fontSize: 14, fontWeight: 700 }}>{remain > 0 ? '남은 시간' : '시간이 끝났습니다'}</span>
        <b>{mmss(remain)}</b>
      </div>

      <div className="card" style={{ padding: '6px 16px' }}>
        <ul className="list">{c.items.map((name) => <li key={name}>{name}</li>)}</ul>
      </div>

      {hang !== undefined && (
        <div className="card" style={{ gap: 14 }}>
          <div className="stack" style={{ gap: 2 }}>
            <span className="label">4주 측정</span>
            <span className="section-title">데드행 최대 시간</span>
            <span className="muted" style={{ fontSize: 13 }}>철봉에 매달려 버틴 시간을 넣습니다. 재지 않았으면 0으로 둡니다.</span>
          </div>
          <Counter value={hang} onChange={setHang} sec caption="버틴 시간 (초)" />
        </div>
      )}

      <div className="spacer" />
      <button className={remain > 0 ? 'btn secondary' : 'btn'} onClick={done}>
        {remain > 0 ? `${c.cta} (일찍 끝내기)` : c.cta}
      </button>
    </>
  );
}
