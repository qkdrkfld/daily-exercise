import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_SETTINGS, EXERCISES, youtubeSearchUrl } from './data/program';
import { mondayOf, toDateStr } from './rules/routine';
import type { Assessment, CheckIn, Exercise, Settings, UserExerciseState, WorkoutSession } from './types';

export class PtDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>;
  userStates!: EntityTable<UserExerciseState, 'exerciseId'>;
  checkins!: EntityTable<CheckIn, 'date'>;
  sessions!: EntityTable<WorkoutSession, 'id'>;
  assessments!: EntityTable<Assessment, 'id'>;
  settings!: Dexie.Table<Settings, string>; // 키 'main' 한 줄만 쓴다

  constructor(name = 'bodyweight-pt') {
    super(name);
    this.version(1).stores({
      exercises: 'id, day',
      userStates: 'exerciseId',
      checkins: 'date',
      sessions: 'id, date',
      assessments: 'id, cycleIndex',
      settings: '',
    });
    // 첫 실행 때만 시드 데이터를 넣는다
    this.on('populate', (tx) => {
      tx.table('exercises').bulkAdd(EXERCISES);
      tx.table('userStates').bulkAdd(EXERCISES.map(initialState));
      const today = toDateStr(new Date());
      tx.table('settings').add({ ...DEFAULT_SETTINGS, programStartDate: mondayOf(today), installDate: today }, 'main');
    });
  }
}

export function initialState(ex: Exercise): UserExerciseState {
  const step = ex.steps[ex.startLevel];
  return {
    exerciseId: ex.id,
    currentLevel: ex.startLevel,
    ...(step.fixedReps && { targetRepsPerSet: step.repMin }),
    stallCount: 0,
  };
}

export const db = new PtDB();

export const getSettings = async (d: PtDB = db) => (await d.settings.get('main'))!;

// javascript: 같은 주소가 링크로 들어가지 않게 한다
const isHttp = (u: URL) => u.protocol === 'https:' || u.protocol === 'http:';

/** 영상 링크를 바꾼다. http(s) 주소만 받고, 빈 값이면 기본 유튜브 검색 링크로 되돌린다. 저장한 주소를 돌려준다 */
export async function setVideoUrl(id: string, input: string, d: PtDB = db): Promise<string> {
  const ex = (await d.exercises.get(id))!;
  let url = youtubeSearchUrl(ex.name);
  if (input.trim()) {
    let parsed: URL;
    try {
      parsed = new URL(input.trim());
    } catch {
      throw new Error('주소 형식이 아닙니다. https://로 시작하는 주소를 붙여 넣어 주세요.');
    }
    if (!isHttp(parsed)) throw new Error('http 또는 https 주소만 저장할 수 있습니다.');
    url = parsed.href;
  }
  await d.exercises.update(id, { videoUrl: url });
  return url;
}

export type BaselineKey = Exclude<keyof Assessment, 'id' | 'date' | 'cycleIndex' | 'notes'>;

/** 온보딩에서 입력한 현재 기록을 0회차 측정으로 저장한다. 빈 칸은 비워 두고, 형식이 틀리면 저장하지 않고 에러를 던진다 */
export async function saveBaseline(raw: Partial<Record<BaselineKey, string>>, date: string, d: PtDB = db): Promise<void> {
  const a: Assessment = { id: 'cycle-0', date, cycleIndex: 0 };
  for (const [k, v] of Object.entries(raw) as [BaselineKey, string][]) {
    const s = v.trim();
    if (!s) continue;
    const m = k === 'run3kSec' ? /^(\d{1,3}):([0-5]\d)$/.exec(s) : /^\d{1,4}$/.exec(s);
    if (!m) throw new Error('숫자만 적어 주세요. 3km는 25:30처럼 분:초로 적습니다.');
    a[k] = k === 'run3kSec' ? Number(m[1]) * 60 + Number(m[2]) : Number(s);
  }
  await d.assessments.put(a);
}

// --- 백업: JSON 내보내기 / 가져오기 ---

const TABLES = ['exercises', 'userStates', 'checkins', 'sessions', 'assessments'] as const;
const BACKUP_VERSION = 1;

export async function exportJson(d: PtDB = db): Promise<string> {
  const data = Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await d.table(t).toArray()])));
  return JSON.stringify({ app: 'bodyweight-pt', version: BACKUP_VERSION, exportedAt: Date.now(), settings: await getSettings(d), data });
}

/** 백업 파일 내용으로 전체 데이터를 교체한다. 형식이 틀리면 아무것도 바꾸지 않고 에러를 던진다 */
export async function importJson(json: string, d: PtDB = db): Promise<void> {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('JSON 파일을 읽을 수 없습니다.');
  }
  if (parsed?.app !== 'bodyweight-pt' || parsed.version !== BACKUP_VERSION) throw new Error('이 앱의 백업 파일이 아닙니다.');
  if (typeof parsed.settings?.programStartDate !== 'string') throw new Error('백업 파일에 설정이 없습니다.');
  for (const t of TABLES) {
    if (!Array.isArray(parsed.data?.[t])) throw new Error(`백업 파일에 ${t} 데이터가 없습니다.`);
  }
  for (const ex of parsed.data.exercises) {
    if (typeof ex?.videoUrl !== 'string' || !URL.canParse(ex.videoUrl) || !isHttp(new URL(ex.videoUrl))) {
      throw new Error('백업 파일에 잘못된 영상 링크가 있습니다.');
    }
  }
  // 한 트랜잭션으로 묶어서 중간에 실패하면 기존 데이터가 그대로 남는다
  await d.transaction('rw', [...TABLES, 'settings'], async () => {
    for (const t of TABLES) {
      await d.table(t).clear();
      await d.table(t).bulkAdd(parsed.data[t]);
    }
    await d.settings.put(parsed.settings, 'main');
  });
}
