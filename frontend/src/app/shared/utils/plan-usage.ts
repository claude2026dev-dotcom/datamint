import { SubscriptionStatus } from '../../core/models/models';

/// Distinguishes the actual Free trial (non-recurring, zero cost) from a paid
/// recurring plan (Starter/Pro) that simply hasn't had its real price set from
/// Admin > Plans yet - both currently have price 0, but only the former should
/// ever be labeled "Free" or offer an "Upgrade" CTA instead of "Change plan".
export function isFreeTrialPlan(s: SubscriptionStatus | null): boolean {
  return !!s && !s.isRecurring && s.price === 0;
}

export function usagePercent(s: SubscriptionStatus | null): number {
  if (!s || s.monthlyPageLimit === -1 || s.monthlyPageLimit === 0) return 0;
  return Math.min(100, (s.pagesUsedThisCycle / s.monthlyPageLimit) * 100);
}

/// "3 / unlimited pages used" reads oddly since "unlimited" isn't really a
/// denominator - an unlimited plan just states the count used, with no "/ X".
export function usageLabel(s: SubscriptionStatus | null): string {
  if (!s) return '';
  const scope = s.isRecurring ? 'this cycle' : 'so far';
  if (s.monthlyPageLimit === -1) return `${s.pagesUsedThisCycle} page(s) used ${scope} — unlimited plan`;
  return `${s.pagesUsedThisCycle} / ${s.monthlyPageLimit} pages used ${scope}`;
}
