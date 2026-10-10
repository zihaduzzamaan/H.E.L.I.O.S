/**
 * HELIOS Navigation & Lightweight URL Router Service
 *
 * Implements high-performance zero-dependency History API routing for:
 * - Default root `/` -> Flight HUD
 * - Deep linking `/telemetry/:name` -> Health Telemetry for specific astronaut
 *
 * Fully supports browser back/forward (popstate), query preservation,
 * and base path independence (works seamlessly on Render root or subpaths).
 */

export interface AppRouteState {
  view: 'HUD' | 'HEALTH_TELEMETRY' | 'MCC' | 'SCANNER' | 'MCC_TELEMETRY' | 'ALERTS';
  astronautId: string;
}

export interface CrewSlugMeta {
  id: string;
  slug: string;
  name: string;
  role: string;
}

export const CREW_SLUG_REGISTRY: CrewSlugMeta[] = [
  { id: 'AST-01_COMMANDER', slug: 'haley', name: 'Cmndr Haley', role: 'Commander' },
  { id: 'AST-02_PILOT', slug: 'chris', name: 'Pilot Chris', role: 'Pilot' },
  { id: 'AST-03_MEDICAL', slug: 'sian', name: 'Dr. Sian', role: 'Medical Specialist' },
  { id: 'AST-04_ENGINEER', slug: 'leo', name: 'Specialist Leo', role: 'Systems Engineer' },
];

/**
 * Resolves any slug, alias, name, or astronaut ID to the canonical internal AST ID.
 * Examples:
 *   "haley", "commander", "ast-01" -> "AST-01_COMMANDER"
 *   "chris", "pilot", "ast-02"     -> "AST-02_PILOT"
 *   "sian", "medical", "doctor"   -> "AST-03_MEDICAL"
 *   "leo", "engineer", "specialist"-> "AST-04_ENGINEER"
 */
export function resolveAstronautIdFromSlug(slugOrName?: string | null): string {
  if (!slugOrName) return 'AST-01_COMMANDER';
  const norm = slugOrName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

  if (
    norm.includes('haley') ||
    norm.includes('commander') ||
    norm.includes('cdr') ||
    norm === 'ast-01' ||
    norm.startsWith('ast-01')
  ) {
    return 'AST-01_COMMANDER';
  }

  if (
    norm.includes('chris') ||
    norm.includes('pilot') ||
    norm.includes('plt') ||
    norm === 'ast-02' ||
    norm.startsWith('ast-02')
  ) {
    return 'AST-02_PILOT';
  }

  if (
    norm.includes('sian') ||
    norm.includes('medical') ||
    norm.includes('doctor') ||
    norm.includes('doc') ||
    norm === 'ast-03' ||
    norm.startsWith('ast-03')
  ) {
    return 'AST-03_MEDICAL';
  }

  if (
    norm.includes('leo') ||
    norm.includes('engineer') ||
    norm.includes('eng') ||
    norm.includes('specialist') ||
    norm === 'ast-04' ||
    norm.startsWith('ast-04')
  ) {
    return 'AST-04_ENGINEER';
  }

  return 'AST-01_COMMANDER';
}

/**
 * Maps an internal astronaut ID to its canonical URL slug.
 */
export function getSlugFromAstronautId(astId?: string | null): string {
  const upper = (astId || '').toUpperCase();
  if (upper.includes('COMMANDER') || upper.includes('AST-01') || upper.includes('HALEY')) return 'haley';
  if (upper.includes('PILOT') || upper.includes('AST-02') || upper.includes('CHRIS')) return 'chris';
  if (upper.includes('MEDICAL') || upper.includes('AST-03') || upper.includes('SIAN')) return 'sian';
  if (upper.includes('ENGINEER') || upper.includes('SPECIALIST') || upper.includes('AST-04') || upper.includes('LEO')) return 'leo';
  return 'haley';
}

/**
 * Parses the current window location pathname to determine active view and astronaut.
 */
export function parseCurrentRoute(): AppRouteState {
  if (typeof window === 'undefined') {
    return { view: 'HUD', astronautId: 'AST-01_COMMANDER' };
  }

  const path = window.location.pathname;
  if (path.includes('/scanner') || path.includes('/hologram')) {
    return {
      view: 'SCANNER',
      astronautId: 'AST-02_PILOT',
    };
  }

  const mccTelemetryIdx = path.indexOf('/mcc/telemetry');
  if (mccTelemetryIdx !== -1) {
    const sub = path.slice(mccTelemetryIdx); // e.g. "/mcc/telemetry/haley" or "/mcc/telemetry"
    const segments = sub.split('/').filter(Boolean); // ['mcc', 'telemetry', 'haley']
    const rawParam = segments[2] || 'haley';
    const astronautId = resolveAstronautIdFromSlug(rawParam);
    return {
      view: 'MCC_TELEMETRY',
      astronautId,
    };
  }

  if (path.includes('/mcc')) {
    return {
      view: 'MCC',
      astronautId: 'AST-01_COMMANDER',
    };
  }

  const alertsIdx = path.indexOf('/alerts');
  if (alertsIdx !== -1) {
    const sub = path.slice(alertsIdx); // e.g. "/alerts/haley" or "/alerts"
    const segments = sub.split('/').filter(Boolean); // ['alerts', 'haley']
    const rawParam = segments[1] || 'haley';
    const astronautId = resolveAstronautIdFromSlug(rawParam);
    return {
      view: 'ALERTS',
      astronautId,
    };
  }

  const telemetryIdx = path.indexOf('/telemetry');

  if (telemetryIdx !== -1) {
    const sub = path.slice(telemetryIdx); // e.g. "/telemetry/haley" or "/telemetry"
    const segments = sub.split('/').filter(Boolean); // ['telemetry', 'haley']
    const rawParam = segments[1] || 'haley';
    const astronautId = resolveAstronautIdFromSlug(rawParam);
    return {
      view: 'HEALTH_TELEMETRY',
      astronautId,
    };
  }

  // Default page is always Flight HUD on root / or any other route
  return {
    view: 'HUD',
    astronautId: 'AST-01_COMMANDER',
  };
}

/**
 * High-performance SPA navigation without full page reload.
 */
export function navigateTo(targetPath: string, replace = false): void {
  if (typeof window === 'undefined') return;

  const currentPath = window.location.pathname;
  if (currentPath === targetPath) return;

  // Preserve any base prefix (e.g. GitHub Pages repo prefix) if present
  let resolvedPath = targetPath;
  const telemetryIdx = currentPath.indexOf('/telemetry');
  if (telemetryIdx > 0) {
    const prefix = currentPath.slice(0, telemetryIdx).replace(/\/$/, '');
    if (prefix && !resolvedPath.startsWith(prefix)) {
      resolvedPath = `${prefix}${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`;
    }
  }

  if (replace) {
    window.history.replaceState({}, '', resolvedPath);
  } else {
    window.history.pushState({}, '', resolvedPath);
  }

  // Trigger synthetic popstate so subscribed listeners synchronize immediately
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * High-level router helper to navigate between major views and astronauts.
 */
export function navigateToView(
  view: 'HUD' | 'HEALTH_TELEMETRY' | 'MCC' | 'SCANNER' | 'MCC_TELEMETRY' | 'ALERTS',
  astronautId?: string
): void {
  const slug = getSlugFromAstronautId(astronautId);
  if (view === 'ALERTS') {
    navigateTo(`/alerts/${slug}`);
  } else if (view === 'HEALTH_TELEMETRY') {
    navigateTo(`/telemetry/${slug}`);
  } else if (view === 'MCC_TELEMETRY') {
    navigateTo(`/mcc/telemetry/${slug}`);
  } else if (view === 'MCC') {
    navigateTo('/mcc');
  } else if (view === 'SCANNER') {
    navigateTo('/scanner');
  } else {
    navigateTo('/');
  }
}
