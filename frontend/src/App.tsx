import { useEffect, useState, useRef, useCallback } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { CrewGrid } from './components/CrewGrid';
import { CabinEnvironmentalBar } from './components/CabinEnvironmentalBar';
import { ScenarioController } from './components/ScenarioController';
import { HealthTelemetryView } from './components/HealthTelemetryView';
import { MissionControlView } from './components/MissionControlView';
import { HolographicBodyScanner } from './components/HolographicBodyScanner';
import { BioTwinCommandDeck } from './components/BioTwinCommandDeck';
import { AlertsPageView } from './views/AlertsPageView';
import { SpaceBackground } from './components/SpaceBackground';
import { wsService } from './services/websocketService';
import {
  parseCurrentRoute,
  navigateTo,
  getSlugFromAstronautId,
} from './services/routerService';
import type { TelemetryPacket, AlertPayload, DistancePreset } from './types/telemetry';
import { DISTANCES, fmtTime } from './types/telemetry';

const DEFAULT_NOMINAL_TELEMETRY: Record<string, TelemetryPacket> = {
  'AST-01_COMMANDER': {
    timestamp: new Date().toISOString(),
    tick: 0,
    astronaut_id: 'AST-01_COMMANDER',
    astronaut_name: 'Haley',
    mission_state: 'REST',
    heart_rate: 60.0,
    hrv_rmssd: 68.0,
    spo2: 99.3,
    core_temp: 36.6,
    sleep_score: 92,
    cabin_co2: 1.82,
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
  },
  'AST-02_PILOT': {
    timestamp: new Date().toISOString(),
    tick: 0,
    astronaut_id: 'AST-02_PILOT',
    astronaut_name: 'Chris',
    mission_state: 'REST',
    heart_rate: 58.0,
    hrv_rmssd: 72.0,
    spo2: 98.5,
    core_temp: 36.7,
    sleep_score: 94,
    cabin_co2: 1.82,
    potassium: 4.3,
    hematocrit: 41.5,
    wbc_count: 6.5,
    platelet_count: 235,
    crp: 0.7,
    computed_qtc: 402,
    scenario_phase: 'NOMINAL_CRUISE',
    z_score_hr: 0.1,
    z_score_hrv: 0.1,
    evaluated_severity: 'NOMINAL',
  },
  'AST-03_MEDICAL': {
    timestamp: new Date().toISOString(),
    tick: 0,
    astronaut_id: 'AST-03_MEDICAL',
    astronaut_name: 'Dr. Sian',
    mission_state: 'REST',
    heart_rate: 66.0,
    hrv_rmssd: 58.0,
    spo2: 98.0,
    core_temp: 36.9,
    sleep_score: 89,
    cabin_co2: 1.82,
    potassium: 4.2,
    hematocrit: 40.8,
    wbc_count: 6.9,
    platelet_count: 245,
    crp: 0.9,
    computed_qtc: 410,
    scenario_phase: 'NOMINAL_CRUISE',
    z_score_hr: 0.2,
    z_score_hrv: 0.1,
    evaluated_severity: 'NOMINAL',
  },
  'AST-04_ENGINEER': {
    timestamp: new Date().toISOString(),
    tick: 0,
    astronaut_id: 'AST-04_ENGINEER',
    astronaut_name: 'Specialist Leo',
    mission_state: 'REST',
    heart_rate: 64.0,
    hrv_rmssd: 62.0,
    spo2: 98.3,
    core_temp: 36.8,
    sleep_score: 91,
    cabin_co2: 1.82,
    potassium: 4.3,
    hematocrit: 42.2,
    wbc_count: 6.6,
    platelet_count: 238,
    crp: 0.8,
    computed_qtc: 408,
    scenario_phase: 'NOMINAL_CRUISE',
    z_score_hr: 0.1,
    z_score_hrv: 0.1,
    evaluated_severity: 'NOMINAL',
  },
};

export function App() {
  // Parse initial route: '/' -> HUD; '/telemetry/:name' -> Health Telemetry; '/mcc' -> Earth MCC; '/mcc/telemetry/:name' -> Earth MCC Telemetry; '/scanner' -> 3D Hologram
  const initialRoute = parseCurrentRoute();
  const [activeView, setActiveView] = useState<'HUD' | 'HEALTH_TELEMETRY' | 'MCC' | 'SCANNER' | 'MCC_TELEMETRY' | 'ALERTS'>(initialRoute.view);
  const [activeTriageAstronautId, setActiveTriageAstronautId] = useState<string | null>(
    initialRoute.view === 'HEALTH_TELEMETRY' ? initialRoute.astronautId : null
  );
  const [activeAlertsAstronautId, setActiveAlertsAstronautId] = useState<string | null>(
    initialRoute.view === 'ALERTS' ? initialRoute.astronautId : null
  );
  const [activeMccAstronautId, setActiveMccAstronautId] = useState<string | null>(
    initialRoute.view === 'MCC_TELEMETRY' ? initialRoute.astronautId : null
  );
  const [scannerAstronautId, setScannerAstronautId] = useState<string>('AST-02_PILOT');
  const [dashboardMode, setDashboardMode] = useState<'3D_DECK' | 'CREW_GRID'>('3D_DECK');
  const [commandDeckAstronautId, setCommandDeckAstronautId] = useState<string>('AST-01_COMMANDER');

  const [connected, setConnected] = useState<boolean>(false);
  const [marsDelay, setMarsDelay] = useState<boolean>(false);
  const [orbitalPosition, setOrbitalPosition] = useState<DistancePreset>('MARS_MAX');
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);

  // ─── 1. SPACECRAFT ONBOARD TELEMETRY STATE (INSTANT, LOCAL 10 HZ, ZERO DELAY) ───
  const [telemetryMap, setTelemetryMap] = useState<Record<string, TelemetryPacket>>(
    () => JSON.parse(JSON.stringify(DEFAULT_NOMINAL_TELEMETRY))
  );
  const [latestAlert, setLatestAlert] = useState<AlertPayload | null>(null);
  const [currentScenario, setCurrentScenario] = useState<string>('NOMINAL_CRUISE');
  const bufferedPacketsRef = useRef<Record<string, TelemetryPacket>>(
    JSON.parse(JSON.stringify(DEFAULT_NOMINAL_TELEMETRY))
  );

  // ─── 2. EARTH MISSION CONTROL TELEMETRY STATE (SUBJECT TO LIGHT PROPAGATION DELAY) ───
  const [mccTelemetryMap, setMccTelemetryMap] = useState<Record<string, TelemetryPacket>>(
    () => JSON.parse(JSON.stringify(DEFAULT_NOMINAL_TELEMETRY))
  );
  const [mccAlert, setMccAlert] = useState<AlertPayload | null>(null);
  const [mccScenario, setMccScenario] = useState<string>('NOMINAL_CRUISE');
  const bufferedMccPacketsRef = useRef<Record<string, TelemetryPacket>>(
    JSON.parse(JSON.stringify(DEFAULT_NOMINAL_TELEMETRY))
  );

  // Deep-Space In-Transit Signal Tracking for Earth Ground Station
  const [inTransitSignal, setInTransitSignal] = useState<{
    scenarioKey: string;
    telemetry?: Record<string, any>;
    originPosition: DistancePreset;
    delaySec: number;
    remainingSec: number;
    startTime: number;
  } | null>(null);

  const inTransitSignalRef = useRef<typeof inTransitSignal>(null);
  const inTransitPacketsRef = useRef<Record<string, TelemetryPacket>>({});
  const inTransitAlertRef = useRef<AlertPayload | null>(null);
  const mccScenarioRef = useRef<string>(mccScenario);
  const orbitalPositionRef = useRef<DistancePreset>(orbitalPosition);
  const marsDelayRef = useRef<boolean>(marsDelay);
  const mccBaselineSnapshotRef = useRef<Record<string, TelemetryPacket>>(
    JSON.parse(JSON.stringify(DEFAULT_NOMINAL_TELEMETRY))
  );

  useEffect(() => {
    inTransitSignalRef.current = inTransitSignal;
  }, [inTransitSignal]);

  useEffect(() => {
    mccScenarioRef.current = mccScenario;
  }, [mccScenario]);

  useEffect(() => {
    orbitalPositionRef.current = orbitalPosition;
  }, [orbitalPosition]);

  useEffect(() => {
    marsDelayRef.current = marsDelay;
  }, [marsDelay]);

  // Synchronize browser history / URL with application view
  useEffect(() => {
    const handlePopState = () => {
      const route = parseCurrentRoute();
      setActiveView(route.view);
      if (route.view === 'ALERTS') {
        setActiveAlertsAstronautId(route.astronautId);
        setActiveTriageAstronautId(null);
        setActiveMccAstronautId(null);
      } else if (route.view === 'HEALTH_TELEMETRY') {
        setActiveTriageAstronautId(route.astronautId);
        setActiveMccAstronautId(null);
        setActiveAlertsAstronautId(null);
      } else if (route.view === 'MCC_TELEMETRY') {
        setActiveMccAstronautId(route.astronautId);
        setActiveTriageAstronautId(null);
        setActiveAlertsAstronautId(null);
      } else if (route.view === 'SCANNER') {
        setScannerAstronautId(route.astronautId || 'AST-02_PILOT');
        setActiveTriageAstronautId(null);
        setActiveMccAstronautId(null);
        setActiveAlertsAstronautId(null);
      } else {
        setActiveTriageAstronautId(null);
        setActiveMccAstronautId(null);
        setActiveAlertsAstronautId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    // 0. Seed initial telemetry data immediately so metrics are never empty on load
    fetch('/api/telemetry/latest-all')
      .then((res) => res.json())
      .then((data) => {
        if (data.telemetry) {
          const onboardData = JSON.parse(JSON.stringify(data.telemetry));
          const mccData = JSON.parse(JSON.stringify(data.telemetry));
          bufferedPacketsRef.current = onboardData;
          bufferedMccPacketsRef.current = mccData;
          mccBaselineSnapshotRef.current = JSON.parse(JSON.stringify(data.telemetry));
          setTelemetryMap(onboardData);
          setMccTelemetryMap(mccData);
          const firstPacket = Object.values(data.telemetry)[0] as TelemetryPacket | undefined;
          if (firstPacket && firstPacket.scenario_phase) {
            setCurrentScenario(firstPacket.scenario_phase);
            setMccScenario(firstPacket.scenario_phase);
            mccScenarioRef.current = firstPacket.scenario_phase;
          }
        }
      })
      .catch(() => {
        // Fallback handled by live WebSocket
      });

    // 1. Connect WebSocket
    wsService.connect();

    // 2. Subscribe to status
    const unsubStatus = wsService.subscribeStatus((isConnected) => {
      setConnected(isConnected);
    });

    // 3. Subscribe to 10 Hz Telemetry
    const unsubTelemetry = wsService.subscribeTelemetry((packet: TelemetryPacket) => {
      // Spacecraft onboard sensors are ALWAYS instant:
      bufferedPacketsRef.current[packet.astronaut_id] = packet;
      if (packet.scenario_phase) {
        setCurrentScenario((prev) => (prev === packet.scenario_phase ? prev : packet.scenario_phase));
      }

      // Deep-space delay check for Earth MCC:
      const delaySec = DISTANCES[orbitalPositionRef.current]?.delaySec ?? 0;
      const isDeepSpaceDelayed = delaySec > 0.05 || marsDelayRef.current;

      if (isDeepSpaceDelayed) {
        // If a scenario transmission is currently in flight OR if incoming packet is from a newer scenario:
        const isPacketInTransit =
          inTransitSignalRef.current !== null ||
          (Boolean(packet.scenario_phase) && packet.scenario_phase !== mccScenarioRef.current);

        if (isPacketInTransit) {
          // Quarantine new scenario packets into in-transit buffer
          inTransitPacketsRef.current[packet.astronaut_id] = packet;

          // Crucial: Earth MCC MUST NOT receive this packet!
          // Maintain the clean pre-scenario baseline packet for Earth MCC:
          if (mccBaselineSnapshotRef.current[packet.astronaut_id]) {
            bufferedMccPacketsRef.current[packet.astronaut_id] = {
              ...mccBaselineSnapshotRef.current[packet.astronaut_id],
            };
          }
          return;
        }
      }

      // Earth MCC receives packets directly when in LEO or matching the active Earth MCC phase:
      bufferedMccPacketsRef.current[packet.astronaut_id] = packet;
      if (packet.scenario_phase && !isDeepSpaceDelayed) {
        setMccScenario((prev) => (prev === packet.scenario_phase ? prev : packet.scenario_phase));
        mccScenarioRef.current = packet.scenario_phase;
      }
    });

    // 10 Hz state ticker (100ms) to update React components smoothly with real sensor data
    const telemetryInterval = setInterval(() => {
      if (Object.keys(bufferedPacketsRef.current).length > 0) {
        setTelemetryMap({ ...bufferedPacketsRef.current });
      }
      if (Object.keys(bufferedMccPacketsRef.current).length > 0) {
        setMccTelemetryMap({ ...bufferedMccPacketsRef.current });
      }
    }, 100);

    // 4. Subscribe to Proactive AI Surgeon Alerts
    const unsubAlert = wsService.subscribeAlert((alert: AlertPayload) => {
      // Spacecraft onboard alert is always instant:
      setLatestAlert(alert);

      // Deep-space delay check for Earth MCC:
      const delaySec = DISTANCES[orbitalPositionRef.current]?.delaySec ?? 0;
      const isDeepSpaceDelayed = delaySec > 0.05 || marsDelayRef.current;

      if (isDeepSpaceDelayed && (inTransitSignalRef.current !== null || alert.severity !== 'NOMINAL')) {
        inTransitAlertRef.current = alert;
      } else {
        setMccAlert(alert);
      }
    });

    return () => {
      clearInterval(telemetryInterval);
      unsubStatus();
      unsubTelemetry();
      unsubAlert();
      wsService.disconnect();
    };
  }, []);

  const handleOrbitalPositionChange = useCallback((pos: DistancePreset) => {
    setOrbitalPosition(pos);
    orbitalPositionRef.current = pos;
    const isDelayed = pos === 'MARS_MIN' || pos === 'MARS_MAX';
    setMarsDelay(isDelayed);
    marsDelayRef.current = isDelayed;
    fetch(`/api/mars-delay?enabled=${isDelayed}`, { method: 'POST' }).catch(() => {});

    // If switched to non-delayed position (e.g. LEO), immediately warp in-transit signal to Earth MCC:
    if (!isDelayed && inTransitSignalRef.current) {
      applyMccTelemetryUpdate(inTransitSignalRef.current.scenarioKey, inTransitSignalRef.current.telemetry);
    }
  }, []);

  const handleToggleMarsDelay = async (enabled: boolean) => {
    setMarsDelay(enabled);
    marsDelayRef.current = enabled;
    const newPos = enabled ? 'MARS_MAX' : 'LEO';
    setOrbitalPosition(newPos);
    orbitalPositionRef.current = newPos;
    try {
      await fetch(`/api/mars-delay?enabled=${enabled}`, { method: 'POST' });
    } catch {
      // Ignore
    }
    if (!enabled && inTransitSignalRef.current) {
      applyMccTelemetryUpdate(inTransitSignalRef.current.scenarioKey, inTransitSignalRef.current.telemetry);
    }
  };

  // Deliver delayed signal to Earth MCC Ground Station
  const applyMccTelemetryUpdate = useCallback((scenarioKey: string, telemetry?: Record<string, any>) => {
    setMccScenario(scenarioKey);
    mccScenarioRef.current = scenarioKey;

    if (telemetry && Object.keys(telemetry).length > 0) {
      bufferedMccPacketsRef.current = { ...bufferedMccPacketsRef.current, ...JSON.parse(JSON.stringify(telemetry)) };
    }
    if (Object.keys(inTransitPacketsRef.current).length > 0) {
      bufferedMccPacketsRef.current = { ...bufferedMccPacketsRef.current, ...JSON.parse(JSON.stringify(inTransitPacketsRef.current)) };
      inTransitPacketsRef.current = {};
    }
    mccBaselineSnapshotRef.current = JSON.parse(JSON.stringify(bufferedMccPacketsRef.current));
    setMccTelemetryMap({ ...bufferedMccPacketsRef.current });

    if (inTransitAlertRef.current) {
      setMccAlert(inTransitAlertRef.current);
      inTransitAlertRef.current = null;
    }
    inTransitSignalRef.current = null;
    setInTransitSignal(null);
  }, []);

  // Scenario Triggered: Spacecraft onboard responds INSTANTLY; Earth MCC enters in-transit delay
  const handleScenarioTriggered = useCallback((scenarioKey: string, telemetry?: Record<string, any>) => {
    // 1. Spacecraft Onboard: 100% instant update with zero latency
    setCurrentScenario(scenarioKey);
    if (telemetry && Object.keys(telemetry).length > 0) {
      bufferedPacketsRef.current = { ...bufferedPacketsRef.current, ...JSON.parse(JSON.stringify(telemetry)) };
      setTelemetryMap({ ...bufferedPacketsRef.current });
    }

    // 2. Earth MCC: Subject to deep-space radio propagation delay
    const currentPos = orbitalPositionRef.current;
    const delaySec = DISTANCES[currentPos]?.delaySec ?? 0;
    const isDelayed = (delaySec > 0.05 || marsDelayRef.current) && scenarioKey !== 'NOMINAL_CRUISE';

    if (!isDelayed) {
      applyMccTelemetryUpdate(scenarioKey, telemetry);
    } else {
      // Capture clean Earth MCC pre-scenario baseline IF no signal is currently in transit:
      if (!inTransitSignalRef.current && Object.keys(bufferedMccPacketsRef.current).length > 0) {
        mccBaselineSnapshotRef.current = JSON.parse(JSON.stringify(bufferedMccPacketsRef.current));
      }

      // If backend returned immediate scenario telemetry, buffer it into inTransitPacketsRef (NOT bufferedMccPacketsRef):
      if (telemetry && Object.keys(telemetry).length > 0) {
        Object.entries(telemetry).forEach(([id, pkt]) => {
          inTransitPacketsRef.current[id] = pkt;
        });
      }

      // Explicitly keep Earth MCC locked to the clean baseline!
      if (Object.keys(mccBaselineSnapshotRef.current).length > 0) {
        bufferedMccPacketsRef.current = JSON.parse(JSON.stringify(mccBaselineSnapshotRef.current));
        setMccTelemetryMap({ ...bufferedMccPacketsRef.current });
      }

      const calculatedDelay = delaySec > 0 ? delaySec : 1334.925;
      const newSignal = {
        scenarioKey,
        telemetry: telemetry || inTransitSignalRef.current?.telemetry,
        originPosition: currentPos,
        delaySec: calculatedDelay,
        remainingSec: inTransitSignalRef.current?.remainingSec ?? calculatedDelay,
        startTime: inTransitSignalRef.current?.startTime ?? Date.now(),
      };

      // Crucial: Update ref synchronously so any incoming WebSocket frames are held immediately!
      inTransitSignalRef.current = newSignal;
      setInTransitSignal(newSignal);
    }
  }, [applyMccTelemetryUpdate]);

  // Deep-space light propagation countdown ticker (accelerated by speedMultiplier)
  useEffect(() => {
    if (!inTransitSignal) return;

    const timer = setInterval(() => {
      const elapsedRealSec = (Date.now() - inTransitSignal.startTime) / 1000;
      const effectiveElapsed = elapsedRealSec * speedMultiplier;
      const remaining = Math.max(0, inTransitSignal.delaySec - effectiveElapsed);

      if (remaining <= 0) {
        applyMccTelemetryUpdate(inTransitSignal.scenarioKey, inTransitSignal.telemetry);
      } else {
        setInTransitSignal((prev) => (prev ? { ...prev, remainingSec: remaining } : null));
      }
    }, 100);

    return () => clearInterval(timer);
  }, [inTransitSignal, speedMultiplier, applyMccTelemetryUpdate]);

  const handleWarpSignal = useCallback(() => {
    const currentSignal = inTransitSignalRef.current || inTransitSignal;
    if (currentSignal) {
      applyMccTelemetryUpdate(currentSignal.scenarioKey, currentSignal.telemetry);
    }
  }, [inTransitSignal, applyMccTelemetryUpdate]);

  // Navigation Handlers with instant browser URL synchronization
  const handleOpenTriage = useCallback((astId: string) => {
    const slug = getSlugFromAstronautId(astId);
    setActiveTriageAstronautId(astId);
    setActiveView('HEALTH_TELEMETRY');
    navigateTo(`/telemetry/${slug}`);
  }, []);

  const handleCloseTelemetry = useCallback(() => {
    setActiveView('HUD');
    setActiveTriageAstronautId(null);
    navigateTo('/');
  }, []);

  const handleAstronautChange = useCallback((astId: string) => {
    const slug = getSlugFromAstronautId(astId);
    setActiveTriageAstronautId(astId);
    navigateTo(`/telemetry/${slug}`);
  }, []);

  // Earth MCC Dedicated Telemetry Console Navigation
  const handleOpenMccTelemetry = useCallback((astId: string) => {
    const slug = getSlugFromAstronautId(astId);
    setActiveMccAstronautId(astId);
    setActiveView('MCC_TELEMETRY');
    navigateTo(`/mcc/telemetry/${slug}`);
  }, []);

  const handleCloseMccTelemetry = useCallback(() => {
    setActiveView('MCC');
    setActiveMccAstronautId(null);
    navigateTo('/mcc');
  }, []);

  const handleMccAstronautChange = useCallback((astId: string) => {
    const slug = getSlugFromAstronautId(astId);
    setActiveMccAstronautId(astId);
    navigateTo(`/mcc/telemetry/${slug}`);
  }, []);

  const handleOpenAlerts = useCallback((astId?: string) => {
    const targetId = astId || activeAlertsAstronautId || commandDeckAstronautId || 'AST-01_COMMANDER';
    const slug = getSlugFromAstronautId(targetId);
    setActiveAlertsAstronautId(targetId);
    setActiveView('ALERTS');
    navigateTo(`/alerts/${slug}`);
  }, [activeAlertsAstronautId, commandDeckAstronautId]);

  const handleSelectView = useCallback(
    (view: 'HUD' | 'HEALTH_TELEMETRY' | 'MCC' | 'SCANNER' | 'MCC_TELEMETRY' | 'ALERTS' | 'SUIT_HUD') => {
      if (view === 'HUD') {
        setActiveView('HUD');
        setActiveTriageAstronautId(null);
        setActiveMccAstronautId(null);
        setActiveAlertsAstronautId(null);
        navigateTo('/');
      } else if (view === 'ALERTS') {
        const targetId = activeAlertsAstronautId || commandDeckAstronautId || 'AST-01_COMMANDER';
        const slug = getSlugFromAstronautId(targetId);
        setActiveView('ALERTS');
        setActiveAlertsAstronautId(targetId);
        navigateTo(`/alerts/${slug}`);
      } else if (view === 'MCC') {
        setActiveView('MCC');
        setActiveTriageAstronautId(null);
        setActiveMccAstronautId(null);
        setActiveAlertsAstronautId(null);
        navigateTo('/mcc');
      } else if (view === 'MCC_TELEMETRY') {
        const targetId = activeMccAstronautId || 'AST-01_COMMANDER';
        const slug = getSlugFromAstronautId(targetId);
        setActiveView('MCC_TELEMETRY');
        setActiveMccAstronautId(targetId);
        navigateTo(`/mcc/telemetry/${slug}`);
      } else if (view === 'SCANNER') {
        setActiveView('SCANNER');
        setActiveTriageAstronautId(null);
        setActiveMccAstronautId(null);
        setActiveAlertsAstronautId(null);
        navigateTo('/scanner');
      } else if ((view as string) === 'SUIT_HUD') {
        window.location.assign('/suit-hud');
      } else {
        const targetId = activeTriageAstronautId || 'AST-01_COMMANDER';
        const slug = getSlugFromAstronautId(targetId);
        setActiveView('HEALTH_TELEMETRY');
        setActiveTriageAstronautId(targetId);
        navigateTo(`/telemetry/${slug}`);
      }
    },
    [activeTriageAstronautId, activeMccAstronautId, activeAlertsAstronautId, commandDeckAstronautId]
  );

  // Deep-Space Telemetry Downlink In-Transit Status Ribbon (Strictly rendered within Earth MCC domain)
  const renderInTransitBanner = () => {
    if (!inTransitSignal) return null;
    return (
      <div
        style={{
          background: 'linear-gradient(90deg, rgba(6, 17, 32, 0.98) 0%, rgba(10, 25, 47, 0.98) 100%)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.45)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.85), 0 0 15px rgba(56, 189, 248, 0.2)',
          backdropFilter: 'blur(10px)',
          padding: '6px 20px',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          fontFamily: "var(--hud-font-mono, 'Tomorrow', monospace)",
          width: '100%',
          position: 'relative',
          zIndex: 150,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#38bdf8',
                boxShadow: '0 0 10px #38bdf8',
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.06em' }}>
              DEEP SPACE DOWNLINK IN-TRANSIT
            </span>
          </div>

          <span style={{ color: '#334155' }}>|</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
            <span style={{ color: '#64748b' }}>ORIGIN:</span>
            <span style={{ color: '#f8fafc', fontWeight: 600 }}>{DISTANCES[inTransitSignal.originPosition].label}</span>
            <span style={{ color: '#64748b' }}>({(DISTANCES[inTransitSignal.originPosition].km / 1e6).toFixed(1)}M km)</span>
          </div>

          <span style={{ color: '#334155' }}>|</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
            <span style={{ color: '#64748b' }}>SCENARIO:</span>
            <span style={{ color: '#fbbf24', fontWeight: 700 }}>
              {inTransitSignal.scenarioKey.replace(/^SCENARIO_\d+_/, '').replace(/_/g, ' ')}
            </span>
          </div>

          <span style={{ color: '#334155' }}>|</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
            <span style={{ color: '#64748b' }}>LIGHT TRAVEL REMAINING:</span>
            <span style={{ color: '#4ade80', fontWeight: 800, fontSize: 11 }}>
              {fmtTime(inTransitSignal.remainingSec)}
            </span>
            {speedMultiplier > 1 && (
              <span style={{ color: '#38bdf8', fontSize: 9 }}>({speedMultiplier}x speed)</span>
            )}
          </div>
        </div>

        <button
          onClick={handleWarpSignal}
          title="Accelerate light-speed propagation and instantly deliver the telemetry packet to Earth MCC"
          style={{
            background: 'rgba(56, 189, 248, 0.16)',
            border: '1px solid #38bdf8',
            borderRadius: 4,
            padding: '3px 10px',
            color: '#ffffff',
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
        >
          <span>WARP SIGNAL TO EARTH (INSTANT RECEPTION)</span>
        </button>
      </div>
    );
  };

  return (
    <>
      {/* GPU-Composited Photorealistic Earth Orbital Space Background */}
      <SpaceBackground activeView={activeView} />

      {/* ─── 1. FLIGHT HUD VIEW (DEFAULT HOME PAGE — 100% INSTANT SPACECRAFT DATA) ─── */}
      {activeView === 'HUD' && (
        <>
          {/* Top Sticky Main Navigation HeaderBar */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 200,
              overflow: 'visible',
              background: '#04080e',
              borderBottom: '1px solid rgba(0, 229, 255, 0.15)',
              width: '100%',
              backdropFilter: 'blur(16px)',
            }}
          >
            <div style={{ width: '100%', maxWidth: '1360px', margin: '0 auto', padding: '0 20px', boxSizing: 'border-box' }}>
              <HeaderBar
                connected={connected}
                marsDelay={false}
                orbitalPosition={orbitalPosition}
                speedMultiplier={speedMultiplier}
                activeView={activeView}
                onSelectView={handleSelectView}
                latestAlert={latestAlert}
                selectedAstronautId={commandDeckAstronautId}
              />
            </div>
            {dashboardMode === 'CREW_GRID' && (
              <CabinEnvironmentalBar
                telemetryMap={telemetryMap}
                currentScenario={currentScenario}
              />
            )}
          </div>

          <div
            style={{
              width: '100%',
              maxWidth: '1360px',
              margin: '0 auto',
              padding: dashboardMode === '3D_DECK' ? '0' : '16px 20px 72px',
              boxSizing: 'border-box',
              position: 'relative',
              zIndex: 1,
            }}
          >
            {dashboardMode === '3D_DECK' ? (
              <BioTwinCommandDeck
                telemetryMap={telemetryMap}
                latestAlert={latestAlert}
                activeAstronautId={commandDeckAstronautId}
                onSelectAstronaut={setCommandDeckAstronautId}
                onOpenTriage={handleOpenTriage}
                onOpenAlerts={handleOpenAlerts}
                onToggleViewMode={() => setDashboardMode('CREW_GRID')}
                currentScenario={currentScenario}
                orbitalPosition={orbitalPosition}
                connected={connected}
                activeView={activeView}
                onSelectView={handleSelectView}
              />
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setDashboardMode('3D_DECK')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '6px',
                      background: 'rgba(56, 189, 248, 0.16)',
                      border: '1px solid #38bdf8',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      letterSpacing: '0.04em',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(56, 189, 248, 0.28)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(56, 189, 248, 0.16)';
                    }}
                  >
                    <span>✦ RETURN TO 3D BIO-TWIN COMMAND DECK</span>
                  </button>
                </div>
                {/* Primary Flight HUD: 4-Row Crew Biometric Telemetry Grid with Inline ECG */}
                <CrewGrid
                  telemetryMap={telemetryMap}
                  onOpenTriage={handleOpenTriage}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── 2. ONBOARD SPACECRAFT HEALTH TELEMETRY & CLINICAL ANALYSIS (INSTANT) ─── */}
      {activeView === 'HEALTH_TELEMETRY' && (
        <>
          {/* AI Surgeon fixed bottom bar on telemetry page */}
          <HeaderBar
            jarvisOnly
            connected={connected}
            latestAlert={latestAlert}
            selectedAstronautId={activeTriageAstronautId || 'AST-01_COMMANDER'}
            activeView={activeView}
            onSelectView={handleSelectView}
          />
          <HealthTelemetryView
            initialAstronautId={activeTriageAstronautId || 'AST-01_COMMANDER'}
            telemetryMap={telemetryMap}
            marsDelay={false}
            connected={connected}
            latestAlert={latestAlert}
            onToggleMarsDelay={handleToggleMarsDelay}
            activeView={activeView}
            onSelectView={handleSelectView}
            onClose={handleCloseTelemetry}
            onAstronautChange={handleAstronautChange}
          />
        </>
      )}

      {/* ─── 3. EARTH MISSION CONTROL CENTER (MCC GROUND CONSOLE — DELAYED TELEMETRY) ─── */}
      {activeView === 'MCC' && (
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', backgroundColor: '#070a07' }}>
          {/* Top Sticky Header */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 200,
              overflow: 'visible',
              background: '#070a07',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              width: '100%',
            }}
          >
            <div style={{ maxWidth: '1250px', margin: '0 auto', padding: '0 20px' }}>
              <HeaderBar
                connected={connected}
                marsDelay={marsDelay}
                onToggleMarsDelay={handleToggleMarsDelay}
                orbitalPosition={orbitalPosition}
                onSelectOrbitalPosition={handleOrbitalPositionChange}
                speedMultiplier={speedMultiplier}
                activeView={activeView}
                onSelectView={handleSelectView}
                latestAlert={mccAlert}
                selectedAstronautId={activeTriageAstronautId || 'AST-01_COMMANDER'}
              />
            </div>
            {/* Deep-Space Downlink In-Transit Status Ribbon (shown only on Earth MCC views) */}
            {renderInTransitBanner()}
          </div>

          <MissionControlView
            telemetryMap={mccTelemetryMap}
            latestAlert={mccAlert}
            connected={connected}
            marsDelay={marsDelay}
            onToggleMarsDelay={handleToggleMarsDelay}
            orbitalPosition={orbitalPosition}
            onSelectOrbitalPosition={handleOrbitalPositionChange}
            speedMultiplier={speedMultiplier}
            onSpeedMultiplierChange={setSpeedMultiplier}
            onSelectView={handleSelectView}
            currentScenario={mccScenario}
            onOpenTriage={handleOpenMccTelemetry}
            onOpenMccTelemetry={handleOpenMccTelemetry}
          />
        </div>
      )}

      {/* ─── 4. DEDICATED EARTH MCC BIOMEDICAL TELEMETRY CONSOLE (/mcc/telemetry/:name) ─── */}
      {activeView === 'MCC_TELEMETRY' && (
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', backgroundColor: '#070a07' }}>
          {/* Top Sticky Header for Earth Ground Station */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 200,
              overflow: 'visible',
              background: '#070a07',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              width: '100%',
            }}
          >
            <div style={{ maxWidth: '1250px', margin: '0 auto', padding: '0 20px' }}>
              <HeaderBar
                connected={connected}
                marsDelay={marsDelay}
                onToggleMarsDelay={handleToggleMarsDelay}
                orbitalPosition={orbitalPosition}
                onSelectOrbitalPosition={handleOrbitalPositionChange}
                speedMultiplier={speedMultiplier}
                activeView={activeView}
                onSelectView={handleSelectView}
                latestAlert={mccAlert}
                selectedAstronautId={activeMccAstronautId || 'AST-01_COMMANDER'}
              />
            </div>

            {/* Earth Ground Station Operational Breadcrumb Bar */}
            <div
              style={{
                background: 'linear-gradient(90deg, #0b1117 0%, #080d12 100%)',
                borderBottom: '1px solid rgba(56, 189, 248, 0.25)',
                padding: '7px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: "var(--hud-font-mono, 'Tomorrow', monospace)",
                fontSize: '11px',
                color: '#94a3b8',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={handleCloseMccTelemetry}
                  style={{
                    background: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: 4,
                    padding: '3px 10px',
                    color: '#38bdf8',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: "var(--hud-font-sans, 'Tomorrow', sans-serif)",
                    letterSpacing: '0.04em',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(56, 189, 248, 0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)';
                  }}
                >
                  <span>← RETURN TO MCC MAIN CONSOLE</span>
                </button>

                <span style={{ color: '#334155' }}>|</span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: '#38bdf8',
                      boxShadow: '0 0 8px #38bdf8',
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ color: '#f8fafc', fontWeight: 800, letterSpacing: '0.06em' }}>
                    EARTH MCC // CLINICAL TELEMETRY CONSOLE
                  </span>
                  <span style={{ color: '#64748b' }}>(JSC FLIGHT SURGEON WORKSTATION)</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '10.5px' }}>
                  <span style={{ color: '#64748b' }}>DOWNLINK:</span>
                  <span style={{ color: '#4ade80', fontWeight: 700 }}>
                    DSN KA-BAND ({DISTANCES[orbitalPosition]?.label})
                  </span>
                </div>

                <span style={{ color: '#334155' }}>|</span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '10.5px' }}>
                  <span style={{ color: '#64748b' }}>PROPAGATION LATENCY:</span>
                  <span style={{ color: '#fbbf24', fontWeight: 800 }}>
                    +{fmtTime(DISTANCES[orbitalPosition]?.delaySec ?? 0)} ONE-WAY
                  </span>
                </div>
              </div>
            </div>

            {/* Deep-Space Downlink In-Transit Status Ribbon */}
            {renderInTransitBanner()}
          </div>

          {/* Earth MCC Health Telemetry Component fed by delayed Earth state */}
          <HealthTelemetryView
            initialAstronautId={activeMccAstronautId || 'AST-01_COMMANDER'}
            telemetryMap={mccTelemetryMap}
            marsDelay={marsDelay}
            connected={connected}
            latestAlert={mccAlert}
            onToggleMarsDelay={handleToggleMarsDelay}
            activeView={activeView}
            onSelectView={handleSelectView}
            onClose={handleCloseMccTelemetry}
            onAstronautChange={handleMccAstronautChange}
          />
        </div>
      )}

      {/* ─── 5. DEDICATED 3D HOLOGRAPHIC ANATOMICAL BODY SCANNER VIEW ─── */}
      {activeView === 'SCANNER' && (
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', backgroundColor: '#04080e' }}>
          {/* Top Sticky Header */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 200,
              background: '#04080e',
              borderBottom: '1px solid rgba(0, 229, 255, 0.18)',
              width: '100%',
            }}
          >
            <div style={{ maxWidth: '1250px', margin: '0 auto', padding: '0 20px' }}>
              <HeaderBar
                connected={connected}
                marsDelay={marsDelay}
                onToggleMarsDelay={handleToggleMarsDelay}
                orbitalPosition={orbitalPosition}
                onSelectOrbitalPosition={handleOrbitalPositionChange}
                speedMultiplier={speedMultiplier}
                activeView={activeView}
                onSelectView={handleSelectView}
                latestAlert={latestAlert}
                selectedAstronautId={scannerAstronautId}
              />
            </div>
          </div>

          <main style={{ padding: '16px 20px 80px 20px', maxWidth: '1250px', margin: '0 auto', boxSizing: 'border-box' }}>
            {/* Crew Selector Ribbon for 3D Hologram */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
              padding: '9px 14px',
              background: '#070d16',
              border: '1px solid #142232',
              borderRadius: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#68849e' }}>SELECT CREW MEMBER:</span>
                {[
                  { id: 'AST-01_COMMANDER', name: 'Haley', role: 'Commander', crewNo: 'CREW-01' },
                  { id: 'AST-02_PILOT', name: 'Chris', role: 'Pilot', crewNo: 'CREW-02', alert: true },
                  { id: 'AST-03_MEDICAL', name: 'Dr. Sian', role: 'Medical Specialist', crewNo: 'CREW-03' },
                  { id: 'AST-04_ENGINEER', name: 'Leo', role: 'Systems Engineer', crewNo: 'CREW-04' },
                ].map(c => {
                  const active = scannerAstronautId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setScannerAstronautId(c.id)}
                      style={{
                        background: active ? '#10283d' : '#0b141e',
                        border: `1px solid ${active ? '#00e5ff' : '#1c2d3e'}`,
                        borderRadius: 4,
                        padding: '4px 10px',
                        color: active ? '#ffffff' : '#8aa2b8',
                        fontSize: 10,
                        fontWeight: active ? 700 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <span>{c.crewNo} {c.name}</span>
                      {c.alert && (
                        <span style={{ fontSize: 8, background: '#cf9834', color: '#04080e', padding: '0 4px', borderRadius: 2, fontWeight: 800 }}>
                          TACHY
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: '#68849e' }}>
                <span style={{ color: '#00e5ff', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e5ff', boxShadow: '0 0 6px #00e5ff' }} />
                  <span>Interactive 3D WebGL Wireframe Active</span>
                </span>
                <span>·</span>
                <span>Click & Drag to Rotate 360°</span>
              </div>
            </div>

            {/* 3D Holographic Body Scanner Viewport */}
            {(() => {
              const currentCrew = [
                { id: 'AST-01_COMMANDER', name: 'Haley', role: 'Commander', crewNo: 'CREW-01' },
                { id: 'AST-02_PILOT', name: 'Chris', role: 'Pilot', crewNo: 'CREW-02' },
                { id: 'AST-03_MEDICAL', name: 'Dr. Sian', role: 'Medical Specialist', crewNo: 'CREW-03' },
                { id: 'AST-04_ENGINEER', name: 'Leo', role: 'Systems Engineer', crewNo: 'CREW-04' },
              ].find(c => c.id === scannerAstronautId) || { id: 'AST-02_PILOT', name: 'Chris', role: 'Pilot', crewNo: 'CREW-02' };

              return (
                <HolographicBodyScanner
                  astronautId={currentCrew.id}
                  astronautName={currentCrew.name}
                  astronautRole={currentCrew.role}
                  crewNo={currentCrew.crewNo}
                  telemetry={telemetryMap[currentCrew.id]}
                  themeMode="CYAN"
                />
              );
            })()}
          </main>
        </div>
      )}

      {/* ─── 6. DEDICATED ASTRODOCX NASA PROTOCOL ALERTS PAGE VIEW ─── */}
      {activeView === 'ALERTS' && (
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', backgroundColor: '#070b12' }}>
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 200,
              background: '#04080e',
              borderBottom: '1px solid rgba(0, 229, 255, 0.15)',
              width: '100%',
              backdropFilter: 'blur(16px)',
            }}
          >
            <div style={{ width: '100%', maxWidth: '1360px', margin: '0 auto', padding: '0 20px', boxSizing: 'border-box' }}>
              <HeaderBar
                connected={connected}
                marsDelay={false}
                orbitalPosition={orbitalPosition}
                speedMultiplier={speedMultiplier}
                activeView={activeView}
                onSelectView={handleSelectView}
                latestAlert={latestAlert}
                selectedAstronautId={activeAlertsAstronautId || 'AST-01_COMMANDER'}
              />
            </div>
          </div>

          <AlertsPageView
            initialAstronautId={activeAlertsAstronautId || commandDeckAstronautId || 'AST-01_COMMANDER'}
            onAstronautChange={(id) => {
              setActiveAlertsAstronautId(id);
              const slug = getSlugFromAstronautId(id);
              navigateTo(`/alerts/${slug}`, true);
            }}
            onBackToDashboard={() => handleSelectView('HUD')}
          />
        </div>
      )}

      {/* Global Scenario Controller (Floating Action Pill + Aerospace Modal) */}
      {activeView !== 'HUD' && (
        <ScenarioController
          currentScenario={currentScenario}
          marsDelay={marsDelay}
          onToggleMarsDelay={handleToggleMarsDelay}
          onScenarioTriggered={handleScenarioTriggered}
        />
      )}
    </>
  );
}

export default App;
