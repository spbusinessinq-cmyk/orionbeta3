"use client";

import { useEffect, useRef, useCallback, memo, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Event, Tier, CoordPrecision, LocationPrecision } from "@/lib/news-store";
import { type TimelineEntry, formatTime } from "@/lib/timeline-engine";
import { IntelItem, SEVERITY_LABELS, featureToIntelItem, getGeometryBounds } from "@/lib/intel-fusion";
import { ThreatScoreResult, ThreatLevel } from "@/lib/threat-score";

interface WorldMapProps {
  events: Event[];
  threatScores?: Map<string, ThreatScoreResult>;
  onPinClick: (event: Event) => void;
  selectedEventKey: string | null;
  focusMode: boolean;
  onDeselect: () => void;
  spreadCentroidPins: boolean;
  // Intel layer toggles
  intelMode?: boolean;
  intelConflictZones?: boolean;
  intelDisputedBorders?: boolean;
  intelSanctions?: boolean;
  intelRestrictedAirspace?: boolean;
  intelMaritimeZones?: boolean;
  intelProtestUnrest?: boolean;
  intelInternetShutdown?: boolean;
  intelMilitaryActivity?: boolean;
  intelStrikeIndicators?: boolean;
  intelThermalAnomalies?: boolean;
  // Intel selection callbacks
  selectedIntelId?: string | null;
  onIntelSelect?: (intel: IntelItem) => void;
  onIntelDeselect?: () => void;
  onIntelDataLoaded?: (layerKey: string, items: IntelItem[]) => void;
  // Live sensor layer toggles
  sensorThermal?: boolean;
  sensorSeismic?: boolean;
  sensorAircraft?: boolean;
  // Intelligence timeline
  timelineMap?: Map<string, TimelineEntry[]>;
  // Intel Density Heatmap
  intelDensityHeatmap?: boolean;
}

interface ThermalPoint {
  lat: number;
  lng: number;
  brightness: number;
  acq_datetime: string;
}

interface SeismicEvent {
  id: string;
  lat: number;
  lng: number;
  magnitude: number;
  place: string;
  time: number;
  depth: number;
}

interface AircraftState {
  icao24: string;
  callsign: string;
  lat: number;
  lng: number;
  altitudeFt: number;
  heading: number;
  velocityKts: number;
  isMilitary: boolean;
}

// Intel layer styling configuration
const INTEL_LAYER_STYLES: Record<string, {
  color: string;
  fillColor: string;
  fillOpacity: number;
  weight: number;
  dashArray?: string;
}> = {
  // Priority 1 — active combat (most visible fill)
  conflict_zones: {
    color: '#ff1744',
    fillColor: '#ff1744',
    fillOpacity: 0.18,
    weight: 2,
  },
  // Priority 2 — contested lines (dashed, no fill — lines render differently per geometry type)
  disputed_borders: {
    color: '#ff6b35',
    fillColor: '#ff6b35',
    fillOpacity: 0.06,
    weight: 2.5,
    dashArray: '8, 4',
  },
  // Priority 3 — maritime risk (subtle blue fill)
  maritime_zones: {
    color: '#00bcd4',
    fillColor: '#00bcd4',
    fillOpacity: 0.1,
    weight: 1.5,
  },
  // Priority 4 — economic sanctions (dashed pink, very subtle fill)
  sanctions: {
    color: '#e91e63',
    fillColor: '#e91e63',
    fillOpacity: 0.05,
    weight: 1.5,
    dashArray: '4, 3',
  },
  // Priority 5 — airspace closures (dashed amber, subtle fill)
  restricted_airspace: {
    color: '#ff9800',
    fillColor: '#ff9800',
    fillOpacity: 0.1,
    weight: 1.5,
    dashArray: '6, 3',
  },
  protest_unrest: {
    color: '#e040fb',
    fillColor: '#e040fb',
    fillOpacity: 0.12,
    weight: 1,
    dashArray: '4, 4',
  },
  // Priority 7 — internet/network shutdowns (indigo-blue, short dashes — signal disruption feel)
  internet_shutdown: {
    color: '#5c6bc0',
    fillColor: '#5c6bc0',
    fillOpacity: 0.08,
    weight: 1.5,
    dashArray: '3, 3, 1, 3',
  },
  // Priority 8 — military activity (blue-grey, solid — operational presence feel)
  military_activity: {
    color: '#78909c',
    fillColor: '#78909c',
    fillOpacity: 0.10,
    weight: 1.5,
  },
  // Priority 9 — strike indicators (amber-gold, tight dash — targeting/impact feel)
  strike_indicators: {
    color: '#ffca28',
    fillColor: '#ffca28',
    fillOpacity: 0.12,
    weight: 1.5,
    dashArray: '2, 3',
  },
  // Priority 10 — thermal anomalies (deep amber-orange — heat/fire signature feel)
  thermal_anomalies: {
    color: '#ff6f00',
    fillColor: '#ff6f00',
    fillOpacity: 0.22,
    weight: 1.5,
  },
};

// GeoJSON FeatureCollection type
interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: {
      type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString' | 'Point';
      coordinates: unknown;
    };
  }>;
}

// Tier colors
const TIER_COLORS: Record<Tier, string> = {
  breaking: '#ff1744',
  watch: '#ffab00',
  verified: '#00e676',
};

// Topic ring colors (subtle)
const TOPIC_COLORS: Record<string, string> = {
  War: '#ff4444',
  Politics: '#4444ff',
  Economy: '#44ff44',
  Diplomacy: '#ff44ff',
  Protests: '#ffff44',
  Disasters: '#ff8844',
  Science: '#44ffff',
  Other: '#888888',
};

// Country bounding boxes for scatter (actual geographic bounds)
// Format: { minLat, maxLat, minLng, maxLng } - the area where pins should be spread
const COUNTRY_BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  // North America
  'us': { minLat: 25, maxLat: 49, minLng: -125, maxLng: -66 },
  'ca': { minLat: 42, maxLat: 83, minLng: -141, maxLng: -52 },
  'mx': { minLat: 14, maxLat: 33, minLng: -118, maxLng: -86 },
  'cu': { minLat: 19.8, maxLat: 23.3, minLng: -84.9, maxLng: -74.1 },
  've': { minLat: 0.6, maxLat: 12.2, minLng: -73.4, maxLng: -59.8 },
  // South America
  'br': { minLat: -33.8, maxLat: 5.3, minLng: -73.9, maxLng: -34.8 },
  'ar': { minLat: -55.1, maxLat: -21.8, minLng: -73.6, maxLng: -53.6 },
  'za': { minLat: -35, maxLat: -22, minLng: 16, maxLng: 33 },
  // Europe (tightened for small countries - mainland only, no overseas territories)
  'uk': { minLat: 49.9, maxLat: 60.9, minLng: -8.6, maxLng: 1.8 },
  'de': { minLat: 47.3, maxLat: 55.1, minLng: 5.9, maxLng: 15.0 },
  'fr': { minLat: 42.0, maxLat: 51.1, minLng: -5.0, maxLng: 8.2 },  // Mainland France only (excludes overseas)
  'it': { minLat: 36.6, maxLat: 47.1, minLng: 6.6, maxLng: 18.5 },
  'es': { minLat: 36.0, maxLat: 43.8, minLng: -9.3, maxLng: 3.3 },
  'pl': { minLat: 49.0, maxLat: 54.8, minLng: 14.1, maxLng: 24.1 },
  'nl': { minLat: 50.8, maxLat: 53.5, minLng: 3.4, maxLng: 7.2 },
  'se': { minLat: 55.3, maxLat: 69.1, minLng: 11.1, maxLng: 24.2 },
  'gr': { minLat: 34.8, maxLat: 41.7, minLng: 19.4, maxLng: 29.7 },
  'ch': { minLat: 45.8, maxLat: 47.8, minLng: 5.9, maxLng: 10.5 },  // Switzerland
  'be': { minLat: 49.5, maxLat: 51.5, minLng: 2.5, maxLng: 6.4 },   // Belgium
  'at': { minLat: 46.4, maxLat: 49.0, minLng: 9.5, maxLng: 17.2 },  // Austria
  'cz': { minLat: 48.5, maxLat: 51.1, minLng: 12.1, maxLng: 18.9 }, // Czech Republic
  'dk': { minLat: 54.5, maxLat: 57.8, minLng: 8.0, maxLng: 15.2 },  // Denmark
  'lu': { minLat: 49.4, maxLat: 50.2, minLng: 5.7, maxLng: 6.5 },   // Luxembourg
  'ie': { minLat: 51.4, maxLat: 55.4, minLng: -10.5, maxLng: -5.9 }, // Ireland
  'pt': { minLat: 36.9, maxLat: 42.2, minLng: -9.5, maxLng: -6.2 },  // Portugal (mainland)
  // Eastern Europe/Eurasia
  'ru': { minLat: 41.2, maxLat: 81.9, minLng: 19.6, maxLng: 180 },
  'ua': { minLat: 44.4, maxLat: 52.4, minLng: 22.1, maxLng: 40.2 },
  'tr': { minLat: 35.8, maxLat: 42.1, minLng: 25.7, maxLng: 44.8 },
  // Middle East
  'il': { minLat: 29.5, maxLat: 33.3, minLng: 34.3, maxLng: 35.9 },
  'ps': { minLat: 31.2, maxLat: 31.6, minLng: 34.0, maxLng: 34.6 }, // Gaza
  'sy': { minLat: 32.3, maxLat: 37.3, minLng: 35.7, maxLng: 42.4 },
  'ir': { minLat: 25.1, maxLat: 39.8, minLng: 44.0, maxLng: 63.3 },
  'iq': { minLat: 29.1, maxLat: 37.4, minLng: 38.8, maxLng: 48.6 },
  'sa': { minLat: 16.3, maxLat: 32.2, minLng: 34.5, maxLng: 55.7 },
  'ye': { minLat: 12.1, maxLat: 19.0, minLng: 42.5, maxLng: 54.6 },
  'lb': { minLat: 33.0, maxLat: 34.7, minLng: 35.1, maxLng: 36.6 },
  'eg': { minLat: 22.0, maxLat: 31.6, minLng: 25.0, maxLng: 35.8 },
  'af': { minLat: 29.4, maxLat: 38.5, minLng: 60.5, maxLng: 74.9 },
  'pk': { minLat: 23.7, maxLat: 37.1, minLng: 60.9, maxLng: 77.8 },
  // Asia
  'cn': { minLat: 18.2, maxLat: 53.6, minLng: 73.7, maxLng: 135.0 },
  'jp': { minLat: 24.0, maxLat: 45.6, minLng: 122.9, maxLng: 153.9 },
  'kp': { minLat: 37.6, maxLat: 43.0, minLng: 124.4, maxLng: 130.7 },
  'kr': { minLat: 33.1, maxLat: 38.6, minLng: 124.6, maxLng: 131.9 },
  'tw': { minLat: 21.9, maxLat: 25.3, minLng: 119.3, maxLng: 122.0 },
  'in': { minLat: 6.6, maxLat: 35.5, minLng: 68.1, maxLng: 97.4 },
  'th': { minLat: 5.6, maxLat: 20.5, minLng: 97.3, maxLng: 105.6 },
  'vn': { minLat: 8.4, maxLat: 23.4, minLng: 102.1, maxLng: 109.5 },
  'ph': { minLat: 4.5, maxLat: 21.1, minLng: 116.9, maxLng: 126.9 },
  'id': { minLat: -11.0, maxLat: 6.1, minLng: 95.0, maxLng: 141.0 },
  'mm': { minLat: 9.5, maxLat: 28.5, minLng: 92.2, maxLng: 101.2 },
  'hk': { minLat: 22.15, maxLat: 22.56, minLng: 113.83, maxLng: 114.41 },
  // Africa
  'ng': { minLat: 4.2, maxLat: 13.9, minLng: 2.7, maxLng: 14.7 },
  'so': { minLat: 1.0, maxLat: 12.0, minLng: 41.0, maxLng: 51.0 },  // Somalia — tightened to avoid Gulf of Aden
  'ke': { minLat: -4.7, maxLat: 5.0, minLng: 33.9, maxLng: 41.9 },
  'ly': { minLat: 19.5, maxLat: 33.2, minLng: 9.4, maxLng: 25.2 },
  'cd': { minLat: -13.5, maxLat: 5.5, minLng: 12.0, maxLng: 31.5 }, // Democratic Republic of the Congo
  'cg': { minLat: -5.1, maxLat: 3.7, minLng: 11.0, maxLng: 19.0 },  // Republic of the Congo
  'et': { minLat: 3.5, maxLat: 15.0, minLng: 33.0, maxLng: 48.0 },  // Ethiopia
  'sd': { minLat: 8.7, maxLat: 23.0, minLng: 21.8, maxLng: 38.6 },  // Sudan
  'ss': { minLat: 3.5, maxLat: 12.2, minLng: 24.0, maxLng: 36.9 },  // South Sudan
  'er': { minLat: 12.4, maxLat: 18.0, minLng: 36.4, maxLng: 43.1 }, // Eritrea
  'ml': { minLat: 10.1, maxLat: 25.0, minLng: -5.3, maxLng: 4.3 },  // Mali
  'ne': { minLat: 11.7, maxLat: 23.5, minLng: 0.2, maxLng: 15.9 },  // Niger
  'bf': { minLat: 9.4, maxLat: 15.1, minLng: -5.5, maxLng: 2.4 },   // Burkina Faso
  'td': { minLat: 7.4, maxLat: 23.5, minLng: 13.5, maxLng: 24.0 },  // Chad
  'cf': { minLat: 2.2, maxLat: 11.0, minLng: 14.4, maxLng: 27.5 },  // Central African Republic
  'ma': { minLat: 27.6, maxLat: 35.9, minLng: -13.2, maxLng: -1.0 }, // Morocco
  'dz': { minLat: 18.9, maxLat: 37.1, minLng: -8.7, maxLng: 9.0 },  // Algeria
  'tn': { minLat: 30.2, maxLat: 37.5, minLng: 7.5, maxLng: 11.6 },  // Tunisia
  'gh': { minLat: 4.7, maxLat: 11.2, minLng: -3.3, maxLng: 1.2 },   // Ghana
  'tz': { minLat: -11.7, maxLat: -1.0, minLng: 29.3, maxLng: 40.4 }, // Tanzania
  'ug': { minLat: -1.5, maxLat: 4.2, minLng: 29.6, maxLng: 35.0 },  // Uganda
  'mz': { minLat: -26.9, maxLat: -10.4, minLng: 30.2, maxLng: 40.8 }, // Mozambique
  'ao': { minLat: -18.0, maxLat: -4.4, minLng: 11.7, maxLng: 24.1 }, // Angola
  'zw': { minLat: -22.4, maxLat: -15.6, minLng: 25.2, maxLng: 33.1 }, // Zimbabwe
  'cm': { minLat: 1.7, maxLat: 13.1, minLng: 8.5, maxLng: 16.2 },   // Cameroon
  'sn': { minLat: 12.3, maxLat: 16.7, minLng: -17.6, maxLng: -11.4 }, // Senegal
  // Latin America
  'co': { minLat: -4.2, maxLat: 13.4, minLng: -77.0, maxLng: -66.9 }, // Colombia
  'ht': { minLat: 18.0, maxLat: 20.1, minLng: -74.5, maxLng: -71.6 }, // Haiti
  'do': { minLat: 17.5, maxLat: 20.0, minLng: -72.0, maxLng: -68.3 }, // Dominican Republic
  'pe': { minLat: -18.4, maxLat: -0.0, minLng: -81.3, maxLng: -68.7 }, // Peru
  'cl': { minLat: -55.9, maxLat: -17.5, minLng: -75.6, maxLng: -66.4 }, // Chile
  'ec': { minLat: -5.0, maxLat: 1.4, minLng: -80.9, maxLng: -75.2 }, // Ecuador
  'bo': { minLat: -22.9, maxLat: -9.7, minLng: -69.6, maxLng: -57.5 }, // Bolivia
  // Eastern Europe / Caucasus
  'am': { minLat: 38.8, maxLat: 41.3, minLng: 43.4, maxLng: 46.6 }, // Armenia
  'az': { minLat: 38.4, maxLat: 41.9, minLng: 44.8, maxLng: 50.4 }, // Azerbaijan
  'by': { minLat: 51.2, maxLat: 56.2, minLng: 23.2, maxLng: 32.8 }, // Belarus
  'rs': { minLat: 42.2, maxLat: 46.2, minLng: 18.8, maxLng: 23.0 }, // Serbia
  'md': { minLat: 45.4, maxLat: 48.5, minLng: 26.6, maxLng: 30.1 }, // Moldova
  'ge': { minLat: 41.0, maxLat: 43.6, minLng: 40.0, maxLng: 46.7 }, // Georgia (country)
  'ro': { minLat: 43.6, maxLat: 48.3, minLng: 20.3, maxLng: 29.7 }, // Romania
  'bg': { minLat: 41.2, maxLat: 44.2, minLng: 22.4, maxLng: 28.6 }, // Bulgaria
  'hr': { minLat: 42.4, maxLat: 46.6, minLng: 13.5, maxLng: 19.5 }, // Croatia
  // South / Southeast Asia
  'bd': { minLat: 20.7, maxLat: 26.6, minLng: 88.0, maxLng: 92.7 }, // Bangladesh
  'np': { minLat: 26.3, maxLat: 30.5, minLng: 80.1, maxLng: 88.2 }, // Nepal
  'lk': { minLat: 5.9, maxLat: 9.8, minLng: 79.7, maxLng: 81.9 },   // Sri Lanka
  'kh': { minLat: 10.4, maxLat: 14.7, minLng: 102.3, maxLng: 107.6 }, // Cambodia
  // Oceania
  'au': { minLat: -37.0, maxLat: -15.0, minLng: 114.0, maxLng: 153.0 }, // Australia mainland only
  // Regions — tightened for land-biased placement
  'eu': { minLat: 43.0, maxLat: 62.0, minLng: -5.0, maxLng: 32.0 },  // Core Europe (mainland)
  'as': { minLat: 10.0, maxLat: 45.0, minLng: 65.0, maxLng: 140.0 }, // Core Asia (mainland)
  'me': { minLat: 20.0, maxLat: 38.0, minLng: 35.0, maxLng: 60.0 },  // Middle East (land-biased)
  'africa': { minLat: -5.0, maxLat: 20.0, minLng: 10.0, maxLng: 40.0 }, // Africa region (sub-Saharan core)
};

// Debug counters for land placement tracking (dev only)
let oceanRejectCount = 0;
const placementAttemptsHistogram = new Map<number, number>();

// TEMP proof counters for country scatter
let countryScatterUsedBounds = 0;
let countryScatterUsedRadius = 0;
const sampleMisplacements: Array<{ eventKey: string; countryKey: string; lat: number; lng: number; reason: string }> = [];

// Lightweight land mask check - rejects obvious ocean regions
// NOT precision geography, simply prevents ocean placement
function isLikelyLand(lat: number, lng: number): boolean {
  // Southern Ocean / Antarctica
  if (lat < -60) return false;

  // Central Pacific (east of Australia, west of South America)
  if (lng > 160 && lat < -10) return false;
  if (lng > 170 && lat > -50 && lat < 50) return false;

  // North Pacific (between Asia and North America) — JS wraps, check both sides
  if (lng > 160 && lng <= 180 && lat > 20 && lat < 60) return false;
  if (lng >= -180 && lng < -120 && lat > 20 && lat < 60) return false;

  // North Atlantic mid-ocean (between Europe and North America)
  if (lng > -50 && lng < -20 && lat > 35 && lat < 55) return false;
  if (lng > -40 && lng < -10 && lat > 45 && lat < 60) return false;

  // South Atlantic mid-ocean
  if (lng > -40 && lng < -10 && lat > -40 && lat < 5) return false;

  // Indian Ocean (south of India, west of Australia)
  if (lng > 60 && lng < 100 && lat > -40 && lat < -10) return false;

  // Arctic Ocean (extreme north)
  if (lat > 82) return false;
  if (lat > 78 && lng > -60 && lng < 60) return false;
  if (lat > 75 && lng > 90 && lng < 180) return false;

  // Gulf of Aden / Horn of Africa offshore (avoid placing Somalia/Yemen pins in the gulf)
  if (lat > 10 && lat < 14 && lng > 43 && lng < 52) return false;

  // Red Sea (narrow strip — allow slight misses as bounds are tight)
  if (lat > 15 && lat < 28 && lng > 32 && lng < 37 && lat > (lng - 22)) return false;

  // Persian Gulf (avoid placing Iran/Iraq/SA pins in the gulf)
  if (lat > 23 && lat < 30 && lng > 49 && lng < 57) return false;

  // Caspian Sea
  if (lat > 36 && lat < 47 && lng > 49 && lng < 55) return false;

  // Mediterranean / Black Sea — allow (bounded by land, scatter usually resolves)

  return true;
}

// Deterministic PRNG using mulberry32 algorithm
function seededRandom(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Hash string to number for seed
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// Huge countries that warrant larger spread when no bounds available
const HUGE_COUNTRY_KEYS = new Set(['us', 'ca', 'ru', 'cn', 'br', 'au']);

// Get display coordinates with scatter for centroid pins
// Uses deterministic uniform distribution within country bounding box
// With LAND-ONLY rule: rejects ocean placements, retries deterministically
// SPREAD RADII based on locationPrecision:
//   city:    0.2-0.6 degrees (tight, neighborhood level)
//   region:  0.8-2.5 degrees (state/province level)
//   country: uses country bounding box (preferred) or 0.8-2.5 deg default (3-8 for huge countries)
//   none:    fallback to small spread
function getDisplayCoords(
  event: Event,
  spread: boolean
): [number, number] {
  if (!event.lat || !event.lng) {
    return [0, 0];
  }
  
  // For exact coordinates or when spread is disabled, use original
  if (event.coordPrecision === 'exact' || !spread) {
    return [event.lat, event.lng];
  }
  
  const baseSeed = hashString(event.eventKey);
  const locationPrecision = event.locationPrecision || 'country';
  
  // Determine spread radius based on location precision
  let spreadRadiusDegrees: number;
  switch (locationPrecision) {
    case 'city':
      // Tight spread for city-level precision
      spreadRadiusDegrees = 0.2 + (baseSeed % 400) / 1000; // 0.2-0.6 degrees
      break;
    case 'region':
      // Medium spread for state/province level
      spreadRadiusDegrees = 0.8 + (baseSeed % 1700) / 1000; // 0.8-2.5 degrees
      break;
    case 'country':
    default:
      // For country-level, ALWAYS prefer bounds-based sampling
      const bounds = COUNTRY_BOUNDS[event.countryKey];
      if (bounds) {
        countryScatterUsedBounds++;
        // Use bounding box spread - this keeps pins inside country bounds
        for (let attempt = 0; attempt < 12; attempt++) {
          const seed = baseSeed + attempt;
          const rng = seededRandom(seed);
          
          // Uniform distribution within bounding box
          const latCandidate = bounds.minLat + rng() * (bounds.maxLat - bounds.minLat);
          const lngCandidate = bounds.minLng + rng() * (bounds.maxLng - bounds.minLng);
          
          if (isLikelyLand(latCandidate, lngCandidate)) {
            placementAttemptsHistogram.set(attempt, (placementAttemptsHistogram.get(attempt) || 0) + 1);
            return [latCandidate, lngCandidate];
          }
          oceanRejectCount++;
        }
        // All attempts failed: fallback to centroid
        placementAttemptsHistogram.set(12, (placementAttemptsHistogram.get(12) || 0) + 1);
        return [event.lat, event.lng];
      }
      // No bounds - use smaller default spread (0.8-2.5 deg) or larger for huge countries
      countryScatterUsedRadius++;
      if (HUGE_COUNTRY_KEYS.has(event.countryKey)) {
        spreadRadiusDegrees = 3 + (baseSeed % 5000) / 1000; // 3-8 degrees for US/CA/RU/CN/BR/AU
      } else {
        spreadRadiusDegrees = 0.8 + (baseSeed % 1700) / 1000; // 0.8-2.5 degrees for others
      }
      // Log misplacement potential for countries without bounds
      if (sampleMisplacements.length < 10) {
        sampleMisplacements.push({
          eventKey: event.eventKey,
          countryKey: event.countryKey,
          lat: event.lat,
          lng: event.lng,
          reason: 'no-bounds-using-radius'
        });
      }
      break;
  }
  
  // Circular spread with land check (for city/region and country without bounds)
  for (let attempt = 0; attempt < 12; attempt++) {
    const seed = baseSeed + attempt;
    const rng = seededRandom(seed);
    const angle = rng() * 2 * Math.PI;
    const radius = Math.sqrt(rng()) * spreadRadiusDegrees;
    const latCandidate = event.lat + radius * Math.cos(angle) * 0.7;
    const lngCandidate = event.lng + radius * Math.sin(angle);
    
    if (isLikelyLand(latCandidate, lngCandidate)) {
      // Track attempts for debugging
      placementAttemptsHistogram.set(attempt, (placementAttemptsHistogram.get(attempt) || 0) + 1);
      return [latCandidate, lngCandidate];
    }
    oceanRejectCount++;
  }
  
  // All attempts failed: fallback to centroid
  placementAttemptsHistogram.set(12, (placementAttemptsHistogram.get(12) || 0) + 1);
  return [event.lat, event.lng];
}

function WorldMapComponent({
  events,
  threatScores,
  onPinClick,
  selectedEventKey,
  focusMode,
  onDeselect,
  spreadCentroidPins,
  intelMode,
  intelConflictZones,
  intelDisputedBorders,
  intelSanctions,
  intelRestrictedAirspace,
  intelMaritimeZones,
  intelProtestUnrest,
  intelInternetShutdown,
  intelMilitaryActivity,
  intelStrikeIndicators,
  intelThermalAnomalies,
  selectedIntelId,
  onIntelSelect,
  onIntelDeselect,
  onIntelDataLoaded,
  sensorThermal,
  sensorSeismic,
  sensorAircraft,
  timelineMap,
  intelDensityHeatmap,
}: WorldMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersByKeyRef = useRef<Map<string, L.Marker>>(new Map());
  const clusterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const selectedMarkerRef = useRef<L.Marker | null>(null);
  const prevSpreadRef = useRef<boolean>(spreadCentroidPins);
  const spreadChangedRef = useRef<boolean>(false);
  // Intel overlay refs for lifecycle management
  const intelLayersRef = useRef<Map<string, L.GeoJSON>>(new Map());
  const intelDataCacheRef = useRef<Map<string, GeoJsonFeatureCollection>>(new Map());
  // Intel items cache for fusion and selection
  const intelItemsByLayerRef = useRef<Map<string, IntelItem[]>>(new Map());

  // Sensor layer refs — self-contained Leaflet LayerGroups
  const thermalLayerRef  = useRef<L.LayerGroup | null>(null);
  const seismicLayerRef  = useRef<L.LayerGroup | null>(null);
  const aircraftLayerRef = useRef<L.LayerGroup | null>(null);

  // Intel Density Heatmap layer ref
  const heatmapLayerRef  = useRef<L.LayerGroup | null>(null);

  // Sensor data state
  const [thermalData,  setThermalData]  = useState<ThermalPoint[]>([]);
  const [seismicData,  setSeismicData]  = useState<SeismicEvent[]>([]);
  const [aircraftData, setAircraftData] = useState<AircraftState[]>([]);

  // Current zoom level — triggers cluster/individual pin toggle
  const [currentZoom, setCurrentZoom] = useState(2);

  // Thermal bounds key — increments on map moveend at high zoom to trigger viewport culling
  const [thermalBoundsKey, setThermalBoundsKey] = useState(0);

  // Hover preview state
  const [hoveredEvent, setHoveredEvent] = useState<Event | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Define world bounds to prevent vertical blank space
    // Web Mercator projection is valid roughly between -85 and 85 latitude
    const worldBounds = L.latLngBounds(
      L.latLng(-85, -Infinity), // Southwest corner (limit south pan)
      L.latLng(85, Infinity)    // Northeast corner (limit north pan)
    );

    const map = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      maxBounds: worldBounds,
      maxBoundsViscosity: 1.0, // Prevents dragging beyond bounds completely
      worldCopyJump: true, // Allows horizontal wrap while maintaining vertical constraint
    });

    // Add dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Track zoom level for cluster/individual pin toggle
    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    // Track map panning at high zoom for thermal viewport culling (debounced)
    let boundsTimer: ReturnType<typeof setTimeout> | null = null;
    map.on('moveend', () => {
      if (map.getZoom() >= 5) {
        if (boundsTimer) clearTimeout(boundsTimer);
        boundsTimer = setTimeout(() => setThermalBoundsKey(k => k + 1), 350);
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Intel overlay management with interactivity
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Map layer keys to their enabled state and file paths
    const layerConfig: Record<string, { enabled: boolean; file: string }> = {
      conflict_zones: { enabled: !!intelConflictZones, file: '/intel/conflict_zones.geojson' },
      disputed_borders: { enabled: !!intelDisputedBorders, file: '/intel/disputed_borders.geojson' },
      maritime_zones: { enabled: !!intelMaritimeZones, file: '/intel/maritime_zones.geojson' },
      sanctions: { enabled: !!intelSanctions, file: '/intel/sanctions.geojson' },
      restricted_airspace: { enabled: !!intelRestrictedAirspace, file: '/intel/restricted_airspace.geojson' },
      protest_unrest: { enabled: !!intelProtestUnrest, file: '/intel/protest_unrest.geojson' },
      internet_shutdown: { enabled: !!intelInternetShutdown, file: '/intel/internet_shutdown.geojson' },
      military_activity: { enabled: !!intelMilitaryActivity, file: '/intel/military_activity.geojson' },
      strike_indicators: { enabled: !!intelStrikeIndicators, file: '/intel/strike_indicators.geojson' },
      thermal_anomalies: { enabled: !!intelThermalAnomalies, file: '/intel/thermal_anomalies.geojson' },
    };

    const intelLayers = intelLayersRef.current;
    const dataCache = intelDataCacheRef.current;
    const itemsByLayer = intelItemsByLayerRef.current;

    // Process each layer
    Object.entries(layerConfig).forEach(async ([layerKey, config]) => {
      const existingLayer = intelLayers.get(layerKey);

      // If layer should be OFF, remove it
      if (!config.enabled) {
        if (existingLayer) {
          existingLayer.remove();
          intelLayers.delete(layerKey);
          console.log(`[INTEL OVERLAY] Removed: ${layerKey}`);
        }
        return;
      }

      // Layer should be ON - skip if already rendered
      if (existingLayer) {
        return;
      }

      // Load GeoJSON data (from cache or fetch)
      let geoJsonData = dataCache.get(layerKey);
      if (!geoJsonData) {
        try {
          const response = await fetch(config.file);
          if (!response.ok) {
            console.warn(`[INTEL OVERLAY] Failed to load ${layerKey}: ${response.status}`);
            return;
          }
          geoJsonData = await response.json() as GeoJsonFeatureCollection;
          dataCache.set(layerKey, geoJsonData);
          console.log(`[INTEL OVERLAY] Loaded ${layerKey}: ${geoJsonData.features.length} features`);
        } catch (error) {
          console.warn(`[INTEL OVERLAY] Error loading ${layerKey}:`, error);
          return;
        }
      }

      // Check map still exists after async fetch
      if (!mapRef.current) return;

      // Convert features to IntelItems and cache them
      const intelItems: IntelItem[] = geoJsonData.features.map((f) => 
        featureToIntelItem(f as Parameters<typeof featureToIntelItem>[0], layerKey)
      );
      itemsByLayer.set(layerKey, intelItems);
      
      // Notify parent of loaded intel items
      if (onIntelDataLoaded) {
        onIntelDataLoaded(layerKey, intelItems);
      }

      // Get style for this layer
      const style = INTEL_LAYER_STYLES[layerKey] || {
        color: '#888888',
        fillColor: '#888888',
        fillOpacity: 0.1,
        weight: 1,
      };

      // Create GeoJSON layer with styling and interactivity
      try {
        const geoJsonLayer = L.geoJSON(geoJsonData, {
          style: (feature) => {
            const intelId = String(feature?.properties?.id || '');
            const isSelected = selectedIntelId === intelId;
            return {
              color: style.color,
              fillColor: style.fillColor,
              fillOpacity: isSelected ? style.fillOpacity + 0.2 : style.fillOpacity,
              weight: isSelected ? style.weight + 2 : style.weight,
              dashArray: style.dashArray,
              opacity: isSelected ? 1 : 0.8,
            };
          },
          // Filter out points (we only render polygons/lines)
          filter: (feature) => {
            const geomType = feature.geometry?.type;
            return geomType !== 'Point' && geomType !== 'MultiPoint';
          },
          // Add interactivity to each feature
          onEachFeature: (feature, layer) => {
            const props = feature.properties || {};
            const intelId = String(props.id || '');
            const name = String(props.name || 'Unknown');
            const kind = String(props.kind || layerKey);
            const region = String(props.region || 'Unknown');
            const severity = typeof props.severity === 'number' ? props.severity : 3;
            const severityLabel = SEVERITY_LABELS[severity] || 'Unknown';
            
            // Create tooltip content
            const tooltipContent = `
              <div style="font-family: monospace; font-size: 11px; color: #e8e8e8;">
                <div style="font-weight: bold; color: ${style.color}; margin-bottom: 4px;">${kind.replace('_', ' ').toUpperCase()}</div>
                <div style="font-weight: 500;">${name}</div>
                <div style="color: #6b6b70; font-size: 10px;">${region}</div>
                <div style="margin-top: 4px; color: ${severity >= 4 ? '#ff1744' : severity >= 3 ? '#ffab00' : '#00e676'};">
                  Severity: ${severityLabel}
                </div>
              </div>
            `;
            
            // Bind tooltip on hover
            layer.bindTooltip(tooltipContent, {
              sticky: true,
              direction: 'top',
              offset: [0, -10],
              className: 'intel-tooltip',
              opacity: 0.95,
            });
            
            // Add hover effect
            layer.on({
              mouseover: function(e) {
                const layer = e.target;
                layer.setStyle({
                  weight: style.weight + 2,
                  fillOpacity: style.fillOpacity + 0.15,
                  opacity: 1,
                });
                if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                  layer.bringToFront();
                }
              },
              mouseout: function(e) {
                const layer = e.target;
                const isSelected = selectedIntelId === intelId;
                layer.setStyle({
                  weight: isSelected ? style.weight + 2 : style.weight,
                  fillOpacity: isSelected ? style.fillOpacity + 0.2 : style.fillOpacity,
                  opacity: isSelected ? 1 : 0.8,
                });
              },
              click: function() {
                // Find the IntelItem for this feature
                const item = intelItems.find(i => i.id === intelId);
                if (item && onIntelSelect) {
                  onIntelSelect(item);
                }
              },
            });
            
            // Store intel id on layer for selection highlighting
            (layer as L.Layer & { __intelId?: string }).__intelId = intelId;
          },
        });

        // Add to map and store reference
        geoJsonLayer.addTo(mapRef.current);
        intelLayers.set(layerKey, geoJsonLayer);
        console.log(`[INTEL OVERLAY] Rendered: ${layerKey}`);
      } catch (error) {
        console.warn(`[INTEL OVERLAY] Error rendering ${layerKey}:`, error);
      }
    });

    // Cleanup on unmount or before next effect run
    return () => {
      // Note: We don't clear layers here because we want them to persist
      // across re-renders unless their toggle state changes
    };
  }, [intelMode, intelConflictZones, intelDisputedBorders, intelSanctions, intelRestrictedAirspace, intelMaritimeZones, intelProtestUnrest, intelInternetShutdown, intelMilitaryActivity, intelStrikeIndicators, intelThermalAnomalies, selectedIntelId, onIntelSelect, onIntelDataLoaded]);

  // Fly to selected intel item
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedIntelId) return;

    // Find the intel item in cache
    const itemsByLayer = intelItemsByLayerRef.current;
    let foundItem: IntelItem | null = null;
    
    for (const items of itemsByLayer.values()) {
      const item = items.find(i => i.id === selectedIntelId);
      if (item) {
        foundItem = item;
        break;
      }
    }

    if (foundItem?.geometry) {
      // Get center of geometry
      const bounds = getGeometryBounds(foundItem.geometry);
      if (bounds) {
        const [[minLat, minLng], [maxLat, maxLng]] = bounds;
        const centerLat = (minLat + maxLat) / 2;
        const centerLng = (minLng + maxLng) / 2;
        
        // Fly to center
        map.flyTo([centerLat, centerLng], 5, {
          duration: 1.5,
        });
        console.log(`[INTEL OVERLAY] Flying to: ${foundItem.name}`);
      }
    }
  }, [selectedIntelId]);

  // Handle ESC key to deselect (events AND intel)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedEventKey) {
          onDeselect();
        }
        if (selectedIntelId && onIntelDeselect) {
          onIntelDeselect();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEventKey, onDeselect, selectedIntelId, onIntelDeselect]);

  // Track spread state changes
  useEffect(() => {
    if (prevSpreadRef.current !== spreadCentroidPins) {
      spreadChangedRef.current = true;
      prevSpreadRef.current = spreadCentroidPins;
      // Clear ALL markers when spread changes
      markersByKeyRef.current.forEach(marker => marker.remove());
      markersByKeyRef.current.clear();
    }
  }, [spreadCentroidPins]);

  // Render markers based on current events
  const renderMarkers = useCallback((visibleEvents: Event[]) => {
    const map = mapRef.current;
    // Guard: ensure map and container exist
    if (!map || !map.getContainer?.() || !map.getContainer()) return;

    const markersByKey = markersByKeyRef.current;
    const clusterMarkers = clusterMarkersRef.current;
    const visibleKeys = new Set(visibleEvents.map(e => e.eventKey));

    // ── ZOOM-BASED CLUSTER MODE ───────────────────────────────────────────────
    // At zoom < 3: render one cluster per country with event count badge.
    // At zoom >= 3: render individual tactical pins (standard behavior).
    // ─────────────────────────────────────────────────────────────────────────
    const isClusterMode = currentZoom < 3;

    if (isClusterMode) {
      // Clear individual markers
      markersByKey.forEach(marker => marker.remove());
      markersByKey.clear();

      // Group renderable events by countryKey
      const renderableEvents = visibleEvents.filter(e =>
        e.locationPrecision !== 'none' && e.lat !== null && e.lng !== null
      );
      const byCountry = new Map<string, Event[]>();
      for (const event of renderableEvents) {
        const key = event.countryKey || 'unknown';
        if (!byCountry.has(key)) byCountry.set(key, []);
        byCountry.get(key)!.push(event);
      }

      // Remove cluster markers that no longer have events
      const currentCountryKeys = new Set(byCountry.keys());
      clusterMarkers.forEach((marker, key) => {
        if (!currentCountryKeys.has(key)) {
          marker.remove();
          clusterMarkers.delete(key);
        }
      });

      // Tier priority order for dominant tier
      const TIER_PRIORITY: Tier[] = ['verified', 'watch', 'breaking'];
      const CLUSTER_TIER_COLORS: Record<Tier, string> = {
        breaking: '#ff1744',
        watch: '#ffab00',
        verified: '#00e676',
      };

      byCountry.forEach((countryEvents, countryKey) => {
        // Compute cluster centroid (average of all event coords)
        let sumLat = 0, sumLng = 0, count = 0;
        for (const e of countryEvents) {
          if (e.lat !== null && e.lng !== null) {
            sumLat += e.lat; sumLng += e.lng; count++;
          }
        }
        if (count === 0) return;
        const clusterLat = sumLat / count;
        const clusterLng = sumLng / count;

        // Dominant tier = highest priority tier present
        let dominantTier: Tier = 'breaking';
        for (const tier of TIER_PRIORITY) {
          if (countryEvents.some(e => e.tier === tier)) {
            dominantTier = tier;
            break;
          }
        }
        const tierColor = CLUSTER_TIER_COLORS[dominantTier];

        // Create or update cluster marker
        const existingCluster = clusterMarkers.get(countryKey);
        if (existingCluster) {
          existingCluster.remove();
          clusterMarkers.delete(countryKey);
        }

        const clusterCount = countryEvents.length;
        const pulseClass = clusterCount >= 25 ? 'cluster-pulse' : '';
        // Tier-specific glow: tight and subdued — not cartoon
        const glowAlpha = dominantTier === 'breaking' ? '50' : '35';
        const clusterHtml = `
          <div class="cluster-marker ${pulseClass}" style="
            border-color: ${tierColor};
            box-shadow: 0 0 6px ${tierColor}${glowAlpha}, inset 0 0 4px rgba(0,0,0,0.6);
            color: ${tierColor};
          ">
            <span class="cluster-count">${clusterCount}</span>
          </div>
        `;

        const clusterIcon = L.divIcon({
          html: clusterHtml,
          className: 'cluster-marker-icon',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        const clusterMarker = L.marker([clusterLat, clusterLng], {
          icon: clusterIcon,
          interactive: true,
          keyboard: false,
        });

        clusterMarker.on('click', () => {
          map.setZoom(3, { animate: true });
          map.panTo([clusterLat, clusterLng]);
        });

        clusterMarker.addTo(map);
        clusterMarkers.set(countryKey, clusterMarker);
      });

      // In cluster mode we're done
      return;
    }

    // Not in cluster mode — clear any cluster markers and render individual pins
    clusterMarkers.forEach(marker => marker.remove());
    clusterMarkers.clear();

    // ============================================================
    // MAP RENDER RULE: Tier-aware country-level filtering
    // ============================================================
    // - city / region: always render (primary pins)
    // - country + breaking + Spread ON: RENDER — scatter places them on land
    // - country + breaking + Spread OFF: SUPPRESS (centroid clutter)
    // - country + watch/verified: RENDER with secondary visual treatment
    // - none: always suppress (no usable coords)
    // ============================================================
    const eventsToRender = visibleEvents.filter(e => {
      if (e.locationPrecision === 'none') return false;
      // When Spread On, scatter handles placement — show all events
      if (spreadCentroidPins) return true;
      // When Spread Off, suppress country-level breaking to avoid centroid blob
      if (e.locationPrecision === 'country' && e.tier === 'breaking') return false;
      return true;
    });

    // Count for debug transparency
    let exactRendered = 0;
    let approxRendered = 0;
    let countrySecondary = 0;   // watch/verified country-level — rendered muted
    let countryHiddenFromMap = 0; // breaking country-level — suppressed
    let noLocationHidden = 0;
    for (const e of visibleEvents) {
      if (e.locationPrecision === 'none') {
        noLocationHidden++;
      } else if (e.locationPrecision === 'country' && e.tier === 'breaking') {
        countryHiddenFromMap++;
      } else if (e.locationPrecision === 'country') {
        countrySecondary++;
      } else if (e.coordPrecision === 'exact') {
        exactRendered++;
      } else if (e.coordPrecision === 'centroid') {
        approxRendered++;
      }
    }

    // PROOF LOG: Show what's rendered vs hidden from map
    console.log('[MAP] PINS RENDERED:', eventsToRender.length, '| exact:', exactRendered, 'centroid:', approxRendered, '| country-secondary:', countrySecondary, '| HIDDEN: breaking-country:', countryHiddenFromMap, 'no-location:', noLocationHidden);

    // TIER VISIBILITY LOG
    const watchItems = visibleEvents.filter(e => e.tier === 'watch');
    const verifiedItems = visibleEvents.filter(e => e.tier === 'verified');
    const watchWithCoords = watchItems.filter(e => e.locationPrecision !== 'none');
    const verifiedWithCoords = verifiedItems.filter(e => e.locationPrecision !== 'none');
    const watchRendered = eventsToRender.filter(e => e.tier === 'watch').length;
    const verifiedRendered = eventsToRender.filter(e => e.tier === 'verified').length;
    const hiddenByRule = visibleEvents.length - eventsToRender.length;
    console.log('[TIER VIS] watch:', watchItems.length, '/ coords:', watchWithCoords.length, '/ rendered:', watchRendered,
      '| verified:', verifiedItems.length, '/ coords:', verifiedWithCoords.length, '/ rendered:', verifiedRendered,
      '| hiddenByRule:', hiddenByRule);

    // Remove markers that are no longer visible OR when spread changed
    const markersToRemove: string[] = [];
    markersByKey.forEach((marker, eventKey) => {
      if (!visibleKeys.has(eventKey)) {
        marker.remove();
        markersToRemove.push(eventKey);
      }
    });
    markersToRemove.forEach(key => markersByKey.delete(key));
    
    // When spread is OFF, also remove any remaining centroid markers
    if (!spreadCentroidPins) {
      markersByKey.forEach((marker, eventKey) => {
        const event = visibleEvents.find(e => e.eventKey === eventKey);
        if (event && event.coordPrecision === 'centroid') {
          marker.remove();
          markersToRemove.push(eventKey);
        }
      });
      markersToRemove.forEach(key => markersByKey.delete(key));
    }

    // Debug: log coord buckets AFTER scatter and ocean rejection stats
    if (typeof window !== 'undefined' && visibleEvents.length > 0) {
      const displayBuckets = new Map<string, number>();
      for (const event of eventsToRender) {
        const [latD, lngD] = getDisplayCoords(event, spreadCentroidPins);
        const key = `${latD.toFixed(3)},${lngD.toFixed(3)}`;
        displayBuckets.set(key, (displayBuckets.get(key) || 0) + 1);
      }
      const topDisplayBuckets = Array.from(displayBuckets.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      
      // Log placement stats
      console.log('[MAP] === PLACEMENT DEBUG ===');
      console.log('[MAP] OceanRejectCount:', oceanRejectCount, '(MUST be > 0 when Spread On)');
      console.log('[MAP] LandPlacementAttempts (attempt# -> count):', 
        Array.from(placementAttemptsHistogram.entries()).sort((a, b) => a[0] - b[0]));
      console.log('[MAP] Top 10 display coord buckets:', topDisplayBuckets);
      
      // TEMP PROOF: Country scatter method breakdown
      console.log('[MAP] countryScatterUsedBounds:', countryScatterUsedBounds);
      console.log('[MAP] countryScatterUsedRadius:', countryScatterUsedRadius);
      if (sampleMisplacements.length > 0) {
        console.log('[MAP] sampleMisplacements:', sampleMisplacements.slice(0, 5));
      }
      
      // PROOF: Congo countryKey and locationLabel verification
      const congoEvents = eventsToRender.filter(e => e.countryKey === 'cd' || e.countryKey === 'cg');
      if (congoEvents.length > 0) {
        const cdCount = eventsToRender.filter(e => e.countryKey === 'cd').length;
        const cgCount = eventsToRender.filter(e => e.countryKey === 'cg').length;
        console.log('[MAP] === CONGO PROOF ===');
        console.log('[MAP] DRC (cd) events:', cdCount);
        console.log('[MAP] Republic of Congo (cg) events:', cgCount);
        console.log('[MAP] Congo sample locationLabels:', congoEvents.slice(0, 5).map(e => e.locationLabel));
        console.log('[MAP] ========================');
      }
      
      // PROOF: Top 20 locationLabels for visibility
      const labelCounts = new Map<string, number>();
      for (const event of eventsToRender) {
        const label = event.locationLabel || 'null';
        labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
      }
      const topLabels = Array.from(labelCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
      console.log('[MAP] Top 20 locationLabels:', topLabels.map(([l, c]) => `${l}(${c})`).join(', '));
      
      // PROOF: Top 20 countryKeys for visibility
      const keyCounts = new Map<string, number>();
      for (const event of eventsToRender) {
        keyCounts.set(event.countryKey, (keyCounts.get(event.countryKey) || 0) + 1);
      }
      const topKeys = Array.from(keyCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
      console.log('[MAP] Top 20 countryKeys:', topKeys.map(([k, c]) => `${k}(${c})`).join(', '));
      console.log('[MAP] ========================');
    }

    // Add/update visible markers in batches for performance
    let batchIndex = 0;
    const batchSize = 100;
    
    const addBatch = () => {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, eventsToRender.length);
      
      for (let i = start; i < end; i++) {
        const event = eventsToRender[i];
        if (!event.lat || !event.lng) continue;
        
        const existingMarker = markersByKey.get(event.eventKey);
        const tierColor = TIER_COLORS[event.tier];
        const topicColor = TOPIC_COLORS[event.topic] || '#888888';
        
        // Get threat score for this event
        const threatResult = threatScores?.get(event.eventKey);
        const threatLevel = threatResult?.level || 'low';
        const threatScore = threatResult?.score || 0;
        
        // Threat-aware marker sizing
        const baseRadius = 8;
        const threatRadiusBoost = {
          low: 0,
          moderate: 1,
          high: 2,
          critical: 3,
        };
        const radius = baseRadius + (threatRadiusBoost[threatLevel] || 0);
        
        // Get display coordinates (with scatter for centroids if enabled)
        const [latDisplay, lngDisplay] = getDisplayCoords(event, spreadCentroidPins);
        
        if (existingMarker) {
          // Update existing marker - for divIcon, we need to recreate it
          // Remove old marker and create new one
          existingMarker.remove();
          markersByKey.delete(event.eventKey);
        }
        
        // Create tactical signal marker HTML with CSS classes
        const tierClass = `pin-${event.tier}`;
        const threatClass = `pin-threat-${threatLevel}`;
        // Country-level Watch/Verified: secondary treatment (muted, no pulse)
        const isCountryLevel = event.locationPrecision === 'country';
        const countryClass = isCountryLevel ? 'pin-country-level' : '';
        
        // Build the tactical signal HTML
        const markerHtml = `
          <div class="pin-wrapper ${tierClass} ${threatClass} ${countryClass}" style="pointer-events: auto;">
            <div class="pin-halo"></div>
            <div class="pin-pulse"></div>
            <div class="pin-core"></div>
          </div>
        `;
        
        // Country-level: smaller icon footprint to signal lower positional confidence
        const pinSize: [number, number] = isCountryLevel ? [24, 24] : [32, 32];
        const pinAnchor: [number, number] = isCountryLevel ? [12, 12] : [16, 16];

        // Create divIcon with tactical signal styling
        const icon = L.divIcon({
          html: markerHtml,
          className: 'tactical-marker-icon',
          iconSize: pinSize,
          iconAnchor: pinAnchor,
        });
        
        // Create marker with divIcon
        const marker = L.marker([latDisplay, lngDisplay], {
          icon: icon,
          interactive: true,
          keyboard: false,
        });

        // Store original event data on marker
        (marker as L.Marker & { __eventKey?: string; __threatLevel?: ThreatLevel; __tier?: Tier }).__eventKey = event.eventKey;
        (marker as L.Marker & { __threatLevel?: ThreatLevel }).__threatLevel = threatLevel;
        (marker as L.Marker & { __tier?: Tier }).__tier = event.tier;

        marker.on('click', () => {
          // Toggle: if clicking the already selected pin, deselect
          if (selectedEventKey === event.eventKey) {
            onDeselect();
          } else {
            onPinClick(event);
          }
        });

        marker.on('mouseover', (e: L.LeafletMouseEvent) => {
          const orig = e.originalEvent as MouseEvent;
          setHoveredEvent(event);
          setHoverPos({ x: orig.clientX, y: orig.clientY });
        });
        marker.on('mousemove', (e: L.LeafletMouseEvent) => {
          const orig = e.originalEvent as MouseEvent;
          setHoverPos({ x: orig.clientX, y: orig.clientY });
        });
        marker.on('mouseout', () => {
          setHoveredEvent(null);
        });

        marker.addTo(map);
        markersByKey.set(event.eventKey, marker);
      }
      
      batchIndex++;
      
      if (end < eventsToRender.length) {
        requestAnimationFrame(addBatch);
      }
    };

    if (eventsToRender.length > 0) {
      addBatch();
    }
  }, [onPinClick, selectedEventKey, onDeselect, spreadCentroidPins, currentZoom]);

  // ── SENSOR POLLING EFFECTS ──────────────────────────────────────────────

  // Thermal — NASA FIRMS (60s polling, fails silently)
  useEffect(() => {
    if (!sensorThermal) { setThermalData([]); return; }
    let cancelled = false;
    const fetchThermal = async () => {
      try {
        const res = await fetch('/api/sensors/thermal');
        if (!res.ok) { console.warn('[THERMAL] API error:', res.status); return; }
        const data = await res.json();
        const pts = data.points ?? [];
        console.log(`[THERMAL] Fetched: ${pts.length} points (source: ${data.source ?? 'unknown'})`);
        if (!cancelled) setThermalData(pts);
      } catch (e) { console.warn('[THERMAL] fetch failed:', e); }
    };
    fetchThermal();
    const id = setInterval(fetchThermal, 300_000); // 5min — static file updates every ~12h
    return () => { cancelled = true; clearInterval(id); };
  }, [sensorThermal]);

  // Seismic — USGS earthquakes (60s polling)
  useEffect(() => {
    if (!sensorSeismic) { setSeismicData([]); return; }
    let cancelled = false;
    const fetchSeismic = async () => {
      try {
        const res = await fetch('/api/sensors/seismic');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSeismicData(data.events ?? []);
      } catch { /* fail silently */ }
    };
    fetchSeismic();
    const id = setInterval(fetchSeismic, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [sensorSeismic]);

  // Aircraft — OpenSky (60s polling)
  useEffect(() => {
    if (!sensorAircraft) { setAircraftData([]); return; }
    let cancelled = false;
    const fetchAircraft = async () => {
      try {
        const res = await fetch('/api/sensors/aircraft');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setAircraftData(data.aircraft ?? []);
      } catch { /* fail silently */ }
    };
    fetchAircraft();
    const id = setInterval(fetchAircraft, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [sensorAircraft]);

  // ── SENSOR RENDER EFFECTS ────────────────────────────────────────────────

  // Render thermal anomaly markers
  // Uses L.circleMarker (canvas-rendered with preferCanvas:true) for minimal DOM overhead.
  // Zoom-sensitive density caps + viewport culling at high zoom prevent lag.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing layer
    if (thermalLayerRef.current) {
      thermalLayerRef.current.remove();
      thermalLayerRef.current = null;
    }

    if (!sensorThermal || thermalData.length === 0) return;

    // === ZOOM-SENSITIVE DENSITY CAPS (per spec) ===
    const thermalCap =
      currentZoom < 3 ? 200 :
      currentZoom < 5 ? 500 :
      currentZoom < 7 ? 900 :
      thermalData.length;

    // Sort by brightness desc — hottest fires shown first when capped
    let thermalCandidates = thermalData
      .slice()
      .sort((a, b) => (b.brightness ?? 0) - (a.brightness ?? 0));

    // === VIEWPORT CULLING — only at zoom >= 6 to avoid hiding points at world view ===
    // At low zoom the whole world is visible; culling at zoom < 6 would incorrectly
    // eliminate valid global points. Only cull when zoomed in enough that
    // off-screen points are genuinely out of view.
    if (currentZoom >= 6) {
      const bounds = map.getBounds().pad(0.25); // generous 25% padding
      thermalCandidates = thermalCandidates.filter(
        pt => bounds.contains([pt.lat, pt.lng])
      );
    }

    const thermalVisible = thermalCandidates.slice(0, thermalCap);
    console.log(`[THERMAL RENDER] zoom=${currentZoom} cap=${thermalCap} candidates=${thermalCandidates.length} rendering=${thermalVisible.length}`);

    // === CANVAS CIRCLE MARKERS — lightweight, rendered to canvas (preferCanvas:true) ===
    // Radius and opacity scaled by zoom so markers are always visually present.
    const group = L.layerGroup();
    thermalVisible.forEach((pt) => {
      // Brightness-based intensity: VIIRS bright_ti4 typically 300–500K range
      const intensity = Math.min(1, Math.max(0, (pt.brightness - 300) / 200));
      // Minimum fillOpacity 0.82 — strong visibility on dark basemap per spec
      const fillOpacity = 0.82 + intensity * 0.15;
      // Minimum radius 4 per spec, scales with zoom for world-view visibility
      const radius = currentZoom < 3 ? 4 : currentZoom < 5 ? 5 : currentZoom < 7 ? 6 : 7;

      const marker = L.circleMarker([pt.lat, pt.lng], {
        radius,
        fillColor: '#ff8c00',   // strong amber-orange core
        fillOpacity,
        color: '#ff4400',       // slightly darker stroke for definition
        weight: 0.8,
        opacity: 0.9,
        interactive: true,
      });
      const brLabel = pt.brightness > 0 ? `${Math.round(pt.brightness)}K` : '—';
      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:10px;color:#ffcc80;"><b>THERMAL ANOMALY</b><br/>Brightness: ${brLabel}<br/>${pt.acq_datetime}</div>`,
        { sticky: true, direction: 'top', offset: [0, -8], opacity: 0.95, className: 'intel-tooltip' }
      );
      marker.addTo(group);
    });
    group.addTo(map);
    thermalLayerRef.current = group;

    return () => {
      group.remove();
      thermalLayerRef.current = null;
    };
  }, [sensorThermal, thermalData, currentZoom, thermalBoundsKey]);

  // Render seismic event markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (seismicLayerRef.current) {
      seismicLayerRef.current.remove();
      seismicLayerRef.current = null;
    }

    if (!sensorSeismic || seismicData.length === 0) return;

    // Zoom-sensitive density cap — prioritize higher-magnitude events at low zoom
    const seismicCap = currentZoom < 3 ? 60 : currentZoom < 5 ? 150 : seismicData.length;
    const seismicVisible = seismicData
      .slice()
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, seismicCap);

    const group = L.layerGroup();
    seismicVisible.forEach((ev) => {
      const sizePx = Math.max(6, Math.min(22, ev.magnitude * 4));
      const half = sizePx / 2;
      const icon = L.divIcon({
        html: `<div class="sensor-seismic-marker" style="width:${sizePx}px;height:${sizePx}px;"></div>`,
        className: '',
        iconSize: [sizePx, sizePx],
        iconAnchor: [half, half],
      });
      const marker = L.marker([ev.lat, ev.lng], { icon, interactive: true, zIndexOffset: -90 });
      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:10px;color:#ce93d8;"><b>SEISMIC M${ev.magnitude}</b><br/>${ev.place}<br/>Depth: ${Math.round(ev.depth)} km<br/>${new Date(ev.time).toUTCString()}</div>`,
        { sticky: true, direction: 'top', offset: [0, -8], opacity: 0.95, className: 'intel-tooltip' }
      );
      marker.addTo(group);
    });
    group.addTo(map);
    seismicLayerRef.current = group;

    return () => {
      group.remove();
      seismicLayerRef.current = null;
    };
  }, [sensorSeismic, seismicData, currentZoom]);

  // Render aircraft markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (aircraftLayerRef.current) {
      aircraftLayerRef.current.remove();
      aircraftLayerRef.current = null;
    }

    if (!sensorAircraft || aircraftData.length === 0) return;

    // Zoom-sensitive density cap — always keep military aircraft visible
    const aircraftCap = currentZoom < 3 ? 80 : currentZoom < 5 ? 200 : aircraftData.length;
    // Prioritize military aircraft over civilian at low zoom
    const militaryAc = aircraftData.filter(a => a.isMilitary);
    const civilianAc = aircraftData.filter(a => !a.isMilitary);
    const remainingSlots = Math.max(0, aircraftCap - militaryAc.length);
    const aircraftVisible = [...militaryAc, ...civilianAc.slice(0, remainingSlots)];

    const group = L.layerGroup();
    aircraftVisible.forEach((ac) => {
      const icon = L.divIcon({
        html: `<div class="sensor-aircraft-marker" style="transform:rotate(${ac.heading}deg)">▲</div>`,
        className: '',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = L.marker([ac.lat, ac.lng], { icon, interactive: true, zIndexOffset: -80 });
      // Conservative labels — avoid over-claiming aircraft purpose
      const typeLabel = ac.isMilitary ? '⚠ MILITARY / SPECIAL FLT' : 'FLAGGED AIR ACTIVITY';
      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:10px;color:#00e5ff;"><b>${typeLabel}</b><br/>Call: ${ac.callsign}<br/>Alt: ${ac.altitudeFt.toLocaleString()} ft<br/>Spd: ${ac.velocityKts} kts<br/>Hdg: ${Math.round(ac.heading)}°</div>`,
        { sticky: true, direction: 'top', offset: [0, -8], opacity: 0.95, className: 'intel-tooltip' }
      );
      marker.addTo(group);
    });
    group.addTo(map);
    aircraftLayerRef.current = group;

    return () => {
      group.remove();
      aircraftLayerRef.current = null;
    };
  }, [sensorAircraft, aircraftData, currentZoom]);

  // ── END SENSOR RENDER EFFECTS ────────────────────────────────────────────

  // ── INTEL DENSITY HEATMAP ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (heatmapLayerRef.current) {
      heatmapLayerRef.current.remove();
      heatmapLayerRef.current = null;
    }

    if (!intelDensityHeatmap || events.length === 0) return;

    const now = Date.now();
    const GRID_DEG = 3;

    // Grid-aggregate events into cells for smooth density blobs
    const grid = new Map<string, {
      sumLat: number;
      sumLng: number;
      totalWeight: number;
      topTier: string;
    }>();

    for (const event of events) {
      if (!event.lat || !event.lng) continue;

      const tierWeight = event.tier === 'breaking' ? 3 : event.tier === 'watch' ? 2 : 1;
      const ageHours = (now - new Date(event.latestPublishedAt).getTime()) / 3_600_000;
      const recencyMult = ageHours < 24 ? 1.0 : ageHours < 48 ? 0.7 : 0.4;
      const sourceMult = Math.min(1.5, 1 + (event.sourceCount - 1) * 0.2);
      const weight = tierWeight * recencyMult * sourceMult;

      const gridLat = Math.round(event.lat / GRID_DEG) * GRID_DEG;
      const gridLng = Math.round(event.lng / GRID_DEG) * GRID_DEG;
      const key = `${gridLat},${gridLng}`;

      const cell = grid.get(key) ?? { sumLat: 0, sumLng: 0, totalWeight: 0, topTier: 'verified' };
      cell.sumLat += event.lat * weight;
      cell.sumLng += event.lng * weight;
      cell.totalWeight += weight;
      if (event.tier === 'breaking') cell.topTier = 'breaking';
      else if (event.tier === 'watch' && cell.topTier !== 'breaking') cell.topTier = 'watch';
      grid.set(key, cell);
    }

    if (grid.size === 0) return;

    const maxWeight = Math.max(...Array.from(grid.values()).map(c => c.totalWeight));
    const group = L.layerGroup();

    grid.forEach((cell) => {
      const centerLat = cell.sumLat / cell.totalWeight;
      const centerLng = cell.sumLng / cell.totalWeight;
      const norm = cell.totalWeight / maxWeight; // 0–1

      // Gradient: green → yellow → orange → red
      let color: string;
      if (norm < 0.25) color = '#00e676';
      else if (norm < 0.5) color = '#ffeb3b';
      else if (norm < 0.75) color = '#ff9800';
      else color = '#f44336';

      const radius = 18 + norm * 28;            // 18–46px screen radius
      const fillOpacity = 0.035 + norm * 0.055; // 0.035–0.090

      L.circleMarker([centerLat, centerLng], {
        radius,
        fillColor: color,
        fillOpacity,
        stroke: false,
        interactive: false,
        pane: 'overlayPane',
      }).addTo(group);
    });

    group.addTo(map);
    heatmapLayerRef.current = group;

    return () => {
      if (heatmapLayerRef.current) {
        heatmapLayerRef.current.remove();
        heatmapLayerRef.current = null;
      }
    };
  }, [intelDensityHeatmap, events]);

  // ── END INTEL DENSITY HEATMAP ─────────────────────────────────────────────

  // Update markers when events change
  useEffect(() => {
    renderMarkers(events);
  }, [events, renderMarkers]);

  // Handle selected event - highlight and pan
  useEffect(() => {
    if (!mapRef.current) return;

    const markersByKey = markersByKeyRef.current;

    // Reset previous selected marker
    if (selectedMarkerRef.current) {
      const prevIcon = selectedMarkerRef.current.getIcon();
      if (prevIcon && 'options' in prevIcon) {
        const prevHtml = (prevIcon as L.DivIcon).options.html as string;
        if (typeof prevHtml === 'string') {
          // Remove selected class from the marker
          const cleanHtml = prevHtml.replace(/pin-selected/g, '').replace(/\s+/g, ' ');
          const newIcon = L.divIcon({
            html: cleanHtml,
            className: 'tactical-marker-icon',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          selectedMarkerRef.current.setIcon(newIcon);
        }
      }
      // Reset z-index offset
      selectedMarkerRef.current.setZIndexOffset(0);
      selectedMarkerRef.current = null;
    }

    // Highlight new selected marker
    if (selectedEventKey) {
      const marker = markersByKey.get(selectedEventKey);
      if (marker) {
        const event = events.find(e => e.eventKey === selectedEventKey);
        
        // Add selected class to the marker
        const icon = marker.getIcon();
        if (icon && 'options' in icon) {
          const html = (icon as L.DivIcon).options.html as string;
          if (typeof html === 'string') {
            const selectedHtml = html.replace('pin-wrapper', 'pin-wrapper pin-selected');
            const newIcon = L.divIcon({
              html: selectedHtml,
              className: 'tactical-marker-icon',
              iconSize: [40, 40],
              iconAnchor: [20, 20],
            });
            marker.setIcon(newIcon);
          }
        }
        
        // Use setZIndexOffset to bring marker to front (L.Marker doesn't have bringToFront)
        marker.setZIndexOffset(1000);
        selectedMarkerRef.current = marker;

        // Pan to location (use original coords, not jittered)
        if (event?.lat && event?.lng) {
          mapRef.current.flyTo([event.lat, event.lng], 5, {
            duration: 1.5,
          });
        }
      }
    }
  }, [selectedEventKey, events]);

  const TIER_COLORS: Record<string, string> = {
    breaking: '#ff1744',
    watch: '#ffab00',
    verified: '#00e676',
  };

  return (
    <>
      <div 
        ref={mapContainerRef} 
        className="w-full h-full"
        style={{ background: '#0b0b0d' }}
      />
      {hoveredEvent && (
        <div
          className="orion-hover-preview"
          style={{ left: hoverPos.x + 14, top: hoverPos.y + 14 }}
        >
          {/* Tier + Confidence row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <div
              className="orion-hover-preview-tier"
              style={{ color: TIER_COLORS[hoveredEvent.tier] ?? '#888', margin: 0 }}
            >
              {hoveredEvent.tier}
            </div>
            {hoveredEvent.confidence && (
              <div style={{
                fontSize: '8px',
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                padding: '1px 5px',
                borderRadius: '3px',
                color: hoveredEvent.confidence === 'high'
                  ? '#00e676'
                  : hoveredEvent.confidence === 'medium'
                  ? '#ffab00'
                  : '#6b6b70',
                background: hoveredEvent.confidence === 'high'
                  ? 'rgba(0,230,118,0.10)'
                  : hoveredEvent.confidence === 'medium'
                  ? 'rgba(255,171,0,0.10)'
                  : 'rgba(107,107,112,0.10)',
                border: `1px solid ${hoveredEvent.confidence === 'high'
                  ? 'rgba(0,230,118,0.22)'
                  : hoveredEvent.confidence === 'medium'
                  ? 'rgba(255,171,0,0.22)'
                  : 'rgba(107,107,112,0.22)'}`,
              }}>
                {hoveredEvent.confidence} conf
              </div>
            )}
          </div>

          <div className="orion-hover-preview-title">
            {hoveredEvent.title.length > 90
              ? hoveredEvent.title.slice(0, 90) + '…'
              : hoveredEvent.title}
          </div>

          <div className="orion-hover-preview-row">
            <span className="label">Loc</span>
            <span>{hoveredEvent.locationLabel ?? 'Unknown'}</span>
          </div>
          <div className="orion-hover-preview-row">
            <span className="label">Src</span>
            <span>{hoveredEvent.sourceNames[0] ?? '—'}</span>
          </div>
          <div className="orion-hover-preview-row">
            <span className="label">Rpts</span>
            <span>
              {(hoveredEvent.fusedArticleCount ?? hoveredEvent.sources.length)} art
              {' · '}
              {hoveredEvent.sourceCount} src
            </span>
          </div>

          {/* Intelligence Timeline */}
          {(() => {
            const entries = timelineMap?.get(hoveredEvent.eventKey);
            if (!entries || entries.length < 2) return null;
            return (
              <div style={{
                marginTop: '8px',
                paddingTop: '7px',
                borderTop: '1px solid rgba(255,255,255,0.07)',
              }}>
                <div style={{
                  fontSize: '7px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.18)',
                  marginBottom: '5px',
                }}>
                  Event Timeline
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {entries.slice(0, 6).map((entry, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                      <span style={{
                        fontSize: '8px',
                        fontFamily: 'monospace',
                        color: 'rgba(0,230,118,0.55)',
                        flexShrink: 0,
                        lineHeight: '1.4',
                        minWidth: '32px',
                      }}>
                        {formatTime(entry.timestamp)}
                      </span>
                      <span style={{
                        fontSize: '9px',
                        color: 'rgba(255,255,255,0.42)',
                        lineHeight: '1.4',
                        flex: 1,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {entry.description}
                      </span>
                    </div>
                  ))}
                  {entries.length > 6 && (
                    <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.18)', fontFamily: 'monospace', marginTop: '2px' }}>
                      +{entries.length - 6} more reports
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
}

export default memo(WorldMapComponent);
