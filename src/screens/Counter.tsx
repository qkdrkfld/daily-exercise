/** 횟수/초 입력. 초 단위는 5초씩 바뀐다 */
export function Counter({ value, onChange, sec, caption }: { value: number; onChange: (v: number) => void; sec?: boolean; caption: string }) {
  const unit = sec ? '초' : '회';
  const step = sec ? 5 : 1;
  return (
    <div className="counter">
      <button aria-label={`${step}${unit} 빼기`} onClick={() => onChange(Math.max(0, value - step))}>−</button>
      <div className="value">
        <b>{value}</b>
        <span className="muted" style={{ fontSize: 13 }}>{caption}</span>
      </div>
      <button aria-label={`${step}${unit} 더하기`} onClick={() => onChange(value + step)}>+</button>
    </div>
  );
}
