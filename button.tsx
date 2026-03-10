import { NextResponse } from 'next/server';

export const runtime = 'edge';

// Public FIRMS VIIRS SUOMI-NPP C2 global 24h active fire file.
// This static file is freely accessible — no API key required and no quota limits.
// Updated every ~12 hours by NASA FIRMS. Gives thousands of global fire pixels daily.
const FIRMS_PUBLIC_URL =
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv';

// Fallback: VIIRS NOAA-20 static file if SUOMI-NPP is temporarily unavailable
const FIRMS_FALLBACK_URL =
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv';

export async function GET() {
  try {
    let text = '';

    // Try primary public file first
    try {
      const res = await fetch(FIRMS_PUBLIC_URL, {
        signal: AbortSignal.timeout(20000),
        headers: { 'Accept': 'text/csv, */*' },
      });
      if (res.ok) {
        text = await res.text();
      }
    } catch { /* fall through to fallback */ }

    // If primary returned only a header (< 2 lines), try fallback
    if (!text || text.trim().split('\n').length < 2) {
      const fallRes = await fetch(FIRMS_FALLBACK_URL, {
        signal: AbortSignal.timeout(20000),
        headers: { 'Accept': 'text/csv, */*' },
      });
      if (fallRes.ok) {
        text = await fallRes.text();
      }
    }

    // Also try the API endpoint with the map key if static files are empty
    if ((!text || text.trim().split('\n').length < 2) && process.env.FIRMS_MAP_KEY) {
      const apiRes = await fetch(
        `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${process.env.FIRMS_MAP_KEY}/VIIRS_SNPP_NRT/-180,-90,180,90/1`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (apiRes.ok) text = await apiRes.text();
    }

    if (!text) return NextResponse.json({ points: [] });

    const lines = text.trim().split('\n');
    if (lines.length < 2) return NextResponse.json({ points: [] });

    const headers = lines[0].split(',');
    const latIdx  = headers.indexOf('latitude');
    const lngIdx  = headers.indexOf('longitude');
    const briIdx  = headers.indexOf('bright_ti4');
    const frpIdx  = headers.indexOf('frp');
    const confIdx = headers.indexOf('confidence');
    const dateIdx = headers.indexOf('acq_date');
    const timeIdx = headers.indexOf('acq_time');

    if (latIdx < 0 || lngIdx < 0) return NextResponse.json({ points: [] });

    const points: Array<{ lat: number; lng: number; brightness: number; acq_datetime: string }> = [];

    for (let i = 1; i < lines.length && points.length < 1500; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(',');

      // Confidence filter — reject low-confidence detections
      // Public file uses "low"/"nominal"/"high"; API uses "l"/"n"/"h"
      const conf = (cols[confIdx] ?? '').toLowerCase();
      if (conf === 'l' || conf === 'low') continue;

      // FRP filter — require meaningful fire radiative power (>= 0.5 MW)
      const frp = parseFloat(cols[frpIdx] ?? '0');
      if (isNaN(frp) || frp < 0.5) continue;

      const lat = parseFloat(cols[latIdx]);
      const lng = parseFloat(cols[lngIdx]);
      if (isNaN(lat) || isNaN(lng)) continue;

      const rawTime = (cols[timeIdx] ?? '').trim();
      const paddedTime = rawTime.padStart(4, '0');
      const hhmm = paddedTime.slice(0, 2) + ':' + paddedTime.slice(2);

      const brightness = parseFloat(cols[briIdx] ?? '350');

      points.push({
        lat,
        lng,
        brightness: isNaN(brightness) ? 350 : brightness,
        acq_datetime: `${(cols[dateIdx] ?? '').trim()} ${hhmm}`.trim(),
      });
    }

    return NextResponse.json({ points, source: 'FIRMS-VIIRS', count: points.length });
  } catch {
    return NextResponse.json({ points: [] });
  }
}
