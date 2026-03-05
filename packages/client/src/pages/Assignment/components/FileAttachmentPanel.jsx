import { Paperclip, Plus, X } from 'lucide-react';

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function FileAttachmentPanel({
  readOnly = false,
  existingFiles = [],
  newFiles = [],
  deletedFileIds = new Set(),
  onFileAdd,
  onRemoveNew,
  onRemoveExisting,
  fileError = '',
  fileInputRef,
  maxFiles = 5,
}) {
  const activeExisting = existingFiles.filter(f => !deletedFileIds.has(f.id));
  const remainingSlots = maxFiles - (activeExisting.length + newFiles.length);

  return (
    <div className="bg-white border-b px-4 py-3 flex-shrink-0 z-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">
          첨부파일 <span className="text-gray-400">(최대 {maxFiles}개, 각 10MB)</span>
        </span>
      </div>

      {/* 기존 파일 */}
      {activeExisting.map(f => (
        <div key={f.id} className="flex items-center gap-2 mb-1 p-2 bg-gray-50 rounded-md">
          {f.mimeType?.startsWith('image/') ? (
            <img src={f.fileUrl} alt={f.fileName} className="w-10 h-10 object-cover rounded flex-shrink-0" />
          ) : (
            <Paperclip className="h-4 w-4 text-gray-400 flex-shrink-0" />
          )}
          <a href={f.fileUrl + '?download=true'} download={f.fileName}
            className="text-sm text-blue-600 hover:underline truncate flex-1">{f.fileName}</a>
          <span className="text-xs text-gray-400">{formatFileSize(f.fileSize)}</span>
          {!readOnly && (
            <button onClick={() => onRemoveExisting(f.id)}
              className="p-0.5 text-gray-400 hover:text-red-500 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}

      {/* 새 파일 */}
      {!readOnly && newFiles.map((f, idx) => (
        <div key={idx} className="flex items-center gap-2 mb-1 p-2 bg-blue-50 rounded-md">
          <Paperclip className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <span className="text-sm text-blue-700 truncate flex-1">{f.name}</span>
          <span className="text-xs text-blue-400">{formatFileSize(f.size)}</span>
          <button onClick={() => onRemoveNew(idx)}
            className="p-0.5 text-gray-400 hover:text-red-500 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {/* 추가 버튼 */}
      {!readOnly && remainingSlots > 0 && (
        <>
          <input ref={fileInputRef} type="file" multiple
            accept="image/*,.pdf" onChange={onFileAdd} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()}
            className="mt-1 flex items-center justify-center p-2 w-full border border-dashed border-gray-300 rounded-md text-gray-500 hover:border-purple-300 hover:text-purple-500 cursor-pointer">
            <Plus className="h-5 w-5" />
          </button>
        </>
      )}

      {/* 파일 없음 메시지 */}
      {readOnly && existingFiles.length === 0 && (
        <p className="text-sm text-gray-400">첨부파일이 없습니다.</p>
      )}

      {fileError && <p className="text-xs text-red-600 mt-1">{fileError}</p>}
    </div>
  );
}
