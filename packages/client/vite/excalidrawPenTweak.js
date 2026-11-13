/*
 * Excalidraw 0.18 은 freedraw 외곽선(perfect-freehand) 파라미터를 하드코딩하고 외부로 노출하지 않는다
 * (getFreeDrawSvgPath). 태블릿 튜닝(tools/pen-playground.html)으로 확정한 젤펜 값으로 옵션 객체 전체를 치환한다:
 * simulatePressure false, size ×10(슬라이더 0.2 기본 → 화면 2px — 놀이터 size 2.0), thinning 0(완전 균일),
 * smoothing .12, streamline .16(펜촉 추적 지연 최소화), linear easing, taper 0 + rounded cap.
 * ※ wet-ink 미리보기(lib/wetInkStroke.js PF_BASE)도 동일 값이어야 미리보기=commit 이 된다.
 * 번들된 dist 청크를 빌드 시 치환한다(patch-package 대신 — Dockerfile 이 npm ci --ignore-scripts 라 postinstall 미실행).
 * 패턴은 원본 freedraw 옵션 객체 전체에 앵커되며 element 변수(e)는 \1 로 보존한다.
 *
 * 두 번째 치환: Excalidraw 의 getSvgPathFromStroke 는 TO_FIXED_PRECISION 정규식으로 path 좌표를 소수점 2자리로
 * 절삭하는데, 2번 그룹 (([0-9]|e|-)*) 이 지수 표기의 "e-12" 까지 지워 3.1497e-12 를 3.14 로 만든다.
 * 외곽선 좌표는 첫 점 기준 상대좌표라 획의 가장자리가 원점의 행·열을 지날 때(펜이 머무는 시작·모서리·끝)
 * 0 에 가까운 값이 생기고, 그 점이 최대 10 scene 단위 튀어 가는 펜에서 바늘 모양 가시가 된다(wet-ink 미리보기는
 * 자체 path 함수라 정상, 확정 요소만 깨짐). 2번 그룹을 [0-9]* 로 바꿔 가수만 자르고 지수는 남긴다
 * (3.14e-12 → SVG path 에서 유효한 수). upstream master 도 같은 정규식이라 버전 업으로는 해결되지 않는다.
 */
export function excalidrawPenTweak() {
  const PRECISION_RE = '/(\\s?[A-Z]?,?-?[0-9]*\\.[0-9]{0,2})(([0-9]|e|-)*)/g'
  const PRECISION_FIX = '/(\\s?[A-Z]?,?-?[0-9]*\\.[0-9]{0,2})([0-9]*)/g'
  // 옵션 객체 뒤의 `};return Om(vm(t,n))` 까지 잡아 size 정규화를 심는다(식별자는 난독화 산물이라 캡처).
  const FREEDRAW_OPTS = /simulatePressure:\s*(\w+)\.simulatePressure,\s*size:\s*\1\.strokeWidth\s*\*\s*4\.25,\s*thinning:\s*0?\.6,\s*smoothing:\s*0?\.5,\s*streamline:\s*0?\.5,\s*easing:\s*\w+\s*=>\s*Math\.sin\([^)]*\)\s*,\s*last:\s*!!\s*\1\.lastCommittedPoint\s*\};\s*return\s+(\w+)\((\w+)\((\w+),\s*(\w+)\)\)/
  // perfect-freehand 의 절대 상수(끝 3단위 생략 등) 때문에 scene 단위가 작은 고배율 화면에서 획이 무너진다 —
  // src/lib/wetInkStroke.js getFreedrawOutlineNormalized 와 같은 변환: size 가 10 이 되도록 점을 키워 계산 후 되돌림.
  const REPLACEMENT =
    'simulatePressure:false,size:$1.strokeWidth*10,thinning:0,smoothing:.12,streamline:.16,' +
    'easing:t=>t,start:{taper:0,cap:true},end:{taper:0,cap:true},last:!!$1.lastCommittedPoint};' +
    'var k=10/$5.size;$5.size=10;return $2($3(__mcR($4,2*10/k).map(p=>[p[0]*k,p[1]*k,p[2]]),$5).map(p=>[p[0]/k,p[1]/k]))'
  // 미세 역행 점 제거(src/lib/penSamples.js dropMicroReversals 와 동일, 임계값 = size × RENDER_REVERSAL_FACTOR(2)):
  // 진행 방향과 반대로 임계값보다 짧게 물러난 점은 perfect-freehand 가 되돌림으로 보고 부채꼴 캡을 그려
  // 가는 획에 흰 구멍·끊김을 만든다(iPad Safari coalesced 샘플 순서 뒤섞임, 2026-10-30). 청크 맨 앞에 정의를 넣는다.
  const MCR_DEF =
    'var __mcR=function(a,s){if(!(s>0)||a.length<3)return a;var o=[],i,p,q,d,x,y,l;' +
    'for(i=0;i<a.length;i++){p=a[i];l=o.length;if(l>=2){q=o[l-1];d=o[l-2];x=p[0]-q[0];y=p[1]-q[1];' +
    'if(x*(q[0]-d[0])+y*(q[1]-d[1])<0&&x*x+y*y<s*s)continue}o.push(p)}return o};\n'
  let applied = 0
  let precisionApplied = 0
  return {
    name: 'excalidraw-pen-tweak',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@excalidraw/excalidraw')) return null
      let out = code
      if (FREEDRAW_OPTS.test(out)) {
        applied += 1
        out = MCR_DEF + out.replace(FREEDRAW_OPTS, REPLACEMENT)
      }
      if (out.includes(PRECISION_RE)) {
        precisionApplied += 1
        out = out.replace(PRECISION_RE, PRECISION_FIX)
      }
      return out === code ? null : out
    },
    buildEnd() {
      if (applied === 0) {
        this.warn('[excalidraw-pen-tweak] freedraw 옵션 패턴 미발견 — Excalidraw 버전 변경 확인 필요(streamline 패치 미적용)')
      }
      if (precisionApplied === 0) {
        this.warn('[excalidraw-pen-tweak] TO_FIXED_PRECISION 정규식 미발견 — Excalidraw 버전 변경 확인 필요(가는 펜 가시 패치 미적용)')
      }
    },
  }
}
