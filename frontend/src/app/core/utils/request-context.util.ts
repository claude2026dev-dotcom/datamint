/// Small, dependency-free helpers for turning raw request metadata (IP address,
/// User-Agent string) into something a human can actually read at a glance.
/// Kept generic and framework-agnostic so any page that shows audit/session
/// data (Audit Logs today, possibly a "your active sessions" list later) can
/// reuse the same formatting instead of re-deriving it inline.

const LOOPBACK_ADDRESSES = new Set(['::1', '127.0.0.1', '0.0.0.0']);

/** Maps loopback addresses to a friendly "Localhost" label; passes real IPs through unchanged. */
export function formatIpAddress(ip: string | null | undefined): string {
  if (!ip) return 'Unknown';
  return LOOPBACK_ADDRESSES.has(ip) ? 'Localhost' : ip;
}

/** Very small User-Agent parser covering the browsers/OSes this app actually sees - not a full UA-parsing library. */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';

  const os =
    /Windows/.test(userAgent) ? 'Windows' :
    /Mac OS X/.test(userAgent) ? 'macOS' :
    /Android/.test(userAgent) ? 'Android' :
    /iPhone|iPad|iOS/.test(userAgent) ? 'iOS' :
    /Linux/.test(userAgent) ? 'Linux' :
    'Unknown OS';

  const browser =
    /Edg\//.test(userAgent) ? 'Edge' :
    /OPR\//.test(userAgent) ? 'Opera' :
    /Chrome\//.test(userAgent) ? 'Chrome' :
    /CriOS\//.test(userAgent) ? 'Chrome' :
    /Firefox\//.test(userAgent) ? 'Firefox' :
    /Safari\//.test(userAgent) ? 'Safari' :
    /curl\//.test(userAgent) ? 'curl (API client)' :
    'Unknown browser';

  return `${browser} on ${os}`;
}
