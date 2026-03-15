import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Pencil, ChevronUp, ChevronDown, Menu,
  CheckCircle, XCircle, Trophy, Loader, X, Paperclip
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

const TEACHER_COMMENT_PREFIX = '__atc_';

const STUDENT_NOTE_PREFIX = '__asn_sn_';

const AssignmentWorkViewer = () => {
  const { classroomId, assignmentId, studentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [assignment, setAssignment]         = useState(null);
  const [pages, setPages]                   = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [studentProfile, setStudentProfile] = useState(null);
  const [submission, setSubmission]         = useState(null);
  const [commentMode, setCommentMode]       = useState(false);
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [saveStatus, setSaveStatus]         = useState('saved');
  const [showExcalidrawPanel, setShowExcalidrawPanel] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [loading, setLoading]               = useState(true);
  const [submissionFiles, setSubmissionFiles] = useState([]);
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const { isDownloading, downloadPage, downloadMultiplePages } = usePdfDownloader();

  /* 채점 UI 상태 */
  const [scoreInput, setScoreInput]         = useState('');
  const [grading, setGrading]               = useState(false);
  const [rejectionText, setRejectionText]   = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const excalidrawAPIRef     = useRef(null);
  const saveTimerRef         = useRef(null);
  const currentPageRef       = useRef(null);
  const bgPositionRef        = useRef(null);
  const containerRef         = useRef(null);
  const mountedRef           = useRef(true);
  const commentModeRef       = useRef(false);
  const lastSavedRef         = useRef(null);
  const savedStudentFilesRef = useRef({});
  const savedTeacherFilesRef = useRef({});
  const activeSidebarItemRef = useRef(null);
  const sidebarScrollRef     = useRef(null);
  const studentEls           = useRef([]);
  const teacherEls           = useRef([]);
  const [screenLocked, setScreenLocked] = useState(false);
  const screenLockedRef   = useRef(false);
  const screenLockBaseRef = useRef({ zoom: 1, scrollX: 0, scrollY: 0 });
  const isRestoringRef       = useRef(false);
  const baseStrokeWidthRef   = useRef(parseFloat(localStorage.getItem('mc_stroke_width') || '0.2'));
  const lastZoomRef          = useRef(1);
  const isAdjustingWidthRef  = useRef(false);
  useEffect(() => { screenLockedRef.current = screenLocked; }, [screenLocked]);

  useExcalidrawTouch({ excalidrawAPIRef, containerRef, screenLockedRef, baseStrokeWidthRef });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const currentPage = pages[currentPageIndex] || null;
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { commentModeRef.current = commentMode; }, [commentMode]);

  useEffect(() => {
    if (commentMode && excalidrawAPIRef.current) {
      const apiRef = excalidrawAPIRef.current;
      const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
      const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
      const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.2');
      const validTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
      const excTool = savedTool === 'triangle' ? 'freedraw' : (validTools.includes(savedTool) ? savedTool : 'freedraw');
      baseStrokeWidthRef.current = savedWidth;
      const zoom = apiRef.getAppState()?.zoom?.value || 1;
      lastZoomRef.current = zoom;
      apiRef.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth / zoom, currentItemRoundness: 'sharp' }, commitToHistory: false });
      apiRef.setActiveTool({ type: excTool });
    }
  }, [commentMode]);

  /* 초기 데이터 로드 */
  useEffect(() => {
    const fetchData = async () => {
      if (!mountedRef.current) return;
      setLoading(true);
      try {
        const [asnData, pgsData, profileData, subsData] = await Promise.all([
          api.get(`/api/assignments/${assignmentId}`),
          api.get(`/api/assignments/${assignmentId}/pages`),
          api.get(`/api/profiles/${studentId}`),
          api.get(`/api/assignments/${assignmentId}/submissions`),
        ]);
        if (!mountedRef.current) return;
        setAssignment(asnData);
        setPages(pgsData || []);
        setStudentProfile(profileData);
        // Find this student's submission from the list
        const studentSub = (subsData || []).find(s => s.studentId === studentId) || null;
        setSubmission(studentSub);
        if (studentSub?.score != null) setScoreInput(String(studentSub.score));

        // 제출 파일 로드
        try {
          const files = await api.get(`/api/submissions/${assignmentId}/files?studentId=${studentId}`);
          setSubmissionFiles(files || []);
        } catch { /* ignore */ }
      } catch (err) {
        console.error('데이터 로드 실패:', err);
      }
      setLoading(false);
    };
    fetchData();
  }, [assignmentId, studentId]);

  /* Socket.IO: 학생 과제 필기 실시간 구독 */
  useEffect(() => {
    if (!currentPage) return;
    return subscribeToRoom(
      `asn-work:${currentPage.id}:${studentId}`,
      'asn-note:updated',
      async () => {
        const excApi = excalidrawAPIRef.current;
        if (!excApi) return;
        try {
          const snData = await api.get(`/api/assignment-notes/${assignmentId}/${currentPage.id}?studentId=${studentId}`);
          const newStudentEls = (snData?.excalidrawData?.elements || []).map((el) => ({
            ...el, id: STUDENT_NOTE_PREFIX + el.id, locked: true, opacity: 60,
          }));
          studentEls.current = newStudentEls;
          bgPositionRef.current = snData?.excalidrawData?.bgPosition ?? bgPositionRef.current;
          const newStudentFiles = snData?.excalidrawData?.files ?? {};
          if (Object.keys(newStudentFiles).length > 0) {
            excApi.addFiles(Object.values(newStudentFiles));
            savedStudentFilesRef.current = { ...savedStudentFilesRef.current, ...newStudentFiles };
          }
          const preserved = excApi.getSceneElements().filter(
            (el) => !el.id.startsWith(STUDENT_NOTE_PREFIX)
          );
          excApi.updateScene({ elements: [...preserved, ...newStudentEls], commitToHistory: false });
        } catch (err) {
          console.error('학생 필기 실시간 갱신 실패:', err);
        }
      }
    );
  }, [currentPage?.id, studentId, assignmentId]);

  /* 페이지 변경 시 데이터 로드 */
  useEffect(() => {
    if (!currentPage) return;
    const loadPageData = async () => {
      bgPositionRef.current = null;
      studentEls.current  = [];
      teacherEls.current  = [];
      lastSavedRef.current = null;

      try {
        const [snData, tcData] = await Promise.all([
          api.get(`/api/assignment-notes/${assignmentId}/${currentPage.id}?studentId=${studentId}`),
          api.get(`/api/assignment-comments/${currentPage.id}/${studentId}`),
        ]);

        studentEls.current = (snData?.excalidrawData?.elements || []).map((el) => ({
          ...el, id: STUDENT_NOTE_PREFIX + el.id, locked: true, opacity: 60,
        }));
        bgPositionRef.current = snData?.excalidrawData?.bgPosition ?? null;
        savedStudentFilesRef.current = snData?.excalidrawData?.files ?? {};
        teacherEls.current           = tcData?.excalidrawData?.elements || [];
        savedTeacherFilesRef.current = tcData?.excalidrawData?.files ?? {};
      } catch (err) {
        console.error('페이지 데이터 로드 실패:', err);
      }
      rebuildScene();
    };
    loadPageData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage?.id, studentId, assignmentId]);

  const rebuildScene = useCallback(async () => {
    const apiRef = excalidrawAPIRef.current;
    if (!apiRef || !currentPageRef.current?.imageUrl || !containerRef.current) return;
    try {
      const { dataUrl, mimeType } = await fetchAsDataUrl(currentPageRef.current.imageUrl);
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
      apiRef.addFiles([{ id: BG_FILE_ID, dataURL: dataUrl, mimeType, created: Date.now() }]);
      const sf = Object.values(savedStudentFilesRef.current);
      const tf = Object.values(savedTeacherFilesRef.current);
      if (sf.length > 0 || tf.length > 0) apiRef.addFiles([...sf, ...tf]);
      await new Promise((r) => requestAnimationFrame(r));
      const bgEl = createBgElement(bgX, bgY, bgW, bgH);
      apiRef.updateScene({ elements: [bgEl, ...studentEls.current, ...teacherEls.current], commitToHistory: false });
    } catch (err) {
      console.error('scene 재구성 실패:', err);
      apiRef.updateScene({ elements: [...studentEls.current, ...teacherEls.current], commitToHistory: false });
    }
  }, []);

  const handleToggleScreenLock = useCallback(() => {
    setScreenLocked(prev => {
      if (!prev && excalidrawAPIRef.current) {
        const s = excalidrawAPIRef.current.getAppState();
        screenLockBaseRef.current = { zoom: s.zoom.value, scrollX: s.scrollX, scrollY: s.scrollY };
      }
      return !prev;
    });
  }, []);

  const handleExcalidrawMount = useCallback(async (apiRef) => {
    excalidrawAPIRef.current = apiRef;
    const savedTool  = localStorage.getItem('mc_active_tool') || 'freedraw';
    const savedColor = localStorage.getItem('mc_tool_color')  || '#e03131';
    const savedWidth = parseFloat(localStorage.getItem('mc_stroke_width') || '0.4');
    const validTools = ['freedraw', 'selection', 'text', 'line', 'rectangle', 'ellipse'];
    const excTool = savedTool === 'triangle' ? 'freedraw' : (validTools.includes(savedTool) ? savedTool : 'freedraw');
    baseStrokeWidthRef.current = savedWidth;
    const zoom = apiRef.getAppState()?.zoom?.value || 1;
    lastZoomRef.current = zoom;
    apiRef.updateScene({ appState: { currentItemStrokeColor: savedColor, currentItemStrokeWidth: savedWidth / zoom, currentItemRoundness: 'sharp' }, commitToHistory: false });
    apiRef.setActiveTool({ type: excTool });
    await new Promise((r) => setTimeout(r, 0));
    await rebuildScene();
  }, [rebuildScene]);

  const handleExcalidrawChange = useCallback((elements, appState) => {
    if (isRestoringRef.current || isAdjustingWidthRef.current) return;

    /* 줌-독립 펜 두께 */
    if (appState && appState.zoom?.value !== lastZoomRef.current) {
      lastZoomRef.current = appState.zoom.value;
      const tool = excalidrawAPIRef.current?.getAppState()?.activeTool?.type;
      if (tool === 'freedraw' && baseStrokeWidthRef.current) {
        isAdjustingWidthRef.current = true;
        excalidrawAPIRef.current?.updateScene({
          appState: { currentItemStrokeWidth: baseStrokeWidthRef.current / appState.zoom.value },
          commitToHistory: false,
        });
        requestAnimationFrame(() => { isAdjustingWidthRef.current = false; });
      }
    }

    if (appState && screenLockedRef.current) {
      const base = screenLockBaseRef.current;
      if (appState.zoom.value !== base.zoom ||
          appState.scrollX !== base.scrollX ||
          appState.scrollY !== base.scrollY) {
        isRestoringRef.current = true;
        excalidrawAPIRef.current?.updateScene({
          appState: {
            zoom: { value: base.zoom },
            scrollX: base.scrollX,
            scrollY: base.scrollY,
          }
        });
        requestAnimationFrame(() => { isRestoringRef.current = false; });
        return;
      }
    }

    if (!commentModeRef.current) return;
    const page = currentPageRef.current;
    if (!user || !page) return;
    const filtered = elements.filter(
      (el) => el.id !== BG_ELEMENT_ID && !el.id.startsWith(STUDENT_NOTE_PREFIX) && !el.isDeleted
    );
    const serialized = JSON.stringify(filtered.map((el) => ({ id: el.id, type: el.type, x: el.x, y: el.y, points: el.points, text: el.text, width: el.width, height: el.height, strokeColor: el.strokeColor, strokeWidth: el.strokeWidth })));
    if (serialized === lastSavedRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      setSaveStatus('saving');
      teacherEls.current = filtered;
      const allFiles = excalidrawAPIRef.current?.getFiles() ?? {};
      const teacherFiles = Object.fromEntries(
        Object.entries(allFiles).filter(([id]) => id !== BG_FILE_ID && !savedStudentFilesRef.current[id])
      );
      savedTeacherFilesRef.current = teacherFiles;
      try {
        await api.put(`/api/assignment-comments/${page.id}/${studentId}`, {
          excalidrawData: {
            elements: filtered,
            ...(Object.keys(teacherFiles).length > 0 && { files: teacherFiles }),
          },
        });
      } catch (err) {
        console.error('코멘트 저장 실패:', err);
      }
      if (mountedRef.current) { lastSavedRef.current = serialized; setSaveStatus('saved'); }
    }, 1500);
  }, [user, studentId]);

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
  }, [currentPageIndex, sidebarOpen, loading]);

  useEffect(() => {
    if (pages.length === 0) return;
    prefetchImages([pages[currentPageIndex - 1]?.imageUrl, pages[currentPageIndex + 1]?.imageUrl].filter(Boolean));
  }, [currentPageIndex, pages]);

  const goPage = (idx) => { if (idx >= 0 && idx < pages.length) setCurrentPageIndex(idx); };

  /* 채점 완료 */
  const handleGrade = async () => {
    const score = parseInt(scoreInput);
    if (isNaN(score) || score < 0) return;
    setGrading(true);
    try {
      const data = await api.put(`/api/submissions/${assignmentId}`, {
        studentId,
        status: 'graded',
        score,
        maxScore: assignment?.maxScore,
      });
      if (data) setSubmission(data);
    } catch (err) {
      console.error('채점 실패:', err);
    }
    setGrading(false);
  };

  /* 반려 */
  const handleReject = async () => {
    if (!rejectionText.trim()) return;
    setGrading(true);
    try {
      const data = await api.put(`/api/submissions/${assignmentId}`, {
        studentId,
        status: 'rejected',
        rejectionComment: rejectionText.trim(),
      });
      if (data) setSubmission(data);
    } catch (err) {
      console.error('반려 실패:', err);
    }
    setGrading(false);
    setShowRejectModal(false);
    setRejectionText('');
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <p className="text-gray-500">로딩 중...</p>
    </div>
  );

  const canGrade = ['submitted', 'late_submitted'].includes(submission?.status);
  const maxScore = assignment?.maxScore ?? 100;

  return (
    <div className="flex flex-col bg-gray-100" style={{ height: '100vh' }}>

      {/* 내비게이션 바 */}
      <div className="h-14 bg-white shadow-sm flex items-center justify-between px-4 border-b flex-shrink-0 sticky top-0 z-[60]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/teacher/classrooms/${classroomId}/assignments/${assignmentId}/monitor`)}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-900">{assignment?.title}</span>
          <span className="text-sm text-gray-500">— {studentProfile?.name || '학생'}</span>
        </div>

        <div className="flex items-center gap-2">
          {commentMode && (
            <span className={`text-xs ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
              {saveStatus === 'saved' ? '저장됨' : '저장 중...'}
            </span>
          )}

          {/* 채점 UI */}
          <div className="flex items-center gap-1.5 border border-gray-200 rounded-md px-2 py-1">
            <Trophy className="h-4 w-4 text-gray-400" />
            <input
              type="number"
              min={0}
              max={maxScore}
              value={scoreInput}
              onChange={(e) => setScoreInput(e.target.value)}
              placeholder="점수"
              className="w-14 text-sm text-center border-none outline-none bg-transparent"
              disabled={!canGrade}
            />
            <span className="text-xs text-gray-400">/ {maxScore}</span>
          </div>

          {canGrade && (
            <>
              <button
                onClick={() => setShowRejectModal(true)}
                title="반려"
                className="p-1.5 text-orange-700 bg-orange-100 rounded-md hover:bg-orange-200 cursor-pointer flex items-center justify-center"
              >
                <XCircle className="h-5 w-5" />
              </button>
              <button
                onClick={handleGrade}
                disabled={grading || scoreInput === ''}
                title={grading ? '처리 중...' : '채점완료'}
                className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer flex items-center justify-center"
              >
                {grading ? <Loader className="animate-spin h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
              </button>
            </>
          )}
          {submission?.status === 'graded' && (
            <span className="text-xs font-medium text-blue-600 px-2 py-1 bg-blue-50 rounded-md">
              채점완료 {submission.score}/{submission.maxScore ?? maxScore}점
            </span>
          )}
          {submission?.status === 'rejected' && (
            <span className="text-xs font-medium text-orange-600 px-2 py-1 bg-orange-50 rounded-md">반려됨</span>
          )}

          {/* 첨부파일 */}
          <button
            onClick={() => setShowFilesPanel(v => !v)}
            title={`첨부파일 ${submissionFiles.length}개`}
            className={`relative p-1.5 rounded-md transition-colors cursor-pointer ${
              showFilesPanel ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Paperclip className="h-5 w-5" />
            {submissionFiles.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-600 text-white text-[10px] rounded-full flex items-center justify-center">
                {submissionFiles.length}
              </span>
            )}
          </button>

          {/* PDF 다운로드 */}
          {currentPage && studentEls.current && (
            <PdfDownloadButton
              onClick={() => {
                const title = `${studentProfile?.name || '학생'}_${assignment?.title || '과제'}_${currentPage.position + 1}p`;
                const elsToDownload = [...studentEls.current, ...teacherEls.current];
                const filesToDownload = { ...savedStudentFilesRef.current, ...savedTeacherFilesRef.current };
                downloadPage(title, elsToDownload, filesToDownload, currentPage.imageUrl, bgPositionRef.current);
              }}
              onDownloadAll={async () => {
                const title = `${studentProfile?.name || '학생'}_${assignment?.title || '과제'}_전체`;
                try {
                  // Fetch all notes for this student in this assignment
                  const studentNotes = await api.get(
                    `/api/assignment-notes/${assignmentId}/bulk?pageIds=${pages.map(p => p.id).join(',')}&studentId=${studentProfile.id}`
                  );
                  const studentNotesMap = Object.fromEntries((studentNotes || []).map(n => [n.pageId, n.excalidrawData]));

                  // Fetch all teacher comments for this student — individual per page
                  const teacherCommentPromises = pages.map(pg =>
                    api.get(`/api/assignment-comments/${pg.id}/${studentProfile.id}`).catch(() => null)
                  );
                  const teacherCommentResults = await Promise.all(teacherCommentPromises);
                  const teacherNotesMap = {};
                  pages.forEach((pg, idx) => {
                    if (teacherCommentResults[idx]?.excalidrawData) {
                      teacherNotesMap[pg.id] = teacherCommentResults[idx].excalidrawData;
                    }
                  });

                  const pageDataList = pages.map(pg => {
                    const sNote = studentNotesMap[pg.id] || { elements: [], files: {}, bgPosition: null };
                    const tNote = teacherNotesMap[pg.id] || { elements: [], files: {} };

                    const sEls = sNote.elements || [];
                    const tEls = (tNote.elements || []).map(el => ({ ...el, id: TEACHER_COMMENT_PREFIX + el.id, locked: true, opacity: 60 }));

                    return {
                      bgUrl: pg.imageUrl,
                      elements: [...sEls, ...tEls],
                      files: { ...(sNote.files || {}), ...(tNote.files || {}) },
                      bgPosition: sNote.bgPosition,
                    };
                  });
                  downloadMultiplePages(title, pageDataList);
                } catch (err) {
                  console.error('PDF 다운로드 실패:', err);
                  alert('PDF 다운로드 중 오류가 발생했습니다.');
                }
              }}
              isDownloading={isDownloading}
              className="py-1 px-2 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            />
          )}

          <button
            onClick={() => setCommentMode((v) => !v)}
            title={commentMode ? '코멘트 모드 → 보기 모드' : '보기 모드 → 코멘트 모드'}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${commentMode ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
          >
            <Pencil className="h-4 w-4" />
          </button>

          {commentMode && (
            <button onClick={() => setToolbarCollapsed((v) => !v)}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer">
              {toolbarCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          )}

          <button onClick={() => goPage(currentPageIndex - 1)} disabled={currentPageIndex === 0}
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.length > 0 && (
            <span className="text-sm text-gray-400 min-w-[3rem] text-center">
              {currentPageIndex + 1} / {pages.length}
            </span>
          )}
          <button onClick={() => goPage(currentPageIndex + 1)} disabled={currentPageIndex >= pages.length - 1}
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer">
            <ChevronRight className="h-4 w-4" />
          </button>

          <button onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 text-gray-500 hover:text-gray-700 cursor-pointer">
            {sidebarOpen ? <ChevronRight className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* 필기 툴바 */}
      {commentMode && !toolbarCollapsed && (
        <DrawingToolbar
          apiRef={excalidrawAPIRef}
          showPanel={showExcalidrawPanel}
          onTogglePanel={() => setShowExcalidrawPanel((v) => !v)}
          screenLocked={screenLocked}
          onToggleScreenLock={handleToggleScreenLock}
          onBaseWidthChange={(w) => { baseStrokeWidthRef.current = w; }}
        />
      )}

      {/* 파일 첨부 패널 (읽기 전용) */}
      {showFilesPanel && (
        <FileAttachmentPanel
          readOnly={true}
          existingFiles={submissionFiles}
          newFiles={[]}
          deletedFileIds={new Set()}
          onFileAdd={() => {}}
          onRemoveNew={() => {}}
          onRemoveExisting={() => {}}
          fileError=""
          fileInputRef={{ current: null }}
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
                <button
                  key={pg.id}
                  ref={idx === currentPageIndex ? activeSidebarItemRef : null}
                  onClick={() => goPage(idx)}
                  className={`relative block w-full rounded-md overflow-hidden transition-colors text-left ${
                    idx === currentPageIndex ? 'border-4 border-indigo-500' : 'border-4 border-transparent hover:border-gray-300'
                  }`}
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

        <div ref={containerRef} style={GRID_STYLE} className="flex-1 relative overflow-hidden">
          <style>{ALWAYS_HIDE_CSS}{TOUCH_CSS}{showExcalidrawPanel ? '' : PANEL_HIDE_CSS}</style>
          {currentPage ? (
            <ExcalidrawErrorBoundary key={currentPage.id}>
            <Excalidraw
              excalidrawAPI={handleExcalidrawMount}
              viewModeEnabled={false}
              initialData={{
                elements: [],
                appState: { viewBackgroundColor: 'transparent', currentItemStrokeColor: '#e03131', currentItemStrokeWidth: 2, scrollX: 0, scrollY: 0 },
              }}
              onChange={handleExcalidrawChange}
              UIOptions={EXCALIDRAW_UI_OPTIONS}
            />
            </ExcalidrawErrorBoundary>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">페이지가 없습니다.</div>
          )}
        </div>
      </div>

      {/* 반려 모달 */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-3">반려 사유</h2>
            <textarea
              autoFocus
              value={rejectionText}
              onChange={(e) => setRejectionText(e.target.value)}
              placeholder="학생에게 전달할 반려 사유를 입력하세요"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-orange-400 focus:border-orange-400 resize-none mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowRejectModal(false); setRejectionText(''); }} title="취소"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer flex items-center justify-center">
                <X className="h-5 w-5" />
              </button>
              <button onClick={handleReject} disabled={grading || !rejectionText.trim()} title={grading ? '처리 중...' : '반려하기'}
                className="p-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 cursor-pointer flex items-center justify-center">
                {grading ? <Loader className="animate-spin h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignmentWorkViewer;
