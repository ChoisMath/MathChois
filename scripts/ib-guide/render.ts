// PDF 한 개를 쪽마다 가로 1600px WebP(001.webp …)로 그린다. PDF 는 이 PC 밖으로 나가지 않고 쪽 이미지만 서버로 간다.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';

const TARGET_WIDTH = 1600;
const WEBP_QUALITY = 80;

// pdf.js 의 Node 로더는 `${dir}${파일이름}` 을 그대로 fs.readFile 에 넘기고, dir 이 '/' 로 끝나지 않으면 거부한다.
// 그래서 file:// URL 이 아닌 파일 경로를, Windows 에서도 '/' 로 이어 붙인 모양(C:/…/standard_fonts/)으로 준다 — fs 는 '/' 를 받는다.
const PDFJS_ROOT = path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
const pdfjsDir = (name: string) => `${path.join(PDFJS_ROOT, name).split(path.sep).join('/')}/`;
const STANDARD_FONTS = pdfjsDir('standard_fonts');
const CMAPS = pdfjsDir('cmaps');
// 스캔 PDF 의 JPEG2000·JBIG2 이미지와 색 프로필은 wasm 디코더가 있어야 그려진다.
const WASM = pdfjsDir('wasm');

type Annot = { id?: unknown; subtype?: unknown; popupRef?: unknown; contentsObj?: { str?: unknown } };
const hasText = (a: Annot) => typeof a.contentsObj?.str === 'string' && a.contentsObj.str.trim() !== '';

/**
 * 화면에 글이 그려지지 않는 말풍선 메모(Text 아이콘·Popup) 개수. pdf.js 는 Popup 에 부모의 글을 복사해 두므로
 * 메모 아이콘(Text) 하나가 Popup 과 함께 두 번 세어지지 않도록, 이미 센 Text 의 popupRef 인 Popup 은 뺀다.
 * (형광펜·도형에 단 메모는 부모가 Text 가 아니라 Popup 으로만 한 번 세어진다.)
 */
function countPopupNotes(annots: Annot[]): number {
  const notes = annots.filter((a) => (a.subtype === 'Text' || a.subtype === 'Popup') && hasText(a));
  const counted = new Set<unknown>(notes.filter((a) => a.subtype === 'Text').map((a) => a.popupRef));
  return notes.filter((a) => !(a.subtype === 'Popup' && counted.has(a.id))).length;
}

export async function renderPdf(pdfFile: string, outDir: string): Promise<{ pages: number; popupNotes: number }> {
  const data = new Uint8Array(await readFile(pdfFile));
  // 문서 정리는 로딩 작업의 destroy() 로 한다(문서 객체에는 destroy 가 없다) — 실패해도 워커가 남지 않게 먼저 잡아 둔다.
  const task = pdfjs.getDocument({ data, standardFontDataUrl: STANDARD_FONTS, cMapUrl: CMAPS, cMapPacked: true, wasmUrl: WASM });
  try {
    const doc = await task.promise;
    await mkdir(outDir, { recursive: true });
    let popupNotes = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      try {
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width });
        const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
        const canvasContext = canvas.getContext('2d');
        // @napi-rs/canvas 는 HTMLCanvasElement 타입이 아니지만 pdf.js Node 빌드가 그리는 데 쓰는 API 는 같다.
        await page.render({ canvas, canvasContext, viewport } as unknown as Parameters<typeof page.render>[0]).promise;
        const webp = await sharp(canvas.toBuffer('image/png')).webp({ quality: WEBP_QUALITY }).toBuffer();
        await writeFile(path.join(outDir, `${String(n).padStart(3, '0')}.webp`), webp);
        popupNotes += countPopupNotes(await page.getAnnotations());
      } finally {
        page.cleanup();
      }
    }
    return { pages: doc.numPages, popupNotes };
  } finally {
    await task.destroy();
  }
}
