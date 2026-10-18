import { describe, it, expect } from 'vitest';
import { pickNewFiles, fileRefsToExcalidrawFiles, cursorColorFor } from './whiteboardImage';

describe('pickNewFiles', () => {
  it('모르는 id 중 dataURL 이 있는 파일만', () => {
    const files = {
      a: { dataURL: 'data:image/png;base64,AAA', mimeType: 'image/png' },
      b: { dataURL: 'data:image/jpeg;base64,BBB', mimeType: 'image/jpeg' },
      c: { mimeType: 'image/png' },
    };
    const out = pickNewFiles(files, new Set(['a']));
    expect(out.map((f) => f.id)).toEqual(['b']);
    expect(out[0].mimeType).toBe('image/jpeg');
  });
});

describe('fileRefsToExcalidrawFiles', () => {
  it('loader 로 dataURL 을 채우고 실패한 항목은 건너뛴다', async () => {
    const loader = async (url) => {
      if (url.includes('bad')) throw new Error('404');
      return { dataUrl: `data:${url}`, mimeType: 'image/png' };
    };
    const out = await fileRefsToExcalidrawFiles({
      f1: { id: 'f1', url: '/api/files/whiteboard-files/x/1.png', mimeType: 'image/png' },
      f2: { id: 'f2', url: '/api/files/whiteboard-files/x/bad.png', mimeType: 'image/png' },
    }, loader);
    expect(Object.keys(out)).toEqual(['f1']);
    expect(out.f1.dataURL).toBe('data:/api/files/whiteboard-files/x/1.png');
    expect(out.f1.id).toBe('f1');
  });
});

describe('cursorColorFor', () => {
  it('같은 id 는 같은 색, 형식은 {background, stroke}', () => {
    const a = cursorColorFor('user-1');
    expect(a).toEqual(cursorColorFor('user-1'));
    expect(a.background).toMatch(/^#[0-9a-f]{6}$/);
    expect(a.stroke).toBe(a.background);
  });
});
