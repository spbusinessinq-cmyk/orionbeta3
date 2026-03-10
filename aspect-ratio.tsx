import { NextResponse } from 'next/server';

export const runtime = 'edge';

const MIL_PATTERNS = [
  /^RCH\d/,
  /^JAKE\d/,
  /^DUKE\d/,
  /^HAVOC\d/,
  /^NATO\d*/,
  /^MAGMA\d/,
  /^SKULL\d/,
  /^GHOST\d/,
  /^REACH\d/,
  /^EVAD\d/,
  /^ROCKY\d/,
  /^TOPAZ\d/,
];

function isMilitaryCallsign(raw: string): boolean {
  const cs = raw.trim().toUpperCase();
  return MIL_PATTERNS.some(p => p.test(cs));
}

export async function GET() {
  try {
    const res = await fetch(
      'https://opensky-network.org/api/states/all',
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 60 },
      }
    );
    if (!res.ok) return NextResponse.json({ aircraft: [] });

    const data = await res.json();
    if (!data?.states) return NextResponse.json({ aircraft: [] });

    const aircraft = (data.states as any[][])
      .filter((s) => {
        const lat = s[6];
        const lng = s[5];
        if (lat == null || lng == null) return false;
        const callsign = (s[1] ?? '').trim();
        const altMeters = s[7] ?? 0;
        const altFeet = altMeters * 3.28084;
        return isMilitaryCallsign(callsign) || altFeet > 40000;
      })
      .slice(0, 80)
      .map((s) => ({
        icao24: s[0] ?? '',
        callsign: (s[1] ?? '').trim() || (s[0] ?? '???'),
        lat: s[6] as number,
        lng: s[5] as number,
        altitudeFt: Math.round((s[7] ?? 0) * 3.28084),
        heading: s[10] ?? 0,
        velocityKts: s[9] ? Math.round((s[9] as number) * 1.94384) : 0,
        isMilitary: isMilitaryCallsign((s[1] ?? '').trim()),
      }));

    return NextResponse.json({ aircraft });
  } catch {
    return NextResponse.json({ aircraft: [] });
  }
}
