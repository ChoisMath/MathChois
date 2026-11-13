import { useState } from 'react';
import { LEN, RATIOS, clampLen, MOTION_OPTS } from '@mathchois/shared';
import InfoTip from './InfoTip';

const LB = MOTION_OPTS.labels;

/** 이름 알약 + 두 칸 단추(방식·렌더링). extra = 단추 옆에 붙일 것(Remotion (i)) */
function SegRow({ name, label, options, value, onPick, extra }) {
  const seg = (
    <div className="ai-seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => { if (value !== v) onPick(v); }}>
          {text}
        </button>
      ))}
    </div>
  );
  return (
    <div className="ai-row is-choice" data-o={name}>
      <span className="ai-chip-l">{label}</span>
      {extra ? <div className="ai-segw">{seg}{extra}</div> : seg}
    </div>
  );
}

/** 방식 — 「내 주제에 맞게 | 예시 그대로」. 두 판이 있는 v2 틀만, 빈칸 목록 위에 */
export function StyleRow({ st, onOpt }) {
  return (
    <SegRow
      name="style"
      label={LB.style}
      options={[['b', LB.styleB], ['a', LB.styleA]]}
      value={st.style}
      onPick={(style) => onOpt({ style })}
    />
  );
}

/** 길이(초) — 숫자만. 최대를 넘기면 최대로 묶고 안내, 최소보다 짧으면 입력을 마칠 때 묶고 안내(오빠두 lenRow) */
function LenRow({ len, onLen }) {
  const [draft, setDraft] = useState(null); // 입력 중인 글(null = 지금 길이를 보인다)
  const [hint, setHint] = useState('');
  const apply = (raw, final) => {
    if (raw === '') {
      if (final) setDraft(null); else setDraft('');
      return;
    }
    const n0 = parseInt(raw, 10);
    let msg = '';
    if (n0 > LEN.max) msg = LB.lenMax.replace('{max}', String(LEN.max));
    else if (final && n0 < LEN.min) msg = LB.lenMin.replace('{min}', String(LEN.min));
    const n = clampLen(n0);
    setDraft(n0 > LEN.max || final ? null : raw);
    setHint(msg);
    if (n !== len) onLen(n);
  };
  return (
    <div className="ai-row is-len" data-o="len">
      <label className="ai-chip-l" htmlFor="ai-len-in">{LB.len}</label>
      <div className="ai-lenbox">
        <input
          id="ai-len-in"
          className="ai-in ai-num"
          type="number"
          inputMode="numeric"
          min={LEN.min}
          max={LEN.max}
          step={1}
          autoComplete="off"
          value={draft ?? String(len)}
          onChange={(e) => apply(e.target.value, false)}
          onBlur={(e) => apply(e.target.value, true)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply(e.currentTarget.value, true); }}
        />
        <span className="ai-unit">{LB.lenUnit}</span>
        {hint ? <span className="ai-hint" role="status">{hint}</span> : null}
      </div>
    </div>
  );
}

/** 화면 — 30fps 고정, 비율 6종을 네모 모양으로 고른다. 이름·해상도는 아래 한 줄 */
function RatioRow({ ratio, onOpt }) {
  const nameOf = (v) => {
    const r = LB.ratios.find((x) => x[0] === v);
    return r ? `${r[1]} ${r[0]}` : v;
  };
  const wh = RATIOS[ratio];
  const M = 20;
  return (
    <div className="ai-row is-ratio" data-o="ratio">
      <span className="ai-chip-l">{LB.ratio}</span>
      <div className="ai-rwrap">
        <div className="ai-ratios" role="group" aria-label={LB.ratio}>
          {LB.ratios.map(([v]) => {
            const [w, h] = RATIOS[v];
            return (
              <button
                key={v}
                type="button"
                className="ai-ratio"
                aria-pressed={ratio === v}
                aria-label={`${nameOf(v)} ${w}×${h}`}
                onClick={() => { if (ratio !== v) onOpt({ ratio: v }); }}
              >
                <span
                  className="ai-rshape"
                  aria-hidden="true"
                  style={{ width: w >= h ? M : Math.round((M * w) / h), height: h >= w ? M : Math.round((M * h) / w) }}
                />
                <span className="ai-rlab">{v}</span>
              </button>
            );
          })}
        </div>
        <span className="ai-rsub">{`${nameOf(ratio)} · ${wh[0]}×${wh[1]} · ${LB.fps}`}</span>
      </div>
    </div>
  );
}

/**
 * v2 틀의 고르기 줄(빈칸 목록 아래) — 길이 · 화면 · 렌더링(+ Remotion 라이선스 (i)) · 화면 글자 · 「옵션」 체크 셋.
 * 바꾸면 완성 프롬프트만 다시 그린다. 상태는 모든 스타일이 함께 쓴다.
 */
export default function OptionRows({ st, onOpt, onLen }) {
  const [rmPicked, setRmPicked] = useState(false); // Remotion 을 방금 골랐으면 안내를 바로 연다
  return (
    <>
      <LenRow len={st.len} onLen={onLen} />
      <RatioRow ratio={st.ratio} onOpt={onOpt} />
      <SegRow
        name="render"
        label={LB.render}
        options={[['hf', LB.renderHf], ['remotion', LB.renderRm]]}
        value={st.render}
        onPick={(render) => { setRmPicked(render === 'remotion'); onOpt({ render }); }}
        extra={st.render === 'remotion'
          ? <InfoTip name={LB.renderRm} text={LB.renderRmInfo} link={LB.renderRmLink} autoOpen={rmPicked} align="end" />
          : null}
      />
      <div className="ai-row is-lang" data-o="lang">
        <label className="ai-chip-l" htmlFor="ai-lang-sel">{LB.lang}</label>
        <select id="ai-lang-sel" className="ai-in ai-sel" value={st.lang} onChange={(e) => onOpt({ lang: e.target.value })}>
          {LB.langs.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
        </select>
      </div>
      <div className="ai-ogroup" id="ai-opts-h">{LB.opts}</div>
      <div className="ai-row is-flags" role="group" aria-labelledby="ai-opts-h">
        {['logo', 'sound', 'music'].map((key) => {
          const disabled = key === 'music' && !st.sound; // 배경 음악 = 사운드트랙을 만들 때만
          return (
            <div key={key} className={`ai-flagc${disabled ? ' is-off' : ''}`} data-o={key}>
              <label className="ai-flag">
                <input
                  type="checkbox"
                  className="ai-cb"
                  checked={!!st[key]}
                  disabled={disabled}
                  onChange={(e) => onOpt({ [key]: e.target.checked })}
                />
                {LB[key]}
              </label>
              <InfoTip name={LB[key]} text={LB[`${key}Info`]} />
            </div>
          );
        })}
      </div>
    </>
  );
}
