import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { TelemetryPacket, CrewFullLabProfile, AlertPayload } from '../types/telemetry';
import { fetchCrewLabProfile } from '../services/labAssayService';
import { HeaderBar } from './HeaderBar';
import { evaluateCrewClinicalSummary, computeBiomarkerDelta, getBiomarkerCadence } from '../utils/clinicalPrioritization';
import { useStabilizedClinicalSummary } from '../hooks/useStabilizedClinicalSummary';
import { usePeriodicCadence } from '../hooks/usePeriodicCadence';
import { InlineTrendDrawer } from './clinical/InlineTrendDrawer';
import { DeepAnalysisModal } from './clinical/DeepAnalysisModal';
import { ClinicalTimeline } from './clinical/ClinicalTimeline';
import { ClinicalIntelligenceDrawer } from './clinical/ClinicalIntelligenceDrawer';

interface HealthTelemetryViewProps {
  initialAstronautId?: string | null;
  telemetryMap: Record<string, TelemetryPacket>;
  onClose: () => void;
  marsDelay: boolean;
  connected?: boolean;
  onToggleMarsDelay?: (enabled: boolean) => void;
  activeView?: 'HUD' | 'HEALTH_TELEMETRY' | 'MCC' | 'SCANNER' | 'MCC_TELEMETRY';
  onSelectView?: (view: 'HUD' | 'HEALTH_TELEMETRY' | 'MCC' | 'SCANNER' | 'MCC_TELEMETRY') => void;
  latestAlert?: AlertPayload | null;
  onAstronautChange?: (astronautId: string) => void;
}

interface CrewMeta {
  id: string;
  name: string;
  role: string;
  age: number;
  callsign: string;
  avatar: string;
  subjectId: string;
  roleShort: string;
}

export const CREW_MEMBERS: CrewMeta[] = [
  { id: 'AST-01_COMMANDER', name: 'Cmndr Haley', role: 'Mission Commander', age: 38, callsign: 'HALEY', avatar: '/crew/haley.jpg', subjectId: 'C001', roleShort: 'CDR' },
  { id: 'AST-02_PILOT', name: 'Pilot Chris', role: 'Flight Pilot', age: 42, callsign: 'CHRIS', avatar: '/crew/chris.jpg', subjectId: 'C002', roleShort: 'PLT' },
  { id: 'AST-03_MEDICAL', name: 'Dr. Sian', role: 'Medical Specialist', age: 29, callsign: 'SIAN', avatar: '/crew/sian.jpg', subjectId: 'C003', roleShort: 'MED' },
  { id: 'AST-04_ENGINEER', name: 'Specialist Leo', role: 'Systems Engineer', age: 45, callsign: 'LEO', avatar: '/crew/leo.jpg', subjectId: 'C004', roleShort: 'ENG' },
];

export interface CrewBaselineAndLabProfile {
  // Baseline Vitals from NASA Spaceflight Baselines
  restHr: number;
  restHrv: number;
  restSpo2: number;
  restTemp: number;
  restSleep: number;
  // Authentic NASA OSDR Inspiration4 Laboratory Values (OSD-569 CBC, OSD-575 CMP, CV, Immune)
  wbc: number; // k/μL
  hct: number; // %
  plt: number; // k/μL
  hgb: number; // g/dL
  rbc: number; // M/μL
  na: number; // mmol/L
  k: number; // mmol/L
  glu: number; // mg/dL
  bun: number; // mg/dL
  cr: number; // mg/dL
  alb: number; // g/dL
  alt: number; // U/L
  ast: number; // U/L
  crp: number; // mg/L
  fibrinogen: number; // mg/dL
  tnf: number; // pg/mL
  il6: number; // pg/mL
  ifn: number; // pg/mL
  il1b: number; // pg/mL
}

export const NASA_OSDR_PROFILES: Record<string, CrewBaselineAndLabProfile> = {
  'AST-01_COMMANDER': {
    restHr: 62.0,
    restHrv: 65.0,
    restSpo2: 98.2,
    restTemp: 36.80,
    restSleep: 86.0,
    wbc: 5.0,
    hct: 43.6,
    plt: 227.0,
    hgb: 14.7,
    rbc: 4.84,
    na: 138.0,
    k: 4.40,
    glu: 90.0,
    bun: 18.0,
    cr: 1.12,
    alb: 4.9,
    alt: 9.0,
    ast: 16.0,
    crp: 1.06,
    fibrinogen: 260.0,
    tnf: 75.8,
    il6: 6.86,
    ifn: 3.4,
    il1b: 58.0,
  },
  'AST-02_PILOT': {
    restHr: 58.0,
    restHrv: 72.0,
    restSpo2: 98.5,
    restTemp: 36.70,
    restSleep: 88.0,
    wbc: 5.5,
    hct: 36.4,
    plt: 252.0,
    hgb: 12.1,
    rbc: 4.02,
    na: 137.0,
    k: 3.50,
    glu: 83.0,
    bun: 20.0,
    cr: 0.95,
    alb: 4.4,
    alt: 16.0,
    ast: 23.0,
    crp: 0.93,
    fibrinogen: 200.0,
    tnf: 116.1,
    il6: 5.76,
    ifn: 3.1,
    il1b: 61.8,
  },
  'AST-03_MEDICAL': {
    restHr: 66.0,
    restHrv: 58.0,
    restSpo2: 98.0,
    restTemp: 36.90,
    restSleep: 82.0,
    wbc: 7.0,
    hct: 41.4,
    plt: 359.0,
    hgb: 13.5,
    rbc: 4.67,
    na: 137.0,
    k: 4.20,
    glu: 103.0,
    bun: 21.0,
    cr: 0.89,
    alb: 4.2,
    alt: 19.0,
    ast: 18.0,
    crp: 1.06,
    fibrinogen: 453.0,
    tnf: 724.2,
    il6: 7.60,
    ifn: 4.2,
    il1b: 65.1,
  },
  'AST-04_ENGINEER': {
    restHr: 64.0,
    restHrv: 61.0,
    restSpo2: 98.3,
    restTemp: 36.84,
    restSleep: 84.0,
    wbc: 8.1,
    hct: 48.3,
    plt: 240.0,
    hgb: 16.5,
    rbc: 5.55,
    na: 140.0,
    k: 4.00,
    glu: 97.0,
    bun: 26.0,
    cr: 1.15,
    alb: 4.5,
    alt: 40.0,
    ast: 48.0,
    crp: 1.77,
    fibrinogen: 419.0,
    tnf: 111.8,
    il6: 6.34,
    ifn: 3.6,
    il1b: 110.2,
  },
};

export const getAstronautOsdrProfile = (id: string): CrewBaselineAndLabProfile => {
  if (id === 'AST-03_MEDICAL_SPECIALIST') return NASA_OSDR_PROFILES['AST-03_MEDICAL'];
  if (id === 'AST-04_MISSION_SPECIALIST') return NASA_OSDR_PROFILES['AST-04_ENGINEER'];
  return NASA_OSDR_PROFILES[id] || NASA_OSDR_PROFILES['AST-01_COMMANDER'];
};

interface DeviceMeta {
  id: number;
  name: string;
  category: 'Wearable' | 'Environment' | 'Diagnostics' | 'Performance' | 'Research' | 'Computational';
  mode: 'CONTINUOUS' | 'ON DEMAND' | 'PERIODIC' | 'COMPUTED';
  status: 'Connected' | 'Ready' | 'Streaming' | 'Calibrated' | 'Standby' | 'Nominal' | 'External';
  signal: 'Excellent' | 'Good' | 'N/A';
  purpose: string;
  measures: string[];
  readings: [string, string][];
  usedBy: string[];
  updated: string;
  iconType: string;
}

const FLIGHT_DEVICES: DeviceMeta[] = [
  {
    id: 1, name: 'AstroSkin / Bio-Monitor Garment', category: 'Wearable', mode: 'CONTINUOUS', status: 'Connected', signal: 'Excellent',
    purpose: 'Multi-parameter physiological monitoring garment',
    measures: ['ECG', 'Heart Rate', 'HRV', 'Respiratory Rate', 'Skin Temperature', 'Activity'],
    readings: [['Heart Rate', '82 bpm'], ['Respiration', '16 /min'], ['Skin Temp', '33.2 °C'], ['Activity', 'Active']],
    usedBy: ['Cardiovascular', 'Respiratory', 'Temperature', 'Physical'],
    updated: '0.4 sec ago', iconType: 'astroskin',
  },
  {
    id: 2, name: 'LifeGuard / CPOD Module', category: 'Wearable', mode: 'CONTINUOUS', status: 'Connected', signal: 'Excellent',
    purpose: 'Autonomous multi-parameter sensor pod',
    measures: ['Heart Rate', 'SpO₂', 'Respiratory Rate', 'Skin Conductance'],
    readings: [['HR', '82 bpm'], ['SpO₂', '97%'], ['Resp Rate', '16 /min']],
    usedBy: ['Cardiovascular', 'Respiratory'],
    updated: '0.3 sec ago', iconType: 'lifeguard',
  },
  {
    id: 3, name: 'Wearable ECG Sensor', category: 'Wearable', mode: 'CONTINUOUS', status: 'Connected', signal: 'Excellent',
    purpose: 'Continuous cardiac electrical monitoring',
    measures: ['ECG', 'Heart Rate', 'Cardiac Rhythm', 'Arrhythmia Detection', 'HRV'],
    readings: [['Heart Rate', '82 bpm'], ['Rhythm', 'Normal Sinus'], ['QTc Trend', 'Normal'], ['Arrhythmia', 'None']],
    usedBy: ['Cardiovascular'],
    updated: '0.2 sec ago', iconType: 'ecg',
  },
  {
    id: 4, name: 'PPG / Pulse Oximeter', category: 'Wearable', mode: 'CONTINUOUS', status: 'Connected', signal: 'Good',
    purpose: 'Peripheral oxygenation and pulse monitoring',
    measures: ['SpO₂', 'Pulse Rate', 'Peripheral Perfusion', 'PPG Waveform'],
    readings: [['SpO₂', '97%'], ['Pulse', '81 bpm'], ['Perfusion Index', '3.8%'], ['Waveform', 'Stable']],
    usedBy: ['Cardiovascular', 'Respiratory'],
    updated: '0.5 sec ago', iconType: 'pulse-oximeter',
  },
  {
    id: 5, name: 'Blood-Pressure Monitor', category: 'Wearable', mode: 'CONTINUOUS', status: 'Connected', signal: 'Good',
    purpose: 'Arterial blood pressure measurement',
    measures: ['Systolic Pressure', 'Diastolic Pressure', 'Pulse Pressure'],
    readings: [['Blood Pressure', '118 / 76 mmHg'], ['Pulse', '80 bpm']],
    usedBy: ['Cardiovascular', 'Hydration'],
    updated: '0.8 sec ago', iconType: 'bp-monitor',
  },
  {
    id: 6, name: 'Respiratory (RIP) Belt', category: 'Wearable', mode: 'CONTINUOUS', status: 'Connected', signal: 'Good',
    purpose: 'Breathing pattern and respiratory-motion monitoring',
    measures: ['Respiratory Rate', 'Breathing Pattern', 'Ventilation Trend'],
    readings: [['Respiration', '16 /min'], ['Pattern', 'Regular'], ['Ventilation', 'Normal']],
    usedBy: ['Respiratory'],
    updated: '0.6 sec ago', iconType: 'respiratory-belt',
  },
  {
    id: 7, name: 'Core-Temperature Sensor', category: 'Wearable', mode: 'CONTINUOUS', status: 'Connected', signal: 'Excellent',
    purpose: 'Continuous deep body core temperature monitoring',
    measures: ['Core Temperature', 'Thermal Drift Rate', 'Heat Balance Equilibrium'],
    readings: [['Core Temp', '37.0 °C'], ['Trend', 'Stable'], ['Drift Rate', '0.0 °C/h']],
    usedBy: ['Temperature'],
    updated: '1.0 sec ago', iconType: 'core-temp',
  },
  {
    id: 8, name: 'EEG Headband System', category: 'Wearable', mode: 'CONTINUOUS', status: 'Connected', signal: 'Good',
    purpose: 'Brain electrical activity and sleep-state monitoring',
    measures: ['EEG', 'Neurological Pattern', 'Sleep Stage Data', 'Brain Rhythms'],
    readings: [['EEG Status', 'Normal'], ['Artifact Level', 'Low'], ['State', 'Awake']],
    usedBy: ['Neurological', 'Sleep / Fatigue'],
    updated: '0.7 sec ago', iconType: 'eeg-headband',
  },
  {
    id: 9, name: 'Actigraphy Sleep Tracker', category: 'Wearable', mode: 'CONTINUOUS', status: 'Connected', signal: 'Excellent',
    purpose: 'Sleep, activity and circadian cycle monitoring',
    measures: ['Sleep Duration', 'Sleep/Wake Pattern', 'Activity Level', 'Circadian Rhythm'],
    readings: [['Last Sleep', '6h 42m'], ['Sleep Score', '84%'], ['Circadian Shift', '+12 min'], ['Activity', 'Normal']],
    usedBy: ['Sleep / Fatigue', 'Physical'],
    updated: '2 sec ago', iconType: 'actigraphy',
  },
  {
    id: 10, name: 'Radiation Dosimeter (CAD)', category: 'Wearable', mode: 'CONTINUOUS', status: 'Connected', signal: 'Good',
    purpose: 'Personal GCR radiation dose monitoring',
    measures: ['Personal Radiation Dose', 'Dose Rate', 'Accumulated Mission Dose'],
    readings: [['Dose Rate', '0.04 mSv/h'], ['Mission Dose', '0.05 Gy'], ['Exposure Trend', 'Stable']],
    usedBy: ['Radiation'],
    updated: '0.8 sec ago', iconType: 'radiation',
  },
  {
    id: 11, name: 'Capnograph / Capnometer', category: 'Diagnostics', mode: 'ON DEMAND', status: 'Standby', signal: 'Good',
    purpose: 'Exhaled CO₂ and ventilation assessment',
    measures: ['EtCO₂', 'Respiratory Rate', 'Ventilation Pattern'],
    readings: [['EtCO₂', '38 mmHg'], ['Status', 'Standby mode']],
    usedBy: ['Respiratory'],
    updated: 'Standby', iconType: 'capnograph',
  },
  {
    id: 12, name: 'Orion ECLSS Environment', category: 'Environment', mode: 'CONTINUOUS', status: 'Connected', signal: 'Excellent',
    purpose: 'Spacecraft environmental-control and life-support telemetry',
    measures: ['Cabin Atmosphere', 'Pressure', 'O₂ Availability', 'CO₂ Control', 'Humidity'],
    readings: [['Cabin Pressure', '101.3 kPa'], ['Atmosphere', 'Nominal'], ['Humidity', '43%'], ['Life Support', 'Normal']],
    usedBy: ['Respiratory', 'Temperature'],
    updated: '0.2 sec ago', iconType: 'engine',
  },
  {
    id: 13, name: 'Cabin O₂ / CO₂ Sensors', category: 'Environment', mode: 'CONTINUOUS', status: 'Connected', signal: 'Excellent',
    purpose: 'Cabin oxygen and carbon-dioxide monitoring',
    measures: ['Cabin Oxygen Concentration', 'CO₂ Concentration', 'CO₂ Trend'],
    readings: [['Cabin O₂', '20.9%'], ['CO₂', '0.42%'], ['CO₂ Trend', 'Stable']],
    usedBy: ['Respiratory', 'Neurological'],
    updated: '0.2 sec ago', iconType: 'capnograph',
  },
  {
    id: 14, name: 'HERA Radiation Monitor', category: 'Environment', mode: 'CONTINUOUS', status: 'Connected', signal: 'Excellent',
    purpose: 'Cabin radiation monitoring and event detection',
    measures: ['Radiation Dose Rate', 'Cabin Radiation Level', 'Radiation Alert State'],
    readings: [['Dose Rate', 'Nominal'], ['Alert State', 'Normal'], ['Sensor Network', '6 active']],
    usedBy: ['Radiation'],
    updated: '0.3 sec ago', iconType: 'radiation',
  },
  {
    id: 15, name: 'PUMA Metabolic Analyzer', category: 'Performance', mode: 'ON DEMAND', status: 'Standby', signal: 'Good',
    purpose: 'Exercise and metabolic performance assessment',
    measures: ['VO₂ Max', 'VCO₂', 'Metabolic Rate', 'Energy Expenditure'],
    readings: [['Session', 'Inactive'], ['Latest VO₂', 'Normal']],
    usedBy: ['Metabolic', 'Physical'],
    updated: 'Standby', iconType: 'puma-metabolic',
  },
  {
    id: 16, name: 'Hematology Analyzer (CBC)', category: 'Diagnostics', mode: 'PERIODIC', status: 'Calibrated', signal: 'N/A',
    purpose: 'Complete blood count — all 20 morphology biomarkers',
    measures: ['WBC', 'RBC', 'Hemoglobin', 'Hematocrit', 'Platelets', 'Differential'],
    readings: [['WBC', '5.0 k/μL'], ['HCT', '43.6%'], ['PLT', '227 k/μL'], ['Last Sample', '13:42 UTC']],
    usedBy: ['Hematology', 'Immune'],
    updated: '54 min ago', iconType: 'hematology',
  },
  {
    id: 17, name: 'Clinical Chemistry Analyzer', category: 'Diagnostics', mode: 'PERIODIC', status: 'Calibrated', signal: 'N/A',
    purpose: 'Comprehensive metabolic panel — all 19 chemistry biomarkers',
    measures: ['Sodium', 'Potassium', 'Glucose', 'Creatinine', 'BUN', 'eGFR', 'Liver Enzymes'],
    readings: [['Sodium', '138 mmol/L'], ['Potassium', '4.4 mmol/L'], ['Glucose', '90 mg/dL'], ['Last Sample', '13:42 UTC']],
    usedBy: ['Metabolic', 'Cardiovascular'],
    updated: '54 min ago', iconType: 'chemistry',
  },
  {
    id: 18, name: 'Multiplex Immunoassay (71)', category: 'Diagnostics', mode: 'PERIODIC', status: 'Calibrated', signal: 'N/A',
    purpose: 'All 71 immune cytokines and growth factor markers',
    measures: ['IL-6', 'TNF-α', 'IFN-γ', 'IL-1β', '20 Chemokines', '17 Growth Factors'],
    readings: [['IL-6', '6.86 pg/mL'], ['TNF-α', '75.8 pg/mL'], ['Status', 'Calibrated']],
    usedBy: ['Immune', 'Inflammation'],
    updated: '54 min ago', iconType: 'immunoassay',
  },
  {
    id: 19, name: 'CV Protein Analyzer (OSD-575)', category: 'Diagnostics', mode: 'PERIODIC', status: 'Calibrated', signal: 'N/A',
    purpose: 'All 9 acute-phase cardiovascular protein markers',
    measures: ['CRP', 'Fibrinogen', 'L-selectin', 'PF4', 'Haptoglobin', 'SAP'],
    readings: [['CRP', '1.06 mg/L'], ['Fibrinogen', '260 mg/dL'], ['Status', 'Calibrated']],
    usedBy: ['Cardiovascular', 'Thrombosis'],
    updated: '54 min ago', iconType: 'cv-protein',
  },
  {
    id: 20, name: 'Z-Score Baseline Engine', category: 'Computational', mode: 'COMPUTED', status: 'Nominal', signal: 'N/A',
    purpose: 'Individualized Bayesian σ-drift biomarker evaluator',
    measures: ['Z-Score per Biomarker', 'Drift Rate', 'Gaussian Baseline Model'],
    readings: [['HRV σ-drift', '0.2 σ'], ['Status', 'Online']],
    usedBy: ['All Systems'],
    updated: 'Continuous', iconType: 'engine',
  },
  {
    id: 21, name: 'Fridericia QTc Engine', category: 'Computational', mode: 'COMPUTED', status: 'Nominal', signal: 'N/A',
    purpose: 'Rate-corrected QT interval arrhythmia evaluation',
    measures: ['QTc Interval', 'Arrhythmogenic Risk (ARF)', 'Rate Correction'],
    readings: [['QTc', '402 ms'], ['ARF Index', '0.72'], ['Risk', 'Nominal']],
    usedBy: ['Cardiovascular'],
    updated: 'Continuous', iconType: 'engine',
  },
  {
    id: 22, name: 'Thrombosis Risk Engine (TRM)', category: 'Computational', mode: 'COMPUTED', status: 'Nominal', signal: 'N/A',
    purpose: 'Virchow triad microgravity thrombosis risk model',
    measures: ['TRM Index', 'Venous Stasis Status', 'Hemoconcentration'],
    readings: [['TRM Index', '1.02'], ['Stasis', 'Normal'], ['Risk', 'Low']],
    usedBy: ['Thrombosis', 'Cardiovascular'],
    updated: 'Continuous', iconType: 'engine',
  },
  {
    id: 23, name: 'Bioimpedance System', category: 'Research', mode: 'PERIODIC', status: 'Ready', signal: 'Good',
    purpose: 'Fluid-status and body-composition estimation',
    measures: ['Body Water', 'Fluid Status', 'Body Composition Estimate'],
    readings: [['Body Water', '58%'], ['Fluid Status', 'Normal']],
    usedBy: ['Hydration', 'Physical'],
    updated: '38 min ago', iconType: 'puma-metabolic',
  },
];

/* ── PRECISE VECTOR ICONS IN UNIFIED AEROSPACE CYAN (#38bdf8) ──────────── */
const renderDeviceIcon = (iconType: string) => {
  const commonProps = {
    width: '18',
    height: '18',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#38bdf8',
    strokeWidth: '1.8',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: {
      flexShrink: 0,
      display: 'block' as const,
      filter: 'drop-shadow(0 0 3px rgba(56, 189, 248, 0.45))',
    },
  };

  switch (iconType) {
    case 'astroskin':
      return (
        <svg {...commonProps}>
          <path d="M7 3h10l3.5 5.5l-2.5 1.5l-1 -2v12h-14v-12l-1 2l-2.5 -1.5z" />
          <path d="M10 11h4" />
          <path d="M12 9v4" />
          <circle cx="12" cy="17" r="1" fill="#38bdf8" />
        </svg>
      );
    case 'lifeguard':
      return (
        <svg {...commonProps}>
          <rect x="5" y="4" width="14" height="16" rx="4" />
          <path d="M9 2h6v2h-6z" />
          <path d="M9 20h6v2h-6z" />
          <path d="M9 12h2l1 -2l2 4l1 -2h2" />
        </svg>
      );
    case 'spacewear':
      return (
        <svg {...commonProps}>
          <path d="M7 4l5 4l5 -4" />
          <path d="M6 8l6 5l6 -5" />
          <path d="M12 13v8" />
          <path d="M8 21h8" />
        </svg>
      );
    case 'ecg':
      return (
        <svg {...commonProps}>
          <path d="M3 12h4l2 -6l3 13l2.5 -9l1.5 4l1 -2h4" />
        </svg>
      );
    case 'pulse-oximeter':
      return (
        <svg {...commonProps}>
          <path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572" />
          <path d="M12 9v6" />
          <path d="M9 12h6" />
        </svg>
      );
    case 'bp-monitor':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="11" r="8" />
          <path d="M12 7v4l2.5 2.5" />
          <path d="M12 19v2a2 2 0 0 0 2 2h2" />
        </svg>
      );
    case 'respiratory-belt':
      return (
        <svg {...commonProps}>
          <path d="M2 13c2.5 0 3.5 -6 6.5 -6s4 12 7 12s4 -6 6.5 -6" />
          <circle cx="8.5" cy="7" r="1" fill="#38bdf8" />
          <circle cx="15.5" cy="19" r="1" fill="#38bdf8" />
        </svg>
      );
    case 'capnograph':
      return (
        <svg {...commonProps}>
          <path d="M4 12h7a3 3 0 0 1 3 3v1a3 3 0 0 0 3 3h3" />
          <circle cx="6" cy="12" r="2" fill="#38bdf8" />
          <path d="M4 8h10" />
          <path d="M4 16h6" />
        </svg>
      );
    case 'core-temp':
      return (
        <svg {...commonProps}>
          <path d="M10 13.5a4 4 0 1 0 4 0v-8.5a2 2 0 0 0 -4 0v8.5" />
          <circle cx="12" cy="17" r="1.5" fill="#38bdf8" />
          <path d="M17 7a3 3 0 0 1 0 4" />
          <path d="M19.5 5a6 6 0 0 1 0 8" />
        </svg>
      );
    case 'eeg-headband':
      return (
        <svg {...commonProps}>
          <path d="M4 14a8 8 0 0 1 16 0" />
          <path d="M3 14h3l1.5 -3l2 6l2 -4l1.5 2l2 -1h6" />
        </svg>
      );
    case 'actigraphy':
      return (
        <svg {...commonProps}>
          <rect x="6" y="5" width="12" height="14" rx="3" />
          <path d="M9 2h6v3h-6z" />
          <path d="M9 19h6v3h-6z" />
          <path d="M10 12l2 2l3 -3" />
        </svg>
      );
    case 'radiation':
      return (
        <svg {...commonProps}>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <circle cx="12" cy="13" r="1.5" fill="#38bdf8" />
          <path d="M12 9.5v2" />
          <path d="M9.5 15l1.5 -1" />
          <path d="M14.5 15l-1.5 -1" />
          <path d="M9 4V2h6v2" />
        </svg>
      );
    case 'puma-metabolic':
      return (
        <svg {...commonProps}>
          <rect x="4" y="6" width="16" height="14" rx="3" />
          <path d="M9 6v-3h6v3" />
          <path d="M8 12h8" />
          <path d="M8 15h5" />
          <circle cx="16" cy="15" r="1" fill="#38bdf8" />
        </svg>
      );
    case 'hematology':
      return (
        <svg {...commonProps}>
          <path d="M6 18h12" />
          <path d="M7 14h10" />
          <path d="M9 6a3 3 0 0 1 6 0v5h-6z" />
          <circle cx="12" cy="4" r="1" fill="#38bdf8" />
          <path d="M12 11v3" />
          <path d="M16 11a4 4 0 0 1 -4 4" />
        </svg>
      );
    case 'chemistry':
      return (
        <svg {...commonProps}>
          <path d="M9 3h6" />
          <path d="M10 3v5l-4 7.5a2 2 0 0 0 1.7 2.5h8.6a2 2 0 0 0 1.7 -2.5l-4 -7.5v-5" />
          <path d="M8 14h8" />
        </svg>
      );
    case 'immunoassay':
      return (
        <svg {...commonProps}>
          <path d="M12 13v7" />
          <path d="M12 13l-4 -5" />
          <path d="M12 13l4 -5" />
          <circle cx="8" cy="7" r="2" fill="#38bdf8" />
          <circle cx="16" cy="7" r="2" fill="#38bdf8" />
          <circle cx="12" cy="20" r="1.5" />
        </svg>
      );
    case 'cv-protein':
      return (
        <svg {...commonProps}>
          <path d="M12 21l-7 -7a5 5 0 0 1 7 -7a5 5 0 0 1 7 7l-7 7" />
          <path d="M12 10v4" />
          <path d="M10 12h4" />
        </svg>
      );
    case 'engine':
    default:
      return (
        <svg {...commonProps}>
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <path d="M9 2v4" />
          <path d="M15 2v4" />
          <path d="M9 18v4" />
          <path d="M15 18v4" />
          <path d="M2 9h4" />
          <path d="M2 15h4" />
          <path d="M18 9h4" />
          <path d="M18 15h4" />
          <circle cx="12" cy="12" r="2" fill="#38bdf8" />
        </svg>
      );
  }
};

/* ── AUTHENTIC PHYSIOLOGICAL NOISE & SPARKLINE HISTORY GENERATOR ────────── */
const gaussianNoise = (scale: number = 1.0) => {
  const g = (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;
  return g * scale;
};

// Lead-II ECG voltage synthesis (P-QRS-T complex) based on NASA-STD-3001 cardiovascular telemetry
function calcLeadII(phi: number): number {
  phi = phi - Math.floor(phi);
  let v = Math.sin(phi * Math.PI * 2) * 0.015;
  if (phi >= 0.10 && phi <= 0.24) {
    const n = (phi - 0.17) / 0.035;
    v += 0.18 * Math.exp(-n * n); // P wave
  }
  if (phi >= 0.27 && phi <= 0.31) {
    const n = (phi - 0.29) / 0.012;
    v -= 0.14 * Math.exp(-n * n); // Q wave
  }
  if (phi >= 0.29 && phi <= 0.35) {
    const n = (phi - 0.32) / 0.014;
    v += 1.05 * Math.exp(-n * n); // R spike
  }
  if (phi >= 0.33 && phi <= 0.39) {
    const n = (phi - 0.36) / 0.014;
    v -= 0.30 * Math.exp(-n * n); // S wave
  }
  if (phi >= 0.46 && phi <= 0.70) {
    const n = (phi - 0.58) / 0.065;
    v += 0.32 * Math.exp(-n * n); // T wave
  }
  return v;
}

function generateEcgWaveform(hr: number, phaseOffset: number = 0, count = 35): number[] {
  const points: number[] = [];
  const cycles = Math.max(1.2, Math.min(4.5, (hr / 60) * 1.8));
  for (let i = 0; i < count; i++) {
    const phi = phaseOffset + (i / (count - 1)) * cycles;
    const wander = Math.sin((phaseOffset + i / count) * 0.8) * 0.02;
    const v = calcLeadII(phi) + wander;
    points.push(Number(v.toFixed(3)));
  }
  return points;
}

const NOISE_PROFILES: Record<string, number> = {
  hr: 1.1,
  bp_sys: 2.0,
  arf: 0.015,
  qtc: 2.0,
  crp: 0.06,
  fibrinogen: 3.5,
  l_selectin: 6.0,
  pf4: 3.5,
  haptoglobin: 0.02,
  a2_macroglobulin: 0.03,
  agp: 0.02,
  fetuin_a36: 0.015,
  sap: 0.4,
  spo2: 0.20,
  rr: 0.40,
  etco2: 0.35,
  min_vent: 0.18,
  temp: 0.025,
  skin_temp: 0.035,
  drift_rate: 0.015,
  sleep: 0.4,
  hrv: 1.2,
  z_hrv: 0.05,
  hct: 0.20,
  wbc: 0.12,
  plt: 2.5,
  hgb: 0.10,
  rbc: 0.04,
  abs_neutrophils: 35,
  neutrophils_pct: 0.5,
  abs_lymphocytes: 20,
  lymphocytes_pct: 0.4,
  abs_monocytes: 10,
  monocytes_pct: 0.25,
  abs_eosinophils: 5,
  eosinophils_pct: 0.1,
  abs_basophils: 2,
  basophils_pct: 0.04,
  mcv: 0.3,
  mch: 0.2,
  mchc: 0.25,
  rdw: 0.1,
  mpv: 0.1,
  na: 0.35,
  k: 0.035,
  glu: 1.1,
  bun: 0.3,
  creatinine: 0.02,
  calcium: 0.06,
  chloride: 0.4,
  co2_blood: 0.3,
  egfr: 1.0,
  total_protein: 0.08,
  albumin: 0.05,
  globulin: 0.04,
  alkaline_phosphatase: 0.8,
  alt: 0.5,
  ast: 0.5,
  total_bilirubin: 0.02,
  il6: 0.25,
  tnf: 0.15,
  ifn: 0.08,
  il1b: 0.04,
  rad_flux: 0.008,
  rad_dose: 0.0015,
  rsi: 0.015,
  alc: 0.035,
  trm: 0.015,
  epi: 0.01,
};

function createSyntheticHistory(baseVal: number, noiseScale: number, count = 35): number[] {
  const points: number[] = [];
  let curr = baseVal;
  for (let i = 0; i < count; i++) {
    curr += (baseVal - curr) * 0.18 + gaussianNoise(noiseScale);
    points.push(Number(curr.toFixed(3)));
  }
  return points;
}

/* ── MICRO SPARKLINE TRACE COMPONENT (MATCHING DEMO CONSOLE TAB ALGORITHM) ──── */
export const MicroSparkline: React.FC<{
  history?: number[];
  color: string;
  width?: number;
  height?: number;
  noGraph?: boolean;
}> = ({ history, color, width = 64, height = 18, noGraph = false }) => {
  if (noGraph || !history || history.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block' }}
      >
        <line
          x1="2"
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke="rgba(255, 255, 255, 0.30)"
          strokeWidth="1.2"
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const a = Math.min(...history);
  const b = Math.max(...history);
  const span = b - a;
  const pad = 2;
  const usableH = height - pad * 2;

  // When span is negligible (< 0.001), render a clean centered baseline
  const points = span < 0.001
    ? history
        .map((_, i) => {
          const px = ((i * (width - 4)) / (history.length - 1) + 2).toFixed(1);
          const py = (height / 2).toFixed(1);
          return `${px},${py}`;
        })
        .join(' ')
    : history
        .map((y, i) => {
          const px = ((i * (width - 4)) / (history.length - 1) + 2).toFixed(1);
          const py = (height - pad - ((y - a) / span) * usableH).toFixed(1);
          return `${px},${py}`;
        })
        .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ overflow: 'visible', display: 'block' }}
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        points={points}
      />
    </svg>
  );
};

export const FormattedMetricValue: React.FC<{
  value: string | number | undefined | null;
  style?: React.CSSProperties;
  unitStyle?: React.CSSProperties;
  numberStyle?: React.CSSProperties;
}> = ({ value, style, unitStyle, numberStyle }) => {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value);
  const tokens = str.split(/([+-]?\d+(?:\.\d+)?(?:[/-]\d+(?:\.\d+)?)?)/g);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', flexWrap: 'nowrap', ...style }}>
      {tokens.map((token, idx) => {
        if (!token) return null;
        const isNumeric = /^[+-]?\d+(?:\.\d+)?(?:[/-]\d+(?:\.\d+)?)?$/.test(token);
        if (isNumeric) {
          return (
            <span
              key={idx}
              style={{
                fontFamily: 'var(--hud-font-mono, monospace)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.02em',
                ...numberStyle,
              }}
            >
              {token}
            </span>
          );
        }
        return (
          <span
            key={idx}
            style={{
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontWeight: 500,
              fontSize: '0.74em',
              color: '#94a3b8',
              letterSpacing: '0.01em',
              marginLeft: token.startsWith(' ') ? '3px' : '2px',
              ...unitStyle,
            }}
          >
            {token.startsWith(' ') ? token.slice(1) : token}
          </span>
        );
      })}
    </span>
  );
};

export const HealthTelemetryView: React.FC<HealthTelemetryViewProps> = ({
  initialAstronautId,
  telemetryMap,
  onClose,
  marsDelay,
  connected,
  onToggleMarsDelay,
  activeView,
  onSelectView,
  latestAlert,
  onAstronautChange,
}) => {
  const [selectedId, setSelectedId] = useState<string>(
    initialAstronautId || 'AST-01_COMMANDER'
  );

  // Synchronize when parent route changes (e.g. back/forward navigation)
  useEffect(() => {
    if (initialAstronautId && initialAstronautId !== selectedId) {
      setSelectedId(initialAstronautId);
    }
  }, [initialAstronautId]);

  const [deviceFilter, setDeviceFilter] = useState<'All' | 'Wearable' | 'Environment' | 'Diagnostics' | 'Performance' | 'Research' | 'Computational'>('All');
  const [expandedDeviceId, setExpandedDeviceId] = useState<number | null>(null);
  const [isAnalysisDrawerOpen, setIsAnalysisDrawerOpen] = useState<boolean>(false);
  const [labProfile, setLabProfile] = useState<CrewFullLabProfile | null>(null);

  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [expandedBiomarkerKey, setExpandedBiomarkerKey] = useState<string | null>(null);
  const [deepAnalysisTarget, setDeepAnalysisTarget] = useState<{
    metricLabel: string;
    currentValue: string;
    unit: string;
    baselineValue?: number | string;
    history?: number[];
    dotColor: string;
    category: string;
  } | null>(null);
  const [isFastForwardCadence, setIsFastForwardCadence] = useState(false);
  const ecgPhaseRef = useRef<number>(0);
  const [immuneClusterTab, setImmuneClusterTab] = useState<
    'pyrogens' | 'interferons' | 'interleukins' | 'chemokines' | 'growth'
  >('pyrogens');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch authentic NASA OSDR lab profile on astronaut change
  useEffect(() => {
    let isMounted = true;
    fetchCrewLabProfile(selectedId).then((profile) => {
      if (isMounted && profile) {
        setLabProfile(profile);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [selectedId]);

  const currentPacket: TelemetryPacket | undefined = useMemo(() => {
    return (
      telemetryMap[selectedId] ||
      (selectedId === 'AST-03_MEDICAL' ? telemetryMap['AST-03_MEDICAL_SPECIALIST'] : undefined) ||
      (selectedId === 'AST-04_ENGINEER' ? telemetryMap['AST-04_MISSION_SPECIALIST'] : undefined)
    );
  }, [telemetryMap, selectedId]);

  const activeCrew = useMemo(() => {
    return CREW_MEMBERS.find((c) => c.id === selectedId) || CREW_MEMBERS[0];
  }, [selectedId]);

  const defaultProfile = useMemo(() => getAstronautOsdrProfile(selectedId), [selectedId]);

  // Real-time telemetry metrics with astronaut baseline fallbacks
  const hr = currentPacket?.heart_rate ?? defaultProfile.restHr;
  const hrv = currentPacket?.hrv_rmssd ?? defaultProfile.restHrv;
  const spo2 = currentPacket?.spo2 ?? defaultProfile.restSpo2;
  const temp = currentPacket?.core_temp ?? defaultProfile.restTemp;
  const co2 = currentPacket?.cabin_co2 ?? 1.8;
  const sleep = currentPacket?.sleep_score ?? defaultProfile.restSleep;

  // Active clinical scenario detection (only override authentic lab baseline when anomaly actively presents)
  const isHypokalemia = (currentPacket?.potassium !== undefined && (currentPacket.potassium < 3.3 || currentPacket.potassium > 5.5)) ||
    ((currentPacket?.scenario_phase?.includes('HYPOKALEMIA')) ?? false);
  const isInflammationSpike = (currentPacket?.il_6 !== undefined && currentPacket.il_6 > 12.0) ||
    ((currentPacket?.scenario_phase?.includes('AMMONIA') || currentPacket?.scenario_phase?.includes('SMOLDER') || currentPacket?.scenario_phase?.includes('SEPSIS')) ?? false);
  const isHematocritShift = (currentPacket?.hematocrit !== undefined && Math.abs(currentPacket.hematocrit - 44.2) > 4.5);

  // Authentic NASA OSDR lab biomarkers (OSD-569 CBC, OSD-575 CMP/CV/Immune) with scenario overrides
  const k: number = (isHypokalemia && currentPacket?.potassium !== undefined) ? currentPacket.potassium : (labProfile?.cmp?.potassium?.value ?? defaultProfile.k);
  const hct: number = (isHematocritShift && currentPacket?.hematocrit !== undefined) ? currentPacket.hematocrit : (labProfile?.cbc?.hematocrit?.value ?? defaultProfile.hct);
  const wbc: number = (isInflammationSpike && currentPacket?.wbc_count !== undefined) ? currentPacket.wbc_count : (labProfile?.cbc?.white_blood_cells?.value ?? defaultProfile.wbc);
  const il6: number = (isInflammationSpike && currentPacket?.il_6 !== undefined) ? currentPacket.il_6 : (labProfile?.immune?.clusters?.pyrogens_and_inflammatory?.il_6?.concentration_pg_ml ?? defaultProfile.il6);
  const plt: number = (currentPacket?.platelet_count !== undefined && Math.abs(currentPacket.platelet_count - 245) > 40)
    ? currentPacket.platelet_count
    : (labProfile?.cbc?.platelets?.value ?? defaultProfile.plt);
  const rawCvCrp = labProfile?.cardiovascular?.crp?.value;
  const scaledCvCrp = (rawCvCrp !== undefined && rawCvCrp !== null)
    ? (rawCvCrp > 1000 ? rawCvCrp / 1000000 : rawCvCrp)
    : defaultProfile.crp;
  const crp = isInflammationSpike && currentPacket?.crp
    ? currentPacket.crp
    : (isInflammationSpike ? scaledCvCrp : defaultProfile.crp);
  const qtc = currentPacket?.computed_qtc ?? 402.0;
  const arf = currentPacket?.computed_arf ?? 0.72;
  const trm = currentPacket?.computed_trm ?? 1.02;
  const rsi = currentPacket?.computed_rsi ?? 0.12;
  const radFlux = currentPacket?.radiation_flux ?? 0.04;
  const radDose = currentPacket?.radiation_dose_gy ?? 0.05;
  const alc = currentPacket?.lymphocyte_count ?? (labProfile?.cbc?.absolute_lymphocytes?.value ? (labProfile.cbc.absolute_lymphocytes.value / 1000) : 2.15);
  const severity = currentPacket?.evaluated_severity ?? 'NOMINAL';

  const sysBp = Math.round(116 + (hr - defaultProfile.restHr) * 0.25);
  const diaBp = Math.round(76 + (hr - defaultProfile.restHr) * 0.12);
  const bpValStr = `${sysBp}/${diaBp}`;
  const respRate = Math.round(13 + (hr > 100 ? 5 : hr > 80 ? 2 : 0) + (spo2 < 95 ? 4 : 0));

  // Authentic OSDR lab values with astronaut-specific fallbacks
  const sodiumVal = labProfile?.cmp?.sodium?.value !== undefined && labProfile?.cmp?.sodium?.value !== null
    ? `${Number(labProfile.cmp.sodium.value).toFixed(1)} mmol/L`
    : `${defaultProfile.na.toFixed(1)} mmol/L`;
  const glucoseVal = labProfile?.cmp?.glucose?.value !== undefined && labProfile?.cmp?.glucose?.value !== null
    ? `${Number(labProfile.cmp.glucose.value).toFixed(0)} mg/dL`
    : `${defaultProfile.glu.toFixed(0)} mg/dL`;
  const albuminVal = labProfile?.cmp?.albumin?.value !== undefined && labProfile?.cmp?.albumin?.value !== null
    ? `${Number(labProfile.cmp.albumin.value).toFixed(1)} g/dL`
    : `${defaultProfile.alb.toFixed(1)} g/dL`;
  const bunVal = labProfile?.cmp?.bun?.value !== undefined && labProfile?.cmp?.bun?.value !== null
    ? `${Number(labProfile.cmp.bun.value).toFixed(0)} mg/dL`
    : `${defaultProfile.bun.toFixed(0)} mg/dL`;
  const creatinineVal = labProfile?.cmp?.creatinine?.value !== undefined && labProfile?.cmp?.creatinine?.value !== null
    ? `${Number(labProfile.cmp.creatinine.value).toFixed(2)} mg/dL`
    : `${defaultProfile.cr.toFixed(2)} mg/dL`;
  const hgbVal = labProfile?.cbc?.hemoglobin?.value !== undefined && labProfile?.cbc?.hemoglobin?.value !== null
    ? `${Number(labProfile.cbc.hemoglobin.value).toFixed(1)} g/dL`
    : `${defaultProfile.hgb.toFixed(1)} g/dL`;
  const rbcVal = labProfile?.cbc?.red_blood_cells?.value !== undefined && labProfile?.cbc?.red_blood_cells?.value !== null
    ? `${Number(labProfile.cbc.red_blood_cells.value).toFixed(2)} M/μL`
    : `${defaultProfile.rbc.toFixed(2)} M/μL`;
  const tnfVal = labProfile?.immune?.clusters?.pyrogens_and_inflammatory?.tnf_alpha?.concentration_pg_ml !== undefined && labProfile?.immune?.clusters?.pyrogens_and_inflammatory?.tnf_alpha?.concentration_pg_ml !== null
    ? `${Number(labProfile.immune.clusters.pyrogens_and_inflammatory.tnf_alpha.concentration_pg_ml).toFixed(1)} pg/mL`
    : `${defaultProfile.tnf.toFixed(1)} pg/mL`;
  const rawFib = labProfile?.cardiovascular?.fibrinogen?.value;
  const fibValNum = (rawFib !== undefined && rawFib !== null && rawFib > 0)
    ? (rawFib > 1000 ? rawFib / 10 : rawFib)
    : defaultProfile.fibrinogen;
  const fibrinogenVal = `${Math.round(fibValNum)} mg/dL`;

  // Historical time-series buffers matching Demo/astronaut-telemetry/index.html console tab
  const [metricHistories, setMetricHistories] = useState<Record<string, number[]>>(() => ({
    hr: createSyntheticHistory(defaultProfile.restHr, 0.9),
    ecg: generateEcgWaveform(defaultProfile.restHr, 0, 35),
    bp_sys: createSyntheticHistory(114, 1.8),
    arf: createSyntheticHistory(0.72, 0.02),
    qtc: createSyntheticHistory(402.0, 2.2),
    crp: createSyntheticHistory(defaultProfile.crp, 0.08),
    spo2: createSyntheticHistory(defaultProfile.restSpo2, 0.15),
    rr: createSyntheticHistory(14, 0.4),
    etco2: createSyntheticHistory(38.0, 0.4),
    min_vent: createSyntheticHistory(7.3, 0.2),
    o2: createSyntheticHistory(20.9, 0.03),
    co2: createSyntheticHistory(1.8, 0.06),
    pressure: createSyntheticHistory(101.3, 0.05),
    ventilation: createSyntheticHistory(0.45, 0.02),
    temp: createSyntheticHistory(defaultProfile.restTemp, 0.03),
    skin_temp: createSyntheticHistory(defaultProfile.restTemp - 2.8, 0.03),
    cabin_temp: createSyntheticHistory(21.4, 0.04),
    drift_rate: createSyntheticHistory(0.0, 0.02),
    equilibrium: createSyntheticHistory(1.0, 0.02),
    sleep: createSyntheticHistory(defaultProfile.restSleep, 0.8),
    hrv: createSyntheticHistory(defaultProfile.restHrv, 1.2),
    neurological: createSyntheticHistory(98.0, 0.5),
    circadian: createSyntheticHistory(2.0, 0.05),
    z_hrv: createSyntheticHistory(0.2, 0.08),
    hct: createSyntheticHistory(defaultProfile.hct, 0.2),
    wbc: createSyntheticHistory(defaultProfile.wbc, 0.12),
    plt: createSyntheticHistory(defaultProfile.plt, 3.0),
    hgb: createSyntheticHistory(defaultProfile.hgb, 0.1),
    rbc: createSyntheticHistory(defaultProfile.rbc, 0.04),
    na: createSyntheticHistory(defaultProfile.na, 0.4),
    k: createSyntheticHistory(defaultProfile.k, 0.04),
    glu: createSyntheticHistory(defaultProfile.glu, 1.2),
    bun: createSyntheticHistory(defaultProfile.bun, 0.3),
    creatinine: createSyntheticHistory(defaultProfile.cr, 0.02),
    il6: createSyntheticHistory(defaultProfile.il6, 0.25),
    tnf: createSyntheticHistory(defaultProfile.tnf, 0.1),
    ifn: createSyntheticHistory(defaultProfile.ifn, 0.08),
    il1b: createSyntheticHistory(defaultProfile.il1b, 0.04),
    cytokines: createSyntheticHistory(71.0, 0.0),
    rad_flux: createSyntheticHistory(0.04, 0.01),
    rad_dose: createSyntheticHistory(0.05, 0.002),
    rsi: createSyntheticHistory(0.12, 0.02),
    alc: createSyntheticHistory(2.15, 0.05),
    dna_breaks: createSyntheticHistory(2.0, 0.4),
    trm: createSyntheticHistory(1.02, 0.02),
    fibrinogen: createSyntheticHistory(defaultProfile.fibrinogen, 3.5),
    l_selectin: createSyntheticHistory(740.0, 8.0),
    pf4: createSyntheticHistory(320.0, 4.0),
    // Dropdown CV Panel
    haptoglobin: createSyntheticHistory(1.10, 0.03),
    a2_macroglobulin: createSyntheticHistory(1.85, 0.04),
    agp: createSyntheticHistory(0.65, 0.02),
    fetuin_a36: createSyntheticHistory(0.38, 0.015),
    sap: createSyntheticHistory(24.5, 0.5),
    // Dropdown CBC Morphology
    abs_neutrophils: createSyntheticHistory(4200, 60),
    neutrophils_pct: createSyntheticHistory(62.0, 0.8),
    abs_lymphocytes: createSyntheticHistory(2100, 35),
    lymphocytes_pct: createSyntheticHistory(29.5, 0.6),
    abs_monocytes: createSyntheticHistory(480, 15),
    monocytes_pct: createSyntheticHistory(6.8, 0.3),
    abs_eosinophils: createSyntheticHistory(120, 8),
    eosinophils_pct: createSyntheticHistory(1.8, 0.1),
    abs_basophils: createSyntheticHistory(35, 3),
    basophils_pct: createSyntheticHistory(0.5, 0.05),
    mcv: createSyntheticHistory(89.0, 0.4),
    mch: createSyntheticHistory(30.2, 0.2),
    mchc: createSyntheticHistory(33.8, 0.25),
    rdw: createSyntheticHistory(12.4, 0.15),
    mpv: createSyntheticHistory(9.8, 0.12),
    // Dropdown CMP Panel
    calcium: createSyntheticHistory(9.4, 0.08),
    chloride: createSyntheticHistory(102.0, 0.5),
    co2_blood: createSyntheticHistory(26.0, 0.4),
    egfr: createSyntheticHistory(105.0, 1.2),
    total_protein: createSyntheticHistory(7.2, 0.1),
    albumin: createSyntheticHistory(4.4, 0.06),
    globulin: createSyntheticHistory(2.8, 0.05),
    alkaline_phosphatase: createSyntheticHistory(68.0, 1.0),
    alt: createSyntheticHistory(24.0, 0.6),
    ast: createSyntheticHistory(22.0, 0.5),
    total_bilirubin: createSyntheticHistory(0.6, 0.02),
    venous_stasis: createSyntheticHistory(1.0, 0.03),
    fluid_shift: createSyntheticHistory(-0.6, 0.02),
    epi: createSyntheticHistory(0.05, 0.01),
    diagnosis_conf: createSyntheticHistory(96.0, 0.5),
    directive_conf: createSyntheticHistory(98.5, 0.4),
    sentry_online: createSyntheticHistory(99.9, 0.05),
  }));

  // Dynamic cache for cytokine sparklines in the immune dropdown section
  const cytokineCacheRef = React.useRef<Record<string, number[]>>({});
  const getCytokineHistory = (name: string, baseVal: number) => {
    const key = `${selectedId}_${name}_${baseVal}`;
    if (!cytokineCacheRef.current[key]) {
      cytokineCacheRef.current[key] = createSyntheticHistory(baseVal, Math.max(baseVal * 0.04, 0.08));
    }
    return cytokineCacheRef.current[key];
  };

  // Re-seed histories when astronaut changes
  useEffect(() => {
    setMetricHistories({
      hr: createSyntheticHistory(hr, 0.9),
      ecg: generateEcgWaveform(hr, 0, 35),
      bp_sys: createSyntheticHistory(sysBp, 1.8),
      arf: createSyntheticHistory(arf, 0.02),
      qtc: createSyntheticHistory(qtc, 2.2),
      crp: createSyntheticHistory(crp, 0.08),
      spo2: createSyntheticHistory(spo2, 0.15),
      rr: createSyntheticHistory(respRate, 0.4),
      etco2: createSyntheticHistory(spo2 < 95 ? 43.0 : 38.0, 0.4),
      min_vent: createSyntheticHistory(respRate * 0.52, 0.2),
      o2: createSyntheticHistory(20.9, 0.03),
      co2: createSyntheticHistory(co2, 0.06),
      pressure: createSyntheticHistory(101.3, 0.05),
      ventilation: createSyntheticHistory(0.45, 0.02),
      temp: createSyntheticHistory(temp, 0.03),
      skin_temp: createSyntheticHistory(temp - 2.8, 0.03),
      cabin_temp: createSyntheticHistory(21.4, 0.04),
      drift_rate: createSyntheticHistory(temp >= 37.5 ? 0.4 : 0.0, 0.02),
      equilibrium: createSyntheticHistory(1.0, 0.02),
      sleep: createSyntheticHistory(sleep, 0.8),
      hrv: createSyntheticHistory(hrv, 1.2),
      neurological: createSyntheticHistory(98.0, 0.5),
      circadian: createSyntheticHistory(2.0, 0.05),
      z_hrv: createSyntheticHistory(Math.abs(currentPacket?.z_score_hrv ?? 0.2), 0.08),
      hct: createSyntheticHistory(hct, 0.2),
      wbc: createSyntheticHistory(wbc, 0.12),
      plt: createSyntheticHistory(plt, 3.0),
      hgb: createSyntheticHistory(labProfile?.cbc?.hemoglobin?.value ?? defaultProfile.hgb, 0.1),
      rbc: createSyntheticHistory(labProfile?.cbc?.red_blood_cells?.value ?? defaultProfile.rbc, 0.04),
      na: createSyntheticHistory(labProfile?.cmp?.sodium?.value ?? defaultProfile.na, 0.4),
      k: createSyntheticHistory(k, 0.04),
      glu: createSyntheticHistory(labProfile?.cmp?.glucose?.value ?? defaultProfile.glu, 1.2),
      bun: createSyntheticHistory(labProfile?.cmp?.bun?.value ?? defaultProfile.bun, 0.3),
      creatinine: createSyntheticHistory(labProfile?.cmp?.creatinine?.value ?? defaultProfile.cr, 0.02),
      il6: createSyntheticHistory(il6, 0.25),
      tnf: createSyntheticHistory(labProfile?.immune?.clusters?.pyrogens_and_inflammatory?.tnf_alpha?.concentration_pg_ml ?? defaultProfile.tnf, 0.1),
      ifn: createSyntheticHistory(defaultProfile.ifn, 0.08),
      il1b: createSyntheticHistory(defaultProfile.il1b, 0.04),
      cytokines: createSyntheticHistory(71.0, 0.0),
      rad_flux: createSyntheticHistory(radFlux, 0.01),
      rad_dose: createSyntheticHistory(radDose, 0.002),
      rsi: createSyntheticHistory(rsi, 0.02),
      alc: createSyntheticHistory(alc, 0.05),
      dna_breaks: createSyntheticHistory(radDose > 0.2 ? 12.0 : 2.0, 0.4),
      trm: createSyntheticHistory(trm, 0.02),
      fibrinogen: createSyntheticHistory(fibValNum, 3.5),
      l_selectin: createSyntheticHistory(740.0, 8.0),
      pf4: createSyntheticHistory(320.0, 4.0),
      // Dropdown CV Panel
      haptoglobin: createSyntheticHistory(labProfile?.cardiovascular?.haptoglobin?.value ? (labProfile.cardiovascular.haptoglobin.value / 1000000) : 1.10, 0.03),
      a2_macroglobulin: createSyntheticHistory(labProfile?.cardiovascular?.a2_macroglobulin?.value ? (labProfile.cardiovascular.a2_macroglobulin.value / 1000000) : 1.85, 0.04),
      agp: createSyntheticHistory(labProfile?.cardiovascular?.agp?.value ? (labProfile.cardiovascular.agp.value / 1000000) : 0.65, 0.02),
      fetuin_a36: createSyntheticHistory(labProfile?.cardiovascular?.fetuin_a36?.value ? (labProfile.cardiovascular.fetuin_a36.value / 1000000) : 0.38, 0.015),
      sap: createSyntheticHistory(labProfile?.cardiovascular?.sap?.value ? (labProfile.cardiovascular.sap.value / 1000) : 24.5, 0.5),
      // Dropdown CBC Morphology
      abs_neutrophils: createSyntheticHistory(labProfile?.cbc?.absolute_neutrophils?.value ?? 4200, 60),
      neutrophils_pct: createSyntheticHistory(labProfile?.cbc?.neutrophils_percent?.value ?? 62.0, 0.8),
      abs_lymphocytes: createSyntheticHistory(labProfile?.cbc?.absolute_lymphocytes?.value ?? 2100, 35),
      lymphocytes_pct: createSyntheticHistory(labProfile?.cbc?.lymphocytes_percent?.value ?? 29.5, 0.6),
      abs_monocytes: createSyntheticHistory(labProfile?.cbc?.absolute_monocytes?.value ?? 480, 15),
      monocytes_pct: createSyntheticHistory(labProfile?.cbc?.monocytes_percent?.value ?? 6.8, 0.3),
      abs_eosinophils: createSyntheticHistory(labProfile?.cbc?.absolute_eosinophils?.value ?? 120, 8),
      eosinophils_pct: createSyntheticHistory(labProfile?.cbc?.eosinophils_percent?.value ?? 1.8, 0.1),
      abs_basophils: createSyntheticHistory(labProfile?.cbc?.absolute_basophils?.value ?? 35, 3),
      basophils_pct: createSyntheticHistory(labProfile?.cbc?.basophils_percent?.value ?? 0.5, 0.05),
      mcv: createSyntheticHistory(labProfile?.cbc?.mcv?.value ?? 89.0, 0.4),
      mch: createSyntheticHistory(labProfile?.cbc?.mch?.value ?? 30.2, 0.2),
      mchc: createSyntheticHistory(labProfile?.cbc?.mchc?.value ?? 33.8, 0.25),
      rdw: createSyntheticHistory(labProfile?.cbc?.rdw?.value ?? 12.4, 0.15),
      mpv: createSyntheticHistory(labProfile?.cbc?.mpv?.value ?? 9.8, 0.12),
      // Dropdown CMP Panel
      calcium: createSyntheticHistory(labProfile?.cmp?.calcium?.value ?? 9.4, 0.08),
      chloride: createSyntheticHistory(labProfile?.cmp?.chloride?.value ?? 102.0, 0.5),
      co2_blood: createSyntheticHistory(labProfile?.cmp?.carbon_dioxide?.value ?? 26.0, 0.4),
      egfr: createSyntheticHistory(labProfile?.cmp?.egfr_non_african_american?.value ?? 105.0, 1.2),
      total_protein: createSyntheticHistory(labProfile?.cmp?.total_protein?.value ?? 7.2, 0.1),
      albumin: createSyntheticHistory(labProfile?.cmp?.albumin?.value ?? 4.4, 0.06),
      globulin: createSyntheticHistory(labProfile?.cmp?.globulin?.value ?? 2.8, 0.05),
      alkaline_phosphatase: createSyntheticHistory(labProfile?.cmp?.alkaline_phosphatase?.value ?? 68.0, 1.0),
      alt: createSyntheticHistory(labProfile?.cmp?.alt?.value ?? 24.0, 0.6),
      ast: createSyntheticHistory(labProfile?.cmp?.ast?.value ?? 22.0, 0.5),
      total_bilirubin: createSyntheticHistory(labProfile?.cmp?.total_bilirubin?.value ?? 0.6, 0.02),
      venous_stasis: createSyntheticHistory(trm > 1.3 ? 1.4 : 1.0, 0.03),
      fluid_shift: createSyntheticHistory(-0.6, 0.02),
      epi: createSyntheticHistory(currentPacket?.computed_epi ?? 0.05, 0.01),
      diagnosis_conf: createSyntheticHistory(96.0, 0.5),
      directive_conf: createSyntheticHistory(98.5, 0.4),
      sentry_online: createSyntheticHistory(99.9, 0.05),
    });
  }, [selectedId, labProfile]);

  // Live historical streaming update as telemetry updates
  useEffect(() => {
    if (!currentPacket) return;

    setMetricHistories((prev) => {
      const next: Record<string, number[]> = {};
      const stepVal = (key: string, targetVal: number) => {
        const hist = prev[key] || Array(35).fill(targetVal);
        const last = hist[hist.length - 1] ?? targetVal;
        const noiseScale = NOISE_PROFILES[key] ?? 0.04;
        // Authentic Ornstein-Uhlenbeck mean-reversion equation (from Demo line 164):
        // Pull strength = 0.22 towards current target value from packet, plus calibrated physiological noise
        const nextVal = last + (targetVal - last) * 0.22 + gaussianNoise(noiseScale);
        next[key] = [...hist.slice(-34), Number(nextVal.toFixed(3))];
      };

      // 1. Cardiovascular
      stepVal('hr', hr);
      ecgPhaseRef.current = (ecgPhaseRef.current + (hr / 60) * 0.09) % 1000;
      next['ecg'] = generateEcgWaveform(hr, ecgPhaseRef.current, 35);
      stepVal('bp_sys', sysBp);
      stepVal('arf', arf);
      stepVal('qtc', qtc);
      stepVal('crp', crp);
      stepVal('fibrinogen', fibValNum);
      stepVal('l_selectin', labProfile?.cardiovascular?.l_selectin?.value ? (labProfile.cardiovascular.l_selectin.value / 1000) : 740.0);
      stepVal('pf4', labProfile?.cardiovascular?.pf4?.value ? labProfile.cardiovascular.pf4.value : 320.0);
      stepVal('haptoglobin', labProfile?.cardiovascular?.haptoglobin?.value ? (labProfile.cardiovascular.haptoglobin.value / 1000000) : 1.10);
      stepVal('a2_macroglobulin', labProfile?.cardiovascular?.a2_macroglobulin?.value ? (labProfile.cardiovascular.a2_macroglobulin.value / 1000000) : 1.85);
      stepVal('agp', labProfile?.cardiovascular?.agp?.value ? (labProfile.cardiovascular.agp.value / 1000000) : 0.65);
      stepVal('fetuin_a36', labProfile?.cardiovascular?.fetuin_a36?.value ? (labProfile.cardiovascular.fetuin_a36.value / 1000000) : 0.38);
      stepVal('sap', labProfile?.cardiovascular?.sap?.value ? (labProfile.cardiovascular.sap.value / 1000) : 24.5);

      // 2. Pulmonary & Respiratory
      stepVal('spo2', spo2);
      stepVal('rr', respRate);
      stepVal('etco2', spo2 < 95 ? 43.0 : 38.0);
      stepVal('min_vent', respRate * 0.52);

      // 3. Thermoregulation
      stepVal('temp', temp);
      stepVal('skin_temp', temp - 2.8);
      stepVal('drift_rate', temp >= 37.5 ? 0.4 : 0.0);

      // 4. Neurological & Fatigue
      stepVal('sleep', sleep);
      stepVal('hrv', hrv);
      stepVal('z_hrv', Math.abs(currentPacket.z_score_hrv ?? 0.2));

      // 5. Hematology (OSD-569 CBC)
      stepVal('hct', hct);
      stepVal('wbc', wbc);
      stepVal('plt', plt);
      stepVal('hgb', labProfile?.cbc?.hemoglobin?.value ?? defaultProfile.hgb);
      stepVal('rbc', labProfile?.cbc?.red_blood_cells?.value ?? defaultProfile.rbc);
      stepVal('abs_neutrophils', labProfile?.cbc?.absolute_neutrophils?.value ?? 4200);
      stepVal('neutrophils_pct', labProfile?.cbc?.neutrophils_percent?.value ?? 62.0);
      stepVal('abs_lymphocytes', labProfile?.cbc?.absolute_lymphocytes?.value ?? 2100);
      stepVal('lymphocytes_pct', labProfile?.cbc?.lymphocytes_percent?.value ?? 29.5);
      stepVal('abs_monocytes', labProfile?.cbc?.absolute_monocytes?.value ?? 480);
      stepVal('monocytes_pct', labProfile?.cbc?.monocytes_percent?.value ?? 6.8);
      stepVal('abs_eosinophils', labProfile?.cbc?.absolute_eosinophils?.value ?? 120);
      stepVal('eosinophils_pct', labProfile?.cbc?.eosinophils_percent?.value ?? 1.8);
      stepVal('abs_basophils', labProfile?.cbc?.absolute_basophils?.value ?? 35);
      stepVal('basophils_pct', labProfile?.cbc?.basophils_percent?.value ?? 0.5);
      stepVal('mcv', labProfile?.cbc?.mcv?.value ?? 89.0);
      stepVal('mch', labProfile?.cbc?.mch?.value ?? 30.2);
      stepVal('mchc', labProfile?.cbc?.mchc?.value ?? 33.8);
      stepVal('rdw', labProfile?.cbc?.rdw?.value ?? 12.4);
      stepVal('mpv', labProfile?.cbc?.mpv?.value ?? 9.8);

      // 6. Metabolic & Chemistry (OSD-575 CMP)
      stepVal('na', labProfile?.cmp?.sodium?.value ?? defaultProfile.na);
      stepVal('k', k);
      stepVal('glu', labProfile?.cmp?.glucose?.value ?? defaultProfile.glu);
      stepVal('bun', labProfile?.cmp?.bun?.value ?? defaultProfile.bun);
      stepVal('creatinine', labProfile?.cmp?.creatinine?.value ?? defaultProfile.cr);
      stepVal('calcium', labProfile?.cmp?.calcium?.value ?? 9.4);
      stepVal('chloride', labProfile?.cmp?.chloride?.value ?? 102.0);
      stepVal('co2_blood', labProfile?.cmp?.carbon_dioxide?.value ?? 26.0);
      stepVal('egfr', labProfile?.cmp?.egfr_non_african_american?.value ?? 105.0);
      stepVal('total_protein', labProfile?.cmp?.total_protein?.value ?? 7.2);
      stepVal('albumin', labProfile?.cmp?.albumin?.value ?? 4.4);
      stepVal('globulin', labProfile?.cmp?.globulin?.value ?? 2.8);
      stepVal('alkaline_phosphatase', labProfile?.cmp?.alkaline_phosphatase?.value ?? 68.0);
      stepVal('alt', labProfile?.cmp?.alt?.value ?? 24.0);
      stepVal('ast', labProfile?.cmp?.ast?.value ?? 22.0);
      stepVal('total_bilirubin', labProfile?.cmp?.total_bilirubin?.value ?? 0.6);

      // 7. Immune & Cytokines
      stepVal('il6', il6);
      stepVal('tnf', labProfile?.immune?.clusters?.pyrogens_and_inflammatory?.tnf_alpha?.concentration_pg_ml ?? defaultProfile.tnf);
      stepVal('ifn', labProfile?.immune?.clusters?.interferons_and_viral?.ifn_gamma?.concentration_pg_ml ?? defaultProfile.ifn);
      stepVal('il1b', labProfile?.immune?.clusters?.pyrogens_and_inflammatory?.il_1_beta?.concentration_pg_ml ?? defaultProfile.il1b);

      // 8. Radiation Exposure
      stepVal('rad_flux', radFlux);
      stepVal('rad_dose', radDose);
      stepVal('rsi', rsi);
      stepVal('alc', alc);

      // 9. Thrombosis & Vascular
      stepVal('trm', trm);

      // 10. Directives & Sentry
      stepVal('epi', currentPacket.computed_epi ?? 0.05);

      return { ...prev, ...next };
    });
  }, [currentPacket?.tick, currentPacket?.heart_rate, currentPacket?.spo2, labProfile]);

  // Authentic Multi-Organ Physiological Reserve Index (PRI) derived from clinical engine
  const rawClinicalSummary = useMemo(
    () => evaluateCrewClinicalSummary(selectedId, currentPacket, defaultProfile),
    [selectedId, currentPacket, defaultProfile]
  );
  // 1-second clinical state dwell time machine: prevents rapid view flipping from sensor noise
  const clinicalSummary = useStabilizedClinicalSummary(selectedId, rawClinicalSummary, 1000);

  const healthPercent = clinicalSummary.physReserveIndex;

  const overallPill = useMemo(() => {
    if (clinicalSummary.severity === 'CRITICAL') return { label: 'Critical', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.14)' };
    if (clinicalSummary.severity === 'WARNING') return { label: 'Attention', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)' };
    return { label: 'Stable', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.14)' };
  }, [clinicalSummary.severity]);

  const summaryTiles = useMemo(() => {
    const nv = clinicalSummary.nominalVitals;
    if (!clinicalSummary.isAbnormal) {
      return [
        { label: 'HR', value: `${nv.hr.val} bpm`, status: 'Normal', isAlert: false, isCaution: false },
        { label: 'SpO₂', value: `${Number(nv.spo2.val).toFixed(1)} %`, status: 'Normal', isAlert: false, isCaution: false },
        { label: 'TEMP', value: `${Number(nv.temp.val).toFixed(1)} °C`, status: 'Normal', isAlert: false, isCaution: false },
        { label: 'BP', value: `${nv.bp.val} mmHg`, status: 'Normal', isAlert: false, isCaution: false },
        { label: 'HRV', value: `${nv.hrv.val} ms`, status: 'Normal', isAlert: false, isCaution: false },
      ];
    }
    const tiles: { label: string; value: string; status: string; isAlert: boolean; isCaution: boolean }[] = [];
    const abnormalBiomarkers = clinicalSummary.prioritizedBiomarkers.filter(
      (b) => b.tier === 'CRITICAL' || b.tier === 'WARNING'
    );
    abnormalBiomarkers.forEach((b) => {
      let displayVal = b.formattedValue;
      if (b.unit && b.unit !== 'idx' && !displayVal.endsWith(b.unit)) {
        displayVal = `${displayVal} ${b.unit}`.trim();
      }
      tiles.push({
        label: b.symbol || b.name,
        value: displayVal,
        status: b.deltaStr || (b.tier === 'CRITICAL' ? 'Critical' : 'Attention'),
        isAlert: b.tier === 'CRITICAL',
        isCaution: b.tier === 'WARNING',
      });
    });
    if (!tiles.some((t) => t.label === 'HR')) {
      tiles.push({
        label: 'HR',
        value: `${nv.hr.val} bpm`,
        status: nv.hr.delta || 'Normal',
        isAlert: false,
        isCaution: hr > 100 || hr < 50,
      });
    }
    if (!tiles.some((t) => t.label.includes('SpO₂') || t.label.includes('O2'))) {
      tiles.push({
        label: 'SpO₂',
        value: `${Number(nv.spo2.val).toFixed(1)} %`,
        status: nv.spo2.delta || 'Normal',
        isAlert: spo2 < 93,
        isCaution: spo2 < 96,
      });
    }
    if (tiles.length < 5 && !tiles.some((t) => t.label === 'BP')) {
      tiles.push({
        label: 'BP',
        value: `${nv.bp.val} mmHg`,
        status: 'Normal',
        isAlert: false,
        isCaution: false,
      });
    }
    if (tiles.length < 5 && !tiles.some((t) => t.label === 'TEMP')) {
      tiles.push({
        label: 'TEMP',
        value: `${Number(nv.temp.val).toFixed(1)} °C`,
        status: nv.temp.delta || 'Normal',
        isAlert: temp >= 38.3,
        isCaution: temp >= 37.5,
      });
    }
    return tiles.slice(0, 5);
  }, [clinicalSummary, hr, spo2, temp]);

  const hazardStatus = useMemo(() => {
    const sc = currentPacket?.scenario_phase || '';
    if (sc.includes('AMMONIA') || sc === 'SCENARIO_4_AMMONIA_COOLANT_LEAK') {
      return {
        label: 'NH₃ LEAK (28 ppm)',
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.15)',
        border: 'rgba(239, 68, 68, 0.35)',
      };
    }
    if (sc.includes('FIRE') || sc.includes('SMOLDER') || sc === 'SCENARIO_5_ELECTRICAL_FIRE_SMOLDER') {
      return {
        label: 'SMOLDER DETECTED',
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.15)',
        border: 'rgba(245, 158, 11, 0.35)',
      };
    }
    if (radFlux >= 1.0 || sc.includes('SOLAR_RADIATION') || sc.includes('SOLAR_STORM')) {
      return {
        label: `SOLAR STORM (${radFlux.toFixed(0)} mSv/h)`,
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.15)',
        border: 'rgba(239, 68, 68, 0.35)',
      };
    }
    if (sc.includes('DECOMPRESSION') || sc === 'SCENARIO_2_SLOW_DECOMPRESSION_HYPOXIA') {
      return {
        label: 'DECOMPRESSION ALERT',
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.15)',
        border: 'rgba(239, 68, 68, 0.35)',
      };
    }
    if (co2 >= 3.0 || sc.includes('CO2_SCRUBBER')) {
      return {
        label: `CO₂ ELEVATED (${co2.toFixed(1)} mmHg)`,
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.15)',
        border: 'rgba(245, 158, 11, 0.35)',
      };
    }
    return {
      label: 'NOMINAL',
      color: '#22c55e',
      bg: 'rgba(34, 197, 94, 0.10)',
      border: 'rgba(34, 197, 94, 0.25)',
    };
  }, [currentPacket?.scenario_phase, radFlux, co2]);

  const cabinPressureVal = useMemo(() => {
    const sc = currentPacket?.scenario_phase || '';
    if (sc.includes('DECOMPRESSION') || sc === 'SCENARIO_2_SLOW_DECOMPRESSION_HYPOXIA') {
      return 92.4;
    }
    return 101.3;
  }, [currentPacket?.scenario_phase]);

  const cabinO2Val = useMemo(() => {
    const sc = currentPacket?.scenario_phase || '';
    if (sc.includes('DECOMPRESSION') || sc === 'SCENARIO_2_SLOW_DECOMPRESSION_HYPOXIA') {
      return 18.2;
    }
    return 20.9;
  }, [currentPacket?.scenario_phase]);

  const filteredDevices = useMemo(() => {
    if (deviceFilter === 'All') return FLIGHT_DEVICES;
    return FLIGHT_DEVICES.filter((d) => d.category === deviceFilter);
  }, [deviceFilter]);

  const toggleDeviceExpand = (id: number) => {
    setExpandedDeviceId((prev) => (prev === id ? null : id));
  };

  const toggleExpand = (cardNumber: number) => {
    setExpandedCard((prev) => (prev === cardNumber ? null : cardNumber));
  };

  const commonCardProps = {
    expandedBiomarkerKey,
    onToggleRowExpand: (key: string) => setExpandedBiomarkerKey((prev) => (prev === key ? null : key)),
    onOpenDeepAnalysis: (target: {
      metricLabel: string;
      currentValue: string;
      unit: string;
      baselineValue?: number | string;
      history?: number[];
      dotColor: string;
      category: string;
    }) => setDeepAnalysisTarget(target),
    isFastForward: isFastForwardCadence,
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        backgroundColor: '#0a0a0a',
        color: '#f8fafc',
        fontFamily: 'var(--hud-font-sans, "Tomorrow", system-ui, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1360px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100%',
          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#070b12',
          boxShadow: '0 0 50px rgba(0, 0, 0, 0.85)',
        }}
      >
        {/* ── UNIFIED MAIN HEADER WITH BRAND LOGO & SYSTEM CONTROLS ──────── */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            background: 'rgba(10, 15, 26, 0.90)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '0 20px',
          }}
        >
          <HeaderBar
            connected={connected ?? true}
            marsDelay={marsDelay}
            onToggleMarsDelay={onToggleMarsDelay || (() => { })}
            activeView={activeView || 'HEALTH_TELEMETRY'}
            onSelectView={onSelectView || ((v) => { if (v === 'HUD') onClose(); })}
            latestAlert={latestAlert}
            selectedAstronautId={selectedId}
          />
        </div>

        {/* ── HIGH-FIDELITY HERO COMMAND BAR (ACTIVE SUBJECT PROFILE, HUD TELEMETRY & IMAGE SWITCHER) ── */}
        <div
          style={{
            padding: '12px 24px 0 24px',
            background: 'linear-gradient(180deg, #151515 0%, #0e0e0e 100%)',
            borderBottom: '1px solid #222222',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            position: 'relative',
          }}
        >
          {/* TOP ROW: Active Crew Identity & PRI on the Left, CABIN ECLSS on the Right */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              gap: '16px',
            }}
          >
            {/* LEFT: Active Crew Identity (Avatar + Left-Aligned Name with Alerts Under It) + Health Score placed after name (NO badge) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {/* Astronaut Avatar with Live Severity Glow Ring */}
              <div
                style={{
                  position: 'relative',
                  width: '46px',
                  height: '46px',
                  borderRadius: '10px',
                  border: `2px solid ${overallPill.color}`,
                  boxShadow: `0 0 12px ${overallPill.color}40`,
                  overflow: 'hidden',
                  flexShrink: 0,
                  backgroundColor: '#111827',
                }}
              >
                <img
                  src={activeCrew.avatar}
                  alt={activeCrew.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    bottom: '2px',
                    right: '2px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: overallPill.color,
                    border: '1.5px solid #07090d',
                    boxShadow: `0 0 6px ${overallPill.color}`,
                  }}
                />
              </div>

              {/* Left-Aligned Name Stack with Alerts Kept Underneath */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                {/* Top Row: Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      color: '#ffffff',
                      fontFamily: "'Tomorrow', sans-serif",
                      letterSpacing: '-0.01em',
                      lineHeight: 1.1,
                    }}
                  >
                    {activeCrew.name}
                  </span>
                </div>

                {/* Under Name: Mission Subject Context (Anchored Left) + Alerts Readout on Right (Zero Shift) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#cbd5e1',
                      fontFamily: "'Tomorrow', sans-serif",
                      fontWeight: 500,
                      letterSpacing: '0.02em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Inspiration4 ({activeCrew.subjectId})
                  </span>
                  {severity !== 'NOMINAL' && (
                    <>
                      <span style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 600 }}>•</span>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          flexShrink: 0,
                        }}
                      >
                        {severity === 'CRITICAL' ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                        )}
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            color: severity === 'CRITICAL' ? '#ef4444' : '#f59e0b',
                            fontFamily: 'var(--hud-font-mono, monospace)',
                            fontVariantNumeric: 'tabular-nums',
                            lineHeight: 1,
                          }}
                        >
                          {clinicalSummary.prioritizedBiomarkers.filter(b => b.tier === 'CRITICAL' || b.tier === 'WARNING').length || 1}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Subtle Vertical Divider */}
              <div style={{ width: '1px', height: '38px', backgroundColor: 'rgba(255, 255, 255, 0.16)' }} />

              {/* Reserve (PRI) Column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start', flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    color: '#cbd5e1',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontFamily: "'Tomorrow', sans-serif",
                    lineHeight: 1,
                  }}
                >
                  Reserve (PRI)
                </span>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'baseline',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: '32px',
                      fontWeight: 800,
                      color: overallPill.color,
                      fontFamily: 'var(--hud-font-mono, monospace)',
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '-0.02em',
                      lineHeight: 1,
                      display: 'inline-block',
                      textAlign: 'left',
                      textShadow: `0 0 18px ${overallPill.color}35`,
                    }}
                  >
                    {healthPercent}
                  </span>
                  <span
                    style={{
                      fontSize: '20px',
                      fontWeight: 800,
                      color: overallPill.color,
                      fontFamily: "'Tomorrow', sans-serif",
                      marginLeft: '2px',
                      lineHeight: 1,
                      display: 'inline-block',
                      textAlign: 'left',
                      textShadow: `0 0 14px ${overallPill.color}35`,
                    }}
                  >
                    %
                  </span>
                </div>
              </div>

              {/* Subtle Vertical Divider between PRI and Health Systems */}
              <div style={{ width: '1px', height: '34px', backgroundColor: 'rgba(255, 255, 255, 0.10)' }} />

              {/* Health Systems Column with Parallel Aligned Top Label */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start', flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    color: '#cbd5e1',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontFamily: "'Tomorrow', sans-serif",
                    lineHeight: 1,
                  }}
                >
                  Health Systems
                </span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    background: 'rgba(0, 0, 0, 0.40)',
                    padding: '5px 9px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.10)',
                    flexShrink: 0,
                  }}
                  title={`Health Systems Reserve: Cardiovascular: ${clinicalSummary.reserveBreakdown.cardiovascular}% | Respiratory: ${clinicalSummary.reserveBreakdown.respiratory}% | Metabolic: ${clinicalSummary.reserveBreakdown.metabolic}% | Immune: ${clinicalSummary.reserveBreakdown.immune}% | Radiation: ${clinicalSummary.reserveBreakdown.radiation}%`}
                >
                  {[
                    { label: 'Cardio', val: clinicalSummary.reserveBreakdown.cardiovascular },
                    { label: 'Resp', val: clinicalSummary.reserveBreakdown.respiratory },
                    { label: 'Metab', val: clinicalSummary.reserveBreakdown.metabolic },
                    { label: 'Immune', val: clinicalSummary.reserveBreakdown.immune },
                    { label: 'Rad', val: clinicalSummary.reserveBreakdown.radiation },
                  ].map((sys) => {
                    const sysColor = sys.val < 50 ? '#ef4444' : sys.val < 75 ? '#f59e0b' : '#22c55e';
                    return (
                      <div key={sys.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2.5px' }}>
                        <span style={{ fontSize: '8px', color: '#f1f5f9', fontWeight: 700, lineHeight: 1, fontFamily: "'Tomorrow', sans-serif" }}>{sys.label}</span>
                        <div style={{ width: '20px', height: '3.5px', borderRadius: '1.5px', background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
                          <div style={{ width: `${sys.val}%`, height: '100%', background: sysColor, transition: 'width 300ms ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT: CABIN ENVIRONMENTAL TELEMETRY (ALL 3 PRIORITIES: LIFE-SAFETY, CIRCULATION & HAZARD SENTRY) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                background: '#181818',
                border: '1px solid #282828',
                boxShadow: '0 4px 16px -2px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                flexShrink: 0,
              }}
            >
              {/* Top Sub-Bar: Module Identity + Dynamic Priority 3 Hazard Sentry Badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#ffffff',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      fontFamily: "'Tomorrow', sans-serif",
                    }}
                  >
                    CABIN ECLSS
                  </span>
                </div>

                {/* Priority 3: Dynamic Contaminant & Hazard Sentry */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: hazardStatus.bg,
                    border: `1px solid ${hazardStatus.border}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      color: hazardStatus.color,
                      fontFamily: "'Tomorrow', sans-serif",
                      letterSpacing: '0.04em',
                      lineHeight: 1,
                    }}
                  >
                    {hazardStatus.label}
                  </span>
                </div>
              </div>

              {/* Bottom Row: 6 Core Environmental Signals with Tabular Numerals & Sans-Serif Units */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'nowrap' }}>
                {/* 1. Pressure */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', fontFamily: "'Tomorrow', sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    PRESSURE
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '2.5px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: cabinPressureVal < 95.0 ? '#ef4444' : '#ffffff', fontFamily: 'var(--hud-font-mono, monospace)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      {cabinPressureVal.toFixed(1)}
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: cabinPressureVal < 95.0 ? '#ef4444' : '#94a3b8', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                      kPa
                    </span>
                  </div>
                </div>

                <div style={{ width: '1px', height: '20px', backgroundColor: 'rgba(255, 255, 255, 0.10)' }} />

                {/* 2. O2 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', fontFamily: "'Tomorrow', sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    O₂
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '2.5px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: cabinO2Val < 19.5 ? '#ef4444' : '#ffffff', fontFamily: 'var(--hud-font-mono, monospace)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      {cabinO2Val.toFixed(1)}
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: cabinO2Val < 19.5 ? '#ef4444' : '#22c55e', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                      %
                    </span>
                  </div>
                </div>

                <div style={{ width: '1px', height: '20px', backgroundColor: 'rgba(255, 255, 255, 0.10)' }} />

                {/* 3. CO2 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', fontFamily: "'Tomorrow', sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    CO₂
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '2.5px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: co2 >= 3.0 ? '#f59e0b' : '#ffffff', fontFamily: 'var(--hud-font-mono, monospace)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      {co2.toFixed(1)}
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: co2 >= 3.0 ? '#f59e0b' : '#94a3b8', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                      mmHg
                    </span>
                  </div>
                </div>

                <div style={{ width: '1px', height: '20px', backgroundColor: 'rgba(255, 255, 255, 0.10)' }} />

                {/* 4. Radiation */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', fontFamily: "'Tomorrow', sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    RADIATION
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '2.5px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: radFlux >= 1.0 ? '#ef4444' : radFlux >= 0.15 ? '#f59e0b' : '#ffffff', fontFamily: 'var(--hud-font-mono, monospace)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      {radFlux >= 10.0 ? radFlux.toFixed(0) : radFlux.toFixed(2)}
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: radFlux >= 1.0 ? '#ef4444' : radFlux >= 0.15 ? '#f59e0b' : '#94a3b8', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                      mSv/h
                    </span>
                  </div>
                </div>

                <div style={{ width: '1px', height: '20px', backgroundColor: 'rgba(255, 255, 255, 0.10)' }} />

                {/* 5. Temp */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', fontFamily: "'Tomorrow', sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    TEMP
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '2.5px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--hud-font-mono, monospace)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      21.4
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: '#22c55e', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                      °C
                    </span>
                  </div>
                </div>

                <div style={{ width: '1px', height: '20px', backgroundColor: 'rgba(255, 255, 255, 0.10)' }} />

                {/* 6. Airflow */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', fontFamily: "'Tomorrow', sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    AIRFLOW
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '2.5px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--hud-font-mono, monospace)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      0.45
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: '#22c55e', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                      m/s
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── SLEEK CREW SELECTOR CAPSULE ── */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '8px 0 2px',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '999px',
                padding: '4px',
                gap: '6px',
              }}
            >
              {CREW_MEMBERS.map((crew) => {
                const isSelected = crew.id === selectedId;
                const crewPacket =
                  telemetryMap[crew.id] ||
                  (crew.id === 'AST-03_MEDICAL' ? telemetryMap['AST-03_MEDICAL_SPECIALIST'] : undefined) ||
                  (crew.id === 'AST-04_ENGINEER' ? telemetryMap['AST-04_MISSION_SPECIALIST'] : undefined);
                const crewSev = crewPacket?.evaluated_severity || 'NOMINAL';
                const dotColor =
                  crewSev === 'CRITICAL' ? '#ef4444' : crewSev === 'WARNING' ? '#f59e0b' : '#22c55e';
                const shortRole = crew.id.includes('COMMANDER') ? 'CO' : crew.id.includes('PILOT') ? 'FE' : crew.id.includes('MEDICAL') ? 'MO' : 'PI';
                const lastName = crew.name.split(' ')[1] || crew.name;

                return (
                  <button
                    key={crew.id}
                    onClick={() => {
                      setSelectedId(crew.id);
                      onAstronautChange?.(crew.id);
                    }}
                    title={`${crew.name} - ${crew.role} (${crew.subjectId})`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: isSelected ? '5px 14px 5px 6px' : '5px 10px',
                      borderRadius: '999px',
                      border: 'none',
                      background: isSelected ? 'rgba(56, 189, 248, 0.18)' : 'transparent',
                      color: isSelected ? '#ffffff' : '#94a3b8',
                      boxShadow: isSelected
                        ? 'inset 0 0 0 1px rgba(56, 189, 248, 0.45), 0 0 12px rgba(56, 189, 248, 0.22)'
                        : 'none',
                      cursor: 'pointer',
                      fontFamily: "'Tomorrow', sans-serif",
                      fontSize: '12px',
                      fontWeight: isSelected ? 700 : 500,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: `1.5px solid ${dotColor}`,
                      }}
                    >
                      <img
                        src={crew.avatar}
                        alt={crew.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <span>{shortRole}</span>
                    {isSelected && <span style={{ color: '#38bdf8' }}>{lastName}</span>}
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: dotColor,
                        boxShadow: `0 0 6px ${dotColor}`,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* ── 3. MAIN CONTENT: 10 CATEGORICAL CARDS + DEDICATED FULL-HEIGHT SIDEBAR */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 420px',
            alignItems: 'stretch',
            minHeight: 'calc(100vh - 280px)',
            backgroundColor: '#0e0e0e',
          }}
        >
          {/* Left Column: 10 Health Categories */}
          <div style={{ padding: '20px 24px 80px 24px', display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#0e0e0e' }}>
            {/* ── OPERATIONAL HEALTH STATUS & RAPID SCAN SUMMARY LAYER ── */}
            <div
              style={{
                background: clinicalSummary.isAbnormal
                  ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.16) 0%, rgba(34, 18, 22, 0.88) 35%, rgba(18, 11, 13, 0.96) 70%, rgba(12, 8, 10, 0.98) 100%)'
                  : 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(14, 28, 22, 0.88) 35%, rgba(10, 18, 15, 0.96) 70%, rgba(7, 12, 10, 0.98) 100%)',
                border: clinicalSummary.isAbnormal
                  ? '1px solid rgba(239, 68, 68, 0.35)'
                  : '1px solid rgba(34, 197, 94, 0.28)',
                borderRadius: '10px',
                padding: '14px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxShadow: clinicalSummary.isAbnormal
                  ? `0 0 24px ${clinicalSummary.primaryConcern.color}18, 0 8px 24px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08)`
                  : '0 0 24px rgba(34, 197, 94, 0.12), 0 8px 24px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
                transition: 'border-color 200ms ease, box-shadow 200ms ease',
              }}
            >
              {/* Row 1: State + Short Explanation + Confidence */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  minHeight: '26px',
                  flexWrap: 'nowrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}>
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: clinicalSummary.primaryConcern.color,
                        boxShadow: `0 0 8px ${clinicalSummary.primaryConcern.color}`,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        color: clinicalSummary.isAbnormal ? clinicalSummary.primaryConcern.color : '#ffffff',
                        fontFamily: "'Tomorrow', sans-serif",
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {clinicalSummary.primaryConcern.title}
                    </span>
                  </div>
                  <span style={{ color: 'rgba(255, 255, 255, 0.25)', fontSize: '11px', flexShrink: 0 }}>•</span>
                  <span
                    style={{
                      fontSize: '12px',
                      color: '#cbd5e1',
                      fontWeight: 500,
                      letterSpacing: '0.01em',
                      fontFamily: "'Tomorrow', sans-serif",
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {clinicalSummary.primaryConcern.description}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      color: clinicalSummary.isAbnormal ? '#fbbf24' : '#34d399',
                      letterSpacing: '0.04em',
                      fontFamily: "'Tomorrow', sans-serif",
                      fontVariantNumeric: 'tabular-nums',
                      background: clinicalSummary.isAbnormal ? 'rgba(251, 191, 36, 0.10)' : 'rgba(52, 211, 153, 0.10)',
                      border: clinicalSummary.isAbnormal ? '1px solid rgba(251, 191, 36, 0.25)' : '1px solid rgba(52, 211, 153, 0.25)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                      minWidth: '112px',
                      textAlign: 'center',
                    }}
                  >
                    {(clinicalSummary.structuredReasoning?.diagnosticConfidence ?? (clinicalSummary.isAbnormal ? 94.8 : 98.2)).toFixed(0)}% CONFIDENCE
                  </span>
                </div>
              </div>

              {/* Row 2: Important Values Grid (Compact & Tabular with Inset Gradient) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                  gap: '12px',
                  background: clinicalSummary.isAbnormal
                    ? 'linear-gradient(180deg, rgba(32, 14, 16, 0.70) 0%, rgba(18, 9, 11, 0.85) 50%, rgba(10, 6, 7, 0.95) 100%)'
                    : 'linear-gradient(180deg, rgba(8, 24, 17, 0.70) 0%, rgba(6, 16, 12, 0.85) 50%, rgba(4, 9, 7, 0.95) 100%)',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  border: clinicalSummary.isAbnormal
                    ? '1px solid rgba(239, 68, 68, 0.20)'
                    : '1px solid rgba(34, 197, 94, 0.18)',
                  boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.7), inset 0 0 16px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3)',
                }}
              >
                {summaryTiles.map((tile) => (
                  <div
                    key={tile.label}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 700,
                        color: '#94a3b8',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        fontFamily: "'Tomorrow', sans-serif",
                        height: '14px',
                        lineHeight: '14px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {tile.label}
                    </span>
                    <div
                      style={{
                        height: '24px',
                        display: 'flex',
                        alignItems: 'baseline',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                      }}
                    >
                      <FormattedMetricValue
                        value={tile.value}
                        style={{
                          fontSize: '17px',
                          fontWeight: 800,
                          color: tile.isAlert ? '#ef4444' : tile.isCaution ? '#f59e0b' : '#ffffff',
                          lineHeight: '24px',
                          letterSpacing: '-0.02em',
                        }}
                        unitStyle={{
                          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          fontSize: '11px',
                          fontWeight: 500,
                          color: '#94a3b8',
                          marginLeft: '3px',
                          letterSpacing: '0.01em',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        color: tile.isAlert ? '#f87171' : tile.isCaution ? '#fbbf24' : '#4ade80',
                        fontFamily: "'Tomorrow', sans-serif",
                        letterSpacing: '0.02em',
                        height: '16px',
                        lineHeight: '16px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {tile.status}
                    </span>
                  </div>
                ))}
              </div>

              {/* Row 3: Trend, Affected System & Action Bar with [ VIEW ANALYSIS ] Trigger */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  minHeight: '28px',
                  flexWrap: 'nowrap',
                  paddingTop: '2px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 700,
                      color: clinicalSummary.trajectory.color,
                      fontFamily: "'Tomorrow', sans-serif",
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {clinicalSummary.trajectory.label}
                  </span>
                  {clinicalSummary.isAbnormal ? (
                    <>
                      <span style={{ color: 'rgba(255, 255, 255, 0.25)', fontSize: '10px', flexShrink: 0 }}>•</span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#38bdf8',
                          background: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.28)',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          fontFamily: "'Tomorrow', sans-serif",
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        AFFECTED: {clinicalSummary.primaryConcern.category}
                      </span>
                      <span style={{ color: 'rgba(255, 255, 255, 0.25)', fontSize: '10px', flexShrink: 0 }}>•</span>
                      <span
                        style={{
                          fontSize: '11.5px',
                          color: '#fef08a',
                          fontWeight: 600,
                          fontFamily: "'Tomorrow', sans-serif",
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        ACTION: {clinicalSummary.decisionSupport.recommendedAction}
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: 'rgba(255, 255, 255, 0.25)', fontSize: '10px', flexShrink: 0 }}>•</span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#4ade80',
                          background: 'rgba(74, 222, 128, 0.10)',
                          border: '1px solid rgba(74, 222, 128, 0.22)',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          fontFamily: "'Tomorrow', sans-serif",
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        SYSTEMS NOMINAL
                      </span>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  {!clinicalSummary.isAbnormal && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#94a3b8',
                        letterSpacing: '0.05em',
                        fontFamily: "'Tomorrow', sans-serif",
                        whiteSpace: 'nowrap',
                      }}
                    >
                      NO ACTION NEEDED
                    </span>
                  )}
                  <button
                    onClick={() => setIsAnalysisDrawerOpen(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      background: clinicalSummary.isAbnormal
                        ? 'linear-gradient(180deg, rgba(239, 68, 68, 0.22) 0%, rgba(239, 68, 68, 0.10) 100%)'
                        : 'linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.04) 100%)',
                      border: clinicalSummary.isAbnormal
                        ? '1px solid rgba(239, 68, 68, 0.35)'
                        : '1px solid rgba(255, 255, 255, 0.14)',
                      color: clinicalSummary.isAbnormal ? '#fca5a5' : '#ffffff',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: "'Tomorrow', sans-serif",
                      letterSpacing: '0.05em',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                    title="Open structured clinical analysis drawer"
                  >
                    VIEW ANALYSIS →
                  </button>
                  {onSelectView && (
                    <button
                      onClick={() => onSelectView('SCANNER')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '5px 12px',
                        borderRadius: '6px',
                        background: 'linear-gradient(180deg, rgba(0, 229, 255, 0.22) 0%, rgba(0, 229, 255, 0.08) 100%)',
                        border: '1px solid rgba(0, 229, 255, 0.45)',
                        color: '#00e5ff',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: "'Tomorrow', sans-serif",
                        letterSpacing: '0.05em',
                        boxShadow: '0 0 10px rgba(0, 229, 255, 0.2)',
                        transition: 'all 0.15s ease',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                      title="Open 3D Holographic Anatomical Body Scanner"
                    >
                      <span style={{ fontSize: '11px' }}>⚡</span>
                      <span>3D SCAN →</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', fontFamily: "'Tomorrow', sans-serif" }}>
                Subsystems &amp; Biomarkers for {activeCrew.name}
              </div>
              <div style={{ fontSize: '10px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => setIsFastForwardCadence((prev) => !prev)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: isFastForwardCadence ? 'rgba(56, 189, 248, 0.20)' : 'rgba(255, 255, 255, 0.05)',
                    border: isFastForwardCadence ? '1px solid rgba(56, 189, 248, 0.50)' : '1px solid rgba(255, 255, 255, 0.10)',
                    color: isFastForwardCadence ? '#38bdf8' : '#94a3b8',
                    fontFamily: "'Tomorrow', sans-serif",
                    letterSpacing: '0.03em',
                  }}
                  title="Toggle 60x simulation speed for periodic countdown demonstration"
                >
                  {isFastForwardCadence ? 'DEMO CADENCE 60x ⚡' : 'CADENCE: REAL-TIME'}
                </button>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} /> Live
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#94a3b8' }} /> OSDR Lab
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }} /> Abnormal
                </span>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '14px',
              }}
            >
              {/* 1. Cardiovascular (14 Signals) */}
              <CategoryCard
                title="1. Cardiovascular"
                icon={<HeartIcon />}
                statusPill={{
                  label: (arf >= 1.60 || qtc >= 485.0 || hr > 130 || hr < 40)
                    ? 'Critical'
                    : (arf >= 1.25 || qtc >= 455.0 || hr > 100 || hr < 48)
                    ? 'Attention'
                    : 'Stable',
                  color: (arf >= 1.60 || qtc >= 485.0 || hr > 130 || hr < 40)
                    ? '#ef4444'
                    : (arf >= 1.25 || qtc >= 455.0 || hr > 100 || hr < 48)
                    ? '#f59e0b'
                    : '#22c55e',
                }}
                {...commonCardProps}
                rows={[
                  {
                    label: 'Heart rate',
                    metricId: 'hr',
                    unit: 'bpm',
                    baselineValue: defaultProfile.restHr,
                    value: computeBiomarkerDelta(hr, defaultProfile.restHr, 'bpm').deltaStr
                      ? `${Math.round(hr)} bpm (${computeBiomarkerDelta(hr, defaultProfile.restHr, 'bpm').deltaStr})`
                      : `${Math.round(hr)} bpm`,
                    dotColor: hr > 130 || hr < 40 ? '#ef4444' : hr > 100 || hr < 48 ? '#f59e0b' : '#22c55e',
                    trend: hr > 100 ? 'up' : 'stable',
                    history: metricHistories['hr'],
                  },
                  { label: 'ECG / Cardiac rhythm', metricId: 'ecg', value: hr > 115 ? 'Tachycardia' : hr < 50 ? 'Bradycardia' : 'Normal', dotColor: hr > 115 ? '#f59e0b' : '#22c55e', trend: 'stable', history: metricHistories['ecg'] },
                  { label: 'Blood pressure', metricId: 'bp_sys', unit: 'mmHg', baselineValue: '116/76', value: `${bpValStr} mmHg`, dotColor: '#94a3b8', history: metricHistories['bp_sys'] },
                  {
                    label: 'Arrhythmia detection',
                    metricId: 'arf',
                    unit: 'idx',
                    baselineValue: 0.72,
                    value: arf >= 1.60 || qtc >= 485.0 ? 'Elevated risk' : arf >= 1.25 || qtc >= 455.0 ? 'Borderline' : 'None',
                    dotColor: arf >= 1.60 || qtc >= 485.0 ? '#ef4444' : arf >= 1.25 || qtc >= 455.0 ? '#f59e0b' : '#22c55e',
                    trend: arf >= 1.25 || qtc >= 455.0 ? 'up' : 'stable',
                    history: metricHistories['arf'],
                  },
                  {
                    label: 'Fridericia QTc',
                    metricId: 'qtc',
                    unit: 'ms',
                    baselineValue: 402,
                    value: `${qtc.toFixed(0)} ms`,
                    dotColor: qtc >= 485 ? '#ef4444' : qtc >= 455 ? '#f59e0b' : '#22c55e',
                    trend: qtc >= 455 ? 'up' : 'stable',
                    history: metricHistories['qtc'],
                  },
                  ...(expandedCard === 1
                    ? [
                      { label: 'Fibrinogen (OSD-575)', metricId: 'fibrinogen', unit: 'mg/dL', baselineValue: defaultProfile.fibrinogen, value: fibrinogenVal, dotColor: '#94a3b8', history: metricHistories['fibrinogen'] },
                      { label: 'C-reactive protein (CRP)', metricId: 'crp', unit: 'mg/L', baselineValue: defaultProfile.crp, value: `${crp.toFixed(1)} mg/L`, dotColor: crp > 5.0 ? '#f59e0b' : '#22c55e', history: metricHistories['crp'] },
                      { label: 'L-selectin adhesion', metricId: 'l_selectin', unit: 'ng/mL', baselineValue: 740, value: labProfile?.cardiovascular?.l_selectin?.value ? `${(labProfile.cardiovascular.l_selectin.value / 1000).toFixed(0)} ng/mL` : '740 ng/mL', dotColor: '#94a3b8', history: metricHistories['l_selectin'] },
                      { label: 'Platelet factor 4 (PF4)', metricId: 'pf4', unit: 'ng/mL', baselineValue: 320, value: labProfile?.cardiovascular?.pf4?.value ? `${labProfile.cardiovascular.pf4.value.toFixed(0)} ng/mL` : '320 ng/mL', dotColor: '#94a3b8', history: metricHistories['pf4'] },
                      { label: 'Haptoglobin', metricId: 'haptoglobin', unit: 'mg/mL', baselineValue: 1.10, value: labProfile?.cardiovascular?.haptoglobin?.value ? `${(labProfile.cardiovascular.haptoglobin.value / 1000000).toFixed(2)} mg/mL` : '1.10 mg/mL', dotColor: '#94a3b8', history: metricHistories['haptoglobin'] },
                      { label: 'A2-macroglobulin', metricId: 'a2_macroglobulin', unit: 'mg/mL', baselineValue: 1.85, value: labProfile?.cardiovascular?.a2_macroglobulin?.value ? `${(labProfile.cardiovascular.a2_macroglobulin.value / 1000000).toFixed(2)} mg/mL` : '1.85 mg/mL', dotColor: '#94a3b8', history: metricHistories['a2_macroglobulin'] },
                      { label: 'Alpha-1 acid glycoprotein', metricId: 'agp', unit: 'mg/mL', baselineValue: 0.65, value: labProfile?.cardiovascular?.agp?.value ? `${(labProfile.cardiovascular.agp.value / 1000000).toFixed(2)} mg/mL` : '0.65 mg/mL', dotColor: '#94a3b8', history: metricHistories['agp'] },
                      { label: 'Fetuin-A36', metricId: 'fetuin_a36', unit: 'mg/mL', baselineValue: 0.38, value: labProfile?.cardiovascular?.fetuin_a36?.value ? `${(labProfile.cardiovascular.fetuin_a36.value / 1000000).toFixed(2)} mg/mL` : '0.38 mg/mL', dotColor: '#94a3b8', history: metricHistories['fetuin_a36'] },
                      { label: 'Serum amyloid P (SAP)', metricId: 'sap', unit: 'μg/mL', baselineValue: 24.5, value: labProfile?.cardiovascular?.sap?.value ? `${(labProfile.cardiovascular.sap.value / 1000).toFixed(1)} μg/mL` : '24.5 μg/mL', dotColor: '#94a3b8', history: metricHistories['sap'] },
                    ]
                    : []),
                ]}
                actionButton={{
                  label: expandedCard === 1 ? 'Collapse CV Panel ▲' : 'All 14 CV Biomarkers (OSD-575) ▼',
                  onClick: () => toggleExpand(1),
                }}
              />

              {/* 2. Respiratory (5 Signals) */}
              <CategoryCard
                title="2. Pulmonary & Respiratory"
                icon={<LungsIcon />}
                statusPill={{ label: spo2 < 95 || respRate > 20 ? 'Attention' : 'Stable', color: spo2 < 95 || respRate > 20 ? '#f59e0b' : '#22c55e' }}
                {...commonCardProps}
                rows={[
                  {
                    label: 'SpO₂ (Oxygen saturation)',
                    metricId: 'spo2',
                    unit: '%',
                    baselineValue: defaultProfile.restSpo2.toFixed(1),
                    value: computeBiomarkerDelta(spo2, defaultProfile.restSpo2, '%').deltaStr
                      ? `${spo2.toFixed(1)} % (${computeBiomarkerDelta(spo2, defaultProfile.restSpo2, '%').deltaStr})`
                      : `${spo2.toFixed(1)} %`,
                    dotColor: spo2 < 94 ? '#ef4444' : spo2 < 96 ? '#f59e0b' : '#22c55e',
                    trend: spo2 < 96 ? 'down' : 'stable',
                    history: metricHistories['spo2'],
                  },
                  { label: 'Respiratory rate', metricId: 'rr', unit: '/min', baselineValue: 14, value: `${respRate} /min`, dotColor: respRate > 20 ? '#f59e0b' : '#22c55e', history: metricHistories['rr'] },
                  { label: 'End-tidal CO₂ (EtCO₂)', metricId: 'etco2', unit: 'mmHg', baselineValue: 38, value: `${spo2 < 95 ? 43 : 38} mmHg`, dotColor: spo2 < 95 ? '#f59e0b' : '#22c55e', trend: spo2 < 95 ? 'up' : 'stable', history: metricHistories['etco2'] },
                  { label: 'Minute ventilation', metricId: 'min_vent', unit: 'L/min', baselineValue: 7.3, value: `${(respRate * 0.52).toFixed(1)} L/min`, dotColor: respRate > 20 ? '#f59e0b' : '#22c55e', history: metricHistories['min_vent'] },
                  { label: 'Breathing synchrony', metricId: 'resp_synchrony', value: 'Normal', dotColor: '#22c55e', baselineValue: 'Normal', unit: 'idx', noGraph: true },
                ]}
              />

              {/* 3. Temperature (4 Signals) */}
              <CategoryCard
                title="3. Thermoregulation"
                icon={<TempIcon />}
                statusPill={{ label: temp >= 37.5 ? 'Attention' : 'Stable', color: temp >= 37.5 ? '#f59e0b' : '#22c55e' }}
                {...commonCardProps}
                rows={[
                  {
                    label: 'Core body temperature',
                    metricId: 'temp',
                    unit: '°C',
                    baselineValue: defaultProfile.restTemp.toFixed(1),
                    value: computeBiomarkerDelta(temp, defaultProfile.restTemp, '°C').deltaStr
                      ? `${temp.toFixed(1)} °C (${computeBiomarkerDelta(temp, defaultProfile.restTemp, '°C').deltaStr})`
                      : `${temp.toFixed(1)} °C`,
                    dotColor: temp >= 38.3 ? '#ef4444' : temp >= 37.5 ? '#f59e0b' : '#22c55e',
                    trend: temp >= 37.5 ? 'up' : 'stable',
                    history: metricHistories['temp'],
                  },
                  { label: 'Peripheral skin temp', metricId: 'skin_temp', unit: '°C', baselineValue: (defaultProfile.restTemp - 2.8).toFixed(1), value: `${(temp - 2.8).toFixed(1)} °C`, dotColor: '#22c55e', trend: 'stable', history: metricHistories['skin_temp'] },
                  { label: 'Thermal drift rate', metricId: 'drift_rate', unit: '°C/h', baselineValue: 0.0, value: temp >= 37.5 ? '+0.4 °C/h' : '0.0 °C/h', dotColor: temp >= 37.5 ? '#f59e0b' : '#22c55e', history: metricHistories['drift_rate'] },
                  { label: 'Heat balance', value: temp >= 37.5 ? 'Heat retention' : 'Normal', dotColor: temp >= 37.5 ? '#f59e0b' : '#22c55e', noGraph: true },
                ]}
              />

              {/* 4. Neurological & Fatigue (5 Signals) */}
              <CategoryCard
                title="4. Neurological & Fatigue"
                icon={<BrainIcon />}
                statusPill={{ label: sleep < 70 ? 'Attention' : 'Nominal', color: sleep < 70 ? '#f59e0b' : '#22c55e' }}
                {...commonCardProps}
                rows={[
                  { label: 'Sleep score', metricId: 'sleep', unit: '/100', baselineValue: defaultProfile.restSleep, value: `${sleep.toFixed(0)} / 100`, dotColor: sleep < 65 ? '#f59e0b' : '#22c55e', trend: sleep < 70 ? 'down' : 'stable', history: metricHistories['sleep'] },
                  {
                    label: 'Heart rate variability (HRV)',
                    metricId: 'hrv',
                    unit: 'ms',
                    baselineValue: defaultProfile.restHrv,
                    value: computeBiomarkerDelta(hrv, defaultProfile.restHrv, 'ms').deltaStr
                      ? `${Math.round(hrv)} ms (${computeBiomarkerDelta(hrv, defaultProfile.restHrv, 'ms').deltaStr})`
                      : `${Math.round(hrv)} ms`,
                    dotColor: hrv < 20 ? '#ef4444' : hrv < 35 ? '#f59e0b' : '#22c55e',
                    trend: hrv < 35 ? 'down' : 'stable',
                    history: metricHistories['hrv'],
                  },
                  { label: 'Neurological response', value: 'Normal', dotColor: '#22c55e', trend: 'stable', noGraph: true },
                  { label: 'Circadian phase', value: 'Phase II (Active)', dotColor: '#38bdf8', noGraph: true },
                  { label: 'Autonomic drift', metricId: 'z_hrv', unit: 'σ', baselineValue: 0.2, value: `${Math.abs(currentPacket?.z_score_hrv ?? 0.2).toFixed(1)} σ`, dotColor: Math.abs(currentPacket?.z_score_hrv ?? 0) > 2.0 ? '#f59e0b' : '#22c55e', history: metricHistories['z_hrv'] },
                ]}
              />

              {/* 5. Complete Blood Count (OSD-569 — 20 Signals) */}
              <CategoryCard
                title="5. Hematology (OSD-569 CBC)"
                icon={<ShieldIcon />}
                statusPill={{ label: il6 >= 15.0 || wbc > 12.0 ? 'Attention' : 'Nominal', color: il6 >= 15.0 ? '#f59e0b' : '#22c55e' }}
                {...commonCardProps}
                rows={[
                  {
                    label: 'Hematocrit (HCT)',
                    metricId: 'hct',
                    unit: '%',
                    baselineValue: defaultProfile.hct,
                    value: computeBiomarkerDelta(hct, defaultProfile.hct, '%').deltaStr
                      ? `${hct.toFixed(1)} % (${computeBiomarkerDelta(hct, defaultProfile.hct, '%').deltaStr})`
                      : `${hct.toFixed(1)} %`,
                    dotColor: '#22c55e',
                    history: metricHistories['hct']
                  },
                  {
                    label: 'White blood cells (WBC)',
                    metricId: 'wbc',
                    unit: 'k/μL',
                    baselineValue: defaultProfile.wbc,
                    value: computeBiomarkerDelta(wbc, defaultProfile.wbc, 'k').deltaStr
                      ? `${wbc.toFixed(1)} k/μL (${computeBiomarkerDelta(wbc, defaultProfile.wbc, 'k').deltaStr})`
                      : `${wbc.toFixed(1)} k/μL`,
                    dotColor: wbc > 12.0 ? '#ef4444' : '#22c55e',
                    history: metricHistories['wbc']
                  },
                  {
                    label: 'Platelets (PLT)',
                    metricId: 'plt',
                    unit: 'k/μL',
                    baselineValue: defaultProfile.plt,
                    value: computeBiomarkerDelta(plt, defaultProfile.plt, 'k').deltaStr
                      ? `${plt.toFixed(0)} k/μL (${computeBiomarkerDelta(plt, defaultProfile.plt, 'k').deltaStr})`
                      : `${plt.toFixed(0)} k/μL`,
                    dotColor: '#22c55e',
                    history: metricHistories['plt']
                  },
                  { label: 'Hemoglobin (Hgb)', metricId: 'hgb', unit: 'g/dL', baselineValue: defaultProfile.hgb, value: hgbVal, dotColor: '#22c55e', history: metricHistories['hgb'] },
                  { label: 'Red blood cells (RBC)', metricId: 'rbc', unit: 'M/μL', baselineValue: defaultProfile.rbc, value: rbcVal, dotColor: '#22c55e', history: metricHistories['rbc'] },
                  ...(expandedCard === 5
                    ? [
                      { label: 'Absolute neutrophils', metricId: 'abs_neutrophils', unit: '/μL', baselineValue: 4200, value: labProfile?.cbc?.absolute_neutrophils?.value ? `${labProfile.cbc.absolute_neutrophils.value} /μL` : '4200 /μL', dotColor: '#22c55e', history: metricHistories['abs_neutrophils'] },
                      { label: 'Neutrophils %', metricId: 'neutrophils_pct', unit: '%', baselineValue: 62.0, value: labProfile?.cbc?.neutrophils_percent?.value ? `${labProfile.cbc.neutrophils_percent.value} %` : '62.0 %', dotColor: '#22c55e', history: metricHistories['neutrophils_pct'] },
                      { label: 'Absolute lymphocytes', metricId: 'abs_lymphocytes', unit: '/μL', baselineValue: 2100, value: labProfile?.cbc?.absolute_lymphocytes?.value ? `${labProfile.cbc.absolute_lymphocytes.value} /μL` : '2100 /μL', dotColor: '#22c55e', history: metricHistories['abs_lymphocytes'] },
                      { label: 'Lymphocytes %', metricId: 'lymphocytes_pct', unit: '%', baselineValue: 29.5, value: labProfile?.cbc?.lymphocytes_percent?.value ? `${labProfile.cbc.lymphocytes_percent.value} %` : '29.5 %', dotColor: '#22c55e', history: metricHistories['lymphocytes_pct'] },
                      { label: 'Absolute monocytes', metricId: 'abs_monocytes', unit: '/μL', baselineValue: 480, value: labProfile?.cbc?.absolute_monocytes?.value ? `${labProfile.cbc.absolute_monocytes.value} /μL` : '480 /μL', dotColor: '#22c55e', history: metricHistories['abs_monocytes'] },
                      { label: 'Monocytes %', metricId: 'monocytes_pct', unit: '%', baselineValue: 6.8, value: labProfile?.cbc?.monocytes_percent?.value ? `${labProfile.cbc.monocytes_percent.value} %` : '6.8 %', dotColor: '#22c55e', history: metricHistories['monocytes_pct'] },
                      { label: 'Absolute eosinophils', metricId: 'abs_eosinophils', unit: '/μL', baselineValue: 120, value: labProfile?.cbc?.absolute_eosinophils?.value ? `${labProfile.cbc.absolute_eosinophils.value} /μL` : '120 /μL', dotColor: '#22c55e', history: metricHistories['abs_eosinophils'] },
                      { label: 'Eosinophils %', metricId: 'eosinophils_pct', unit: '%', baselineValue: 1.8, value: labProfile?.cbc?.eosinophils_percent?.value ? `${labProfile.cbc.eosinophils_percent.value} %` : '1.8 %', dotColor: '#22c55e', history: metricHistories['eosinophils_pct'] },
                      { label: 'Absolute basophils', metricId: 'abs_basophils', unit: '/μL', baselineValue: 35, value: labProfile?.cbc?.absolute_basophils?.value ? `${labProfile.cbc.absolute_basophils.value} /μL` : '35 /μL', dotColor: '#22c55e', history: metricHistories['abs_basophils'] },
                      { label: 'Basophils %', metricId: 'basophils_pct', unit: '%', baselineValue: 0.5, value: labProfile?.cbc?.basophils_percent?.value ? `${labProfile.cbc.basophils_percent.value} %` : '0.5 %', dotColor: '#22c55e', history: metricHistories['basophils_pct'] },
                      { label: 'Mean cell volume (MCV)', metricId: 'mcv', unit: 'fL', baselineValue: 89.0, value: labProfile?.cbc?.mcv?.value ? `${labProfile.cbc.mcv.value} fL` : '89.0 fL', dotColor: '#22c55e', history: metricHistories['mcv'] },
                      { label: 'Mean cell Hb (MCH)', metricId: 'mch', unit: 'pg', baselineValue: 30.2, value: labProfile?.cbc?.mch?.value ? `${labProfile.cbc.mch.value} pg` : '30.2 pg', dotColor: '#22c55e', history: metricHistories['mch'] },
                      { label: 'Cell Hb conc (MCHC)', metricId: 'mchc', unit: 'g/dL', baselineValue: 33.8, value: labProfile?.cbc?.mchc?.value ? `${labProfile.cbc.mchc.value} g/dL` : '33.8 g/dL', dotColor: '#22c55e', history: metricHistories['mchc'] },
                      { label: 'Red cell width (RDW)', metricId: 'rdw', unit: '%', baselineValue: 12.4, value: labProfile?.cbc?.rdw?.value ? `${labProfile.cbc.rdw.value} %` : '12.4 %', dotColor: '#22c55e', history: metricHistories['rdw'] },
                      { label: 'Platelet volume (MPV)', metricId: 'mpv', unit: 'fL', baselineValue: 9.8, value: labProfile?.cbc?.mpv?.value ? `${labProfile.cbc.mpv.value} fL` : '9.8 fL', dotColor: '#22c55e', history: metricHistories['mpv'] },
                    ]
                    : []),
                ]}
                actionButton={{
                  label: expandedCard === 5 ? 'Collapse CBC Morphology ▲' : 'All 20 CBC Biomarkers (OSD-569) ▼',
                  onClick: () => toggleExpand(5),
                }}
              />

              {/* 6. Comprehensive Metabolic Panel (OSD-575 — 19 Signals) */}
              <CategoryCard
                title="6. Metabolic & Chemistry (CMP)"
                icon={<FlaskIcon />}
                statusPill={{ label: k < 3.5 ? 'Attention' : 'Nominal', color: k < 3.5 ? '#f59e0b' : '#22c55e' }}
                {...commonCardProps}
                rows={[
                  { label: 'Serum sodium (Na⁺)', metricId: 'na', unit: 'mmol/L', baselineValue: defaultProfile.na, value: sodiumVal, dotColor: '#22c55e', history: metricHistories['na'] },
                  {
                    label: 'Serum potassium (K⁺)',
                    metricId: 'k',
                    unit: 'mmol/L',
                    baselineValue: defaultProfile.k,
                    value: computeBiomarkerDelta(k, defaultProfile.k, 'mmol/L').deltaStr
                      ? `${k.toFixed(2)} mmol/L (${computeBiomarkerDelta(k, defaultProfile.k, 'mmol/L').deltaStr})`
                      : `${k.toFixed(2)} mmol/L`,
                    dotColor: k < 3.0 ? '#ef4444' : k < 3.5 ? '#f59e0b' : '#22c55e',
                    trend: k < 3.5 ? 'down' : 'stable',
                    history: metricHistories['k']
                  },
                  { label: 'Blood glucose', metricId: 'glu', unit: 'mg/dL', baselineValue: defaultProfile.glu, value: glucoseVal, dotColor: '#22c55e', history: metricHistories['glu'] },
                  { label: 'Blood urea nitrogen (BUN)', metricId: 'bun', unit: 'mg/dL', baselineValue: defaultProfile.bun, value: bunVal, dotColor: '#22c55e', history: metricHistories['bun'] },
                  { label: 'Serum creatinine', metricId: 'creatinine', unit: 'mg/dL', baselineValue: defaultProfile.cr, value: creatinineVal, dotColor: '#22c55e', history: metricHistories['creatinine'] },
                  ...(expandedCard === 6
                    ? [
                      { label: 'Serum calcium (Ca²⁺)', metricId: 'calcium', unit: 'mg/dL', baselineValue: 9.4, value: labProfile?.cmp?.calcium?.value ? `${labProfile.cmp.calcium.value} mg/dL` : '9.4 mg/dL', dotColor: '#22c55e', history: metricHistories['calcium'] },
                      { label: 'Serum chloride (Cl⁻)', metricId: 'chloride', unit: 'mmol/L', baselineValue: 102.0, value: labProfile?.cmp?.chloride?.value ? `${labProfile.cmp.chloride.value} mmol/L` : '102 mmol/L', dotColor: '#22c55e', history: metricHistories['chloride'] },
                      { label: 'Serum bicarbonate (CO₂)', metricId: 'co2_blood', unit: 'mmol/L', baselineValue: 26.0, value: labProfile?.cmp?.carbon_dioxide?.value ? `${labProfile.cmp.carbon_dioxide.value} mmol/L` : '26 mmol/L', dotColor: '#22c55e', history: metricHistories['co2_blood'] },
                      { label: 'BUN / Creatinine ratio', value: labProfile?.cmp?.bun_to_creatinine_ratio?.value ? `${labProfile.cmp.bun_to_creatinine_ratio.value}` : '15.2', dotColor: '#22c55e', noGraph: true },
                      { label: 'eGFR filtration rate', metricId: 'egfr', unit: 'mL/min', baselineValue: 105.0, value: labProfile?.cmp?.egfr_non_african_american?.value ? `${labProfile.cmp.egfr_non_african_american.value} mL/min` : '105 mL/min', dotColor: '#22c55e', history: metricHistories['egfr'] },
                      { label: 'Total serum protein', metricId: 'total_protein', unit: 'g/dL', baselineValue: 7.2, value: labProfile?.cmp?.total_protein?.value ? `${labProfile.cmp.total_protein.value} g/dL` : '7.2 g/dL', dotColor: '#22c55e', history: metricHistories['total_protein'] },
                      { label: 'Serum albumin', metricId: 'albumin', unit: 'g/dL', baselineValue: defaultProfile.alb, value: albuminVal, dotColor: '#22c55e', history: metricHistories['albumin'] },
                      { label: 'Serum globulin', metricId: 'globulin', unit: 'g/dL', baselineValue: 2.8, value: labProfile?.cmp?.globulin?.value ? `${labProfile.cmp.globulin.value} g/dL` : '2.8 g/dL', dotColor: '#22c55e', history: metricHistories['globulin'] },
                      { label: 'Albumin / Globulin ratio', value: labProfile?.cmp?.albumin_to_globulin_ratio?.value ? `${labProfile.cmp.albumin_to_globulin_ratio.value}` : '1.57', dotColor: '#22c55e', noGraph: true },
                      { label: 'Alkaline phosphatase', metricId: 'alkaline_phosphatase', unit: 'U/L', baselineValue: 68.0, value: labProfile?.cmp?.alkaline_phosphatase?.value ? `${labProfile.cmp.alkaline_phosphatase.value} U/L` : '68 U/L', dotColor: '#22c55e', history: metricHistories['alkaline_phosphatase'] },
                      { label: 'Alanine transaminase (ALT)', metricId: 'alt', unit: 'U/L', baselineValue: 24.0, value: labProfile?.cmp?.alt?.value ? `${labProfile.cmp.alt.value} U/L` : '24 U/L', dotColor: '#22c55e', history: metricHistories['alt'] },
                      { label: 'Aspartate transaminase (AST)', metricId: 'ast', unit: 'U/L', baselineValue: 22.0, value: labProfile?.cmp?.ast?.value ? `${labProfile.cmp.ast.value} U/L` : '22 U/L', dotColor: '#22c55e', history: metricHistories['ast'] },
                      { label: 'Total bilirubin', metricId: 'total_bilirubin', unit: 'mg/dL', baselineValue: 0.6, value: labProfile?.cmp?.total_bilirubin?.value ? `${labProfile.cmp.total_bilirubin.value} mg/dL` : '0.6 mg/dL', dotColor: '#22c55e', history: metricHistories['total_bilirubin'] },
                      { label: 'eGFR African American', value: labProfile?.cmp?.egfr_african_american?.value ? `${labProfile.cmp.egfr_african_american.value} mL/min` : '118 mL/min', dotColor: '#22c55e', noGraph: true },
                    ]
                    : []),
                ]}
                actionButton={{
                  label: expandedCard === 6 ? 'Collapse CMP Panel ▲' : 'All 19 CMP Biomarkers (OSD-575) ▼',
                  onClick: () => toggleExpand(6),
                }}
              />

              {/* 7. Deep-Space Immune & Cytokine Profiling (OSD-575 — 71 Cytokines) */}
              <CategoryCard
                title="7. Immune & Cytokines (OSD-575)"
                icon={<DropIcon />}
                statusPill={{ label: il6 >= 15.0 ? 'Attention' : 'Nominal', color: il6 >= 15.0 ? '#f59e0b' : '#22c55e' }}
                {...commonCardProps}
                rows={[
                  {
                    label: 'Interleukin-6 (IL-6)',
                    metricId: 'il6',
                    unit: 'pg/mL',
                    baselineValue: defaultProfile.il6,
                    value: computeBiomarkerDelta(il6, defaultProfile.il6, 'pg/mL').deltaStr
                      ? `${il6.toFixed(1)} pg/mL (${computeBiomarkerDelta(il6, defaultProfile.il6, 'pg/mL').deltaStr})`
                      : `${il6.toFixed(1)} pg/mL`,
                    dotColor: il6 >= 30.0 ? '#ef4444' : il6 >= 15.0 ? '#f59e0b' : '#22c55e',
                    trend: il6 >= 15.0 ? 'up' : 'stable',
                    history: metricHistories['il6']
                  },
                  { label: 'TNF-alpha (TNF-α)', metricId: 'tnf', unit: 'pg/mL', baselineValue: defaultProfile.tnf, value: tnfVal, dotColor: '#22c55e', history: metricHistories['tnf'] },
                  { label: 'Interferon-gamma (IFN-γ)', metricId: 'ifn', unit: 'pg/mL', baselineValue: defaultProfile.ifn, value: labProfile?.immune?.clusters?.interferons_and_viral?.ifn_gamma?.concentration_pg_ml ? `${labProfile.immune.clusters.interferons_and_viral.ifn_gamma.concentration_pg_ml} pg/mL` : '3.4 pg/mL', dotColor: '#22c55e', history: metricHistories['ifn'] },
                  { label: 'Interleukin-1 beta (IL-1β)', metricId: 'il1b', unit: 'pg/mL', baselineValue: defaultProfile.il1b, value: labProfile?.immune?.clusters?.pyrogens_and_inflammatory?.il_1_beta?.concentration_pg_ml ? `${labProfile.immune.clusters.pyrogens_and_inflammatory.il_1_beta.concentration_pg_ml} pg/mL` : '1.2 pg/mL', dotColor: '#22c55e', history: metricHistories['il1b'] },
                  { label: 'Total cytokines monitored', value: '71 Markers', dotColor: '#94a3b8', noGraph: true },
                  ...(expandedCard === 7
                    ? Object.entries(
                      immuneClusterTab === 'pyrogens'
                        ? labProfile?.immune?.clusters?.pyrogens_and_inflammatory || {}
                        : immuneClusterTab === 'interferons'
                          ? labProfile?.immune?.clusters?.interferons_and_viral || {}
                          : immuneClusterTab === 'interleukins'
                            ? labProfile?.immune?.clusters?.interleukins_and_tcell || {}
                            : immuneClusterTab === 'chemokines'
                              ? labProfile?.immune?.clusters?.chemokines_and_trafficking || {}
                              : labProfile?.immune?.clusters?.growth_factors_and_remodeling || {}
                    ).map(([name, data]) => {
                      const conc = data.concentration_pg_ml;
                      const hasVal = conc !== null && conc > 0;
                      return {
                        label: name.replace(/_/g, ' '),
                        metricId: name,
                        unit: 'pg/mL',
                        baselineValue: hasVal ? conc : 0,
                        value: hasVal ? `${conc} pg/mL` : '0.0 pg/mL',
                        dotColor: '#94a3b8',
                        history: hasVal ? getCytokineHistory(name, conc) : undefined,
                        noGraph: !hasVal,
                      };
                    })
                    : []),
                ]}
                customHeaderRight={
                  expandedCard === 7 ? (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {[
                        { key: 'pyrogens', label: 'Pyrogens (6)' },
                        { key: 'interferons', label: 'Interferons (4)' },
                        { key: 'interleukins', label: 'Interleukins (24)' },
                        { key: 'chemokines', label: 'Chemokines (20)' },
                        { key: 'growth', label: 'Growth (17)' },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          onClick={(e) => {
                            e.stopPropagation();
                            setImmuneClusterTab(tab.key as any);
                          }}
                          style={{
                            fontSize: '9px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: immuneClusterTab === tab.key ? '1px solid #525252' : '1px solid #262626',
                            backgroundColor: immuneClusterTab === tab.key ? '#262626' : 'transparent',
                            color: immuneClusterTab === tab.key ? '#ffffff' : '#888888',
                            cursor: 'pointer',
                          }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  ) : undefined
                }
                actionButton={{
                  label: expandedCard === 7 ? 'Collapse Cytokine Panel ▲' : 'Inspect All 71 Cytokines by Cluster ▼',
                  onClick: () => toggleExpand(7),
                }}
              />

              {/* 8. Space Radiation Exposure (5 Signals) */}
              <CategoryCard
                title="8. Radiation Exposure"
                icon={<RadiationIcon />}
                statusPill={{ label: radFlux >= 0.15 || rsi >= 0.5 ? 'Attention' : 'Nominal', color: radFlux >= 0.15 ? '#f59e0b' : '#22c55e' }}
                {...commonCardProps}
                rows={[
                  { label: 'Current dose rate', metricId: 'rad_flux', unit: 'mSv/h', baselineValue: 0.04, value: `${radFlux.toFixed(2)} mSv/h`, dotColor: radFlux >= 0.15 ? '#f59e0b' : '#22c55e', trend: radFlux >= 0.15 ? 'up' : 'stable', history: metricHistories['rad_flux'] },
                  { label: 'Cumulative absorbed dose', metricId: 'rad_dose', unit: 'Gy', baselineValue: 0.05, value: `${radDose.toFixed(2)} Gy`, dotColor: '#22c55e', history: metricHistories['rad_dose'] },
                  { label: 'Radiation sickness index', metricId: 'rsi', unit: 'idx', baselineValue: 0.12, value: rsi.toFixed(2), dotColor: rsi >= 0.5 ? '#f59e0b' : '#22c55e', history: metricHistories['rsi'] },
                  { label: 'Absolute lymphocytes', metricId: 'alc', unit: 'k/μL', baselineValue: 2.15, value: `${alc.toFixed(2)} k/μL`, dotColor: alc < 1.0 ? '#ef4444' : '#22c55e', history: metricHistories['alc'] },
                  { label: 'DNA double-strand breaks', value: radDose > 0.2 ? 'Elevated repairs' : 'Nominal repair', dotColor: radDose > 0.2 ? '#f59e0b' : '#22c55e', noGraph: true },
                ]}
              />

              {/* 9. Thrombosis & Vascular Risk (6 Signals) */}
              <CategoryCard
                title="9. Thrombosis & Vascular"
                icon={<VascularIcon />}
                statusPill={{ label: trm >= 1.50 ? 'Attention' : 'Nominal', color: trm >= 1.50 ? '#f59e0b' : '#22c55e' }}
                {...commonCardProps}
                rows={[
                  { label: 'Thrombosis risk metric', metricId: 'trm', unit: 'ratio', baselineValue: 1.02, value: trm.toFixed(2), dotColor: trm >= 1.50 ? '#f59e0b' : '#22c55e', trend: trm >= 1.50 ? 'up' : 'stable', history: metricHistories['trm'] },
                  { label: 'Fibrinogen level', metricId: 'fibrinogen', unit: 'mg/dL', baselineValue: defaultProfile.fibrinogen, value: fibrinogenVal, dotColor: '#22c55e', history: metricHistories['fibrinogen'] },
                  { label: 'L-selectin adhesion', metricId: 'l_selectin', unit: 'ng/mL', baselineValue: 740, value: labProfile?.cardiovascular?.l_selectin?.value ? `${(labProfile.cardiovascular.l_selectin.value / 1000).toFixed(0)} ng/mL` : '740 ng/mL', dotColor: '#94a3b8', history: metricHistories['l_selectin'] },
                  { label: 'Platelet factor 4 (PF4)', metricId: 'pf4', unit: 'ng/mL', baselineValue: 320, value: labProfile?.cardiovascular?.pf4?.value ? `${labProfile.cardiovascular.pf4.value.toFixed(0)} ng/mL` : '320 ng/mL', dotColor: '#94a3b8', history: metricHistories['pf4'] },
                  { label: 'Venous stasis status', value: trm >= 1.50 ? 'Cephalic stasis' : 'Normal flow', dotColor: trm >= 1.50 ? '#f59e0b' : '#22c55e', noGraph: true },
                  { label: 'Cephalic hemoconcentration', value: '-0.6 kg fluid shift', dotColor: '#94a3b8', noGraph: true },
                ]}
              />

              {/* 10. Integrated Clinical Directive & AI Surgeon (4 Signals) */}
              <CategoryCard
                title="10. Integrated Directives & AI Surgeon"
                icon={<DirectivesIcon />}
                statusPill={{
                  label: severity === 'CRITICAL' ? 'Critical' : severity === 'WARNING' ? 'Attention' : 'Stable',
                  color: severity === 'CRITICAL' ? '#ef4444' : severity === 'WARNING' ? '#f59e0b' : '#22c55e',
                }}
                {...commonCardProps}
                rows={[
                  { label: 'Early sepsis cascade (EPI)', metricId: 'epi', unit: 'idx', baselineValue: 0.05, value: (currentPacket?.computed_epi ?? 0.05).toFixed(2), dotColor: (currentPacket?.computed_epi ?? 0) > 0.8 ? '#ef4444' : '#22c55e', history: metricHistories['epi'] },
                  {
                    label: 'Primary diagnosis',
                    value: severity === 'CRITICAL' ? 'Acute Physiological Anomaly' : severity === 'WARNING' ? 'Moderate Baseline Strain' : 'Equilibrium baseline',
                    dotColor: severity === 'CRITICAL' ? '#ef4444' : severity === 'WARNING' ? '#f59e0b' : '#22c55e',
                    noGraph: true,
                  },
                  {
                    label: 'Actionable directive',
                    value: severity === 'CRITICAL' ? 'Initiate clinical countermeasure' : severity === 'WARNING' ? 'Schedule rest & hydration' : 'Continue mission activities',
                    dotColor: '#22c55e',
                    noGraph: true,
                  },
                  { label: 'Autonomous decision sentry', value: 'Online (Ollama BioMistral)', dotColor: '#94a3b8', noGraph: true },
                ]}
              />
            </div>
          </div>

          {/* Right Column: Dedicated Full-Height Sidebar */}
          <aside
            style={{
              backgroundColor: '#101010',
              borderLeft: '1px solid #222222',
              padding: '20px 18px 80px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {/* ── DEVICE NETWORK PANEL ─────────────────────────────── */}
            <div style={{ fontFamily: "'Tomorrow', sans-serif" }}>
              {/* Panel Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Tomorrow', sans-serif" }}>
                    Device Network
                  </div>
                  <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', lineHeight: 1.3, fontFamily: "'Tomorrow', sans-serif" }}>
                    Sensor, diagnostic and research sources
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    border: '1px solid rgba(87,214,141,0.40)', borderRadius: '8px',
                    padding: '4px 8px', fontSize: '10px',
                    background: '#181818', whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#57d68d', boxShadow: '0 0 6px rgba(87,214,141,0.65)', display: 'block', flexShrink: 0 }} />
                    <span style={{ color: '#57d68d', fontWeight: 600, fontFamily: "'Tomorrow', sans-serif", letterSpacing: '0.04em' }}>CONNECTED</span>
                  </div>
                  <span style={{ fontSize: '9px', color: '#94a3b8', fontFamily: "'Tomorrow', sans-serif" }}>
                    <span style={{ fontFamily: 'var(--hud-font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>{filteredDevices.length}</span> shown • <span style={{ fontFamily: 'var(--hud-font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>{filteredDevices.filter(d => d.mode === 'CONTINUOUS' && (d.status === 'Connected' || d.status === 'Streaming')).length}</span> streaming
                  </span>
                </div>
              </div>

              {/* Category Filter Tabs */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', flexWrap: 'wrap' }}>
                {(['All', 'Wearable', 'Environment', 'Diagnostics', 'Performance', 'Research', 'Computational'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => { setDeviceFilter(filter); setExpandedDeviceId(null); }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '8px',
                      fontSize: '9px',
                      fontWeight: 600,
                      border: deviceFilter === filter ? '1px solid #666666' : '1px solid #282828',
                      background: deviceFilter === filter ? '#2a2a2a' : '#181818',
                      color: deviceFilter === filter ? '#ffffff' : '#94a3b8',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      fontFamily: "'Tomorrow', sans-serif",
                      letterSpacing: '0.03em',
                      boxShadow: deviceFilter === filter ? '0 0 8px rgba(255, 255, 255, 0.12)' : 'none',
                    }}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Section hint */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9px', color: '#94a3b8', marginBottom: '8px', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Tomorrow', sans-serif" }}>
                <span>{deviceFilter === 'All' ? 'All Devices' : `${deviceFilter} Devices`}</span>
                <span>Click to expand</span>
              </div>

              {/* Device Accordion List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '520px', overflowY: 'auto', paddingRight: '2px' }}>
                {filteredDevices.map((dev) => {
                  const isOpen = expandedDeviceId === dev.id;
                  const statusColor =
                    dev.status === 'Connected' || dev.status === 'Streaming' ? '#57d68d'
                    : dev.status === 'Calibrated' || dev.status === 'Ready' || dev.status === 'Nominal' ? '#e2e8f0'
                    : '#f4c15d';
                  const statusBg =
                    dev.status === 'Connected' || dev.status === 'Streaming' ? 'rgba(87,214,141,0.10)'
                    : 'rgba(255,255,255,0.06)';
                  const statusBorder =
                    dev.status === 'Connected' || dev.status === 'Streaming' ? 'rgba(87,214,141,0.30)'
                    : 'rgba(255,255,255,0.14)';
                  const modeBg = dev.mode === 'CONTINUOUS' || dev.mode === 'COMPUTED' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';

                  return (
                    <button
                      key={dev.id}
                      onClick={() => toggleDeviceExpand(dev.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: isOpen ? '1px solid #555555' : '1px solid #282828',
                        background: isOpen ? '#222222' : '#181818',
                        color: '#e8f1f7',
                        borderRadius: '10px',
                        padding: '10px 11px',
                        cursor: 'pointer',
                        transition: 'border-color 0.18s ease, background 0.18s ease',
                        boxShadow: isOpen ? '0 4px 16px rgba(0, 0, 0, 0.7)' : '0 2px 8px rgba(0, 0, 0, 0.4)',
                        fontFamily: "'Tomorrow', sans-serif",
                      }}
                    >
                      {/* ── Collapsed Header Row ── */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px' }}>
                            {renderDeviceIcon(dev.iconType)}
                            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Tomorrow', sans-serif" }}>
                              {dev.name}
                            </span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: 1.4, marginBottom: '6px', paddingLeft: '25px', fontFamily: "'Tomorrow', sans-serif" }}>
                            {dev.purpose}
                          </div>
                          {/* Badges Row */}
                          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', paddingLeft: '25px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #333333', borderRadius: '999px', padding: '2px 7px', fontSize: '9px', letterSpacing: '0.04em', textTransform: 'uppercase', background: '#121212', color: '#b0bec5', fontFamily: "'Tomorrow', sans-serif" }}>
                              {dev.category}
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '999px', padding: '2px 7px', fontSize: '9px', letterSpacing: '0.04em', textTransform: 'uppercase', background: modeBg, color: '#e2e8f0', fontFamily: "'Tomorrow', sans-serif" }}>
                              {dev.mode}
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: `1px solid ${statusBorder}`, borderRadius: '999px', padding: '2px 7px', fontSize: '9px', letterSpacing: '0.04em', background: statusBg, color: statusColor, fontFamily: "'Tomorrow', sans-serif" }}>
                              {dev.status}
                            </span>
                          </div>
                        </div>
                        {/* Expand chevron */}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7a93a8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          style={{ flexShrink: 0, marginTop: '3px', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>

                      {/* ── Expanded Detail Panel ── */}
                      {isOpen && (
                        <div style={{ borderTop: '1px solid #2c2c2c', marginTop: '10px', paddingTop: '10px', fontFamily: "'Tomorrow', sans-serif" }}>
                          {/* Info Grid: Category / Mode / Status / Signal */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                            {[
                              ['Category', dev.category],
                              ['Mode', dev.mode],
                              ['Status', dev.status],
                              ['Signal', dev.signal],
                            ].map(([k, v]) => (
                              <div key={k} style={{ border: '1px solid #282828', borderRadius: '7px', padding: '7px 8px', background: '#121212' }}>
                                <div style={{ fontSize: '8px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px', fontFamily: "'Tomorrow', sans-serif" }}>{k}</div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#e8f1f7', fontFamily: "'Tomorrow', sans-serif" }}>{v}</div>
                              </div>
                            ))}
                          </div>

                          {/* What it measures */}
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ fontSize: '8px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'Tomorrow', sans-serif" }}>What it measures</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {dev.measures.map((m) => (
                                <span key={m} style={{ border: '1px solid #2e2e2e', borderRadius: '6px', padding: '3px 7px', fontSize: '9.5px', background: '#141414', color: '#cbd5e1', fontFamily: "'Tomorrow', sans-serif" }}>{m}</span>
                              ))}
                            </div>
                          </div>

                          {/* Current readings */}
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ fontSize: '8px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'Tomorrow', sans-serif" }}>Current / latest readings</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                              {dev.readings.map(([name, val]) => (
                                <div key={name} style={{ border: '1px solid #282828', borderRadius: '7px', padding: '6px 8px', background: '#121212' }}>
                                  <div style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Tomorrow', sans-serif" }}>{name}</div>
                                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#e8f1f7', marginTop: '3px' }}>
                                    <FormattedMetricValue value={val} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Used by health domains */}
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ fontSize: '8px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'Tomorrow', sans-serif" }}>Feeds health domains</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {dev.usedBy.map((domain) => (
                                <span key={domain} style={{ border: '1px solid #383838', borderRadius: '6px', padding: '3px 7px', fontSize: '9.5px', background: '#222222', color: '#e2e8f0', fontFamily: "'Tomorrow', sans-serif" }}>{domain}</span>
                              ))}
                            </div>
                          </div>

                          {/* Footer: Signal quality + last updated */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9px', color: '#7a93a8', marginTop: '4px', fontFamily: "'Tomorrow', sans-serif" }}>
                            <span>Signal: {dev.signal}</span>
                            <span>Updated {dev.updated}</span>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tri-Level Clinical Directives & Alert Sentry */}
            <div
              style={{
                backgroundColor: '#181818',
                border: `1px solid ${clinicalSummary.isAbnormal ? clinicalSummary.primaryConcern.borderColor : '#282828'}`,
                borderRadius: '12px',
                padding: '14px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
                fontFamily: "'Tomorrow', sans-serif",
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Tomorrow', sans-serif" }}>
                  Clinical Directives &amp; Sentry
                </div>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '3px',
                    color: clinicalSummary.trajectory.color,
                    background: `${clinicalSummary.trajectory.color}15`,
                    border: `1px solid ${clinicalSummary.trajectory.color}35`,
                    fontFamily: "'Tomorrow', sans-serif",
                  }}
                >
                  {clinicalSummary.severity}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '10px' }}>
                {/* LEVEL 1: CRITICAL DIRECTIVE (If active) */}
                {clinicalSummary.isAbnormal && (
                  <div style={{ borderLeft: `2px solid ${clinicalSummary.primaryConcern.color}`, paddingLeft: '8px', background: `${clinicalSummary.primaryConcern.color}10`, padding: '6px 8px', borderRadius: '0 4px 4px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <span style={{ color: '#737373' }}>ACTIVE</span>
                      <span style={{ color: clinicalSummary.primaryConcern.color, fontWeight: 700 }}>
                        {clinicalSummary.primaryConcern.title}
                      </span>
                    </div>
                    <div style={{ color: '#f1f5f9', fontWeight: 500, lineHeight: 1.35 }}>
                      {clinicalSummary.decisionSupport.recommendedAction}
                    </div>
                  </div>
                )}

                {/* LEVEL 2: WATCH & SENSORS */}
                <div style={{ borderLeft: '2px solid #f59e0b', paddingLeft: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#737373' }}>14:28</span>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>Circadian &amp; Autonomic Sentry</span>
                  </div>
                  <div style={{ color: '#888888', marginTop: '2px' }}>
                    {computeBiomarkerDelta(hrv, defaultProfile.restHrv, 'ms').deltaStr
                      ? `Sleep score: ${sleep.toFixed(0)}/100 · HRV: ${hrv.toFixed(0)} ms (${computeBiomarkerDelta(hrv, defaultProfile.restHrv, 'ms').deltaStr})`
                      : `Sleep score: ${sleep.toFixed(0)}/100 · HRV: ${hrv.toFixed(0)} ms`}
                  </div>
                </div>

                <div style={{ borderLeft: '2px solid #22c55e', paddingLeft: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#737373' }}>12:15</span>
                    <span style={{ color: '#22c55e', fontWeight: 600 }}>Countermeasure Protocol Gate</span>
                  </div>
                  <div style={{ color: '#888888', marginTop: '2px' }}>
                    Mission state: {currentPacket?.mission_state || 'REST'} · Exertional telemetry calibrated.
                  </div>
                </div>

                {/* LEVEL 3: NASA OSDR & DOSIMETRY AUDIT */}
                <div style={{ borderLeft: '2px solid #94a3b8', paddingLeft: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#737373' }}>09:42</span>
                    <span style={{ color: '#cbd5e1', fontWeight: 600 }}>NASA OSDR Assays Synchronized</span>
                  </div>
                  <div style={{ color: '#888888', marginTop: '2px' }}>
                    OSD-569 &amp; OSD-575 baseline verified for {activeCrew.name} ({activeCrew.subjectId}).
                  </div>
                </div>

                <div style={{ borderLeft: '2px solid #94a3b8', paddingLeft: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#737373' }}>08:11</span>
                    <span style={{ color: '#cbd5e1', fontWeight: 600 }}>Deep-Space Dosimetry</span>
                  </div>
                  <div style={{ color: '#888888', marginTop: '2px' }}>
                    Flux: {radFlux >= 1 ? radFlux.toFixed(0) : radFlux.toFixed(2)} mSv/h · Cumulative: {radDose.toFixed(2)} Gy.
                  </div>
                </div>
              </div>
            </div>

            {/* Clinical Timeline: Situational Context ("What happened before this change?") */}
            <ClinicalTimeline
              astronautId={selectedId}
              astronautName={activeCrew.name}
              telemetry={currentPacket}
              clinicalSummary={clinicalSummary}
              latestAlert={latestAlert}
            />
          </aside>
        </div>
      </div>

      {/* Deep Analysis Slide-Over Modal */}
      {deepAnalysisTarget && (
        <DeepAnalysisModal
          isOpen={Boolean(deepAnalysisTarget)}
          onClose={() => setDeepAnalysisTarget(null)}
          astronautName={activeCrew.name}
          astronautCallsign={activeCrew.callsign}
          astronautAvatar={activeCrew.avatar}
          metricLabel={deepAnalysisTarget.metricLabel}
          currentValue={deepAnalysisTarget.currentValue}
          unit={deepAnalysisTarget.unit}
          baselineValue={deepAnalysisTarget.baselineValue}
          history={deepAnalysisTarget.history}
          dotColor={deepAnalysisTarget.dotColor}
          category={deepAnalysisTarget.category}
        />
      )}

      {/* Clinical Intelligence Slide-Over Drawer (5 Operational Reasoning Tiers) */}
      <ClinicalIntelligenceDrawer
        isOpen={isAnalysisDrawerOpen}
        onClose={() => setIsAnalysisDrawerOpen(false)}
        clinicalSummary={clinicalSummary}
        astronautName={activeCrew.name}
        astronautRole={activeCrew.role}
        subjectId={activeCrew.subjectId}
        avatar={activeCrew.avatar}
      />
    </div>
  );
};

/* ── REUSABLE CATEGORY CARD COMPONENT WITH PROGRESSIVE DISCLOSURE ────────── */
interface CategoryRowItem {
  label: string;
  value: string;
  dotColor: string;
  trend?: 'up' | 'down' | 'stable';
  history?: number[];
  noGraph?: boolean;
  isCritical?: boolean;
  isWarning?: boolean;
  metricId?: string;
  baselineValue?: number | string;
  unit?: string;
}

interface CategoryCardProps {
  title: string;
  icon: React.ReactNode;
  statusPill?: { label: string; color: string };
  rows: CategoryRowItem[];
  actionButton?: { label: string; onClick: () => void };
  customHeaderRight?: React.ReactNode;
  expandedBiomarkerKey?: string | null;
  onToggleRowExpand?: (rowKey: string) => void;
  onOpenDeepAnalysis?: (target: {
    metricLabel: string;
    currentValue: string;
    unit: string;
    baselineValue?: number | string;
    history?: number[];
    dotColor: string;
    category: string;
  }) => void;
  isFastForward?: boolean;
}

const CategoryBiomarkerRow: React.FC<{
  cardTitle: string;
  row: CategoryRowItem;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenDeepAnalysis?: (target: {
    metricLabel: string;
    currentValue: string;
    unit: string;
    baselineValue?: number | string;
    history?: number[];
    dotColor: string;
    category: string;
  }) => void;
  isFastForward?: boolean;
}> = ({ cardTitle, row, isExpanded, onToggleExpand, onOpenDeepAnalysis, isFastForward }) => {
  const cadence = getBiomarkerCadence(row.metricId || row.label);
  const { countdownText, isUpdating } = usePeriodicCadence(cadence.intervalHours, isFastForward);

  const isCritical = row.isCritical ?? (
    row.dotColor === '#ef4444' ||
    row.dotColor.toLowerCase().includes('ef4444') ||
    row.dotColor.toLowerCase().includes('dc2626') ||
    row.dotColor.toLowerCase().includes('red')
  );

  const isWarning = row.isWarning ?? (
    !isCritical && (
      row.dotColor === '#f59e0b' ||
      row.dotColor === '#f97316' ||
      row.dotColor === '#eab308' ||
      row.dotColor.toLowerCase().includes('f59e0b') ||
      row.dotColor.toLowerCase().includes('f97316') ||
      row.dotColor.toLowerCase().includes('orange') ||
      row.dotColor.toLowerCase().includes('amber')
    )
  );

  const isIssue = isCritical || isWarning;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '6px',
        backgroundColor: isCritical
          ? 'rgba(239, 68, 68, 0.12)'
          : isWarning
          ? 'rgba(239, 68, 68, 0.06)'
          : isExpanded
          ? 'rgba(255, 255, 255, 0.05)'
          : 'transparent',
        border: isCritical
          ? '1px solid rgba(239, 68, 68, 0.38)'
          : isWarning
          ? '1px solid rgba(239, 68, 68, 0.22)'
          : isExpanded
          ? '1px solid rgba(56, 189, 248, 0.35)'
          : '1px solid transparent',
        transition: 'all 150ms ease',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={onToggleExpand}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          minHeight: '28px',
          boxSizing: 'border-box',
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: '11px',
          backgroundColor: isExpanded ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
          borderBottom: isExpanded ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
        }}
        title="Click to view historical trend & deeper analysis"
      >
        {/* Left: Metric Name + Alert Icon if active */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
          {isCritical ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : isWarning ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : null}
          <span
            style={{
              color: isCritical ? '#f87171' : isWarning ? '#fca5a5' : '#a3a3a3',
              fontWeight: isIssue ? 600 : 400,
              letterSpacing: '0.01em',
              fontFamily: "'Tomorrow', sans-serif",
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={row.label}
          >
            {row.label}
          </span>
        </div>

        {/* Right Cluster: [Value with Status Dot] + [Cadence Badge] + [Chevron] */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Real-time Status Dot + Tabular Numeral Value with Sans-Serif Text Beside Numbers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: row.dotColor,
                flexShrink: 0,
                boxShadow: isCritical
                  ? '0 0 8px #ef4444'
                  : isWarning
                  ? '0 0 6px #f87171'
                  : `0 0 6px ${row.dotColor}80`,
              }}
            />
            <span
              style={{
                color: isCritical ? '#fca5a5' : isWarning ? '#ffffff' : '#f5f5f5',
                fontWeight: isIssue ? 700 : 600,
                whiteSpace: 'nowrap',
              }}
              title={typeof row.value === 'string' ? row.value : undefined}
            >
              <FormattedMetricValue value={row.value} />
            </span>
          </div>

          {/* Subtle Cadence Badge / Periodic Countdown Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
            {cadence.isContinuous ? (
              <span
                style={{
                  fontSize: '8px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  letterSpacing: '0.03em',
                  fontFamily: "'Tomorrow', sans-serif",
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                title="Continuous high-frequency telemetry streaming (1 Hz)"
              >
                CONTINUOUS
              </span>
            ) : isUpdating ? (
              <span
                style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  color: '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.40)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  letterSpacing: '0.03em',
                  fontFamily: 'var(--hud-font-mono, monospace)',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                UPDATING...
              </span>
            ) : (
              <span
                style={{
                  fontSize: '8px',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.10)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  letterSpacing: '0.02em',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  gap: '3px',
                }}
                title={`Cadence: ${cadence.badgeLabel}. Next automated cycle in ${countdownText}`}
              >
                <span style={{ fontFamily: 'var(--hud-font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
                  {cadence.mode === 'LAB' ? `LAB ${cadence.intervalHours}` : cadence.intervalHours}
                </span>
                <span style={{ fontFamily: "'Tomorrow', sans-serif" }}>h •</span>
                <span style={{ fontFamily: 'var(--hud-font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
                  {countdownText}
                </span>
              </span>
            )}

            {/* Small chevron indicating expandable trend */}
            <span
              style={{
                fontSize: '8px',
                color: isExpanded ? '#38bdf8' : '#64748b',
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 180ms ease',
                flexShrink: 0,
              }}
            >
              ▼
            </span>
          </div>
        </div>
      </div>

      {/* Expanded Inline Trend Drawer */}
      {isExpanded && (
        <InlineTrendDrawer
          metricId={row.metricId || row.label}
          metricLabel={row.label}
          currentValue={row.value}
          baselineValue={row.baselineValue}
          unit={row.unit}
          dotColor={row.dotColor}
          history={row.history}
          cadenceLabel={cadence.isContinuous ? 'CONTINUOUS' : cadence.mode === 'LAB' ? `LAB ${cadence.intervalHours}h` : `${cadence.intervalHours}h`}
          onOpenDeepAnalysis={() => {
            if (onOpenDeepAnalysis) {
              onOpenDeepAnalysis({
                metricLabel: row.label,
                currentValue: row.value,
                unit: row.unit || '',
                baselineValue: row.baselineValue,
                history: row.history,
                dotColor: row.dotColor,
                category: cardTitle,
              });
            }
          }}
          onClose={onToggleExpand}
        />
      )}
    </div>
  );
};

const CategoryCard: React.FC<CategoryCardProps> = ({
  title,
  icon,
  statusPill,
  rows,
  actionButton,
  customHeaderRight,
  expandedBiomarkerKey,
  onToggleRowExpand,
  onOpenDeepAnalysis,
  isFastForward,
}) => {
  return (
    <div
      style={{
        backgroundColor: '#181818',
        border: '1px solid #282828',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }}
    >
      {/* Title Header with Professional Icon + Status Pill */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {icon}
            </div>
            <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.01em', color: '#ffffff', fontFamily: "'Tomorrow', sans-serif" }}>
              {title}
            </span>
          </div>

          {statusPill && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '9999px',
                backgroundColor: `${statusPill.color}1a`,
                color: statusPill.color,
                border: `1px solid ${statusPill.color}40`,
                letterSpacing: '0.02em',
                fontFamily: "'Tomorrow', sans-serif",
              }}
            >
              {statusPill.label}
            </span>
          )}
        </div>
        {customHeaderRight}
      </div>

      {/* Metric Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {rows.map((row, i) => {
          const rowKey = `${title}_${row.label}`;
          const isExpanded = expandedBiomarkerKey === rowKey;

          return (
            <CategoryBiomarkerRow
              key={row.label + i}
              cardTitle={title}
              row={row}
              index={i}
              isExpanded={isExpanded}
              onToggleExpand={() => {
                if (onToggleRowExpand) {
                  onToggleRowExpand(rowKey);
                }
              }}
              onOpenDeepAnalysis={onOpenDeepAnalysis}
              isFastForward={isFastForward}
            />
          );
        })}
      </div>

      {/* Expand / Collapse Button if available */}
      {actionButton && (
        <button
          onClick={actionButton.onClick}
          style={{
            marginTop: '4px',
            padding: '5px',
            borderRadius: '6px',
            border: '1px solid #333333',
            backgroundColor: '#141414',
            color: '#cbd5e1',
            fontSize: '10px',
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.15s ease',
            fontFamily: "'Tomorrow', sans-serif",
            letterSpacing: '0.02em',
          }}
        >
          {actionButton.label}
        </button>
      )}
    </div>
  );
};

/* ── SHARP PROFESSIONAL SVG CATEGORY ICONS ────────────────────────────────── */
const HeartIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#f43f5e" stroke="#f43f5e" strokeWidth="1.2">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  </svg>
);

const LungsIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 4v8M12 7c-2 0-5 1-6 4v6c0 1.5 1.5 3 3 3h1c1.5 0 2-2 2-4V9" />
    <path d="M12 7c2 0 5 1 6 4v6c0 1.5-1.5 3-3 3h-1c-1.5 0-2-2-2-4V9" />
  </svg>
);

const TempIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
  </svg>
);

const BrainIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.8" strokeLinecap="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-5.04z" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-5.04z" />
  </svg>
);

const DropIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
);

const FlaskIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round">
    <path d="M10 2v7.31L4.62 17.5A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.68-3.5L14 9.31V2" />
    <line x1="8" y1="2" x2="16" y2="2" />
    <line x1="7" y1="15" x2="17" y2="15" />
  </svg>
);

const ShieldIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const RadiationIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
);

const VascularIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.8" strokeLinecap="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const DirectivesIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round">
    <path d="M3 3v18h18" />
  </svg>
);

