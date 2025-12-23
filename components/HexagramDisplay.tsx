import React from 'react';
import { LineValue } from '../types';

interface HexagramDisplayProps {
  lines: LineValue[];
  animateLast: boolean;
}

// 6 = Old Yin (Changing) --x--
// 7 = Young Yang (Static) -----
// 8 = Young Yin (Static) -- --
// 9 = Old Yang (Changing) --o--

const Line: React.FC<{ value: LineValue; isNew: boolean }> = ({ value, isNew }) => {
  const isYang = value === 7 || value === 9;
  const isChanging = value === 6 || value === 9;
  const colorClass = isChanging ? "bg-red-400" : "bg-gray-200";

  return (
    <div className={`w-full h-8 flex items-center justify-center my-1 transition-all duration-700 ${isNew ? 'opacity-100 translate-y-0' : 'opacity-100'}`}>
      <div className={`relative w-64 h-full flex items-center justify-between`}>
        {/* Left Part */}
        <div className={`h-4 ${colorClass} rounded-l-sm ${isYang ? 'w-full rounded-r-sm' : 'w-[42%]'}`}></div>
        
        {/* Gap for Yin */}
        {!isYang && <div className="w-[16%]"></div>}
        
        {/* Right Part for Yin */}
        {!isYang && <div className={`h-4 ${colorClass} w-[42%] rounded-r-sm`}></div>}

        {/* Change Indicator */}
        {isChanging && (
          <div className="absolute inset-0 flex items-center justify-center">
             <span className={`text-xs font-bold ${value === 9 ? 'text-black' : 'text-white'}`}>
               {value === 9 ? 'O' : 'X'}
             </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const HexagramDisplay: React.FC<HexagramDisplayProps> = ({ lines, animateLast }) => {
  // Lines array is [bottom, ..., top]. Visual display should be Top -> Bottom.
  // We need to map them in reverse order for display.
  // However, traditionally, we build from bottom up.
  // We will create empty slots for uncast lines.
  
  const totalSlots = 6;
  const displayLines = [...lines]; 
  
  // Create an array of 6 slots, filling from bottom (index 0)
  const slots = Array.from({ length: totalSlots }).map((_, index) => {
    // Determine the line index (0 is bottom)
    const lineIndex = index;
    // Check if we have a value for this index
    const value = displayLines[lineIndex];
    return { value, index: lineIndex };
  }).reverse(); // Reverse so index 5 (top) is first in DOM

  return (
    <div className="flex flex-col items-center justify-center bg-gray-800 p-6 rounded-lg shadow-inner border border-gray-700">
      {slots.map((slot) => (
        <div key={slot.index} className="w-full flex justify-center h-10">
           {slot.value ? (
             <Line value={slot.value} isNew={animateLast && slot.index === lines.length - 1} />
           ) : (
             <div className="w-64 h-4 bg-gray-700/30 my-3 rounded opacity-30 border border-dashed border-gray-600"></div>
           )}
        </div>
      ))}
    </div>
  );
};
