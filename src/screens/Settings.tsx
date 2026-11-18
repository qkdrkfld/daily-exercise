import { type ChangeEvent, useEffect, useState } from 'react';
import { db, exportJson, getSettings, importJson } from '../db';
import { toDateStr } from '../rules/routine';
import type { Settings as SettingsData } from '../types';
import { Icon, ICON } from './Icon';

export function Settings({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<SettingsData>();
  const [msg, setMsg] = useState<string>();

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  const toggleQuiet = async () => {
    const quietModeDefault = !settings.quietModeDefault;
    await db.settings.update('main', { quietModeDefault });
    setSettings({ ...settings, quietModeDefault });
  };
  const toggleGps = async () => {
    const gpsPace = !settings.gpsPace;
    await db.settings.update('main', { gpsPace });
    setSettings({ ...settings, gpsPace });
  };

  const exportFile = async () => {
    const file = new File([await exportJson()], `bodyweight-pt-${toDateStr(new Date())}.json`, { type: 'application/json' });
    // 홈 화면에 설치한 iOS 앱은 다운로드가 잘 안 돼서 공유 시트(파일에 저장)를 먼저 쓴다
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        setMsg('백업 파일을 만들었습니다.');
      } catch {
        // 공유 창을 닫은 경우
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg('백업 파일을 저장했습니다.');
  };

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 고를 수 있게
    if (!file || !confirm('지금 기록이 모두 지워지고 백업 파일 내용으로 바뀝니다. 가져올까요?')) return;
    try {
      await importJson(await file.text());
      setSettings(await getSettings());
      setMsg('백업 파일을 가져왔습니다.');
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  return (
    <>
      <div className="header">
        <button className="icon-btn" aria-label="뒤로" onClick={onBack}><Icon d={ICON.back} /></button>
        <h1>설정</h1>
      </div>

      <div className="stack">
        <span className="section-title">데이터 백업</span>
        <span className="eyebrow">기록은 이 휴대폰에만 저장됩니다. 휴대폰을 바꾸거나 앱을 지우기 전에 내보내 두세요.</span>
        <button className="btn secondary" onClick={exportFile}>JSON으로 내보내기</button>
        <label className="btn secondary">
          JSON 가져오기
          <input type="file" accept="application/json,.json" onChange={importFile} hidden />
        </label>
        {msg && <span className="eyebrow" role="status">{msg}</span>}
      </div>

      <div className="stack">
        <span className="section-title">인터벌</span>
        <div className="card" style={{ padding: '6px 16px' }}>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>저소음 모드 기본값</span>
              <span className="muted" style={{ fontSize: 12 }}>실내 HIIT에서 점프 동작을 소리가 덜 나는 동작으로 바꿔 시작합니다.</span>
            </div>
            <button className="choice chip" aria-pressed={settings.quietModeDefault} onClick={toggleQuiet}>
              {settings.quietModeDefault ? '켜짐' : '꺼짐'}
            </button>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>GPS 거리·페이스 표시</span>
              <span className="muted" style={{ fontSize: 12 }}>실외 달리기 중 GPS로 잰 거리와 페이스를 보여 줍니다. 기기마다 정확도가 달라 기록은 랩 버튼으로 합니다.</span>
            </div>
            <button className="choice chip" aria-pressed={!!settings.gpsPace} onClick={toggleGps}>
              {settings.gpsPace ? '켜짐' : '꺼짐'}
            </button>
          </div>
        </div>
      </div>

      <div className="stack">
        <span className="section-title">영상 링크</span>
        <span className="eyebrow">동작 사전에서 종목을 누르면 영상 링크를 바꿀 수 있습니다.</span>
      </div>
    </>
  );
}
