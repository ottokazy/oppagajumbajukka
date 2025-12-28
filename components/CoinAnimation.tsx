import React, { useEffect, useState } from 'react';

interface CoinAnimationProps {
  isTossing: boolean;
  onTossComplete: () => void;
  result?: [number, number, number]; // 2 (tail/Yin) or 3 (head/Yang)
}

const Coin: React.FC<{ value: number | null; delay: string; animating: boolean; className?: string }> = ({ value, delay, animating, className }) => {
  return (
    <div 
      className={`relative w-24 h-24 ${className}`} 
      style={{ perspective: '1000px' }}
    >
      <div 
        className={`w-full h-full rounded-full shadow-lg preserve-3d ${animating ? 'animate-coin-spin' : ''}`}
        style={{ animationDelay: delay }}
      >
          {/* Enhanced Coin Body */}
          <div className={`
            w-full h-full rounded-full 
            bg-[radial-gradient(circle_at_30%_30%,#ffd54f,#ffb300)]
            border-[6px]
            flex items-center justify-center 
            relative
            shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(0,0,0,0.2)]
          `}
          style={{ borderColor: '#8d5e2a' }} /* Fallback */
          >
             {/* Gradient Border Overlay for Metallic Look */}
             <div className="absolute inset-[-6px] rounded-full border-[6px] border-transparent bg-gradient-to-br from-[#8d5e2a] via-[#6d4c41] to-[#4e342e] -z-10" style={{maskImage: 'linear-gradient(#fff,#fff)', maskComposite: 'exclude'}}></div>

             {/* Inner decorative ring */}
             <div className="absolute inset-1 rounded-full border border-[#ffecb3]/40"></div>
             
             {/* Center Diamond Shape with Shadow */}
             <div className="w-11 h-11 bg-[#3e2723] rotate-45 flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] border border-[#5d4037]">
                {/* Text Value (Counter-rotated) */}
                {!animating && value && (
                    <span className="font-serif text-3xl text-white -rotate-45 font-medium mb-1 ml-1 drop-shadow-md tracking-wider">
                        {value === 3 ? '陽' : '陰'}
                    </span>
                )}
             </div>
          </div>
      </div>
    </div>
  );
};

export const CoinAnimation: React.FC<CoinAnimationProps> = ({ isTossing, onTossComplete, result }) => {
  const [internalAnimating, setInternalAnimating] = useState(false);

  useEffect(() => {
    if (isTossing) {
      setInternalAnimating(true);
      const timer = setTimeout(() => {
        setInternalAnimating(false);
        onTossComplete();
      }, 1600); 
      return () => clearTimeout(timer);
    }
  }, [isTossing, onTossComplete]);

  return (
    <div className="relative w-full h-40 flex justify-center items-center gap-4">
      {/* Position 1 */}
      <Coin 
        value={result ? result[0] : null} 
        delay="0s" 
        animating={internalAnimating} 
        className="transform translate-y-2"
      />
      
      {/* Position 2 (Slightly higher) */}
      <Coin 
        value={result ? result[1] : null} 
        delay="0.1s" 
        animating={internalAnimating} 
        className="transform -translate-y-4"
      />
      
      {/* Position 3 */}
      <Coin 
        value={result ? result[2] : null} 
        delay="0.2s" 
        animating={internalAnimating} 
        className="transform translate-y-2"
      />
    </div>
  );
};