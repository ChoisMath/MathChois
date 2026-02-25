/** 배경 이미지 위치/크기 */
export interface BgPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Excalidraw에 저장되는 파일 (DataURL 이미지) */
export interface ExcalidrawFileData {
  id: string;
  dataURL: string;
  mimeType: string;
  created: number;
}

/**
 * JSONB에 저장되는 Excalidraw 데이터
 * - elements: Excalidraw element 배열 (타입은 Excalidraw 라이브러리에서 정의)
 * - files: element에서 참조하는 이미지 파일들
 * - bgPosition: 배경 이미지 위치 (StudyViewer에서 사용)
 */
export interface ExcalidrawData {
  elements: Record<string, unknown>[];
  files?: Record<string, ExcalidrawFileData>;
  bgPosition?: BgPosition | null;
}
