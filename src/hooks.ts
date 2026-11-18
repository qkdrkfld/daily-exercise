import { useEffect, useRef, useState } from 'react';

/** 주기적으로 현재 시각을 갱신. 타이머는 이 값과 "시작 시각"의 차이로 계산해서 화면이 꺼졌다 켜져도 정확하다 */
export function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** endsAt까지 남은 초. 0이 되면 신호를 한 번 보내고 onEnd 호출 */
export function useCountdown(endsAt: number | undefined, onEnd?: () => void) {
  const now = useNow();
  const remain = endsAt === undefined ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
  const fired = useRef<number | undefined>(undefined);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  useEffect(() => {
    if (endsAt !== undefined && remain === 0 && fired.current !== endsAt) {
      fired.current = endsAt;
      signal();
      onEndRef.current?.();
    }
  }, [endsAt, remain]);
  return remain;
}

/** 운동 중에는 화면을 켜 둔다. 다른 앱에 갔다 오면 잠금이 풀리므로 다시 요청 */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    const request = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen');
      } catch {
        // 지원하지 않거나 거부되면 그냥 넘어간다
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && request();
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release();
    };
  }, []);
}

type LatLon = { latitude: number; longitude: number };

/** 두 좌표 사이 거리(m), 하버사인 공식 */
export function distanceM(a: LatLon, b: LatLon) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/**
 * active인 동안 GPS 이동 거리(m)와 그 거리를 가는 데 걸린 시간(초)을 더한다. 둘 다 첫 위치부터 재서 페이스 = sec ÷ km.
 * 첫 위치를 받기 전에는 track이 undefined. 다시 켜지면 0부터
 */
export function useGpsDistance(active: boolean) {
  const [track, setTrack] = useState<{ meters: number; sec: number }>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setTrack(undefined);
    setFailed(false);
    if (!active) return;
    if (!navigator.geolocation) return setFailed(true);
    let last: LatLon | undefined;
    let firstAt = 0;
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setFailed(false);
        if (coords.accuracy > 30) return; // 오차가 큰 점은 버린다
        if (!last) {
          last = coords;
          firstAt = Date.now();
          return setTrack({ meters: 0, sec: 0 });
        }
        const d = distanceM(last, coords);
        if (d < 5) return; // shortcut: 제자리 흔들림을 5m 미만 이동으로 거름. 실기기에서 거리가 짧게 나오면 accuracy 기준으로 바꾸기
        last = coords;
        setTrack((t) => ({ meters: (t?.meters ?? 0) + d, sec: (Date.now() - firstAt) / 1000 }));
      },
      () => setFailed(true),
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);
  return { track, failed };
}

// shortcut: iOS는 진동 API가 없고, 사용자 터치 없이 소리가 막힐 수 있음. 실기기에서 안 들리면 터치 때 AudioContext를 미리 열어 두기
export function signal() {
  navigator.vibrate?.([200, 100, 200]);
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => ctx.close();
  } catch {
    // 소리를 낼 수 없는 환경
  }
}
