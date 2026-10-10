import React, { useState, useEffect, useMemo } from 'react';
import './AlertsPage.css';
import { CREW_MEMBERS } from '../components/HealthTelemetryView';

export interface AlertStep {
  text: string;
  done: boolean;
}

export interface AlertEvidence {
  source: string;
  id: string;
  title: string;
  why: string;
  url: string;
}

export interface AlertTimelineEvent {
  ts: string;
  kind: 'opened' | 'escalated' | 'eased' | 'step' | 'done' | 'resolved';
  label: string;
}

export interface CrewAlert {
  id: string;
  crewId: string;
  metric: string;
  title: string;
  hazard: 'cardiovascular' | 'environment' | 'radiation' | 'decompression' | 'sleep' | 'toxin';
  status: 'act' | 'watch' | 'resolved';
  peakStatus: 'act' | 'watch';
  openedAt: string;
  resolvedAt?: string;
  explanation: string;
  z: number;
  series: number[];
  evidence: AlertEvidence[];
  steps: AlertStep[];
  timeline: AlertTimelineEvent[];
}

const INITIAL_ALERTS: CrewAlert[] = [
  // ─── 1. COMMANDER HALEY (AST-01) ───
  {
    id: 'ALT-H01',
    crewId: 'AST-01_COMMANDER',
    metric: 'hr',
    title: 'Exertion Supraventricular Tachycardia & Arrhythmia Risk',
    hazard: 'cardiovascular',
    status: 'act',
    peakStatus: 'act',
    openedAt: 'T+00:14:22',
    explanation: 'Heart rate spiked to 148 bpm during cycle ergometer exercise with persistent premature ventricular complexes (PVCs) and prolonged Fridericia QTc (482 ms). Exceeds 2.8σ from resting cardiovascular baseline.',
    z: 2.8,
    series: [72, 74, 76, 85, 112, 134, 148, 146, 141, 132, 124],
    evidence: [
      {
        source: 'NASA NTRS',
        id: '20170005625',
        title: 'Risk of Cardiac Rhythm Problems During Spaceflight',
        why: 'Human Research Program clinical evidence linking microgravity autonomic shifts to exertion dysrhythmias.',
        url: 'https://ntrs.nasa.gov/citations/20170005625',
      },
      {
        source: 'NASA OSDR',
        id: 'OSD-484 · doi:10.26030/semj-9y19',
        title: 'Astronauts plasma-derived exosomes induced gene expression in AC16 cells',
        why: 'Post-flight human plasma exosome alterations modulate cardiac muscle electrophysiology and stress signaling.',
        url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-484',
      },
    ],
    steps: [
      { text: 'Halt cycle ergometer exercise immediately and transition to active seated cooldown', done: true },
      { text: 'Capture diagnostic 12-lead ECG telemetry via Bio-Monitor garment', done: true },
      { text: 'Oral electrolyte fluid rehydration protocol (500 mL balanced oral rehydration solution)', done: false },
      { text: 'Notify Medical Officer and re-evaluate cardiac rhythm in 15 minutes', done: false },
    ],
    timeline: [
      { ts: 'T+00:14:22', kind: 'opened', label: 'Opened as ACT (148 bpm, PVC bursts)' },
      { ts: 'T+00:16:05', kind: 'step', label: 'Step done: Halt cycle ergometer exercise' },
      { ts: 'T+00:18:40', kind: 'step', label: 'Step done: Capture 12-lead ECG telemetry' },
    ],
  },
  {
    id: 'ALT-H02',
    crewId: 'AST-01_COMMANDER',
    metric: 'sleep',
    title: 'Circadian Desynchronization & Rest Latency Deficit',
    hazard: 'sleep',
    status: 'watch',
    peakStatus: 'watch',
    openedAt: 'T+00:46:10',
    explanation: 'Total sleep duration recorded at 4.6 hours over last sleep block with marked REM suppression (11%). Psychomotor vigilance test (PVT) reaction latency degraded by 16%.',
    z: 1.8,
    series: [7.4, 7.1, 6.8, 6.2, 5.4, 4.8, 4.6],
    evidence: [
      {
        source: 'NASA NTRS',
        id: '20160003864',
        title: 'Risk of Performance Decrements Resulting from Sleep Loss and Circadian Desynchronization',
        why: 'Human Research Program quantified decrements in cognitive speed and operational error margins from acute sleep loss.',
        url: 'https://ntrs.nasa.gov/citations/20160003864',
      },
    ],
    steps: [
      { text: 'Dim sleep quarters ambient lighting to blue-depleted circadian rest spectrum (<480 nm)', done: true },
      { text: 'Schedule 45-minute tactical sleep nap opportunity prior to docking window', done: false },
      { text: 'Review mission timeline and reschedule high-cognitive operational tasks', done: false },
    ],
    timeline: [
      { ts: 'T+00:46:10', kind: 'opened', label: 'Opened as WATCH (4.6 hrs sleep recorded)' },
      { ts: 'T+00:49:12', kind: 'step', label: 'Step done: Dim sleep quarters ambient lighting' },
    ],
  },

  // ─── 2. PILOT CHRIS (AST-02) ───
  {
    id: 'ALT-C01',
    crewId: 'AST-02_PILOT',
    metric: 'decompression',
    title: 'Hypobaric Cabin Decompression & Arterial Hypoxia Alert',
    hazard: 'decompression',
    status: 'act',
    peakStatus: 'act',
    openedAt: 'T+00:08:14',
    explanation: 'Cabin atmospheric pressure experienced a transient drop to 92.4 kPa with concurrent peripheral arterial oxygen saturation (SpO₂) dipping to 91%. Risk of venous gas emboli (VGE) formation.',
    z: 3.2,
    series: [98, 98, 97, 95, 93, 91, 91],
    evidence: [
      {
        source: 'NASA NTRS',
        id: '20160012725',
        title: 'ISS Hypobaric Cabin Environment and Physiological Decompression Sentry Guidelines',
        why: 'Threshold criteria for arterial hypoxia onset and venous gas bubble formation during atmospheric leaks.',
        url: 'https://ntrs.nasa.gov/citations/20160012725',
      },
    ],
    steps: [
      { text: 'Don emergency Quick-Don oxygen mask with 100% O2 delivery', done: true },
      { text: 'Verify pilot console pressure seal and lock forward hatch bulkhead', done: true },
      { text: 'Engage cabin automated N2 repressurization valve banks', done: true },
      { text: 'Perform precordial Doppler ultrasound assessment for venous gas emboli', done: false },
    ],
    timeline: [
      { ts: 'T+00:08:14', kind: 'opened', label: 'Opened as ACT (92.4 kPa, SpO2 91%)' },
      { ts: 'T+00:09:02', kind: 'step', label: 'Step done: Don emergency Quick-Don oxygen mask' },
      { ts: 'T+00:10:45', kind: 'step', label: 'Step done: Lock forward hatch bulkhead' },
      { ts: 'T+00:12:10', kind: 'step', label: 'Step done: Engage N2 repressurization valve banks' },
    ],
  },
  {
    id: 'ALT-C02',
    crewId: 'AST-02_PILOT',
    metric: 'co2',
    title: 'Elevated Cabin Carbon Dioxide Sentry (3.4 mmHg)',
    hazard: 'environment',
    status: 'watch',
    peakStatus: 'watch',
    openedAt: 'T+00:27:50',
    explanation: 'Cabin CO₂ partial pressure reached 3.4 mmHg due to desiccant bed bypass during CDRA cycle regeneration. Pilot reports mild bilateral headache.',
    z: 2.1,
    series: [1.8, 2.0, 2.4, 2.8, 3.2, 3.4],
    evidence: [
      {
        source: 'NASA NTRS',
        id: '20160012725',
        title: 'Relationship Between Carbon Dioxide Levels and Reported Congestion/Headaches on ISS',
        why: 'Elevated crew headache odds ratio observed when spacecraft CO2 exceeds 3.0 mmHg.',
        url: 'https://ntrs.nasa.gov/citations/20160012725',
      },
    ],
    steps: [
      { text: 'Switch Carbon Dioxide Removal Assembly (CDRA) to high-throughput desorption cycle', done: true },
      { text: 'Inspect backup LiOH canister bed seals in Service Module', done: false },
      { text: 'Boost inter-module ventilation (IMV) circulation fan velocity', done: false },
    ],
    timeline: [
      { ts: 'T+00:27:50', kind: 'opened', label: 'Opened as WATCH (CO2 at 3.4 mmHg)' },
      { ts: 'T+00:30:15', kind: 'step', label: 'Step done: Switch CDRA to high-throughput cycle' },
    ],
  },

  // ─── 3. DR. SIAN (AST-03) ───
  {
    id: 'ALT-S01',
    crewId: 'AST-03_MEDICAL',
    metric: 'dose',
    title: 'Solar Particle Event (SPE) High-Energy Radiation Flux',
    hazard: 'radiation',
    status: 'act',
    peakStatus: 'act',
    openedAt: 'T+00:22:05',
    explanation: 'External active dosimeters detected coronal mass ejection proton stream exceeding 1.8 mSv/h. Radiation Severity Index (RSI) elevated to 0.82 with cumulative organ exposure hazard.',
    z: 3.5,
    series: [0.04, 0.05, 0.14, 0.58, 1.25, 1.78, 1.82],
    evidence: [
      {
        source: 'NASA OSDR',
        id: 'OSD-993 · doi:10.26030/4kkv-z246',
        title: 'Space radiation induces distinct senescent phenotypes: Implications for space travel',
        why: 'Heavy particle radiation exposure triggers cellular senescence and DNA strand double-breaks in human hematopoiesis.',
        url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-993',
      },
    ],
    steps: [
      { text: 'Broadcast vessel-wide Radiation Shelter relocation alert to all modules', done: true },
      { text: 'Muster crew in central polyethylene/water-shielded Storm Haven shelter', done: true },
      { text: 'Distribute prophylactic radioprotective oral antioxidant formulation', done: false },
      { text: 'Lock external EVA airlock hatches and power down unshielded sensors', done: false },
    ],
    timeline: [
      { ts: 'T+00:22:05', kind: 'opened', label: 'Opened as ACT (SPE flux 1.82 mSv/h)' },
      { ts: 'T+00:23:18', kind: 'step', label: 'Step done: Broadcast vessel-wide shelter alert' },
      { ts: 'T+00:25:40', kind: 'step', label: 'Step done: Muster crew in central Storm Haven' },
    ],
  },

  // ─── 4. SPECIALIST LEO (AST-04) ───
  {
    id: 'ALT-L01',
    crewId: 'AST-04_ENGINEER',
    metric: 'environment',
    title: 'External Thermal Loop Ammonia (NH₃) Vapor Breakthrough',
    hazard: 'toxin',
    status: 'act',
    peakStatus: 'act',
    openedAt: 'T+00:11:30',
    explanation: 'Internal atmosphere sensors detected 28 ppm trace ammonia vapor following secondary thermal control loop valve cycle. Severe respiratory and eye mucosal irritation hazard.',
    z: 3.9,
    series: [0, 0, 1, 6, 14, 22, 28],
    evidence: [
      {
        source: 'NASA NTRS',
        id: '20160012725',
        title: 'Emergency Ammonia Isolation and Atmospheric Decontamination Protocols',
        why: 'Guidelines for anhydrous ammonia breakthrough containment and catalytic air scrubber regeneration.',
        url: 'https://ntrs.nasa.gov/citations/20160012725',
      },
    ],
    steps: [
      { text: 'Don Emergency Escape Breathing Apparatus (EEBA) mask immediately', done: true },
      { text: 'Isolate module ventilation dampers and seal node inter-hatch', done: true },
      { text: 'Engage Trace Contaminant Control System (TCCS) charcoal scrubbing beds', done: false },
      { text: 'Verify zero-leak isolation across thermal loop heat exchanger manifold', done: false },
    ],
    timeline: [
      { ts: 'T+00:11:30', kind: 'opened', label: 'Opened as ACT (28 ppm NH3 detected)' },
      { ts: 'T+00:12:15', kind: 'step', label: 'Step done: Don EEBA mask immediately' },
      { ts: 'T+00:14:00', kind: 'step', label: 'Step done: Isolate module ventilation dampers' },
    ],
  },
];

const RESOLVED_HISTORY: CrewAlert[] = [
  {
    id: 'ALT-RES-01',
    crewId: 'AST-01_COMMANDER',
    metric: 'cardiovascular',
    title: 'Space Motion Sickness (SMS) Acute Neurovestibular Adaptation',
    hazard: 'cardiovascular',
    status: 'resolved',
    peakStatus: 'act',
    openedAt: 'T-04:12:00',
    resolvedAt: 'T-02:15:00',
    explanation: 'Acute cephalic fluid shift and vestibular mismatch induced transient motion discomfort following insertion. Controlled via Promethazine countermeasure.',
    z: 2.2,
    series: [100, 85, 70, 60, 45, 20, 10],
    evidence: [],
    steps: [
      { text: 'Intramuscular Promethazine countermeasure administration', done: true },
      { text: 'Head movement restriction protocol during orbital insertion', done: true },
    ],
    timeline: [
      { ts: 'T-04:12:00', kind: 'opened', label: 'Opened as ACT (Acute motion sickness)' },
      { ts: 'T-03:45:00', kind: 'step', label: 'Step done: Intramuscular Promethazine' },
      { ts: 'T-02:15:00', kind: 'resolved', label: 'Resolved, back within nominal range' },
    ],
  },
  {
    id: 'ALT-RES-02',
    crewId: 'AST-04_ENGINEER',
    metric: 'environment',
    title: 'Cabin Particulate HEPA Filtration Auto-Purge',
    hazard: 'environment',
    status: 'resolved',
    peakStatus: 'watch',
    openedAt: 'T-06:30:00',
    resolvedAt: 'T-04:45:00',
    explanation: 'Particulate sensor detected transient lunar simulant dust aerosolization (0.42 mg/m3) during cargo container transfer.',
    z: 1.6,
    series: [0.1, 0.2, 0.42, 0.35, 0.2, 0.08],
    evidence: [],
    steps: [
      { text: 'Activate high-velocity cabin HEPA air scrubber recirculator', done: true },
      { text: 'Inspect air intake filter seals', done: true },
    ],
    timeline: [
      { ts: 'T-06:30:00', kind: 'opened', label: 'Opened as WATCH (Particulate spike)' },
      { ts: 'T-04:45:00', kind: 'resolved', label: 'Resolved, back within nominal range' },
    ],
  },
];

interface AlertsPageViewProps {
  initialAstronautId?: string;
  onAstronautChange?: (astronautId: string) => void;
  onBackToDashboard?: () => void;
}

export const AlertsPageView: React.FC<AlertsPageViewProps> = ({
  initialAstronautId = 'AST-01_COMMANDER',
  onAstronautChange,
  onBackToDashboard,
}) => {
  const [selectedCrewId, setSelectedCrewId] = useState<string>(initialAstronautId);
  const [activeAlerts, setActiveAlerts] = useState<CrewAlert[]>(INITIAL_ALERTS);
  const [resolvedAlerts, setResolvedAlerts] = useState<CrewAlert[]>(RESOLVED_HISTORY);
  const [activeFilter, setActiveFilter] = useState<'all' | 'act' | 'watch' | 'resolved'>('all');
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState<boolean>(false);

  // Sync external astronaut ID change
  useEffect(() => {
    if (initialAstronautId && initialAstronautId !== selectedCrewId) {
      setSelectedCrewId(initialAstronautId);
    }
  }, [initialAstronautId]);

  const activeCrewMember = useMemo(() => {
    return CREW_MEMBERS.find((c) => c.id === selectedCrewId) || CREW_MEMBERS[0];
  }, [selectedCrewId]);

  // Filter alerts by currently active crew member
  const crewActiveAlerts = useMemo(() => {
    return activeAlerts.filter((a) => a.crewId === selectedCrewId && a.status !== 'resolved');
  }, [activeAlerts, selectedCrewId]);

  const crewResolvedAlerts = useMemo(() => {
    return resolvedAlerts.filter((a) => a.crewId === selectedCrewId);
  }, [resolvedAlerts, selectedCrewId]);

  // Filter list based on selected chip
  const displayedAlerts = useMemo(() => {
    if (activeFilter === 'resolved') return crewResolvedAlerts;
    if (activeFilter === 'act') return crewActiveAlerts.filter((a) => a.status === 'act');
    if (activeFilter === 'watch') return crewActiveAlerts.filter((a) => a.status === 'watch');
    return crewActiveAlerts;
  }, [activeFilter, crewActiveAlerts, crewResolvedAlerts]);

  // Select first alert by default if none selected or if selection no longer in list
  const currentAlert: CrewAlert | null = useMemo(() => {
    if (!displayedAlerts.length) return null;
    const found = displayedAlerts.find((a) => a.id === selectedAlertId);
    return found || displayedAlerts[0] || null;
  }, [displayedAlerts, selectedAlertId]);

  // Handle ticking checklist step
  const handleToggleStep = (alertId: string, stepIndex: number) => {
    setActiveAlerts((prev) =>
      prev.map((alert) => {
        if (alert.id !== alertId) return alert;
        const newSteps = [...alert.steps];
        const prevDone = newSteps[stepIndex].done;
        newSteps[stepIndex] = { ...newSteps[stepIndex], done: !prevDone };

        const newTimeline = [...alert.timeline];
        if (!prevDone) {
          newTimeline.push({
            ts: `T+${new Date().toISOString().substring(14, 19)}`,
            kind: 'step',
            label: `Step completed: ${newSteps[stepIndex].text.slice(0, 38)}...`,
          });
        }

        return {
          ...alert,
          steps: newSteps,
          timeline: newTimeline,
        };
      })
    );
  };

  // Handle "Done" button to acknowledge and resolve
  const handleResolveAlert = (alertId: string) => {
    const alertToResolve = activeAlerts.find((a) => a.id === alertId);
    if (!alertToResolve) return;

    const resolvedItem: CrewAlert = {
      ...alertToResolve,
      status: 'resolved',
      resolvedAt: `T+${new Date().toISOString().substring(14, 19)}`,
      timeline: [
        ...alertToResolve.timeline,
        {
          ts: `T+${new Date().toISOString().substring(14, 19)}`,
          kind: 'resolved',
          label: 'Action card executed · Alert resolved and logged',
        },
      ],
    };

    setActiveAlerts((prev) => prev.filter((a) => a.id !== alertId));
    setResolvedAlerts((prev) => [resolvedItem, ...prev]);
  };

  const getHazardIcon = (hazard: CrewAlert['hazard']) => {
    switch (hazard) {
      case 'cardiovascular':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff5a6e" stroke="#ff5a6e" strokeWidth="1.2">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        );
      case 'radiation':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff5a6e" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="2" />
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        );
      case 'decompression':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round">
            <path d="M12 4v8M12 7c-2 0-5 1-6 4v6c0 1.5 1.5 3 3 3h1c1.5 0 2-2 2-4V9" />
            <path d="M12 7c2 0 5 1 6 4v6c0 1.5-1.5 3-3 3h-1c-1.5 0-2-2-2-4V9" />
          </svg>
        );
      case 'sleep':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        );
      default:
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffc53d" strokeWidth="2" strokeLinecap="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
    }
  };

  // Sparkline generator for SVG trend graph
  const renderSparkline = (points: number[]) => {
    if (!points || points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const width = 500;
    const height = 90;
    const stepX = width / (points.length - 1);

    const coords = points.map((val, idx) => {
      const x = idx * stepX;
      const y = height - ((val - min) / range) * (height - 20) - 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const pathData = `M ${coords.join(' L ')}`;
    const lastCoord = coords[coords.length - 1].split(',');

    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="alertSparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff5a6e" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ff5a6e" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {/* Baseline Threshold Line */}
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="rgba(255, 255, 255, 0.15)"
          strokeDasharray="4 4"
          strokeWidth="1.2"
        />
        {/* Fill Area */}
        <path
          d={`${pathData} L ${width},${height} L 0,${height} Z`}
          fill="url(#alertSparkGrad)"
        />
        {/* Line */}
        <path
          d={pathData}
          fill="none"
          stroke="#ff5a6e"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Current Anomaly Point */}
        <circle
          cx={lastCoord[0]}
          cy={lastCoord[1]}
          r="4.5"
          fill="#ff5a6e"
          stroke="#ffffff"
          strokeWidth="2"
        />
      </svg>
    );
  };

  return (
    <div className="alerts-page-container">
      {/* ── TOP CREW SELECTION CAPSULE (SYNCED WITH FLIGHT HUD) ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onBackToDashboard && (
            <button
              type="button"
              className="btn ghost"
              onClick={onBackToDashboard}
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            >
              ← Back to HUD
            </button>
          )}
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            CREW SUBJECT SELECTION:
          </span>
        </div>

        {/* Sleek Pill Capsule Switcher matching AstroTopBar */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '999px',
            padding: '3px',
            gap: '4px',
          }}
        >
          {CREW_MEMBERS.map((c) => {
            const isSelected = c.id === selectedCrewId;
            const crewAlertsCount = activeAlerts.filter((a) => a.crewId === c.id && a.status !== 'resolved').length;
            const shortRole = c.id.includes('COMMANDER') ? 'CO' : c.id.includes('PILOT') ? 'FE' : c.id.includes('MEDICAL') ? 'MO' : 'PI';
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedCrewId(c.id);
                  onAstronautChange?.(c.id);
                  setSelectedAlertId(null);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: isSelected ? '4px 12px 4px 6px' : '4px 8px',
                  borderRadius: '999px',
                  border: 'none',
                  background: isSelected ? 'rgba(56, 189, 248, 0.18)' : 'transparent',
                  color: isSelected ? '#ffffff' : '#94a3b8',
                  boxShadow: isSelected ? 'inset 0 0 0 1px rgba(56, 189, 248, 0.45), 0 0 10px rgba(56, 189, 248, 0.2)' : 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.78rem',
                  fontWeight: isSelected ? 700 : 500,
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Micro Avatar thumbnail */}
                <img
                  src={c.avatar}
                  alt={c.name}
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: `1.5px solid ${crewAlertsCount > 0 ? '#ff5a6e' : '#3ddc97'}`,
                  }}
                />
                <span>{shortRole}</span>
                {isSelected && <span style={{ color: '#38bdf8' }}>{c.name.split(' ')[1]}</span>}
                {crewAlertsCount > 0 && (
                  <span
                    style={{
                      background: '#ff5a6e',
                      color: '#ffffff',
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      padding: '1px 5px',
                      borderRadius: '999px',
                      lineHeight: 1,
                    }}
                  >
                    {crewAlertsCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TOP SUMMARY BANNER ── */}
      <section className="alerts-summary-banner" aria-label="Alert summary">
        <h1>Alerts · {activeCrewMember.name}</h1>
        <p className="muted">
          {crewActiveAlerts.length === 0
            ? "No active alerts. All biomarkers and physiological telemetry are within this astronaut's personalized baseline."
            : `${crewActiveAlerts.length} active alert${crewActiveAlerts.length > 1 ? 's' : ''}, ordered by clinical urgency. Select an alert to inspect the physiological evidence, execute protocol action items, and acknowledge resolution.`}
        </p>
      </section>

      {/* ── MASTER-DETAIL LAYOUT ── */}
      <div className={`md ${isMobileDetailOpen && currentAlert ? 'show-detail' : ''}`}>
        {/* LEFT COLUMN: FILTER CHIPS & ACTIVE ALERTS LIST */}
        <div className="md-list">
          {/* Filter Chips */}
          <div role="group" aria-label="Filter alerts" className="chips">
            {[
              { id: 'all', label: 'All active', count: crewActiveAlerts.length },
              { id: 'act', label: 'Act', count: crewActiveAlerts.filter((a) => a.status === 'act').length },
              { id: 'watch', label: 'Watch', count: crewActiveAlerts.filter((a) => a.status === 'watch').length },
              { id: 'resolved', label: 'Resolved', count: crewResolvedAlerts.length },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`chip ${activeFilter === chip.id ? 'on' : ''}`}
                aria-pressed={activeFilter === chip.id}
                onClick={() => {
                  setActiveFilter(chip.id as any);
                  setSelectedAlertId(null);
                }}
              >
                {chip.label} <span className="mono">{chip.count}</span>
              </button>
            ))}
          </div>

          {/* List of Alerts */}
          {displayedAlerts.length === 0 ? (
            <p className="muted md-empty" style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
              {activeFilter === 'resolved' ? 'No resolved alerts in this mission block.' : 'No alerts match this filter criteria.'}
            </p>
          ) : (
            <ul className="alert-list" aria-label={activeFilter === 'resolved' ? 'Resolved alerts' : 'Active alerts'}>
              {displayedAlerts.map((al) => {
                const isSelected = currentAlert?.id === al.id;
                return (
                  <li key={al.id}>
                    <button
                      type="button"
                      className={`md-item st-${al.status} ${isSelected ? 'on' : ''}`}
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => {
                        setSelectedAlertId(al.id);
                        setIsMobileDetailOpen(true);
                      }}
                    >
                      {getHazardIcon(al.hazard)}
                      <span className="md-text">
                        <b>{al.title}</b>
                        <span className="mono muted">
                          {al.status === 'resolved'
                            ? `peaked ${al.peakStatus.toUpperCase()} · ${al.resolvedAt || al.openedAt}`
                            : `opened ${al.openedAt} · peak ${al.peakStatus.toUpperCase()}`}
                        </span>
                      </span>
                      <span className={`badge st-${al.status}`}>
                        {al.status.toUpperCase()}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* RIGHT COLUMN: DETAILED ACTION CARD & CLINICAL AUDIT PANEL */}
        <div className="md-detail">
          {currentAlert ? (
            <article className={`alert detail st-${currentAlert.status}`} aria-label={`${currentAlert.title}: ${currentAlert.status.toUpperCase()}`}>
              {/* Mobile Back Button */}
              <button
                type="button"
                className="btn ghost back-btn"
                onClick={() => setIsMobileDetailOpen(false)}
              >
                ← All alerts
              </button>

              <header>
                {getHazardIcon(currentAlert.hazard)}
                <h2>{currentAlert.title}</h2>
                <span className={`badge st-${currentAlert.status}`}>
                  {currentAlert.status.toUpperCase()}
                </span>
              </header>

              <p className="since">
                Opened {currentAlert.openedAt}
                {currentAlert.peakStatus !== currentAlert.status && ` · peaked at ${currentAlert.peakStatus.toUpperCase()}`}
                {currentAlert.status === 'resolved' && currentAlert.resolvedAt && ` · resolved ${currentAlert.resolvedAt}`}
              </p>

              {/* Why This Fired */}
              <section className="why-panel" aria-label="Why this fired">
                <h3 className="sec-title">Why this fired</h3>
                <p className="why">{currentAlert.explanation}</p>
                {currentAlert.z > 0 && (
                  <span className="sigma-chip">
                    {currentAlert.z.toFixed(1)}σ deviation from individual resting baseline
                  </span>
                )}

                {/* Real-time Metric Trend Sparkline */}
                {currentAlert.series.length > 1 && (
                  <div className="trend-mini-chart">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                      <span>TELEMETRY TIME SERIES ({currentAlert.metric.toUpperCase()})</span>
                      <span style={{ color: currentAlert.status === 'act' ? '#ff5a6e' : '#ffc53d' }}>
                        PEAK ANOMALY ⚡
                      </span>
                    </div>
                    {renderSparkline(currentAlert.series)}
                  </div>
                )}

                {/* NASA Evidence Base Citations */}
                {currentAlert.evidence.length > 0 && (
                  <div className="evidence">
                    <h4 className="evidence-title">
                      NASA Research Evidence{' '}
                      <span className="muted">· spaceflight peer-reviewed clinical context</span>
                    </h4>
                    <ul>
                      {currentAlert.evidence.map((ev) => (
                        <li key={ev.url}>
                          <a href={ev.url} target="_blank" rel="noopener noreferrer">
                            {ev.title}
                          </a>
                          <span className="ev-id">
                            {ev.source} · {ev.id}
                          </span>
                          <span style={{ color: '#94a3b8' }}>{ev.why}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {/* Action Card Protocol Checklist */}
              {(() => {
                const doneCount = currentAlert.steps.filter((s) => s.done).length;
                const totalCount = currentAlert.steps.length;
                const percent = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;
                const isResolved = currentAlert.status === 'resolved';

                return (
                  <fieldset className="steps" disabled={isResolved}>
                    <legend>
                      Action card · {doneCount} of {totalCount} steps executed
                    </legend>
                    <div className="steps-head">
                      {/* Circular Progress Ring Indicator */}
                      <span className="prog" aria-hidden="true">
                        <svg viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15" className="ring-track" />
                          <circle
                            cx="18"
                            cy="18"
                            r="15"
                            className="ring-fill"
                            pathLength={100}
                            strokeDasharray={`${percent} 100`}
                          />
                        </svg>
                        <b>{doneCount}/{totalCount}</b>
                      </span>
                    </div>

                    {currentAlert.steps.map((step, idx) => (
                      <label key={idx} className={`step ${step.done ? 'done' : ''}`}>
                        <input
                          type="checkbox"
                          checked={step.done}
                          onChange={() => handleToggleStep(currentAlert.id, idx)}
                          disabled={isResolved}
                        />
                        <span>{step.text}</span>
                      </label>
                    ))}
                  </fieldset>
                );
              })()}

              {/* Action Footer */}
              {currentAlert.status !== 'resolved' && (
                <div className="alert-foot">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => handleResolveAlert(currentAlert.id)}
                  >
                    Done · Acknowledge &amp; Log
                  </button>
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    The HELIOS Sentry engine continues monitoring and verifies recovery against personalized baselines.
                  </span>
                </div>
              )}

              {/* Historical Audit Timeline */}
              <section aria-label="Alert timeline" style={{ marginTop: '10px' }}>
                <h3 className="sec-title" style={{ marginBottom: '10px' }}>
                  Execution Timeline
                </h3>
                <ol className="timeline">
                  {currentAlert.timeline.map((event, idx) => (
                    <li key={idx} className={`tl-${event.kind}`}>
                      <span className="tl-dot" aria-hidden="true" />
                      <span>{event.label}</span>
                      <span className="mono">{event.ts}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </article>
          ) : (
            <div style={{ padding: '32px', textAlign: 'center', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <p className="muted" style={{ margin: 0 }}>
                Select an alert from the left list to review clinical rationale and execute protocol steps.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
