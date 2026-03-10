import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
  try {
    const res = await fetch(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return NextResponse.json({ events: [] });

    const data = await res.json();

    const events = (data.features as any[])
      .filter((f: any) => f.geometry?.coordinates && f.properties?.mag >= 2.5)
      .slice(0, 120)
      .map((f: any) => ({
        id: f.id,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        magnitude: f.properties.mag,
        place: f.properties.place ?? '',
        time: f.properties.time,
        depth: f.geometry.coordinates[2] ?? 0,
      }));

    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ events: [] });
  }
}
