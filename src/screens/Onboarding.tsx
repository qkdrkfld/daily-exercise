import { useState } from 'react';
import { type BaselineKey, saveBaseline } from '../db';

const FIELDS: { key: BaselineKey; label: string; hint: string }[] = [
  { key: 'pullupMax', label: '턱걸이 최대 횟수', hint: '회' },
  { key: 'dipMax', label: '딥스 최대 횟수', hint: '회' },
  { key: 'pushupMax', label: '바닥 푸시업 최대 횟수', hint: '회' },
  { key: 'splitSquatMaxLeft', label: '스플릿 스쿼트 왼쪽', hint: '회' },
  { key: 'splitSquatMaxRight', label: '스플릿 스쿼트 오른쪽', hint: '회' },
  { key: 'hollowHoldSec', label: '할로우 홀드', hint: '초' },
  { key: 'deadHangSec', label: '데드행', hint: '초' },
  { key: 'run3kSec', label: '3km 달리기', hint: '분:초 (예: 16:30)' },
  { key: 'burpee3minCount', label: '버피 3분', hint: '개' },
];

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 첫 실행: 설치 안내 → 현재 기록 입력. iOS는 Safari와 설치한 앱의 저장소가 따로라서 설치 안내를 먼저 보여 준다 */
export function Onboarding({ today, onDone }: { today: string; onDone: () => void }) {
  const [step, setStep] = useState<'install' | 'record'>(isStandalone() ? 'record' : 'install');
  const [raw, setRaw] = useState<Partial<Record<BaselineKey, string>>>({});
  const [msg, setMsg] = useState<string>();

  if (step === 'install') {
    const ios = isIos();
    return (
      <>
        <div className="stack">
          <h1 className="title">홈 화면에 설치하기</h1>
          <span className="eyebrow">설치하면 앱처럼 열리고 인터넷이 없어도 쓸 수 있습니다.</span>
        </div>
        <ol className="card list" style={{ padding: '4px 16px 4px 36px', listStyle: 'decimal' }}>
          {ios ? (
            <>
              <li>Safari 아래쪽의 공유 버튼을 누릅니다.</li>
              <li>"홈 화면에 추가"를 누릅니다.</li>
              <li>홈 화면에 생긴 맨몸 PT 아이콘으로 엽니다.</li>
            </>
          ) : (
            <>
              <li>Chrome 오른쪽 위 메뉴(⋮)를 누릅니다.</li>
              <li>"앱 설치" 또는 "홈 화면에 추가"를 누릅니다.</li>
              <li>홈 화면에 생긴 맨몸 PT 아이콘으로 엽니다.</li>
            </>
          )}
        </ol>
        {ios && <span className="eyebrow">iPhone은 Safari와 설치한 앱의 기록이 따로 저장됩니다. 설치한 앱을 열어서 기록을 입력합니다.</span>}
        <div className="spacer" />
        <button className="btn secondary" onClick={() => setStep('record')}>설치하지 않고 계속</button>
      </>
    );
  }

  const save = async () => {
    try {
      await saveBaseline(raw, today);
      onDone();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  return (
    <>
      <div className="stack">
        <h1 className="title">지금 기록 입력</h1>
        <span className="eyebrow">첫 4주가 끝나면 이 기록과 비교합니다. 모르는 항목은 비워 둡니다.</span>
      </div>
      <div className="stack">
        {FIELDS.map((f) => (
          <label key={f.key} className="stack" style={{ gap: 6 }}>
            <span className="section-title">{f.label}</span>
            {/* iOS 숫자 키패드에는 ':'가 없어서 3km만 일반 키보드 */}
            <input className="input" inputMode={f.key === 'run3kSec' ? 'text' : 'numeric'} placeholder={f.hint}
              value={raw[f.key] ?? ''} onChange={(e) => setRaw({ ...raw, [f.key]: e.target.value })} />
          </label>
        ))}
      </div>
      {msg && <span className="eyebrow" role="alert">{msg}</span>}
      <button className="btn" onClick={save}>저장하고 시작</button>
    </>
  );
}
