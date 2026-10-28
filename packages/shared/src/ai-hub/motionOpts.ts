// 이 파일은 오빠두 모션 스타일 갤러리 gallery-data.js(2026-10-25 사본)의 window.GALLERY.v2opts 를
// 스크립트로 꺼내 만든 것입니다(JSON 그대로). 손으로 고치지 마세요.
// 출처: https://www.oppadu.com/wp-content/themes/generatepress_child/tools/_motion-styles-assets/gallery-data.js
// labels = 편집 화면의 이름표(한국어), en / ko = 프롬프트 엔진(promptEngine.ts opt())이 {{@키}} 자리에 넣는 글 표 L.

/** v2opts.en / v2opts.ko 한 언어의 글 표 — promptEngine 의 opt(key, st, L, lang) 가 읽는다. */
export type OptTexts = {
  hookOn: string;
  hookOff: string;
  logo: string;
  holdLogo: string;
  holdName: string;
  fFonts: string;
  fLogo: string;
  fSound: string;
  cues: string;
  compose: string;
  musicFile: string;
  renderHf: string;
  renderHfAudio: string;
  renderRm: string;
  renderRmAudio: string;
  end: string;
  secs: string;
  long: string;
  format: string;
  ratioName: Record<string, string>;
  shape: string;
  onscreen: string;
  accent: string;
  langName: Record<string, string>;
};

export const MOTION_OPTS = {
  "labels": {
    "style": "방식",
    "styleB": "내 주제에 맞게",
    "styleA": "예시 그대로",
    "logo": "로고 파일 있음",
    "sound": "사운드트랙 만들기",
    "music": "배경 음악 있음",
    "logoInfo": "로고가 있다면 같이 첨부해주세요.",
    "soundInfo": "AI가 영상에 맞춰 음악과 효과음을 새로 생성합니다.",
    "musicInfo": "가진 곡 (MP3, WAV)가 있다면 같이 첨부해주세요. 곡이 길면 잘 맞는 구간을 AI가 판단해 사용합니다.",
    "render": "렌더링",
    "renderHf": "HyperFrames",
    "renderRm": "Remotion",
    "renderRmInfo": "Remotion은 개인과 직원 3명 이하 회사는 무료입니다. 직원 4명 이상 회사에서 쓰려면 유료 라이선스가 필요합니다.",
    "renderRmLink": [
      "https://www.remotion.dev/license",
      "라이선스 보기"
    ],
    "len": "길이",
    "lenUnit": "초",
    "lenMax": "최대 {max}초까지 만들 수 있어요",
    "lenMin": "{min}초보다 짧게는 만들지 않아요",
    "ratio": "화면",
    "fps": "30fps",
    "ratios": [
      [
        "16:9",
        "가로"
      ],
      [
        "9:16",
        "세로"
      ],
      [
        "1:1",
        "정사각"
      ],
      [
        "4:5",
        "세로"
      ],
      [
        "4:3",
        "가로"
      ],
      [
        "3:4",
        "세로"
      ]
    ],
    "lang": "화면 글자",
    "langs": [
      [
        "ko",
        "한국어"
      ],
      [
        "en",
        "영어"
      ],
      [
        "ja",
        "일본어"
      ],
      [
        "zh-Hans",
        "중국어(간체)"
      ],
      [
        "zh-Hant",
        "중국어(번체)"
      ],
      [
        "es",
        "스페인어"
      ],
      [
        "fr",
        "프랑스어"
      ],
      [
        "de",
        "독일어"
      ],
      [
        "vi",
        "베트남어"
      ],
      [
        "th",
        "태국어"
      ],
      [
        "id",
        "인도네시아어"
      ]
    ],
    "opts": "옵션"
  },
  "en": {
    "hookOn": " and turn the sound on",
    "hookOff": "",
    "logo": "Logo: use the logo file that came with this prompt (attached, or placed in the project folder) in the final shot. You may re-render it in this style, but keep its shape and colors unchanged. If you cannot find it, ask me for it before you start.",
    "holdLogo": "the brand name and logo",
    "holdName": "the brand name",
    "fFonts": "fonts",
    "fLogo": "the logo",
    "fSound": "the soundtrack",
    "cues": ", plus a sound cue sheet listing every hit with its timestamp and the visual event it belongs to",
    "compose": "Soundtrack: compose and synthesize the music in code — no external music files — and synthesize the SFX in code too; where a real recording clearly sounds better (paper, steam, crowd, impacts), you may layer royalty-free recordings from your toolkit's library (e.g., HyperFrames' bundled SFX). Write a small script that renders everything into one WAV (48 kHz, 16-bit) and places each cue sample-accurately on the timestamps in your cue sheet. Use whichever techniques suit this style's sound — e.g., FM synthesis, Karplus–Strong plucks, filtered noise, subtractive synthesis, a simple algorithmic reverb, and a soft limiter.",
    "musicFile": "**Music:** use the music file that came with this prompt (attached, or placed in the project folder) as the bed instead of composing one; if you cannot find it, ask me for it before you start. If the track runs longer than the piece, use the section that fits best and end it cleanly with a short fade. Put the climax and the title reveal on its strongest downbeat. Design the SFX on top of it in code (layer royalty-free recordings where they clearly sound better), and render the music and the SFX into one WAV (48 kHz, 16-bit) with each cue placed sample-accurately on your cue sheet.",
    "renderHf": "Render with HyperFrames: the root element carries data-composition-id, data-width, data-height, and data-duration; register the paused timeline as window.__timelines['main']",
    "renderHfAudio": "; attach the soundtrack as <audio src data-start=\"0\" data-duration data-volume>",
    "renderRm": "Render with Remotion: register the composition as \"Intro\" and render it with npx remotion render Intro out/intro.mp4 (H.264, 30 fps)",
    "renderRmAudio": "; add the soundtrack WAV with <Audio src={staticFile(…)} /> starting at frame 0",
    "end": ".",
    "secs": " seconds",
    "long": "Pacing for a longer piece: shape it in two or three acts, each with its own idea and a smaller peak, building to the one clear climax in the last act. Every second must earn its place — no filler, no stretched holds, no repeated shots. When you check the frames, include at least one from every act.",
    "format": "{w}×{h} {shape}, 30 fps",
    "ratioName": {
      "16:9": "landscape (16:9)",
      "9:16": "vertical (9:16)",
      "1:1": "square (1:1)",
      "4:5": "portrait (4:5)",
      "4:3": "landscape (4:3)",
      "3:4": "portrait (3:4)"
    },
    "shape": "Frame shape: this piece is {shape}. The style notes below were written for a 16:9 landscape frame — keep the style's identity and devices, but recompose every shot for this shape, scale any example sizes (canvas resolution, layer layouts) to it, and keep text inside the safe area.",
    "onscreen": "On-screen text: {lang}, kept short.",
    "accent": " Genre-standard English words (PRESS START, EXTRA, LIVE…) are fine as accents.",
    "langName": {
      "ko": "Korean",
      "en": "English",
      "ja": "Japanese",
      "zh-Hans": "Simplified Chinese",
      "zh-Hant": "Traditional Chinese",
      "es": "Spanish",
      "fr": "French",
      "de": "German",
      "vi": "Vietnamese",
      "th": "Thai",
      "id": "Indonesian"
    }
  },
  "ko": {
    "hookOn": "고 소리를 켜게",
    "hookOff": "게",
    "logo": "로고: 이 프롬프트와 함께 준 로고 파일(첨부했거나 작업 폴더에 넣어 둔 것)을 마지막 장면에 쓴다. 이 스타일로 다시 그려도 되지만, 모양과 색은 그대로 둔다. 파일이 보이지 않으면 시작하기 전에 나에게 달라고 한다.",
    "holdLogo": "브랜드 이름과 로고를",
    "holdName": "브랜드 이름을",
    "fFonts": "글꼴",
    "fLogo": "로고",
    "fSound": "사운드트랙",
    "cues": " 소리 큐 시트도 함께 쓴다 — 소리가 들어가는 지점을 빠짐없이, 시각과 짝이 되는 화면 이벤트와 함께 적는다.",
    "compose": "사운드트랙: 음악은 코드로 작곡하고 합성한다. 외부 음악 파일은 쓰지 않는다. 효과음도 코드로 합성하되, 실제 녹음이 확실히 더 좋게 들리는 소리(종이, 증기, 관중, 타격음)는 쓰고 있는 도구 라이브러리의 로열티 프리 녹음(예: HyperFrames 에 딸린 효과음)을 겹쳐 써도 된다. 작은 스크립트를 짜서 모든 소리를 WAV 파일 하나(48 kHz, 16비트)로 렌더하고, 각 큐를 큐 시트에 적은 시각에 샘플 단위로 정확히 놓는다. 기법은 이 스타일의 소리에 맞는 것을 고른다 — 예: FM 합성, Karplus–Strong 뜯는 소리, 필터를 거친 노이즈, 감산 합성, 간단한 알고리즘 리버브, 소프트 리미터.",
    "musicFile": "**음악:** 음악을 새로 만드는 대신 이 프롬프트와 함께 준 음악 파일(첨부했거나 작업 폴더에 넣어 둔 것)을 바탕 음악으로 쓴다. 파일이 보이지 않으면 시작하기 전에 나에게 달라고 한다. 곡이 영상보다 길면 가장 잘 맞는 구간을 골라 쓰고, 끝은 짧은 페이드로 깔끔하게 맺는다. 절정과 타이틀 등장은 그 곡에서 가장 강한 다운비트에 맞춘다. 효과음은 그 위에 코드로 설계하고(실제 녹음이 확실히 더 좋게 들리는 소리는 로열티 프리 녹음을 겹쳐도 된다), 음악과 효과음을 WAV 파일 하나(48 kHz, 16비트)로 렌더하되 각 큐를 큐 시트 시각에 샘플 단위로 정확히 놓는다.",
    "renderHf": "HyperFrames 로 렌더한다. 루트 요소에 data-composition-id, data-width, data-height, data-duration 을 단다. paused 상태의 타임라인을 window.__timelines['main'] 으로 등록한다",
    "renderHfAudio": ". 사운드트랙은 <audio src data-start=\"0\" data-duration data-volume> 태그로 붙인다",
    "renderRm": "Remotion 으로 렌더한다. 컴포지션을 \"Intro\" 라는 이름으로 등록하고 npx remotion render Intro out/intro.mp4 로 뽑는다(H.264, 30fps)",
    "renderRmAudio": ". 사운드트랙 WAV 는 <Audio src={staticFile(…)} /> 로 0프레임부터 붙인다",
    "end": ".",
    "secs": "초",
    "long": "긴 영상의 짜임: 두세 막으로 나누어 막마다 다른 아이디어와 작은 고비를 두고, 분명한 절정 하나는 마지막 막에 둔다. 모든 초가 제 몫을 해야 한다 — 군더더기, 늘어진 멈춤, 같은 장면 반복은 넣지 않는다. 장면을 찍어 확인할 때는 막마다 한 장 이상 넣는다.",
    "format": "{shape} {w}×{h}, 30fps",
    "ratioName": {
      "16:9": "가로(16:9)",
      "9:16": "세로(9:16)",
      "1:1": "정사각(1:1)",
      "4:5": "세로(4:5)",
      "4:3": "가로(4:3)",
      "3:4": "세로(3:4)"
    },
    "shape": "화면 모양: 이 영상은 {shape}이다. 아래 스타일 글은 가로 16:9 화면을 두고 썼다 — 스타일의 정체와 장치는 지키되, 장면마다 이 모양에 맞게 다시 짜고, 예시로 든 크기(캔버스 해상도, 레이어 배치)도 이 비율로 바꾸며, 글자는 안전 영역 안에 둔다.",
    "onscreen": "화면 글자: {lang}로 짧게 쓴다.",
    "accent": " 그 장르에서 흔히 쓰는 영어 단어(PRESS START, EXTRA, LIVE…)는 포인트로 섞어도 된다.",
    "langName": {
      "ko": "한국어",
      "en": "영어",
      "ja": "일본어",
      "zh-Hans": "중국어(간체)",
      "zh-Hant": "중국어(번체)",
      "es": "스페인어",
      "fr": "프랑스어",
      "de": "독일어",
      "vi": "베트남어",
      "th": "태국어",
      "id": "인도네시아어"
    }
  }
} as const satisfies {
  labels: Record<string, unknown>;
  en: OptTexts;
  ko: OptTexts;
};
