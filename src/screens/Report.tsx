import { useEffect, useState } from 'react';
import { db } from '../db';
import { mss } from '../labels';
import { type Area, AREA_LABEL, AREAS, compareAreas, radarValues, type Trend } from '../rules/assessment';
import type { Assessment } from '../types';
import { Icon, ICON } from './Icon';

/** 측정 탭: 지난 4주 측정 리포트 목록 */
export function ReportList() {
  const [list, setList] = useState<Assessment[]>();
  const [open, setOpen] = useState<number>();

  useEffect(() => {
    db.assessments.where('cycleIndex').above(0).reverse().sortBy('cycleIndex').then(setList);
  }, []);

  if (open !== undefined) return <ReportDetail cycleIndex={open} onBack={() => setOpen(undefined)} />;
  if (!list) return null;
  return (
    <>
      <h1 className="title">측정</h1>
      {list.length ? (
        <div className="card" style={{ padding: '4px 16px' }}>
          {list.map((a) => (
            <button key={a.id} className="row row-btn" onClick={() => setOpen(a.cycleIndex)}>
              <span style={{ fontWeight: 700 }}>{a.cycleIndex}회차 측정</span>
              <span className="muted">{a.date}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
          아직 측정 기록이 없습니다. 4주 주기의 4주차 월·화·목·금에 측정하고, 금요일에 리포트가 나옵니다.
        </p>
      )}
    </>
  );
}

const reps = (n: number) => `${n}회`;
const secs = (n: number) => `${n}초`;
const ITEMS: { key: Exclude<keyof Assessment, 'id' | 'date' | 'cycleIndex' | 'notes'>; label: string; fmt: (n: number) => string }[] = [
  { key: 'pullupMax', label: '턱걸이', fmt: reps },
  { key: 'dipMax', label: '딥스', fmt: reps },
  { key: 'pushupMax', label: '푸시업', fmt: reps },
  { key: 'splitSquatMaxLeft', label: '스플릿 스쿼트 왼쪽', fmt: reps },
  { key: 'splitSquatMaxRight', label: '스플릿 스쿼트 오른쪽', fmt: reps },
  { key: 'hollowHoldSec', label: '할로우 홀드', fmt: secs },
  { key: 'deadHangSec', label: '데드행', fmt: secs },
  { key: 'run3kSec', label: '3km', fmt: mss },
  { key: 'burpee3minCount', label: '버피 3분', fmt: (n) => `${n}개` },
];

function trendLine(t?: Record<Area, Trend | undefined>): string {
  if (!t) return '첫 측정입니다. 다음 측정부터 지난번과 비교합니다.';
  const of = (x: Trend) => AREAS.filter((k) => t[k] === x).map((k) => AREA_LABEL[k]).join(', ');
  const parts = [
    of('up') && `${of('up')} 기록이 늘었습니다.`,
    of('same') && `${of('same')} 기록은 그대로입니다.`,
    of('down') && `${of('down')} 기록이 줄었습니다.`,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : '지난번과 같이 잰 항목이 없어 비교하지 않습니다.';
}

export function ReportDetail({ cycleIndex, onBack }: { cycleIndex: number; onBack: () => void }) {
  const [data, setData] = useState<{ curr: Assessment; prev?: Assessment }>();

  useEffect(() => {
    (async () => {
      const curr = (await db.assessments.where('cycleIndex').equals(cycleIndex).first())!;
      // 온보딩 입력(0)도 첫 비교 기준이 된다
      const prev = (await db.assessments.where('cycleIndex').below(cycleIndex).sortBy('cycleIndex')).at(-1);
      setData({ curr, prev });
    })();
  }, [cycleIndex]);

  if (!data) return null;
  const { curr, prev } = data;
  const rows = ITEMS.filter((it) => it.key !== 'burpee3minCount' || curr[it.key] !== undefined || prev?.[it.key] !== undefined);
  const show = (a: Assessment | undefined, it: (typeof ITEMS)[number]) => (a?.[it.key] === undefined ? '측정 없음' : it.fmt(a[it.key]!));

  return (
    <>
      <div className="header">
        <button className="icon-btn" aria-label="뒤로" onClick={onBack}><Icon d={ICON.back} /></button>
        <div>
          <div className="sub">{curr.cycleIndex}회차 정식 측정 · {curr.date}</div>
          <h1>4주 측정 리포트</h1>
        </div>
      </div>

      <div className="trainer">
        <div className="badge"><Icon d={ICON.dumbbell} color="var(--on-accent)" width={2.2} /></div>
        <div>
          <span className="label">트레이너</span>
          <p>{trendLine(prev && compareAreas(prev, curr))}</p>
        </div>
      </div>

      <div className="card" style={{ alignItems: 'center', gap: 8 }}>
        <Radar curr={curr} prev={prev} />
        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="18" height="4" aria-hidden="true"><line x1="0" y1="2" x2="18" y2="2" stroke="var(--accent)" strokeWidth="3" /></svg>이번
          </span>
          {prev && (
            <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="18" height="4" aria-hidden="true"><line x1="0" y1="2" x2="18" y2="2" stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="4 3" /></svg>지난번
            </span>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: '4px 16px' }}>
        <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12 }}>
          <span className="muted" style={{ fontSize: 13 }}>항목</span>
          <span className="muted" style={{ fontSize: 13, textAlign: 'right' }}>지난번</span>
          <span className="muted" style={{ fontSize: 13, textAlign: 'right', minWidth: 64 }}>이번</span>
        </div>
        {rows.map((it) => (
          <div className="row" key={it.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12 }}>
            <span>{it.label}</span>
            <span className="muted" style={{ textAlign: 'right' }}>{show(prev, it)}</span>
            <span style={{ fontWeight: 700, textAlign: 'right', minWidth: 64, color: curr[it.key] === undefined ? 'var(--text-muted)' : undefined }}>{show(curr, it)}</span>
          </div>
        ))}
      </div>

      <div className="stack" style={{ gap: 8, padding: '14px 16px', borderRadius: 16, border: '1px solid var(--border)' }}>
        <span className="label">다음 4주 자동 조정</span>
        {(curr.notes ?? []).map((n) => <span key={n} style={{ fontSize: 15, lineHeight: 1.5 }}>{n}</span>)}
      </div>
    </>
  );
}

// 6개 영역 레이더. 값은 목표 대비 0~1, 측정 없는 영역은 꼭짓점을 빼고 "측정 없음"으로 표시 (8.5)
const C = 150;
const R = 100;
const point = (i: number, r: number) => {
  const a = ((-90 + 60 * i) * Math.PI) / 180;
  return `${(C + r * Math.cos(a)).toFixed(1)},${(C + r * Math.sin(a)).toFixed(1)}`;
};

function Radar({ curr, prev }: { curr: Assessment; prev?: Assessment }) {
  const now = radarValues(curr);
  const before = prev && radarValues(prev);
  const shape = (v: Record<Area, number | undefined>) => AREAS.flatMap((k, i) => (v[k] === undefined ? [] : [point(i, R * v[k]!)])).join(' ');
  const summary = AREAS.map((k) => `${AREA_LABEL[k]} ${now[k] === undefined ? '측정 없음' : `${Math.round(now[k]! * 100)}%`}`).join(', ');

  return (
    <svg viewBox="0 0 300 300" width="100%" style={{ maxWidth: 320 }} role="img" aria-label={`목표 대비 이번 측정: ${summary}`}>
      {[1 / 3, 2 / 3, 1].map((f) => (
        <polygon key={f} points={AREAS.map((_, i) => point(i, R * f)).join(' ')} fill="none" stroke="var(--border)" strokeWidth="1" />
      ))}
      {AREAS.map((_, i) => {
        const [x, y] = point(i, R).split(',');
        return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="var(--border)" strokeWidth="1" />;
      })}
      {before && <polygon points={shape(before)} fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="4 4" />}
      <polygon points={shape(now)} fill="var(--accent)" fillOpacity="0.28" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {AREAS.map((k, i) => {
        const [x, y] = point(i, R + 26).split(',').map(Number);
        return (
          <text key={k} x={x} y={y} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text)">
            {AREA_LABEL[k]}
            {now[k] === undefined && <tspan x={x} dy="15" fontSize="11" fontWeight="400" fill="var(--text-muted)">측정 없음</tspan>}
          </text>
        );
      })}
    </svg>
  );
}
