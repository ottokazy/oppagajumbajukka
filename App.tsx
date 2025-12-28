import React, { useState, useEffect, useRef } from 'react';
import { UserContext, LineValue, AnalysisResult } from './types';
import { interpretHexagram, interpretPremiumQuestions } from './services/geminiService';
import { CoinAnimation } from './components/CoinAnimation';
import { HexagramDisplay } from './components/HexagramDisplay';

enum Step {
  INPUT,
  DIVINATION,
  ANALYZING,
  RESULT, // Shows traditional meaning
  ADVICE,  // Shows personalized advice
  PREMIUM_RESULT // Dedicated page for premium detailed analysis
}

// v4로 변경하여 데이터 구조 변경 반영 (강제 초기화)
const STORAGE_KEY = 'juyeok_user_data_v4';

const App: React.FC = () => {
  const [step, setStep] = useState<Step>(Step.INPUT);
  const [userContext, setUserContext] = useState<UserContext>({ name: '', question: '', situation: '' });
  const [lines, setLines] = useState<LineValue[]>([]);
  const [isTossing, setIsTossing] = useState(false);
  const [currentTossResult, setCurrentTossResult] = useState<[number, number, number] | undefined>(undefined);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  
  // Progress state for Analyzing step
  const [progress, setProgress] = useState(0);

  // Premium / Payment State
  const [showPremiumForm, setShowPremiumForm] = useState(false);
  const [premiumQuestions, setPremiumQuestions] = useState({ q1: '', q2: '' });
  const [premiumAdvice, setPremiumAdvice] = useState<string | null>(null);
  const [isPremiumLoading, setIsPremiumLoading] = useState(false);
  
  const resultRef = useRef<HTMLDivElement>(null);
  const premiumFormRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const mbtiTypes = [
    "ISTJ", "ISFJ", "INFJ", "INTJ",
    "ISTP", "ISFP", "INFP", "INTP",
    "ESTP", "ESFP", "ENFP", "ENTP",
    "ESTJ", "ESFJ", "ENFJ", "ENTJ"
  ];

  // Load Saved Data on Mount (Persistence for 1-time limit)
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        
        // 데이터 유효기간 체크 (24시간)
        const now = new Date().getTime();
        const savedTime = parsed.timestamp ? new Date(parsed.timestamp).getTime() : 0;
        const oneDay = 24 * 60 * 60 * 1000;

        if (now - savedTime > oneDay) {
           // 24시간 지났으면 데이터 만료 처리
           localStorage.removeItem(STORAGE_KEY);
           return;
        }

        if (parsed.analysis) {
          setUserContext(parsed.userContext);
          setLines(parsed.lines);
          setAnalysis(parsed.analysis);
          
          if (parsed.premiumAdvice) {
            setPremiumQuestions(parsed.premiumQuestions);
            setPremiumAdvice(parsed.premiumAdvice);
            setStep(Step.PREMIUM_RESULT);
          } else {
            setStep(Step.ADVICE);
          }
        }
      } catch (e) {
        console.error("Failed to load saved data", e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Simulate Progress Bar during Analysis
  useEffect(() => {
    if (step === Step.ANALYZING) {
      setProgress(0);
      const interval = setInterval(() => {
        setProgress((prev) => {
          // Rapidly go to ~70%, then slow down to wait for API
          const increment = prev < 70 ? Math.random() * 3 + 1 : Math.random() * 0.5;
          const next = prev + increment;
          return next >= 98 ? 98 : next; // Hold at 98% until complete
        });
      }, 100);

      return () => clearInterval(interval);
    }
  }, [step]);

  // Helper to save data
  const saveToStorage = (
    ctx: UserContext, 
    lns: LineValue[], 
    anl: AnalysisResult, 
    pQ: {q1: string, q2: string} = {q1:'', q2:''}, 
    pA: string | null = null
  ) => {
    const data = {
      userContext: ctx,
      lines: lns,
      analysis: anl,
      premiumQuestions: pQ,
      premiumAdvice: pA,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  // 인앱 브라우저 감지 (카카오톡, 페이스북, 인스타그램 등)
  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const inAppRules = ['KAKAOTALK', 'FBAV', 'FBAN', 'Instagram', 'Line', 'DaumApps'];
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
    const isInApp = inAppRules.some(rule => new RegExp(rule, 'i').test(ua));

    if (isMobile && isInApp) {
      setIsInAppBrowser(true);
    }
  }, []);

  // Initialize Portone (Iamport)
  useEffect(() => {
    if (window.IMP) {
        window.IMP.init("imp46424443"); 
    }
  }, []);

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  // Handle Real AI Analysis (Debug Mode / Bypass Payment)
  const handleDebugAnalysis = async () => {
      // 1. Validation
      if (!analysis) {
        alert("점괘 결과가 없습니다.");
        return;
      }
      if (!premiumQuestions.q1.trim() || !premiumQuestions.q2.trim()) {
        alert("추가 질문 2가지를 모두 입력해주세요.");
        return;
      }

      // 2. UI Loading State
      setIsPremiumLoading(true);
      setTimeout(() => {
          premiumFormRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      
      try {
          // 3. Call Actual API
          // 기존 분석 결과(analysis)를 통째로 넘겨서 맥락을 유지함
          const advice = await interpretPremiumQuestions(userContext, analysis, premiumQuestions);
          
          setPremiumAdvice(advice);
          // Save premium result immediately
          saveToStorage(userContext, lines, analysis, premiumQuestions, advice);
          setStep(Step.PREMIUM_RESULT);
      } catch (e) {
          console.error(e);
          alert("AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
          setIsPremiumLoading(false);
      }
  };

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
    setProgress(100); // Complete bar
    
    // Give a small delay to show 100%
    setTimeout(() => {
        setAnalysis(result);
        // Save basic result immediately
        saveToStorage(userContext, lines, result);
        setStep(Step.RESULT);
    }, 500);
  };

  // Reset is now effectively "Delete Data"
  const clearDataAndReset = () => {
    if (window.confirm("새로운 질문을 하시겠습니까?\n기존 점괘 내용은 사라집니다.")) {
      localStorage.removeItem(STORAGE_KEY);
      setLines([]);
      setAnalysis(null);
      setStep(Step.INPUT);
      setCurrentTossResult(undefined);
      setShowPremiumForm(false);
      setPremiumQuestions({ q1: '', q2: '' });
      setPremiumAdvice(null);
      setIsPremiumLoading(false);
      setProgress(0);
      setUserContext({ name: '', question: '', situation: '' });
    }
  };

  const handleSendEmail = () => {
    if (!analysis) return;

    const movingLinesText = analysis.lines
      .filter(l => l.isChanging)
      .map(l => `제${l.position}효`)
      .join(', ') || '없음';

    const linesDetails = analysis.lines.map(line => 
        `[제${line.position}효${line.isChanging ? ' - 동효' : ''}]\n${line.hanja}\n${line.translation}\n${line.explanation}`
    ).join('\n\n');

    const summaryText = analysis.coreSummary ? analysis.coreSummary.map((s, i) => `${i + 1}. ${s}`).join('\n') : '요약 없음';

    let body = `
[이용자 정보]
이름: ${userContext.name}
질문: ${userContext.question}
상황: ${userContext.situation}
MBTI: ${userContext.mbti || '정보 없음'}

[점괘 결과 요약]
본괘: ${analysis.hexagram.name}
동효: ${movingLinesText}
지괘: ${analysis.changedHexagramName || '변화 없음'}

==================================================

[당신을 위한 3줄 핵심 요약]
${summaryText}

[당신을 위한 상세 조언]
${analysis.advice}
`.trim();

    if (premiumAdvice) {
        body += `\n\n==================================================\n\n[PREMIUM 심층 분석]\n${premiumAdvice}`;
    }

    body += `\n\n==================================================

[괘사 풀이 (본괘)]
${analysis.hexagram.hanja}
원문: ${analysis.hexagram.statement_hanja}
해석: ${analysis.hexagram.statement_translation}

상세풀이:
${analysis.hexagram.explanation}

==================================================

[효사 상세 풀이]
${linesDetails}

--------------------------------------------------
오빠가 점바주까 - 주역 5000년의 지혜`;

    const subject = `[오빠가 점바주까] ${userContext.name}님의 주역 점괘 결과`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // Toggle Premium Form
  const togglePremiumForm = () => {
    setShowPremiumForm(true);
    setTimeout(() => {
        premiumFormRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Handle Payment Logic
  const handlePayment = () => {
      if (!premiumQuestions.q1.trim()) {
          alert("첫 번째 추가 질문을 입력해주세요.");
          return;
      }

      if (!window.IMP) {
          alert("결제 모듈 로딩 중입니다. 잠시 후 다시 시도해주세요.");
          return;
      }

      // Portone Request Payment
      window.IMP.request_pay({
          pg: "kakaopay.TC0ONETIME", // 테스트용 카카오페이 CID
          pay_method: "card",
          merchant_uid: `mid_${new Date().getTime()}`,
          name: "주역 심층 풀이 (추가 질문)",
          amount: 3000, // 테스트 금액 (3000원)
          buyer_email: "",
          buyer_name: userContext.name,
          buyer_tel: "010-0000-0000", // 필수값이라 더미 데이터 삽입
          m_redirect_url: window.location.href, // 모바일 결제 후 리다이렉트 될 주소
      }, async (rsp: any) => {
          if (rsp.success) {
              // 결제 성공 -> AI 분석 시작 (결제 성공 시에도 실제 API 호출)
              await handleDebugAnalysis();
          } else {
              // 결제 실패 시 로직
              alert(`결제에 실패하였습니다.\n에러내용 : ${rsp.error_msg}`);
          }
      });
  };

  const getChangedLines = (originalLines: LineValue[]): LineValue[] => {
    return originalLines.map(val => {
      if (val === 6) return 7; 
      if (val === 9) return 8; 
      return val; 
    });
  };

  // Improved text renderer for prettier output
  const renderFormattedText = (text: string, isPremium: boolean = false) => {
    if (!text) return null;
    
    // Safety replacement for Safari \n issue
    const safeText = text.replace(/\\n/g, '\n'); 
    
    const segments = safeText.split('\n');
    const primaryColor = isPremium ? 'text-purple-300' : 'text-yellow-500';
    const borderColor = isPremium ? 'border-purple-500' : 'border-yellow-500';
    const accentColor = isPremium ? 'bg-purple-500' : 'bg-yellow-500';

    return segments.map((segment, index) => {
      const trimmed = segment.trim();
      if (!trimmed) return <div key={index} className="h-4"></div>; // More spacious break

      // 1. Detect Standard Headers ([Header])
      const isBracketHeader = (trimmed.startsWith('[') && trimmed.includes(']'));
      // 2. Detect Colon Headers (Header: )
      const isColonHeader = !isBracketHeader && trimmed.endsWith(':') && trimmed.length < 20;
      // 3. Detect Markdown Headers (### Header) - NEW
      const isMarkdownHeader = trimmed.startsWith('#');
      
      // Combined Header Logic
      const isHeader = isBracketHeader || isColonHeader || isMarkdownHeader;

      // 4. Special "Question" Headers (e.g., ### **Q1:...) - NEW
      // Detect if it's a Q1/Q2 header often returned by AI in Premium Mode
      const isQuestionHeader = isPremium && (trimmed.includes('Q1') || trimmed.includes('Q2') || trimmed.includes('질문 1') || trimmed.includes('질문 2'));
      
      if (isQuestionHeader && isHeader) {
          const cleanHeader = trimmed.replace(/#/g, '').replace(/\*/g, '').trim();
          return (
             <div key={index} className="mt-8 mb-4">
                 <div className="bg-purple-900/50 border-l-4 border-purple-400 p-4 rounded-r-lg shadow-lg flex items-center gap-3">
                     <span className="text-2xl">🧐</span>
                     <h4 className="text-xl font-bold text-white font-serif">{cleanHeader}</h4>
                 </div>
             </div>
          );
      }

      // Normal Headers
      if (isHeader) {
        // Clean the header text
        const cleanHeader = trimmed.replace(/\[|\]/g, '').replace(/#/g, '').replace(/\*/g, '').trim();
        return (
          <div key={index} className="mt-10 mb-6 group">
            <div className={`flex items-center gap-3 mb-2`}>
                <div className={`h-px w-8 ${accentColor} opacity-50`}></div>
                <h4 className={`text-xl font-serif font-bold ${primaryColor} tracking-wide`}>
                    {cleanHeader}
                </h4>
                <div className={`h-px flex-grow ${accentColor} opacity-20`}></div>
            </div>
          </div>
        );
      }

      // Detect List Items: Starts with number dot (1., 2.)
      const isListItem = /^\d+\./.test(trimmed);

      // Detect "Strong" statements (e.g., quotes or emphasis)
      const isEmphasis = trimmed.startsWith('"') || trimmed.startsWith("'") || trimmed.includes("명심하십시오") || trimmed.includes("중요합니다");

      if (isListItem) {
          const [num, ...rest] = trimmed.split('.');
          return (
              <div key={index} className="flex gap-4 mb-4 pl-2">
                  <span className={`flex-shrink-0 w-8 h-8 rounded-full ${isPremium ? 'bg-purple-900/50 text-purple-300' : 'bg-yellow-900/50 text-yellow-300'} flex items-center justify-center font-bold font-serif border ${borderColor} border-opacity-30`}>
                      {num}
                  </span>
                  <p className="text-lg text-gray-200 leading-relaxed pt-0.5 text-justify">
                      {rest.join('.')}
                  </p>
              </div>
          );
      }

      return (
        <p key={index} className={`text-lg leading-[1.8] mb-4 text-justify ${isEmphasis ? 'text-gray-100 font-medium pl-6 border-l-4 ' + borderColor : 'text-gray-300'}`}>
          {trimmed.replace(/\*\*/g, '') /* Remove markdown bold markers for cleaner text */}
        </p>
      );
    });
  };

  // --------------------------------------------------------------------------------
  // Render Logic for the new "Divination" Step (Dark Oriental Theme)
  // --------------------------------------------------------------------------------
  const renderDivinationStep = () => {
    // Current Progress (0 to 6)
    const count = lines.length;
    
    // We display 6 lines vertically. 
    // Line 6 is Top (Index 5 in array), Line 1 is Bottom (Index 0).
    // Array: [line1, line2, line3, ...]
    
    const renderHexagramSlot = (position: number) => {
       // position 6 means Top line (Index 5 in logic)
       // position 1 means Bottom line (Index 0 in logic)
       
       const arrayIndex = position - 1;
       const lineValue = lines[arrayIndex];
       
       // Status
       const isConfirmed = count > arrayIndex;
       const isActive = count === arrayIndex; // The one we are about to throw for
       
       // Styles
       const labelOpacity = isConfirmed || isActive ? "text-antique-white font-bold" : "text-white/50";
       const labelSize = isConfirmed || isActive ? "text-sm" : "text-xs";
       
       let content;
       
       if (isConfirmed) {
           // Render Confirmed Line
           const isYang = lineValue === 7 || lineValue === 9;
           const isMoving = lineValue === 6 || lineValue === 9; // 6(Old Yin), 9(Old Yang) are moving

           // Colors: Moving -> Dark Ivory, Static -> Yellow
           // HIGHLIGHT REMOVED: No more shadow-glow on moving lines
           const barColor = isMoving ? "bg-ivory-dark" : "bg-primary";
           const shadowColor = isMoving ? "" : "shadow-[0_0_8px_rgba(238,189,43,0.3)]";

           // Moving Line Indicator (Dot)
           // HIGHLIGHT REMOVED: No more shadow on dot
           const dotIndicator = isMoving ? (
               <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-ivory-dark rounded-full"></div>
           ) : null;

           // If it's a confirmed line
           if (isYang) {
               // Yang: Solid bar
               content = (
                   <div className={`h-3.5 w-full ${barColor} rounded-sm relative ${shadowColor} animate-fade-in`}>
                       {dotIndicator}
                   </div>
               );
           } else {
               // Yin: Broken bar
               content = (
                   <div className="h-3.5 w-full flex justify-between relative animate-fade-in">
                        {dotIndicator}
                        <div className={`h-full w-[42%] ${barColor} rounded-sm ${shadowColor}`}></div>
                        <div className={`h-full w-[42%] ${barColor} rounded-sm ${shadowColor}`}></div>
                   </div>
               );
           }
       } else if (isActive) {
           // Render Active Placeholder (Pulse)
           content = (
               <div className="h-3.5 w-full bg-ivory-dark rounded-sm relative shadow-[0_0_12px_rgba(209,199,183,0.5)] animate-pulse">
                   <div className="absolute -left-5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-ivory-dark rounded-full"></div>
               </div>
           );
       } else {
           // Render Future Placeholder (Faint Dark Brown)
           content = (
               <div className="h-3.5 w-full bg-unconfirmed rounded-sm relative opacity-90"></div>
           );
       }

       return (
         <React.Fragment key={position}>
             <span className={`text-right ${labelSize} ${labelOpacity} font-sans font-medium tracking-tight`}>{position}효</span>
             {content}
         </React.Fragment>
       );
    };

    return (
        <div className="relative flex h-full min-h-screen w-full flex-col bg-oriental-pattern overflow-x-hidden max-w-md mx-auto border-x border-white/5 shadow-2xl">
            {/* Header */}
            <header className="grid grid-cols-[48px_1fr_48px] items-center p-4 pt-6 bg-transparent z-10 relative">
                <div className="justify-self-start">
                    <button onClick={clearDataAndReset} className="text-white/60 hover:text-primary transition-colors flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/5">
                        <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                    </button>
                </div>
                <div className="flex items-center gap-1.5 justify-self-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/40"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/40"></span>
                </div>
                <div className="justify-self-end"></div>
            </header>

            <main className="flex-1 flex flex-col items-center w-full px-6 pb-8 relative">
                {/* Title */}
                <div className="text-center mt-2 mb-8 animate-fade-in">
                    <h2 className="text-antique-white font-serif text-[26px] font-bold leading-tight mb-3 tracking-tight">
                        <span className="text-primary">{userContext.name}</span>님의<br/>점괘를 짓습니다.
                    </h2>
                    <p className="text-antique-white/70 font-sans text-sm leading-relaxed max-w-[280px] mx-auto">
                        마음을 차분히 하고, 당신의 고민을 떠올리며<br/>동전을 던져주세요.
                    </p>
                </div>

                {/* Content Area */}
                <div className="flex-1 w-full flex flex-col justify-start items-center gap-8 relative">
                    
                    {/* Hexagram Status Card */}
                    <div className="w-full max-w-[320px] bg-surface-dark/40 border border-white/5 backdrop-blur-sm shadow-inner rounded-2xl p-6 px-8 flex flex-col justify-center animate-fade-in-up">
                        <div className="grid grid-cols-[36px_1fr] gap-x-6 gap-y-4 items-center w-full">
                            {/* Render rows from 6 down to 1 */}
                            {renderHexagramSlot(6)}
                            {renderHexagramSlot(5)}
                            {renderHexagramSlot(4)}
                            {renderHexagramSlot(3)}
                            {renderHexagramSlot(2)}
                            {renderHexagramSlot(1)}
                        </div>
                    </div>

                    {/* Coins */}
                    <CoinAnimation 
                        isTossing={isTossing} 
                        onTossComplete={handleTossComplete} 
                        result={currentTossResult}
                    />
                    
                    {/* Status Pill */}
                    <div className="bg-surface-dark px-5 py-2.5 rounded-full border border-primary/20 shadow-[0_0_20px_rgba(238,189,43,0.08)] animate-fade-in">
                        <p className="text-primary text-sm font-medium tracking-wide font-sans flex items-center gap-2">
                            {count < 6 ? (
                                <span className="material-symbols-outlined text-[18px] animate-pulse">check_circle</span>
                            ) : (
                                <span className="material-symbols-outlined text-[18px]">verified</span>
                            )}
                            현재 {count} / 6 효 확정됨
                        </p>
                    </div>
                </div>

                {/* Bottom Actions */}
                <div className="w-full mt-auto pt-6 flex flex-col gap-6 animate-fade-in-up delay-100">
                    <div className="flex flex-col gap-2 w-full px-1">
                        <div className="flex justify-between items-end">
                            <span className="text-white/50 text-xs font-sans">진행률</span>
                            <span className="text-primary text-sm font-bold font-sans">{Math.round((count / 6) * 100)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-primary rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(238,189,43,0.5)]" 
                                style={{ width: `${(count / 6) * 100}%` }}
                            ></div>
                        </div>
                        <p className="text-center text-xs text-white/40 mt-1 font-sans">
                            {count < 6 ? '다음 효를 얻기 위해 동전을 던지세요' : '모든 효가 확정되었습니다'}
                        </p>
                    </div>
                    
                    <button 
                        onClick={tossCoins}
                        disabled={isTossing || count >= 6}
                        className={`w-full bg-primary hover:bg-primary-dark active:scale-[0.98] transition-all text-background-dark font-serif font-bold text-lg h-14 rounded-xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(238,189,43,0.25)] ring-1 ring-white/20 group relative overflow-hidden ${
                            (isTossing || count >= 6) ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                    >
                        {isTossing ? (
                           <>
                             <span className="relative z-10">운명을 읽는 중...</span>
                             <div className="w-5 h-5 border-2 border-background-dark border-t-transparent rounded-full animate-spin"></div>
                           </>
                        ) : (
                           <>
                             <span className="relative z-10">{count === 0 ? '첫 번째 동전 던지기' : (count >= 6 ? '점괘 해석하기' : '다음 동전 던지기')}</span>
                             <span className="material-symbols-outlined relative z-10">casino</span>
                             <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                           </>
                        )}
                    </button>
                </div>
            </main>
        </div>
    );
  };

  // Main Render
  return (
    <div className={`min-h-screen ${step === Step.INPUT ? 'bg-background-light dark:bg-oriental-gradient' : 'bg-neutral-900'} text-gray-100 flex flex-col items-center font-sans relative`} ref={topRef}>
      
      {/* Step 1: Input (Redesigned) */}
      {step === Step.INPUT && (
         <div className="relative w-full max-w-md min-h-screen flex flex-col bg-transparent shadow-2xl overflow-hidden">
            <div className="bg-noise"></div>
            {/* Nav Bar (Visual) */}
            <div className="flex items-center px-4 pt-6 pb-2 justify-between z-10 sticky top-0 backdrop-blur-md">
                <button className="text-gray-800 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                    <span className="material-symbols-outlined" style={{fontSize: '24px'}}>arrow_back</span>
                </button>
                <div className="flex items-center gap-2 opacity-50">
                    <span className="material-symbols-outlined text-primary" style={{fontSize: '20px'}}>balance</span>
                </div>
                <button className="text-gray-800 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                    <span className="material-symbols-outlined" style={{fontSize: '24px'}}>menu</span>
                </button>
            </div>

            <main className="flex-1 px-5 py-2 overflow-y-auto pb-32 z-10">
                <div className="flex flex-col items-center justify-center pt-8 pb-12 text-center space-y-4">
                    <div className="relative mb-4">
                        <div className="absolute -inset-2 rounded-full bg-primary/20 blur-2xl"></div>
                        <img 
                            alt="Mystical smoke and geometric shapes forming a subtle yin yang pattern" 
                            className="relative w-28 h-28 rounded-full border-2 border-primary/50 object-cover shadow-2xl" 
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCs22X-IW-rTMigMOERmvN86Cx9d53_z1hrq5-h7ntl8luLP_gY4JfmwHEjE5dlcjOADOc4qM5x4MX5mn2uTX8ErZZBk5rgI9Xfnj3r_6U2cOOzZct3o6LYH9ZgboIJDgWZvni1F1UNY3a02GsIhZYmsCFwlMEqqTEfRy3cb66GYuhhFyxPI2LzTDJ4kv2_ECwMnHhJ_EXHXrABCAjgzWOKJoFEUry9DtbfNjWRn5VGuWLSJaGC2rdfItFEGRsQ7o8Mjy6JYCHQlc0"
                        />
                    </div>
                    {/* Adjusted Title Size: text-3xl md:text-4xl */}
                    <h1 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight drop-shadow-sm">
                        오빠가 <span className="text-primary italic">점</span>봐주까
                    </h1>
                    <div className="flex items-center gap-4 py-2">
                        <div className="h-[1px] w-12 bg-gradient-to-r from-transparent via-primary to-transparent"></div>
                        <h2 className="font-serif text-primary text-base md:text-lg font-medium tracking-[0.3em] uppercase">주역 - 5000년의 지혜</h2>
                        <div className="h-[1px] w-12 bg-gradient-to-r from-transparent via-primary to-transparent"></div>
                    </div>
                </div>

                <div className="flex flex-col gap-8">
                    {/* Name Input */}
                    <div className="space-y-2 group">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-[20px]">person</span>
                            이름
                        </label>
                        <input 
                            className="w-full bg-white dark:bg-input-dark border border-gray-300 dark:border-border-gold rounded-xl px-4 py-4 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-sm" 
                            placeholder="홍길동" 
                            type="text"
                            value={userContext.name}
                            onChange={(e) => setUserContext({...userContext, name: e.target.value})}
                        />
                    </div>

                    {/* Question Input */}
                    <div className="space-y-2 group">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-[20px]">help</span>
                            묻고자 하는 질문
                        </label>
                        <input 
                            className="w-full bg-white dark:bg-input-dark border border-gray-300 dark:border-border-gold rounded-xl px-4 py-4 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-sm" 
                            placeholder="이직을 해야 할까요?" 
                            type="text"
                            value={userContext.question}
                            onChange={(e) => setUserContext({...userContext, question: e.target.value})}
                        />
                    </div>

                    {/* Situation Input */}
                    <div className="space-y-2 group">
                        <div className="flex justify-between items-end">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-[20px]">description</span>
                                현재 상황 <span className="text-xs text-gray-400 font-normal ml-1">(선택사항)</span>
                            </label>
                            <span className="text-[11px] text-primary/80 dark:text-primary/70">*구체적일수록 정확합니다</span>
                        </div>
                        <textarea 
                            className="w-full bg-white dark:bg-input-dark border border-gray-300 dark:border-border-gold rounded-xl px-4 py-4 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none transition-all duration-300 shadow-sm leading-relaxed" 
                            placeholder="현재 겪고 있는 상황이나 고민의 배경을 적어주세요..." 
                            rows={4}
                            value={userContext.situation}
                            onChange={(e) => setUserContext({...userContext, situation: e.target.value})}
                        ></textarea>
                    </div>

                    {/* MBTI Input */}
                    <div className="space-y-3 pt-2 pb-6">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-[20px]">psychology</span>
                            MBTI <span className="text-xs text-gray-400 font-normal ml-1">(선택사항)</span>
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {mbtiTypes.map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setUserContext({...userContext, mbti: type})}
                                    className={`text-xs py-3 text-center rounded-lg border transition-colors ${
                                        userContext.mbti === type 
                                            ? 'bg-primary text-background-dark border-primary font-bold' 
                                            : 'border-gray-300 dark:border-gray-700 bg-white/50 dark:bg-input-dark/50 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </main>

            {/* Fixed Bottom Button */}
            <div className="absolute bottom-0 left-0 w-full bg-background-light dark:bg-background-dark border-t border-gray-200 dark:border-gray-800 px-5 pt-4 pb-8 z-20 shadow-[0_-5px_20px_rgba(0,0,0,0.1)]">
                <button 
                    onClick={handleStart}
                    className="w-full relative group overflow-hidden bg-primary hover:bg-primary-dark text-background-dark font-serif font-bold text-xl py-4 rounded-xl shadow-lg transition-all duration-300 transform active:scale-[0.98] border border-primary/20"
                >
                    <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer"></div>
                    <span className="relative flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined" style={{fontSize: '28px'}}>auto_awesome</span>
                        하늘과 감응하기
                    </span>
                </button>
                <p className="text-[11px] text-center text-gray-400 dark:text-primary/60 mt-3 font-medium tracking-tight">
                    입력하신 정보는 점괘 생성 목적으로만 사용되며 저장되지 않습니다.
                </p>
            </div>
         </div>
      )}

      {/* Step 2: Divination (Ritual) */}
      {step === Step.DIVINATION && renderDivinationStep()}

      {/* Step 3: Analyzing (Full Screen Redesign) */}
      {step === Step.ANALYZING && (
        <div className="relative w-full max-w-md min-h-screen flex flex-col overflow-hidden bg-background-dark">
            <div className="absolute inset-0 bg-oriental-gradient pointer-events-none z-0"></div>
            
            {/* Header */}
            <header className="relative z-10 flex items-center bg-transparent p-4 pt-6 justify-between">
                <button onClick={clearDataAndReset} className="text-white/60 hover:text-primary transition-colors flex size-12 shrink-0 items-center justify-center cursor-pointer rounded-full hover:bg-white/5">
                        <span className="material-symbols-outlined text-[24px]">arrow_back_ios_new</span>
                </button>
            </header>

            <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 gap-10 w-full max-w-md mx-auto pb-20">
                <h1 className="text-primary text-2xl font-serif font-bold leading-relaxed tracking-tight drop-shadow-sm text-center animate-fade-in">
                    괘상을 읽고<br/>하늘의 뜻을 해석 중입니다...
                </h1>
                
                <div className="flex flex-col items-center w-full gap-6 animate-fade-in delay-100">
                    <div className="w-full max-w-[240px] flex flex-col gap-2">
                        {/* Progress Bar Track */}
                        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                            {/* Progress Bar Fill */}
                            <div 
                                className="h-full rounded-full bg-primary shadow-[0_0_10px_#eebd2b] transition-all duration-300 ease-out" 
                                style={{ width: `${Math.round(progress)}%` }}
                            ></div>
                        </div>
                        
                        {/* Labels */}
                        <div className="flex justify-between text-[10px] text-primary/60 font-sans uppercase tracking-widest font-medium">
                            <span>Analyzing...</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                    </div>
                    
                    <p className="text-slate-400 dark:text-white/60 font-sans text-sm md:text-base leading-relaxed break-keep max-w-[320px] text-center">
                        주역은 고정된 결과가 아니라<br/>상황과 변화에 대해 이야기합니다.
                    </p>
                </div>
            </main>
        </div>
      )}

      {/* Other Steps */}
      {step !== Step.INPUT && step !== Step.DIVINATION && step !== Step.ANALYZING && (
        <div className="relative w-full min-h-screen flex flex-col overflow-hidden bg-background-dark">
             <div className="w-full h-full flex flex-col p-0 md:p-8 items-center">
                {/* Step 4: Result (Traditional Analysis) - REDESIGNED */}
                {step === Step.RESULT && analysis && (
                <div className="min-h-screen w-full bg-oriental-pattern flex justify-center">
                 <div className="w-full max-w-lg flex flex-col relative bg-transparent shadow-2xl min-h-screen" ref={resultRef}>
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-dark/80 to-background-dark pointer-events-none z-0"></div>
                    
                    {/* Header with Back Button and Progress Dots */}
                    <header className="relative z-10 flex items-center p-4 pt-6 justify-between">
                        <button onClick={clearDataAndReset} className="text-white/60 hover:text-primary transition-colors flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/5">
                            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                        </button>
                        
                        {/* 5-Dot Progress Indicator (3rd active) */}
                        <div className="flex gap-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                             <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                             <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(238,189,43,0.6)]"></div>
                             <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                             <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                        </div>
                        
                        <div className="size-10"></div>
                    </header>

                    <div className="relative z-10 px-4 pb-24 flex-1 overflow-y-auto">
                        {/* Main Hexagram Card */}
                        <div className="mt-4 mb-8 flex flex-col items-center animate-fade-in-up">
                            {/* REMOVED HEXAGRAM Label */}
                            <h2 className="text-4xl font-serif text-primary mb-6 drop-shadow-md">{analysis.hexagram.name}</h2>
                            
                            <div className="bg-surface-dark/40 backdrop-blur-md p-6 rounded-2xl border border-white/5 shadow-2xl w-full max-w-[320px] mx-auto transform hover:scale-[1.02] transition-transform duration-500">
                                <HexagramDisplay lines={lines} animateLast={false} />
                            </div>
                        </div>
                        
                        <div className="space-y-8 animate-fade-in-up delay-100">
                            {/* 괘사 (General Meaning) - RESTRUCTURED */}
                            <section>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="h-px w-6 bg-primary/40"></div>
                                    <h3 className="text-lg font-serif text-antique-white">괘사 (卦辭)</h3>
                                    <div className="h-px flex-1 bg-primary/40"></div>
                                </div>
                                <div className="bg-surface-dark/30 backdrop-blur-sm p-6 rounded-xl border border-white/5 space-y-4">
                                    {/* Subtitle removed as per request */}
                                    <div className="text-center pb-4 border-b border-white/5">
                                        <p className="text-3xl font-serif text-white/90 mb-2">{analysis.hexagram.hanja}</p>
                                    </div>
                                    
                                    {/* New Structure: Statement -> Translation -> Explanation */}
                                    <div className="text-center px-2 py-2">
                                         <p className="text-xl font-serif text-white/90 mb-1">{analysis.hexagram.statement_hanja}</p>
                                         <p className="text-xs text-primary/70 mb-2">{analysis.hexagram.statement_translation}</p>
                                    </div>
                                    
                                    {/* Explanation with proper spacing */}
                                    <div className="text-gray-300 leading-loose text-justify font-sans text-sm md:text-base">
                                        {/* Use renderFormattedText logic simplified for paragraphs */}
                                        {analysis.hexagram.explanation.split(/\n+/).map((para, i) => (
                                            para.trim() ? <p key={i} className="mb-4 last:mb-0">{para}</p> : null
                                        ))}
                                    </div>
                                </div>
                            </section>

                            {/* 효사 (Line Meanings) */}
                            <section>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="h-px w-6 bg-primary/40"></div>
                                    <h3 className="text-lg font-serif text-antique-white">효사 (爻辭) 상세 풀이</h3>
                                    <div className="h-px flex-1 bg-primary/40"></div>
                                </div>
                                
                                <div className="space-y-4">
                                    {analysis.lines.map((line) => (
                                        <div key={line.position} className={`relative p-5 rounded-xl border transition-all duration-300 ${
                                            line.isChanging 
                                            ? 'bg-surface-dark/80 border-ivory-dark/30 shadow-[0_0_15px_rgba(209,199,183,0.05)]' 
                                            : 'bg-white/5 border-white/5 opacity-80'
                                        }`}>
                                            <div className="flex justify-between items-start mb-2">
                                                {/* Modified Badge Style: Yellow background for Changing Lines */}
                                                <span className={`text-xs font-bold px-2 py-1 rounded tracking-wider ${line.isChanging ? 'bg-primary text-background-dark' : 'bg-white/10 text-gray-400'}`}>
                                                    제{line.position}효 {line.isChanging ? '● 동효' : ''}
                                                </span>
                                            </div>
                                            <div className="flex gap-4 mt-3">
                                                {/* REMOVED Vertical Bar */}
                                                <div>
                                                    <p className="text-xl font-serif text-white/90 mb-1">{line.hanja}</p>
                                                    <p className="text-xs text-primary/70 mb-2">{line.translation}</p>
                                                    <p className="text-gray-400 text-sm leading-loose text-justify">{line.explanation}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    </div>

                    {/* Fixed Bottom Button - REDESIGNED */}
                    <div className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-background-dark via-background-dark to-transparent pt-12 pb-8 px-5 z-20 pointer-events-none flex justify-center">
                        <div className="w-full max-w-lg pointer-events-auto">
                            <button 
                                onClick={() => setStep(Step.ADVICE)}
                                className="w-full bg-primary hover:bg-primary-dark text-background-dark font-serif font-bold text-lg py-4 rounded-xl shadow-[0_0_20px_rgba(238,189,43,0.3)] transition-all flex items-center justify-center gap-2 group relative overflow-hidden"
                            >
                                <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></span>
                                <span className="relative flex items-center gap-2">
                                    <span className="material-symbols-outlined">auto_awesome</span>
                                    {userContext.name}님에 대한 현실적 조언 보기
                                </span>
                            </button>
                        </div>
                    </div>
                 </div>
                </div>
                )}

                {/* Step 5: Advice (Personalized) */}
                {step === Step.ADVICE && analysis && (
                <div className="min-h-screen w-full bg-oriental-pattern flex justify-center">
                  <div className="w-full max-w-lg flex flex-col relative bg-transparent shadow-2xl min-h-screen">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-dark/80 to-background-dark pointer-events-none z-0"></div>

                    {/* Header */}
                    <header className="relative z-10 flex items-center p-4 pt-6 justify-between">
                        <button onClick={() => setStep(Step.RESULT)} className="text-white/60 hover:text-primary transition-colors flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/5">
                            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                        </button>
                        
                        {/* Simple Title in Header */}
                        <span className="text-lg font-serif text-antique-white opacity-80">하늘의 응답</span>
                        
                        <div className="size-10"></div>
                    </header>
                    
                    <div className="relative z-10 px-5 pb-24 flex-1 overflow-y-auto">
                        
                        {/* Main Title Section */}
                        <div className="mt-4 mb-8">
                            <h1 className="text-3xl font-serif text-primary leading-tight mb-2">
                                {userContext.name}님을 위한<br/>현실적 조언
                            </h1>
                            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent mt-4"></div>
                        </div>

                        {/* Summary Card (Glassmorphism) */}
                        <div className="bg-surface-dark/40 backdrop-blur-md rounded-xl border border-white/5 p-5 mb-8 shadow-lg">
                            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                                {/* Question */}
                                <div className="col-span-2 border-b border-white/5 pb-4">
                                    <span className="block text-primary/60 text-xs font-bold mb-1 tracking-wider uppercase">Question</span>
                                    <p className="text-gray-200 font-medium leading-snug">{userContext.question}</p>
                                </div>
                                
                                {/* Hexagrams */}
                                <div className="flex flex-col items-center border-r border-white/5 pr-2">
                                    <span className="block text-primary/60 text-xs font-bold mb-2">본괘 (Start)</span>
                                    <div className="scale-75 origin-top">
                                        <HexagramDisplay lines={lines} animateLast={false} simple={true} compact={true} />
                                    </div>
                                    <p className="text-antique-white font-serif mt-2">{analysis.hexagram.name}</p>
                                </div>
                                <div className="flex flex-col items-center pl-2">
                                    <span className="block text-primary/60 text-xs font-bold mb-2">지괘 (End)</span>
                                    <div className="scale-75 origin-top">
                                        <HexagramDisplay lines={getChangedLines(lines)} animateLast={false} simple={true} compact={true} />
                                    </div>
                                    <p className="text-antique-white font-serif mt-2">{analysis.changedHexagramName || '-'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Core Summary */}
                        {analysis.coreSummary && analysis.coreSummary.length > 0 && (
                            <div className="mb-10">
                                <h3 className="flex items-center gap-2 text-antique-white font-serif text-lg mb-4">
                                    <span className="text-primary">✦</span> 핵심 요약
                                </h3>
                                <div className="space-y-4">
                                    {analysis.coreSummary.map((item, idx) => (
                                        <div key={idx} className="bg-white/5 rounded-xl p-5 border border-white/5 flex gap-4 items-center">
                                            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 text-primary text-base font-bold flex items-center justify-center border border-primary/30">
                                                {idx + 1}
                                            </span>
                                            <p className="text-gray-200 text-lg leading-relaxed">{item}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Main Advice Text */}
                        <div className="mb-10">
                            <h3 className="flex items-center gap-2 text-antique-white font-serif text-lg mb-4">
                                <span className="text-primary">✦</span> 상세 풀이
                            </h3>
                            <div className="max-w-none">
                                {renderFormattedText(analysis.advice)}
                            </div>
                        </div>

                        {/* Premium Form (Only show if not loading premium) */}
                        {!isPremiumLoading && (
                            <div ref={premiumFormRef} className="my-8 relative group">
                                {premiumAdvice ? (
                                    <button 
                                        onClick={() => setStep(Step.PREMIUM_RESULT)}
                                        className="w-full bg-purple-900/40 border border-purple-500/50 hover:bg-purple-900/60 text-purple-200 font-bold py-6 rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.2)] transition-all flex flex-col items-center justify-center gap-2 group"
                                    >
                                        <span className="material-symbols-outlined text-4xl mb-1 text-purple-400 group-hover:scale-110 transition-transform">psychology_alt</span>
                                        <span className="text-xl font-serif">심층 분석 결과 다시 보기</span>
                                        <span className="text-xs text-purple-400/70 font-normal">AI가 분석한 심층 리포트를 확인하세요</span>
                                    </button>
                                ) : (
                                    <div className="relative bg-surface-dark border border-purple-500/30 rounded-xl p-6 shadow-2xl">
                                        <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 rounded-2xl blur opacity-25 pointer-events-none"></div>
                                        <div className="relative z-10">
                                            <div className="flex flex-col items-center mb-6">
                                                <span className="bg-purple-500/10 text-purple-300 text-xs font-bold px-3 py-1 rounded-full border border-purple-500/20 mb-3">PREMIUM ASK</span>
                                                <h3 className="text-xl font-serif text-white mb-2">더 깊은 조언이 필요하신가요?</h3>
                                                <p className="text-gray-400 text-sm text-center">현재 점괘를 바탕으로 더 구체적인<br/>실행 방안을 찾아드립니다.</p>
                                            </div>
                                            
                                            <div className="space-y-4 mb-6">
                                                <div className="space-y-1">
                                                    <label className="text-xs font-bold text-gray-500 ml-1">추가 질문 1</label>
                                                    <input 
                                                    type="text" 
                                                    value={premiumQuestions.q1}
                                                    onChange={(e) => setPremiumQuestions({...premiumQuestions, q1: e.target.value})}
                                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors placeholder-gray-600 text-sm"
                                                    placeholder="예: 구체적으로 언제쯤 실행하는 게 좋을까요?"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-bold text-gray-500 ml-1">추가 질문 2</label>
                                                    <input 
                                                    type="text" 
                                                    value={premiumQuestions.q2}
                                                    onChange={(e) => setPremiumQuestions({...premiumQuestions, q2: e.target.value})}
                                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors placeholder-gray-600 text-sm"
                                                    placeholder="예: 조심해야 할 사람은 누구인가요?"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <button 
                                                    onClick={handlePayment}
                                                    className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg flex flex-col items-center justify-center gap-0.5 transition-all transform active:scale-[0.98]"
                                                >
                                                    <span className="text-base">커피 한잔 (3000원) 후원하기</span>
                                                    <span className="text-[10px] opacity-70 font-normal">심층 분석 결과가 즉시 제공됩니다</span>
                                                </button>
                                                
                                                <button 
                                                    onClick={handleDebugAnalysis}
                                                    className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-sm py-3 rounded-xl flex items-center justify-center gap-2 transition-colors font-medium"
                                                >
                                                    <span>🎁 기간한정 무료 체험</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Premium Loading State */}
                        {isPremiumLoading && (
                            <div ref={premiumFormRef} className="my-8 bg-surface-dark/50 border border-purple-500/30 rounded-xl p-12 shadow-2xl animate-fade-in flex flex-col items-center justify-center text-center">
                                <div className="relative mb-6">
                                    <div className="w-16 h-16 border-4 border-purple-500/30 rounded-full"></div>
                                    <div className="absolute top-0 left-0 w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl">🔮</span>
                                </div>
                                <h3 className="text-xl font-serif text-white mb-2">운명의 맥락을 짚는 중...</h3>
                                <p className="text-gray-400 text-sm">잠시만 기다려주세요.<br/>AI가 당신의 질문을 깊이 있게 고민하고 있습니다.</p>
                            </div>
                        )}

                        <div className="mt-8 flex flex-col gap-4">
                            <button 
                                onClick={handleSendEmail}
                                className="w-full bg-surface-dark border border-white/10 hover:bg-white/5 text-antique-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-[20px]">mail</span>
                                <span>결과 메일로 보내기</span>
                            </button>
                            
                            <button 
                                onClick={clearDataAndReset}
                                className="text-sm text-gray-500 hover:text-primary transition-colors py-4 flex items-center justify-center gap-1"
                            >
                                <span className="material-symbols-outlined text-[16px]">refresh</span>
                                <span>처음으로 돌아가기</span>
                            </button>
                        </div>
                    </div>
                  </div>
                </div>
                )}
                
                {/* Step 6: Premium Result Dedicated Page (NEW) */}
                {step === Step.PREMIUM_RESULT && analysis && premiumAdvice && (
                <div className="min-h-screen w-full bg-oriental-pattern flex justify-center">
                  <div className="w-full max-w-lg flex flex-col relative bg-transparent shadow-2xl min-h-screen">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-dark/80 to-background-dark pointer-events-none z-0"></div>

                    {/* Header */}
                    <header className="relative z-10 flex items-center p-4 pt-6 justify-between">
                        <button onClick={() => setStep(Step.ADVICE)} className="text-white/60 hover:text-purple-400 transition-colors flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/5">
                            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                        </button>
                        
                        <span className="text-lg font-serif text-purple-200 opacity-90">심층 분석 결과</span>
                        
                        <div className="size-10"></div>
                    </header>
                    
                    <div className="relative z-10 px-5 pb-24 flex-1 overflow-y-auto">
                        
                        {/* Main Title Section */}
                        <div className="mt-4 mb-8 text-center">
                            <div className="inline-flex items-center justify-center p-3 bg-purple-500/10 rounded-full mb-4 ring-1 ring-purple-500/30">
                                <span className="material-symbols-outlined text-4xl text-purple-400">psychology_alt</span>
                            </div>
                            <h1 className="text-3xl font-serif text-purple-100 leading-tight mb-2">
                                {userContext.name}님의<br/>심층 질문에 대한 답변
                            </h1>
                            <p className="text-purple-300/60 text-sm">AI가 당신의 질문을 깊이 있게 분석했습니다.</p>
                        </div>

                        {/* Questions Review Card */}
                        <div className="bg-surface-dark/60 backdrop-blur-md rounded-xl border border-purple-500/20 p-6 mb-8 shadow-lg relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                <span className="material-symbols-outlined text-8xl text-purple-500">format_quote</span>
                            </div>
                            <div className="relative z-10 space-y-6">
                                <div className="border-l-2 border-purple-500/50 pl-4">
                                    <span className="block text-purple-400 text-xs font-bold mb-1 tracking-wider uppercase">질문 1</span>
                                    <p className="text-gray-200 font-medium leading-snug">{premiumQuestions.q1}</p>
                                </div>
                                <div className="border-l-2 border-purple-500/50 pl-4">
                                    <span className="block text-purple-400 text-xs font-bold mb-1 tracking-wider uppercase">질문 2</span>
                                    <p className="text-gray-200 font-medium leading-snug">{premiumQuestions.q2}</p>
                                </div>
                            </div>
                        </div>

                        {/* Premium Advice Content */}
                        <div className="mb-10 animate-fade-in-up">
                            <div className="prose prose-invert max-w-none text-purple-50/90">
                                {renderFormattedText(premiumAdvice, true)}
                            </div>
                        </div>

                        <div className="mt-8 flex flex-col gap-4">
                            <button 
                                onClick={handleSendEmail}
                                className="w-full bg-purple-900/40 border border-purple-500/30 hover:bg-purple-900/60 text-purple-200 font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-[20px]">mail</span>
                                <span>전체 결과 메일로 보내기</span>
                            </button>
                            
                            <button 
                                onClick={clearDataAndReset}
                                className="text-sm text-gray-500 hover:text-purple-400 transition-colors py-4 flex items-center justify-center gap-1"
                            >
                                <span className="material-symbols-outlined text-[16px]">home</span>
                                <span>처음으로 돌아가기</span>
                            </button>
                        </div>
                    </div>
                  </div>
                </div>
                )}
            </div>
          )}

      </div>
    </div>
  );
};

export default App;