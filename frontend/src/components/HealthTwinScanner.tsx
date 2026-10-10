import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

export interface HealthTwinScannerProps {
  astronautName?: string;
  astronautId?: string;
  readinessScore?: number;
  showControls?: boolean;
  hideHeader?: boolean;
  hideBottomCard?: boolean;
  height?: string | number;
  transparentBg?: boolean;
  hideStageCards?: boolean;
  onSelectSubsystem?: (system: string) => void;
}

interface StageConfig {
  reg: number;
  at: [number, number, number];
  name: string;
  metric: string;
  unit: string;
  state: 'ok' | 'act';
  side: 'left' | 'right';
}

const DEFAULT_STAGES: StageConfig[] = [
  { reg: 1, at: [0, 1.70, 0.06], name: 'Brain', metric: '4.7 h', unit: 'sleep ↓ 3.4σ', state: 'act', side: 'left' },
  { reg: 3, at: [-0.16, 0.86, 0.08], name: 'Air / CO₂', metric: '2.11', unit: 'mmHg CO₂', state: 'ok', side: 'left' },
  { reg: 0, at: [-0.27, 0.30, 0.12], name: 'Radiation', metric: '32.4', unit: 'µSv/h', state: 'ok', side: 'left' },
  { reg: 2, at: [0.06, 0.78, 0.12], name: 'Heart', metric: '59', unit: 'bpm', state: 'ok', side: 'right' },
  { reg: 7, at: [0.60, 0.12, 0.08], name: 'Ground Link', metric: '10.5 h', unit: 'since sync', state: 'ok', side: 'right' },
  { reg: 5, at: [0.15, -1.15, 0.08], name: 'Musculoskeletal', metric: '122', unit: 'min exercise', state: 'ok', side: 'right' },
];

const VS = `
attribute vec3 aP0;
attribute vec4 aSeed;
attribute float aReg;
attribute vec3 aNrm;
uniform float uTime, uPR, uSize, uBright;
uniform float uAng, uScan, uAlert, uBeatAmp, uBeatR;
uniform vec3 uChest;
uniform float uLit[10], uFocus[10];
varying vec3 vC;
varying float vA;

vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z); }
vec3 curl(vec3 p){ vec3 n=vec3(sin(p.y*1.7+uTime*.31)+sin(p.z*2.3-uTime*.17), sin(p.z*1.9+uTime*.26)+sin(p.x*2.1+uTime*.13), sin(p.x*1.6+uTime*.35)+sin(p.y*2.4-uTime*.21)); return vec3(n.y-n.z, n.z-n.x, n.x-n.y)*.5; }

void main(){
  vec3 pos = rotY(aP0, uAng);
  int ri = int(aReg + 0.5);

  // Idle anatomical breathing and micro-vibration
  pos += curl(pos * 1.3 + aSeed.xyz * 5.0) * 0.006;

  // Respiration in lungs (bilateral expansion wave)
  if (ri == 3) {
    float lungBreathe = sin(uTime * 1.3);
    pos.x += pos.x * 0.045 * lungBreathe;
    pos.y += 0.02 * sin(uTime * 1.3 + pos.x * 2.5);
  }

  // ONLY the anatomical heart contracts and relaxes - the rest of the body does NOT expand!
  if (ri == 2) {
    pos = uChest + (pos - uChest) * (1.0 + uBeatAmp * 0.18);
  }

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);

  // Base color, opacity and scale per anatomical region
  float by = aP0.y;
  float li = uLit[ri];
  float fo = uFocus[ri];
  vec3 col = vec3(0.50, 0.80, 1.0);
  float ab = 0.42;
  float sz = 0.88;

  // Region 1: Live Brain (folding cortex + neuron sparks + alert shift)
  if (ri == 1) {
    float wave = 0.5 + 0.5 * sin(uTime * 4.5 - length(aP0 - vec3(0.0, 1.71, 0.015)) * 42.0);
    float fire = step(0.92, fract(sin(dot(aSeed.xy, vec2(12.98, 78.23)) + floor(uTime * 7.5 + aSeed.w * 7.0)) * 43758.5));
    col = mix(vec3(1.0, 0.28, 0.68), vec3(0.42, 0.95, 1.0), fire * 0.85);
    ab = 0.38 + 0.28 * wave + 1.5 * fire;
    sz = 0.95 + 0.75 * fire;
  }
  // Region 2: Heart (incandescent crimson core with systolic white flash)
  else if (ri == 2) {
    col = mix(vec3(1.0, 0.03, 0.08), vec3(1.0, 0.88, 0.88), uBeatAmp * 0.65);
    ab = 0.88 * (1.0 + uBeatAmp * 0.6);
    sz = 1.15 + uBeatAmp * 0.25;
  }
  // Region 3: Pulmonary Lungs ("fush fush" - airy, distinct coral-pink / cyan respiratory lobes)
  else if (ri == 3) {
    col = mix(vec3(0.42, 0.78, 1.0), vec3(1.0, 0.38, 0.50), 0.80);
    ab = 0.52;
    sz = 0.90;
  }
  // Region 4: Visceral gut / core abdomen cluster
  else if (ri == 4) {
    col = vec3(0.40, 0.70, 1.0);
    ab = 0.28;
    sz = 0.82;
  }
  // Region 6: Bones / Skeleton (crisp radiant white-blue clavicles, sternum, ribs, spine, pelvis)
  else if (ri == 6) {
    col = vec3(0.90, 0.96, 1.0);
    ab = by > 1.45 ? 0.45 : 0.75;
    sz = 0.92;
  }
  // Region 7: Forearm Telemetry Transmitter (amber beacon)
  else if (ri == 7) {
    col = vec3(1.0, 0.85, 0.48);
    ab = 0.65;
    sz = 0.98;
  }
  // Region 8: Arterial Blood Vessels (Traveling Lub-Dub pulse wave from heart through whole body)
  else if (ri == 8) {
    float d = aNrm.x;
    float f1 = fract(uTime - d / 4.0);
    float f2 = fract(uTime - 0.28 - d / 4.0);
    float pl = exp(-f1 * 15.0) + 0.45 * exp(-f2 * 15.0);
    col = mix(vec3(0.96, 0.03, 0.06), vec3(1.0, 0.42, 0.36), clamp(pl, 0.0, 1.0));
    ab = 0.80 + 2.2 * pl;
    sz = 1.05 + 1.0 * pl;
  }
  // Region 9: Floor Horizon Ambient Stardust (subtle, non-distracting pedestal)
  else if (ri == 9) {
    col = vec3(0.25, 0.70, 0.88);
    ab = 0.20;
    sz = 0.60;
  }

  // Translucent Skin & Limbs (Fresnel silhouette rim: airy holographic center, crisp outer edge)
  if (ri == 0 || ri == 5 || ri == 7) {
    float nl = length(aNrm); float rim = 0.55;
    if (nl > 0.4) {
      vec3 nw = normalize(rotY(aNrm, uAng));
      rim = 1.0 - abs(dot(nw, normalize(cameraPosition - pos)));
      rim = 0.35 + 1.8 * pow(rim, 1.6);
      col = mix(col, vec3(0.72, 0.94, 1.0), 0.35 * rim);
      sz *= 0.90 + 0.35 * rim;
    }
    // Attenuate skin in center so internal organs and bones are clearly visible
    if (ri == 0 || ri == 5) {
      ab *= clamp(rim / 0.55, 0.68, 1.6);
    }
  }

  // Cardiac systolic pulse brightness modulation strictly for heart & vessels
  float beatGlow = (ri == 2) ? (uBeatAmp * 0.8) : 0.0;
  ab *= (0.35 + 0.65 * li) * (1.0 + fo * 1.5) * (1.0 + beatGlow);
  ab *= (1.0 + 2.0 * exp(-pow((by - uScan) / 0.09, 2.0)));
  if (ri == 1) ab *= 1.0 + uAlert * 0.35 * sin(uTime * 3.2);
  ab *= (0.60 + aSeed.z * 0.40);

  vC = col;
  vA = clamp(ab, 0.0, 1.0);

  // Optimized stardust point size calculation: fine, crisp, distinct pinpricks
  float pz = max(0.1, -mv.z);
  gl_PointSize = clamp((0.90 + aSeed.z * 1.5) * sz * 0.75 * uSize * uPR * (9.0 / pz), 1.2, 6.2);
  gl_Position = projectionMatrix * mv;
}
`;

const FS = `
precision mediump float;
uniform float uBright;
varying vec3 vC;
varying float vA;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0;
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 5.2) + 0.12 * exp(-r2 * 1.4);
  gl_FragColor = vec4(vC * a * vA * uBright, a * vA);
}
`;

export const HealthTwinScanner: React.FC<HealthTwinScannerProps> = ({
  astronautName = 'PILOT AST-02',
  astronautId = 'AST-02',
  readinessScore = 83,
  showControls = true,
  hideHeader = false,
  hideBottomCard = false,
  height,
  transparentBg = false,
  hideStageCards = false,
  onSelectSubsystem,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const labelsRef = useRef<(HTMLElement | null)[]>([]);

  const [scanProgress, setScanProgress] = useState<number>(0.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isBakedLoaded, setIsBakedLoaded] = useState<boolean>(false);

  const rotationRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const lastMouseXRef = useRef<number>(0);

  const N = 24000;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastMouseXRef.current = e.clientX;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMouseXRef.current;
    rotationRef.current += dx * 0.008;
    lastMouseXRef.current = e.clientX;
  }, []);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = mountRef.current;
    const svg = svgRef.current;
    if (!canvas || !root) return;

    // 1. Three.js Renderer & Scene
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x02030a, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    camera.position.set(0, 0.05, 6.4);
    camera.lookAt(0, 0, 0);

    // Initial procedural fallback points
    const pos = new Float32Array(N * 3);
    const reg = new Float32Array(N);
    const nrm = new Float32Array(N * 3);
    const seed = new Float32Array(N * 4);

    for (let i = 0; i < N; i++) {
      const u = Math.random(), v = Math.random();
      const theta = u * 2 * Math.PI;
      const y = (v - 0.5) * 3.4;
      const r = Math.sin(v * Math.PI) * 0.35;
      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(theta) * r;
      reg[i] = y > 1.4 ? 1 : y > 0.5 ? 2 : y > -0.2 ? 6 : 5;
      nrm[i * 3] = Math.cos(theta);
      nrm[i * 3 + 1] = 0;
      nrm[i * 3 + 2] = Math.sin(theta);
      seed[i * 4] = Math.random();
      seed[i * 4 + 1] = Math.random();
      seed[i * 4 + 2] = Math.random();
      seed[i * 4 + 3] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3);
    const regAttr = new THREE.BufferAttribute(reg, 1);
    const nrmAttr = new THREE.BufferAttribute(nrm, 3);
    const seedAttr = new THREE.BufferAttribute(seed, 4);

    geo.setAttribute('position', posAttr);
    geo.setAttribute('aP0', posAttr);
    geo.setAttribute('aReg', regAttr);
    geo.setAttribute('aNrm', nrmAttr);
    geo.setAttribute('aSeed', seedAttr);

    const uniforms = {
      uTime: { value: 0 },
      uPR: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uSize: { value: 1.95 },
      uBright: { value: 1.75 },
      uAng: { value: 0 },
      uScan: { value: 3.0 },
      uAlert: { value: 0.0 },
      uBeatAmp: { value: 0.0 },
      uBeatR: { value: 0.0 },
      uChest: { value: new THREE.Vector3(0.06, 0.78, 0.07) },
      uLit: { value: new Float32Array(10) },
      uFocus: { value: new Float32Array(10) },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    let bodyRig = {
      heart: [0.06, 0.78, 0.07],
      at: DEFAULT_STAGES.map(s => s.at),
      centers: { 0: 9, 1: 1.70, 2: 0.78, 3: 0.86, 4: 0.26, 5: -1.2, 6: 0.5, 7: 0.0, 8: 0, 9: -9 },
    };

    // Load High-Fidelity Baked Assets from Vite Public Directory
    Promise.all([
      fetch('/targets/body.bin').then(r => r.ok ? r.arrayBuffer() : Promise.reject()),
      fetch('/targets/body.json').then(r => r.ok ? r.json() : Promise.reject()),
    ]).then(([buf, json]) => {
      if (buf.byteLength === N * 13 && json && json.heart && json.at) {
        const dv = new DataView(buf);
        const pa = posAttr.array as Float32Array;
        const na = nrmAttr.array as Float32Array;
        const ra = regAttr.array as Float32Array;

        for (let i = 0; i < N; i++) {
          for (let c = 0; c < 3; c++) {
            pa[i * 3 + c] = dv.getInt16(i * 6 + c * 2, true) / 8192;
            na[i * 3 + c] = dv.getInt16(N * 6 + i * 6 + c * 2, true) / 4096;
          }
          ra[i] = dv.getUint8(N * 12 + i);
        }

        posAttr.needsUpdate = true;
        nrmAttr.needsUpdate = true;
        regAttr.needsUpdate = true;
        bodyRig = json;
        setIsBakedLoaded(true);
      }
    }).catch(() => {
      // Keep procedural fallback
    });

    // Setup SVG leader polylines
    const SVGNS = 'http://www.w3.org/2000/svg';
    if (svg) svg.innerHTML = '';
    const svgLines = svg ? DEFAULT_STAGES.map(() => {
      const line = document.createElementNS(SVGNS, 'polyline');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', 'rgba(34,211,238,0.65)');
      line.setAttribute('stroke-width', '1.2');
      line.style.opacity = '0';
      svg.appendChild(line);
      return line;
    }) : [];

    const svgDots = svg ? DEFAULT_STAGES.map(() => {
      const dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('r', '2.6');
      dot.setAttribute('fill', '#10b981');
      dot.style.opacity = '0';
      svg.appendChild(dot);
      return dot;
    }) : [];

    const tmpVec = new THREE.Vector3();

    // Resize handler
    const handleResize = () => {
      const w = root.clientWidth || canvas.clientWidth || 280;
      const h = root.clientHeight || canvas.clientHeight || 616;
      const pr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      uniforms.uPR.value = pr;
    };
    handleResize();

    const ro = new ResizeObserver(() => {
      handleResize();
    });
    ro.observe(root);
    window.addEventListener('resize', handleResize);

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    root.addEventListener('wheel', handleWheel, { passive: false });

    // Animation Loop
    let animId: number;
    let localProgress = 0.0;
    let lastTime = performance.now();

    const loop = (timeMs: number) => {
      animId = requestAnimationFrame(loop);
      const dt = (timeMs - lastTime) * 0.001;
      lastTime = timeMs;

      const t = timeMs * 0.001;

      // Update scan sweep
      localProgress = (localProgress + dt * 0.12) % 1.0;
      setScanProgress(localProgress);

      const p = localProgress;
      const scan = p < 0.15 ? 3.0 : p > 0.35 ? -3.0 : 2.3 - (p - 0.15) / 0.20 * 4.6;
      uniforms.uScan.value = scan;

      // Update region illumination
      const centers = bodyRig.centers as Record<string, number>;
      const lit = uniforms.uLit.value;
      for (let r = 0; r < 10; r++) {
        lit[r] = (r === 0 || r === 8 || r === 9)
          ? 1.0
          : Math.max(0, Math.min(1, ((centers[r] || 0) - scan) / 0.5 + 0.5)) * (p > 0.15 ? 1 : 0);
      }
      uniforms.uAlert.value = lit[1];

      // Cardiac pulse
      const ph = t % 1.0;
      const dub = (t + 0.72) % 1.0;
      uniforms.uBeatR.value = ph * 1.7;
      uniforms.uBeatAmp.value = Math.max(0, 1.0 - ph * 1.6) * 0.9 + Math.max(0, 1.0 - dub * 3.0) * 0.25 * (dub < 0.33 ? 1 : 0);

      // Angle & Chest origin
      const ang = rotationRef.current !== 0 ? rotationRef.current : 0.32 * Math.sin(t * 0.22);
      uniforms.uAng.value = ang;
      uniforms.uTime.value = t;

      const cAng = Math.cos(ang), sAng = Math.sin(ang);
      const hVec = bodyRig.heart;
      uniforms.uChest.value.set(cAng * hVec[0] + sAng * hVec[2], hVec[1], -sAng * hVec[0] + cAng * hVec[2]);

      renderer.render(scene, camera);

      // Render Dynamic SVG Leader Lines
      if (svg) {
        const box = root.getBoundingClientRect();
        const W = box.width;
        const H = box.height;

        DEFAULT_STAGES.forEach((stg, i) => {
          const line = svgLines[i];
          const dot = svgDots[i];
          const cardEl = labelsRef.current[i];
          if (!cardEl) return;

          const stageProgress = 0.28 + i * 0.09;
          const visibleAlpha = Math.max(0, Math.min(1, (p - stageProgress) / 0.05));
          cardEl.style.opacity = visibleAlpha.toFixed(2);
          cardEl.style.transform = `translateY(${(1 - visibleAlpha) * 12}px)`;

          if (W <= 768 || visibleAlpha < 0.05) {
            line.style.opacity = '0';
            dot.style.opacity = '0';
            return;
          }

          const a = (bodyRig.at && bodyRig.at[i]) || stg.at;
          tmpVec.set(cAng * a[0] + sAng * a[2], a[1], -sAng * a[0] + cAng * a[2]).project(camera);
          const ax = (tmpVec.x * 0.5 + 0.5) * W;
          const ay = (-tmpVec.y * 0.5 + 0.5) * H;

          const cardRect = cardEl.getBoundingClientRect();
          const isLeft = stg.side === 'left';
          const dir = isLeft ? 1 : -1;
          const sx = (isLeft ? cardRect.right : cardRect.left) - box.left + dir * 10;
          const sy = cardRect.top - box.top + 14;

          const lane = sx + dir * Math.min(24, Math.abs(ax - sx) * 0.5);
          const dy = ay - sy;
          const ch = Math.min(8, Math.abs(dy) / 2, Math.abs(lane - sx));
          const sg = Math.sign(dy);

          const pts = [
            [sx, sy],
            [lane - dir * ch, sy],
            [lane, sy + sg * ch],
            [lane, ay - sg * ch],
            [lane + dir * ch, ay],
            [ax, ay],
          ].map(pt => `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(' ');

          line.setAttribute('points', pts);
          dot.setAttribute('cx', ax.toFixed(1));
          dot.setAttribute('cy', ay.toFixed(1));

          line.style.opacity = (visibleAlpha * 0.9).toFixed(2);
          dot.style.opacity = visibleAlpha.toFixed(2);

          if (stg.state === 'act') {
            line.setAttribute('stroke', 'rgba(245, 158, 11, 0.85)');
            dot.setAttribute('fill', '#f59e0b');
          } else {
            line.setAttribute('stroke', 'rgba(34, 211, 238, 0.65)');
            dot.setAttribute('fill', '#22d3ee');
          }
        });
      }
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('wheel', handleWheel);
      root.removeEventListener('wheel', handleWheel);
      renderer.dispose();
      geo.dispose();
      mat.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'relative',
        width: '100%',
        height: height || '100%',
        minHeight: height ? 'auto' : '620px',
        overflow: 'hidden',
        background: transparentBg ? 'transparent' : 'radial-gradient(circle at 50% 50%, #081124 0%, #02030a 80%)',
        userSelect: 'none',
        touchAction: 'none',
        overscrollBehavior: 'none',
        borderRadius: transparentBg ? 0 : '16px',
        border: transparentBg ? 'none' : '1px solid rgba(34, 211, 238, 0.22)',
      }}
    >
      {/* Background Matrix Grid */}
      {!transparentBg && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(to right, rgba(34, 211, 238, 0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(34, 211, 238, 0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Header Info */}
      {!hideHeader && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '20px',
            right: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
        <div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: '99px',
              background: 'rgba(34, 211, 238, 0.1)',
              border: '1px solid rgba(34, 211, 238, 0.3)',
              fontFamily: 'monospace',
              fontSize: '0.65rem',
              fontWeight: 700,
              color: '#22d3ee',
              letterSpacing: '0.12em',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3ee6a0', boxShadow: '0 0 6px #3ee6a0' }} />
            NASA-STD-3001 BIO-TWIN
          </span>
          <h2 style={{ margin: '4px 0 0', fontSize: '1.1rem', fontWeight: 700, color: '#fff', letterSpacing: '0.06em' }}>
            {astronautName} <span style={{ fontSize: '0.75rem', color: 'rgba(234, 242, 255, 0.6)' }}>({astronautId})</span>
          </h2>
        </div>

        <span
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            background: 'rgba(8, 16, 32, 0.75)',
            border: '1px solid rgba(34, 211, 238, 0.25)',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
            color: '#22d3ee',
            letterSpacing: '0.1em',
          }}
        >
          {isBakedLoaded ? '24K BAKED TARGET' : 'GPU PROCEDURAL TWIN'}
        </span>
      </div>
      )}

      {/* Three.js Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'grab',
        }}
      />

      {/* SVG Leader Lines */}
      {!hideStageCards && (
        <svg
          ref={svgRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
            zIndex: 6,
          }}
        />
      )}

      {/* 6 Subsystem Telemetry Cards */}
      {!hideStageCards && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 7 }}>
          {DEFAULT_STAGES.map((stg, i) => (
          <div
            key={stg.name}
            ref={el => { labelsRef.current[i] = el; }}
            onClick={() => onSelectSubsystem?.(stg.name)}
            style={{
              position: 'absolute',
              width: 'min(14rem, 24vw)',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(4, 10, 22, 0.78)',
              border: `1px solid ${stg.state === 'act' ? 'rgba(245, 158, 11, 0.45)' : 'rgba(34, 211, 238, 0.25)'}`,
              backdropFilter: 'blur(10px)',
              pointerEvents: 'auto',
              cursor: 'pointer',
              opacity: 0,
              transition: 'all 0.3s ease',
              ...(stg.side === 'left' ? { left: '20px' } : { right: '20px' }),
              top: `${16 + (i % 3) * 22}vh`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: stg.state === 'act' ? '#f59e0b' : '#3ee6a0',
                  boxShadow: `0 0 6px ${stg.state === 'act' ? '#f59e0b' : '#3ee6a0'}`,
                }}
              />
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  color: '#e0fbff',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                {stg.name}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  padding: '1px 5px',
                  borderRadius: '99px',
                  fontSize: '0.55rem',
                  fontFamily: 'monospace',
                  color: stg.state === 'act' ? '#f59e0b' : '#3ee6a0',
                  border: `1px solid ${stg.state === 'act' ? 'rgba(245, 158, 11, 0.5)' : 'rgba(62, 230, 160, 0.4)'}`,
                }}
              >
                {stg.state.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>
              {stg.metric}{' '}
              <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: stg.state === 'act' ? '#f59e0b' : 'rgba(234, 242, 255, 0.6)' }}>
                {stg.unit}
              </span>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Readiness & Action Footer */}
      {!hideBottomCard && (
        <div
          style={{
            position: 'absolute',
            bottom: showControls ? '68px' : '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(92%, 560px)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '12px 20px',
            borderRadius: '14px',
            background: 'rgba(4, 10, 22, 0.88)',
            border: '1px solid rgba(34, 211, 238, 0.28)',
            backdropFilter: 'blur(12px)',
            zIndex: 8,
          }}
        >
          <div style={{ textAlign: 'center', paddingRight: '14px', borderRight: '1px solid rgba(34, 211, 238, 0.2)' }}>
            <span style={{ display: 'block', fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(234, 242, 255, 0.6)' }}>
              READINESS
            </span>
            <span style={{ fontSize: '1.9rem', fontWeight: 800, color: '#fff', textShadow: '0 0 12px rgba(34, 211, 238, 0.4)' }}>
              {readinessScore}%
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }} />
              <span style={{ fontFamily: 'monospace', fontSize: '0.62rem', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.12em' }}>
                ACTION CARD &middot; ACT
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(234, 242, 255, 0.85)', lineHeight: 1.35 }}>
              Short sleep detected. Handover safety-critical mission console tasks to crewmate.
            </p>
          </div>
        </div>
      )}

      {/* Controls Bar */}
      {showControls && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '8px 16px',
            borderRadius: '10px',
            background: 'rgba(6, 14, 28, 0.9)',
            border: '1px solid rgba(34, 211, 238, 0.25)',
            backdropFilter: 'blur(12px)',
            zIndex: 10,
          }}
        >
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: isPlaying ? 'rgba(34, 211, 238, 0.15)' : '#22d3ee',
              color: isPlaying ? '#22d3ee' : '#02030a',
              border: '1px solid rgba(34, 211, 238, 0.4)',
              fontFamily: 'monospace',
              fontSize: '0.68rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'rgba(234, 242, 255, 0.6)' }}>SWEEP:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={scanProgress}
              onChange={e => {
                setIsPlaying(false);
                setScanProgress(parseFloat(e.target.value));
              }}
              style={{ width: '120px', accentColor: '#22d3ee' }}
            />
            <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#22d3ee', minWidth: '32px' }}>
              {Math.round(scanProgress * 100)}%
            </span>
          </div>
          <button
            onClick={() => {
              rotationRef.current = 0;
              setIsPlaying(true);
            }}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(34, 211, 238, 0.15)',
              color: '#22d3ee',
              border: '1px solid rgba(34, 211, 238, 0.4)',
              fontFamily: 'monospace',
              fontSize: '0.68rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            RESET
          </button>
        </div>
      )}
    </div>
  );
};
