import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env.js';
import type { OcrProblemResult, SolutionResult } from '@mathchois/shared';
import { buildCurriculumPromptBlock, CURRICULUM_SUBJECTS } from '@mathchois/shared';

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw Object.assign(new Error('AI 기능이 설정되지 않았습니다. (GEMINI_API_KEY 누락)'), { statusCode: 503 });
  }
  if (!_client) _client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return _client;
}

type AiError = Error & { statusCode: number; publicMessage: string };

/** Gemini SDK 가 던지는 ApiError(상태코드 포함)를 사용자용 메시지로 변환한다. */
function toAiError(err: unknown): AiError {
  const status = (err as { status?: number })?.status;
  const rawMessage = (err as { message?: string })?.message ?? '';
  let statusCode = 502;
  let publicMessage = 'AI 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.';
  let logReason = `status=${status ?? '?'}`;
  if (status === 429) {
    statusCode = 429;
    // 429(RESOURCE_EXHAUSTED) 는 월 지출 상한(spend cap)과 요청 속도/할당량(rate limit) 모두에서 나온다.
    // 둘은 대응이 정반대(관리자 조치 vs 재시도)라 응답 메시지로 구분한다.
    if (/spend(ing)?\s*(cap|limit)/i.test(rawMessage)) {
      logReason = 'spend cap exceeded';
      publicMessage = 'AI 월 사용 한도(지출 상한)에 도달했습니다. 관리자에게 문의해 주세요.';
    } else if (/rate limit|requests per|quota|\bRPM\b|\bTPM\b|\bRPD\b/i.test(rawMessage)) {
      logReason = 'rate limit / quota exceeded';
      publicMessage = 'AI 요청이 잠시 몰려 처리량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.';
    } else {
      logReason = 'resource exhausted (429)';
      publicMessage = 'AI 사용량 한도 또는 크레딧이 소진되어 지금은 AI 기능을 사용할 수 없습니다. 관리자에게 문의해 주세요.';
    }
  } else if (status === 400 || status === 404) {
    publicMessage = 'AI 요청이 거부되었습니다. (모델 설정 또는 요청 형식 확인 필요)';
  } else if (typeof status === 'number' && status >= 500) {
    statusCode = 503;
    publicMessage = 'AI 서비스가 일시적으로 불안정합니다. 잠시 후 다시 시도해 주세요.';
  }
  console.error(`[ai] Gemini call failed — ${logReason}: ${rawMessage || '(no message)'}`);
  const wrapped = new Error(publicMessage) as AiError;
  wrapped.statusCode = statusCode;
  wrapped.publicMessage = publicMessage;
  wrapped.cause = err;
  return wrapped;
}

async function generateJson<T>(parts: object[], responseSchema: object, extraConfig?: Record<string, unknown>): Promise<T> {
  const ai = client();
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: [{ role: 'user', parts }],
        config: { responseMimeType: 'application/json', responseSchema, ...extraConfig },
      });
    } catch (err) {
      throw toAiError(err);  // 크레딧 소진(429) 등은 재시도 없이 즉시 사용자 메시지로 변환
    }
    const text = res.text ?? '';
    try {
      return JSON.parse(text) as T;
    } catch {
      if (attempt === 1) {
        const e = new Error('AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.') as AiError;
        e.statusCode = 502;
        e.publicMessage = e.message;
        throw e;
      }
    }
  }
  throw new Error('unreachable');
}

function imagePart(mimeType: string, base64: string) {
  return { inlineData: { mimeType, data: base64 } };
}

// 본문은 <br> 태그로 줄바꿈한다(렌더러가 HTML 태그를 허용). "\n"·줄 끝 공백·줄 앞 들여쓰기는 금지.
const MD_LINEBREAK_RULE = `- 줄을 바꿀 때는 "\\n"(개행 문자)이나 줄 끝 공백이 아니라 반드시 <br> 태그를 사용한다. 한 줄이 끝날 때마다 <br> 를 붙여 다음 줄로 넘어가라.
- 줄바꿈 뒤에 함수식(수식)만 단독으로 오는 줄은 그 수식 앞에 \\qquad 를 붙여 들여쓴다. 예: ...이 성립한다.<br>$\\qquad f(x) = x^2 + 1$
- 들여쓰기를 위해 줄 앞에 공백 4칸 이상을 절대 넣지 마라(Markdown 이 코드 블록으로 잘못 변환해 수식이 깨진다). 들여쓰기는 \\qquad 로만 표현한다.`;

// 문항 OCR meta(과목·대단원·소단원)는 2022 개정 교육과정 MAP 안에서만 고르도록 강제.
const CURRICULUM_RULE = `meta 의 과목(subject)·대단원(majorUnit)·소단원(minorUnit) 은 아래 "2022 개정 수학과 교육과정 MAP" 에 실제로 존재하는 항목만 사용한다(임의로 새 이름을 만들지 말 것).
- subject 는 MAP 의 과목명 중 하나를 그대로 쓴다.
- majorUnit 은 그 과목의 대단원명 중, minorUnit 은 그 대단원의 소단원명 중 가장 적합한 하나를 그대로 쓴다.
- 각 단원의 성취기준 목록을 근거로 분류하라. 문제의 개념·요구사항과 가장 일치하는 성취기준을 찾아 그 성취기준이 속한 과목/대단원/소단원으로 분류한다.
- subject 는 반드시 MAP 의 과목 중 가장 가까운 하나를 고른다(빈 값 불가). majorUnit·minorUnit 은 판단이 어려우면 빈 문자열로 둘 수 있다.

[2022 개정 수학과 교육과정 MAP]
${buildCurriculumPromptBlock()}`;

// 그래프 좌표축은 이미지 픽셀 행과 위아래가 반대다(상하 반전 오독 방지). 그래프를 읽는 프롬프트에 강제.
const GRAPH_ORIENTATION_RULE = `- 그래프·좌표평면을 해석할 때 세로축(y)은 위로 갈수록 값이 커지고 아래로 갈수록 값이 작아진다. 이미지의 위쪽 픽셀일수록 y값이 크고, 아래쪽 픽셀일수록 y값이 작다(이미지의 행 순서와 반대). 위아래를 뒤집어 읽지 말 것.
- 점의 좌표, 증가·감소, 최댓값·최솟값, 볼록·오목, 교점, 부호(양수=x축 위, 음수=x축 아래)를 판단할 때 반드시 이 방향을 지켜라. 가로축(x)은 오른쪽이 큰 값이다.`;

const SOLUTION_OCR_RULE = `다음 규칙으로 학생이 손으로 쓴 수학 풀이 이미지를 변환하라.
- 풀이 전체를 Markdown + LaTeX 로 변환한다. 인라인 수식은 $...$, 디스플레이 수식은 $$...$$.
- 손글씨를 최대한 충실히 옮긴다(맞춤·교정하지 말 것). 한국어가 아닌 텍스트는 한국어로.
- 학생이 그린 그래프·도형·표는 본문에 자연어 설명으로 보존한다.
${GRAPH_ORIENTATION_RULE}
${MD_LINEBREAK_RULE}`;

const REVIEW_RULE = `너는 고등 수학 첨삭 선생님이다. 학생 풀이를 검토해 코칭하라.
이미지에는 손글씨 수식뿐 아니라 학생이 직접 그린 그래프·도형·표 등 시각 요소가 포함될 수 있다. 이를 변환된 LaTeX 풀이와 함께 판독·평가하라.
${GRAPH_ORIENTATION_RULE}
코칭 원칙(스캐폴딩): 오답이거나 막혔으면 정답·전체 풀이를 통째로 제시하지 말고, 학생이 스스로 해결하도록 '다음 한 걸음'에 해당하는 디딤돌 힌트만 짚어라. 정답이면 맞혔음을 알리고 칭찬한 뒤 다른 접근법을 짧게 소개하라.
스타일: 잘한 점 → 오류 위치/이유 → 다음 한 걸음 힌트 → 학습 조언. 존댓말, 이모지 적절히.
commentMarkdown은 학생용 첨삭(Markdown+LaTeX). errorTags는 [conceptual, computational, logical, notational, strategic, condition] 중에서. conceptTags는 다룬 개념명. strengthNotes/weaknessNotes는 교사용 짧은 메모.
commentMarkdown 에서 줄을 바꿀 때는 반드시 줄 끝에 공백 2칸("  ")을 넣은 뒤 개행한다(공백 2칸이 없으면 Markdown 줄바꿈이 무시됨).
coachingSvg: 그래프·도형·좌표평면·수직선 등 그림으로 설명하면 학생이 더 잘 이해할 경우에만, 핵심을 짚는 정확한 그림을 자기완결적 SVG 문자열로 생성하라(불필요하면 빈 문자열 ""). 이 그림은 문제마다 한 번만 생성되어 이후 같은 문제를 푸는 모든 학생에게 그대로 재사용되므로, 반드시 정확해야 한다.
[SVG 형식 규칙]
- 반드시 "<svg ...>"로 시작해 "</svg>"로 끝나고 viewBox 속성을 포함하며, 모든 태그를 올바르게 닫는다.
- 외부 리소스·<script>·이벤트핸들러(on*)·foreignObject 는 절대 쓰지 말 것(이미지로만 렌더됨).
- 표준 SVG 요소(line·path·circle·rect·text·polyline·g·defs·marker 등)만 사용한다. <grid> 같은 비표준 태그는 금지하며, 격자가 필요하면 <line> 으로 그린다.
- 좌표평면: 세로축(y)은 위로 갈수록 값이 커지도록 그린다(SVG 의 y 픽셀은 아래로 갈수록 커지므로, y값이 큰 점일수록 화면 위쪽에 오도록 좌표를 변환). 가로축(x)은 오른쪽이 큰 값. 원점·축·눈금·화살표·라벨을 명확히.
- 글자는 한국어, 색상은 1~2가지로 간결하게. 라벨이 서로 겹치지 않게 배치.
[SVG 정확도 검증 — 출력 전 아래 순서로 내부적으로 점검하고, 어긋나면 수정한 뒤 최종본만 내보낸다]
1) 문제·정답·해설로부터 그려야 할 핵심 요소(x·y절편, 꼭짓점, 점근선, 교점, 기울기, 정의역·치역, 도형의 변·각 등)를 수식으로 먼저 계산한다.
2) 계산한 각 좌표를 viewBox 픽셀 좌표로 변환할 때 y축 방향(위=큰 값)이 올바른지 확인한다.
3) SVG 에 실제로 찍은 점·선·라벨의 좌표가 1)의 계산값과 하나씩 일치하는지 대조한다.
4) 곡선의 증가·감소·볼록성·대칭·주기가 문제의 함수와 일치하는지 확인한다.
5) 모든 요소가 viewBox 안에 들어오고 비율이 자연스러운지, 모든 태그가 닫혔는지 확인한다.
6) 위 점검에서 하나라도 정확히 그릴 수 없으면, 틀린 그림 대신 빈 문자열 "" 을 출력한다.`;

const PROBLEM_RULE = `다음 규칙으로 수학 문제 이미지를 변환하라.
- 본문을 Markdown + LaTeX 로 변환한다. 인라인 수식은 $...$, 디스플레이 수식은 $$...$$.
- 한국어가 아닌 텍스트는 한국어로 번역하되 수학 표기는 유지한다.
- 강조는 **굵게** 로 표기한다(\\textbf 금지).
- 그래프·도형·표 등 그림 요소는 본문 안에 [FIGURE:1], [FIGURE:2] 처럼 1부터 순번을 매겨 표기하고,
  같은 순서로 figureNotes 배열에 각 그림의 한국어 설명을 넣는다.
  본문의 [FIGURE:n] 개수와 figureNotes 길이는 반드시 일치해야 한다.
- meta 에 과목(subject)·대단원(majorUnit)·소단원(minorUnit)·난이도(difficulty: 상/중/하)
  ·유형(problemType)·세부유형(detailType)·키워드(keywords[]) 를 추출한다.
${GRAPH_ORIENTATION_RULE}
${MD_LINEBREAK_RULE}

${CURRICULUM_RULE}`;

const MARKSCHEME_RULE = `다음 규칙으로 교사가 제공한 정답/풀이(마크스킴) 이미지를 변환하라.
- answer: 간결한 최종 정답.
- solution: 단계별 풀이를 Markdown + LaTeX 로. 인라인 $...$, 디스플레이 $$...$$.
- 한국어가 아닌 텍스트는 한국어로 번역한다.
${MD_LINEBREAK_RULE}`;

const SOLUTION_RULE = `너는 고등 수학 교사다. 아래 문제(Markdown+LaTeX)의 정답과 단계별 해설을 작성하라.
- answer: 간결한 최종 정답.
- solution: 학생이 이해할 단계별 풀이를 Markdown + LaTeX 로. 인라인 $...$, 디스플레이 $$...$$.
${MD_LINEBREAK_RULE}`;

const META_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING, enum: CURRICULUM_SUBJECTS }, majorUnit: { type: Type.STRING },
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
  skipSvg?: boolean;   // 이 문제의 보조 그림이 이미 있으면 SVG 재생성 생략(토큰 절약)
}): Promise<{
  commentMarkdown: string;
  isCorrect: boolean;
  errorTags: string[];
  conceptTags: string[];
  strengthNotes: string;
  weaknessNotes: string;
  coachingSvg: string;
}> {
  const text =
    `${REVIEW_RULE}\n\n` +
    `문제(LaTeX): ${args.problemLatex}\n` +
    `정답: ${args.answer ?? '(없음)'}\n` +
    `해설: ${args.solution ?? '(없음)'}\n` +
    `학생 풀이(LaTeX): ${args.studentLatex}\n` +
    `위 캔버스 이미지는 학생의 원본 손글씨 풀이(수식·그래프·도형 포함)다.` +
    (args.skipSvg ? `\n이 문제의 보조 그림은 이미 준비되어 있으니 coachingSvg 는 빈 문자열 ""로 둔다(새로 그리지 말 것).` : '');
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
        coachingSvg: { type: Type.STRING },
      },
    },
    // 코멘트+SVG 가 한 응답을 공유하므로 SVG 가 잘리지 않도록 출력 토큰 여유 확보
    { maxOutputTokens: 8192 },
  );
}

export const AI_MODEL_NAME = env.GEMINI_MODEL;
