// 6 = Old Yin (Changing) - 노음
// 7 = Young Yang (Static) - 소양
// 8 = Young Yin (Static) - 소음
// 9 = Old Yang (Changing) - 노양
export type LineValue = 6 | 7 | 8 | 9;

export interface DivinationStep {
  lines: LineValue[];
  isComplete: boolean;
}

export interface UserContext {
  name: string;
  question: string;
  situation: string;
}

export interface LineInfo {
  position: number;
  hanja: string;
  translation: string;
  explanation: string;
  isChanging: boolean;
}

export interface HexagramInfo {
  name: string; // e.g. "건위천 (乾爲天)"
  hanja: string; // Main text Hanja
  meaning: string; // Traditional meaning/translation (ignoring user context)
}

export interface AnalysisResult {
  hexagram: HexagramInfo;
  lines: LineInfo[]; // Array of 6 lines
  changedHexagramName?: string; // Name of the resulting hexagram if there are changing lines
  advice: string; // Personalized advice (~1500-2000 chars)
}