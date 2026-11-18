import { useEffect, useState } from 'react';
import { youtubeSearchUrl } from '../data/program';
import { db, setVideoUrl } from '../db';
import { BODY_TAG, DAY_LABEL } from '../labels';
import type { DayType, Exercise, ExerciseStep } from '../types';
import { Icon, ICON } from './Icon';

const DAYS: DayType[] = ['legs', 'push', 'pull'];

const stepTarget = (s: ExerciseStep) =>
  `${s.sets} × ${s.repMin === s.repMax ? s.repMin : `${s.repMin}~${s.repMax}`}${s.unit === 'sec' ? '초' : '회'}${s.perSide ? ' (각)' : ''}`;

export function Library() {
  const [exercises, setExercises] = useState<Exercise[]>();
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [openId, setOpenId] = useState<string>();

  useEffect(() => {
    (async () => {
      setExercises(await db.exercises.toArray());
      setLevels(Object.fromEntries((await db.userStates.toArray()).map((s) => [s.exerciseId, s.currentLevel])));
    })();
  }, []);

  if (!exercises) return null;
  const open = exercises.find((e) => e.id === openId);
  if (open) {
    return (
      <ExerciseDetail ex={open} level={levels[open.id] ?? open.startLevel} onBack={() => setOpenId(undefined)}
        onSaved={(videoUrl) => setExercises(exercises.map((e) => (e.id === open.id ? { ...e, videoUrl } : e)))} />
    );
  }

  return (
    <>
      <h1 className="title">동작 사전</h1>
      {DAYS.map((day) => (
        <div className="stack" key={day}>
          <span className="section-title">{DAY_LABEL[day]} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>{BODY_TAG[day]}</span></span>
          <div className="card" style={{ padding: '6px 16px' }}>
            {exercises.filter((e) => e.day === day).sort((a, b) => a.order - b.order).map((e) => (
              <button className="row row-btn" key={e.id} onClick={() => setOpenId(e.id)}>
                <span>{e.name}</span>
                <span className="muted">{e.steps[levels[e.id] ?? e.startLevel].name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function ExerciseDetail({ ex, level, onBack, onSaved }: { ex: Exercise; level: number; onBack: () => void; onSaved: (url: string) => void }) {
  const isDefault = ex.videoUrl === youtubeSearchUrl(ex.name);
  const [input, setInput] = useState(isDefault ? '' : ex.videoUrl);
  const [msg, setMsg] = useState<string>();

  const save = async (value: string) => {
    try {
      const url = await setVideoUrl(ex.id, value);
      onSaved(url);
      setInput(value.trim() ? url : '');
      setMsg(value.trim() ? '영상 링크를 저장했습니다.' : '유튜브 검색 링크로 되돌렸습니다.');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <>
      <div className="header">
        <button className="icon-btn" aria-label="뒤로" onClick={onBack}><Icon d={ICON.back} /></button>
        <div>
          <div className="sub">{DAY_LABEL[ex.day]} · 세트 사이 {ex.restSec}초 휴식</div>
          <h1>{ex.name}</h1>
        </div>
      </div>

      <a className="video" href={ex.videoUrl} target="_blank" rel="noreferrer">
        <div className="play"><svg width="22" height="22" viewBox="0 0 24 24" fill="var(--on-accent)" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></div>
        {isDefault ? '자세 영상 찾기 (유튜브 검색)' : '자세 영상 보기 (저장한 영상)'}
      </a>
      <p className="cues">{ex.cues}</p>

      <div className="stack">
        <span className="section-title">단계 <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>위가 쉬운 단계</span></span>
        <div className="card" style={{ padding: '6px 16px' }}>
          {ex.steps.map((s) => (
            <div className="row" key={s.level} style={{ gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{stepTarget(s)}{s.tempoNote && ` · ${s.tempoNote}`}</span>
              </div>
              {s.level === level && <span className="tag accent">지금 단계</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="stack">
        <label className="section-title" htmlFor="video-url">영상 링크 바꾸기</label>
        <span className="eyebrow">마음에 드는 유튜브 영상 주소를 붙여 넣으면 운동 중에도 이 영상이 열립니다.</span>
        <input id="video-url" className="input" type="url" inputMode="url" autoComplete="off"
          placeholder="https://www.youtube.com/watch?v=..." value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn secondary" onClick={() => save(input)} disabled={!input.trim()}>저장</button>
        {!isDefault && <button className="btn secondary" onClick={() => save('')}>유튜브 검색 링크로 되돌리기</button>}
        {msg && <span className="eyebrow" role="status">{msg}</span>}
      </div>
    </>
  );
}
