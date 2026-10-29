# Handout — 가는 펜 획 가시(바늘) 버그: 실제 DB 데이터로 진단 확정하기

작성: 2026-10-29, 세션 `claude/youthful-planck-bjwgau` (클라우드)에서 로컬 세션으로 넘기는 문서.
목적: 아래 작업은 **읽기 전용 확인**이다. DB·서비스·변수를 바꾸지 말 것.

## 1. 배경 (이미 밝혀진 것)

증상: 교사 필기 뷰어에서 가는 펜으로 쓰면, 그리는 동안은 매끈한데 펜을 떼는 순간 획 끝·모서리에
바늘 모양 가시와 점이 생긴다. 사용자는 "저장되면서 깨진다"고 느끼지만 저장과 무관하다.

원인 (코드 추적 + 합성 입력 재현으로 확인):

- 그리는 동안은 `packages/client/src/hooks/useWetInk.js` 오버레이가 `lib/wetInkStroke.js` 의
  자체 path 함수로 그린다 (정규식 없음) → 정상.
- 펜을 떼면 `makeFreedrawElement` 로 Excalidraw freedraw 요소가 되고, Excalidraw 0.18.1 의
  `getSvgPathFromStroke` 가 좌표를 소수점 2자리로 절삭하는 정규식을 적용한다:
  `/(\s?[A-Z]?,?-?[0-9]*\.[0-9]{0,2})(([0-9]|e|-)*)/g` → `"$1"`.
  2번 그룹이 지수 표기의 `e-12` 까지 지워 `3.1497e-12` 가 `3.14` 가 된다.
- 외곽선 좌표는 첫 점 기준 상대좌표라, 펜이 머무는 시작·모서리·끝에서 streamline 이 격자 좌표로
  수렴하며 획 가장자리가 원점의 행·열을 지날 때 `±(1e-7 ~ 1e-13)` 값이 생긴다. 그 점이 최대
  10 scene 단위 튀어 가는 펜(반지름 0.25)에서 가시가 된다. upstream master 도 같은 정규식.

수정 (커밋 `1d8d085`, 브랜치 `claude/youthful-planck-bjwgau`, 푸시 완료):

- `packages/client/vite/excalidrawPenTweak.js`: 빌드 시 번들의 정규식 2번 그룹을 `([0-9]*)` 로 치환
  (지수 보존). `vite.config.js` 는 이 모듈을 import.
- `packages/client/src/lib/excalidrawPenTweak.test.js`: 설치된 번들에 transform 적용 후 검증.
- `packages/client/scripts/freedraw-precision-check.mjs`: 저장된 `excalidraw_data` 진단 스크립트.
- 검증 완료: vitest 450 통과, eslint 통과, `vite build` 경고 없음, 빌드 청크에 새 정규식만 존재.

## 2. 이 세션이 할 일

실제 저장된 필기 데이터로 "지수 표기 좌표가 정말 생기는가"를 확인하고 결과를 보고한다.
합성 입력에서는 머무름 있는 획의 30~44% 에서 발생했다. 실제 데이터에서 영상에 나온 가는 펜 획들이
잡히면 진단 확정이다.

### 2-1. 브랜치 받기

```bash
git fetch origin claude/youthful-planck-bjwgau && git checkout claude/youthful-planck-bjwgau
npm install
```

### 2-2. DB 에서 필기 내보내기 (읽기 전용)

대상: 챕터 제목에 `AA20_0` 이 들어가는 챕터의 교사 필기 전체 (영상의 "AA20_0_미분 단원 도입",
1페이지 칠판 + 5페이지 흰 영역에 "가나다라…").

Railway Postgres 공개 접속 URL 은 `railway variables -s Postgres` 의 `DATABASE_PUBLIC_URL`
(프로젝트 ChoisClass, 환경 production, TCP 프록시 `yamabiko.proxy.rlwy.net:15002`).
URL 값은 문서·채팅·커밋에 적지 말 것.

```bash
psql "$DATABASE_PUBLIC_URL" -At -c "select json_agg(t) from (select n.excalidraw_data from teacher_notes n join pages p on p.id = n.page_id join chapters c on c.id = p.chapter_id where c.title like '%AA20_0%' order by n.updated_at desc) t" > notes.json
```

psql 이 없으면 `railway connect Postgres` 로 들어가 같은 쿼리를 `\o notes.json` 뒤에 실행해도 된다.
`notes.json` 은 커밋하지 말 것 (필기 데이터).

페이지별로 나누고 싶으면:

```sql
select c.title, p.position, p.id as page_id, n.updated_at,
       jsonb_array_length(n.excalidraw_data->'elements') as elements
from teacher_notes n join pages p on p.id = n.page_id join chapters c on c.id = p.chapter_id
where c.title like '%AA20_0%' order by p.position;
```

### 2-3. 진단 스크립트 실행

```bash
node packages/client/scripts/freedraw-precision-check.mjs notes.json
```

출력: 요소별 표(`id`, `strokeWidth`, `points`, `mangled` = 지수 표기 좌표 수, `maxJump` = 기존 정규식이
그 좌표를 옮기는 거리(scene 단위), `sample`) + 요약 한 줄
`freedraw N개 중 M개(x%)에 지수 표기 좌표 K개. 기존 정규식의 최대 좌표 튐: J scene 단위`.

### 2-4. (선택) 수정 전후를 눈으로 비교

로컬에서 빌드한 클라이언트로 같은 페이지를 열면 가시가 사라져야 한다 (저장 데이터는 그대로이고
그리는 단계만 바뀜). 서버·DB 가 로컬에 있을 때만.

```bash
npm run build && npm run start
```

## 3. 보고할 내용

1. 2-3 의 요약 줄과 표 (가는 펜 = `strokeWidth` 0.05~0.2 요소가 몇 개 잡혔는지).
2. 잡힌 요소가 하나도 없으면: `strokeWidth` 분포, `points` 개수, 그리고 `sample` 대신 요소 하나의
   `points` 앞 20개를 함께 보고 (정규식 외 다른 원인을 다시 봐야 함).
3. 2-4 를 했다면 수정 전/후 스크린샷.

## 4. 하지 말 것

- DB 쓰기, Railway 변수·서비스 변경, `main` 푸시.
- `notes.json` 이나 접속 URL 을 저장소·커밋·PR 본문에 넣는 것.
- 이 브랜치의 수정 코드를 바꾸는 것 (문제가 보이면 결과만 보고).

## 5. 참고 파일

- `packages/client/vite/excalidrawPenTweak.js` — 수정 본체 + 주석에 원인 설명
- `packages/client/src/lib/wetInkStroke.js` — 인라인 perfect-freehand 1.2.0, `getFreedrawOutline` export
- `packages/client/src/hooks/useWetInk.js` — 오버레이·commit 흐름
- `.claude/PROJECT_MAP.md` "Vite 빌드타임 transform" 항목
