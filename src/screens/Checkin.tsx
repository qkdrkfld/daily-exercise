import { useMemo, useState } from 'react';
import { startWorkout } from '../flow';
import { pick, VERDICT_TEXT } from '../rules/coach';
import { verdictOf } from '../rules/checkin';
import { dayTypeOf } from '../rules/routine';
import type { CheckIn, SorePart } from '../types';
import { Icon, ICON } from './Icon';

export const FATIGUE = ['쌩쌩', '좋음', '보통', '피곤', '녹초'];
export const PARTS: [SorePart, string][] = [['chest', '가슴'], ['shoulder', '어깨'], ['arm', '팔'], ['back', '등'], ['legs', '하체']];

export function Checkin({ today, onBack, onStarted }: { today: string; onBack: () => void; onStarted: (v: CheckIn['verdict']) => void }) {
  const [fatigue, setFatigue] = useState<CheckIn['fatigue']>();
  const [sore, setSore] = useState<SorePart[]>([]);
  const [pain, setPain] = useState(false);
  const verdict = fatigue && verdictOf({ fatigue, soreParts: sore, pain }, dayTypeOf(today));
  const detail = useMemo(() => verdict && pick(VERDICT_TEXT[verdict].details), [verdict]);

  const toggle = (p: SorePart) => setSore((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const start = async () => {
    if (!fatigue || !verdict) return;
    await startWorkout({ date: today, fatigue, soreParts: sore, pain, verdict });
    onStarted(verdict);
  };

  return (
    <>
      <div className="header">
        <button className="icon-btn" aria-label="뒤로" onClick={onBack}><Icon d={ICON.back} /></button>
        <div>
          <div className="sub">시작 전 30초</div>
          <h1>오늘 컨디션은?</h1>
        </div>
      </div>

      <div className="stack">
        <span className="section-title">피로도</span>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
          {FATIGUE.map((label, i) => (
            <button key={label} className="choice" aria-pressed={fatigue === i + 1} onClick={() => setFatigue((i + 1) as CheckIn['fatigue'])}
              style={{ height: 64, borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <span style={{ fontSize: 18, fontWeight: 900 }}>{i + 1}</span>
              <span style={{ fontSize: 11, fontWeight: 400 }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="stack">
        <span className="section-title">근육통 있는 부위</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PARTS.map(([p, label]) => (
            <button key={p} className="choice chip" aria-pressed={sore.includes(p)} onClick={() => toggle(p)}>{label}</button>
          ))}
          {/* "없음"은 단독 선택 */}
          <button className="choice chip" aria-pressed={sore.length === 0} onClick={() => setSore([])}>없음</button>
        </div>
      </div>

      <div className="stack">
        <span className="section-title">찌릿하거나 날카로운 통증이 있나요?</span>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button className="choice" style={{ height: 52, borderRadius: 14 }} aria-pressed={!pain} onClick={() => setPain(false)}>없음</button>
          <button className="choice" style={{ height: 52, borderRadius: 14 }} aria-pressed={pain} onClick={() => setPain(true)}>있음</button>
        </div>
      </div>

      <div className="card" style={{ gap: 6, padding: 16 }} aria-live="polite">
        <span className="label">트레이너 판단</span>
        {verdict ? (
          <>
            <span style={{ fontSize: 18, fontWeight: 900 }}>{VERDICT_TEXT[verdict].title}</span>
            <span className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{detail}</span>
          </>
        ) : (
          <span className="muted" style={{ fontSize: 14 }}>피로도를 고르면 오늘 어떻게 할지 알려 드립니다.</span>
        )}
      </div>

      <div className="spacer" />
      <button className="btn" disabled={!verdict} onClick={start}>
        {verdict === 'active_rest' ? '스트레칭 10분 시작' : '워밍업 스트레칭부터 시작'}
      </button>
    </>
  );
}
