/*
 * 챕터·과제 편집기 공용 "이미지·PDF 페이지 추가" 흐름.
 * 1차: 파일명 순으로 정렬하고 PDF 를 검사해 쪽수를 얻는다(실패한 PDF 는 onRejected 후 제외).
 * 2차: planPagePositions 로 잡은 위치대로 순차 업로드 — 이미지는 1장씩, PDF 는 1번 업로드 + 쪽수만큼 배치 생성.
 * 편집기는 업로드/생성 API 호출만 넘긴다.
 */
import { inspectPdf, isPdfFile, planPagePositions } from './pdfImport'

/**
 * @param {object} opts
 * @param {File[]} opts.files
 * @param {number} opts.basePosition 첫 새 페이지의 position
 * @param {(file: File, position: number) => Promise<object>} opts.uploadImage 이미지 업로드 + 페이지 생성, 생성된 페이지 반환
 * @param {(file: File) => Promise<string>} opts.uploadPdf PDF 업로드, 저장 URL 반환
 * @param {(items: { pdfUrl: string, pdfPage: number, position: number }[]) => Promise<object[]>} opts.createPages 배치 생성
 * @param {(p: { done: number, total: number, label: string | null }) => void} opts.onProgress
 * @param {(file: File, message: string) => void} opts.onRejected 등록할 수 없는 PDF
 * @returns {Promise<object | null>} 마지막으로 처리한 파일의 페이지(PDF 는 첫 쪽) — 선택용
 */
export async function uploadPagesWithPdf({
  files, basePosition, uploadImage, uploadPdf, createPages, onProgress, onRejected, inspect = inspectPdf,
}) {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  const accepted = []
  for (const file of sorted) {
    if (!isPdfFile(file)) {
      accepted.push({ file, entry: { kind: 'image' } })
      continue
    }
    const result = await inspect(file)
    if (result.ok) accepted.push({ file, entry: { kind: 'pdf', numPages: result.numPages } })
    else onRejected(file, result.message)
  }

  const plan = planPagePositions(accepted.map((a) => a.entry), basePosition)
  const total = accepted.length
  let selected = null

  for (let i = 0; i < total; i++) {
    const { file, entry } = accepted[i]
    const { start, count } = plan[i]
    try {
      if (entry.kind === 'pdf') {
        onProgress({ done: i, total, label: `쪽 생성 중 (파일 ${i + 1}/${total})` })
        const pdfUrl = await uploadPdf(file)
        const created = await createPages(
          Array.from({ length: count }, (_, k) => ({ pdfUrl, pdfPage: k + 1, position: start + k })),
        )
        if (created?.[0]) selected = created[0]
      } else {
        onProgress({ done: i, total, label: null })
        const page = await uploadImage(file, start)
        if (page) selected = page
      }
    } catch (err) {
      console.error(`업로드 실패 (${file.name}):`, err.message)
    }
  }

  onProgress({ done: total, total, label: null })
  return selected
}
