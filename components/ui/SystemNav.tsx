
import React from 'react';
import { Sun, Orbit } from 'lucide-react';
import { CelestialBodyConfig } from '../../types/index.ts';

interface SystemNavProps {
  bodies: CelestialBodyConfig[];
  currentBodyId: string;
  viewMode: 'ORBIT' | 'SYSTEM';
  zoomLevel: number;
  onSelectBody: (id: string) => void;
  onViewModeChange: (mode: 'ORBIT' | 'SYSTEM') => void;
  onZoomChange: (value: number) => void;
}

export const SystemNav: React.FC<SystemNavProps> = ({ 
  bodies, 
  currentBodyId, 
  viewMode,
  zoomLevel,
  onSelectBody, 
  onViewModeChange,
  onZoomChange
}) => {
  const targetLinkIds = ['earth', 'moon', 'mars', 'belt', 'io', 'europa', 'ganymede', 'callisto'];
  const visibleBodies = bodies.filter(b => targetLinkIds.includes(b.id));

  return (
    <div className="fixed bottom-6 left-0 w-full z-[100] pointer-events-none flex flex-col items-center justify-center px-4 safe-bottom">
      
      {/* Zoom Slider */}
      <div className="pointer-events-auto mb-3 flex items-center gap-4 bg-[#121212]/90 backdrop-blur-md border border-[#E42737]/50 px-4 py-3 shadow-[0_0_30px_rgba(0,0,0,0.8)]">
         <span className="text-[10px] text-[#E42737] font-mono tracking-widest font-bold">ZOOM</span>
         <input 
            type="range" 
            min="0" 
            max="100" 
            value={zoomLevel} 
            onChange={(e) => onZoomChange(parseInt(e.target.value))}
            className="w-40 sm:w-60 h-[3px] bg-[#E42737]/30 appearance-none cursor-pointer focus:outline-none 
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-5 
              [&::-webkit-slider-thumb]:bg-[#E42737] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/50
              [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(228,39,55,1)]"
         />
         <span className="text-[10px] text-[#E42737] font-mono w-8 text-right font-bold">{zoomLevel}%</span>
      </div>

      <div className="pointer-events-auto bg-[#121212]/95 border border-[#E42737]/50 flex gap-1 p-1.5 max-w-full items-center shadow-[0_0_40px_rgba(0,0,0,0.7)]">
        
        <div className="flex bg-black/60 border border-[#E42737]/30 p-0.5 shrink-0">
            <button 
                onClick={() => onViewModeChange('ORBIT')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-mono tracking-widest transition-all ${viewMode === 'ORBIT' ? 'bg-[#E42737] text-black font-black' : 'text-[#E42737] hover:bg-[#E42737]/10'}`}
                title="ORBIT VIEW"
            >
                <Orbit size={16} />
                <span className="hidden sm:inline">ORBIT</span>
            </button>
            <button 
                onClick={() => onViewModeChange('SYSTEM')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-mono tracking-widest transition-all ${viewMode === 'SYSTEM' ? 'bg-[#E42737] text-black font-black' : 'text-[#E42737] hover:bg-[#E42737]/10'}`}
                title="SYSTEM MAP"
            >
                <Sun size={16} />
                <span className="hidden sm:inline">SYSTEM</span>
            </button>
        </div>

        <div className="w-[1px] h-6 bg-[#E42737]/50 mx-1 shrink-0"></div>

        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[calc(100vw-180px)] md:max-w-2xl px-1">
          {visibleBodies.map((body) => {
            const isActive = body.id === currentBodyId;
            return (
              <button
                key={body.id}
                onClick={() => onSelectBody(body.id)}
                className={`flex items-center justify-center px-4 py-2 text-[10px] md:text-xs font-mono tracking-widest transition-all whitespace-nowrap shrink-0 border border-transparent ${isActive ? 'bg-[#E42737]/20 text-[#E42737] font-black border-[#E42737]' : 'text-[#E42737] hover:bg-[#E42737]/10 hover:border-[#E42737]/40'}`}
              >
                {body.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
