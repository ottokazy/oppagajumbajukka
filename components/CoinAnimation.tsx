import React, { useEffect, useState } from 'react';

interface CoinAnimationProps {
  isTossing: boolean;
  onTossComplete: () => void;
  result?: [number, number, number]; // 2 (tail) or 3 (head)
}

const Coin: React.FC<{ value: number | null; delay: string; animating: boolean }> = ({ value, delay, animating }) => {
  // Representation: 3 (Head - Yang - Plain side usually in divination coins context) / 2 (Tail - Yin - Character side)
  // Traditional coins: Inscribed side is Yin (2), Plain side is Yang (3).
  
  return (
    <div className={`relative w-24 h-24 ${animating ? 'animate-coin-flip' : ''}`} style={{ animationDelay: delay }}>
      <div className={`absolute inset-0 rounded-full border-4 border-yellow-600 bg-yellow-500 shadow-lg flex items-center justify-center text-yellow-900 transition-transform duration-500 ${!animating && value ? 'rotate-0' : ''}`}>
        {/* Inner Square Hole */}
        <div className="w-8 h-8 border-2 border-yellow-700 bg-transparent flex items-center justify-center">
            {/* Visual difference based on result after animation */}
            {!animating && value === 2 && <span className="text-xs font-bold serif">陰(음)</span>}
            {!animating && value === 3 && <span className="text-xs font-bold serif">陽(양)</span>}
        </div>
        {/* Decorative Circles */}
        <div className="absolute inset-1 rounded-full border border-yellow-700 opacity-50"></div>
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
      }, 1600); // slightly longer than animation to ensure settling
      return () => clearTimeout(timer);
    }
  }, [isTossing, onTossComplete]);

  return (
    <div className="flex justify-center gap-4 my-8 perspective-500">
      <Coin value={result ? result[0] : null} delay="0s" animating={internalAnimating} />
      <Coin value={result ? result[1] : null} delay="0.1s" animating={internalAnimating} />
      <Coin value={result ? result[2] : null} delay="0.2s" animating={internalAnimating} />
    </div>
  );
};
