import type { DoneData } from '../flow';
import { RESULT_LABEL } from '../rules/adjust';

const UP = new Set(['next', 'plusOne', 'plusTwo']);

export function Done({ data, onHome, onReport }: { data: DoneData; onHome: () => void; onReport: (cycleIndex: number) => void }) {
  return (
    <>
      <div className="stack" style={{ gap: 4 }}>
        <span className="label" style={{ fontSize: 13 }}>완료</span>
        <h1 className="ex-name" style={{ fontSize: 32, lineHeight: 1.2 }}>{data.heading}</h1>
      </div>

      <div className="stats">
        {data.stats.map((s) => (
          <div className="stat" key={s.label}>
            <span className="muted" style={{ fontSize: 13 }}>{s.label}</span>
            <b>{s.value}</b>
          </div>
        ))}
      </div>

      {data.rows.length > 0 && (
        <div className="card" style={{ padding: '6px 16px' }}>
          {data.rows.map((r) => (
            <div className="row" key={r.name} style={{ gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{r.done}</span>
              </div>
              <span className={UP.has(r.result) ? 'tag up' : 'tag'}>{RESULT_LABEL[r.result]}</span>
            </div>
          ))}
        </div>
      )}

      <div className="stack" style={{ gap: 4, padding: '14px 16px', borderRadius: 16, border: '1px solid var(--border)' }}>
        <span className="label">트레이너 한 줄 평</span>
        <span style={{ fontSize: 15, lineHeight: 1.5 }}>{data.line}</span>
      </div>

      <div className="spacer" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
        <span className="muted" style={{ fontSize: 13 }}>내일</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{data.tomorrow}</span>
      </div>
      {data.reportCycle !== undefined && <button className="btn" onClick={() => onReport(data.reportCycle!)}>측정 리포트 보기</button>}
      <button className={data.reportCycle !== undefined ? 'btn secondary' : 'btn'} onClick={onHome}>홈으로</button>
    </>
  );
}
