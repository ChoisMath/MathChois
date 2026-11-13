import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

/*
 * pdf.js 가 런타임에 fetch 하는 정적 자산(cmaps — CJK 폰트 문자 매핑, standard_fonts — 비임베드 표준 14 폰트)을
 * /pdfjs/ 아래로 제공한다. URL 은 lib/pdfjs.js 의 PDFJS_DOC_OPTIONS 와 맞물린다.
 * - 빌드: closeBundle(public/ 복사 이후)에서 node_modules/pdfjs-dist/{cmaps,standard_fonts} → dist/pdfjs/ 복사.
 *   postinstall 복사는 쓰지 않는다 — Dockerfile 이 npm ci --ignore-scripts 라 실행되지 않는다.
 * - dev: configureServer 미들웨어가 /pdfjs/* 를 같은 디렉터리에서 직접 서빙.
 * 패키지 위치는 require.resolve 로 찾는다(워크스페이스 호이스팅 위치에 의존하지 않음).
 */
const ASSET_DIRS = ['cmaps', 'standard_fonts']
const URL_PREFIX = '/pdfjs/'

export function pdfjsAssets() {
  const pkgDir = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
  let config

  return {
    name: 'pdfjs-assets',
    configResolved(resolved) {
      config = resolved
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawPath = (req.url ?? '').split('?')[0]
        if (!rawPath.startsWith(URL_PREFIX)) return next()
        let pathname
        try {
          pathname = decodeURIComponent(rawPath)
        } catch {
          return next()
        }
        const [dir, ...rest] = pathname.slice(URL_PREFIX.length).split('/')
        if (!ASSET_DIRS.includes(dir) || rest.length === 0) return next()
        const baseDir = path.join(pkgDir, dir)
        const file = path.resolve(baseDir, rest.join('/'))
        /* 경로 이탈(../) 차단 — 자산 디렉터리 안의 일반 파일만 */
        if (!file.startsWith(baseDir + path.sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
          return next()
        }
        res.setHeader('Content-Type', 'application/octet-stream')
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      if (config.command !== 'build') return
      const outDir = path.resolve(config.root, config.build.outDir, 'pdfjs')
      for (const dir of ASSET_DIRS) {
        fs.cpSync(path.join(pkgDir, dir), path.join(outDir, dir), { recursive: true })
      }
    },
  }
}
