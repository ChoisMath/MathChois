/**
 * 단원 복사 계획 — 다른 학급의 단원(챕터·영상 배정·필기 챕터 연결)을 대상 학급에 넣을 때
 * 무엇을 새로 만들고, 무엇을 옮기고, 어디에 합칠지를 DB 없이 정한다. 서버가 이 계획을 트랜잭션으로 실행한다.
 * 이름 비교는 titleKey. 같은 이름 단원은 합치고, 같은 이름 챕터·같은 영상은 새로 만들지 않고 옮긴다.
 */
import { titleKey } from '../chapter/title.js';

export interface CopySourceUnit {
  id: string;
  title: string;
  description: string | null;
  isHidden: boolean;
  /** position 순 */
  chapters: { id: string; title: string; description: string | null; sourceChapterId: string | null }[];
  /** position 순. chapterTitle = 원본 필기 챕터 이름(없으면 null) */
  videos: { videoId: string; note: string | null; chapterTitle: string | null }[];
}

export interface CopyTargetState {
  units: { id: string; title: string }[];
  chapters: { id: string; title: string }[];
  videos: { id: string; videoId: string; note: string | null; chapterId: string | null }[];
}

export interface UnitCopyCounts {
  unitsCreated: number;
  unitsMerged: number;
  chaptersCreated: number;
  chaptersMoved: number;
  videosCreated: number;
  videosMoved: number;
  /** 원본엔 필기 챕터 연결이 있었으나 대상에서 같은 이름 챕터를 못 찾음 */
  linksUnresolved: number;
}

export interface UnitCopyPlan {
  /** 대상 단원(중복 없음, 원본 순서). existingUnitId 가 있으면 합침 */
  units: { existingUnitId: string | null; title: string; description: string | null; isHidden: boolean }[];
  /** 이 순서가 새 챕터의 position 0..n-1 */
  newChapters: { unitIndex: number; title: string; description: string | null; sourceChapterId: string }[];
  movedChapters: { chapterId: string; unitIndex: number }[];
  /** 이 순서가 새 배정의 position 0..m-1 */
  newVideos: { unitIndex: number; videoId: string; note: string | null; chapterTitle: string | null }[];
  /** fillNote: 대상 메모가 비어 있을 때 채울 원본 메모. linkChapterTitle: 대상에 연결이 없을 때 이을 챕터 이름 */
  movedVideos: { classroomVideoId: string; unitIndex: number; fillNote: string | null; linkChapterTitle: string | null }[];
  counts: UnitCopyCounts;
}

const isBlank = (s: string | null) => s == null || s.trim() === '';

export function planUnitCopy(sources: CopySourceUnit[], target: CopyTargetState): UnitCopyPlan {
  const plan: UnitCopyPlan = {
    units: [], newChapters: [], movedChapters: [], newVideos: [], movedVideos: [],
    counts: { unitsCreated: 0, unitsMerged: 0, chaptersCreated: 0, chaptersMoved: 0, videosCreated: 0, videosMoved: 0, linksUnresolved: 0 },
  };

  // 같은 이름 단원이 여럿이면 목록 순서상 앞의 것(서버는 position 순으로 넘긴다)
  const targetUnitByKey = new Map<string, string>();
  for (const u of target.units) {
    const key = titleKey(u.title);
    if (!targetUnitByKey.has(key)) targetUnitByKey.set(key, u.id);
  }
  const targetChapterByKey = new Map<string, string>();
  for (const c of target.chapters) {
    const key = titleKey(c.title);
    if (!targetChapterByKey.has(key)) targetChapterByKey.set(key, c.id);
  }
  const targetVideoById = new Map(target.videos.map((x) => [x.videoId, x]));

  const unitIndexByKey = new Map<string, number>(); // 이번 계획의 대상 단원
  const handledChapterKeys = new Set<string>();     // 새로 만들거나 옮긴 챕터 이름
  const handledVideoIds = new Set<string>();
  const linkTitles: string[] = [];                  // 이어야 할 필기 챕터 이름

  for (const src of sources) {
    const unitKey = titleKey(src.title);
    let unitIndex = unitIndexByKey.get(unitKey);
    if (unitIndex === undefined) {
      const existingUnitId = targetUnitByKey.get(unitKey) ?? null;
      unitIndex = plan.units.push({ existingUnitId, title: src.title, description: src.description, isHidden: src.isHidden }) - 1;
      unitIndexByKey.set(unitKey, unitIndex);
      if (existingUnitId) plan.counts.unitsMerged++;
      else plan.counts.unitsCreated++;
    }

    for (const c of src.chapters) {
      const key = titleKey(c.title);
      if (handledChapterKeys.has(key)) continue;
      handledChapterKeys.add(key);
      const existing = targetChapterByKey.get(key);
      if (existing) plan.movedChapters.push({ chapterId: existing, unitIndex });
      else plan.newChapters.push({ unitIndex, title: c.title, description: c.description, sourceChapterId: c.sourceChapterId ?? c.id });
    }

    for (const v of src.videos) {
      if (handledVideoIds.has(v.videoId)) continue;
      handledVideoIds.add(v.videoId);
      const existing = targetVideoById.get(v.videoId);
      if (existing) {
        const fillNote = isBlank(existing.note) && !isBlank(v.note) ? v.note : null;
        const linkChapterTitle = existing.chapterId == null && v.chapterTitle ? v.chapterTitle : null;
        plan.movedVideos.push({ classroomVideoId: existing.id, unitIndex, fillNote, linkChapterTitle });
        if (linkChapterTitle) linkTitles.push(linkChapterTitle);
      } else {
        plan.newVideos.push({ unitIndex, videoId: v.videoId, note: v.note, chapterTitle: v.chapterTitle });
        if (v.chapterTitle) linkTitles.push(v.chapterTitle);
      }
    }
  }

  plan.counts.chaptersCreated = plan.newChapters.length;
  plan.counts.chaptersMoved = plan.movedChapters.length;
  plan.counts.videosCreated = plan.newVideos.length;
  plan.counts.videosMoved = plan.movedVideos.length;
  const availableChapterKeys = new Set([...targetChapterByKey.keys(), ...plan.newChapters.map((c) => titleKey(c.title))]);
  plan.counts.linksUnresolved = linkTitles.filter((t) => !availableChapterKeys.has(titleKey(t))).length;
  return plan;
}
