# Claude Code 세션 설정 핸드아웃 (다른 레포에 적용용)

> 이 문서를 **다른 레포의 Claude Code 세션에 그대로 붙여 넣어** 요청하면 됩니다.
> 아래 "요청문" 블록부터 끝까지가 Claude에게 전달할 내용입니다.
> 원본(설정이 완성된 레포): https://github.com/ChoisMath/MathChois (공개 레포)

---

## 요청문

이 레포에 Claude Code 클라우드 세션용 설정을 추가해 주세요. 설정의 원본은 공개 레포
`ChoisMath/MathChois`(기본 브랜치 `main`)에 있으며, 아래 항목을 **그대로 가져온 뒤 이 레포의
스택에 맞게 SessionStart 훅만 조정**하면 됩니다. 작업은 현재 세션에 지정된 브랜치에서 하고,
검증까지 끝나면 커밋·푸시해 주세요. 코드를 작성할 때는 최신 공식 문서를 확인해서 오류가 나지
않도록 해 주세요.

### 1. 가져올 항목

| 항목 | 원본 경로 | 비고 |
|---|---|---|
| 스킬 `frontend-design` | `.claude/skills/frontend-design/` | SKILL.md + LICENSE.txt |
| 스킬 `ui-ux-pro-max` | `.claude/skills/ui-ux-pro-max/` | SKILL.md, LICENSE, `data/`, `scripts/`(Python) 포함, 약 3.6MB |
| 스킬 `web-design-guidelines` | `.claude/skills/web-design-guidelines/` | SKILL.md |
| MCP 런처 | `.claude/mcp/launch.mjs` | playwright / chrome-devtools MCP 서버를 OS·클라우드 환경에 맞게 띄우는 스크립트 |
| MCP 서버 선언 | `.mcp.json` | `playwright`, `chrome-devtools` 두 서버 |

`.claude/settings.json`과 `.claude/hooks/session-start.sh`는 **복사하지 말고 아래 3·4절대로 새로
작성**하세요(원본에는 MathChois 전용 권한과 npm 명령이 들어 있습니다). `CLAUDE.md`,
`.claude/PROJECT_MAP.md`도 복사 대상이 아닙니다.

### 2. 파일 가져오기 (스파스 클론)

공개 레포라 인증 없이 받을 수 있습니다. 임시 디렉터리에 받아서 필요한 경로만 복사하세요.

```bash
TMP="$(mktemp -d)"
git clone --depth 1 --filter=blob:none --sparse https://github.com/ChoisMath/MathChois.git "$TMP/src"
git -C "$TMP/src" sparse-checkout set --no-cone \
  /.claude/skills/frontend-design/ \
  /.claude/skills/ui-ux-pro-max/ \
  /.claude/skills/web-design-guidelines/ \
  /.claude/mcp/launch.mjs \
  /.mcp.json

mkdir -p .claude/skills .claude/mcp .claude/hooks
cp -R "$TMP/src/.claude/skills/frontend-design"       .claude/skills/
cp -R "$TMP/src/.claude/skills/ui-ux-pro-max"         .claude/skills/
cp -R "$TMP/src/.claude/skills/web-design-guidelines" .claude/skills/
cp    "$TMP/src/.claude/mcp/launch.mjs"               .claude/mcp/
cp    "$TMP/src/.mcp.json"                            ./.mcp.json
rm -rf "$TMP"
```

이미 `.mcp.json`이 있으면 덮어쓰지 말고 `mcpServers`에 `playwright`, `chrome-devtools` 두 항목만
병합하세요. `.gitignore`에 `__pycache__/`와 `*.pyc`가 없으면 추가하세요(`ui-ux-pro-max`의
Python 스크립트 때문).

### 3. `.claude/settings.json`

파일이 없으면 아래 내용으로 생성하고, 있으면 세 키(`enabledMcpjsonServers`, `hooks.SessionStart`,
`enabledPlugins`)를 기존 내용에 **병합**하세요. 기존 `permissions`는 건드리지 않습니다.

```json
{
  "enabledMcpjsonServers": ["playwright", "chrome-devtools"],
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-start.sh"
          }
        ]
      }
    ]
  },
  "enabledPlugins": {
    "skill-creator@claude-plugins-official": true
  }
}
```

### 4. `.claude/hooks/session-start.sh` — 이 레포 스택에 맞게 작성

먼저 이 레포의 의존성 매니페스트(`package.json`, `pyproject.toml`/`requirements.txt`,
`Gemfile`, `go.mod`, `Cargo.toml` 등)와 README를 읽고 설치·린트·테스트 명령을 파악한 뒤,
아래 골격의 **"1. 의존성 설치" 부분만 바꿔서** 작성하세요. 원칙:

- 클라우드 세션(`CLAUDE_CODE_REMOTE=true`)에서만 실행, 로컬은 즉시 종료
- 동기 실행(async 사용 안 함), 멱등(여러 번 실행해도 안전), 비대화형
- 컨테이너 상태가 캐시되므로 `npm ci`보다 `npm install`처럼 캐시를 재사용하는 명령 선호
- 훅의 stdout은 Claude 컨텍스트에 들어가므로 설치 로그는 `>&2`로 stderr에 보냄
- Python 레포면 가상환경 생성 + `pip install -r requirements.txt`(또는 `pip install -e .`)를
  쓰고, 필요한 환경변수는 `$CLAUDE_ENV_FILE`에 `export ...` 줄로 추가

```bash
#!/bin/bash
# SessionStart hook — prepares Claude Code cloud sessions (claude.ai/code).
# Local sessions are left untouched.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# stdout of a SessionStart hook is added to Claude's context, so keep install logs on stderr.

# 1. 의존성 설치 — 이 레포에 맞게 수정 (예시: npm 프로젝트)
npm install --no-audit --no-fund >&2

# 2. Playwright: the container ships Chromium in /opt/pw-browsers and must not download
#    browsers (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1). The MCP launcher reads this variable.
if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi

# 3. Pre-fetch the project MCP servers (.mcp.json) so they start instantly.
#    A registry hiccup here should not block the session.
node .claude/mcp/launch.mjs --prefetch >&2 || echo "[session-start] MCP prefetch failed; servers will fetch on first use" >&2
```

작성 후 반드시 `chmod +x .claude/hooks/session-start.sh`.

Node가 없는 레포(순수 Python 등)라면 3번 블록은 `command -v node >/dev/null && ...`로
감싸서 node가 있을 때만 실행되게 하세요. 클라우드 컨테이너에는 보통 Node가 설치되어 있습니다.

### 5. 검증 (푸시 전에 반드시)

1. 훅 직접 실행: `CLAUDE_CODE_REMOTE=true ./.claude/hooks/session-start.sh` — 종료 코드 0, 의존성 설치 확인
2. 린터: 이 레포의 린트 명령을 파일 하나에 대해 실행
3. 테스트: 이 레포의 테스트 명령을 테스트 하나에 대해 실행
4. 스킬 인식: `ls .claude/skills` 에 세 디렉터리가 있고 각 `SKILL.md`의 frontmatter(`name`, `description`)가 그대로인지 확인
5. `ui-ux-pro-max` 스크립트 동작: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py --help` 가 에러 없이 출력되는지 확인

실패하면 훅이나 설정을 고치고 다시 검증하세요. 린트·테스트 자체가 없는 레포면 그 사실을 보고하세요.

### 6. 커밋·푸시

변경 파일(`.claude/settings.json`, `.claude/hooks/session-start.sh`, `.claude/mcp/launch.mjs`,
`.claude/skills/**`, `.mcp.json`, 필요 시 `.gitignore`)을 하나의 커밋으로 만들고 현재 세션의
지정 브랜치에 푸시하세요. PR은 제가 요청하기 전에는 만들지 마세요.

### 7. 마지막 보고 형식

- 변경 요약(생성·수정 파일 목록)
- 검증 결과: ① 훅 실행 ② 린터 ③ 테스트 ④ 스킬 인식 ⑤ ui-ux-pro-max 스크립트 — 각각 ✅/‼️ 와 세부 내용
- 훅은 동기 모드라는 점과, 비동기로 바꾸면 세션 시작은 빨라지지만 설치 완료 전에 Claude가 테스트를 돌릴 수 있다는 트레이드오프
- 기본 브랜치에 머지된 뒤부터 모든 새 클라우드 세션에 적용된다는 안내

---

## 참고: 이 설정이 하는 일 (사람용 메모)

- **세 스킬**은 레포 단위(`.claude/skills/`)로 커밋되어야 그 레포 세션에서 보입니다. 계정 플러그인
  (superpowers, anthropic-skills 등)은 별도 설정 없이 모든 세션에 들어옵니다.
- **SessionStart 훅**은 클라우드 세션 시작 시 의존성을 설치해 Claude가 바로 린트·테스트를 돌릴 수
  있게 합니다. 로컬 세션에서는 아무것도 하지 않습니다.
- **MCP 서버**(playwright, chrome-devtools)는 Claude가 브라우저를 띄워 화면을 확인할 때 씁니다.
  런처가 클라우드의 헤드리스 Chromium 경로와 Windows 로컬 환경을 모두 처리합니다. 필요 없는
  레포면 `.mcp.json`, `launch.mjs`, `enabledMcpjsonServers`, 훅의 2·3번 블록을 빼도 됩니다.
- 스킬 원본을 MathChois에서 갱신하면 같은 절차(2절)로 다시 복사해 동기화하면 됩니다.
