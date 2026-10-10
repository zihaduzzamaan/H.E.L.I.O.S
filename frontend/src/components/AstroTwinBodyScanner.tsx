import React, { useEffect, useRef, useState, useCallback } from 'react';

export type HazardId = 'I' | 'D' | 'E' | 'R' | 'G';
export type HazardStatus = 'nominal' | 'watch' | 'act';

export interface AstroTwinBodyScannerProps {
  focusHazard?: HazardId | null;
  onFocusHazard?: (hazard: HazardId | null) => void;
  hazardStatuses?: Record<HazardId, HazardStatus>;
  heartRate?: number;
}

// 3D anatomical anchor points in body-coordinate space [x, y, z]
const ANCHORS: Record<HazardId, [number, number, number]> = {
  I: [0.0, 1.70, 0.038],        // Brain cortex (Isolation)
  E: [-0.189, 0.86, 0.021],     // Pulmonary lungs (Environment)
  R: [-0.306, 0.30, 0.19],      // Visceral abdominal core (Radiation)
  D: [0.734, 0.308, 0.008],     // Forearm biomedical telemetry node (Distance)
  G: [0.219, -1.15, -0.052],    // Musculoskeletal knee joint (Gravity)
};

const HAZARD_INDEX_MAP: Record<HazardId, number> = {
  I: 0,
  D: 1,
  E: 2,
  R: 3,
  G: 4,
};

const SPOTS: Array<{ id: HazardId; name: string; side: 'l' | 'r' }> = [
  { id: 'I', name: 'Isolation', side: 'l' },
  { id: 'E', name: 'Environment', side: 'r' },
  { id: 'R', name: 'Radiation', side: 'l' },
  { id: 'D', name: 'Distance', side: 'r' },
  { id: 'G', name: 'Gravity', side: 'r' },
];

const STATUS_VALUES: Record<HazardStatus, number> = {
  nominal: 0,
  watch: 1,
  act: 2,
};

interface ModelBufferData {
  n: number;
  pos: Float32Array;
  nrm: Float32Array;
  reg: Float32Array;
  seed: Float32Array;
  heart: [number, number, number];
}

// Module-level cached buffer to guarantee instant, 0-latency mounts
let cachedModelData: ModelBufferData | null = null;
let modelLoadingPromise: Promise<ModelBufferData | null> | null = null;

function loadModelData(): Promise<ModelBufferData | null> {
  if (cachedModelData) return Promise.resolve(cachedModelData);
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = fetch('/targets/body.bin')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((buf) => {
      const n = buf.byteLength / 13;
      if (!Number.isInteger(n) || n < 1000) return null;

      const dv = new DataView(buf);
      const pos = new Float32Array(n * 3);
      const nrm = new Float32Array(n * 3);
      const reg = new Float32Array(n);
      const seed = new Float32Array(n);

      for (let i = 0; i < n; i++) {
        for (let c = 0; c < 3; c++) {
          pos[i * 3 + c] = dv.getInt16(i * 6 + c * 2, true) / 8192;
          nrm[i * 3 + c] = dv.getInt16(n * 6 + i * 6 + c * 2, true) / 4096;
        }
        reg[i] = dv.getUint8(n * 12 + i);
        seed[i] = (i * 2654435761 % 1000) / 1000;
      }

      cachedModelData = {
        n,
        pos,
        nrm,
        reg,
        seed,
        heart: [0.071, 0.78, 0.016],
      };
      return cachedModelData;
    })
    .catch((err) => {
      console.warn('Failed to load body.bin:', err);
      return null;
    });

  return modelLoadingPromise;
}

const VS_SOURCE = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute float aReg;
attribute float aSeed;

uniform float uAng;
uniform float uTime;
uniform float uBeat;
uniform float uPR;
uniform float uK;
uniform float uYMid;
uniform float uFocus;
uniform float uS0, uS1, uS2, uS3, uS4;
uniform vec3 uHeart;

varying vec3 vC;
varying float vA;

vec3 rotY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

void main() {
  int ri = int(aReg + 0.5);
  vec3 p = aPos;
  float pump = exp(-uBeat * 8.0);
  if (ri == 2) {
    p = uHeart + (p - uHeart) * (1.0 + 0.22 * pump);
  }
  float d = aNrm.x;
  float wave = exp(-pow((uBeat * 2.4 - d) * 4.0, 2.0));
  p = rotY(p, uAng);

  float hz = -1.0;
  if (ri == 1) hz = 0.0;
  else if (ri == 7) hz = 1.0;
  else if (ri == 3) hz = 2.0;
  else if (ri == 0) hz = 3.0;
  else if (ri == 5 || (ri == 6 && aPos.y < -0.45)) hz = 4.0;

  float st = hz < -0.5 ? 0.0 : hz < 0.5 ? uS0 : hz < 1.5 ? uS1 : hz < 2.5 ? uS2 : hz < 3.5 ? uS3 : uS4;
  vec3 c = vec3(0.5, 0.86, 1.0);
  float a = 0.35;
  float sz = 1.0;

  if (ri == 1) { c = vec3(1.0, 0.55, 0.78); a = 0.65; }
  else if (ri == 2) { c = vec3(1.0, 0.15, 0.25); a = 0.85 + 1.2 * pump; sz = 1.35; }
  else if (ri == 3) { c = vec3(0.55, 0.85, 1.0); a = 0.35; }
  else if (ri == 4) { c = vec3(0.6, 0.75, 0.9); a = 0.18; }
  else if (ri == 6) { c = vec3(0.9, 0.95, 1.0); a = 0.65; }
  else if (ri == 8) { c = mix(vec3(0.95, 0.2, 0.28), vec3(1.0, 0.55, 0.55), wave); a = 0.65 + 1.8 * wave; sz = 1.0 + 0.6 * wave; }
  else if (ri == 9) { c = vec3(0.45, 0.85, 1.0); a = 0.3; }

  if (ri == 0 || ri == 5 || ri == 7) {
    vec3 n = rotY(aNrm, uAng);
    float rim = 1.0 - abs(n.z);
    a = 0.07 + 0.55 * pow(rim, 2.0);
  }

  if (st > 0.5) {
    vec3 sc = st > 1.5 ? vec3(1.0, 0.35, 0.43) : vec3(1.0, 0.77, 0.24);
    c = mix(c, sc, ri == 0 ? 0.65 : 0.9);
    a *= (ri == 0 ? 1.4 : 1.9) * (0.85 + 0.15 * sin(uTime * 3.2));
  }

  if (hz > -0.5 && abs(hz - uFocus) < 0.5) {
    a *= 2.6;
    sz *= 1.45;
    c = mix(c, vec3(0.35, 1.0, 0.85), 0.75);
  }

  a *= 0.65 + 0.35 * aSeed;
  vC = c;
  vA = a;

  vec2 box = vec2(150.0 + p.x * uK, uYMid - p.y * uK);
  gl_Position = vec4(box.x / 150.0 - 1.0, 1.0 - box.y / 330.0, 0.0, 1.0);
  gl_PointSize = (1.1 + aSeed * 1.1) * sz * uPR;
}
`;

const FS_SOURCE = `
precision mediump float;
varying vec3 vC;
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  float a = exp(-r * 4.0) * vA;
  gl_FragColor = vec4(vC * a, a);
}
`;

export const AstroTwinBodyScanner: React.FC<AstroTwinBodyScannerProps> = ({
  focusHazard = null,
  onFocusHazard,
  hazardStatuses = { I: 'nominal', D: 'nominal', E: 'nominal', R: 'nominal', G: 'nominal' },
  heartRate = 60,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const spotRefs = useRef<Record<string, SVGGElement | null>>({});

  const [isReady, setIsReady] = useState<boolean>(!!cachedModelData);

  // Rotation and dragging state
  const rotationRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const lastAngleRef = useRef<number>(0);

  // Uniform parameters
  const uK = 147.0;
  const uYMid = 315.3;

  // Track statuses and focus in refs to eliminate re-binding during render loop
  const stateRef = useRef({
    hazardStatuses,
    focusHazard,
    heartRate,
  });
  useEffect(() => {
    stateRef.current = { hazardStatuses, focusHazard, heartRate };
  }, [hazardStatuses, focusHazard, heartRate]);

  // Load binary model data
  useEffect(() => {
    let active = true;
    loadModelData().then((data) => {
      if (active && data) {
        setIsReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // WebGL Lifecycle & Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cachedModelData) return;

    const model = cachedModelData;
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
    });
    if (!gl) return;

    const compileShader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };

    const vs = compileShader(gl.VERTEX_SHADER, VS_SOURCE);
    const fs = compileShader(gl.FRAGMENT_SHADER, FS_SOURCE);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // Attributes
    const createAttrBuffer = (name: string, data: Float32Array, size: number) => {
      const loc = gl.getAttribLocation(program, name);
      if (loc < 0) return;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };

    createAttrBuffer('aPos', model.pos, 3);
    createAttrBuffer('aNrm', model.nrm, 3);
    createAttrBuffer('aReg', model.reg, 1);
    createAttrBuffer('aSeed', model.seed, 1);

    // Uniform locations
    const uLoc = (name: string) => gl.getUniformLocation(program, name);
    const locAng = uLoc('uAng');
    const locTime = uLoc('uTime');
    const locBeat = uLoc('uBeat');
    const locPR = uLoc('uPR');
    const locFocus = uLoc('uFocus');
    const locS0 = uLoc('uS0');
    const locS1 = uLoc('uS1');
    const locS2 = uLoc('uS2');
    const locS3 = uLoc('uS3');
    const locS4 = uLoc('uS4');

    gl.uniform1f(uLoc('uK'), uK);
    gl.uniform1f(uLoc('uYMid'), uYMid);
    gl.uniform3fv(uLoc('uHeart'), model.heart);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // Resize handling
    const resize = () => {
      const pr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || 300;
      const h = canvas.clientHeight || 660;
      canvas.width = Math.round(w * pr);
      canvas.height = Math.round(h * pr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(locPR, pr * Math.min(1.4, w / 200));
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Render loop
    let animId: number;
    const startTime = performance.now();
    let lastBeatTime = performance.now();

    const render = (now: number) => {
      const elapsedSec = (now - startTime) * 0.001;
      const { hazardStatuses: curStatuses, focusHazard: curFocus, heartRate: curHr } = stateRef.current;

      // Heartbeat cycle timing
      const beatPeriodMs = (60.0 / Math.max(30, curHr)) * 1000;
      if (now - lastBeatTime >= beatPeriodMs) {
        lastBeatTime = now;
      }
      const beatProgress = Math.min(1.0, (now - lastBeatTime) / Math.min(700, beatPeriodMs * 0.85));

      // Continuous gentle oscillation + interactive user rotation
      const idleSway = 0.22 * Math.sin(elapsedSec * 0.35);
      const currentAng = rotationRef.current + idleSway;

      // Update WebGL uniforms
      gl.uniform1f(locTime, elapsedSec);
      gl.uniform1f(locAng, currentAng);
      gl.uniform1f(locBeat, beatProgress);

      const focusIdx = curFocus ? (HAZARD_INDEX_MAP[curFocus] ?? -1) : -1;
      gl.uniform1f(locFocus, focusIdx);

      gl.uniform1f(locS0, STATUS_VALUES[curStatuses.I] || 0);
      gl.uniform1f(locS1, STATUS_VALUES[curStatuses.D] || 0);
      gl.uniform1f(locS2, STATUS_VALUES[curStatuses.E] || 0);
      gl.uniform1f(locS3, STATUS_VALUES[curStatuses.R] || 0);
      gl.uniform1f(locS4, STATUS_VALUES[curStatuses.G] || 0);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, model.n);

      // Real-time anchor projection update directly into SVG DOM
      const cosA = Math.cos(currentAng);
      const sinA = Math.sin(currentAng);

      for (const spot of SPOTS) {
        const anchor = ANCHORS[spot.id];
        // 3D rotated point
        const rotX = cosA * anchor[0] + sinA * anchor[2];
        const rotY = anchor[1];

        // 2D SVG mapped point
        const screenX = 150 + rotX * uK;
        const screenY = uYMid - rotY * uK;

        const group = spotRefs.current[spot.id];
        if (group) {
          const line = group.querySelector('line');
          const circles = group.querySelectorAll('circle');

          if (line) {
            line.setAttribute('x1', screenX.toFixed(1));
            line.setAttribute('y1', screenY.toFixed(1));
            line.setAttribute('x2', spot.side === 'l' ? '-14' : '314');
            line.setAttribute('y2', screenY.toFixed(1));
          }
          circles.forEach((c) => {
            c.setAttribute('cx', screenX.toFixed(1));
            c.setAttribute('cy', screenY.toFixed(1));
          });
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [isReady]);

  // Pointer Dragging Handlers for 360° Rotation
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    lastAngleRef.current = rotationRef.current;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - startXRef.current;
    rotationRef.current = lastAngleRef.current + dx * 0.007;
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  return (
    <div
      ref={containerRef}
      className="twin"
      role="group"
      aria-label="Health twin 3D anatomical viewer"
      style={{
        display: 'grid',
        placeItems: 'center',
        width: '100%',
        height: '100%',
        position: 'relative',
        userSelect: 'none',
        touchAction: 'none',
        cursor: 'grab',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className={`twin-fig is-3d ${focusHazard ? 'has-focus' : ''}`}>
        {/* WebGL Canvas */}
        <canvas
          ref={canvasRef}
          className="twin-canvas"
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />

        {/* Dynamic SVG Leader Lines & Anchors tracking 3D points in real time */}
        <svg
          viewBox="0 0 300 660"
          aria-hidden="true"
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
            overflow: 'visible',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {/* Luminous Floor Pedestal Ring under the Astronaut's feet */}
          <ellipse cx="150" cy="596" rx="46" ry="9" className="floor-ring" />

          {/* 5 RIDGE Anatomical Target Anchors */}
          {SPOTS.map((spot) => {
            const status = hazardStatuses[spot.id] || 'nominal';
            const isLinked = focusHazard === spot.id;

            return (
              <g
                key={spot.id}
                ref={(el) => {
                  spotRefs.current[spot.id] = el;
                }}
                className={`twin-spot st-${status} ${isLinked ? 'is-linked' : ''}`}
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onMouseEnter={() => onFocusHazard?.(spot.id)}
                onMouseLeave={() => onFocusHazard?.(null)}
              >
                <line
                  x1="150"
                  y1={spot.id === 'I' ? '65.4' : spot.id === 'E' ? '188.9' : spot.id === 'R' ? '271.2' : spot.id === 'D' ? '270.0' : '484.4'}
                  x2={spot.side === 'l' ? '-14' : '314'}
                  y2={spot.id === 'I' ? '65.4' : spot.id === 'E' ? '188.9' : spot.id === 'R' ? '271.2' : spot.id === 'D' ? '270.0' : '484.4'}
                  className="twin-leader"
                />
                <circle
                  cx="150"
                  cy={spot.id === 'I' ? '65.4' : spot.id === 'E' ? '188.9' : spot.id === 'R' ? '271.2' : spot.id === 'D' ? '270.0' : '484.4'}
                  r="13"
                  className="twin-halo"
                />
                <circle
                  cx="150"
                  cy={spot.id === 'I' ? '65.4' : spot.id === 'E' ? '188.9' : spot.id === 'R' ? '271.2' : spot.id === 'D' ? '270.0' : '484.4'}
                  r="5"
                  className="twin-dot"
                  data-spot={spot.id}
                />
              </g>
            );
          })}
        </svg>

        {/* 5 Interactive HUD Chips anchored to respective lateral sides */}
        {/* CHIP 1: Isolation (Top Left) */}
        <a
          href="#hz-I"
          className={`twin-chip l st-${hazardStatuses.I} ${focusHazard === 'I' ? 'is-linked' : ''}`}
          style={{ top: '9.909%' }}
          onMouseEnter={() => onFocusHazard?.('I')}
          onMouseLeave={() => onFocusHazard?.(null)}
        >
          <span className={`hz st-${hazardStatuses.I}`} title="RIDGE I">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 18V5" /><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" /><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" /><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" /><path d="M18 18a4 4 0 0 0 2-7.464" /><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" /><path d="M6 18a4 4 0 0 1-2-7.464" /><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
            </svg>
          </span>
          <span className="twin-chip-text">
            <b>Isolation</b>
            <span className={`badge st-${hazardStatuses.I}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="m16 9-5.5 5.5L8 12" />
              </svg>
              {hazardStatuses.I.toUpperCase()}
            </span>
          </span>
        </a>

        {/* CHIP 2: Radiation (Mid Left) */}
        <a
          href="#hz-R"
          className={`twin-chip l st-${hazardStatuses.R} ${focusHazard === 'R' ? 'is-linked' : ''}`}
          style={{ top: '41.091%' }}
          onMouseEnter={() => onFocusHazard?.('R')}
          onMouseLeave={() => onFocusHazard?.(null)}
        >
          <span className={`hz st-${hazardStatuses.R}`} title="RIDGE R">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 12h.01" /><path d="M14 15.4641a4 4 0 0 1-4 0L7.52786 19.74597 A 1 1 0 0 0 7.99303 21.16211 10 10 0 0 0 16.00697 21.16211 1 1 0 0 0 16.47214 19.74597z" /><path d="M16 12a4 4 0 0 0-2-3.464l2.472-4.282a1 1 0 0 1 1.46-.305 10 10 0 0 1 4.006 6.94A1 1 0 0 1 21 12z" /><path d="M8 12a4 4 0 0 1 2-3.464L7.528 4.254a1 1 0 0 0-1.46-.305 10 10 0 0 0-4.006 6.94A1 1 0 0 0 3 12z" />
            </svg>
          </span>
          <span className="twin-chip-text">
            <b>Radiation</b>
            <span className={`badge st-${hazardStatuses.R}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="m16 9-5.5 5.5L8 12" />
              </svg>
              {hazardStatuses.R.toUpperCase()}
            </span>
          </span>
        </a>

        {/* CHIP 3: Environment (Top Right) */}
        <a
          href="#hz-E"
          className={`twin-chip r st-${hazardStatuses.E} ${focusHazard === 'E' ? 'is-linked' : ''}`}
          style={{ top: '28.618%' }}
          onMouseEnter={() => onFocusHazard?.('E')}
          onMouseLeave={() => onFocusHazard?.(null)}
        >
          <span className={`hz st-${hazardStatuses.E}`} title="RIDGE E">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.8 19.6A2 2 0 1 0 14 16H2" /><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" /><path d="M9.8 4.4A2 2 0 1 1 11 8H2" />
            </svg>
          </span>
          <span className="twin-chip-text">
            <b>Environment</b>
            <span className={`badge st-${hazardStatuses.E}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="m16 9-5.5 5.5L8 12" />
              </svg>
              {hazardStatuses.E.toUpperCase()}
            </span>
          </span>
        </a>

        {/* CHIP 4: Distance (Mid Right) */}
        <a
          href="#hz-D"
          className={`twin-chip r st-${hazardStatuses.D} ${focusHazard === 'D' ? 'is-linked' : ''}`}
          style={{ top: '40.913%' }}
          onMouseEnter={() => onFocusHazard?.('D')}
          onMouseLeave={() => onFocusHazard?.(null)}
        >
          <span className={`hz st-${hazardStatuses.D}`} title="RIDGE D">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m13.5 6.5-3.148-3.148a1.205 1.205 0 0 0-1.704 0L6.352 5.648a1.205 1.205 0 0 0 0 1.704L9.5 10.5" /><path d="M16.5 7.5 19 5" /><path d="m17.5 10.5 3.148 3.148a1.205 1.205 0 0 1 0 1.704l-2.296 2.296a1.205 1.205 0 0 1-1.704 0L13.5 14.5" /><path d="M9 21a6 6 0 0 0-6-6" /><path d="M9.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l4.296-4.296a1.205 1.205 0 0 0 0-1.704l-2.296-2.296a1.205 1.205 0 0 0 1.704 0z" />
            </svg>
          </span>
          <span className="twin-chip-text">
            <b>Distance</b>
            <span className={`badge st-${hazardStatuses.D}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="m16 9-5.5 5.5L8 12" />
              </svg>
              {hazardStatuses.D.toUpperCase()}
            </span>
          </span>
        </a>

        {/* CHIP 5: Gravity (Bottom Right) */}
        <a
          href="#hz-G"
          className={`twin-chip r st-${hazardStatuses.G} ${focusHazard === 'G' ? 'is-linked' : ''}`}
          style={{ top: '73.386%' }}
          onMouseEnter={() => onFocusHazard?.('G')}
          onMouseLeave={() => onFocusHazard?.(null)}
        >
          <span className={`hz st-${hazardStatuses.G}`} title="RIDGE G">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" /><path d="m2.5 21.5 1.4-1.4" /><path d="m20.1 3.9 1.4-1.4" /><path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" /><path d="m9.6 14.4 4.8-4.8" />
            </svg>
          </span>
          <span className="twin-chip-text">
            <b>Gravity</b>
            <span className={`badge st-${hazardStatuses.G}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="m16 9-5.5 5.5L8 12" />
              </svg>
              {hazardStatuses.G.toUpperCase()}
            </span>
          </span>
        </a>
      </div>
    </div>
  );
};
