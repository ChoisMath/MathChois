import { useMemo } from 'react';
import { BOARD_W, BOARD_H, getTemplate } from '../../lib/whiteboardTemplates';

/**
 * 템플릿 skeleton 을 그대로 SVG 로 그린 미니 미리보기.
 * PNG 를 따로 두지 않으므로 템플릿을 추가하면 자동으로 반영된다.
 */
export default function TemplateThumb({ templateKey, className = '' }) {
  const skeletons = useMemo(() => getTemplate(templateKey)?.build() ?? [], [templateKey]);
  return (
    <svg
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      className={`w-full h-auto bg-white ${className}`}
      aria-hidden="true"
    >
      {skeletons.map((s, i) => {
        const dash = s.strokeStyle === 'dashed' ? '40 30' : undefined;
        const sw = Math.max(8, (s.strokeWidth ?? 3) * 3);
        const labelText = s.label?.text;
        switch (s.type) {
          case 'rectangle':
            return (
              <g key={i}>
                <rect x={s.x} y={s.y} width={s.width} height={s.height} fill={s.backgroundColor === 'transparent' ? 'none' : s.backgroundColor} stroke="#1e1e1e" strokeWidth={sw} />
                {labelText && <text x={s.x + s.width / 2} y={s.y + s.height / 2} fontSize={Math.max(80, (s.label.fontSize ?? 44) * 2)} textAnchor="middle" dominantBaseline="middle" fill="#1e1e1e">{labelText}</text>}
              </g>
            );
          case 'ellipse':
            return (
              <g key={i}>
                <ellipse cx={s.x + s.width / 2} cy={s.y + s.height / 2} rx={s.width / 2} ry={s.height / 2} fill="none" stroke="#1e1e1e" strokeWidth={sw} />
                {labelText && <text x={s.x + s.width / 2} y={s.y + s.height / 2} fontSize={Math.max(80, (s.label.fontSize ?? 44) * 2)} textAnchor="middle" dominantBaseline="middle" fill="#1e1e1e">{labelText}</text>}
              </g>
            );
          case 'diamond': {
            const cx = s.x + s.width / 2, cy = s.y + s.height / 2;
            return (
              <polygon key={i} points={`${cx},${s.y} ${s.x + s.width},${cy} ${cx},${s.y + s.height} ${s.x},${cy}`} fill="none" stroke="#1e1e1e" strokeWidth={sw} />
            );
          }
          case 'line':
          case 'arrow': {
            const [p0, p1] = s.points;
            const x1 = s.x + p0[0], y1 = s.y + p0[1], x2 = s.x + p1[0], y2 = s.y + p1[1];
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1e1e1e" strokeWidth={sw} strokeDasharray={dash}
                markerEnd={s.type === 'arrow' ? 'url(#tplArrow)' : undefined}
                markerStart={s.type === 'arrow' && s.startArrowhead ? 'url(#tplArrowStart)' : undefined} />
            );
          }
          case 'text':
            return (
              <text key={i} x={s.x} y={s.y + (s.fontSize ?? 48) * 1.6} fontSize={(s.fontSize ?? 48) * 1.8} fill="#1e1e1e">{s.text}</text>
            );
          default:
            return null;
        }
      })}
      <defs>
        <marker id="tplArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#1e1e1e" />
        </marker>
        <marker id="tplArrowStart" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#1e1e1e" />
        </marker>
      </defs>
    </svg>
  );
}
