// HANDOFF.md 6장 운동 프로그램 시드 데이터
import type { DayType, Exercise, ExerciseStep, Settings } from '../types';

// 일요일 = 0 (Date.getDay 기준)
export const WEEKDAY_DAYTYPE: DayType[] = ['rest', 'legs', 'push', 'interval_short', 'pull', 'interval_long', 'active_rest'];

export const youtubeSearchUrl = (name: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}+${encodeURIComponent('자세')}`;

type StepSpec = [name: string, sets: number, repMin: number, repMax: number, extra?: Partial<ExerciseStep>];

function ex(
  id: string, name: string, day: DayType, order: number, restSec: number, cues: string,
  steps: StepSpec[], startLevel = 1, unit: 'reps' | 'sec' = 'reps', perSide = false,
): Exercise {
  return {
    id, name, day, order, restSec, cues, startLevel,
    videoUrl: youtubeSearchUrl(name),
    steps: steps.map(([stepName, sets, repMin, repMax, extra], level) => ({
      level, name: stepName, sets, repMin, repMax, unit, ...(perSide && { perSide }), ...extra,
    })),
  };
}

const SLOW5 = { tempoNote: '5초 천천히 내려오기' };

export const EXERCISES: Exercise[] = [
  // 월 · 하체
  ex('bulgarian_split_squat', '불가리안 스플릿 스쿼트', 'legs', 1, 90, '앞 무릎은 발끝 방향, 상체는 곧게 세웁니다.', [
    ['리버스 런지', 3, 10, 12],
    ['불가리안 스플릿 스쿼트', 3, 10, 12],
    ['3초 천천히 내려가기', 3, 10, 12, { tempoNote: '3초 천천히 내려가기' }],
  ], 1, 'reps', true),
  ex('sl_rdl', '싱글레그 루마니안 데드리프트', 'legs', 2, 60, '허리는 펴고 엉덩이를 뒤로 빼며 숙입니다.', [
    ['양발로 하기', 3, 10, 10],
    ['싱글레그 루마니안 데드리프트', 3, 10, 10],
    ['끝에서 2초 멈춤', 3, 10, 10, { tempoNote: '끝에서 2초 멈춤' }],
  ], 1, 'reps', true),
  ex('sl_hip_bridge', '싱글레그 힙브릿지', 'legs', 3, 60, '꼭대기에서 엉덩이를 조이고 허리를 꺾지 않습니다.', [
    ['양발 힙브릿지', 3, 12, 12],
    ['싱글레그 힙브릿지', 3, 12, 12],
    ['발을 의자에 올리기', 3, 12, 12],
  ], 1, 'reps', true),
  ex('sl_calf_raise', '싱글레그 카프레이즈', 'legs', 4, 45, '끝까지 올라가 잠깐 멈췄다 천천히 내려옵니다.', [
    ['양발로 하기', 3, 15, 15],
    ['싱글레그 카프레이즈', 3, 15, 15],
    ['계단 끝에서 깊게', 3, 15, 15],
  ], 1, 'reps', true),
  ex('plank', '플랭크', 'legs', 5, 45, '머리부터 발뒤꿈치까지 일직선을 유지합니다.', [
    ['무릎 플랭크', 3, 45, 45],
    ['플랭크', 3, 45, 45],
    ['팔을 앞으로 더 뻗기', 3, 45, 45],
  ], 1, 'sec'),

  // 화 · 밀기
  ex('ring_pushup', '링 푸시업', 'push', 1, 90, '링을 몸 쪽으로 붙이고 팔꿈치는 45도로 굽힙니다.', [
    ['링을 높이 (경사)', 4, 8, 12],
    ['링 푸시업', 4, 8, 12],
    ['링을 바닥 가까이', 4, 8, 12],
  ]),
  ex('ring_support_hold', '링 서포트 홀드', 'push', 2, 120, '팔을 끝까지 펴고 어깨를 내립니다.', [
    ['링 서포트 홀드', 3, 20, 20],
  ], 0, 'sec'),
  ex('ring_dip_negative', '링 딥스 네거티브', 'push', 3, 120, '어깨를 내린 채 천천히 내려옵니다.', [
    ['의자 딥스', 3, 8, 12],
    ['링 딥스 네거티브', 3, 3, 3, SLOW5],
    // shortcut: 딥스 단계의 목표 횟수(8)는 문서에 없어 레이더 목표치를 따름, 사용자 확인 후 조정
    ['링 딥스', 3, 2, 8, { fixedReps: true }],
  ]),
  ex('pike_pushup', '파이크 푸시업', 'push', 4, 90, '엉덩이를 높이 들고 머리는 손 앞쪽으로 내립니다.', [
    ['무릎 짚고 하기', 3, 8, 12],
    ['파이크 푸시업', 3, 8, 12],
    ['발을 의자에 올리기', 3, 8, 12],
  ]),
  ex('diamond_pushup', '다이아몬드 푸시업', 'push', 5, 60, '팔꿈치를 몸에 붙여 내려갑니다.', [
    ['무릎 대고 하기', 3, 10, 15],
    ['다이아몬드 푸시업', 3, 10, 15],
    ['3초 내려가기', 3, 10, 15, { tempoNote: '3초 내려가기' }],
  ]),
  ex('hollow_hold', '할로우 홀드', 'push', 6, 45, '허리가 바닥에서 뜨면 중단합니다.', [
    ['무릎 굽혀서', 3, 30, 30],
    ['할로우 홀드', 3, 30, 30],
    ['할로우 락 (흔들기)', 3, 30, 30],
  ], 1, 'sec'),

  // 목 · 당기기
  ex('pullup', '턱걸이', 'pull', 1, 120, '반동 없이, 내려올 때 팔을 끝까지 폅니다.', [
    ['점프해서 네거티브만', 5, 2, 2, SLOW5],
    ['턱걸이', 5, 2, 5, { fixedReps: true }],
  ]),
  ex('pullup_negative', '턱걸이 네거티브', 'pull', 2, 120, '턱이 봉 위에서 시작해 천천히 내려옵니다.', [
    ['턱걸이 네거티브', 3, 3, 3, SLOW5],
  ], 0),
  ex('ring_row', '링 로우', 'pull', 3, 90, '몸을 일직선으로 두고 링을 가슴까지 당깁니다.', [
    ['몸을 더 세우기', 4, 10, 12],
    ['링 로우', 4, 10, 12],
    ['몸을 수평에 가깝게', 4, 10, 12],
  ]),
  ex('chinup', '친업', 'pull', 4, 120, '손바닥이 몸 쪽, 반동 없이 당깁니다.', [
    ['네거티브 친업', 3, 3, 3, SLOW5],
    ['친업', 3, 3, 6, { fixedReps: true }],
  ]),
  ex('ring_bicep_curl', '링 바이셉 컬', 'pull', 5, 60, '팔꿈치 위치를 고정하고 이마 쪽으로 당깁니다.', [
    ['몸을 더 세우기', 3, 10, 12],
    ['링 바이셉 컬', 3, 10, 12],
    ['몸을 더 눕히기', 3, 10, 12],
  ]),
  ex('hanging_knee_raise', '행잉 니레이즈', 'pull', 6, 60, '몸이 흔들리지 않게 복부로 무릎을 올립니다.', [
    ['누워서 니레이즈', 3, 10, 15],
    ['행잉 니레이즈', 3, 10, 15],
    ['행잉 레그레이즈', 3, 10, 15],
  ]),
];

// 6.3 인터벌
export const INTERVAL = {
  interval_short: { distanceM: 400, joggingSec: 90, maxReps: 10, hiit: { workSec: 20, restSec: 10, rounds: 16 } },
  interval_long: { distanceM: 1000, joggingSec: 120, maxReps: 5, hiit: { workSec: 40, restSec: 20, rounds: 16 } },
} as const;
export const WARMUP_JOG_MIN = 10;
export const HIIT_MOVES = ['버피', '마운틴 클라이머', '하이니', '스케이터'];
export const QUIET_SUBSTITUTE: Record<string, string> = {
  버피: '스쿼트 스러스트',
  하이니: '빠른 제자리 걷기',
  스케이터: '점프 없는 사이드 런지',
};

// 6.4 스트레칭
export const WARMUP_STRETCH = ['팔 돌리기', '어깨 돌리기', '고관절 돌리기', '레그 스윙', '월드 그레이티스트 스트레치'];
export const COOLDOWN_STRETCH: Record<'push' | 'pull' | 'legs', string[]> = {
  push: ['가슴 (문틀 스트레칭)', '어깨 앞쪽', '삼두'],
  pull: ['철봉 매달리기 (데드행)', '광배근 (아이 자세)'],
  legs: ['햄스트링', '대퇴사두', '종아리', '엉덩이 (비둘기 자세)'], // 인터벌 날도 사용
};

export const DEFAULT_SETTINGS: Omit<Settings, 'programStartDate'> = {
  intervalShortReps: 6,
  intervalLongReps: 3,
  shortPaceSecPerKm: 290,
  longPaceSecPerKm: 305,
  quietModeDefault: false,
};
