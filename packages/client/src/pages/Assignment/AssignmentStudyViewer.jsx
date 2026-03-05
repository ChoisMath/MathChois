import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Menu, Pencil, Send,
  ChevronUp, ChevronDown, GraduationCap, X, Download, Loader, Paperclip
} from 'lucide-react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { api } from '../../lib/api';
import { subscribeToRoom } from '../../lib/socket';
import { useAuth } from '../../contexts/AuthContext';
import DrawingToolbar from '../../components/study/DrawingToolbar';
import { usePdfDownloader } from '../../lib/pdfDownloader';
import { PdfDownloadButton } from '../../components/common/PdfDownloadButton';
import {
  BG_ELEMENT_ID, BG_FILE_ID,
  ALWAYS_HIDE_CSS, PANEL_HIDE_CSS, GRID_STYLE,
  fetchAsDataUrl, getImageNaturalSize, createBgElement, prefetchImages,
  calculateBgPosition, EXCALIDRAW_UI_OPTIONS, TOUCH_CSS,
} from '../../lib/excalidrawUtils';
import { useExcalidrawTouch } from '../../hooks/useExcalidrawTouch';
import ExcalidrawErrorBoundary from '../../components/ExcalidrawErrorBoundary';
import FileAttachmentPanel from './components/FileAttachmentPanel';

/* 세션 내 캐시 */
const _notesCache    = new Map(); // `${userId}_${pageId}` → { elements, bgPosition, files }
const _commentsCache = new Map(); // `${userId}_${pageId}` → { elements, files }

const TEACHER_COMMENT_PREFIX = '__atc_';

/* ─────────── 교사 필기 모달 ─────────── */
/* TODO: assignment_teacher_notes 테이블/API가 서버에 아직 없음.
   이 모달은 현재 빈 상태로 표시됩니다. 서버에 해당 엔드포인트 추가 후 연동 필요. */
function TeacherNotesModal({ page, onClose }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ok'
  const [noteElements, setNoteElements] = useState([]);
  const [noteFiles, setNoteFiles] = useState({});
  const { isDownloading, downloadPage, downloadMultiplePages } = usePdfDownloader();
  const bgPositionRef = useRef(null);
  const [dbBgPosition, setDbBgPosition] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    // TODO: 서버에 assignment_teacher_notes API 필요
    // 현재 해당 엔드포인트가 없으므로 이미지만 표시
    setStatus('ok');
  }, [page.id]);

  const handleMount = useCallback(async (apiRef) => {
    if (!page.imageUrl || !containerRef.current) return;
    try {
      const { dataUrl, mimeType } = await fetchAsDataUrl(page.imageUrl);
      const { w: iW, h: iH } = await getImageNaturalSize(dataUrl);

      let bgW, bgH, bgX, bgY;
      if (dbBgPosition) {
        ({ width: bgW, height: bgH, x: bgX, y: bgY } = dbBgPosition);
      } else {
        const W = containerRef.current.clientWidth  || 800;
        const H = containerRef.current.clientHeight || 900;
        const pos = calculateBgPosition(W, H, iW, iH);
        bgX = pos.x; bgY = pos.y; bgW = pos.width; bgH = pos.height;
      }

      bgPositionRef.current = { x: bgX, y: bgY, width: bgW, height: bgH };
      apiRef.addFiles([{ id: '__bg_file__', dataURL: dataUrl, mimeType, created: Date.now() }]);
      /* 교사 필기에 삽입된 이미지 파일 복원 */
      const noteFilesList = Object.values(noteFiles);
      if (noteFilesList.length > 0) apiRef.addFiles(noteFilesList);
      /* addFiles의 React 상태 커밋 후 updateScene — 별도 렌더 사이클에서 실행해야 이미지가 표시됨 */
      await new Promise((r) => requestAnimationFrame(r));
      const bgEl = createBgElement(bgX, bgY, bgW, bgH);
      apiRef.updateScene({ elements: [bgEl, ...noteElements] });
    } catch (err) {
      console.error('교사 필기 모달 bg 로드 실패:', err);
      apiRef.updateScene({ elements: noteElements });
    }
  }, [page.imageUrl, noteElements, noteFiles, dbBgPosition]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-12 flex items-center justify-between px-4 border-b flex-shrink-0">
          <span className="font-semibold text-gray-800">교사 필기</span>
          <div className="flex items-center gap-2">
            {status === 'ok' && (
              <PdfDownloadButton
                onClick={() => downloadPage('교사_필기', noteElements, noteFiles, page.imageUrl, bgPositionRef.current)}
                isDownloading={isDownloading}
                label="PDF 다운로드"
                className="py-1 px-2 text-xs"
              />
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div ref={containerRef} className="flex-1 relative overflow-hidden bg-gray-50">
          {status === 'loading' && (
            <div className="flex items-center justify-center h-full text-gray-400">불러오는 중...</div>
          )}
          {status === 'ok' && (
            <>
              <style>{ALWAYS_HIDE_CSS}{TOUCH_CSS}{PANEL_HIDE_CSS}</style>
              <ExcalidrawErrorBoundary key={page.id + '_modal'}>
              <Excalidraw
                excalidrawAPI={handleMount}
                initialData={{
                  elements: noteElements,
                  appState: { viewBackgroundColor: 'transparent', scrollX: 0, scrollY: 0 },
                }}
                viewModeEnabled={true}
                UIOptions={EXCALIDRAW_UI_OPTIONS}
              />
              </ExcalidrawErrorBoundary>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const AssignmentStudyViewer = () => {
  const { assignmentId, pageId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [assignment, setAssignment]   = useState(null);
  const [pages, setPages]             = useState([]);
  const [currentPage, setCurrentPage] = useState(null);
  const [submission, setSubmission]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawMode, setDrawMode]       = useState(false);
  const [noteElements, setNoteElements] = useState([]);
  const [saveStatus, setSaveStatus]   = useState('saved');
  const [showExcalidrawPanel, setShowExcalidrawPanel] = useState(false);
  const [showTeacherNotesModal, setShowTeacherNotesModal] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [submissionFiles, setSubmissionFiles] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [deletedFileIds, setDeletedFileIds] = useState(new Set());
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [fileError, setFileError] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef(null);
  const { isDownloading, downloadPage, downloadMultiplePages } = usePdfDownloader();

  const containerRef         = useRef(null);
  const saveTimerRef         = useRef(null);
  const excalidrawAPIRef     = useRef(null);
  const currentPageRef       = useRef(null);
  const noteElementsRef      = useRef([]);
  const bgPositionRef        = useRef(null);
  const savedFilesRef        = useRef({});
  const teacherCommentsRef   = useRef([]);
  const teacherCommentFilesRef = useRef({});
  const userRef              = useRef(user);
  const drawModeRef          = useRef(false);
  const lastSavedRef         = useRef(null);
  const activeSidebarItemRef = useRef(null);
  const sidebarScrollRef     = useRef(null);
  const mountedRef           = useRef(true);
  const [screenLocked, setScreenLocked] = useState(false);
  const screenLockedRef   = useRef(false);
  const screenLockBaseRef = useRef({ zoom: 1, scrollX: 0, scrollY: 0 });
  useEffect(() => { screenLockedRef.current = screenLocked; }, [screenLocked]);

  useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => { currentPageRef.current  = currentPage;  }, [currentPage]);
  useEffect(() => { noteElementsRef.current = noteElements; }, [noteElements]);
  useEffect(() => { userRef.current         = user;         }, [user]);
  useEffect(() => { drawModeRef.current     = drawMode;     }, [drawMode]);

  /* 잠금 여부: submitted/graded이면 편집 불가 */
  const isLocked = ['submitted', 'late_submitted', 'graded'].includes(submission?.status);

  useEffect(() => {
    if (drawMode && excalidrawAPIRef.current) {
      const apiRef = excalidrawAPIRef.current;
      const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
      const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
      const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.2');
      const validTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
      const excTool = savedTool === 'triangle' ? 'freedraw' : (validTools.includes(savedTool) ? savedTool : 'freedraw');
      apiRef.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth, currentItemRoundness: 'sharp' }, commitToHistory: false });
      apiRef.setActiveTool({ type: excTool });
    }
  }, [drawMode]);

  /* 데이터 로드 */
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);
      bgPositionRef.current = null;
      lastSavedRef.current  = null;

      try {
        const [asnData, pgsData, subData] = await Promise.all([
          api.get(`/api/assignments/${assignmentId}`),
          api.get(`/api/assignments/${assignmentId}/pages`),
          api.get(`/api/submissions/student?assignmentIds=${assignmentId}`),
        ]);

        setAssignment(asnData);
        const pgs = pgsData || [];
        setPages(pgs);
        // subData is an array; find the one for this assignment
        const mySub = (subData || []).find(s => s.assignmentId === assignmentId) || null;
        setSubmission(mySub);

        // 제출 파일 로드
        if (mySub) {
          try {
            const files = await api.get(`/api/submissions/${assignmentId}/files`);
            setSubmissionFiles(files || []);
          } catch { /* ignore */ }
        }

        if (pgs.length > 0) {
          const found = pgs.find((p) => p.id === pageId);
          if (found) {
            setCurrentPage(found);
            const nk = `${user.id}_${pageId}`;
            const ck = `${user.id}_${pageId}`;

            const notePromise = _notesCache.has(nk)
              ? Promise.resolve(_notesCache.get(nk))
              : api.get(`/api/assignment-notes/${assignmentId}/${pageId}`)
                  .then((note) => {
                    const nd = {
                      elements:   note?.excalidrawData?.elements   || [],
                      bgPosition: note?.excalidrawData?.bgPosition ?? null,
                      files:      note?.excalidrawData?.files      ?? {},
                    };
                    _notesCache.set(nk, nd);
                    return nd;
                  })
                  .catch(() => {
                    const nd = { elements: [], bgPosition: null, files: {} };
                    _notesCache.set(nk, nd);
                    return nd;
                  });

            const commentPromise = _commentsCache.has(ck)
              ? Promise.resolve(_commentsCache.get(ck))
              : api.get(`/api/assignment-comments/${pageId}/${user.id}`)
                  .then((comment) => {
                    const els = comment?.excalidrawData?.elements
                      ? comment.excalidrawData.elements.map((el) => ({
                          ...el, id: TEACHER_COMMENT_PREFIX + el.id, locked: true, opacity: 60,
                        }))
                      : [];
                    const files = comment?.excalidrawData?.files ?? {};
                    const cd = { elements: els, files };
                    _commentsCache.set(ck, cd);
                    return cd;
                  })
                  .catch(() => {
                    const cd = { elements: [], files: {} };
                    _commentsCache.set(ck, cd);
                    return cd;
                  });

            const [noteData, commentData] = await Promise.all([notePromise, commentPromise]);
            setNoteElements(noteData.elements);
            bgPositionRef.current          = noteData.bgPosition;
            savedFilesRef.current          = noteData.files;
            teacherCommentsRef.current     = commentData.elements;
            teacherCommentFilesRef.current = commentData.files;
          } else {
            navigate(`/student/assignments/${assignmentId}/page/${pgs[0].id}`, { replace: true });
            return;
          }
        }
      } catch (err) {
        console.error('데이터 로드 실패:', err);
      }
      setLoading(false);
    };
    fetchData();
  }, [assignmentId, pageId, navigate, user]);

  /* Socket.IO: 교사 코멘트 실시간 구독 */
  useEffect(() => {
    if (!currentPage || !user) return;
    return subscribeToRoom(
      `asn-comments:${currentPage.id}:${user.id}`,
      'asn-comment:updated',
      async (data) => {
        // 코멘트가 업데이트되면 최신 데이터를 다시 fetch
        try {
          const comment = await api.get(`/api/assignment-comments/${currentPage.id}/${user.id}`);
          const apiRef = excalidrawAPIRef.current;
          if (!apiRef) return;
          const newCommentEls = (comment?.excalidrawData?.elements || []).map((el) => ({
            ...el, id: TEACHER_COMMENT_PREFIX + el.id, locked: true, opacity: 60,
          }));
          const newCommentFiles = comment?.excalidrawData?.files ?? {};
          if (Object.keys(newCommentFiles).length > 0) {
            apiRef.addFiles(Object.values(newCommentFiles));
            teacherCommentFilesRef.current = { ...teacherCommentFilesRef.current, ...newCommentFiles };
          }
          _commentsCache.set(`${user.id}_${currentPage.id}`, {
            elements: newCommentEls, files: teacherCommentFilesRef.current,
          });
          teacherCommentsRef.current = newCommentEls;
          const preserved = apiRef.getSceneElements().filter((el) => !el.id.startsWith(TEACHER_COMMENT_PREFIX));
          apiRef.updateScene({ elements: [...preserved, ...newCommentEls], commitToHistory: false });
        } catch (err) {
          console.error('코멘트 실시간 업데이트 실패:', err);
        }
      }
    );
  }, [currentPage, user]);

  /* Socket.IO: 제출 상태 실시간 구독 (교사 채점/반려 반영) */
  useEffect(() => {
    if (!user) return;
    return subscribeToRoom(
      `assignment:${assignmentId}`,
      'submission:updated',
      (data) => {
        if (data?.studentId === user.id) {
          setSubmission((prev) => prev ? { ...prev, ...data } : data);
        }
      }
    );
  }, [assignmentId, user]);

  /* onChange: 저장 */
  const handleExcalidrawChange = useCallback((elements, appState) => {
    if (appState && screenLockedRef.current) {
      const base = screenLockBaseRef.current;
      if (appState.zoom.value !== base.zoom ||
          appState.scrollX !== base.scrollX ||
          appState.scrollY !== base.scrollY) {
        excalidrawAPIRef.current?.updateScene({
          appState: {
            zoom: { value: base.zoom },
            scrollX: base.scrollX,
            scrollY: base.scrollY,
          }
        });
      }
    }

    if (!drawModeRef.current) return;
    if (isLocked) return;
    const bgEl = elements.find((el) => el.id === BG_ELEMENT_ID);
    if (bgEl) bgPositionRef.current = { x: bgEl.x, y: bgEl.y, width: bgEl.width, height: bgEl.height };
    const page = currentPageRef.current;
    const cu   = userRef.current;
    if (!cu || !page) return;
    const userEls = elements.filter((el) =>
      el.id !== BG_ELEMENT_ID && !el.id.startsWith(TEACHER_COMMENT_PREFIX) && !el.isDeleted
    );
    const serialized = JSON.stringify(userEls.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, points: el.points, text: el.text, width: el.width, height: el.height, strokeColor: el.strokeColor, strokeWidth: el.strokeWidth })));
    if (serialized === lastSavedRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      setSaveStatus('saving');
      const allFiles = excalidrawAPIRef.current?.getFiles() ?? {};
      const teacherFileIds = new Set(Object.keys(teacherCommentFilesRef.current));
      const userFiles = Object.fromEntries(
        Object.entries(allFiles).filter(([id]) => id !== BG_FILE_ID && !teacherFileIds.has(id))
      );
      try {
        await api.put(`/api/assignment-notes/${assignmentId}/${page.id}`, {
          excalidrawData: {
            elements:   userEls,
            bgPosition: bgPositionRef.current,
            ...(Object.keys(userFiles).length > 0 && { files: userFiles }),
          },
        });
      } catch (err) {
        console.error('필기 저장 실패:', err);
      }
      _notesCache.set(`${cu.id}_${page.id}`, {
        elements: userEls, bgPosition: bgPositionRef.current, files: userFiles,
      });
      if (mountedRef.current) { lastSavedRef.current = serialized; setSaveStatus('saved'); }
    }, 1500);
  }, [assignmentId, isLocked]);

  const handleToggleScreenLock = useCallback(() => {
    setScreenLocked(prev => {
      if (!prev && excalidrawAPIRef.current) {
        const s = excalidrawAPIRef.current.getAppState();
        screenLockBaseRef.current = { zoom: s.zoom.value, scrollX: s.scrollX, scrollY: s.scrollY };
      }
      return !prev;
    });
  }, []);

  /* Excalidraw 마운트 */
  const handleExcalidrawMount = useCallback(async (apiRef) => {
    excalidrawAPIRef.current = apiRef;
    const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
    const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
    const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
    const validTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
    const excTool = savedTool === 'triangle' ? 'freedraw' : (validTools.includes(savedTool) ? savedTool : 'freedraw');
    apiRef.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth, currentItemRoundness: 'sharp' }, commitToHistory: false });
    apiRef.setActiveTool({ type: excTool });

    const page = currentPageRef.current;
    if (!page?.imageUrl || !containerRef.current) return;

    try {
      const { dataUrl, mimeType } = await fetchAsDataUrl(page.imageUrl);
      const { w: iW, h: iH } = await getImageNaturalSize(dataUrl);
      let bgX, bgY, bgW, bgH;
      const saved = bgPositionRef.current;
      if (saved) {
        ({ x: bgX, y: bgY, width: bgW, height: bgH } = saved);
      } else {
        const W = containerRef.current.clientWidth  || 800;
        const H = containerRef.current.clientHeight || 1000;
        const pos = calculateBgPosition(W, H, iW, iH);
        bgX = pos.x; bgY = pos.y; bgW = pos.width; bgH = pos.height;
        bgPositionRef.current = { x: bgX, y: bgY, width: bgW, height: bgH };
      }
      await new Promise((r) => setTimeout(r, 0));
      apiRef.addFiles([{ id: BG_FILE_ID, dataURL: dataUrl, mimeType, created: Date.now() }]);
      const userFilesList = Object.values(savedFilesRef.current);
      if (userFilesList.length > 0) apiRef.addFiles(userFilesList);
      const teacherFilesList = Object.values(teacherCommentFilesRef.current);
      if (teacherFilesList.length > 0) apiRef.addFiles(teacherFilesList);
      await new Promise((r) => requestAnimationFrame(r));
      const bgEl = createBgElement(bgX, bgY, bgW, bgH);
      apiRef.updateScene({
        elements: [bgEl, ...noteElementsRef.current, ...teacherCommentsRef.current],
        commitToHistory: false,
      });
    } catch (err) {
      console.error('배경 이미지 로드 실패:', err);
      apiRef.updateScene({ elements: noteElementsRef.current, commitToHistory: false });
    }
  }, []);

  /* 파일 첨부 핸들러 */
  const MAX_SUBMISSION_FILES = 5;
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const handleFileAdd = (e) => {
    const added = Array.from(e.target.files);
    const currentCount = (submissionFiles.length - deletedFileIds.size) + newFiles.length;
    if (currentCount + added.length > MAX_SUBMISSION_FILES) {
      setFileError(`첨부파일은 최대 ${MAX_SUBMISSION_FILES}개까지 가능합니다.`);
      return;
    }
    const oversized = added.filter(f => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setFileError('파일 크기는 10MB 이하여야 합니다.');
      return;
    }
    setFileError('');
    setNewFiles(prev => [...prev, ...added]);
    e.target.value = '';
  };

  const handleRemoveNewFile = (idx) => setNewFiles(prev => prev.filter((_, i) => i !== idx));
  const handleRemoveExistingFile = (fileId) => setDeletedFileIds(prev => new Set(prev).add(fileId));

  /* 제출 처리 */
  const handleSubmit = async () => {
    if (!user || !assignment) return;
    if (!confirm('과제를 제출하시겠습니까? 제출 후에는 수정이 불가능합니다.')) return;
    setSubmitting(true);

    const now = new Date();
    const isLateSubmit = assignment.deadline ? now > new Date(assignment.deadline) : false;

    try {
      // 1. 새 파일 업로드
      const uploadedFiles = [];
      let failedCount = 0;
      for (let i = 0; i < newFiles.length; i++) {
        setUploadProgress(`파일 업로드 중... (${i + 1}/${newFiles.length})`);
        try {
          const formData = new FormData();
          formData.append('file', newFiles[i]);
          const result = await api.upload(
            `/api/files/upload?bucket=submission-files&directory=submissions/${assignmentId}/${user.id}`,
            formData
          );
          uploadedFiles.push({
            fileName: newFiles[i].name,
            fileUrl: result.url,
            fileSize: result.fileSize ?? newFiles[i].size,
            mimeType: result.mimeType ?? newFiles[i].type,
          });
        } catch (err) {
          failedCount++;
          console.error(`파일 업로드 실패 (${newFiles[i].name}):`, err);
        }
      }
      setUploadProgress('');

      if (failedCount > 0 && !confirm(`${failedCount}개 파일 업로드에 실패했습니다. 나머지만으로 제출하시겠습니까?`)) {
        setSubmitting(false);
        return;
      }

      // 2. 기존 유지 파일 + 업로드 파일 합산
      const keptFiles = submissionFiles
        .filter(f => !deletedFileIds.has(f.id))
        .map(f => ({ fileName: f.fileName, fileUrl: f.fileUrl, fileSize: f.fileSize, mimeType: f.mimeType }));
      const allFiles = [...keptFiles, ...uploadedFiles];

      // 3. 제출 API 호출
      const data = await api.put(`/api/submissions/${assignmentId}`, {
        status: isLateSubmit ? 'late_submitted' : 'submitted',
        isLate: isLateSubmit,
        maxScore: assignment.maxScore,
        files: allFiles,
      });
      if (data) {
        setSubmission(data);
        setSubmissionFiles(allFiles.map((f, i) => ({ ...f, id: `temp-${i}` })));
        setNewFiles([]);
        setDeletedFileIds(new Set());
      }
    } catch (err) {
      console.error('제출 실패:', err);
    }
    setSubmitting(false);
  };

  /* 파생 값 */
  const currentIndex = pages.findIndex((p) => p.id === currentPage?.id);
  const prevPage = currentIndex > 0                ? pages[currentIndex - 1] : null;
  const nextPage = currentIndex < pages.length - 1 ? pages[currentIndex + 1] : null;

  useEffect(() => {
    prefetchImages([prevPage?.imageUrl, nextPage?.imageUrl].filter(Boolean));
  }, [prevPage?.imageUrl, nextPage?.imageUrl]);

  /* 사이드바 자동 스크롤 */
  useEffect(() => {
    if (loading) return;
    const raf = requestAnimationFrame(() => {
      const container = sidebarScrollRef.current;
      const item      = activeSidebarItemRef.current;
      if (!container || !item) return;
      const cRect = container.getBoundingClientRect();
      const iRect = item.getBoundingClientRect();
      const target = container.scrollTop + (iRect.top - cRect.top) - cRect.height / 2 + iRect.height / 2;
      container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [currentPage?.id, sidebarOpen, loading]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <p className="text-gray-500">로딩 중...</p>
    </div>
  );

  /* 상태 배너 */
  const renderStatusBanner = () => {
    const s = submission?.status;
    if (!s || s === 'draft') return null;
    const configs = {
      submitted:      { bg: 'bg-green-600',  text: '제출 완료. 교사의 채점을 기다리세요.' },
      late_submitted: { bg: 'bg-yellow-500', text: '지연 제출 완료. 교사의 채점을 기다리세요.' },
      rejected: {
        bg: 'bg-orange-500',
        text: `반려되었습니다.${submission.rejectionComment ? ` 사유: ${submission.rejectionComment}` : ''} 수정 후 다시 제출하세요.`,
      },
      graded: {
        bg: 'bg-blue-600',
        text: `채점 완료: ${submission.score != null ? `${submission.score}/${submission.maxScore ?? assignment?.maxScore}점` : '점수 없음'}`,
      },
    };
    const cfg = configs[s];
    if (!cfg) return null;
    return (
      <div className={`${cfg.bg} text-white text-xs font-medium px-4 py-2 flex-shrink-0`}>
        {cfg.text}
      </div>
    );
  };

  const canSubmit = !isLocked && submission?.status !== 'submitted';
  const fileCount = (submissionFiles.length - deletedFileIds.size) + newFiles.length;

  return (
    <div className="flex flex-col bg-gray-100" style={{ height: '100vh' }}>

      {/* 내비게이션 바 */}
      <div className="h-14 bg-white shadow-sm flex items-center justify-between px-4 border-b flex-shrink-0 sticky top-0 z-[60]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(assignment?.classroomId ? `/student/classrooms/${assignment.classroomId}?tab=assignments` : '/student/classrooms')}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-900">{assignment?.title}</span>
        </div>

        <div className="flex items-center gap-2">
          {drawMode && !isLocked && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
              {saveStatus === 'saved' ? '저장됨' : '저장 중...'}
            </span>
          )}

          {/* PDF 다운로드 */}
          {currentPage && noteElements && (
            <PdfDownloadButton
              onClick={() => {
                const title = `${user?.name || '학생'}_${assignment?.title || '과제'}_${currentPage.position + 1}p`;
                downloadPage(title, noteElements, savedFilesRef.current, currentPage.imageUrl, bgPositionRef.current);
              }}
              onDownloadAll={async () => {
                const title = `${user?.name || '학생'}_${assignment?.title || '과제'}_전체`;
                try {
                  const notes = await api.get(
                    `/api/assignment-notes/${assignmentId}/bulk?pageIds=${pages.map(p => p.id).join(',')}`
                  );
                  const notesMap = Object.fromEntries((notes || []).map(n => [n.pageId, n.excalidrawData]));

                  const pageDataList = pages.map(pg => {
                    const note = notesMap[pg.id] || { elements: [], files: {}, bgPosition: null };
                    return {
                      bgUrl: pg.imageUrl,
                      elements: note.elements || [],
                      files: note.files || {},
                      bgPosition: note.bgPosition,
                    };
                  });
                  downloadMultiplePages(title, pageDataList);
                } catch (err) {
                  console.error('PDF 다운로드 실패:', err);
                  alert('PDF 다운로드 중 오류가 발생했습니다.');
                }
              }}
              isDownloading={isDownloading}
              className="mt-0 ml-1 py-1 px-2 text-[10px]"
            />
          )}

          {/* 파일 첨부 토글 */}
          <button
            onClick={() => setShowFilesPanel(v => !v)}
            title="파일 첨부"
            className={`relative p-1.5 rounded-md transition-colors cursor-pointer ${
              showFilesPanel ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Paperclip className="h-5 w-5" />
            {fileCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-600 text-white text-[10px] rounded-full flex items-center justify-center">
                {fileCount}
              </span>
            )}
          </button>

          {/* 업로드 진행률 */}
          {uploadProgress && (
            <span className="text-xs text-purple-600">{uploadProgress}</span>
          )}

          {/* 제출 버튼 */}
          {canSubmit && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              title={submitting ? '제출 중...' : '제출하기'}
              className="flex items-center justify-center p-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? <Loader className="animate-spin h-5 w-5" /> : <Send className="h-5 w-5" />}
            </button>
          )}

          {/* 교사 필기 모달 */}
          <button
            onClick={() => setShowTeacherNotesModal((v) => !v)}
            title="교사 필기"
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              showTeacherNotesModal
                ? 'bg-amber-100 text-amber-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <GraduationCap className="h-5 w-5" />
          </button>

          {/* 필기 모드 토글 (편집 가능할 때만) */}
          {!isLocked && (
            <button
              onClick={() => setDrawMode((v) => !v)}
              title={drawMode ? '뷰 모드로 전환' : '필기 모드로 전환'}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${drawMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}

          {drawMode && !isLocked && (
            <button onClick={() => setToolbarCollapsed((v) => !v)}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer">
              {toolbarCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          )}

          <button
            onClick={() => prevPage && navigate(`/student/assignments/${assignmentId}/page/${prevPage.id}`)}
            disabled={!prevPage}
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.length > 0 && (
            <span className="text-sm text-gray-400 min-w-[3rem] text-center">
              {currentIndex + 1} / {pages.length}
            </span>
          )}
          <button
            onClick={() => nextPage && navigate(`/student/assignments/${assignmentId}/page/${nextPage.id}`)}
            disabled={!nextPage}
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer">
            <ChevronRight className="h-4 w-4" />
          </button>

          <button onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 상태 배너 */}
      {renderStatusBanner()}

      {/* 필기 툴바 */}
      {drawMode && !toolbarCollapsed && !isLocked && (
        <DrawingToolbar
          apiRef={excalidrawAPIRef}
          showPanel={showExcalidrawPanel}
          onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
          screenLocked={screenLocked}
          onToggleScreenLock={handleToggleScreenLock}
        />
      )}

      {/* 파일 첨부 패널 */}
      {showFilesPanel && (
        <FileAttachmentPanel
          readOnly={isLocked}
          existingFiles={submissionFiles}
          newFiles={newFiles}
          deletedFileIds={deletedFileIds}
          onFileAdd={handleFileAdd}
          onRemoveNew={handleRemoveNewFile}
          onRemoveExisting={handleRemoveExistingFile}
          fileError={fileError}
          fileInputRef={fileInputRef}
          maxFiles={5}
        />
      )}

      {/* 본문 */}
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <div ref={sidebarScrollRef} className="w-44 bg-white border-r overflow-y-auto flex-shrink-0">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">페이지</span>
              <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 p-2">
              {pages.map((pg, idx) => (
                <button key={pg.id}
                  ref={pg.id === currentPage?.id ? activeSidebarItemRef : null}
                  onClick={() => navigate(`/student/assignments/${assignmentId}/page/${pg.id}`)}
                  className={`relative block w-full rounded-md overflow-hidden transition-colors text-left ${pg.id === currentPage?.id ? 'border-4 border-blue-500' : 'border-4 border-transparent hover:border-gray-300'}`}
                >
                  <img src={pg.imageUrl} alt={`페이지 ${idx + 1}`} className="w-full h-auto object-contain bg-white" loading="lazy" decoding="async" />
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs text-center py-0.5">
                    {idx + 1}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Excalidraw */}
        <div ref={containerRef} style={GRID_STYLE} className="flex-1 relative overflow-hidden">
          <style>{ALWAYS_HIDE_CSS}{TOUCH_CSS}{(drawMode && showExcalidrawPanel) ? '' : PANEL_HIDE_CSS}</style>
          {currentPage ? (
            <ExcalidrawErrorBoundary key={currentPage.id}>
            <Excalidraw
              excalidrawAPI={handleExcalidrawMount}
              viewModeEnabled={false}
              initialData={{
                elements: noteElements,
                appState: {
                  viewBackgroundColor:    'transparent',
                  currentItemStrokeColor: '#1e1e1e',
                  currentItemStrokeWidth: 2,
                  scrollX: 0, scrollY: 0,
                },
              }}
              onChange={handleExcalidrawChange}
              UIOptions={EXCALIDRAW_UI_OPTIONS}
            />
            </ExcalidrawErrorBoundary>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              페이지가 없습니다.
            </div>
          )}
        </div>
      </div>

      {/* 교사 필기 모달 */}
      {showTeacherNotesModal && currentPage && (
        <TeacherNotesModal
          page={currentPage}
          onClose={() => setShowTeacherNotesModal(false)}
        />
      )}
    </div>
  );
};

export default AssignmentStudyViewer;
