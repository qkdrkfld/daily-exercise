import { type ReactNode, useEffect, useState } from 'react';
import { db } from './db';
import { completeInterval, completeStretch, completeWorkout, type DoneData } from './flow';
import { isStrength } from './labels';
import { dayTypeOf, toDateStr } from './rules/routine';
import { Checkin } from './screens/Checkin';
import { Done } from './screens/Done';
import { Home } from './screens/Home';
import { Interval } from './screens/Interval';
import { Library } from './screens/Library';
import { Onboarding } from './screens/Onboarding';
import { Log } from './screens/Log';
import { ReportDetail, ReportList } from './screens/Report';
import { Settings } from './screens/Settings';
import { Stretch, type StretchKind } from './screens/Stretch';
import { Workout } from './screens/Workout';

type Tab = 'home' | 'log' | 'library' | 'report';

// 운동 흐름 화면. date는 흐름을 시작한 날로 고정 (운동 중 자정이 지나도 같은 세션)
type Flow =
  | { name: 'checkin'; date: string }
  | { name: 'stretch'; kind: StretchKind; date: string }
  | { name: 'workout'; date: string }
  | { name: 'done'; data: DoneData }
  | { name: 'report'; cycleIndex: number }
  | { name: 'settings' };

// 시안(Main.dc.html)의 선 아이콘
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'home', label: '홈', icon: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /> },
  { id: 'log', label: '기록', icon: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></> },
  { id: 'library', label: '동작 사전', icon: <><path d="M4 5h11a3 3 0 0 1 3 3v12H7a3 3 0 0 1-3-3z" /><path d="M4 17a3 3 0 0 1 3-3h11" /></> },
  { id: 'report', label: '측정', icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
];

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [flow, setFlow] = useState<Flow>();
  const home = () => setFlow(undefined);
  // 0회차 측정(온보딩 입력)이 없으면 첫 실행으로 본다
  const [onboarded, setOnboarded] = useState<boolean>();
  useEffect(() => {
    db.assessments.where('cycleIndex').equals(0).count().then((n) => setOnboarded(n > 0));
  }, []);

  if (onboarded === undefined) return null;
  if (!onboarded) {
    return (
      <div className="app">
        <main className="screen flow">
          <Onboarding today={toDateStr(new Date())} onDone={() => setOnboarded(true)} />
        </main>
      </div>
    );
  }

  if (flow) {
    return (
      <div className="app">
        <main className="screen flow">
          {flow.name === 'checkin' && (
            <Checkin today={flow.date} onBack={home}
              onStarted={(v) => setFlow({ name: 'stretch', kind: v === 'active_rest' ? 'rest' : 'warmup', date: flow.date })} />
          )}
          {flow.name === 'stretch' && (
            <Stretch key={flow.kind} kind={flow.kind} today={flow.date} onExit={home}
              onDone={async (startedAt) => {
                if (flow.kind === 'warmup') setFlow({ name: 'workout', date: flow.date });
                else if (flow.kind === 'cooldown') {
                  const complete = isStrength(dayTypeOf(flow.date)) ? completeWorkout : completeInterval;
                  setFlow({ name: 'done', data: await complete(flow.date) });
                }
                else setFlow({ name: 'done', data: await completeStretch(flow.date, startedAt) });
              }} />
          )}
          {flow.name === 'workout' && (isStrength(dayTypeOf(flow.date))
            ? <Workout today={flow.date} onFinish={() => setFlow({ name: 'stretch', kind: 'cooldown', date: flow.date })} />
            : <Interval today={flow.date} onFinish={() => setFlow({ name: 'stretch', kind: 'cooldown', date: flow.date })} />)}
          {flow.name === 'done' && <Done data={flow.data} onHome={home} onReport={(cycleIndex) => setFlow({ name: 'report', cycleIndex })} />}
          {flow.name === 'report' && <ReportDetail cycleIndex={flow.cycleIndex} onBack={home} />}
          {flow.name === 'settings' && <Settings onBack={home} />}
        </main>
      </div>
    );
  }

  const today = toDateStr(new Date());
  return (
    <div className="app">
      <main className="screen">
        {tab === 'home' ? (
          <Home today={today} onStart={(a) => setFlow(
            a === 'checkin' ? { name: 'checkin', date: today }
              : a === 'resume' ? { name: 'workout', date: today }
                : { name: 'stretch', kind: 'rest', date: today },
          )} onSettings={() => setFlow({ name: 'settings' })} />
        ) : tab === 'log' ? (
          <Log today={today} />
        ) : tab === 'library' ? (
          <Library />
        ) : (
          <ReportList />
        )}
      </main>
      <nav className="tabbar" aria-label="주 메뉴">
        {TABS.map((t) => (
          <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
