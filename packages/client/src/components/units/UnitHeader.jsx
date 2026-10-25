import { ArrowLeft } from 'lucide-react';
import IconButton from '../common/IconButton';

/**
 * 단원 안 화면의 머리: [← 단원 목록], 단원 이름·설명, 오른쪽에 탭이 넘겨 주는 버튼들(children).
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string|null} [props.description]
 * @param {() => void} props.onBack
 * @param {import('react').ReactNode} [props.children]
 */
export default function UnitHeader({ title, description, onBack, children }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-x-3 gap-y-2 flex-wrap mb-1">
        <div className="flex items-center -ml-3">
          <IconButton icon={ArrowLeft} label="단원 목록" onClick={onBack} />
          {/* 글자도 누를 수 있게(마우스·터치). 키보드·화면 읽기는 옆 아이콘 버튼 하나로 충분 */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={onBack}
            className="min-h-11 pr-2 -ml-1 text-sm text-gray-600 hover:text-gray-900 cursor-pointer"
          >
            단원 목록
          </button>
        </div>
        {children && <div className="flex items-center justify-end gap-3 flex-wrap ml-auto">{children}</div>}
      </div>
      <h2 className="text-lg font-bold text-gray-900 break-keep [overflow-wrap:anywhere]">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-gray-500 whitespace-pre-line break-keep [overflow-wrap:anywhere]">{description}</p>
      )}
    </div>
  );
}
