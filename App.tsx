import React, { useState, useEffect, useRef } from 'react';
import { UserContext, LineValue, AnalysisResult } from './types';
import { interpretHexagram } from './services/geminiService';
import { CoinAnimation } from './components/CoinAnimation';
import { HexagramDisplay } from './components/HexagramDisplay';

enum Step {
  INPUT,
  DIVINATION,
  ANALYZING,
  RESULT, // Shows traditional meaning
  ADVICE  // Shows personalized advice
}

const App: React.FC = () => {
  const [step, setStep] = useState<Step>(Step.INPUT);
  const [userContext, setUserContext] = useState<UserContext>({ name: '', question: '', situation: '' });
  const [lines, setLines] = useState<LineValue[]>([]);
  const [isTossing, setIsTossing] = useState(false);
  const [currentTossResult, setCurrentTossResult] = useState<[number, number, number] | undefined>(undefined);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const handleStart = () => {
    if (!userContext.name || !userContext.question) {
      alert("이름과 질문을 입력해주세요.");
      return;
    }
    setStep(Step.DIVINATION);
  };

  const tossCoins = () => {
    if (lines.length >= 6) return;
    setIsTossing(true);
    setCurrentTossResult(undefined);
  };

  const handleTossComplete = () => {
    const coin1 = Math.floor(Math.random() * 2) + 2;
    const coin2 = Math.floor(Math.random() * 2) + 2;
    const coin3 = Math.floor(Math.random() * 2) + 2;
    const sum = coin1 + coin2 + coin3;

    setCurrentTossResult([coin1, coin2, coin3]);
    setIsTossing(false);
    
    setLines(prev => [...prev, sum as LineValue]);
  };

  useEffect(() => {
    if (lines.length === 6 && !isTossing) {
        const timer = setTimeout(() => {
            setStep(Step.ANALYZING);
            performAnalysis();
        }, 1500);
        return () => clearTimeout(timer);
    }
  }, [lines, isTossing]);

  const performAnalysis = async () => {
    const result = await interpretHexagram(userContext, lines);
    setAnalysis(result);
    setStep(Step.RESULT);
  };

  const reset = () => {
    setLines([]);
    setAnalysis(null);
    setStep(Step.INPUT);
    setCurrentTossResult(undefined);
  };

  const handleSendEmail = () => {
    if (!analysis) return;

    const movingLinesText = analysis.lines
      .filter(l => l.isChanging)
      .map(l => `제${l.position}효`)
      .join(', ') || '없음';

    const subject = `[오빠가 점바주까] ${userContext.name}님의 주역 점괘 결과`;
    const body = `
[이용자 정보]
이름: ${userContext.name}
질문: ${userContext.question}
상황: ${userContext.situation}

[점괘 결과]
본괘: ${analysis.hexagram.name}
동효: ${movingLinesText}
지괘: ${analysis.changedHexagramName || '변화 없음'}

--------------------------------------------------

[당신을 위한 조언]
${analysis.advice}

--------------------------------------------------
오빠가 점바주까 - 주역 5000년의 지혜
    `.trim();

    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  useEffect(() => {
    // Scroll to top when step changes
    window.scrollTo(0, 0);
  }, [step]);

  return (
    <div className="min-h-screen bg-neutral-900 text-gray-100 flex flex-col items-center py-10 px-4 font-sans">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-yellow-500 mb-2 cursor-pointer" onClick={reset}>오빠가 점바주까</h1>
        <p className="text-gray-400 text-sm">주역 - 5000년의 지혜</p>
      </header>

      <main className="w-full max-w-3xl bg-neutral-800 rounded-xl shadow-2xl overflow-hidden border border-neutral-700 relative min-h-[600px]">
        
        {/* Step 1: Input */}
        {step === Step.INPUT && (
          <div className="p-8 space-y-6 animate-fade-in">
            <div className="space-y-4">
              <div>
                <label className="block text-yellow-500 text-sm font-bold mb-2">이름</label>
                <input 
                  type="text" 
                  value={userContext.name}
                  onChange={(e) => setUserContext({...userContext, name: e.target.value})}
                  className="w-full bg-neutral-700 border border-neutral-600 rounded p-3 text-white focus:outline-none focus:border-yellow-500 transition-colors"
                  placeholder="당신의 성함을 입력하세요"
                />
              </div>
              <div>
                <label className="block text-yellow-500 text-sm font-bold mb-2">묻고자 하는 질문</label>
                <input 
                  type="text" 
                  value={userContext.question}
                  onChange={(e) => setUserContext({...userContext, question: e.target.value})}
                  className="w-full bg-neutral-700 border border-neutral-600 rounded p-3 text-white focus:outline-none focus:border-yellow-500 transition-colors"
                  placeholder="예: 이번 사업을 시작해도 될까요?"
                />
              </div>
              <div>
                <label className="block text-yellow-500 text-sm font-bold mb-2">상황 설명 (선택사항)</label>
                <textarea 
                  value={userContext.situation}
                  onChange={(e) => setUserContext({...userContext, situation: e.target.value})}
                  className="w-full bg-neutral-700 border border-neutral-600 rounded p-3 text-white h-32 focus:outline-none focus:border-yellow-500 transition-colors resize-none"
                  placeholder="현재 처한 상황을 자세히 적을수록 정확한 풀이가 가능합니다."
                />
              </div>
            </div>
            <button 
              onClick={handleStart}
              className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-4 rounded transition-colors text-lg serif"
            >
              점괘 뽑기 시작
            </button>
          </div>
        )}

        {/* Step 2: Divination */}
        {step === Step.DIVINATION && (
          <div className="p-8 flex flex-col items-center space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-serif text-yellow-400">{userContext.name}님의 점괘를 짓습니다</h2>
              <p className="text-gray-400">마음을 차분히 하고, 질문을 되뇌이며 동전을 던지세요.</p>
              <p className="text-yellow-600 font-mono text-sm mt-2">{lines.length} / 6 효 확정됨</p>
            </div>

            <HexagramDisplay lines={lines} animateLast={!isTossing} />

            <div className="h-40 flex items-center justify-center w-full">
               <CoinAnimation 
                 isTossing={isTossing} 
                 onTossComplete={handleTossComplete} 
                 result={currentTossResult}
               />
            </div>

            <button
              onClick={tossCoins}
              disabled={isTossing || lines.length >= 6}
              className={`px-12 py-3 rounded-full font-bold text-lg transition-all transform active:scale-95 ${
                isTossing 
                  ? 'bg-neutral-600 text-gray-400 cursor-not-allowed' 
                  : 'bg-yellow-600 text-black hover:bg-yellow-500 hover:shadow-lg hover:shadow-yellow-500/20'
              }`}
            >
              {isTossing ? '천지감응...' : (lines.length === 0 ? '첫 번째 동전 던지기' : (lines.length === 6 ? '완료' : '다음 동전 던지기'))}
            </button>
          </div>
        )}

        {/* Step 3: Analyzing */}
        {step === Step.ANALYZING && (
          <div className="p-12 flex flex-col items-center justify-center space-y-6 text-center h-[600px]">
            <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
            <h3 className="text-xl font-serif text-gray-200">괘상을 읽고 하늘의 뜻을 해석중입니다...</h3>
            <p className="text-gray-500 text-sm">잠시만 기다려주세요.</p>
          </div>
        )}

        {/* Step 4: Result (Traditional Analysis) */}
        {step === Step.RESULT && analysis && (
          <div className="bg-neutral-800 animate-fade-in" ref={resultRef}>
             <div className="bg-neutral-900 p-6 border-b border-neutral-700 flex flex-col items-center sticky top-0 z-10 shadow-lg">
                <span className="text-yellow-600 text-xs font-bold uppercase tracking-widest mb-1">본괘(本卦)</span>
                <h2 className="text-3xl font-serif text-white mb-4">{analysis.hexagram.name}</h2>
                <div className="transform scale-75 origin-center -my-2">
                   <HexagramDisplay lines={lines} animateLast={false} />
                </div>
             </div>
             
             <div className="p-8 space-y-10">
                {/* 괘사 */}
                <section>
                    <div className="flex items-center gap-3 mb-4 border-b border-yellow-500/30 pb-2">
                        <span className="text-2xl">📜</span>
                        <h3 className="text-xl font-serif text-yellow-500">괘사 (卦辭)</h3>
                    </div>
                    <div className="bg-neutral-900/50 p-6 rounded-lg border border-neutral-700 space-y-4">
                        <p className="text-2xl font-serif text-white text-center py-2">{analysis.hexagram.hanja}</p>
                        <p className="text-yellow-400/90 text-center font-serif font-medium pb-4 border-b border-neutral-700">{analysis.hexagram.name}의 뜻</p>
                        <p className="text-gray-300 leading-relaxed whitespace-pre-wrap text-justify">
                            {analysis.hexagram.meaning}
                        </p>
                    </div>
                </section>

                {/* 효사 */}
                <section>
                    <div className="flex items-center gap-3 mb-4 border-b border-yellow-500/30 pb-2">
                        <span className="text-2xl">☰</span>
                        <h3 className="text-xl font-serif text-yellow-500">효사 (爻辭) 상세 풀이</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">* 동효(변효)는 붉은색으로 표시됩니다.</p>
                    
                    <div className="space-y-6">
                        {analysis.lines.map((line) => (
                            <div key={line.position} className={`relative p-5 rounded-lg border transition-all ${
                                line.isChanging 
                                ? 'bg-neutral-700/60 border-yellow-600/50 ring-1 ring-yellow-600/30' 
                                : 'bg-neutral-800 border-neutral-700'
                            }`}>
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-sm font-bold px-2 py-1 rounded ${line.isChanging ? 'bg-yellow-600 text-black' : 'bg-neutral-600 text-gray-300'}`}>
                                        제{line.position}효 {line.isChanging ? '(동효)' : ''}
                                    </span>
                                </div>
                                <p className="text-xl font-serif text-gray-200 mb-1">{line.hanja}</p>
                                <p className="text-sm text-yellow-500/80 mb-3">{line.translation}</p>
                                <p className="text-gray-400 text-sm leading-relaxed">{line.explanation}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <div className="pt-4 sticky bottom-6">
                    <button 
                        onClick={() => setStep(Step.ADVICE)}
                        className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-4 rounded-lg shadow-lg shadow-black/50 transition-all text-lg flex items-center justify-center gap-2 group"
                    >
                        <span>{userContext.name}님을 위한 조언 보기</span>
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                </div>
             </div>
          </div>
        )}

        {/* Step 5: Advice (Personalized) */}
        {step === Step.ADVICE && analysis && (
          <div className="bg-neutral-800 min-h-[600px] flex flex-col">
             <div className="bg-neutral-900 p-6 border-b border-neutral-700 flex flex-col items-center">
                <span className="text-yellow-600 text-sm font-bold uppercase tracking-widest mb-1">PERSONAL GUIDANCE</span>
                <h2 className="text-2xl font-serif text-white">{userContext.name}님의 운명</h2>
             </div>
             
             <div className="p-8 flex-grow flex flex-col gap-8">
                {/* Summary Grid */}
                <div className="bg-neutral-900/30 rounded-lg border border-neutral-700/50 overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-neutral-700/50">
                        {/* 질문 */}
                        <div className="bg-neutral-900/80 p-4">
                            <span className="block text-yellow-600 text-xs font-bold mb-1">질문 (問)</span>
                            <p className="text-gray-200 font-medium">{userContext.question}</p>
                        </div>
                        {/* 본괘 */}
                        <div className="bg-neutral-900/80 p-4">
                            <span className="block text-yellow-600 text-xs font-bold mb-1">본괘 (本卦)</span>
                            <p className="text-gray-200 font-serif">{analysis.hexagram.name}</p>
                        </div>
                        {/* 동효 */}
                        <div className="bg-neutral-900/80 p-4">
                            <span className="block text-yellow-600 text-xs font-bold mb-1">동효 (動爻)</span>
                            <p className="text-gray-200">
                                {analysis.lines.filter(l => l.isChanging).length > 0 
                                 ? analysis.lines.filter(l => l.isChanging).map(l => `제${l.position}효`).join(', ') 
                                 : '변화 없음'}
                            </p>
                        </div>
                        {/* 지괘 */}
                        <div className="bg-neutral-900/80 p-4">
                            <span className="block text-yellow-600 text-xs font-bold mb-1">지괘 (之卦)</span>
                            <p className="text-gray-200 font-serif">{analysis.changedHexagramName || '-'}</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-xl font-serif text-yellow-500 border-l-4 border-yellow-500 pl-3">당신을 위한 조언</h3>
                    <div className="prose prose-invert prose-yellow max-w-none">
                        <p className="text-lg leading-loose text-gray-200 font-sans whitespace-pre-wrap text-justify bg-neutral-800/50 rounded-lg">
                            {analysis.advice}
                        </p>
                    </div>
                </div>

                <div className="mt-auto pt-8 grid grid-cols-2 gap-4">
                     <button 
                        onClick={handleSendEmail}
                        className="w-full bg-neutral-700 hover:bg-neutral-600 text-gray-200 font-bold py-4 rounded transition-colors flex items-center justify-center gap-2"
                    >
                        <span>📧 메일 보내기</span>
                    </button>
                     <button 
                        onClick={reset}
                        className="w-full border border-neutral-600 text-gray-400 hover:text-white hover:border-white py-4 rounded transition-colors"
                    >
                        처음으로
                    </button>
                </div>
             </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;