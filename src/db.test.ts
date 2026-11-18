import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { EXERCISES } from './data/program';
import { db, exportJson, getSettings, importJson, PtDB, saveBaseline, setVideoUrl } from './db';
import { completeWorkout, finalizeAssessment } from './flow';
import { toDateStr } from './rules/routine';

it('영상 링크: https만 저장, 빈 값은 기본 검색 링크로 복원', async () => {
  const d = new PtDB('video');
  const ex = EXERCISES[0];
  expect(await setVideoUrl(ex.id, ' https://youtu.be/abc ', d)).toBe('https://youtu.be/abc');
  expect((await d.exercises.get(ex.id))!.videoUrl).toBe('https://youtu.be/abc');
  await expect(setVideoUrl(ex.id, 'javascript:alert(1)', d)).rejects.toThrow('http 또는 https');
  await expect(setVideoUrl(ex.id, 'youtube 영상', d)).rejects.toThrow('주소 형식');
  expect((await d.exercises.get(ex.id))!.videoUrl).toBe('https://youtu.be/abc');
  expect(await setVideoUrl(ex.id, '', d)).toBe(ex.videoUrl);
});

it('첫 실행 시드 + JSON 내보내기/가져오기 왕복', async () => {
  const src = new PtDB('src');
  expect(await src.exercises.count()).toBe(EXERCISES.length);
  expect((await getSettings(src)).installDate).toBe(toDateStr(new Date()));
  await src.sessions.add({ id: 's1', date: '2026-11-16', dayType: 'legs', volumeFactor: 1, startedAt: 1, sets: [], rpeByExercise: {}, completed: true });
  const json = await exportJson(src);

  const dst = new PtDB('dst');
  await importJson(json, dst);
  expect(await dst.sessions.toArray()).toEqual(await src.sessions.toArray());
  expect(await getSettings(dst)).toEqual(await getSettings(src));
});

it('잘못된 백업 파일은 거부하고 기존 데이터는 그대로 둔다', async () => {
  const d = new PtDB('keep');
  await d.sessions.add({ id: 'keep', date: '2026-11-16', dayType: 'legs', volumeFactor: 1, startedAt: 1, sets: [], rpeByExercise: {}, completed: true });
  await expect(importJson('{"app":"other"}', d)).rejects.toThrow('이 앱의 백업 파일이 아닙니다.');
  await expect(importJson('not json', d)).rejects.toThrow();
  expect(await d.sessions.count()).toBe(1);
});

it('4주 측정 저장: 한 번만 적용, 페이스 재계산, 리포트용 안내 저장', async () => {
  await db.settings.update('main', { programStartDate: '2026-11-16' });
  // 1주기 4주차 금요일 = 2026-12-11
  await db.sessions.put({ id: '2026-12-11', date: '2026-12-11', dayType: 'interval_long', volumeFactor: 0.6, startedAt: 1, sets: [], rpeByExercise: {}, completed: true, tests: { run3kSec: 900 } });
  expect(await finalizeAssessment(1, '2026-12-11')).toBe(true);
  const a = (await db.assessments.where('cycleIndex').equals(1).first())!;
  expect(a.run3kSec).toBe(900);
  expect(a.notes).toEqual(['긴 인터벌 5:00/km, 짧은 인터벌 4:50/km로 바꿉니다.']);
  expect(await getSettings()).toMatchObject({ longPaceSecPerKm: 300, shortPaceSecPerKm: 290 });

  await db.settings.update('main', { longPaceSecPerKm: 305 });
  expect(await finalizeAssessment(1, '2026-12-14')).toBe(true);
  expect((await getSettings()).longPaceSecPerKm).toBe(305); // 다시 적용하지 않음
  expect(await finalizeAssessment(2, '2027-01-11')).toBe(false); // 기록이 하나도 없는 주기는 저장하지 않음
});

it('4주차 근력 마무리: 측정 줄은 "측정", 일반 세트만 판정', async () => {
  await db.settings.update('main', { programStartDate: '2026-11-16' });
  // 1주기 4주차 목요일 = 2026-12-10 (당기기)
  await db.sessions.put({
    id: '2026-12-10', date: '2026-12-10', dayType: 'pull', volumeFactor: 0.6, startedAt: 1, rpeByExercise: {}, completed: false,
    sets: [{ exerciseId: 'pullup', level: 1, setIndex: 0, value: 6, isTest: true }],
  });
  const done = await completeWorkout('2026-12-10');
  expect(done.rows).toEqual([{ name: '턱걸이 최대 횟수', done: '6회', result: 'test' }]);
});

it('온보딩 기록: 빈 칸은 비워 두고 0회차로 저장, 형식이 틀리면 저장하지 않음', async () => {
  const d = new PtDB('baseline');
  await expect(saveBaseline({ pullupMax: '3', run3kSec: '25분' }, '2026-11-17', d)).rejects.toThrow('분:초');
  expect(await d.assessments.count()).toBe(0);
  await saveBaseline({ pullupMax: ' 3 ', dipMax: '1', pushupMax: '', run3kSec: '16:30' }, '2026-11-17', d);
  expect(await d.assessments.get('cycle-0')).toEqual({ id: 'cycle-0', date: '2026-11-17', cycleIndex: 0, pullupMax: 3, dipMax: 1, run3kSec: 990 });
});
