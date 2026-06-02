import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env.js';
import type { OcrProblemResult, SolutionResult } from '@mathchois/shared';

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw Object.assign(new Error('AI 기능이 설정되지 않았습니다. (GEMINI_API_KEY 누락)'), { statusCode: 503 });
  }
  if (!_client) _client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return _client;
}

async function generateJson<T>(parts: object[], responseSchema: object): Promise<T> {
  const ai = client();
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
      config: { responseMimeType: 'application/json', responseSchema },
    });
    const text = res.text ?? '';
    try {
      return JSON.parse(text) as T;
    } catch {
      if (attempt === 1) throw new Error('AI 응답 파싱 실패');
    }
  }
  throw new Error('unreachable');
}

function imagePart(mimeType: string, base64: string) {
  return { inlineData: { mimeType, data: base64 } };
}

const SOLUTION_OCR_RULE = `다음 규칙으로 학생이 손으로 쓴 수학 풀이 이미지를 변환하라.
- 풀이 전체를 Markdown + LaTeX 로 변환한다. 인라인 수식은 $...$, 디스플레이 수식은 $$...$$.
- 손글씨를 최대한 충실히 옮긴다(맞춤·교정하지 말 것). 한국어가 아닌 텍스트는 한국어로.
- 학생이 그린 그래프·도형·표는 본문에 자연어 설명으로 보존한다.`;

const REVIEW_RULE = `너는 고등 수학 첨삭 선생님이다. 학생 풀이를 검토해 코칭하라.
이미지에는 손글씨 수식뿐 아니라 학생이 직접 그린 그래프·도형·표 등 시각 요소가 포함될 수 있다. 이를 변환된 LaTeX 풀이와 함께 판독·평가하라.
코칭 원칙(스캐폴딩): 오답이거나 막혔으면 정답·전체 풀이를 통째로 제시하지 말고, 학생이 스스로 해결하도록 '다음 한 걸음'에 해당하는 디딤돌 힌트만 짚어라. 정답이면 맞혔음을 알리고 칭찬한 뒤 다른 접근법을 짧게 소개하라.
스타일: 잘한 점 → 오류 위치/이유 → 다음 한 걸음 힌트 → 학습 조언. 존댓말, 이모지 적절히.
commentMarkdown은 학생용 첨삭(Markdown+LaTeX). errorTags는 [conceptual, computational, logical, notational, strategic, condition] 중에서. conceptTags는 다룬 개념명. strengthNotes/weaknessNotes는 교사용 짧은 메모.`;

const PROBLEM_RULE = `다음 규칙으로 수학 문제 이미지를 변환하라.
- 본문을 Markdown + LaTeX 로 변환한다. 인라인 수식은 $...$, 디스플레이 수식은 $$...$$.
- 한국어가 아닌 텍스트는 한국어로 번역하되 수학 표기는 유지한다.
- 강조는 **굵게** 로 표기한다(\\textbf 금지).
- 그래프·도형·표 등 그림 요소는 본문 안에 [FIGURE:1], [FIGURE:2] 처럼 1부터 순번을 매겨 표기하고,
  같은 순서로 figureNotes 배열에 각 그림의 한국어 설명을 넣는다.
  본문의 [FIGURE:n] 개수와 figureNotes 길이는 반드시 일치해야 한다.
- meta 에 과목(subject)·대단원(majorUnit)·소단원(minorUnit)·난이도(difficulty: 상/중/하)
  ·유형(problemType)·세부유형(detailType)·키워드(keywords[]) 를 추출한다.`;

const MARKSCHEME_RULE = `다음 규칙으로 교사가 제공한 정답/풀이(마크스킴) 이미지를 변환하라.
- answer: 간결한 최종 정답.
- solution: 단계별 풀이를 Markdown + LaTeX 로. 인라인 $...$, 디스플레이 $$...$$.
- 한국어가 아닌 텍스트는 한국어로 번역한다.`;

const SOLUTION_RULE = `너는 고등 수학 교사다. 아래 문제(Markdown+LaTeX)의 정답과 단계별 해설을 작성하라.
- answer: 간결한 최종 정답.
- solution: 학생이 이해할 단계별 풀이를 Markdown + LaTeX 로. 인라인 $...$, 디스플레이 $$...$$.`;

const META_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING }, majorUnit: { type: Type.STRING },
    minorUnit: { type: Type.STRING }, difficulty: { type: Type.STRING },
    problemType: { type: Type.STRING }, detailType: { type: Type.STRING },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
};

export async function ocrProblem(mimeType: string, base64: string): Promise<OcrProblemResult> {
  return generateJson<OcrProblemResult>(
    [imagePart(mimeType, base64), { text: `${PROBLEM_RULE}\n위 문제 이미지를 변환하라.` }],
    {
      type: Type.OBJECT,
      properties: {
        latex: { type: Type.STRING },
        figureNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
        meta: META_SCHEMA,
      },
    },
  );
}

export async function ocrMarkscheme(mimeType: string, base64: string): Promise<SolutionResult> {
  return generateJson<SolutionResult>(
    [imagePart(mimeType, base64), { text: `${MARKSCHEME_RULE}\n위 이미지를 변환하라.` }],
    { type: Type.OBJECT, properties: { answer: { type: Type.STRING }, solution: { type: Type.STRING } } },
  );
}

export async function generateSolution(problemLatex: string): Promise<SolutionResult> {
  return generateJson<SolutionResult>(
    [{ text: `${SOLUTION_RULE}\n\n문제:\n${problemLatex}` }],
    { type: Type.OBJECT, properties: { answer: { type: Type.STRING }, solution: { type: Type.STRING } } },
  );
}

export async function convertSolutionToLatex(mimeType: string, base64: string): Promise<{ latex: string }> {
  return generateJson<{ latex: string }>(
    [imagePart(mimeType, base64), { text: `${SOLUTION_OCR_RULE}\n위 풀이 이미지를 변환하라.` }],
    { type: Type.OBJECT, properties: { latex: { type: Type.STRING } } },
  );
}

export async function reviewSolution(args: {
  problemLatex: string;
  answer: string | null;
  solution: string | null;
  studentLatex: string;
  workMimeType: string;
  workBase64: string;
}): Promise<{
  commentMarkdown: string;
  isCorrect: boolean;
  errorTags: string[];
  conceptTags: string[];
  strengthNotes: string;
  weaknessNotes: string;
}> {
  const text =
    `${REVIEW_RULE}\n\n` +
    `문제(LaTeX): ${args.problemLatex}\n` +
    `정답: ${args.answer ?? '(없음)'}\n` +
    `해설: ${args.solution ?? '(없음)'}\n` +
    `학생 풀이(LaTeX): ${args.studentLatex}\n` +
    `위 캔버스 이미지는 학생의 원본 손글씨 풀이(수식·그래프·도형 포함)다.`;
  return generateJson(
    [imagePart(args.workMimeType, args.workBase64), { text }],
    {
      type: Type.OBJECT,
      properties: {
        commentMarkdown: { type: Type.STRING },
        isCorrect: { type: Type.BOOLEAN },
        errorTags: { type: Type.ARRAY, items: { type: Type.STRING } },
        conceptTags: { type: Type.ARRAY, items: { type: Type.STRING } },
        strengthNotes: { type: Type.STRING },
        weaknessNotes: { type: Type.STRING },
      },
    },
  );
}

export const AI_MODEL_NAME = env.GEMINI_MODEL;
