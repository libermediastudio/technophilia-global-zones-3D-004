
import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { CelestialBodyConfig } from '../../types/index.ts';
import { useWindowSize } from '../../hooks/useWindowSize.ts';
import { Crosshair } from 'lucide-react';

export interface SolarSystemMapHandle {
  setZoom: (value: number) => void;
}

interface SolarSystemMapProps {
  bodies: CelestialBodyConfig[];
  currentBodyId: string;
  onSelect: (id: string) => void;
  onHoverChange?: (isHovering: boolean) => void;
  onZoomAutoChange?: (zoomPercent: number) => void;
  interactionsEnabled?: boolean;
}

const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

// Odległości przeliczone na AU (1.0 AU = 130px)
const AU = 130;
const ORBIT_CONFIG: Record<string, { distance: number; speed: number; startAngle: number; size: number; color: string; focusZoom: number }> = {
    mercury: { distance: 0.39 * AU, speed: 1.5, startAngle: 20, size: 3, color: '#A5A5A5', focusZoom: 2.5 },
    venus: { distance: 0.72 * AU, speed: 1.1, startAngle: 160, size: 5, color: '#E3BB76', focusZoom: 2.0 },
    earth: { distance: 1.00 * AU, speed: 0.8, startAngle: -45, size: 5.5, color: '#4F97E5', focusZoom: 1.8 }, 
    moon: { distance: 15, speed: 6.0, startAngle: 90, size: 1.5, color: '#DDDDDD', focusZoom: 3.5 }, 
    mars: { distance: 1.52 * AU, speed: 0.6, startAngle: 130, size: 4, color: '#E42737', focusZoom: 2.2 }, 
    // BELT: Centrum 2.67 AU (2.06 inner - 3.28 outer)
    belt: { distance: 2.67 * AU, speed: 0.2, startAngle: 220, size: 4, color: '#555', focusZoom: 1.2 }, 
    jupiter: { distance: 5.20 * AU, speed: 0.15, startAngle: -15, size: 12, color: '#C99039', focusZoom: 0.8 },
    saturn: { distance: 9.54 * AU, speed: 0.1, startAngle: 70, size: 10, color: '#EAD6B8', focusZoom: 0.7 },
    uranus: { distance: 19.2 * AU, speed: 0.06, startAngle: 280, size: 7, color: '#D1E7E7', focusZoom: 0.6 },
    neptune: { distance: 30.06 * AU, speed: 0.04, startAngle: 10, size: 7, color: '#5B5DDF', focusZoom: 0.6 },
    io: { distance: 22, speed: 4.0, startAngle: 0, size: 1.2, color: '#F8F', focusZoom: 3.2 },
    europa: { distance: 30, speed: 3.0, startAngle: 45, size: 1.2, color: '#AFA', focusZoom: 3.2 },
    ganymede: { distance: 38, speed: 2.0, startAngle: 90, size: 1.6, color: '#AAF', focusZoom: 3.0 },
    callisto: { distance: 46, speed: 1.0, startAngle: 135, size: 1.4, color: '#FFA', focusZoom: 3.0 },
};

export const SolarSystemMap = forwardRef<SolarSystemMapHandle, SolarSystemMapProps>(({ 
  bodies, currentBodyId, onSelect, onHoverChange, onZoomAutoChange, interactionsEnabled = true 
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = useWindowSize();
  
  const rotationRef = useRef({ x: 45, y: 0 });
  const zoomRef = useRef(0.6);
  const targetZoomRef = useRef(0.6);
  const cameraFocusRef = useRef({ x: 0, z: 0 });
  
  const dragRef = useRef<{ startX: number; startY: number; startRot: {x: number, y: number} } | null>(null);
  const hoveredBodyRef = useRef<string | null>(null);
  const starfieldRef = useRef<any[]>([]);
  const beltParticlesRef = useRef<any[]>([]);
  const labelPosRef = useRef<Map<string, { x: number, y: number }>>(new Map());
  const animationRef = useRef<number>(0);
  const isTrackingRef = useRef(false);

  const targetIds = ['earth', 'moon', 'mars', 'belt', 'io', 'europa', 'ganymede', 'callisto'];
  const jovianMoons = ['io', 'europa', 'ganymede', 'callisto'];

  useImperativeHandle(ref, () => ({
    setZoom: (value: number) => { 
        targetZoomRef.current = 0.1 + (value / 100) * 4.4; 
    }
  }));

  useEffect(() => {
    const stars = []; for (let i = 0; i < 600; i++) stars.push({ x: Math.random() * 2000, y: Math.random() * 1000, opacity: Math.random() });
    starfieldRef.current = stars;
    
    // Konfiguracja pasa asteroid zgodnie z wytycznymi: szerokość 1.22 AU
    const beltWidth = 1.22 * AU;
    const beltParts = []; 
    for (let i = 0; i < 1500; i++) {
        beltParts.push({ 
            angle: Math.random() * Math.PI * 2, 
            offset: (Math.random() - 0.5) * beltWidth, 
            y: (Math.random() - 0.5) * 8, // Rozpiętość pionowa
            opacity: Math.random() * 0.6 + 0.2 
        });
    }
    beltParticlesRef.current = beltParts;
  }, []);

  useEffect(() => {
    if (!currentBodyId || !ORBIT_CONFIG[currentBodyId]) return;
    isTrackingRef.current = true;
    
    const targetZ = ORBIT_CONFIG[currentBodyId].focusZoom;
    targetZoomRef.current = targetZ;

    if (onZoomAutoChange) {
        const percent = Math.round(((targetZ - 0.1) / 4.4) * 100);
        onZoomAutoChange(Math.max(0, Math.min(100, percent)));
    }
  }, [currentBodyId, onZoomAutoChange]);

  const project3D = (x: number, y: number, z: number, cx: number, cy: number, rotX: number, rotY: number, scale: number, focusX: number, focusZ: number) => {
      const rx = x - focusX;
      const rz = z - focusZ;
      const ry = y;

      const radY = (rotY * Math.PI) / 180; const cosY = Math.cos(radY); const sinY = Math.sin(radY);
      const x1 = rx * cosY - rz * sinY; const z1 = rz * cosY + rx * sinY;

      const radX = (rotX * Math.PI) / 180; const cosX = Math.cos(radX); const sinX = Math.sin(radX);
      const y2 = ry * cosX - z1 * sinX; const z2 = z1 * cosX + ry * sinX;

      const fov = 1200;
      if (z2 <= -fov + 10) return { x: 0, y: 0, scale: 0, z: z2, valid: false };
      
      const sp = (fov / (fov + z2)) * scale;
      return { x: cx + x1 * sp, y: cy + y2 * sp, scale: sp, z: z2, valid: true };
  };

  const checkCollision = (box1: any, box2: any) => {
    return (box1.x < box2.x + box2.w &&
            box1.x + box1.w > box2.x &&
            box1.y < box2.y + box2.h &&
            box1.y + box1.h > box2.y);
  };

  const render = useCallback((time: number) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr) { canvas.width = width * dpr; canvas.height = height * dpr; ctx.scale(dpr, dpr); }
    ctx.clearRect(0, 0, width, height); 
    
    ctx.fillStyle = '#121212'; ctx.fillRect(0, 0, width, height);

    const cx = width / 2; const cy = height / 2; 
    const t = time * 0.00004; 
    
    let targetWorldPos = { x: 0, z: 0 };
    
    if (currentBodyId && ORBIT_CONFIG[currentBodyId]) {
        const conf = ORBIT_CONFIG[currentBodyId];
        if (jovianMoons.includes(currentBodyId)) {
            const jConf = ORBIT_CONFIG['jupiter'];
            const jA = jConf.startAngle * (Math.PI/180) + (t * jConf.speed);
            const mIdx = jovianMoons.indexOf(currentBodyId);
            const mA = (mIdx * 45 * Math.PI/180) + (t * conf.speed) + (conf.startAngle * Math.PI/180);
            targetWorldPos.x = Math.cos(jA) * jConf.distance + Math.cos(mA) * conf.distance;
            targetWorldPos.z = Math.sin(jA) * jConf.distance + Math.sin(mA) * conf.distance;
        } else if (currentBodyId === 'moon') {
            const eConf = ORBIT_CONFIG['earth'];
            const eA = eConf.startAngle * (Math.PI/180) + (t * eConf.speed);
            const mA = (conf.startAngle * Math.PI/180) + (t * conf.speed);
            targetWorldPos.x = Math.cos(eA) * eConf.distance + Math.cos(mA) * conf.distance;
            targetWorldPos.z = Math.sin(eA) * eConf.distance + Math.sin(mA) * conf.distance;
        } else if (currentBodyId === 'sun') {
            targetWorldPos = { x: 0, z: 0 };
        } else {
            const angle = conf.startAngle * (Math.PI/180) + (t * conf.speed);
            targetWorldPos.x = Math.cos(angle) * conf.distance;
            targetWorldPos.z = Math.sin(angle) * conf.distance;
        }

        cameraFocusRef.current.x += (targetWorldPos.x - cameraFocusRef.current.x) * 0.1;
        cameraFocusRef.current.z += (targetWorldPos.z - cameraFocusRef.current.z) * 0.1;

        const zoomDiff = targetZoomRef.current - zoomRef.current;
        if (Math.abs(zoomDiff) > 0.0001) zoomRef.current += zoomDiff * 0.08;

        if (isTrackingRef.current) {
            const absAngle = Math.atan2(targetWorldPos.z, targetWorldPos.x);
            const targetRotY = - (absAngle * 180 / Math.PI) - 90;
            const currentY = rotationRef.current.y;
            const diff = ((targetRotY - currentY + 180) % 360 + 360) % 360 - 180;
            rotationRef.current.y += diff * 0.08;
            if (Math.abs(diff) < 0.1 && Math.abs(zoomDiff) < 0.01) isTrackingRef.current = false;
        }
    } else {
        cameraFocusRef.current.x *= 0.9;
        cameraFocusRef.current.z *= 0.9;
    }

    const focusX = cameraFocusRef.current.x;
    const focusZ = cameraFocusRef.current.z;

    starfieldRef.current.forEach(s => {
        const x = (s.x - rotationRef.current.y * 2) % width; ctx.fillStyle = '#333'; ctx.globalAlpha = s.opacity * 0.4; ctx.fillRect(x < 0 ? x + width : x, s.y % height, 1.5, 1.5);
    });
    ctx.globalAlpha = 1;

    // MIARKI AU
    for (let i = 1; i <= 31; i++) {
        if (i > 5 && i % 5 !== 0 && i !== 30) continue; 
        const r = AU * i; ctx.beginPath();
        let firstInBatch = true;
        for (let j = 0; j <= 200; j++) {
            const a = (j/200)*Math.PI*2; const p = project3D(Math.cos(a)*r, 0, Math.sin(a)*r, cx, cy, rotationRef.current.x, rotationRef.current.y, zoomRef.current, focusX, focusZ);
            if (!p.valid) { firstInBatch = true; continue; }
            firstInBatch ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y);
            firstInBatch = false;
        }
        ctx.strokeStyle = i % 5 === 0 ? 'rgba(228, 39, 55, 0.15)' : 'rgba(228, 39, 55, 0.06)'; ctx.lineWidth = 1; ctx.stroke();
        
        const labelA = (rotationRef.current.y * Math.PI / 180) + Math.PI / 2.2;
        const lp = project3D(Math.cos(labelA) * r, 0, Math.sin(labelA) * r, cx, cy, rotationRef.current.x, rotationRef.current.y, zoomRef.current, focusX, focusZ);
        if (lp.valid && lp.z < 2500) {
            ctx.font = `8px ${MONO_STACK}`; ctx.fillStyle = 'rgba(228, 39, 55, 0.4)'; ctx.textAlign = "center";
            ctx.fillText(`${i}.0 AU`, lp.x, lp.y + 12);
        }
    }

    const sunP = project3D(0, 0, 0, cx, cy, rotationRef.current.x, rotationRef.current.y, zoomRef.current, focusX, focusZ);
    if (sunP.valid) {
        const sGlow = ctx.createRadialGradient(sunP.x, sunP.y, 0, sunP.x, sunP.y, 45 * sunP.scale);
        sGlow.addColorStop(0, 'rgba(255, 255, 255, 0.12)'); sGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = sGlow; ctx.beginPath(); ctx.arc(sunP.x, sunP.y, 45 * sunP.scale, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(sunP.x, sunP.y, 10 * sunP.scale, 0, Math.PI * 2); ctx.fill();
    }

    const renderQueue: any[] = [];
    Object.keys(ORBIT_CONFIG).forEach(key => {
        if (['moon', ...jovianMoons].includes(key)) return;
        const conf = ORBIT_CONFIG[key]; const a = conf.startAngle * (Math.PI/180) + (t * conf.speed);
        const px = Math.cos(a) * conf.distance; const pz = Math.sin(a) * conf.distance;
        const isSel = currentBodyId === key;
        const p = project3D(px, 0, pz, cx, cy, rotationRef.current.x, rotationRef.current.y, zoomRef.current, focusX, focusZ);
        if (p.valid) renderQueue.push({ id: key, x: p.x, y: p.y, z: p.z, scale: p.scale, config: conf, isSel });
        
        if (key !== 'belt') {
            ctx.beginPath();
            let firstInBatch = true;
            for (let i=0; i<=200; i++) {
                const ap = (i/200)*Math.PI*2; const op = project3D(Math.cos(ap)*conf.distance, 0, Math.sin(ap)*conf.distance, cx, cy, rotationRef.current.x, rotationRef.current.y, zoomRef.current, focusX, focusZ);
                if (!op.valid) { firstInBatch = true; continue; }
                firstInBatch ? ctx.moveTo(op.x,op.y) : ctx.lineTo(op.x,op.y);
                firstInBatch = false;
            }
            ctx.strokeStyle = isSel ? '#E42737' : 'rgba(100, 116, 139, 0.15)'; ctx.lineWidth = isSel ? 1.5 : 1; ctx.stroke();
        } else {
            beltParticlesRef.current.forEach(bp => {
                const bProj = project3D(Math.cos(bp.angle + t*conf.speed*0.5)*(conf.distance+bp.offset), bp.y, Math.sin(bp.angle + t*conf.speed*0.5)*(conf.distance+bp.offset), cx, cy, rotationRef.current.x, rotationRef.current.y, zoomRef.current, focusX, focusZ);
                if (bProj.valid) {
                    ctx.fillStyle = isSel ? '#E42737' : 'rgba(100, 116, 139, 0.5)'; ctx.globalAlpha = bp.opacity * (isSel ? 1 : 0.4); ctx.fillRect(bProj.x, bProj.y, 1.3 * bProj.scale, 1.3 * bProj.scale);
                }
            });
            ctx.globalAlpha = 1;
        }

        if (key === 'earth') {
          const mConf = ORBIT_CONFIG['moon']; const mA = mConf.startAngle * (Math.PI/180) + (t * mConf.speed);
          const mx = px + Math.cos(mA) * mConf.distance; const mz = pz + Math.sin(mA) * mConf.distance;
          const mProj = project3D(mx, 0, mz, cx, cy, rotationRef.current.x, rotationRef.current.y, zoomRef.current, focusX, focusZ);
          if (mProj.valid) renderQueue.push({ id: 'moon', x: mProj.x, y: mProj.y, z: mProj.z, scale: mProj.scale, config: mConf, isSel: currentBodyId === 'moon' });
        }
        if (key === 'jupiter') {
          jovianMoons.forEach((mId, idx) => {
            const mConf = ORBIT_CONFIG[mId]; 
            const mA = (idx * 45 * Math.PI/180) + (t * mConf.speed) + (mConf.startAngle * Math.PI/180);
            const mx = px + Math.cos(mA) * mConf.distance; const mz = pz + Math.sin(mA) * mConf.distance;
            const mProj = project3D(mx, 0, mz, cx, cy, rotationRef.current.x, rotationRef.current.y, zoomRef.current, focusX, focusZ);
            if (mProj.valid) renderQueue.push({ id: mId, x: mProj.x, y: mProj.y, z: mProj.z, scale: mProj.scale, config: mConf, isSel: currentBodyId === mId });
          });
        }
    });

    renderQueue.sort((a, b) => b.z - a.z);
    
    // WAŻNE: Przypisanie renderQueue do hitRegions dla wykrywania kliknięć
    (canvas as any).hitRegions = renderQueue;

    const pulsePhase = (Math.sin(time / 400) + 1) / 2;
    const occupiedSpaces: any[] = [];

    renderQueue.forEach(obj => {
        const isHover = hoveredBodyRef.current === obj.id;
        const isTarget = targetIds.includes(obj.id);
        const isSelected = currentBodyId === obj.id;
        const rad = Math.max(1, obj.config.size * obj.scale);
        
        ctx.beginPath(); 
        if(obj.id==='belt') {
            ctx.save(); ctx.translate(obj.x, obj.y); ctx.rotate(Math.PI/4); ctx.rect(-rad,-rad,rad*2,rad*2); ctx.restore();
        } else {
            ctx.arc(obj.x, obj.y, rad, 0, Math.PI*2);
        }
        
        if (!isTarget) {
            ctx.fillStyle = '#334155'; ctx.fill();
            if (obj.scale > 0.4) {
                ctx.font = `9px ${MONO_STACK}`; ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; ctx.textAlign = "center";
                ctx.fillText(obj.id.toUpperCase(), obj.x, obj.y + rad + 12);
            }
        } else {
            ctx.fillStyle = (isHover || isSelected) ? '#FFF' : '#E42737'; ctx.fill();
            
            if (isSelected) {
                const bSize = rad + 12; const cLen = 6;
                ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.beginPath();
                ctx.moveTo(obj.x - bSize, obj.y - bSize + cLen); ctx.lineTo(obj.x - bSize, obj.y - bSize); ctx.lineTo(obj.x - bSize + cLen, obj.y - bSize);
                ctx.moveTo(obj.x + bSize - cLen, obj.y - bSize); ctx.lineTo(obj.x + bSize, obj.y - bSize); ctx.lineTo(obj.x + bSize, obj.y - bSize + cLen);
                ctx.moveTo(obj.x - bSize, obj.y + bSize - cLen); ctx.lineTo(obj.x - bSize, obj.y + bSize); ctx.lineTo(obj.x - bSize + cLen, obj.y + bSize);
                ctx.moveTo(obj.x + bSize - cLen, obj.y + bSize); ctx.lineTo(obj.x + bSize, obj.y + bSize); ctx.lineTo(obj.x + bSize, obj.y + bSize - cLen);
                ctx.stroke();

                ctx.globalAlpha = 0.5 * (1 - pulsePhase);
                ctx.strokeRect(obj.x - bSize - pulsePhase*8, obj.y - bSize - pulsePhase*8, (bSize+pulsePhase*8)*2, (bSize+pulsePhase*8)*2);
                ctx.globalAlpha = 1;

                ctx.font = `bold 8px ${MONO_STACK}`; ctx.fillStyle = '#FFFFFF'; ctx.textAlign = "center";
                ctx.fillText("TARGET LOCKED", obj.x, obj.y - bSize - 12);
                
                if (sunP.valid) {
                    ctx.beginPath(); ctx.setLineDash([2, 2]); ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.moveTo(obj.x, obj.y); ctx.lineTo(sunP.x, sunP.y); ctx.stroke(); ctx.setLineDash([]);
                }
            } else {
                ctx.beginPath(); ctx.arc(obj.x, obj.y, rad + 2 + pulsePhase * 10, 0, Math.PI * 2);
                ctx.strokeStyle = '#E42737'; ctx.globalAlpha = 0.4 * (1 - pulsePhase); ctx.stroke(); ctx.globalAlpha = 1;
            }
            occupiedSpaces.push({ x: obj.x - rad - 15, y: obj.y - rad - 15, w: (rad + 15)*2, h: (rad + 15)*2 });
        }
    });

    renderQueue.forEach(obj => {
        const isTarget = targetIds.includes(obj.id);
        const isHover = hoveredBodyRef.current === obj.id;
        const isSelected = currentBodyId === obj.id;
        if (!isTarget) return;

        let name = obj.id === 'earth' ? 'TERRA' : (obj.id === 'moon' ? 'LUNA' : obj.id.toUpperCase());
        ctx.font = isSelected ? `bold 12px ${MONO_STACK}` : `10px ${MONO_STACK}`;
        const textW = ctx.measureText(name).width;
        const boxW = textW + 20; const boxH = 22; const rad = Math.max(1, obj.config.size * obj.scale);

        const candidates = [
            { x: obj.x - boxW/2, y: obj.y + rad + 20, w: boxW, h: boxH },
            { x: obj.x - boxW/2, y: obj.y - rad - boxH - 20, w: boxW, h: boxH },
            { x: obj.x + rad + 20, y: obj.y - boxH/2, w: boxW, h: boxH },
            { x: obj.x - rad - boxW - 20, y: obj.y - boxH/2, w: boxW, h: boxH }
        ];

        let best = candidates[0];
        for (const cand of candidates) {
          let col = false; for (const s of occupiedSpaces) if (checkCollision(cand, s)) { col = true; break; }
          if (!col) { best = cand; break; }
        }
        occupiedSpaces.push(best);

        if (!labelPosRef.current.has(obj.id)) labelPosRef.current.set(obj.id, { x: best.x, y: best.y });
        const cur = labelPosRef.current.get(obj.id)!;
        cur.x += (best.x - cur.x) * 0.15; cur.y += (best.y - cur.y) * 0.15;

        ctx.strokeStyle = (isHover || isSelected) ? '#FFF' : 'rgba(228, 39, 55, 0.4)';
        ctx.beginPath(); ctx.moveTo(obj.x, obj.y); ctx.lineTo(cur.x + boxW/2, cur.y + boxH/2); ctx.stroke();

        ctx.fillStyle = (isHover || isSelected) ? '#E42737' : 'rgba(10,10,10,0.95)';
        ctx.beginPath(); ctx.moveTo(cur.x, cur.y); ctx.lineTo(cur.x + boxW, cur.y); ctx.lineTo(cur.x + boxW, cur.y + boxH - 4); ctx.lineTo(cur.x + boxW - 4, cur.y + boxH); ctx.lineTo(cur.x + 4, cur.y + boxH); ctx.lineTo(cur.x, cur.y + boxH - 4);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        
        ctx.fillStyle = (isHover || isSelected) ? '#000' : '#FFF'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(name, cur.x + boxW/2, cur.y + boxH/2);
    });

  }, [width, height, currentBodyId, targetIds, jovianMoons]);

  useEffect(() => {
    const loop = (time: number) => { render(time); animationRef.current = requestAnimationFrame(loop); };
    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current);
  }, [render]);

  const handleStart = (clientX: number, clientY: number) => {
    if (!interactionsEnabled) return;
    isTrackingRef.current = false;
    dragRef.current = { startX: clientX, startY: clientY, startRot: { ...rotationRef.current } };
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!interactionsEnabled) return;
    if (dragRef.current) {
        rotationRef.current.y = dragRef.current.startRot.y + (clientX - dragRef.current.startX) * 0.5;
        rotationRef.current.x = Math.max(10, Math.min(90, dragRef.current.startRot.x + (clientY - dragRef.current.startY) * 0.5));
    }
    if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect(); const mx = clientX - rect.left; const my = clientY - rect.top;
        const hit = (canvasRef.current as any).hitRegions || []; 
        let found = hit.find((obj: any) => Math.hypot(mx - obj.x, my - obj.y) < 20 * obj.scale)?.id || null;
        if (found && !targetIds.includes(found)) found = null;
        if (found !== hoveredBodyRef.current) { hoveredBodyRef.current = found; onHoverChange?.(!!found); }
    }
  };

  return (
    <div className={`absolute inset-0 overflow-hidden bg-[#121212] ${interactionsEnabled ? 'cursor-none touch-none pointer-events-auto' : 'cursor-default touch-auto pointer-events-none'}`}>
      <canvas ref={canvasRef} className="w-full h-full block" 
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)} 
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)} 
        onMouseUp={() => dragRef.current = null} 
        onTouchStart={(e) => { e.preventDefault(); handleStart(e.touches[0].clientX, e.touches[0].clientY); }}
        onTouchMove={(e) => { e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); }}
        onTouchEnd={() => dragRef.current = null}
        onClick={() => interactionsEnabled && hoveredBodyRef.current && onSelect(hoveredBodyRef.current)} />
        
      <div className="absolute z-50 pointer-events-none transition-all duration-500 top-6 left-6 text-left md:top-auto md:left-auto md:bottom-10 md:right-10 md:text-right">
          <div className="flex items-center gap-2 mb-1 justify-start md:justify-end">
             <div className="text-[#E42737] text-xs font-bold tracking-[0.2em]">TACTICAL MAP</div>
             <Crosshair size={14} className="text-[#E42737]" />
          </div>
          <div className="h-[1px] w-32 bg-[#E42737]/30 mb-2 mr-auto md:ml-auto md:mr-0"></div>
          <div className="text-slate-500 text-[10px] font-mono tracking-wider uppercase">SECTOR: SOL // AUTO-TRACKING</div>
          <div className="text-slate-500 text-[10px] font-mono tracking-wider">TARGET: {currentBodyId.toUpperCase()}</div>
      </div>
    </div>
  );
});
SolarSystemMap.displayName = "SolarSystemMap";
