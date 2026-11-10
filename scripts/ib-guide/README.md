# IB교육과정 안내 — IA 작성 예시 올리기 (`npm run ib:push`)

IA 예시 PDF 가 든 폴더를 이 PC 에서 쪽마다 가로 1600px WebP 로 그린 뒤, 쪽 이미지와 목록(manifest)만 서버에 올린다.
**PDF 는 PC 밖으로 나가지 않는다.** 서버는 학생·교사가 볼 때마다 쪽 이미지에 이름 워터마크를 입혀 보낸다.

> PDF 와 `.ib-out/` 은 git 에 넣지 않는다. (`.gitignore` 에 `*.pdf`, `.ib-out/` 이 들어 있다.)

## 파일 이름 규칙

폴더 맨 위에 있는 `…ex<번호>_student.pdf`, `…ex<번호>_annotated.pdf`, `…ex<번호>_comments.pdf` 를 찾는다.

- 앞부분(`COMMON_1-29__` 등)은 자유. 대소문자, 끝의 ` (1)` 같은 꼬리표, `comment`(단수)는 상관없다.
- 번호는 1–99 의 한두 자리(`ex1` 과 `ex01` 은 같은 예시 `ex01`). 세 자리(`ex026`)는 규칙에 안 맞는다.
- 규칙에 안 맞는 PDF 는 `skip …` 으로 보여 주고 건너뛴다. 하위 폴더는 보지 않는다.
- 같은 예시·종류에 PDF 가 둘이면(`…ex26_student.pdf` 와 `…ex26_student (2).pdf`) 두 이름을 보여 주고 아무것도 올리지 않고 멈춘다 — 하나를 지우고 다시 실행.

## 처음 올리기

1. 서버(Railway) 변수에 `IB_MEDIA_UPLOAD_TOKEN` 을 넣는다 — 32자 이상, 예: `openssl rand -hex 32`. 넣고 나면 서버가 다시 시작된다.
2. 이 저장소에서 `npm install` (그림 변환에 쓰는 `pdfjs-dist`·`@napi-rs/canvas`·`sharp` 가 같이 깔린다).
3. Windows PowerShell 에서 저장소 루트로 가서:

   ```powershell
   $env:IB_PUSH_URL = "https://class.chois.pro"
   $env:IB_MEDIA_UPLOAD_TOKEN = "<Railway 에 넣은 값>"
   npm run ib:push -- --dir "G:\내 드라이브\2026 포산고등학교\IA\COMMON_1-29" --dry-run
   npm run ib:push -- --dir "G:\내 드라이브\2026 포산고등학교\IA\COMMON_1-29"
   ```

   - `--dir` 경로는 공백·한글이 있으니 **반드시 큰따옴표**로 감싼다.
   - `--dry-run` 은 그림까지 그려 보고 무엇을 올릴지(`would upload …`)만 보여 준다. 서버에는 아무것도 쓰지 않는다.
   - `IB_PUSH_URL` 을 빼면 `http://localhost:3001`(개발 서버)로 간다.
4. 끝에 `done — N examples, N pages, N uploaded, N unchanged` 가 나오면 완료.

오류 메시지:

- `401 IB_MEDIA_UPLOAD_TOKEN was rejected` — PC 의 값이 Railway 값과 다르다.
- `503 upload is disabled on the server` — 서버에 토큰이 없거나 32자보다 짧다.
- `FAILED …` 가 하나라도 있으면 manifest 를 올리지 않고 종료 코드 1 로 끝난다. 다시 실행하면 못 올린 파일만 다시 올린다.

## 다시 실행·예시 추가·빼기

- 언제 다시 실행해도 안전하다. PDF 가 지난번과 같으면(sha256 비교) 다시 그리지 않고, 서버와 내용이 같은 쪽은 다시 올리지 않는다.
- **추가·교체**: 폴더에 PDF 를 넣거나 바꾸고 다시 실행.
- **빼기**: 폴더에서 PDF 를 지우고 다시 실행 → 목록(manifest)에서 빠져 화면에서 사라진다. 서버 Volume 의 쪽 파일은 남지만 목록에 없는 쪽은 내보내지 않는다.
- **한 예시만**: `--only ex26` — 그 예시만 다시 그리고 올린다. 다른 예시는 지난번에 그려 둔 `.ib-out/` 결과로 목록에 그대로 남는다
  (지난번 뒤에 바뀐 다른 PDF 는 반영되지 않으니, 여러 개를 바꿨으면 `--only` 없이 실행).

## 예시 제목·설명 (`examples.json`, 선택)

PDF 폴더에 `examples.json` 을 두면 목록 카드에 제목과 한 줄 설명이 붙는다. 없으면 "예시 26" 으로만 보인다.

```json
{
  "ex26": { "title": "모기 개체 수의 로지스틱 모델", "note": "7점 받은 예시 — 기준 D 참고" },
  "ex03": { "title": "롤러코스터 곡선 설계" }
}
```

- 제목 200자, 설명 500자까지. 둘 다 생략 가능.
- 폴더에 PDF 가 없는 번호는 경고(`… has no PDF in the folder — ignored`)를 내고 무시한다.
- 제목만 고친 경우에도 다시 실행하면 manifest 만 새로 올라간다.

## 말풍선 메모 경고

```
⚠ <파일>: 말풍선 메모 <n>개는 쪽 이미지에 글이 보이지 않습니다 — PDF에서 메모를 본문에 인쇄(Flatten)한 뒤 다시 올리세요.
```

PDF 의 메모 아이콘·팝업 메모(Acrobat 의 "메모 추가", 형광펜에 단 댓글 등)는 클릭해야 열리는 글이라 쪽 이미지에는 글이 찍히지 않는다.
학생에게 그 글이 보여야 하면 PDF 편집기의 주석 병합(Flatten) 또는 주석을 본문에 넣어 인쇄하기(PDF 로 저장)로
메모가 본문에 찍힌 PDF 를 만든 뒤 원래 파일과 바꿔 두고 다시 실행한다. 경고는 업로드를 막지 않는다.

## 요청 한도

서버는 IP 당 분당 300 요청까지만 받는다. 쪽이 많으면 `429 …: retrying in …s` 가 보일 수 있는데, 스크립트가 기다렸다가 이어서 올린다(그대로 두면 된다).

## 만들어지는 것

- `.ib-out/ia/<exId>/<student|annotated|comments>/001.webp …` — 쪽 이미지(가로 1600px, WebP 품질 80) + `.source.json`(원본 sha256·쪽 수·메모 수).
- `.ib-out/manifest/ia.json` — 서버에 올리는 목록. 서버 `<VOLUME_PATH>/ib-guide/` 와 같은 배치다.
- `.ib-out/` 은 지워도 된다(다음 실행에서 다시 그린다).
