# PWA Install Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome/Edge의 "홈 화면에 추가"로 ChoisClass 웹앱이 설치 가능하게 하고, 설치 후 standalone 창으로 독립 실행되도록 한다.

**Architecture:** `packages/client/public/`에 manifest.webmanifest, 3종 PNG 아이콘, 최소 Service Worker(fetch 핸들러 없음)를 추가한다. `index.html`에 manifest/theme-color/apple-touch-icon 링크 태그를 추가하고, `main.jsx`에서 production 빌드에 한해 SW를 등록한다. fetch 가로채기를 하지 않으므로 Socket.IO/JWT/Excalidraw 로딩 등 기존 네트워크 흐름에 간섭이 없다.

**Tech Stack:** Vite 7 + React 19 (기존), `sharp` (devDependency, 아이콘 생성 1회성 스크립트용), Web App Manifest, Service Worker API.

**Spec:** `docs/superpowers/specs/2026-04-12-pwa-install-support-design.md`

---

## File Structure

**Create:**
- `packages/client/scripts/generate-pwa-icons.mjs` — favicon.svg → PNG 3종 생성 스크립트 (1회성)
- `packages/client/public/manifest.webmanifest` — PWA 메타데이터
- `packages/client/public/sw.js` — 최소 Service Worker
- `packages/client/public/icon-192.png` — 192×192 아이콘 (스크립트 산출물)
- `packages/client/public/icon-512.png` — 512×512 아이콘 (스크립트 산출물)
- `packages/client/public/icon-maskable-512.png` — 512×512 maskable 아이콘 (스크립트 산출물)

**Modify:**
- `packages/client/package.json` — `sharp` devDependency + `generate:pwa-icons` 스크립트 추가
- `packages/client/index.html` — manifest/theme-color/apple-touch-icon 링크 추가
- `packages/client/src/main.jsx` — production-only SW 등록 블록 추가

---

### Task 1: Add `sharp` devDependency and icon-generation script entry

**Files:**
- Modify: `packages/client/package.json`

- [ ] **Step 1: Install sharp as devDependency**

Run from repo root:
```bash
npm install --save-dev --workspace=@mathchois/client sharp
```

Expected: `sharp` appears in `packages/client/package.json` under `devDependencies`. Installation completes without errors.

- [ ] **Step 2: Add `generate:pwa-icons` script to packages/client/package.json**

Modify the `"scripts"` block in `packages/client/package.json` to add one line. Final block should look like:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "lint": "eslint .",
  "generate:pwa-icons": "node scripts/generate-pwa-icons.mjs"
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/package.json package-lock.json
git commit -m "chore(client): add sharp devDep + generate:pwa-icons script"
```

---

### Task 2: Write the icon generation script

**Files:**
- Create: `packages/client/scripts/generate-pwa-icons.mjs`

- [ ] **Step 1: Create the script file**

Create `packages/client/scripts/generate-pwa-icons.mjs` with the exact content below:

```js
// 1회성 아이콘 생성 스크립트
// favicon.svg를 읽어 PWA에 필요한 PNG 3종을 public/ 에 생성한다.
// 실행: npm run generate:pwa-icons (packages/client 디렉터리에서)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');

const SVG_PATH = resolve(publicDir, 'favicon.svg');
const OUT_192 = resolve(publicDir, 'icon-192.png');
const OUT_512 = resolve(publicDir, 'icon-512.png');
const OUT_MASKABLE = resolve(publicDir, 'icon-maskable-512.png');

async function main() {
  const svgBuffer = await readFile(SVG_PATH);

  // 일반 아이콘: 단순 래스터화
  await sharp(svgBuffer, { density: 512 })
    .resize(192, 192, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(OUT_192);

  await sharp(svgBuffer, { density: 512 })
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(OUT_512);

  // Maskable 아이콘: 512x512 흰 배경 + 중앙 80% 크기로 SVG 배치 (안전 영역 20% 패딩)
  const INNER = Math.round(512 * 0.8); // 410
  const innerPng = await sharp(svgBuffer, { density: 512 })
    .resize(INNER, INNER, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  const canvas = sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  const offset = Math.round((512 - INNER) / 2);
  await canvas
    .composite([{ input: innerPng, left: offset, top: offset }])
    .png()
    .toFile(OUT_MASKABLE);

  console.log('Generated:');
  console.log('  ', OUT_192);
  console.log('  ', OUT_512);
  console.log('  ', OUT_MASKABLE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script**

From repo root:
```bash
npm run generate:pwa-icons --workspace=@mathchois/client
```

Expected output:
```
Generated:
   .../packages/client/public/icon-192.png
   .../packages/client/public/icon-512.png
   .../packages/client/public/icon-maskable-512.png
```

- [ ] **Step 3: Verify the 3 PNG files exist**

```bash
ls -la packages/client/public/icon-*.png
```

Expected: 3 files listed (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`), each non-zero size.

- [ ] **Step 4: Commit script and generated icons**

```bash
git add packages/client/scripts/generate-pwa-icons.mjs packages/client/public/icon-192.png packages/client/public/icon-512.png packages/client/public/icon-maskable-512.png
git commit -m "feat(client): add PWA icon generation script and generated PNGs"
```

---

### Task 3: Create manifest.webmanifest

**Files:**
- Create: `packages/client/public/manifest.webmanifest`

- [ ] **Step 1: Create the manifest file with exact content**

Create `packages/client/public/manifest.webmanifest`:

```json
{
  "name": "ChoisClass - 수학 학습 플랫폼",
  "short_name": "ChoisClass",
  "description": "교사와 학생을 위한 수학 학습 플랫폼",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "lang": "ko",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: Validate JSON syntax**

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('packages/client/public/manifest.webmanifest','utf8')).name)"
```

Expected output: `ChoisClass - 수학 학습 플랫폼`

- [ ] **Step 3: Commit**

```bash
git add packages/client/public/manifest.webmanifest
git commit -m "feat(client): add PWA manifest.webmanifest"
```

---

### Task 4: Create minimal Service Worker

**Files:**
- Create: `packages/client/public/sw.js`

- [ ] **Step 1: Create sw.js with minimal handlers only**

Create `packages/client/public/sw.js` with exact content:

```js
// 최소 Service Worker — PWA 설치 조건만 충족하고 네트워크에 간섭하지 않는다.
// fetch 핸들러 의도적으로 없음: 모든 요청은 네트워크로 직행한다.
// Socket.IO / API / 이미지 로딩 등 기존 흐름과 완전 분리.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
```

- [ ] **Step 2: Verify file exists and is syntactically valid JS**

```bash
node --check packages/client/public/sw.js
```

Expected: no output (success). Non-zero exit = syntax error.

- [ ] **Step 3: Commit**

```bash
git add packages/client/public/sw.js
git commit -m "feat(client): add minimal Service Worker (no fetch handler)"
```

---

### Task 5: Update index.html with PWA meta tags

**Files:**
- Modify: `packages/client/index.html`

- [ ] **Step 1: Add manifest, theme-color, apple-touch-icon tags**

In `packages/client/index.html`, find the existing line:

```html
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

Immediately after that line, add three new lines so the block becomes:

```html
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#ffffff" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
```

- [ ] **Step 2: Build the client to verify no HTML parse issues**

From repo root:
```bash
npm run build --workspace=@mathchois/client
```

Expected: build succeeds. `dist/index.html` contains the new tags, and `dist/` includes `manifest.webmanifest`, `sw.js`, and the 3 icon PNGs (copied from `public/`).

- [ ] **Step 3: Verify the manifest and icons are in the build output**

```bash
ls packages/client/dist/manifest.webmanifest packages/client/dist/sw.js packages/client/dist/icon-*.png
```

Expected: 5 files listed.

- [ ] **Step 4: Commit**

```bash
git add packages/client/index.html
git commit -m "feat(client): link PWA manifest, theme-color, apple-touch-icon in index.html"
```

---

### Task 6: Register Service Worker in main.jsx (production only)

**Files:**
- Modify: `packages/client/src/main.jsx`

- [ ] **Step 1: Append SW registration block**

Replace the entire contents of `packages/client/src/main.jsx` with:

```jsx
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode는 Excalidraw 내부 class 컴포넌트와 호환되지 않아 제거
createRoot(document.getElementById('root')).render(<App />)

// PWA Service Worker 등록 — production 빌드에서만
// dev 모드에서는 Vite HMR과 간섭 피하기 위해 등록하지 않는다.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW 등록 실패는 앱 동작을 막지 않도록 silent
    });
  });
}
```

- [ ] **Step 2: Build and verify no errors**

```bash
npm run build --workspace=@mathchois/client
```

Expected: build succeeds with no new warnings/errors.

- [ ] **Step 3: Grep the built bundle to confirm registration code is included**

```bash
grep -r "serviceWorker.register" packages/client/dist/assets/ | head -5
```

Expected: at least one match (minified form may look like `.serviceWorker.register("/sw.js")`).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/main.jsx
git commit -m "feat(client): register Service Worker in production build"
```

---

### Task 7: Dev-mode smoke test (SW must NOT register)

**Files:** none (verification only)

- [ ] **Step 1: Start dev server in background**

```bash
npm run dev --workspace=@mathchois/client
```

Wait until Vite prints `Local: http://localhost:3000/`.

- [ ] **Step 2: Manually verify in Chrome**

Open `http://localhost:3000/` in Chrome. Open DevTools → Application → Service Workers.

Expected: **no `sw.js` registered** (because `import.meta.env.PROD` is false in dev).

Also verify Application → Manifest still loads (manifest tag is present regardless of mode) and shows the 3 icons without errors. This confirms the manifest file is served correctly by Vite dev.

- [ ] **Step 3: Stop the dev server**

Ctrl+C the Vite process.

- [ ] **Step 4: No commit (verification task)**

---

### Task 8: Production preview smoke test (SW MUST register + install prompt)

**Files:** none (verification only)

- [ ] **Step 1: Build and start preview server**

```bash
npm run build --workspace=@mathchois/client
npm run preview --workspace=@mathchois/client
```

Wait for preview URL (typically `http://localhost:4173/`).

- [ ] **Step 2: Open in Chrome and verify manifest**

Open the preview URL. DevTools → Application → Manifest.

Expected:
- `Name: ChoisClass - 수학 학습 플랫폼`
- `Short name: ChoisClass`
- `Display: standalone`
- 3 icons listed, all loading successfully (no red errors)
- No "Installability" warnings

- [ ] **Step 3: Verify Service Worker registered and running**

DevTools → Application → Service Workers.

Expected: `sw.js` with status `activated and is running`. Source: `/sw.js`.

- [ ] **Step 4: Verify install icon in address bar**

Look at Chrome's address bar right side. Expected: install icon (⊕ or monitor-with-arrow) appears within a few seconds of page load. Clicking it opens the "Install ChoisClass?" dialog.

- [ ] **Step 5: Install and launch as standalone**

Click Install in the dialog. Chrome launches ChoisClass in a separate window without address bar/tabs (standalone mode).

- [ ] **Step 6: Regression check — login + drawing still work**

In the installed standalone window:
1. Log in (Google or email) — should succeed, JWT token flow works
2. Navigate to a classroom → chapter → page → StudyViewer
3. Draw on the canvas with pen/mouse — strokes render normally
4. Open a teacher account in a regular browser and verify the student's strokes appear in real time (Socket.IO still working)

Expected: all existing functionality behaves identically to pre-PWA. If any regression is seen, STOP and investigate — the SW should not be intercepting anything, so any change is a real bug.

- [ ] **Step 7: Lighthouse PWA audit**

In DevTools → Lighthouse, run an audit with only "Progressive Web App" category. Expected: "Installable" check passes. Other PWA checks (offline, service worker cached content) may fail — that's expected for A-mode design.

- [ ] **Step 8: Uninstall and stop preview**

Uninstall the PWA from Chrome (app window menu → Uninstall ChoisClass). Ctrl+C the preview server.

- [ ] **Step 9: No commit (verification task)**

---

### Task 9: Final commit checkpoint and plan closeout

**Files:** none

- [ ] **Step 1: Verify clean working tree**

```bash
git status
```

Expected: working tree clean. All previous tasks already committed.

- [ ] **Step 2: Confirm task list in plan file**

Open `docs/superpowers/plans/2026-04-12-pwa-install-support.md` and verify all task checkboxes are marked `[x]`.

- [ ] **Step 3: Done**

PWA install support is now live in production builds. Deploy to Railway (`class.chois.ai.kr`) to make it available to end users. No Dockerfile or server-side changes needed — static files in `packages/client/dist/` are served as-is.

---

## Self-Review Notes

- **Spec coverage:** All 5 spec files (manifest, sw.js, 3 icons) and 3 modifications (index.html, main.jsx, package.json) mapped to Tasks 1-6. Verification (수용 기준) mapped to Tasks 7-8. Rollback path mentioned in spec is trivially reachable (revert main.jsx block).
- **No placeholders:** All code blocks are complete. No "TODO" or "similar to above".
- **Type/name consistency:** `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` used consistently across all tasks.
- **TDD note:** Unit tests don't fit this plan — the artifacts are static config files (manifest JSON, static JS SW) and HTML `<link>` tags. Verification is done via build output inspection, Chrome DevTools, and Lighthouse. This is appropriate for PWA plumbing.
