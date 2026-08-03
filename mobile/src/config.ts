/**
 * Client configuration.
 *
 * **Region matters more than it looks.** Measured 2026-07-27 from Malaysia:
 * asia-southeast1 ~100ms TTFB vs us-central1 ~310ms on an idle container. The
 * 300ms page-1 budget is consumed entirely by the wrong region before any work
 * happens.
 *
 * The diaspora wedge (architecture.md §1) puts buyer and listener on different
 * continents — a parent in California, a child in Manila — and playback happens
 * where the child is. So the region is chosen from the DEVICE, not from where
 * the account was created.
 *
 * ⚠️ `us-central1` is not deployed yet, so both entries currently point at
 * Singapore. Wire the second deployment before launch (workplan §4).
 */
import { getLocales } from 'expo-localization';

const REGIONS = {
  asia: 'https://snugglee-api-75574145355.asia-southeast1.run.app',
  americas: 'https://snugglee-api-75574145355.asia-southeast1.run.app', // TODO: us-central1
} as const;

/** Crude but nearly free — a global load balancer is the Phase 4 answer. */
function pickRegion(): string {
  try {
    const region = getLocales()[0]?.regionCode ?? '';
    const americas = ['US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE'];
    return americas.includes(region) ? REGIONS.americas : REGIONS.asia;
  } catch {
    return REGIONS.asia;
  }
}

export const config = {
  apiBaseUrl: pickRegion(),
  /** D-16. The server also enforces this — belt and braces on the COGS control. */
  prefetchDepth: 2,
} as const;
