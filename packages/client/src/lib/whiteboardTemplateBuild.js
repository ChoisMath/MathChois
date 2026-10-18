import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import { buildTemplateSkeletons } from './whiteboardTemplates';

let seq = 0;

/**
 * 템플릿을 Excalidraw 요소로 변환한다. 모든 요소에 같은 groupId 를 붙여
 * 한 번에 선택·이동·삭제되게 한다.
 */
export function buildTemplateElements(key, ox = 0, oy = 0) {
  const skeletons = buildTemplateSkeletons(key, ox, oy);
  if (skeletons.length === 0) return [];
  const instanceId = `tpl-${key}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
  const elements = convertToExcalidrawElements(skeletons, { regenerateIds: true });
  return elements.map((el) => ({
    ...el,
    groupIds: [...(el.groupIds ?? []), instanceId],
    customData: { ...(el.customData ?? {}), template: key },
  }));
}
