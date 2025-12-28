import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { LineValue, UserContext, AnalysisResult } from "../types";
import { HEXAGRAM_TABLE } from "./hexagramData";

// GEMS의 페르소나와 앱의 기술적 요구사항을 결합합니다.
const GEM_PERSONA = `
[중국 고전의 전문적 학자의 입장에서 앞으로 주역 풀이를 할때는 공자의 십익, 주자, 왕필, 정이천 등의 해석을 참고하고 설명할 때 출처나 학자의 관점을 밝혀줘. 
그리고 개인의 특정 상황에 대한 풀이를 할 경우 현대적 심리학 이론(특히 MBTI 성격 유형 이론 포함)들도 활용해 줘 ]
`;

const SYSTEM_INSTRUCTION = `
${GEM_PERSONA}

당신은 위 페르소나(GEMS 설정)에 따라 행동해야 합니다.
또한, 이 앱이 정상적으로 작동하기 위해 다음의 **기술적 출력 지침**을 반드시 준수해야 합니다.

1. **괘사(Hexagram) 해석 지침**:
   - 괘사(Hexagram Statement)도 효사처럼 구조화하여 제공해야 합니다.
   - **statement_hanja**: 괘사 원문 (예: 元亨利貞)을 제공하십시오.
   - **statement_translation**: 원문의 글자 그대로의 직역을 제공하십시오.
   - **explanation**: 괘사에 대한 학술적이고 상세한 해설을 제공하십시오. (단전, 상전, 주자, 정이천 등의 해석 인용).
   - **중요**: explanation 작성 시 가독성을 위해 **반드시 3~4개의 문단으로 나누고**, 문단 사이에는 **줄바꿈(\\n\\n)**을 명확히 넣어주세요.

2. **효사(Lines) 해석 지침 (매우 중요)**: 
   - **분량**: 각 효당 설명은 **반드시 공백 포함 200자~300자** 정도로 상세하고 풍부하게 작성하십시오. (절대 100자 내외로 짧게 끝내지 마십시오.)
   - **내용 구성**: 
     1. **전통 주석**: 십익(단전, 상전), 왕필, 주자, 정이천 등의 전통적 해석.
     2. **현대 학술**: 필요하다면 **금문(Bronze Script)**이나 갑골문 등 현대 주역학의 연구 성과를 포함하여 글자의 기원이나 의미를 풍부하게 서술하십시오.
     3. **구조적 분석**: 효의 위치(득중, 정응, 승, 비 등)와 음양의 관계를 논리적으로 설명하십시오.
   - **주의**: 이 항목에서는 **사용자의 현실적 상황에 대한 조언을 절대 하지 마십시오.** (순수 학술/철학적 풀이 유지)

3. **심층 조언(Advice)**: 
   - 별도로 요청되는 '조언' 섹션('advice' 필드)에서만 비로소 사용자의 이름, 질문, 상황, **MBTI**를 고려하여 현실적인 풀이를 하십시오.
   - 괘와 효의 의미를 현실 상황에 대입하여 구체적인 솔루션을 제시하는 곳은 오직 여기입니다.

4. **정확한 괘 해석**: 
   - 프롬프트에 제공된 '확정된 괘(본괘)'와 '변화된 괘(지괘)' 정보를 절대적으로 신뢰하고 그에 맞는 풀이를 하십시오. 
   - **AI 스스로 괘를 계산하거나 유추하지 마십시오.** 제공된 괘 이름을 그대로 따라야 합니다.

입력으로 주어지는 6개의 효(Line) 값 (밑에서 위 순서):
- 6: 노음 (변하는 음효, Changing Yin) -> 본괘에서는 음(0), 지괘에서는 양(1)
- 7: 소양 (불변 양효, Static Yang) -> 본괘, 지괘 모두 양(1)
- 8: 소음 (불변 음효, Static Yin) -> 본괘, 지괘 모두 음(0)
- 9: 노양 (변하는 양효, Changing Yang) -> 본괘에서는 양(1), 지괘에서는 음(0)
`;

// Helper to reliably parse JSON from LLM response
const parseJSONSafely = (text: string): any => {
    try {
        // First try standard parse
        return JSON.parse(text);
    } catch (e) {
        console.warn("Direct JSON parse failed, attempting cleanup...", e);
        // Try to remove markdown code blocks
        let cleanText = text.replace(/```json\s*/g, "").replace(/```\s*$/g, "");
        try {
            return JSON.parse(cleanText);
        } catch (e2) {
             // Try to find the first { and last }
            const firstOpen = text.indexOf('{');
            const lastClose = text.lastIndexOf('}');
            if (firstOpen !== -1 && lastClose !== -1) {
                try {
                    return JSON.parse(text.substring(firstOpen, lastClose + 1));
                } catch (e3) {
                     console.warn("Brace extraction failed", e3);
                }
            }
        }
        throw new Error("JSON 파싱 실패: 응답 형식이 올바르지 않습니다.");
    }
};

// Safe access to API Key (prevents ReferenceError if process is undefined in raw browser env)
const getApiKey = (): string | undefined => {
    try {
        return process.env.API_KEY;
    } catch (e) {
        console.warn("Runtime environment does not support process.env");
        return undefined;
    }
};

export const interpretHexagram = async (
  user: UserContext,
  lines: LineValue[]
): Promise<AnalysisResult> => {
  const model = "gemini-3-flash-preview"; 
  
  // 1. Calculate Start Hexagram Identity (Grounding)
  // 6(0), 7(1), 8(0), 9(1) -> Odd is Yang(1), Even is Yin(0)
  const binaryKey = lines.map(line => (line % 2 !== 0 ? '1' : '0')).join('');
  const knownHexagram = HEXAGRAM_TABLE[binaryKey] || { name: "알 수 없는 괘", hanja: "Unknown" };

  // 2. Calculate End Hexagram Identity (Ji-Gwae) - CRITICAL FIX
  // 6 (Old Yin) -> Becomes Yang (1)
  // 9 (Old Yang) -> Becomes Yin (0)
  // 7 (Static Yang) -> Stays Yang (1)
  // 8 (Static Yin) -> Stays Yin (0)
  const changedBinaryKey = lines.map(line => {
    if (line === 6) return '1'; 
    if (line === 9) return '0';
    return line % 2 !== 0 ? '1' : '0';
  }).join('');
  
  const changedHexagramData = HEXAGRAM_TABLE[changedBinaryKey] || { name: "변화된 괘", hanja: "" };

  try {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("API Key가 설정되지 않았습니다. (process.env.API_KEY missing)");
    }
    const genAI = new GoogleGenAI({ apiKey: apiKey });

    const prompt = `
      [사용자 정보]
      이름: ${user.name}
      MBTI: ${user.mbti ? user.mbti : "정보 없음"}
      질문: ${user.question}
      상황 설명: ${user.situation}

      [확정된 괘 정보 (Ground Truth)]
      아래 정보를 절대적인 진실로 받아들이고 해석하십시오. AI가 별도로 계산하지 마십시오.

      1. **본괘 (Start Hexagram)**: '${knownHexagram.name} (${knownHexagram.hanja})'
      2. **지괘 (End Hexagram - 변화 후)**: '${changedHexagramData.name} (${changedHexagramData.hanja})'
         * 설명: 동효(변하는 효)가 음양의 성질을 바꾸어 생성된 결과 괘입니다.
         * JSON 응답의 'changedHexagramName' 필드에 반드시 '${changedHexagramData.name}'을 넣으십시오.

      [뽑힌 효 상세 (1효=맨 아래, 6효=맨 위)]
      1효: ${lines[0]}
      2효: ${lines[1]}
      3효: ${lines[2]}
      4효: ${lines[3]}
      5효: ${lines[4]}
      6효: ${lines[5]}

      위 괘(${knownHexagram.name})를 분석하여 다음 JSON 스키마에 맞춰 응답해주십시오.
      
      **중요 요구사항**:
      1. 'hexagram': 
         - **statement_hanja**: 괘사 원문.
         - **statement_translation**: 괘사 직역.
         - **explanation**: 상세 해설. **반드시 3~4개의 문단으로 나누고, 문단 사이에는 줄바꿈(\\n\\n)을 넣어주세요.**
      
      2. 'lines': 1효~6효. 
         - **내용**: 원문(한자)의 뜻, 전통적 주석(왕필, 주자), 그리고 **금문(Bronze Script)** 등 현대 학술적 견해를 포함하여 깊이 있게 서술하십시오.
         - **주의**: **현실적인 조언이나 적용점은 절대 포함하지 마십시오.** (순수 학술적 풀이)
         - **분량**: **각 효당 200자~300자**로 충분히 길게 작성하십시오. (100자 미만 절대 금지)
      
      3. 'advice': 사용자 맞춤 조언. **약 2000자 내외**.
         - **가독성을 위해 내용을 3~4개의 단락으로 나누고, 각 단락 앞에 '### 소제목' 형식으로 제목을 붙여주세요.**
         - 여기서 비로소 괘와 효의 의미(본괘와 지괘의 관계)를 사용자의 질문과 상황에 대입하여 현실적인 조언을 제공합니다.
      
      4. 'coreSummary': 핵심 요약 3줄.
    `;

    const response = await genAI.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hexagram: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                hanja: { type: Type.STRING, description: "Name Hanja" },
                statement_hanja: { type: Type.STRING, description: "Original Text of Hexagram Statement" },
                statement_translation: { type: Type.STRING, description: "Literal Translation" },
                explanation: { type: Type.STRING, description: "Detailed academic explanation" }
              },
              required: ["name", "hanja", "statement_hanja", "statement_translation", "explanation"]
            },
            lines: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  position: { type: Type.INTEGER },
                  hanja: { type: Type.STRING },
                  translation: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  isChanging: { type: Type.BOOLEAN }
                },
                required: ["position", "hanja", "translation", "explanation", "isChanging"]
              }
            },
            changedHexagramName: { type: Type.STRING },
            advice: { type: Type.STRING },
            coreSummary: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3 actionable advice summary sentences"
            }
          },
          required: ["hexagram", "lines", "advice", "coreSummary"]
        }
      }
    });

    if (response.text) {
      return parseJSONSafely(response.text) as AnalysisResult;
    }
    
    console.error("No text in response", response);
    throw new Error("AI 응답이 비어있습니다. (Safety Filter 차단 가능성)");

  } catch (error: any) {
    console.error("Gemini interpretation failed:", error);
    
    let errorMessage = "알 수 없는 오류";
    try {
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'object' && error !== null) {
             errorMessage = JSON.stringify(error);
        } else {
            errorMessage = String(error);
        }
    } catch (e) {
        errorMessage = String(error);
    }
    
    // Fallback for error (Adjusted for new type structure)
    return {
      hexagram: { 
        name: knownHexagram.name, 
        hanja: knownHexagram.hanja, 
        statement_hanja: "불러오기 실패",
        statement_translation: "네트워크 오류",
        explanation: "해석을 불러오지 못했습니다. 네트워크 상태를 확인하거나 잠시 후 다시 시도해주세요." 
      },
      lines: [],
      advice: `죄송합니다. AI 서비스 연결에 문제가 발생했습니다. \n${errorMessage}`,
      coreSummary: ["네트워크 상태를 확인해주세요.", "잠시 후 다시 시도해주세요.", "문제가 지속되면 개발자에게 문의해주세요."]
    };
  }
};

export const interpretPremiumQuestions = async (
  user: UserContext,
  currentAnalysis: AnalysisResult,
  questions: { q1: string; q2: string }
): Promise<string> => {
  const model = "gemini-3-flash-preview"; 
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key Missing");

  const genAI = new GoogleGenAI({ apiKey: apiKey });

  const allLinesInfo = currentAnalysis.lines
    .map(l => 
      `[제${l.position}효] (${l.hanja}) ${l.isChanging ? '**동효(Changing Line)**' : ''}\n` +
      `해석: ${l.translation}\n` +
      `상세 설명: ${l.explanation}`
    )
    .join('\n\n');

  const previousFullAdvice = `
    [AI가 제공했던 3줄 요약]
    ${currentAnalysis.coreSummary.map((s, i) => `${i+1}. ${s}`).join('\n')}

    [AI가 제공했던 상세 조언 전문]
    ${currentAnalysis.advice}
  `;

  const prompt = `
    [시스템 역할]
    당신은 주역(I Ching)의 최고 권위자입니다. 
    당신은 이미 사용자('${user.name}')에게 '${currentAnalysis.hexagram.name}' 괘에 대한 상세한 분석과 조언을 제공했습니다.
    이제 사용자가 추가 비용을 지불하고, 그 결과에 대해 **더 깊이 있는 추가 질문**을 던졌습니다.

    **[미션]**
    당신이 이전에 제공했던 아래의 [1차 분석 리포트] 내용을 완벽하게 숙지하고, **그 내용과 논리적, 맥락적으로 완벽하게 일치하는 심층 답변**을 제공하십시오.
    
    ==================================================
    **[1차 분석 리포트 (Previous Context)]**
    
    1. 사용자 정보
       - 이름: ${user.name}
       - 원래 질문: ${user.question}
       - 상황: ${user.situation}
       - MBTI: ${user.mbti}

    2. 괘 정보 (Ground Truth)
       - 괘 이름: ${currentAnalysis.hexagram.name} (${currentAnalysis.hexagram.hanja})
       - 괘사 원문: ${currentAnalysis.hexagram.statement_hanja}
       - 괘사 해설: ${currentAnalysis.hexagram.explanation}

    3. 효 상세 풀이 (Line Interpretation)
    ${allLinesInfo}

    4. 당신이 제공했던 조언 (Advice History)
    ${previousFullAdvice}
    ==================================================

    **[사용자의 새로운 심층 질문 (Premium Questions)]**
    Q1: ${questions.q1}
    Q2: ${questions.q2}

    **[답변 작성 가이드]**
    1. **일관성 유지**: 답변을 시작할 때, "앞서 말씀드린 ${currentAnalysis.hexagram.name}의 ${currentAnalysis.lines.find(l=>l.isChanging)?.position || '주요'}효의 의미에 비추어 볼 때..." 와 같이 연결고리를 명확히 하십시오.
    2. **구체성**: 추상적인 덕담 금지. 위 [1차 분석 리포트]에 있는 '상세 설명'이나 '조언' 내용을 근거로 들어 답변하십시오.
    3. **분량**: 각 질문(Q1, Q2)당 **공백 포함 약 800~1000자**로 매우 상세하게 작성하십시오.
    4. **가독성**: 긴 글이므로 문단 사이에 줄바꿈을 두 번 넣어주십시오.

    이용자가 당신의 통찰력과 기억력에 감탄할 수 있도록 답변해주십시오.
  `;

  try {
      const response = await genAI.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        }
      });
      
      return response.text || "죄송합니다. 심층 분석 결과를 생성하지 못했습니다.";
  } catch (error) {
      console.error("Premium analysis failed", error);
      throw new Error("심층 분석 생성 중 오류가 발생했습니다.");
  }
};