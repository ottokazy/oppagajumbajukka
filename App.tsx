

import React, { useState, useEffect, useRef } from 'react';
import { UserContext, LineValue, AnalysisResult } from './types';
import { interpretHexagram, interpretPremiumQuestions } from './services/geminiService';
import { CoinAnimation } from './components/CoinAnimation';
import { HexagramDisplay } from './components/HexagramDisplay';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// ----------------------------------------------------------------------
// [설정] 카카오 디벨로퍼스 Javascript Key
// ※ 배포 시 실제 키로 교체해야 하며, Kakao Developers 플랫폼 설정에 도메인이 등록되어 있어야 합니다.
// ----------------------------------------------------------------------
const KAKAO_JS_KEY = 'c089c8172def97eb00c07217cae174e6'; // Placeholder key

// [설정] 공식 도메인 URL (공유하기 등에 사용)
const OFFICIAL_DOMAIN = "https://www.oppajeom.com";

enum Step {
  LANDING, // [NEW] 의식의 문 (첫 페이지)
  INPUT,   // 행동만 있는 입력 페이지
  DIVINATION,
  ANALYZING,
  RESULT, // Shows traditional meaning
  ADVICE,  // Shows personalized advice
  PREMIUM_RESULT // Dedicated page for premium detailed analysis
}

// v4로 변경하여 데이터 구조 변경 반영 (강제 초기화)
const STORAGE_KEY = 'juyeok_user_data_v4';

const App: React.FC = () => {
  const [step, setStep] = useState<Step>(Step.LANDING);
  const [userContext, setUserContext] = useState<UserContext>({ name: '', question: '', situation: '' });
  const [lines, setLines] = useState<LineValue[]>([]);
  const [isTossing, setIsTossing] = useState(false);
  const [currentTossResult, setCurrentTossResult] = useState<[number, number, number] | undefined>(undefined);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  
  // In-App Browser Guide Type: 'none', 'kakaotalk' (iOS bottom-right), 'other' (iOS top-right)
  const [inAppGuideType, setInAppGuideType] = useState<'none' | 'kakaotalk' | 'other'>('none');
  
  // Progress state for Analyzing step
  const [progress, setProgress] = useState(0);
  
  // Rolling Message State for Analyzing Step
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  // 문구를 2줄로 나누어 저장
  const loadingMessages = [
    { l1: "주역은 고정된 결과가 아니라", l2: "상황과 변화에 대해 이야기합니다." },
    { l1: "천지가 열렸다가 닫치는 찰라의 순간", l2: "당신은 우주와 통하게 됩니다." },
    { l1: "주역은 길흉을 말하는 것이 아니라", l2: "길하면 계속하고 흉하면 피해가라고 알려줍니다." }
  ];

  // Premium / Payment State
  const [showPremiumForm, setShowPremiumForm] = useState(false);
  const [premiumQuestions, setPremiumQuestions] = useState({ q1: '', q2: '' });
  const [premiumAdvice, setPremiumAdvice] = useState<string | null>(null);
  const [isPremiumLoading, setIsPremiumLoading] = useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  
  // Share Preview State
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  
  const resultRef = useRef<HTMLDivElement>(null);
  const premiumFormRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const pdfTemplateRef = useRef<HTMLDivElement>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);

  const mbtiTypes = [
    "ISTJ", "ISFJ", "INFJ", "INTJ",
    "ISTP", "ISFP", "INFP", "INTP",
    "ESTP", "ESFP", "ENFP", "ENTP",
    "ESTJ", "ESFJ", "ENFJ", "ENTJ"
  ];

  // GA4 Event Tracking Helper
  const trackEvent = (eventName: string, params?: Record<string, any>) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, params);
    }
  };

  // Load Saved Data on Mount - REMOVED FOR TESTING (Refresh resets app)
  useEffect(() => {
    // 테스트 및 개발 편의를 위해 새로고침 시 저장된 데이터를 불러오지 않습니다.
    /*
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        // ... (restoration logic omitted for testing) ...
      } catch (e) {
        console.error("Failed to load saved data", e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    */
  }, []);

  // Initialize Kakao SDK
  useEffect(() => {
    if (window.Kakao && !window.Kakao.isInitialized()) {
        try {
            window.Kakao.init(KAKAO_JS_KEY);
            console.log("Kakao SDK Initialized");
        } catch (e) {
            console.error("Kakao Init Failed", e);
        }
    }
  }, []);

  // Simulate Progress Bar & Rolling Messages during Analysis
  useEffect(() => {
    if (step === Step.ANALYZING) {
      // Progress Bar Logic
      setProgress(0);
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          // 로딩 시간이 8초로 늘어났으므로 진행률 증가 속도를 더 늦춤
          if (prev >= 98) return 98;
          const isFastPhase = prev < 80;
          const increment = isFastPhase ? Math.random() * 1.0 + 0.5 : Math.random() * 0.1;
          return prev + increment;
        });
      }, 100);

      // Rolling Message Logic
      setLoadingMsgIndex(0);
      const msgInterval = setInterval(() => {
        setLoadingMsgIndex((prev) => (prev + 1) % loadingMessages.length);
      }, 5000); // 5초마다 교체 (부드러운 호흡)

      return () => {
        clearInterval(progressInterval);
        clearInterval(msgInterval);
      };
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

  // 인앱 브라우저 감지 및 처리
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isAndroid = /android/i.test(ua);
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const inAppKeywords = ['kakaotalk', 'story', 'naver', 'instagram', 'fbav', 'fban', 'line', 'daumapps'];
    const isInApp = inAppKeywords.some(keyword => ua.includes(keyword));

    if (isInApp) {
      if (isAndroid) {
        const url = window.location.href.replace(/^https?:\/\//i, '');
        const intentUrl = `intent://${url}#Intent;scheme=https;package=com.android.chrome;end`;
        window.location.href = intentUrl;
      } else if (isIOS) {
        if (ua.includes('kakaotalk')) {
             setInAppGuideType('kakaotalk'); 
        } else {
             setInAppGuideType('other'); 
        }
      }
    }
  }, []);

  const copyLink = async () => {
    trackEvent('click_copy_link', {
        event_category: 'share',
        event_label: 'in_app_guide_copy'
    });

    try {
        await navigator.clipboard.writeText(window.location.href);
        alert("링크가 복사되었습니다. 사파리 주소창에 붙여넣어주세요!");
    } catch (err) {
        const textArea = document.createElement("textarea");
        textArea.value = window.location.href;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand("copy");
            alert("링크가 복사되었습니다. 사파리 주소창에 붙여넣어주세요!");
        } catch (e) {
            alert("링크 복사에 실패했습니다.");
        }
        document.body.removeChild(textArea);
    }
  };

  // Initialize Portone
  useEffect(() => {
    if (window.IMP) {
        window.IMP.init("imp46424443"); 
    }
  }, []);

  // Scroll to top
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  // PDF Download
  const handleDownloadPDF = async () => {
    trackEvent('click_download_pdf', {
        event_category: 'engagement',
        event_label: step === Step.PREMIUM_RESULT ? 'premium_result' : 'normal_result'
    });

    if (!pdfTemplateRef.current) return;
    
    try {
      setIsPdfGenerating(true);
      const element = pdfTemplateRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgCompWidth = pdfWidth;
      const imgCompHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgCompHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgCompWidth, imgCompHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgCompHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgCompWidth, imgCompHeight);
        heightLeft -= pdfHeight;
      }
      
      const fileName = `오빠가점바주까_${userContext.name}님_심층분석보고서.pdf`;
      pdf.save(fileName);
      
    } catch (err) {
      console.error("PDF Gen Error:", err);
      alert("PDF 생성 중 오류가 발생했습니다.");
    } finally {
      setIsPdfGenerating(false);
    }
  };

  const handlePreviewCard = async () => {
    trackEvent('click_preview_card', {
      event_category: 'engagement',
      event_label: 'preview_share_card'
    });

    if (!shareCardRef.current) return;

    try {
      setIsPdfGenerating(true); 
      const canvas = await html2canvas(shareCardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#221d10',
        logging: false,
      });
      const dataUrl = canvas.toDataURL('image/png');
      setPreviewImageUrl(dataUrl);
    } catch (error) {
      console.error("Preview Generation Error:", error);
      alert("이미지 생성에 실패했습니다.");
    } finally {
      setIsPdfGenerating(false);
    }
  };

  const handleKakaoShare = async () => {
    trackEvent('click_kakao_share', {
      event_category: 'share',
      event_label: 'advice_page_share'
    });

    if (!window.Kakao || !window.Kakao.isInitialized()) {
      alert("카카오톡 공유 기능을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    if (!shareCardRef.current || !analysis) return;

    try {
      setIsPdfGenerating(true); 

      const canvas = await html2canvas(shareCardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#221d10',
        logging: false,
      });

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error("이미지 생성 실패");
      
      const file = new File([blob], 'share_card.png', { type: 'image/png' });

      const response = await window.Kakao.Share.uploadImage({
        file: [file]
      });

      const imageUrl = response.infos.original.url;

      // Use OFFICIAL_DOMAIN for sharing so it always points to production
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: `[오빠가 점바주까] ${userContext.name}님의 운명적 조언`,
          description: `${analysis.hexagram.name} - ${analysis.coreSummary[0] || '주역이 전하는 5000년의 지혜'}`,
          imageUrl: imageUrl,
          link: {
            mobileWebUrl: OFFICIAL_DOMAIN,
            webUrl: OFFICIAL_DOMAIN,
          },
        },
        buttons: [
          {
            title: '5000년의 지혜 만나러 가기',
            link: {
              mobileWebUrl: OFFICIAL_DOMAIN,
              webUrl: OFFICIAL_DOMAIN,
            },
          },
        ],
      });

    } catch (error) {
      console.error("Kakao Share Error:", error);
      alert("공유하기 중 오류가 발생했습니다. (카카오 개발자 설정에서 도메인 등록이 필요할 수 있습니다)");
    } finally {
      setIsPdfGenerating(false);
    }
  };

  const handleDebugAnalysis = async () => {
      trackEvent('click_free_premium_trial', {
          event_category: 'conversion',
          event_label: 'free_trial_premium'
      });

      if (!analysis) {
        alert("점괘 결과가 없습니다.");
        return;
      }
      if (!premiumQuestions.q1.trim() || !premiumQuestions.q2.trim()) {
        alert("추가 질문 2가지를 모두 입력해주세요.");
        return;
      }

      setIsPremiumLoading(true);
      setTimeout(() => {
          premiumFormRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      
      try {
          const advice = await interpretPremiumQuestions(userContext, analysis, premiumQuestions, lines);
          
          setPremiumAdvice(advice);
          saveToStorage(userContext, lines, analysis, premiumQuestions, advice);
          setStep(Step.PREMIUM_RESULT);
      } catch (e) {
          console.error(e);
          alert("AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
          setIsPremiumLoading(false);
      }
  };

  const handleEnterRitual = () => {
    trackEvent('enter_ritual_click', {
        event_category: 'navigation',
        event_label: 'landing_to_input'
    });
    setStep(Step.INPUT);
  };

  const handleStart = () => {
    trackEvent('question_submit_click', {
        event_category: 'engagement',
        event_label: 'input_to_divination'
    });

    if (!userContext.name || !userContext.question) {
      alert("이름과 질문을 입력해주세요.");
      return;
    }
    setStep(Step.DIVINATION);
  };

  const tossCoins = () => {
    if (lines.length >= 6) return;
    
    const nextLineCount = lines.length + 1;
    if (nextLineCount === 6) {
        trackEvent('click_analyze_hexagram', {
            event_category: 'engagement',
            event_label: 'start_analysis_from_toss'
        });
    } else {
        trackEvent('click_toss_coin', {
            event_category: 'engagement',
            event_label: `toss_number_${nextLineCount}`
        });
    }

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
    const minDelay = new Promise(resolve => setTimeout(resolve, 8000));
    const apiCall = interpretHexagram(userContext, lines);

    const [_, result] = await Promise.all([minDelay, apiCall]);

    setProgress(100); 
    
    setTimeout(() => {
        setAnalysis(result);
        saveToStorage(userContext, lines, result);
        setStep(Step.RESULT);
    }, 2000); 
  };

  const clearDataAndReset = () => {
    trackEvent('click_home_reset', {
        event_category: 'navigation',
        event_label: 'reset_app'
    });

    if (window.confirm("새로운 질문을 하시겠습니까?\n기존 점괘 내용은 사라집니다.")) {
      localStorage.removeItem(STORAGE_KEY);
      setLines([]);
      setAnalysis(null);
      setStep(Step.LANDING); // Reset to LANDING
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
    trackEvent('click_send_email', {
        event_category: 'engagement',
        event_label: step === Step.PREMIUM_RESULT ? 'premium_email' : 'normal_email'
    });

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

  const togglePremiumForm = () => {
    setShowPremiumForm(true);
    setTimeout(() => {
        premiumFormRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handlePayment = () => {
      trackEvent('click_payment_request', {
          event_category: 'ecommerce',
          event_label: 'initiate_payment'
      });
      // [GA] deep_analysis_click Event Logic (Pre-payment)
      trackEvent('deep_analysis_click', {
        event_category: 'conversion',
        event_label: 'attempt_premium'
      });

      if (!premiumQuestions.q1.trim()) {
          alert("첫 번째 추가 질문을 입력해주세요.");
          return;
      }

      if (!window.IMP) {
          alert("결제 모듈 로딩 중입니다. 잠시 후 다시 시도해주세요.");
          return;
      }

      window.IMP.request_pay({
          pg: "kakaopay.TC0ONETIME", 
          pay_method: "card",
          merchant_uid: `mid_${new Date().getTime()}`,
          name: "주역 심층 풀이 (추가 질문)",
          amount: 3000, 
          buyer_email: "",
          buyer_name: userContext.name,
          buyer_tel: "010-0000-0000",
          m_redirect_url: window.location.href, 
      }, async (rsp: any) => {
          if (rsp.success) {
              trackEvent('purchase_success', {
                  event_category: 'ecommerce',
                  event_label: 'payment_complete',
                  value: 3000,
                  currency: 'KRW'
              });
              await handleDebugAnalysis();
          } else {
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

  const renderFormattedText = (text: string, isPremium: boolean = false) => {
    if (!text) return null;
    const safeText = text.replace(/\\n/g, '\n'); 
    
    const segments = safeText.split('\n');
    const primaryColor = isPremium ? 'text-purple-300' : 'text-yellow-500';
    const borderColor = isPremium ? 'border-purple-500' : 'border-yellow-500';
    const accentColor = isPremium ? 'bg-purple-500' : 'bg-yellow-500';

    return segments.map((segment, index) => {
      const trimmed = segment.trim();
      if (!trimmed) return <div key={index} className="h-4"></div>;

      const isBracketHeader = (trimmed.startsWith('[') && trimmed.includes(']'));
      const isColonHeader = !isBracketHeader && trimmed.endsWith(':') && trimmed.length < 20;
      const isMarkdownHeader = trimmed.startsWith('#');
      
      const isHeader = isBracketHeader || isColonHeader || isMarkdownHeader;
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

      if (isHeader) {
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

      const isListItem = /^\d+\./.test(trimmed);
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
          {trimmed.replace(/\*\*/g, '')}
        </p>
      );
    });
  };

  const renderDivinationStep = () => {
    const count = lines.length;
    
    const renderHexagramSlot = (position: number) => {
       const arrayIndex = position - 1;
       const lineValue = lines[arrayIndex];
       const isConfirmed = count > arrayIndex;
       const isActive = count === arrayIndex; 
       const labelOpacity = isConfirmed || isActive ? "text-antique-white font-bold" : "text-white/50";
       const labelSize = isConfirmed || isActive ? "text-sm" : "text-xs";
       
       let content;
       if (isConfirmed) {
           const isYang = lineValue === 7 || lineValue === 9;
           const isMoving = lineValue === 6 || lineValue === 9; 
           const barColor = isMoving ? "bg-ivory-dark" : "bg-primary";
           const shadowColor = isMoving ? "" : "shadow-[0_0_8px_rgba(238,189,43,0.3)]";
           const dotIndicator = isMoving ? (
               <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-ivory-dark rounded-full"></div>
           ) : null;

           if (isYang) {
               content = (
                   <div className={`h-3.5 w-full ${barColor} rounded-sm relative ${shadowColor} animate-fade-in`}>
                       {dotIndicator}
                   </div>
               );
           } else {
               content = (
                   <div className="h-3.5 w-full flex justify-between relative animate-fade-in">
                        {dotIndicator}
                        <div className={`h-full w-[42%] ${barColor} rounded-sm ${shadowColor}`}></div>
                        <div className={`h-full w-[42%] ${barColor} rounded-sm ${shadowColor}`}></div>
                   </div>
               );
           }
       } else if (isActive) {
           content = (
               <div className="h-3.5 w-full bg-ivory-dark rounded-sm relative shadow-[0_0_12px_rgba(209,199,183,0.5)] animate-pulse">
                   <div className="absolute -left-5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-ivory-dark rounded-full"></div>
               </div>
           );
       } else {
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
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-dark/80 to-background-dark pointer-events-none z-0"></div>

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

            <main className="flex-1 flex flex-col items-center w-full px-6 pb-8 relative z-10">
                <div className="text-center mt-1 mb-4 animate-fade-in">
                    <h2 className="text-antique-white font-serif text-xl font-bold leading-tight mb-2 tracking-tight">
                        <span className="text-primary">{userContext.name}</span>님의 점괘를 짓습니다.
                    </h2>
                    <p className="text-antique-white/70 font-sans text-sm leading-none">
                        고민을 떠올리며 동전을 던져주세요.
                    </p>
                </div>

                <div className="flex-1 w-full flex flex-col justify-start items-center gap-2 relative">
                    <div className="w-full max-w-[320px] bg-surface-dark/40 border border-white/5 backdrop-blur-sm shadow-inner rounded-2xl p-4 px-8 flex flex-col justify-center animate-fade-in-up">
                        <div className="grid grid-cols-[36px_1fr] gap-x-6 gap-y-4 items-center w-full">
                            {renderHexagramSlot(6)}
                            {renderHexagramSlot(5)}
                            {renderHexagramSlot(4)}
                            {renderHexagramSlot(3)}
                            {renderHexagramSlot(2)}
                            {renderHexagramSlot(1)}
                        </div>
                    </div>

                    <CoinAnimation 
                        isTossing={isTossing} 
                        onTossComplete={handleTossComplete} 
                        result={currentTossResult}
                    />
                    
                    {/* Integrated Progress Bar & Status */}
                    <div className="w-full max-w-[280px] h-9 bg-surface-dark/80 rounded-full border border-white/10 relative overflow-hidden flex items-center justify-center shadow-inner animate-fade-in mt-2">
                        {/* Progress Fill */}
                        <div 
                            className="absolute left-0 top-0 h-full bg-primary/20 transition-all duration-500 ease-out"
                            style={{ width: `${(count / 6) * 100}%` }}
                        ></div>
                        {/* Status Text (Centered) */}
                        <div className="relative z-10 flex items-center gap-2">
                            {count < 6 ? (
                                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                            ) : (
                                <span className="material-symbols-outlined text-[16px] text-primary">verified</span>
                            )}
                            <span className="text-antique-white/90 text-sm font-medium font-sans tracking-wide">
                                {count < 6 ? `현재 ${count} / 6 효 확정` : '모든 효가 확정되었습니다'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="w-full mt-4 flex flex-col gap-4 animate-fade-in-up delay-100">
                    <button 
                        onClick={tossCoins}
                        disabled={isTossing || count >= 6}
                        className={`w-full bg-primary hover:bg-primary-dark active:scale-[0.98] transition-all text-background-dark font-serif font-bold text-lg h-14 rounded-xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(238,189,43,0.25)] ring-1 ring-white/20 group relative overflow-hidden ${
                            (isTossing || count >= 6) ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                    >
                        {isTossing ? (
                           <>
                             <span className="relative z-10">천지감응...</span>
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
    <div className={`min-h-screen ${step === Step.LANDING ? 'bg-oriental-pattern' : (step === Step.INPUT ? 'bg-background-light dark:bg-oriental-gradient' : 'bg-neutral-900')} text-gray-100 flex flex-col items-center font-sans relative`} ref={topRef}>
      
      {/* --- HIDDEN PDF TEMPLATE (IMPROVED DESIGN) --- */}
      <div 
        ref={pdfTemplateRef} 
        style={{ 
            position: 'absolute', 
            top: '-20000px', 
            left: '-20000px', 
            width: '210mm', 
            minHeight: '297mm',
            backgroundColor: '#ffffff',
            color: '#000000',
            fontFamily: 'serif',
            zIndex: -50,
            display: 'flex',
            flexDirection: 'column',
            padding: '25mm 20mm' // [MODIFIED] Increased Margins (Top/Bottom 25mm, Left/Right 20mm)
        }}
      >
        {analysis && (
            <div className="relative border-[12px] border-double border-[#221d10]/10 h-full p-6">
                {/* 1. Header Area */}
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-serif font-bold text-[#221d10] mb-3 tracking-wide">오빠가 점바주까</h1>
                    <div className="inline-block border-b-2 border-[#221d10] pb-1 px-4 mb-2">
                         <h2 className="text-xl font-serif text-gray-700 tracking-[0.2em] font-medium">심층 분석 보고서</h2>
                    </div>
                    <p className="text-xs text-gray-400 font-sans mt-2 tracking-widest uppercase">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>

                {/* 2. User Info (Styled Table) */}
                <div className="mb-8 border-t border-b border-gray-200 py-6">
                    <div className="grid grid-cols-[80px_1fr] gap-y-4 items-baseline">
                        <span className="text-sm font-bold text-gray-500 font-sans">이름</span>
                        <span className="text-lg font-bold text-[#221d10] font-serif border-b border-gray-100 pb-1 block w-full">{userContext.name}</span>
                        
                        <span className="text-sm font-bold text-gray-500 font-sans">질문</span>
                        <span className="text-base text-gray-800 font-medium leading-relaxed border-b border-gray-100 pb-1 block w-full">{userContext.question}</span>
                        
                        {userContext.situation && (
                            <>
                                <span className="text-sm font-bold text-gray-500 font-sans self-start pt-1">상황</span>
                                <span className="text-sm text-gray-600 leading-relaxed text-justify bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    {userContext.situation}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* 3. Hexagram Visuals (NEW: HexagramDisplay Added) */}
                <div className="flex justify-between items-center mb-10 bg-gray-50 rounded-xl p-8 border border-gray-200 shadow-sm print:shadow-none break-inside-avoid">
                    {/* Start Hexagram */}
                    <div className="flex flex-col items-center flex-1">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">Start Hexagram</span>
                        <div className="w-28 mb-3">
                             <HexagramDisplay lines={lines} animateLast={false} simple={true} compact={false} />
                        </div>
                        <h3 className="text-2xl font-bold font-serif text-[#221d10] mb-1">{analysis.hexagram.name}</h3>
                        <p className="text-sm text-gray-400 font-serif">{analysis.hexagram.hanja}</p>
                    </div>

                    {/* Arrow */}
                    <div className="flex flex-col items-center px-4 opacity-30">
                        <span className="text-4xl text-gray-400">➔</span>
                    </div>

                    {/* End Hexagram */}
                    <div className="flex flex-col items-center flex-1">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">Result Hexagram</span>
                        <div className="w-28 mb-3">
                             <HexagramDisplay lines={getChangedLines(lines)} animateLast={false} simple={true} compact={false} />
                        </div>
                        <h3 className="text-2xl font-bold font-serif text-[#221d10] mb-1">{analysis.changedHexagramName || '변화 없음'}</h3>
                        <p className="text-sm text-gray-400 font-serif">-</p>
                    </div>
                </div>

                {/* 4. Core Summary */}
                {analysis.coreSummary && (
                    <div className="mb-8 break-inside-avoid">
                        <h3 className="text-lg font-bold font-serif text-[#221d10] mb-4 flex items-center gap-2">
                            <span className="w-1 h-6 bg-[#221d10]"></span>
                            핵심 요약
                        </h3>
                        <div className="bg-white border border-gray-200 rounded-lg p-5">
                            <ul className="space-y-4"> {/* [MODIFIED] Increased spacing between items */}
                                {analysis.coreSummary.map((s, i) => (
                                    <li key={i} className="flex gap-4 text-sm text-gray-700 leading-relaxed text-justify items-start"> {/* [MODIFIED] items-start for correct circle alignment */}
                                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center mt-0.5"> {/* [MODIFIED] Size and margin adjust */}
                                            {i+1}
                                        </span>
                                        <span>{s}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {/* 5. Detailed Advice */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold font-serif text-[#221d10] mb-4 flex items-center gap-2">
                        <span className="w-1 h-6 bg-[#221d10]"></span>
                        상세 조언
                    </h3>
                    <div className="text-justify text-gray-800 text-sm leading-[1.8] font-serif whitespace-pre-wrap">
                        {analysis.advice}
                    </div>
                </div>

                {/* 6. Premium Content */}
                {premiumAdvice && (
                    <div className="mt-8 pt-8 border-t-2 border-dashed border-gray-300 break-inside-avoid">
                        <div className="flex items-center gap-3 mb-6 bg-purple-50 p-4 rounded-lg border border-purple-100">
                            <span className="bg-purple-700 text-white text-[10px] px-2 py-0.5 rounded font-bold tracking-wider">PREMIUM</span>
                            <h3 className="text-lg font-bold text-purple-900 font-serif">심층 분석 결과</h3>
                        </div>
                        
                        <div className="mb-6 px-4 py-3 border-l-4 border-purple-200 bg-gray-50">
                            <p className="text-sm font-bold text-gray-700 mb-2 flex gap-2">
                                <span className="text-purple-600">Q1.</span> {premiumQuestions.q1}
                            </p>
                            <p className="text-sm font-bold text-gray-700 flex gap-2">
                                <span className="text-purple-600">Q2.</span> {premiumQuestions.q2}
                            </p>
                        </div>

                        <div className="text-justify text-gray-800 text-sm leading-[1.8] font-serif whitespace-pre-wrap">
                            {premiumAdvice}
                        </div>
                    </div>
                )}

                {/* 7. [NEW] Traditional Interpretation (Gwaesa & Hyosa) - Moved to End */}
                <div className="mt-8 pt-8 border-t border-gray-200 break-before-auto">
                    <h3 className="text-lg font-bold font-serif text-[#221d10] mb-6 flex items-center gap-2">
                        <span className="w-1 h-6 bg-[#221d10]"></span>
                        고전 상세 풀이
                    </h3>

                    {/* Gwaesa */}
                    <div className="mb-6 bg-gray-50 p-6 rounded-xl">
                        <h4 className="font-bold text-[#221d10] mb-2 text-base border-b border-gray-200 pb-2">괘사 (Hexagram)</h4>
                        <p className="text-lg font-serif text-[#221d10] mb-1">{analysis.hexagram.statement_hanja}</p>
                        <p className="text-sm text-gray-500 mb-3">{analysis.hexagram.statement_translation}</p>
                        <p className="text-sm text-gray-700 leading-relaxed text-justify whitespace-pre-wrap">{analysis.hexagram.explanation}</p>
                    </div>

                    {/* Hyosa */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-[#221d10] mb-2 text-base px-2">효사 (Lines)</h4>
                        {analysis.lines.map((line) => (
                            <div key={line.position} className={`p-4 rounded-lg border ${line.isChanging ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'}`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${line.isChanging ? 'bg-[#eebd2b] text-white' : 'bg-gray-200 text-gray-600'}`}>
                                        제{line.position}효
                                    </span>
                                    {line.isChanging && <span className="text-xs text-[#eebd2b] font-bold">● 동효 (변하는 운)</span>}
                                </div>
                                <p className="text-base font-serif text-[#221d10] mb-1">{line.hanja}</p>
                                <p className="text-xs text-gray-500 mb-2">{line.translation}</p>
                                <p className="text-sm text-gray-700 leading-relaxed text-justify">{line.explanation}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-auto pt-8 border-t border-gray-100 flex justify-between items-end">
                    <div className="text-[10px] text-gray-400">
                        <p>본 결과는 오빠가 점바주까 서비스에 기반하며, 삶의 지혜를 얻는 참고 자료로 활용하세요.</p> {/* [MODIFIED] AI -> Service Name */}
                        <p className="mt-1 font-serif">www.oppajeom.com</p>
                    </div>
                    <div className="text-right">
                         <img src="https://cdn-icons-png.flaticon.com/512/2103/2103633.png" alt="logo" className="w-8 h-8 opacity-20 grayscale mb-1 ml-auto" />
                         <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">OPPA DIVINATION © 2024</p>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* --- HIDDEN SHARE CARD --- */}
      {analysis && (
          <div 
            ref={shareCardRef}
            className="fixed top-0 left-[-9999px] w-[600px] h-[900px] bg-[#221d10] border-[12px] border-[#eebd2b] flex flex-col justify-start items-center text-center font-sans z-[9999]"
          >
              <div className="absolute inset-0 bg-cover bg-center z-0" style={{ backgroundImage: 'url(https://lh3.googleusercontent.com/aida-public/AB6AXuAEZTmFWjCbyYrrRnPItK0Yfg1BK1GvhwqTmDv8AXXUGUfaP1T0yl8O2q-yyLze2x0wAsuQUI9UsRSNSA0BdsPWjhO5Q_AP5RGZh_17Kd9h24eugo_v3N1f-NHGBZhyLklqaVXQMsO_hWxc9OsiSCnjldBtCV3HF9YyhhcNVM7CVH8Z2dfmg4a6bm6C0600NaLmjxc4ZGT9UanMcDurZoqcdrza4pI4gs0OOMhpwP2rXbYzqOeG5OG_ZPvfhTpwl3fuV0f28IxaQFk)' }}></div>
              <div className="absolute inset-0 bg-black/70 z-0"></div>

              <div className="relative z-10 w-full h-full p-8 flex flex-col justify-start items-center">
                  <div className="flex flex-col items-center gap-2 mb-6">
                      <div className="text-[#eebd2b] text-lg font-bold tracking-[0.3em] uppercase border-b border-[#eebd2b]/50 pb-1">
                        오빠가 점바주까
                      </div>
                      <h1 className="text-3xl font-serif font-bold text-[#e8e6e3] mt-1 text-shadow-lg whitespace-nowrap">
                        {userContext.name}님을 위한 현실적 조언
                      </h1>
                  </div>

                  <div className="w-full bg-[#2d2719]/90 border border-[#eebd2b]/30 rounded-2xl p-6 shadow-2xl backdrop-blur-sm mb-6">
                      <div className="text-left mb-4 border-b border-white/10 pb-3">
                        <span className="text-[#eebd2b] text-[10px] font-bold tracking-wider uppercase block mb-1">Question</span>
                        <p className="text-white text-lg font-medium leading-snug line-clamp-2">{userContext.question}</p>
                      </div>
                      
                      <div className="flex justify-around items-center">
                        <div className="flex flex-col items-center">
                            <span className="text-[#eebd2b] text-xs font-bold mb-2">본괘 (Start)</span>
                            <div className="scale-75 origin-center"> 
                              <HexagramDisplay lines={lines} animateLast={false} simple={true} compact={true} />
                            </div>
                            <span className="text-white font-serif text-xl mt-2">{analysis.hexagram.name}</span>
                        </div>
                        <div className="h-20 w-px bg-white/10"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-[#eebd2b] text-xs font-bold mb-2">지괘 (End)</span>
                            <div className="scale-75 origin-center">
                              <HexagramDisplay lines={getChangedLines(lines)} animateLast={false} simple={true} compact={true} />
                            </div>
                            <span className="text-white font-serif text-xl mt-2">{analysis.changedHexagramName || '변화 없음'}</span>
                        </div>
                      </div>
                  </div>

                  <div className="w-full text-left flex-1 flex flex-col">
                      <div className="flex items-center gap-2 mb-4">
                          <span className="text-[#eebd2b] text-xl">✦</span>
                          <span className="text-[#e8e6e3] font-serif text-xl font-bold">핵심 요약</span>
                      </div>
                      <div className="flex flex-col gap-3">
                        {analysis.coreSummary.slice(0, 3).map((item, idx) => (
                            <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-4 items-start relative z-10">
                                <div className="flex-shrink-0 mt-1"> 
                                    <span className="w-6 h-6 rounded-full bg-[#eebd2b] text-[#221d10] text-sm font-bold flex items-center justify-center shadow-lg leading-none pt-[1px]">
                                        {idx + 1}
                                    </span>
                                </div>
                                <p className="text-[#e8e6e3] text-lg leading-relaxed font-medium break-keep text-left">
                                    {item}
                                </p>
                            </div>
                        ))}
                      </div>
                  </div>

                  <div className="mt-auto pt-6 flex flex-col items-center gap-1 opacity-90">
                      <p className="text-[#eebd2b] text-lg font-bold animate-pulse">나도 5000년의 지혜 만나러 가기 👉</p>
                      <p className="text-white/50 text-xs font-sans tracking-wide">www.oppajeom.com</p>
                  </div>
              </div>
          </div>
      )}

      {/* --- PREVIEW MODAL --- */}
      {previewImageUrl && (
        <div 
            className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setPreviewImageUrl(null)}
        >
            <div className="relative max-w-sm w-full max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                <div className="w-full bg-[#221d10] p-1 rounded-t-xl border-t border-x border-[#eebd2b]/30 flex justify-end">
                    <button 
                        onClick={() => setPreviewImageUrl(null)}
                        className="text-white/60 hover:text-white p-2"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="overflow-auto scrollbar-hide border-x border-b border-[#eebd2b]/30 rounded-b-xl shadow-2xl">
                    <img 
                        src={previewImageUrl} 
                        alt="Share Card Preview" 
                        className="w-full h-auto object-contain" 
                    />
                </div>
                <p className="text-white/50 text-xs mt-4 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">info</span>
                    공유하기를 누르면 이 이미지가 전송됩니다.
                </p>
            </div>
        </div>
      )}

      {/* In-App Browser Guide Overlay */}
      {inAppGuideType !== 'none' && (
         <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            {inAppGuideType === 'kakaotalk' ? (
                <div className="absolute bottom-8 right-8 animate-bounce">
                    <span className="material-symbols-outlined text-white text-6xl" style={{ transform: 'rotate(135deg)' }}>arrow_upward</span>
                </div>
            ) : (
                <div className="absolute top-4 right-4 animate-bounce">
                    <span className="material-symbols-outlined text-white text-6xl" style={{ transform: 'rotate(45deg)' }}>arrow_upward</span>
                </div>
            )}

            <div className="max-w-xs w-full">
                <h3 className="text-2xl font-bold text-primary mb-4 font-serif leading-snug">
                   오빠가 점바주까는<br/>
                   '크롬/사파리'에서<br/>
                   제일 잘 보여요!
                </h3>
                <div className="bg-white/10 rounded-xl p-6 border border-white/10 backdrop-blur-sm mb-6">
                   {inAppGuideType === 'kakaotalk' ? (
                       <p className="text-gray-200 text-sm leading-relaxed mb-4">
                           우측 하단의 <span className="material-symbols-outlined text-sm align-middle mx-1">ios_share</span>(공유) 버튼을 누르고<br/>
                           <span className="font-bold text-primary">[Safari로 열기]</span>를<br/>
                           선택해주세요.
                       </p>
                   ) : (
                       <p className="text-gray-200 text-sm leading-relaxed mb-4">
                           우측 상단 메뉴<span className="inline-block bg-white/20 rounded-full px-1.5 py-0 mx-1 text-[10px] align-middle tracking-widest border border-white/30">•••</span>를 누르고<br/>
                           <span className="font-bold text-primary">[다른 브라우저로 열기]</span>를<br/>
                           선택해주세요.
                       </p>
                   )}
                   
                   <div className="h-px w-full bg-white/10 my-4"></div>
                   <p className="text-gray-400 text-xs">
                       카카오톡/인스타 브라우저에서는<br/>
                       결제와 애니메이션이 멈출 수 있어요 😢
                   </p>
                </div>

                <button
                    onClick={copyLink}
                    className="w-full bg-white text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                    <span className="material-symbols-outlined">link</span>
                    링크 복사하기
                </button>
            </div>
         </div>
      )}

      {/* [NEW] Step 0: Landing (Ritual Gate) */}
      {step === Step.LANDING && (
        <div className="relative w-full max-w-md min-h-screen flex flex-col items-center justify-center bg-oriental-pattern overflow-hidden text-center">
             {/* Background Overlay */}
             <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-dark/80 to-background-dark pointer-events-none z-0"></div>
             
             {/* Cheon-Ji-In Imagery (Mystical Smoke - Dots Removed) */}
             <div className="relative z-10 mb-12 animate-fade-in">
                <div className="relative w-48 h-48 mx-auto">
                    <div className="absolute -inset-4 rounded-full bg-primary/20 blur-3xl animate-pulse"></div>
                    <img 
                        alt="Mystical Gate" 
                        className="relative w-full h-full object-cover rounded-full border border-primary/30 shadow-[0_0_30px_rgba(238,189,43,0.3)]" 
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuCs22X-IW-rTMigMOERmvN86Cx9d53_z1hrq5-h7ntl8luLP_gY4JfmwHEjE5dlcjOADOc4qM5x4MX5mn2uTX8ErZZBk5rgI9Xfnj3r_6U2cOOzZct3o6LYH9ZgboIJDgWZvni1F1UNY3a02GsIhZYmsCFwlMEqqTEfRy3cb66GYuhhFyxPI2LzTDJ4kv2_ECwMnHhJ_EXHXrABCAjgzWOKJoFEUry9DtbfNjWRn5VGuWLSJaGC2rdfItFEGRsQ7o8Mjy6JYCHQlc0"
                    />
                </div>
             </div>

             <div className="relative z-10 px-6 space-y-6 max-w-xs mx-auto animate-fade-in-up">
                 <h1 className="text-3xl font-serif font-bold text-white tracking-widest drop-shadow-lg">
                     오빠가<br/>점바주까
                 </h1>
                 <div className="w-12 h-px bg-primary/50 mx-auto"></div>
                 <p className="text-white/80 font-sans text-lg leading-relaxed font-light">
                     지금 당신의<br/>질문 하나에 집중합니다.
                 </p>
                 
                 <div className="pt-8 w-full">
                     <button 
                        onClick={handleEnterRitual}
                        className="w-full bg-primary hover:bg-primary-dark text-background-dark font-serif font-bold text-lg py-4 rounded-xl shadow-[0_0_20px_rgba(238,189,43,0.3)] transition-all transform active:scale-[0.98]"
                     >
                         질문 시작하기
                     </button>
                 </div>
             </div>
        </div>
      )}

      {/* Step 1: Input (Redesigned - Simplified & Action Oriented) */}
      {step === Step.INPUT && (
         <div className="relative w-full max-w-md min-h-screen flex flex-col bg-transparent shadow-2xl overflow-hidden">
            <div className="bg-noise"></div>
            {/* Minimal Spacer (Top Bar Removed) */}
            <div className="w-full h-6 z-10 sticky top-0 backdrop-blur-md"></div>

            <main className="flex-1 px-5 py-4 overflow-y-auto pb-32 z-10">
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">무엇이 궁금하신가요?</h2>
                </div>

                <div className="flex flex-col gap-6">
                    {/* 1. Name Input - [MODIFIED] Increased padding and text size */}
                    <div className="space-y-2 group">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            이름
                        </label>
                        <input 
                            className="w-full bg-white dark:bg-input-dark border border-gray-300 dark:border-border-gold rounded-xl px-4 py-5 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-sm text-lg" 
                            placeholder="홍길동" 
                            type="text"
                            value={userContext.name}
                            onChange={(e) => setUserContext({...userContext, name: e.target.value})}
                        />
                    </div>

                    {/* 2. Question Input (Larger) */}
                    <div className="space-y-2 group">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            묻고자 하는 질문
                        </label>
                        <input 
                            className="w-full bg-white dark:bg-input-dark border border-gray-300 dark:border-border-gold rounded-xl px-4 py-5 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-sm text-lg" 
                            placeholder="예: 이직을 해야 할까요?" 
                            type="text"
                            value={userContext.question}
                            onChange={(e) => setUserContext({...userContext, question: e.target.value})}
                        />
                    </div>

                    {/* 3. CTA Button (Placed High for Mobile Visibility) */}
                    <button 
                        onClick={handleStart}
                        className="w-full relative group overflow-hidden bg-primary hover:bg-primary-dark text-background-dark font-serif font-bold text-xl py-4 rounded-xl shadow-lg transition-all duration-300 transform active:scale-[0.98] border border-primary/20 mt-2"
                    >
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer"></div>
                        <span className="relative flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined" style={{fontSize: '28px'}}>auto_awesome</span>
                            하늘과 감응하기
                        </span>
                    </button>
                    
                    {/* Divider */}
                    <div className="relative py-4 mt-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-background-light dark:bg-[#252013] text-gray-500">선택 입력 사항 (더 정확한 풀이)</span>
                        </div>
                    </div>

                    {/* 4. Situation Input (Moved UP for Priority) */}
                    <div className="space-y-2 group">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            현재 상황
                        </label>
                        <textarea 
                            className="w-full bg-white dark:bg-input-dark border border-gray-300 dark:border-border-gold rounded-xl px-4 py-4 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none transition-all duration-300 shadow-sm leading-relaxed" 
                            placeholder="현재 겪고 있는 상황이나 고민의 배경을 적어주세요..." 
                            rows={3}
                            value={userContext.situation}
                            onChange={(e) => setUserContext({...userContext, situation: e.target.value})}
                        ></textarea>
                    </div>

                    {/* 5. MBTI Input (Moved Below Situation) */}
                    <div className="space-y-3 pb-8">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            MBTI <span className="text-xs text-gray-500 font-normal ml-1">(성향 맞춤 조언)</span>
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {mbtiTypes.map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setUserContext({...userContext, mbti: type})}
                                    className={`text-xs py-2.5 text-center rounded-lg border transition-colors ${
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
         </div>
      )}

      {/* Step 2: Divination (Ritual) */}
      {step === Step.DIVINATION && renderDivinationStep()}

      {/* Step 3: Analyzing (Full Screen Redesign) */}
      {step === Step.ANALYZING && (
        <div className="relative w-full max-w-md min-h-screen flex flex-col overflow-hidden bg-oriental-pattern">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-dark/80 to-background-dark pointer-events-none z-0"></div>
            
            <header className="relative z-10 flex items-center bg-transparent p-4 pt-6 justify-between">
                <button onClick={clearDataAndReset} className="text-white/60 hover:text-primary transition-colors flex size-12 shrink-0 items-center justify-center cursor-pointer rounded-full hover:bg-white/5">
                        <span className="material-symbols-outlined text-[24px]">arrow_back_ios_new</span>
                </button>
            </header>

            <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 gap-10 w-full max-w-md mx-auto pb-20">
                <h1 className="text-primary text-xl font-serif font-medium leading-relaxed tracking-tight drop-shadow-sm text-center animate-fade-in">
                    괘상을 읽고<br/>하늘의 뜻을 해석 중입니다...
                </h1>
                
                <div className="flex flex-col items-center w-full gap-6 animate-fade-in delay-100">
                    <div className="w-full max-w-[240px] flex flex-col gap-2">
                        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                            <div 
                                className="h-full rounded-full bg-primary shadow-[0_0_10px_#eebd2b] transition-all duration-300 ease-out" 
                                style={{ width: `${Math.round(progress)}%` }}
                            ></div>
                        </div>
                        
                        <div className="flex justify-between text-[10px] text-primary/60 font-sans uppercase tracking-widest font-medium">
                            <span>Analyzing...</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                    </div>
                    
                    <div className="h-20 flex flex-col items-center justify-center w-full space-y-1">
                        <p 
                            key={`l1-${loadingMsgIndex}`} 
                            className="text-slate-400 dark:text-white/60 font-sans text-sm md:text-base leading-relaxed text-center animate-fade-cycle"
                        >
                            {loadingMessages[loadingMsgIndex].l1}
                        </p>
                        <p 
                            key={`l2-${loadingMsgIndex}`} 
                            className="text-slate-400 dark:text-white/60 font-sans text-sm md:text-base leading-relaxed text-center animate-fade-cycle"
                        >
                            {loadingMessages[loadingMsgIndex].l2}
                        </p>
                    </div>
                </div>
            </main>
        </div>
      )}

      {/* Step 4: Result */}
      {step === Step.RESULT && analysis && (
        <div className="min-h-screen w-full bg-oriental-pattern flex justify-center">
            <div className="w-full max-w-lg flex flex-col relative bg-transparent shadow-2xl min-h-screen" ref={resultRef}>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-dark/80 to-background-dark pointer-events-none z-0"></div>
            
            <header className="relative z-10 flex items-center p-4 pt-6 justify-between">
                <button onClick={clearDataAndReset} className="text-white/60 hover:text-primary transition-colors flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/5">
                    <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                </button>
                
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
                <div className="mt-4 mb-8 flex flex-col items-center animate-fade-in-up">
                    <h2 className="text-4xl font-serif text-primary mb-6 drop-shadow-md">{analysis.hexagram.name}</h2>
                    
                    <div className="bg-surface-dark/40 backdrop-blur-md p-6 md:p-8 rounded-2xl border border-white/5 shadow-2xl w-full max-w-[320px] mx-auto transform hover:scale-[1.02] transition-transform duration-500">
                        <HexagramDisplay lines={lines} animateLast={false} simple={true} />
                    </div>
                </div>
                
                <div className="space-y-8 animate-fade-in-up delay-100">
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-px w-6 bg-primary/40"></div>
                            <h3 className="text-lg font-serif text-antique-white">괘사 (卦辭)</h3>
                            <div className="h-px flex-1 bg-primary/40"></div>
                        </div>
                        <div className="bg-surface-dark/30 backdrop-blur-sm p-6 rounded-xl border border-white/5 space-y-4">
                            <div className="text-center pb-4 border-b border-white/5">
                                <p className="text-3xl font-serif text-white/90 mb-2">{analysis.hexagram.hanja}</p>
                            </div>
                            
                            <div className="text-center px-2 py-2">
                                    <p className="text-xl font-serif text-white/90 mb-1">{analysis.hexagram.statement_hanja}</p>
                                    <p className="text-xs text-primary/70 mb-2">{analysis.hexagram.statement_translation}</p>
                            </div>
                            
                            <div className="text-gray-300 leading-loose text-justify font-sans text-sm md:text-base">
                                {analysis.hexagram.explanation.split(/\n+/).map((para, i) => (
                                    para.trim() ? <p key={i} className="mb-4 last:mb-0">{para}</p> : null
                                ))}
                            </div>
                        </div>
                    </section>

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
                                        <span className={`text-xs font-bold px-2 py-1 rounded tracking-wider ${line.isChanging ? 'bg-primary text-background-dark' : 'bg-white/10 text-gray-400'}`}>
                                            제{line.position}효 {line.isChanging ? '● 동효' : ''}
                                        </span>
                                    </div>
                                    <div className="flex gap-4 mt-3">
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

            <div className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-background-dark via-background-dark to-transparent pt-12 pb-8 px-5 z-20 pointer-events-none flex justify-center">
                <div className="w-full max-w-lg pointer-events-auto">
                    <button 
                        onClick={() => {
                            trackEvent('click_view_advice', {
                                event_category: 'conversion',
                                event_label: 'result_to_advice'
                            });
                            setStep(Step.ADVICE);
                        }}
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

      {/* Step 5: Advice */}
      {step === Step.ADVICE && analysis && (
        <div className="min-h-screen w-full bg-oriental-pattern flex justify-center">
            <div className="w-full max-w-lg flex flex-col relative bg-transparent shadow-2xl min-h-screen">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-dark/80 to-background-dark pointer-events-none z-0"></div>

            <header className="relative z-10 flex items-center p-4 pt-6 justify-between">
                <button onClick={() => setStep(Step.RESULT)} className="text-white/60 hover:text-primary transition-colors flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/5">
                    <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                </button>
                
                <div className="flex gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(238,189,43,0.6)]"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                </div>
                
                <div className="size-10"></div>
            </header>
            
            <div className="relative z-10 px-5 pb-24 flex-1 overflow-y-auto">
                
                <div className="mt-4 mb-8">
                    <h1 className="text-3xl font-serif text-primary leading-tight mb-2">
                        {userContext.name}님을 위한<br/>현실적 조언
                    </h1>
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent mt-4"></div>
                </div>

                <div className="bg-surface-dark/40 backdrop-blur-md rounded-xl border border-white/5 p-4 md:p-5 mb-8 shadow-lg">
                    <div className="border-b border-white/5 pb-4 mb-4">
                        <span className="block text-primary/60 text-xs font-bold mb-1 tracking-wider uppercase">Question</span>
                        <p className="text-gray-200 font-medium leading-snug">{userContext.question}</p>
                    </div>
                    
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center w-full">
                        <div className="flex flex-col items-center">
                            <span className="block text-primary/60 text-xs font-bold mb-2">본괘 (Start)</span>
                            <div className="scale-75 origin-center">
                                <HexagramDisplay lines={lines} animateLast={false} simple={true} compact={true} />
                            </div>
                            <p className="text-antique-white font-serif mt-2">{analysis.hexagram.name.split('(')[0].trim()}</p>
                        </div>
                        
                        <div className="h-20 w-px bg-white/10 mx-auto"></div>
                        
                        <div className="flex flex-col items-center">
                            <span className="block text-primary/60 text-xs font-bold mb-2">지괘 (End)</span>
                            <div className="scale-75 origin-center">
                                <HexagramDisplay lines={getChangedLines(lines)} animateLast={false} simple={true} compact={true} />
                            </div>
                            <p className="text-antique-white font-serif mt-2">{(analysis.changedHexagramName || '-').split('(')[0].trim()}</p>
                        </div>
                    </div>
                </div>

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

                <div className="mb-10">
                    <h3 className="flex items-center gap-2 text-antique-white font-serif text-lg mb-4">
                        <span className="text-primary">✦</span> 상세 풀이
                    </h3>
                    <div className="max-w-none">
                        {renderFormattedText(analysis.advice)}
                    </div>
                </div>

                {!isPremiumLoading && (
                    <div ref={premiumFormRef} className="my-8 relative group">
                        {premiumAdvice ? (
                            <button 
                                onClick={() => {
                                    trackEvent('click_view_premium_result', {
                                        event_category: 'navigation',
                                        event_label: 'review_premium'
                                    });
                                    setStep(Step.PREMIUM_RESULT);
                                }}
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
                    <div className="flex gap-4">
                        <button 
                            onClick={handleDownloadPDF}
                            disabled={isPdfGenerating}
                            className="flex-1 bg-white hover:bg-gray-100 text-black font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                            {isPdfGenerating ? (
                                <span className="animate-spin material-symbols-outlined text-[20px]">progress_activity</span>
                            ) : (
                                <span className="material-symbols-outlined text-[20px]">download</span>
                            )}
                            <span>PDF로 소장하기</span>
                        </button>
                        
                        <button 
                            onClick={handlePreviewCard}
                            className="flex-none w-16 bg-white/10 hover:bg-white/20 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center border border-white/10"
                            title="공유 카드 미리보기"
                        >
                            <span className="material-symbols-outlined text-[24px]">visibility</span>
                        </button>

                        <button 
                            onClick={handleKakaoShare}
                            className="flex-[2] bg-[#FEE500] hover:bg-[#FDD835] text-[#191919] font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg"
                        >
                            <span className="material-symbols-outlined text-[24px]">share</span>
                            <span>카톡 공유</span>
                        </button>
                    </div>
                    
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
      
      {/* Step 6: Premium Result (Fixed Blank Screen Issue) */}
      {step === Step.PREMIUM_RESULT && (
        <div className="min-h-screen w-full bg-oriental-pattern flex justify-center">
            <div className="w-full max-w-lg flex flex-col relative bg-transparent shadow-2xl min-h-screen">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-dark/80 to-background-dark pointer-events-none z-0"></div>

            <header className="relative z-10 flex items-center p-4 pt-6 justify-between">
                <button onClick={() => setStep(Step.ADVICE)} className="text-white/60 hover:text-primary transition-colors flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/5">
                    <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                </button>
                <span className="text-lg font-serif text-purple-300 opacity-80">심층 분석 보고서</span>
                <div className="size-10"></div>
            </header>
            
            <div className="relative z-10 px-5 pb-24 flex-1 overflow-y-auto">
                
                {premiumAdvice ? (
                    <>
                        <div className="mt-4 mb-8">
                            <div className="inline-flex items-center gap-2 bg-purple-900/30 border border-purple-500/30 px-3 py-1 rounded-full mb-4">
                                <span className="material-symbols-outlined text-purple-400 text-sm">verified</span>
                                <span className="text-purple-200 text-xs font-bold tracking-wider">PREMIUM REPORT</span>
                            </div>
                            <h1 className="text-3xl font-serif text-white leading-tight mb-2">
                                <span className="text-purple-400">{userContext.name}</span>님의<br/>질문에 대한 해답
                            </h1>
                            <div className="h-px w-full bg-gradient-to-r from-transparent via-purple-500/50 to-transparent mt-4"></div>
                        </div>

                        <div className="bg-surface-dark/40 backdrop-blur-md rounded-xl border border-purple-500/20 p-5 mb-8 shadow-lg">
                            <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-wider">Your Questions</h3>
                            <div className="space-y-4">
                                <div>
                                    <span className="text-purple-400 font-bold mr-2">Q1.</span>
                                    <span className="text-gray-200">{premiumQuestions.q1}</span>
                                </div>
                                <div>
                                    <span className="text-purple-400 font-bold mr-2">Q2.</span>
                                    <span className="text-gray-200">{premiumQuestions.q2}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mb-10">
                            <div className="max-w-none">
                                {renderFormattedText(premiumAdvice, true)}
                            </div>
                        </div>

                        <div className="mt-8 flex flex-col gap-4">
                            <div className="flex gap-4">
                                <button 
                                    onClick={handleDownloadPDF}
                                    disabled={isPdfGenerating}
                                    className="flex-1 bg-white hover:bg-gray-100 text-black font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                                >
                                    {isPdfGenerating ? (
                                        <span className="animate-spin material-symbols-outlined text-[20px]">progress_activity</span>
                                    ) : (
                                        <span className="material-symbols-outlined text-[20px]">download</span>
                                    )}
                                    <span>PDF로 소장하기</span>
                                </button>
                                <button 
                                    onClick={handleSendEmail}
                                    className="flex-1 bg-purple-900/20 border border-purple-500/30 hover:bg-purple-900/40 text-purple-100 font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-[20px]">mail</span>
                                    <span>전체 결과 메일로 소장하기</span>
                                </button>
                            </div>
                            
                            <button 
                                onClick={clearDataAndReset}
                                className="text-sm text-gray-500 hover:text-white transition-colors py-4 flex items-center justify-center gap-1"
                            >
                                <span className="material-symbols-outlined text-[16px]">home</span>
                                <span>처음으로 돌아가기</span>
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full pt-20 pb-20 text-center space-y-4">
                        <span className="material-symbols-outlined text-4xl text-gray-600">error_outline</span>
                        <div className="space-y-2">
                            <p className="text-gray-400">분석 내용을 불러올 수 없습니다.</p>
                            <p className="text-xs text-gray-600">일시적인 오류일 수 있습니다.</p>
                        </div>
                        <button 
                            onClick={() => setStep(Step.ADVICE)}
                            className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
                        >
                            이전 화면으로 돌아가기
                        </button>
                    </div>
                )}
            </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default App;
