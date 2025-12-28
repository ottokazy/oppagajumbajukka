import React from 'react';
import { LineValue } from '../types';

interface HexagramDisplayProps {
  lines: LineValue[];
  animateLast: boolean;
  simple?: boolean;
  compact?: boolean;
}

// 6 = Old Yin (Changing) --x--
// 7 = Young Yang (Static) -----
// 8 = Young Yin (Static) -- --
// 9 = Old Yang (Changing) --o--

const Line: React.FC<{ value: LineValue; isNew: boolean; compact?: boolean }> = ({ value, isNew, compact }) => {
  const isYang = value === 7 || value === 9;
  const isChanging = value === 6 || value === 9;
  
  // Color Logic:
  // Static lines -> Primary Gold (#eebd2b)
  // Changing lines -> Dark Ivory (#d1c7b7)
  const colorClass = isChanging ? "bg-[#d1c7b7]" : "bg-[#eebd2b]";
  
  const widthClass = compact ? "w-12" : "w-64";
  const heightClass = compact ? "h-1.5" : "h-3.5"; 

  return (
    <div className={`w-full flex items-center justify-center transition-all duration-700 ${isNew ? 'opacity-100 translate-y-0' : 'opacity-100'}`}>
      <div className={`relative ${widthClass} flex items-center justify-between`}>
        
        {/* Change Indicator (Symbol) - Moved clearly to LEFT */}
        {isChanging && !compact && (
          <div className="absolute -left-8 top-1/2 -translate-y-1/2 flex items-center justify-center">
             <span className="text-[10px] text-[#eebd2b] animate-pulse">●</span>
          </div>
        )}

        {/* Left Part */}
        <div className={`${heightClass} ${colorClass} rounded-sm ${isYang ? 'w-full' : 'w-[42%]'} transition-colors duration-300`}></div>
        
        {/* Gap for Yin (Hidden if Yang) */}
        {!isYang && <div className="w-[16%]"></div>}
        
        {/* Right Part for Yin (Hidden if Yang) */}
        {!isYang && <div className={`${heightClass} ${colorClass} w-[42%] rounded-sm transition-colors duration-300`}></div>}
        
        {/* Change Indicator (Dot for Compact mode) */}
        {isChanging && compact && (
            <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-1 h-1 bg-[#d1c7b7] rounded-full"></div>
        )}
      </div>
    </div>
  );
};

export const HexagramDisplay: React.FC<HexagramDisplayProps> = ({ lines, animateLast, simple, compact }) => {
  const totalSlots = 6;
  const displayLines = [...lines]; 
  
  const slots = Array.from({ length: totalSlots }).map((_, index) => {
    const lineIndex = index;
    const value = displayLines[lineIndex];
    return { value, index: lineIndex };
  }).reverse();

  // Container height for each slot
  const slotHeightClass = compact ? "h-2.5" : "h-8";

  return (
    <div className={`flex flex-col items-center justify-center ${simple ? '' : 'bg-[#2d2719]/40 p-8 rounded-2xl border border-white/5 shadow-inner'}`}>
      {slots.map((slot) => (
        <div key={slot.index} className={`w-full flex justify-center ${slotHeightClass}`}>
           {slot.value ? (
             <Line value={slot.value} isNew={animateLast && slot.index === lines.length - 1} compact={compact} />
           ) : (
             <div className={`${compact ? 'w-12 h-1.5 my-0.5' : 'w-64 h-3.5 my-2'} bg-white/5 rounded-sm`}></div>
           )}
        </div>
      ))}
    </div>
  );
};