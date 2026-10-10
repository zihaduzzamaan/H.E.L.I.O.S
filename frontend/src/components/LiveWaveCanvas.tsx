import React, { useEffect, useRef } from 'react';

export type WaveformKind = 'ecg' | 'pleth' | 'resp';

export interface LiveWaveCanvasProps {
  kind: WaveformKind;
  rate: number;
  variability?: number;
  height?: number;
  onBeat?: () => void;
  className?: string;
}

// Gaussian bell curve generator
const gaussian = (x: number, mean: number, amp: number, width: number) =>
  amp * Math.exp(-0.5 * Math.pow((x - mean) / width, 2));

// 1. Precise P-Q-R-S-T ECG wave synthesizer
const synthEcg = (p: number): number =>
  gaussian(p, 0.12, 0.12, 0.025) +   // P wave
  gaussian(p, 0.27, -0.12, 0.012) +  // Q dip
  gaussian(p, 0.30, 1.0, 0.011) +    // R spike
  gaussian(p, 0.33, -0.22, 0.012) +  // S dip
  gaussian(p, 0.55, 0.28, 0.045);    // T wave

// 2. Pulse oximeter plethysmogram (systolic peak + dicrotic notch)
const synthPleth = (p: number): number =>
  gaussian(p, 0.20, 1.0, 0.09) +
  gaussian(p, 0.45, 0.28, 0.06);

// 3. Respiration sinusoidal tidal wave
const synthResp = (p: number): number =>
  0.5 - 0.5 * Math.cos(2 * Math.PI * p);

const SYNTH_FUNCTIONS: Record<WaveformKind, (p: number) => number> = {
  ecg: synthEcg,
  pleth: synthPleth,
  resp: synthResp,
};

const RANGES: Record<WaveformKind, [number, number]> = {
  ecg: [-0.3, 1.1],
  pleth: [-0.05, 1.1],
  resp: [-0.05, 1.05],
};

class WaveformOscilloscope {
  phase = 0;
  scale = 1;
  currentRate: number;
  kind: WaveformKind;
  variability: number;
  slewPerSec: number;

  constructor(kind: WaveformKind, rate: number, variability = 0.025, slewPerSec = 14) {
    this.kind = kind;
    this.currentRate = Math.max(10, rate);
    this.variability = variability;
    this.slewPerSec = slewPerSec;
  }

  next(dt: number, targetRate: number): { value: number; beat: boolean } {
    // Slew rate limits sudden rate updates so phase never jumps or tears
    const safeTarget = Math.max(10, targetRate);
    const maxChange = this.slewPerSec * dt;
    this.currentRate += Math.max(-maxChange, Math.min(maxChange, safeTarget - this.currentRate));

    // Continuous smooth phase integration
    this.phase += (dt * this.currentRate) / 60 / this.scale;
    let isBeat = false;

    if (this.phase >= 1.0) {
      this.phase -= 1.0;
      this.scale = 1 + (Math.random() - 0.5) * 0.12 * this.variability;
      isBeat = true;
    }

    const val = SYNTH_FUNCTIONS[this.kind](this.phase);
    return { value: val, beat: isBeat };
  }
}

export const LiveWaveCanvas: React.FC<LiveWaveCanvasProps> = ({
  kind,
  rate,
  variability = 0.025,
  height = 52,
  onBeat,
  className = 'live-wave',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ rate, variability, onBeat });

  useEffect(() => {
    stateRef.current = { rate, variability, onBeat };
  }, [rate, variability, onBeat]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const osc = new WaveformOscilloscope(kind, stateRef.current.rate, variability);
    const [yMin, yMax] = RANGES[kind];

    let animId: number;
    let width = 300;
    let buffer = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      buffer[x] = osc.next(1 / 110, stateRef.current.rate).value;
    }
    let head = 0;
    let lastTime = performance.now();
    let sampleAccumulator = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const newWidth = Math.max(10, Math.floor(rect.width));
      width = newWidth;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Reallocate and pre-fill buffer with full waveform so it flows instantly
      const oldBuffer = buffer;
      buffer = new Float32Array(width);
      if (oldBuffer && oldBuffer.length > 50) {
        for (let x = 0; x < width; x++) {
          const srcIdx = Math.floor((x / width) * oldBuffer.length);
          buffer[x] = oldBuffer[srcIdx];
        }
      } else {
        for (let x = 0; x < width; x++) {
          buffer[x] = osc.next(1 / 110, stateRef.current.rate).value;
        }
      }
      head = 0;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Continuous 90 FPS Oscilloscope Loop
    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Sample at 110 Hz simulation rate
      sampleAccumulator += dt * 110;
      const count = Math.floor(sampleAccumulator);
      sampleAccumulator -= count;

      for (let i = 0; i < count; i++) {
        const res = osc.next(1 / 110, stateRef.current.rate);
        buffer[head] = res.value;
        head = (head + 1) % width;
        if (res.beat && stateRef.current.onBeat) {
          stateRef.current.onBeat();
        }
      }

      // Render Oscilloscope
      ctx.clearRect(0, 0, width, height);

      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, 'rgba(45, 212, 232, 0.0)');
      grad.addColorStop(0.3, 'rgba(45, 212, 232, 0.35)');
      grad.addColorStop(1.0, '#2dd4e8');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.9;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        const val = buffer[(head + x) % width];
        const y = height - 6 - ((val - yMin) / (yMax - yMin)) * (height - 12);
        if (x === 0) ctx.moveTo(0, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Glowing Tracer Scanner Dot at Leading Edge (right end)
      const lastVal = buffer[(head + width - 1) % width];
      const lastY = height - 6 - ((lastVal - yMin) / (yMax - yMin)) * (height - 12);

      ctx.fillStyle = '#2dd4e8';
      ctx.shadowColor = '#2dd4e8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(width - 2, lastY, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [kind, height, variability]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ height, width: '100%', display: 'block' }}
      aria-hidden="true"
    />
  );
};
