/**
 * 브라우저 전용 내보내기 (Excalidraw import — node 테스트에서는 불러오지 않는다)
 */
import { exportToCanvas, exportToBlob, restoreElements } from '@excalidraw/excalidraw';
import { createGuideElement, withoutGuide, fitDimensions } from './whiteboardExport';
import { fileRefsToExcalidrawFiles } from './whiteboardImage';

const liveOf = (elements) => withoutGuide(elements).filter((el) => !el.isDeleted);

/** 격자 타일용 캔버스 (발표 영역 안내선을 포함해 범위를 잡는다) */
export async function renderBoardThumbnail({ elements, files, backgroundColor }, maxW = 480, maxH = 270) {
  const restored = restoreElements(liveOf(elements), null);
  const exFiles = await fileRefsToExcalidrawFiles(files);
  return exportToCanvas({
    elements: [createGuideElement(), ...restored],
    files: exFiles,
    appState: { viewBackgroundColor: backgroundColor || '#ffffff', exportBackground: true, exportWithDarkMode: false },
    exportPadding: 20,
    getDimensions: (w, h) => fitDimensions(w, h, maxW, maxH),
  });
}

/** PNG 다운로드 */
export async function exportBoardPng({ elements, files, backgroundColor }, fileName) {
  const restored = restoreElements(liveOf(elements), null);
  if (restored.length === 0) throw new Error('내보낼 내용이 없습니다.');
  const exFiles = await fileRefsToExcalidrawFiles(files);
  const blob = await exportToBlob({
    elements: restored,
    files: exFiles,
    appState: { viewBackgroundColor: backgroundColor || '#ffffff', exportBackground: true, exportWithDarkMode: false, exportPadding: 40 },
    mimeType: 'image/png',
    maxWidthOrHeight: 4000,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** PDF 페이지 데이터 (기존 usePdfDownloader.downloadMultiplePages 입력) */
export async function boardsToPdfPages(boards) {
  const out = [];
  for (const b of boards) {
    const restored = restoreElements(liveOf(b.elements), null);
    const exFiles = await fileRefsToExcalidrawFiles(b.files);
    out.push({ elements: restored, files: exFiles, bgUrl: null, bgPosition: null, backgroundColor: b.backgroundColor });
  }
  return out;
}
