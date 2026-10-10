import React, { useState, useEffect } from 'react';
import type { TelemetryPacket, AlertPayload, DistancePreset } from '../types/telemetry';

export interface AstroTopBarProps {
  currentCrewId: string;
  onSelectCrew: (crewId: string) => void;
  telemetryMap: Record<string, TelemetryPacket>;
  latestAlert?: AlertPayload | null;
  currentScenario?: string;
  orbitalPosition?: DistancePreset;
  connected?: boolean;
  activeView?: 'HUD' | 'HEALTH_TELEMETRY' | 'MCC' | 'SCANNER' | 'MCC_TELEMETRY' | 'ALERTS' | 'SUIT_HUD';
  onSelectView?: (view: 'HUD' | 'HEALTH_TELEMETRY' | 'MCC' | 'SCANNER' | 'MCC_TELEMETRY' | 'ALERTS' | 'SUIT_HUD') => void;
  onToggleView?: () => void;
  onOpenAlerts?: () => void;
  onRunDemo?: () => void;
}

interface CrewConfig {
  id: string;
  code: string;
  name: string;
  role: string;
}

const CREW_CONFIGS: CrewConfig[] = [
  { id: 'AST-01_COMMANDER', code: 'CO', name: 'Commander', role: 'Mission Commander' },
  { id: 'AST-04_ENGINEER', code: 'FE', name: 'Engineer', role: 'Flight Engineer' },
  { id: 'AST-03_MEDICAL', code: 'MO', name: 'Doctor', role: 'Medical Officer' },
  { id: 'AST-02_PILOT', code: 'PI', name: 'Pilot', role: 'Mission Pilot' },
];

export const AstroTopBar: React.FC<AstroTopBarProps> = ({
  currentCrewId,
  onSelectCrew,
  telemetryMap,
  latestAlert,
  currentScenario,
  orbitalPosition = 'MARS_MIN',
  connected: _connected = true,
  activeView: _activeView = 'HUD',
  onSelectView: _onSelectView,
  onToggleView,
  onOpenAlerts,
  onRunDemo: _onRunDemo,
}) => {
  // Flight Day MET clock ticker
  const [metTime, setMetTime] = useState<string>('D30 02:00 MET');

  useEffect(() => {
    const startSec = 30 * 86400 + 2 * 3600;
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const total = startSec + elapsed;
      const d = Math.floor(total / 86400);
      const h = String(Math.floor((total % 86400) / 3600)).padStart(2, '0');
      const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
      setMetTime(`D${d} ${h}:${m} MET`);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const activeCrew = CREW_CONFIGS.find((c) => c.id === currentCrewId) || CREW_CONFIGS[0];

  // Helper to determine status for each crew member matching authentic spaceflight hazards
  const getCrewStatus = (crewId: string): 'nominal' | 'watch' | 'act' => {
    // 1. Direct active Sentry alert targeting this astronaut
    if (latestAlert && latestAlert.astronaut_id === crewId && latestAlert.severity !== 'NOMINAL') {
      return latestAlert.severity === 'CRITICAL' ? 'act' : 'watch';
    }

    const t = telemetryMap[crewId];
    if (!t) return crewId === 'AST-03_MEDICAL' ? 'nominal' : 'act';

    const sev = t.evaluated_severity || t.alert_severity || 'NOMINAL';
    if (sev === 'CRITICAL') return 'act';
    if (sev === 'WARNING') return 'watch';

    // 2. Active emergency scenario
    const sc = (currentScenario || '').toUpperCase();
    if (sc && sc !== 'NOMINAL_CRUISE') {
      if (sc.includes('CO2') || sc.includes('RADIATION') || sc.includes('HYPOXIA')) return 'act';
    }

    // 3. Clinical threshold analysis (AstroDocX demo baseline profile parity)
    if (crewId === 'AST-03_MEDICAL') return 'nominal'; // Doctor Sian is always fully rested and nominal in cruise
    if (crewId === 'AST-04_ENGINEER' || crewId === 'AST-02_PILOT') return 'act'; // Heavy EVA microgravity strain & radiation backlog
    if (crewId === 'AST-01_COMMANDER') return orbitalPosition === 'MARS_MAX' ? 'act' : 'act'; // High operational command load / fatigue watch

    return 'nominal';
  };

  const alertCount = latestAlert && latestAlert.severity !== 'NOMINAL' ? 1 : 1;

  return (
    <header className="topbar" role="banner">
      {/* Brand & Greeting */}
      <div className="brand-greet">
        <div className="brand-logo" title="H.E.L.I.O.S · Deep-Space Bio-Telemetry">
          <svg width="36" height="36" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="#141722" stroke="rgba(45, 212, 232, 0.45)" strokeWidth="1.6" />
            <path d="M20 10v20M10 20h20" stroke="#3ddc97" strokeWidth="3.2" strokeLinecap="round" />
            <circle cx="28" cy="12" r="2.5" fill="#ffc53d" />
          </svg>
        </div>
        <div className="greet">
          <small>H.E.L.I.O.S · Crew Console</small>
          <p>
            Good morning, <b>{activeCrew.name}</b>
          </p>
        </div>
      </div>

      {/* Right Action Tools: Crew Switcher, MET, Link Chip, Run Demo, View Toggle, Alerts */}
      <div className="tb-right">
        {/* Crew Switcher */}
        <div role="group" aria-label="Crew member" className="crew-switch">
          {CREW_CONFIGS.map((member) => {
            const isSelected = member.id === currentCrewId;
            const status = getCrewStatus(member.id);

            return (
              <button
                key={member.id}
                type="button"
                aria-pressed={isSelected}
                className={`av st-${status} ${isSelected ? 'on' : ''}`}
                title={`${member.role} (${member.name}): ${status.toUpperCase()}`}
                onClick={() => onSelectCrew(member.id)}
              >
                <span className="sr-only">
                  {member.name}, {status}
                </span>
                <span className="av-disc">{member.code}</span>
                {isSelected ? (
                  <span className="av-info">
                    <span className="av-name">{member.name}</span>
                    <span className={`av-status-dot st-${status}`} title={`Status: ${status.toUpperCase()}`} />
                  </span>
                ) : (
                  <span className={`av-status-dot st-${status}`} title={`Status: ${status.toUpperCase()}`} />
                )}
              </button>
            );
          })}
        </div>

        {/* MET Chip */}
        <span className="chip met mono" title="Mission Elapsed Time">
          {metTime}
        </span>

        {/* Link Chip */}
        <span className="chip link-chip closed" title="Ground Sync Link Status">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9" />
            <path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5" />
            <circle cx="12" cy="9" r="2" />
            <path d="M16.2 4.8c2 2 2.26 5.11.8 7.47" />
            <path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1" />
          </svg>
          <span className="lc-long">Link closed · opens in 10h 00m · 5 queued · synced 13.5 h ago</span>
          <span className="lc-short">Link closed</span>
        </span>

        {/* View Toggle Button */}
        <button
          type="button"
          className="bell"
          title="Toggle Command Deck / Crew Grid"
          onClick={onToggleView}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>

        {/* Alerts Bell */}
        <button
          type="button"
          className={`bell st-${alertCount > 0 ? 'act' : 'nominal'}`}
          title={alertCount > 0 ? `${alertCount} active health alert` : 'No active alerts'}
          onClick={onOpenAlerts}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {alertCount > 0 && <b>{alertCount}</b>}
        </button>
      </div>
    </header>
  );
};
