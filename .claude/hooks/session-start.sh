#!/bin/bash
# SessionStart hook — prepares Claude Code cloud sessions (claude.ai/code).
# Local sessions are left untouched.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# stdout of a SessionStart hook is added to Claude's context, so keep install logs on stderr.

# 1. Workspace dependencies (shared / client / server). `npm install` (not `npm ci`) so the
#    cached container state is reused between sessions.
npm install --no-audit --no-fund >&2

# 2. Playwright: the container ships Chromium in /opt/pw-browsers and must not download
#    browsers (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1). playwright.config.ts and the MCP launcher
#    read this variable to use it.
if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi

# 3. Pre-fetch the project MCP servers (.mcp.json) so they start instantly.
#    A registry hiccup here should not block the session.
node .claude/mcp/launch.mjs --prefetch >&2 || echo "[session-start] MCP prefetch failed; servers will fetch on first use" >&2

# 4. User-level skills (~/.claude/skills) that are not committed to this repo. Each one is installed
#    only when missing, so a resumed/cached container skips the network. A failed install only warns:
#    the session still starts, and the next session start retries.
SKILLS_DIR="$HOME/.claude/skills"
mkdir -p "$SKILLS_DIR"

# 4a. taste-skill (Leonxlnx/taste-skill → skill "design-taste-frontend") through the skills CLI
#     (vercel-labs/skills), pinned so a CLI release cannot change the flags under us.
if [ ! -f "$SKILLS_DIR/design-taste-frontend/SKILL.md" ]; then
  DO_NOT_TRACK=1 npx -y skills@1.7.6 add Leonxlnx/taste-skill -g -a claude-code -y --copy >&2 \
    || echo "[session-start] taste-skill install failed" >&2
fi

# 4b. motionsites (xiiiabu/motionsites.ai) is a prompt library, not a skill (no SKILL.md, ~1.6GB with
#     preview videos), so `skills add` rejects it. Sparse-clone only README/LICENSE/prompts (<1MB) and
#     add the wrapper SKILL.md kept in this repo. Cloned into a temp dir first so a failed clone never
#     leaves a half-made skill behind.
MOTION_DIR="$SKILLS_DIR/motionsites"
if [ ! -d "$MOTION_DIR/prompts" ]; then
  tmp="$(mktemp -d)"
  if git clone -q --depth 1 --filter=blob:none --sparse https://github.com/xiiiabu/motionsites.ai.git "$tmp/repo" >&2 \
    && git -C "$tmp/repo" sparse-checkout set --no-cone '/README.md' '/LICENSE' '/prompts/' >&2; then
    rm -rf "$MOTION_DIR"
    mv "$tmp/repo" "$MOTION_DIR"
  else
    echo "[session-start] motionsites clone failed" >&2
  fi
  rm -rf "$tmp"
fi
if [ -d "$MOTION_DIR/prompts" ]; then
  cp .claude/hooks/skills/motionsites/SKILL.md "$MOTION_DIR/SKILL.md"
fi
