import { useRef, useState } from 'react';

interface MobileJoystickProps {
  onMove: (x: number, y: number) => void;
  compact?: boolean;
}

export function MobileJoystick({ onMove, compact = false }: MobileJoystickProps) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const maxRadius = compact ? 34 : 42;

  const updateFromClient = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setKnobOffset({ x: dx, y: dy });
    onMove(dx / maxRadius, dy / maxRadius);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerId.current = e.pointerId;
    setIsDragging(true);
    updateFromClient(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== e.pointerId) return;
    e.stopPropagation();
    updateFromClient(e.clientX, e.clientY);
  };

  const resetStick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== e.pointerId) return;
    e.stopPropagation();
    activePointerId.current = null;
    setIsDragging(false);
    setKnobOffset({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={resetStick}
      onPointerCancel={resetStick}
      style={{ touchAction: 'none' }}
      aria-label="عصا التحكم بالحركة"
      className={`pointer-events-auto relative flex ${
        compact ? 'h-[102px] w-[102px]' : 'h-[120px] w-[120px] sm:h-[132px] sm:w-[132px]'
      } items-center justify-center rounded-full border backdrop-blur-sm transition-colors duration-150 select-none ${
        isDragging
          ? 'border-red-500/75 bg-[#0a0e18]/68 shadow-[0_0_20px_rgba(239,68,68,0.35),0_8px_22px_rgba(0,0,0,0.6)]'
          : 'border-white/15 bg-[#0a0e18]/58 shadow-[0_8px_22px_rgba(0,0,0,0.55)]'
      }`}
    >
      <svg
        viewBox="0 0 128 128"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <circle
          cx="64"
          cy="64"
          r="41"
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="1.2"
          strokeDasharray="4 4"
        />

        <g
          fill="none"
          stroke={isDragging ? 'rgba(248,113,113,0.75)' : 'rgba(255,255,255,0.34)'}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="59,15 64,10 69,15" />
          <polyline points="59,113 64,118 69,113" />
          <polyline points="15,59 10,64 15,69" />
          <polyline points="113,59 118,64 113,69" />
        </g>
      </svg>

      {/* Red Concentric Thumb Knob */}
      <div
        className={`pointer-events-none relative flex ${
          compact ? 'h-[40px] w-[40px]' : 'h-[46px] w-[46px] sm:h-[50px] sm:w-[50px]'
        } items-center justify-center rounded-full border-2 border-red-500/90 bg-[#2a0c12]/86 shadow-[0_0_16px_rgba(239,68,68,0.42),0_6px_14px_rgba(0,0,0,0.7)] ${
          !isDragging ? 'transition-transform duration-150 ease-out' : ''
        }`}
        style={{
          transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
        }}
      >
        <div
          className={`${
            compact ? 'h-4 w-4' : 'h-5 w-5'
          } rounded-full border border-red-400/85 bg-transparent`}
        />
      </div>
    </div>
  );
}
