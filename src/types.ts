// HANDOFF.md 7장 데이터 모델. "추가:" 표시는 규칙 구현에 필요해서 더한 필드.

export type DayType = 'legs' | 'push' | 'pull' | 'interval_short' | 'interval_long' | 'active_rest' | 'rest';
export type Rpe = 'easy' | 'ok' | 'hard'; // 쉬웠음 / 적당함 / 힘들었음
export type SorePart = 'chest' | 'shoulder' | 'arm' | 'back' | 'legs';

export interface Exercise {
  id: string;
  name: string;
  day: DayType;
  order: number;
  restSec: number;
  cues: string;
  videoUrl: string; // 기본은 유튜브 검색 링크, 사용자가 수정 가능
  steps: ExerciseStep[]; // 단계 사다리, 쉬운 것부터
  startLevel: number; // 추가: 처음 시작하는 단계
}

export interface ExerciseStep {
  level: number; // 0이 가장 쉬움
  name: string;
  sets: number;
  repMin: number; // 시간 종목이면 초
  repMax: number;
  unit: 'reps' | 'sec';
  perSide?: boolean;
  tempoNote?: string;
  fixedReps?: boolean; // 추가: 세트당 고정 횟수형 (repMin = 시작 횟수, repMax = 목표 횟수)
}

export interface UserExerciseState {
  exerciseId: string;
  currentLevel: number;
  targetRepsPerSet?: number;
  stallCount: number;
}

export interface CheckIn {
  date: string; // 'YYYY-MM-DD'
  fatigue: 1 | 2 | 3 | 4 | 5;
  soreParts: SorePart[];
  pain: boolean;
  verdict: 'full' | 'reduced' | 'active_rest';
}

export interface SetLog {
  exerciseId: string;
  level: number;
  setIndex: number;
  value: number; // 각 다리 종목은 덜 한 쪽 횟수
  valueRight?: number; // 각 다리 종목의 측정 세트만: value = 왼쪽, valueRight = 오른쪽
  isTest?: boolean;
}

export interface WorkoutSession {
  id: string;
  date: string;
  dayType: DayType;
  location?: 'outdoor' | 'indoor';
  quietMode?: boolean;
  volumeFactor: number;
  startedAt: number;
  endedAt?: number;
  sets: SetLog[];
  rpeByExercise: Record<string, Rpe>;
  intervalLaps?: { index: number; seconds: number; distanceM?: number }[];
  tests?: Pick<Assessment, 'deadHangSec' | 'run3kSec' | 'burpee3minCount'>; // 추가: 근력 세트 밖에서 재는 4주차 측정값
  completed: boolean;
}

export interface Assessment {
  id: string;
  date: string;
  cycleIndex: number; // 0은 온보딩 입력값
  pullupMax?: number;
  dipMax?: number;
  pushupMax?: number;
  splitSquatMaxLeft?: number;
  splitSquatMaxRight?: number;
  hollowHoldSec?: number;
  deadHangSec?: number;
  run3kSec?: number;
  burpee3minCount?: number;
  notes?: string[]; // 추가: 측정 후 자동으로 바뀐 내용 (리포트 "다음 4주 자동 조정")
}

export interface Settings {
  programStartDate: string; // 설치한 주의 월요일
  installDate?: string; // 추가: 실제 설치일. 이전 날은 빠진 날로 세지 않는다 (8.4). 없으면 programStartDate
  intervalShortReps: number;
  intervalLongReps: number;
  shortPaceSecPerKm: number;
  longPaceSecPerKm: number;
  quietModeDefault: boolean;
  gpsPace?: boolean; // 추가: 실외 인터벌에서 GPS 거리·페이스 표시 (10장 9번, 선택 기능). 기록은 랩 버튼으로만
  declinedCycleIndex?: number; // 추가: 측정에서 하락이 나와 첫 주 0.8을 적용할 주기 번호
}
