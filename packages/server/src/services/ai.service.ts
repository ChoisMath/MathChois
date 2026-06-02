import { GoogleGenAI } from '@google/genai';
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

async function generateJson<T>(parts: object[], responseJsonSchema: object): Promise<T> {
  const ai = client();
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
      config: { responseMimeType: 'application/json', responseJsonSchema },
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
  type: 'OBJECT',
  properties: {
    subject: { type: 'STRING' }, majorUnit: { type: 'STRING' },
    minorUnit: { type: 'STRING' }, difficulty: { type: 'STRING' },
    problemType: { type: 'STRING' }, detailType: { type: 'STRING' },
    keywords: { type: 'ARRAY', items: { type: 'STRING' } },
  },
};

export async function ocrProblem(mimeType: string, base64: string): Promise<OcrProblemResult> {
  return generateJson<OcrProblemResult>(
    [imagePart(mimeType, base64), { text: `${PROBLEM_RULE}\n위 문제 이미지를 변환하라.` }],
    {
      type: 'OBJECT',
      properties: {
        latex: { type: 'STRING' },
        figureNotes: { type: 'ARRAY', items: { type: 'STRING' } },
        meta: META_SCHEMA,
      },
    },
  );
}

export async function ocrMarkscheme(mimeType: string, base64: string): Promise<SolutionResult> {
  return generateJson<SolutionResult>(
    [imagePart(mimeType, base64), { text: `${MARKSCHEME_RULE}\n위 이미지를 변환하라.` }],
    { type: 'OBJECT', properties: { answer: { type: 'STRING' }, solution: { type: 'STRING' } } },
  );
}

export async function generateSolution(problemLatex: string): Promise<SolutionResult> {
  return generateJson<SolutionResult>(
    [{ text: `${SOLUTION_RULE}\n\n문제:\n${problemLatex}` }],
    { type: 'OBJECT', properties: { answer: { type: 'STRING' }, solution: { type: 'STRING' } } },
  );
}

export const AI_MODEL_NAME = env.GEMINI_MODEL;
