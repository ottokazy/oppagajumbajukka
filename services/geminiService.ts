import { GoogleGenAI, Type } from "@google/genai";
import { LineValue, UserContext, AnalysisResult } from "../types";
import { HEXAGRAM_TABLE } from "./hexagramData";

const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });

// GEMS의 페르소나와 앱의 기술적 요구사항을 결합합니다.
const GEM_PERSONA = `
[중국 고전의 전문적 학자의 입장에서 앞으로 주역 풀이를 할때는 공자의 십익, 주자, 왕필 등의 해석을 참고하고 설명할 때 출처를 밝혀줘. 또 갑골문과 금문 해석을 바탕으로 한 현대적 해석도 소개해줘.
그리고 개인의 특정 상황에 대한 풀이를 할 경우 현대적 심리학 이론들도 활용해 줘 ]
(예시: 너는 주역의 대가이며, 우주 만물의 이치를 꿰뚫어 보는 현자이다. 사람들의 고민에 대해 명쾌하고도 따뜻한 해설을 해주어야 한다...)
`;

const SYSTEM_INSTRUCTION = `
${GEM_PERSONA}

당신은 위 페르소나(GEMS 설정)에 따라 행동해야 합니다.
또한, 이 앱이 정상적으로 작동하기 위해 다음의 **기술적 출력 지침**을 반드시 준수해야 합니다.

1. **원문 포함**: 괘사(Hexagram Text)와 효사(Line Text) 풀이 시, 반드시 **한자 원문(Hanja)**과 그에 대한 **직역**, 그리고 **전문적인 해설**을 포함해야 합니다.
2. **객관적 괘/효 해석**: '괘사 풀이'와 '효사 풀이' 섹션에서는 **사용자의 질문이나 상황을 전혀 고려하지 말고**, 주역 본연의 철학적, 전통적 의미에만 집중하여 설명하십시오.
3. **전체 효 설명**: 뽑힌 괘의 **1효부터 6효까지 모든 효**에 대해 원문과 해석을 제공해야 합니다.
4. **심층 조언**: 별도로 요청되는 '조언' 섹션에서만 사용자의 이름, 질문, 상황을 고려하여 풀이하십시오. 이때 본괘(Original Hexagram)와 지괘(Changed Hexagram - 변효가 변해서 된 괘)의 관계를 통찰하여 긴 글로 구체적인 솔루션을 제시하십시오.
5. **정확한 괘 해석**: 프롬프트에 제공된 '확정된 괘' 정보를 절대적으로 신뢰하고 그에 맞는 풀이를 하십시오. AI 스스로 괘를 유추하여 다른 괘로 해석하지 마십시오.

입력으로 주어지는 6개의 효(Line) 값 (밑에서 위 순서):
- 6: 노음 (변하는 음효, Changing Yin) -> 본괘에서는 음(0), 지괘에서는 양(1)
- 7: 소양 (불변 양효, Static Yang) -> 본괘, 지괘 모두 양(1)
- 8: 소음 (불변 음효, Static Yin) -> 본괘, 지괘 모두 음(0)
- 9: 노양 (변하는 양효, Changing Yang) -> 본괘에서는 양(1), 지괘에서는 음(0)
`;

export const interpretHexagram = async (
  user: UserContext,
  lines: LineValue[]
): Promise<AnalysisResult> => {
  const model = "gemini-3-flash-preview"; 
  
  // 1. Calculate Hexagram Identity (Grounding)
  // Lines are bottom to top (index 0 to 5)
  // 7,9 are Odd (Yang/1). 6,8 are Even (Yin/0).
  const binaryKey = lines.map(line => (line % 2 !== 0 ? '1' : '0')).join('');
  const knownHexagram = HEXAGRAM_TABLE[binaryKey] || { name: "알 수 없는 괘", hanja: "Unknown" };

  const prompt = `
    [사용자 정보]
    이름: ${user.name}
    질문: ${user.question}
    상황 설명: ${user.situation}

    [확정된 괘 정보 (Ground Truth)]
    **이 괘는 '${knownHexagram.name} (${knownHexagram.hanja})'입니다.**
    AI는 효의 구성을 다시 계산하지 말고, 반드시 **${knownHexagram.name}**의 해석을 제공해야 합니다.

    [뽑힌 효 상세 (1효=맨 아래, 6효=맨 위)]
    1효: ${lines[0]}
    2효: ${lines[1]}
    3효: ${lines[2]}
    4효: ${lines[3]}
    5효: ${lines[4]}
    6효: ${lines[5]}

    위 괘(${knownHexagram.name})를 분석하여 다음 JSON 스키마에 맞춰 응답해주십시오.
    
    **중요 요구사항 (분량 준수)**:
    1. 'hexagram': 괘의 이름은 반드시 '${knownHexagram.name}'이어야 합니다. **'meaning'(해석)은 약 500자 분량으로** 괘의 철학적 의미와 상징을 아주 상세하게 서술하십시오.
    2. 'lines': 1효부터 6효까지 순서대로 배열. 각 효의 원문(한자), 번역. **'explanation'(해설)은 각 효당 약 200자 분량으로** 해당 효가 위치한 자리의 의미와 길흉을 상세히 설명하십시오.
    3. 'advice': 사용자의 상황에 맞춘 **약 1500자에서 2000자 사이의 매우 구체적이고 깊이 있는 조언**. 
       - 서론, 본론(현상 분석, 미래 예측, 구체적 행동 지침), 결론 등으로 구성하여 깊이 있게 서술하십시오.
       - 변효가 있다면 지괘(변한 괘)의 의미도 포함하여 서술하십시오.
       - **가독성을 위해 소제목과 문단을 적절히 나누어** 작성하십시오.
  `;

  try {
    const response = await genAI.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hexagram: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "예: 중천건 (重天乾)" },
                hanja: { type: Type.STRING, description: "괘사 한자 원문" },
                meaning: { type: Type.STRING, description: "괘사의 직역 및 전통적 해석 (약 500자)" }
              },
              required: ["name", "hanja", "meaning"]
            },
            lines: {
              type: Type.ARRAY,
              description: "1효부터 6효까지의 상세 정보",
              items: {
                type: Type.OBJECT,
                properties: {
                  position: { type: Type.INTEGER, description: "효의 위치 (1-6)" },
                  hanja: { type: Type.STRING, description: "효사 한자 원문" },
                  translation: { type: Type.STRING, description: "효사 직역" },
                  explanation: { type: Type.STRING, description: "해당 효의 전통적 해설 (각 200자 이상)" },
                  isChanging: { type: Type.BOOLEAN, description: "변효 여부" }
                },
                required: ["position", "hanja", "translation", "explanation", "isChanging"]
              }
            },
            changedHexagramName: { type: Type.STRING, description: "지괘(변해서 된 괘)의 이름 (없으면 null 또는 빈 문자열)" },
            advice: { type: Type.STRING, description: "사용자를 위한 맞춤형 심층 조언 (약 1500자~2000자, 소제목 및 문단 구분 필수)" }
          },
          required: ["hexagram", "lines", "advice"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AnalysisResult;
    }
    throw new Error("No response text");
  } catch (error) {
    console.error("Gemini interpretation failed:", error);
    // Fallback for error
    return {
      hexagram: { name: knownHexagram.name, hanja: knownHexagram.hanja, meaning: "해석을 불러오지 못했습니다." },
      lines: [],
      advice: "죄송합니다. AI 서비스 연결에 문제가 발생했습니다. 잠시 후 다시 시도해주세요."
    };
  }
};