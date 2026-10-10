import React, { useState, useMemo, useRef, useCallback } from 'react';
import type { TelemetryPacket, AlertPayload, DistancePreset } from '../types/telemetry';
import { AstroTwinBodyScanner, type HazardId, type HazardStatus } from './AstroTwinBodyScanner';
import { AstroTopBar } from './AstroTopBar';
import { LiveWaveCanvas } from './LiveWaveCanvas';
import './BioTwinCommandDeck.css';

export interface BioTwinCommandDeckProps {
  telemetryMap: Record<string, TelemetryPacket>;
  latestAlert?: AlertPayload | null;
  activeAstronautId: string;
  onSelectAstronaut?: (id: string) => void;
  onOpenTriage?: (astronautId: string) => void;
  onOpenAlerts?: (astronautId: string) => void;
  onToggleViewMode?: () => void;
  currentScenario?: string;
  orbitalPosition?: DistancePreset;
  connected?: boolean;
  activeView?: 'HUD' | 'HEALTH_TELEMETRY' | 'MCC' | 'SCANNER' | 'MCC_TELEMETRY' | 'ALERTS' | 'SUIT_HUD';
  onSelectView?: (view: any) => void;
}

export const BioTwinCommandDeck: React.FC<BioTwinCommandDeckProps> = ({
  telemetryMap,
  activeAstronautId,
  latestAlert,
  onSelectAstronaut,
  onOpenTriage,
  onOpenAlerts,
  onToggleViewMode,
  currentScenario,
  orbitalPosition = 'MARS_MIN',
  connected = true,
  activeView = 'HUD',
  onSelectView,
}) => {
  // Active Telemetry Packet from live 10 Hz WebSocket / Sentry feed
  const activeTelemetry: TelemetryPacket = telemetryMap[activeAstronautId] || telemetryMap['AST-01_COMMANDER'] || {
    timestamp: new Date().toISOString(),
    tick: 0,
    astronaut_id: activeAstronautId,
    astronaut_name: 'Commander',
    mission_state: 'REST',
    heart_rate: 60.0,
    hrv_rmssd: 68.0,
    spo2: 99.3,
    core_temp: 36.6,
    sleep_score: 92,
    cabin_co2: 2.65,
    potassium: 4.4,
    hematocrit: 42.0,
    wbc_count: 6.8,
    platelet_count: 240,
    crp: 0.8,
    computed_qtc: 405,
    scenario_phase: 'NOMINAL_CRUISE',
    z_score_hr: 0.1,
    z_score_hrv: 0.1,
    evaluated_severity: 'NOMINAL',
  };

  // Hover state for bidirectional focus illumination between 3D body and bottom hazard cards
  const [hoveredHazard, setHoveredHazard] = useState<HazardId | null>(null);

  // Dynamic RIDGE hazard status evaluation based on real-time sentry telemetry & active scenario
  const hazardStatuses: Record<HazardId, HazardStatus> = useMemo(() => {
    const sc = (currentScenario || '').toUpperCase();
    const alertText = (latestAlert?.speech_text || '').toLowerCase();

    // 1. Radiation (R)
    let rStat: HazardStatus = 'nominal';
    if (
      sc.includes('RADIATION') ||
      alertText.includes('radiation') ||
      alertText.includes('solar storm') ||
      (activeTelemetry.radiation_flux && activeTelemetry.radiation_flux > 0.3) ||
      (activeTelemetry.radiation_dose_gy && activeTelemetry.radiation_dose_gy > 0.4)
    ) {
      rStat = 'act';
    } else if (
      (activeTelemetry.radiation_flux && activeTelemetry.radiation_flux > 0.12) ||
      (activeTelemetry.radiation_dose_gy && activeTelemetry.radiation_dose_gy > 0.08)
    ) {
      rStat = 'watch';
    }

    // 2. Isolation (I)
    let iStat: HazardStatus = 'nominal';
    if (
      sc.includes('FATIGUE') ||
      sc.includes('CIRCADIAN') ||
      alertText.includes('sleep') ||
      alertText.includes('isolation') ||
      (activeTelemetry.sleep_score && activeTelemetry.sleep_score < 68)
    ) {
      iStat = 'act';
    } else if (activeTelemetry.sleep_score && activeTelemetry.sleep_score < 80) {
      iStat = 'watch';
    }

    // 3. Environment (E)
    let eStat: HazardStatus = 'nominal';
    if (
      sc.includes('CO2') ||
      sc.includes('HYPOXIA') ||
      sc.includes('COOLANT') ||
      sc.includes('FIRE') ||
      sc.includes('DECOMPRESSION') ||
      alertText.includes('co2') ||
      alertText.includes('hypoxia') ||
      (activeTelemetry.cabin_co2 && activeTelemetry.cabin_co2 > 4.0) ||
      (activeTelemetry.spo2 && activeTelemetry.spo2 < 92)
    ) {
      eStat = 'act';
    } else if (
      (activeTelemetry.cabin_co2 && activeTelemetry.cabin_co2 > 2.8) ||
      (activeTelemetry.spo2 && activeTelemetry.spo2 < 96)
    ) {
      eStat = 'watch';
    }

    // 4. Distance (D)
    let dStat: HazardStatus = 'nominal';
    if (sc.includes('SYNC') || sc.includes('COMM') || alertText.includes('signal') || alertText.includes('transmission')) {
      dStat = 'act';
    } else if (orbitalPosition === 'MARS_MAX' || sc.includes('DEEP_SPACE')) {
      dStat = 'watch';
    }

    // 5. Gravity (G)
    let gStat: HazardStatus = 'nominal';
    if (
      sc.includes('ARRHYTHMIA') ||
      sc.includes('CARDIOVASCULAR') ||
      sc.includes('DECONDITIONING') ||
      sc.includes('THROMBOSIS') ||
      alertText.includes('arrhythmia') ||
      Math.abs(activeTelemetry.z_score_hr || 0) > 2.8 ||
      activeTelemetry.heart_rate > 115 ||
      activeTelemetry.heart_rate < 45
    ) {
      gStat = 'act';
    } else if (Math.abs(activeTelemetry.z_score_hr || 0) > 1.8 || activeTelemetry.heart_rate > 95 || activeTelemetry.heart_rate < 52) {
      gStat = 'watch';
    }

    return { I: iStat, D: dStat, E: eStat, R: rStat, G: gStat };
  }, [currentScenario, latestAlert, activeTelemetry, orbitalPosition]);

  // Overall mission status
  const overallStatus: HazardStatus = useMemo(() => {
    const statuses = Object.values(hazardStatuses);
    if (statuses.includes('act')) return 'act';
    if (statuses.includes('watch')) return 'watch';
    return 'nominal';
  }, [hazardStatuses]);

  // Dynamic Bio-Readiness Score computed against personal baseline
  const readiness = useMemo(() => {
    if (overallStatus === 'act') {
      const penalty = Math.min(38, Math.abs(activeTelemetry.z_score_hr || 1) * 8 + Math.abs(activeTelemetry.z_score_hrv || 1) * 6);
      return Math.max(45, Math.round(72 - penalty));
    }
    if (overallStatus === 'watch') {
      const penalty = Math.min(18, Math.abs(activeTelemetry.z_score_hr || 0.5) * 6);
      return Math.max(70, Math.round(87 - penalty));
    }
    const zSum = Math.abs(activeTelemetry.z_score_hr || 0.1) + Math.abs(activeTelemetry.z_score_hrv || 0.1);
    return Math.min(98, Math.max(88, Math.round(94 - zSum * 3)));
  }, [overallStatus, activeTelemetry.z_score_hr, activeTelemetry.z_score_hrv]);

  // Needle angle for readiness dial (212° at 0% to 384° at 100%, 91% -> 368.4°)
  const needleAngle = 212 + (readiness / 100) * 172;

  // Dynamic breathing rate derived from heart rate and metabolic CO2
  const breathingRate = useMemo(() => {
    const hr = activeTelemetry.heart_rate || 60;
    const co2 = activeTelemetry.cabin_co2 || 1.82;
    return Math.min(32, Math.max(10, Math.round(14 + (hr - 60) * 0.12 + (co2 - 1.82) * 1.5)));
  }, [activeTelemetry.heart_rate, activeTelemetry.cabin_co2]);

  // Dynamic Tile Metrics
  const radFlux = activeTelemetry.radiation_flux ?? 0.05;
  const radDoseRate = (radFlux * 584).toFixed(2);
  const radSigma = (((radFlux - 0.05) / 0.02) + 1.2).toFixed(1);

  const sleepScore = activeTelemetry.sleep_score ?? 92;
  const sleepHours = (sleepScore * 0.0772).toFixed(1);
  const sleepSigma = (((sleepScore - 88) * 0.05) + 0.2).toFixed(1);

  const syncTime =
    orbitalPosition === 'MARS_MAX' ? '21.4' : orbitalPosition === 'MARS_MIN' ? '10.5' : orbitalPosition === 'GATEWAY' ? '2.1' : '0.4';

  const hrv = activeTelemetry.hrv_rmssd ?? 68;
  const exerciseMinutes = Math.round(115 + (hrv - 55) * 1.2);
  const exerciseSigma = (((activeTelemetry.z_score_hrv ?? 0.1)) + 1.2).toFixed(1);

  const co2Val = (activeTelemetry.cabin_co2 ?? 2.65).toFixed(2);
  const co2Sigma = (((activeTelemetry.cabin_co2 ?? 2.65) - 1.8) * 1.05 + 0.9).toFixed(1);

  // Dynamic Mini Graphs Calculations
  const readinessTrend = useMemo(() => {
    const offsets = [-2, 1, -1, 2, -1, 1, 0];
    const pts = offsets.map((off, i) => {
      const val = Math.min(99, Math.max(50, readiness + off));
      const x = 3 + (i / 6) * 154;
      const y = 41 - ((val - 50) / 50) * 36;
      return [x, y];
    });
    const lineD = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return lineD;
  }, [readiness]);

  const radTrend = useMemo(() => {
    const pts = [0.12, 0.24, 0.38, 0.54, 0.70, 0.86, 1.0].map((prog, i) => {
      const x = 3 + (i / 6) * 154;
      const y = 41 - prog * 34;
      return [x, y];
    });
    const lineD = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const areaD = `${lineD} L${pts[pts.length - 1][0].toFixed(1)} 44 L${pts[0][0].toFixed(1)} 44 Z`;
    return { lineD, areaD };
  }, []);

  const sleepTrend = useMemo(() => {
    const curH = Number(sleepHours);
    const nights = [7.2, 7.0, 7.5, 6.8, 7.4, 7.1, 7.6, 6.9, 7.3, 7.0, 7.5, 7.2, 7.0, curH];
    let path = '';
    nights.forEach((val, i) => {
      const x1 = 3 + (i / 14) * 154;
      const x2 = 3 + ((i + 1) / 14) * 154;
      const y = 41 - Math.min(38, Math.max(5, (val / 9) * 38));
      path += `${i === 0 ? 'M' : 'L'}${x1.toFixed(1)} ${y.toFixed(1)} L${x2.toFixed(1)} ${y.toFixed(1)} `;
    });
    return path;
  }, [sleepHours]);

  const exerciseBars = useMemo(() => {
    const days = [118, 134, 122, 115, 126, 120, exerciseMinutes];
    return days.map((val, i) => {
      const barW = 15.84;
      const x = 6.08 + i * 22;
      const h = Math.min(36, Math.max(8, (val / 150) * 36));
      const y = 41 - h;
      return { x, y, width: barW, height: h };
    });
  }, [exerciseMinutes]);

  const co2Trend = useMemo(() => {
    const cur = Number(co2Val);
    const samples = [
      2.1, 2.4, 2.2, 2.6, 2.5, 2.7, 2.3, 2.8, 2.4, 2.9, 2.5, 2.7, 2.6, 2.8, 2.7, 3.0, 2.8, 2.9, cur
    ];
    const pts = samples.map((val, i) => {
      const x = 3 + (i / (samples.length - 1)) * 154;
      const y = 41 - Math.min(38, Math.max(6, (val / 3.8) * 38));
      return [x, y];
    });
    return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  }, [co2Val]);

  // Cardiac Pulse Ring trigger
  const pulseRingRef = useRef<HTMLSpanElement>(null);
  const handleCardiacBeat = useCallback(() => {
    if (pulseRingRef.current) {
      pulseRingRef.current.animate?.(
        [
          { transform: 'scale(1)', opacity: 0.8 },
          { transform: 'scale(1.6)', opacity: 0 },
        ],
        { duration: 550, easing: 'ease-out' }
      );
    }
  }, []);

  // Dynamic Next Action Card
  const nextAction = useMemo(() => {
    if (overallStatus === 'act') {
      return {
        title: 'Intervention required',
        desc: latestAlert ? latestAlert.speech_text : 'Critical clinical telemetry divergence detected. Review emergency checklist.',
        badgeClass: 'st-act',
      };
    }
    if (overallStatus === 'watch') {
      return {
        title: 'Monitor telemetry drift',
        desc: 'Physiological drift detected outside baseline envelope. Maintain continuous biometric observation.',
        badgeClass: 'st-watch',
      };
    }
    return {
      title: 'Nothing needs doing',
      desc: "Every hazard is within this person's own baseline. A daily check-in keeps the baseline honest.",
      badgeClass: 'st-nominal',
    };
  }, [overallStatus, latestAlert]);

  return (
    <div className="deck-wrapper" style={{ width: '100%' }}>
      {/* ─── MAIN NAVBAR: ASTRODOCX TOPBAR WITH CREW SWITCHER ─── */}
      <AstroTopBar
        currentCrewId={activeAstronautId}
        onSelectCrew={(id) => onSelectAstronaut?.(id)}
        telemetryMap={telemetryMap}
        latestAlert={latestAlert}
        currentScenario={currentScenario}
        orbitalPosition={orbitalPosition}
        connected={connected}
        activeView={activeView}
        onSelectView={onSelectView}
        onToggleView={onToggleViewMode}
        onOpenAlerts={() => (onOpenAlerts ? onOpenAlerts(activeAstronautId) : onOpenTriage?.(activeAstronautId))}
      />

      <div className="deck-board" style={{ padding: '16px 20px 40px', maxWidth: '1360px', margin: '0 auto' }}>
        {/* ─── ROW 1: TOP 3 CARDS ─── */}
        <div className="board-top">
          {/* CARD 1: READINESS */}
          <section className={`glass readiness st-${overallStatus}`} aria-label={`Readiness for ${activeTelemetry.astronaut_name || 'Commander'}`}>
            <figure className={`ring dial st-${overallStatus}`} aria-label={`Crew readiness ${readiness} percent, ${overallStatus.toUpperCase()}`}>
              <svg viewBox="0 0 120 100" role="img" aria-hidden="true">
                <path d="M20.16 85.00A46 46 0 1 1 99.84 85.00" pathLength="100" className="ring-track" />
                <path
                  d="M20.16 85.00A46 46 0 1 1 99.84 85.00"
                  pathLength="100"
                  className="ring-fill"
                  strokeDasharray={`${readiness} 100`}
                />
                <line x1="13.23" y1="89" x2="17.56" y2="86.5" className="dial-tick" />
                <line x1="13.23" y1="35" x2="17.56" y2="37.5" className="dial-tick" />
                <line x1="60" y1="8" x2="60" y2="13" className="dial-tick" />
                <line x1="106.77" y1="35" x2="102.44" y2="37.5" className="dial-tick" />
                <line x1="106.77" y1="89" x2="102.44" y2="86.5" className="dial-tick" />
                <g
                  className="dial-needle"
                  style={{
                    transform: `rotate(${needleAngle}deg)`,
                    transformOrigin: '60px 62px',
                  }}
                >
                  <line x1="60" y1="62" x2="98" y2="62" />
                </g>
                <circle cx="60" cy="62" r="4.5" className="dial-hub" />
              </svg>
              <figcaption>
                <b>{readiness}%</b>
                <span className={`badge st-${overallStatus}`}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="m16 9-5.5 5.5L8 12" />
                  </svg>
                  {overallStatus.toUpperCase()}
                </span>
              </figcaption>
            </figure>

            <div>
              <p className="muted">
                {activeTelemetry.astronaut_name || 'Commander'} · readiness combines all five RIDGE hazards against this person's own baseline.
              </p>
              <p className="alerts-pill">
                {latestAlert ? `${latestAlert.speech_text.slice(0, 42)}...` : 'No active alerts'}
              </p>
              <div className="rd-trend">
                <div className="mini-box">
                  <svg className="mini" viewBox="0 0 160 44" preserveAspectRatio="none" aria-hidden="true">
                    <path d={readinessTrend} className="mini-line" />
                  </svg>
                  <span className="mini-cap">
                    Readiness, last 7 days · {Math.max(readiness - 3, 45)}–{Math.min(readiness + 2, 98)}%
                  </span>
                </div>
                <div className="rd-checkin">
                  No check-in yet <b>· due <span style={{ letterSpacing: '2px', color: '#ffc53d' }}>··</span></b>
                </div>
              </div>
            </div>
          </section>

          {/* CARD 2: 3D DIGITAL TWIN SCANNER (CENTERPIECE) */}
          <section className={`glass twin-card st-${overallStatus}`} aria-label="Health twin">
            <AstroTwinBodyScanner
              focusHazard={hoveredHazard}
              onFocusHazard={setHoveredHazard}
              hazardStatuses={hazardStatuses}
              heartRate={activeTelemetry.heart_rate}
            />
          </section>

          {/* CARD 3: NEXT ACTION */}
          <section className={`glass next ${nextAction.badgeClass}`} aria-label="Next action">
            <h2 className="sec-title">NEXT ACTION</h2>
            <p className="next-title">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={overallStatus === 'act' ? '#ff5a6e' : overallStatus === 'watch' ? '#ffc53d' : '#3ddc97'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m16 9-5.5 5.5L8 12" />
              </svg>
              {nextAction.title}
            </p>
            <p className="muted">{nextAction.desc}</p>
            {overallStatus === 'act' || overallStatus === 'watch' ? (
              <button
                type="button"
                className="btn"
                onClick={() => (onOpenAlerts ? onOpenAlerts(activeAstronautId) : onOpenTriage?.(activeAstronautId))}
              >
                Open action card
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="btn ghost"
                onClick={() => onOpenTriage?.(activeAstronautId)}
              >
                Daily check-in
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            )}
          </section>
        </div>

        {/* ─── ROW 2: VITALS (3 CARDS WITH SMOOTH OSCILLOSCOPE GRAPHS) ─── */}
        <section className="vitals" aria-label="Live vitals">
          {/* Vital 1: Heart rate */}
          <article className="glass vital">
            <header>
              <span className="vital-icon">
                <span ref={pulseRingRef} className="pulse-ring" aria-hidden="true" />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
                  <path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
                </svg>
              </span>
              <h2>Heart rate</h2>
              <span className="sim-chip" title="Simulated signal, built around the latest real reading">
                SIM
              </span>
            </header>
            <p className="val">
              <b>{Math.round(activeTelemetry.heart_rate || 60)}</b> <small>bpm</small>
              <span className="vital-base"> · baseline 61</span>
            </p>
            <LiveWaveCanvas
              kind="ecg"
              rate={activeTelemetry.heart_rate || 60}
              onBeat={handleCardiacBeat}
              height={52}
            />
          </article>

          {/* Vital 2: Oxygen (SpO2) */}
          <article className="glass vital">
            <header>
              <span className="vital-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
                </svg>
              </span>
              <h2>Oxygen (SpO₂)</h2>
              <span className="sim-chip" title="Simulated signal, built around the latest real reading">
                SIM
              </span>
            </header>
            <p className="val">
              <b>{(activeTelemetry.spo2 || 99.3).toFixed(1)}</b> <small>%</small>
              <span className="vital-base"> · baseline 98.1</span>
            </p>
            <LiveWaveCanvas
              kind="pleth"
              rate={activeTelemetry.heart_rate || 60}
              height={52}
            />
          </article>

          {/* Vital 3: Breathing */}
          <article className="glass vital">
            <header>
              <span className="vital-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12.8 19.6A2 2 0 1 0 14 16H2" />
                  <path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" />
                  <path d="M9.8 4.4A2 2 0 1 1 11 8H2" />
                </svg>
              </span>
              <h2>Breathing</h2>
              <span className="sim-chip" title="Simulated signal, built around the latest real reading">
                SIM
              </span>
            </header>
            <p className="val">
              <b>{breathingRate}</b> <small>/min</small>
              <span className="vital-base"> · baseline 14</span>
            </p>
            <LiveWaveCanvas
              kind="resp"
              rate={breathingRate}
              height={52}
            />
          </article>
        </section>

        {/* ─── ROW 3: TILES (5 HAZARD CARDS WITH SMOOTH DYNAMIC MINI CHARTS) ─── */}
        <ul className="tiles" aria-label="Hazard status">
          {/* Tile 1: Radiation */}
          <li
            id="hz-R"
            className={`glass tile st-${hazardStatuses.R} ${hoveredHazard === 'R' ? 'is-focused' : ''}`}
            tabIndex={0}
            onMouseEnter={() => setHoveredHazard('R')}
            onMouseLeave={() => setHoveredHazard(null)}
            onFocus={() => setHoveredHazard('R')}
            onBlur={() => setHoveredHazard(null)}
          >
            <header>
              <span className={`hz st-${hazardStatuses.R}`} title="RIDGE R">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 12h.01" />
                  <path d="M14 15.4641a4 4 0 0 1-4 0L7.52786 19.74597 A 1 1 0 0 0 7.99303 21.16211 10 10 0 0 0 16.00697 21.16211 1 1 0 0 0 16.47214 19.74597z" />
                  <path d="M16 12a4 4 0 0 0-2-3.464l2.472-4.282a1 1 0 0 1 1.46-.305 10 10 0 0 1 4.006 6.94A1 1 0 0 1 21 12z" />
                  <path d="M8 12a4 4 0 0 1 2-3.464L7.528 4.254a1 1 0 0 0-1.46-.305 10 10 0 0 0-4.006 6.94A1 1 0 0 0 3 12z" />
                </svg>
              </span>
              <h2>Radiation</h2>
              <span className={`badge st-${hazardStatuses.R}`}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="m16 9-5.5 5.5L8 12" />
                </svg>
                {hazardStatuses.R.toUpperCase()}
              </span>
            </header>
            <p className="val">
              <b>{radDoseRate}</b> <small>µSv/h</small>
              <span className="delta">{Number(radSigma) >= 0 ? `+${radSigma}` : radSigma}σ</span>
            </p>
            <p className="lbl">Dose rate</p>
            <div className="mini-box">
              <svg className="mini" viewBox="0 0 160 44" preserveAspectRatio="none" aria-hidden="true">
                <path d={radTrend.areaD} className="mini-area" />
                <path d={radTrend.lineD} className="mini-line" />
              </svg>
              <span className="mini-cap">Cumulative dose, 7 days</span>
            </div>
            <p className="why">Dose rate, cumulative dose</p>
          </li>

          {/* Tile 2: Isolation */}
          <li
            id="hz-I"
            className={`glass tile st-${hazardStatuses.I} ${hoveredHazard === 'I' ? 'is-focused' : ''}`}
            tabIndex={0}
            onMouseEnter={() => setHoveredHazard('I')}
            onMouseLeave={() => setHoveredHazard(null)}
            onFocus={() => setHoveredHazard('I')}
            onBlur={() => setHoveredHazard(null)}
          >
            <header>
              <span className={`hz st-${hazardStatuses.I}`} title="RIDGE I">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 18V5" />
                  <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
                  <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
                  <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
                  <path d="M18 18a4 4 0 0 0 2-7.464" />
                  <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
                  <path d="M6 18a4 4 0 0 1-2-7.464" />
                  <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
                </svg>
              </span>
              <h2>Isolation</h2>
              <span className={`badge st-${hazardStatuses.I}`}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="m16 9-5.5 5.5L8 12" />
                </svg>
                {hazardStatuses.I.toUpperCase()}
              </span>
            </header>
            <p className="val">
              <b>{sleepHours}</b> <small>h</small>
              <span className="delta">{Number(sleepSigma) >= 0 ? `+${sleepSigma}` : sleepSigma}σ</span>
            </p>
            <p className="lbl">Sleep last night</p>
            <div className="mini-box">
              <svg className="mini" viewBox="0 0 160 44" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" x2="160" y1="20.14" y2="20.14" className="mini-rule" />
                <path d={sleepTrend} className="mini-line" />
              </svg>
              <span className="mini-cap">Sleep per night, 14 nights</span>
            </div>
            <p className="why">Sleep, mood, reaction time</p>
          </li>

          {/* Tile 3: Distance */}
          <li
            id="hz-D"
            className={`glass tile st-${hazardStatuses.D} ${hoveredHazard === 'D' ? 'is-focused' : ''}`}
            tabIndex={0}
            onMouseEnter={() => setHoveredHazard('D')}
            onMouseLeave={() => setHoveredHazard(null)}
            onFocus={() => setHoveredHazard('D')}
            onBlur={() => setHoveredHazard(null)}
          >
            <header>
              <span className={`hz st-${hazardStatuses.D}`} title="RIDGE D">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m13.5 6.5-3.148-3.148a1.205 1.205 0 0 0-1.704 0L6.352 5.648a1.205 1.205 0 0 0 0 1.704L9.5 10.5" />
                  <path d="M16.5 7.5 19 5" />
                  <path d="m17.5 10.5 3.148 3.148a1.205 1.205 0 0 1 0 1.704l-2.296 2.296a1.205 1.205 0 0 1-1.704 0L13.5 14.5" />
                  <path d="M9 21a6 6 0 0 0-6-6" />
                  <path d="M9.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l4.296-4.296a1.205 1.205 0 0 0 0-1.704l-2.296-2.296a1.205 1.205 0 0 0 1.704 0z" />
                </svg>
              </span>
              <h2>Distance</h2>
              <span className={`badge st-${hazardStatuses.D}`}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="m16 9-5.5 5.5L8 12" />
                </svg>
                {hazardStatuses.D.toUpperCase()}
              </span>
            </header>
            <p className="val">
              <b>{syncTime}</b> <small>h</small>
            </p>
            <p className="lbl">Since ground sync · 3 pending</p>
            <div className="mini-box">
              <div className="backlog">
                <span className="backlog-fill" style={{ width: orbitalPosition === 'MARS_MAX' ? '28%' : '6.25%' }} />
                <i style={{ left: '25%' }} />
                <i style={{ left: '75%' }} />
              </div>
              <span className="mini-cap">Oldest unsynced entry (Watch 24 h, Act 72 h)</span>
            </div>
            <p className="why">Ground link, pending sync</p>
          </li>

          {/* Tile 4: Gravity */}
          <li
            id="hz-G"
            className={`glass tile st-${hazardStatuses.G} ${hoveredHazard === 'G' ? 'is-focused' : ''}`}
            tabIndex={0}
            onMouseEnter={() => setHoveredHazard('G')}
            onMouseLeave={() => setHoveredHazard(null)}
            onFocus={() => setHoveredHazard('G')}
            onBlur={() => setHoveredHazard(null)}
          >
            <header>
              <span className={`hz st-${hazardStatuses.G}`} title="RIDGE G">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" />
                  <path d="m2.5 21.5 1.4-1.4" />
                  <path d="m20.1 3.9 1.4-1.4" />
                  <path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" />
                  <path d="m9.6 14.4 4.8-4.8" />
                </svg>
              </span>
              <h2>Gravity</h2>
              <span className={`badge st-${hazardStatuses.G}`}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="m16 9-5.5 5.5L8 12" />
                </svg>
                {hazardStatuses.G.toUpperCase()}
              </span>
            </header>
            <p className="val">
              <b>{exerciseMinutes}</b> <small>min</small>
              <span className="delta">{Number(exerciseSigma) >= 0 ? `+${exerciseSigma}` : exerciseSigma}σ</span>
            </p>
            <p className="lbl">Exercise load</p>
            <div className="mini-box">
              <svg className="mini" viewBox="0 0 160 44" preserveAspectRatio="none" aria-hidden="true">
                {exerciseBars.map((bar, i) => (
                  <rect
                    key={i}
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    rx="2"
                    className="mini-bar"
                  />
                ))}
                <line x1="0" x2="160" y1="12.04" y2="12.04" className="mini-rule" />
              </svg>
              <span className="mini-cap">Exercise per day, 7 days</span>
            </div>
            <p className="why">Exercise, heart rate, HRV</p>
          </li>

          {/* Tile 5: Environment */}
          <li
            id="hz-E"
            className={`glass tile st-${hazardStatuses.E} ${hoveredHazard === 'E' ? 'is-focused' : ''}`}
            tabIndex={0}
            onMouseEnter={() => setHoveredHazard('E')}
            onMouseLeave={() => setHoveredHazard(null)}
            onFocus={() => setHoveredHazard('E')}
            onBlur={() => setHoveredHazard(null)}
          >
            <header>
              <span className={`hz st-${hazardStatuses.E}`} title="RIDGE E">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12.8 19.6A2 2 0 1 0 14 16H2" />
                  <path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" />
                  <path d="M9.8 4.4A2 2 0 1 1 11 8H2" />
                </svg>
              </span>
              <h2>Environment</h2>
              <span className={`badge st-${hazardStatuses.E}`}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="m16 9-5.5 5.5L8 12" />
                </svg>
                {hazardStatuses.E.toUpperCase()}
              </span>
            </header>
            <p className="val">
              <b>{co2Val}</b> <small>mmHg</small>
              <span className="delta">{Number(co2Sigma) >= 0 ? `+${co2Sigma}` : co2Sigma}σ</span>
            </p>
            <p className="lbl">Cabin CO₂</p>
            <div className="mini-box">
              <svg className="mini" viewBox="0 0 160 44" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" x2="160" y1="11.54" y2="11.54" className="mini-limit" />
                <path d={co2Trend} className="mini-line" />
              </svg>
              <span className="mini-cap">CO₂, 48 h, against the 3.0 mmHg limit</span>
            </div>
            <p className="why">CO₂, SpO₂, temperature, noise</p>
          </li>
        </ul>
      </div>
    </div>
  );
};
