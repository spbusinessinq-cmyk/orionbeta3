"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { RefreshCw, Globe, MapPin, Eye, Clock, ExternalLink, ChevronLeft, ChevronRight, Bookmark, BookmarkCheck, ChevronDown, ChevronUp, Link2, X, Layers, Database, AlertTriangle, Crosshair, Target, Shield, AlertCircle, Plane, Ship, Ban, Flame, TrendingUp, Zap, WifiOff, Thermometer, CheckCircle, Info } from "lucide-react";
import { useNewsStore, Event, Tier, MAX_PINS, RawArticle, ArticleCategory, ConfidenceLevel, getCategoryColor, getConfidenceColor, computeConfidence } from "@/lib/news-store";
import { IntelItem, matchEventToIntel, SEVERITY_LABELS, INTEL_KIND_CONTEXT, FusionSignal, computeFusionSignals } from "@/lib/intel-fusion";
import { applyFusion } from "@/lib/event-fusion";
import { computeTimelines, type TimelineEntry } from "@/lib/timeline-engine";
import { computeThreatScore, getThreatLevel, getThreatColor, getThreatBgColor, ThreatScoreResult, ThreatLevel, getTopThreats, isHighThreat, THREAT_COLORS, THREAT_BG_COLORS, hasKineticLanguage } from "@/lib/threat-score";
import { detectEscalations, getEventEscalations, Escalation, EscalationSeverity, getEscalationSeverityColor, getEscalationBgColor } from "@/lib/escalation-engine";

// Dynamic import for the map component
const WorldMap = dynamic(() => import("@/components/WorldMap"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0b0b0d]">
      <div className="spinner"></div>
    </div>
  )
});

const POLL_INTERVAL = 90000;

// Tier colors
const TIER_COLORS: Record<Tier, string> = {
  breaking: '#ff1744',
  watch: '#ffab00',
  verified: '#00e676',
};

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  const entities: Record<string, string> = {
    '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"',
    '&#39;': "'", '&#x27;': "'", '&#x2F;': '/', '&#x60;': '`',
    '&nbsp;': ' ', '&apos;': "'"
  };
  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.split(entity).join(char);
  }
  // Also handle numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return decoded;
}

// Strip HTML tags and decode
function cleanText(text: string): string {
  if (!text) return '';
  const stripped = text.replace(/<[^>]*>/g, '');
  return decodeHtmlEntities(stripped);
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  
  const {
    events,
    currentFilter,
    selectedEventKey,
    focusMode,
    isFetching,
    stats,
    lastFetchTime,
    ingestArticles,
    setCurrentFilter,
    setSelectedEventKey,
    setFocusMode,
    deselectEvent,
    toggleSaved,
    setFetching,
    getFilteredEvents,
    getEventByKey,
  } = useNewsStore();

  const [lastUpdate, setLastUpdate] = useState("--:--:--");
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [feedCollapsed, setFeedCollapsed] = useState(true);
  const [showSources, setShowSources] = useState(false);
  const [spreadCentroidPins, setSpreadCentroidPins] = useState(true); // Default ON
  const [hudOpen, setHudOpen] = useState(false); // HUD expansion state
  
  // Collapsible HUD states
  const [escalationsCollapsed, setEscalationsCollapsed] = useState(true);
  const [globalThreatsCollapsed, setGlobalThreatsCollapsed] = useState(true);
  const [overlaysCollapsed, setOverlaysCollapsed] = useState(true);
  const [systemKeyOpen, setSystemKeyOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // View Mode — controls which UI layers are visible
  type ViewMode = 'operator' | 'focus' | 'briefing';
  const [viewMode, setViewMode] = useState<ViewMode>('operator');

  // Time filter for alert feed + map pins
  type TimeFilter = '1h' | '6h' | '24h' | '7d' | 'all';
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  
  // Intel Layer toggles
  const [intelMode, setIntelMode] = useState(false);
  const [intelConflictZones, setIntelConflictZones] = useState(false);
  const [intelDisputedBorders, setIntelDisputedBorders] = useState(false);
  const [intelSanctions, setIntelSanctions] = useState(false);
  const [intelRestrictedAirspace, setIntelRestrictedAirspace] = useState(false);
  const [intelMaritimeZones, setIntelMaritimeZones] = useState(false);
  const [intelProtestUnrest, setIntelProtestUnrest] = useState(false);
  const [intelInternetShutdown, setIntelInternetShutdown] = useState(false);
  const [intelMilitaryActivity, setIntelMilitaryActivity] = useState(false);
  const [intelStrikeIndicators, setIntelStrikeIndicators] = useState(false);
  const [intelThermalAnomalies, setIntelThermalAnomalies] = useState(false);

  // Live sensor layer toggles
  const [sensorThermal, setSensorThermal]   = useState(false);
  const [sensorSeismic, setSensorSeismic]   = useState(false);
  const [sensorAircraft, setSensorAircraft] = useState(false);

  // Intel Density Heatmap toggle
  const [intelDensityHeatmap, setIntelDensityHeatmap] = useState(false);
  
  // Intel Manifest state
  const [intelManifest, setIntelManifest] = useState<{
    generated_at: string;
    total_features: number;
    total_datasets: number;
    datasets: Array<{
      dataset: string;
      file: string;
      feature_count: number;
      updated_at: string;
      kind: string;
      enabled_by_default: boolean;
      status: string;
    }>;
  } | null>(null);

  // Intel selection state
  const [selectedIntel, setSelectedIntel] = useState<IntelItem | null>(null);
  const [allIntelItems, setAllIntelItems] = useState<Map<string, IntelItem[]>>(new Map());

  // Handle intel selection
  const handleIntelSelect = useCallback((intel: IntelItem) => {
    setSelectedIntel(intel);
    // Clear event selection when selecting intel
    if (selectedEventKey) {
      deselectEvent();
    }
    console.log('[INTEL] Selected:', intel.name);
  }, [selectedEventKey, deselectEvent]);

  const handleIntelDeselect = useCallback(() => {
    setSelectedIntel(null);
    console.log('[INTEL] Deselected');
  }, []);

  const handleIntelDataLoaded = useCallback((layerKey: string, items: IntelItem[]) => {
    setAllIntelItems(prev => {
      const next = new Map(prev);
      next.set(layerKey, items);
      return next;
    });
  }, []);

  // Ingest state machine — drives header command button
  type IngestState = 'idle' | 'syncing' | 'live' | 'error';
  const [ingestState, setIngestState] = useState<IngestState>('idle');
  const liveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref for auto-scrolling
  const feedItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const feedContainerRef = useRef<HTMLDivElement>(null);

  // Set mounted after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // PROOF LOG: Track spreadCentroidPins state changes
  useEffect(() => {
    console.log('[UI] spreadCentroidPins state:', spreadCentroidPins);
  }, [spreadCentroidPins]);

  // PROOF LOG: UI OVERLAY stats consistency check
  useEffect(() => {
    if (mounted) {
      console.log("[UI OVERLAY]", {
        exact: stats.coordExactCount,
        city: stats.locCityCount,
        region: stats.locRegionCount,
        country: stats.locCountryCount,
        none: stats.locNoneCount,
        total: stats.total,
        breaking: stats.breaking,
        watch: stats.watch,
        verified: stats.verified
      });
    }
  }, [mounted, stats.total]);

  // Get filtered events - tier filter from store
  const tierFilteredEvents = getFilteredEvents();

  // Apply time filter on top of tier filter
  const TIME_FILTER_MS: Record<string, number> = {
    '1h': 3600000,
    '6h': 21600000,
    '24h': 86400000,
    '7d': 604800000,
  };
  const filteredEvents = useMemo(() => {
    if (timeFilter === 'all') return tierFilteredEvents;
    const cutoff = Date.now() - TIME_FILTER_MS[timeFilter];
    return tierFilteredEvents.filter(e => new Date(e.latestPublishedAt).getTime() >= cutoff);
  }, [tierFilteredEvents, timeFilter]);
  
  // Get selected event
  const selectedEvent = getEventByKey(selectedEventKey);

  // Compute intel matches for selected event
  const eventIntelMatches = useMemo(() => {
    if (!selectedEvent?.lat || !selectedEvent?.lng || allIntelItems.size === 0) {
      return [];
    }
    
    // Flatten all intel items from all layers
    const allItems: IntelItem[] = [];
    allIntelItems.forEach((items) => {
      allItems.push(...items);
    });
    
    // Match event location to intel
    const matches = matchEventToIntel(selectedEvent.lat, selectedEvent.lng, allItems, 100);
    return matches;
  }, [selectedEvent, allIntelItems]);

  // Compute fusion signals for selected event
  const eventFusionSignals = useMemo(() => {
    if (!selectedEvent) return [] as FusionSignal[];
    return computeFusionSignals(eventIntelMatches);
  }, [selectedEvent, eventIntelMatches]);

  // Compute threat score for selected event
  const selectedEventThreat = useMemo(() => {
    if (!selectedEvent) return null;
    return computeThreatScore(selectedEvent, eventIntelMatches);
  }, [selectedEvent, eventIntelMatches]);

  // Compute threat scores for all events (for GLOBAL THREATS HUD)
  const allEventThreatScores = useMemo(() => {
    const scores = new Map<string, ThreatScoreResult>();
    
    if (allIntelItems.size === 0 || filteredEvents.length === 0) {
      return scores;
    }
    
    // Flatten all intel items
    const allItems: IntelItem[] = [];
    allIntelItems.forEach((items) => {
      allItems.push(...items);
    });
    
    // Compute threat score for each event
    for (const event of filteredEvents) {
      if (event.lat && event.lng) {
        const matches = matchEventToIntel(event.lat, event.lng, allItems, 100);
        const threat = computeThreatScore(event, matches);
        scores.set(event.eventKey, threat);
      } else {
        // Events without location still get base score
        const threat = computeThreatScore(event, []);
        scores.set(event.eventKey, threat);
      }
    }
    
    return scores;
  }, [filteredEvents, allIntelItems]);

  // Quality filter for GLOBAL THREATS - exclude soft/stale content
  const isSeriousEvent = useCallback((event: Event): boolean => {
    // Soft topics to exclude
    const softKeywords = [
      'olympic', 'sport', 'football', 'soccer', 'basketball', 'tennis', 'golf',
      'entertainment', 'celebrity', 'movie', 'music', 'film', 'tv series', 'netflix',
      'fashion', 'lifestyle', 'food', 'recipe', 'restaurant', 'travel guide',
      'horoscope', 'astrology', 'lottery', 'bingo', 'puzzle', 'crossword',
      'video game', 'esports', 'gaming news', 'streamer',
    ];
    
    const title = (event.title || '').toLowerCase();
    const topic = (event.topic || '').toLowerCase();
    const combined = `${title} ${topic}`;
    
    // Check for soft keywords
    for (const keyword of softKeywords) {
      if (title.includes(keyword) || topic.includes(keyword)) {
        return false;
      }
    }

    // US domestic sanity gate for High Threat Events:
    // Generic political/procedural US events should NOT appear as High Threat.
    // Allow: kinetic events, national security, intelligence, military, foreign policy.
    if (event.countryKey === 'us') {
      const kineticTerms = [
        'attack', 'bombing', 'explosion', 'shooting', 'gunfire', 'strike', 'missile',
        'terror', 'mass casualty', 'mass shooting', 'armed', 'hostage', 'emergency',
        'disaster', 'earthquake', 'hurricane', 'tornado', 'flood', 'wildfire',
        'military base', 'air defense', 'incursion', 'combat', 'drone',
      ];
      const hasKinetic = kineticTerms.some(k => combined.includes(k));
      if (!hasKinetic) {
        // Allow if it has genuine national security / intelligence / strategic significance
        const nsTerms = [
          'cyber attack', 'cyberattack', 'hack', 'breach', 'infrastructure attack', 'grid attack',
          'pentagon', 'state department', 'white house', 'national security', 'intelligence',
          'cia', 'nsa', 'fbi', 'dhs', 'homeland security', 'espionage', 'spy', 'defect',
          'sanctions', 'nuclear', 'classified', 'covert', 'secret service', 'foreign influence',
          'election interference', 'disinformation', 'russian hack', 'chinese hack', 'iran hack',
          'military exercise', 'naval', 'military aid', 'weapons transfer', 'arms sale',
          'foreign policy', 'diplomatic', 'ambassador', 'embassy', 'state visit',
          'trade war', 'tariff', 'export control', 'chip ban', 'technology sanction',
          'border security', 'fentanyl', 'cartel', 'drug trafficking', 'human trafficking',
        ];
        const hasNS = nsTerms.some(k => combined.includes(k));
        if (!hasNS) return false;
      }
    }
    
    return true;
  }, []);

  // Check if event is fresh (within 48 hours)
  const isFreshEvent = useCallback((event: Event): boolean => {
    if (!event.latestPublishedAt) return false;
    try {
      const eventTime = new Date(event.latestPublishedAt).getTime();
      const now = Date.now();
      const ageHours = (now - eventTime) / (1000 * 60 * 60);
      return ageHours <= 48;
    } catch {
      return false;
    }
  }, []);

  // Top threats for GLOBAL THREATS HUD with quality filtering
  const topThreats = useMemo(() => {
    // Filter for serious, fresh events only
    const qualifiedEvents = filteredEvents.filter(e => 
      isSeriousEvent(e) && isFreshEvent(e)
    );
    
    // Sort by threat score
    const sorted = [...qualifiedEvents].sort((a, b) => {
      const scoreA = allEventThreatScores.get(a.eventKey)?.score || 0;
      const scoreB = allEventThreatScores.get(b.eventKey)?.score || 0;
      return scoreB - scoreA;
    });
    
    // Return top 5 with their threat info
    return sorted.slice(0, 5).map((event) => ({
      event,
      threat: allEventThreatScores.get(event.eventKey) || { score: 0, level: 'low' as ThreatLevel, factors: [] },
    }));
  }, [filteredEvents, allEventThreatScores, isSeriousEvent, isFreshEvent]);

  // ========================================
  // ESCALATION DETECTION
  // ========================================
  
  // Selected escalation state
  const [selectedEscalation, setSelectedEscalation] = useState<Escalation | null>(null);

  // Compute escalations from events, threat scores, and intel matches
  const activeEscalations = useMemo(() => {
    // Build intel matches map for all events
    const intelMatchesMap = new Map<string, IntelMatch[]>();
    
    if (allIntelItems.size === 0 || filteredEvents.length === 0) {
      return [];
    }
    
    // Flatten all intel items
    const allItems: IntelItem[] = [];
    allIntelItems.forEach((items) => {
      allItems.push(...items);
    });
    
    // Match intel for each event
    for (const event of filteredEvents) {
      if (event.lat && event.lng) {
        const matches = matchEventToIntel(event.lat, event.lng, allItems, 100);
        if (matches.length > 0) {
          intelMatchesMap.set(event.eventKey, matches);
        }
      }
    }
    
    return detectEscalations(filteredEvents, allEventThreatScores, intelMatchesMap);
  }, [filteredEvents, allEventThreatScores, allIntelItems]);

  // Get escalations for selected event
  const selectedEventEscalations = useMemo(() => {
    if (!selectedEvent) return [];
    return getEventEscalations(selectedEvent.eventKey, activeEscalations);
  }, [selectedEvent, activeEscalations]);

  // Top 3 escalations for HUD
  const topEscalations = useMemo(() => {
    return activeEscalations.slice(0, 3);
  }, [activeEscalations]);

  // Handle escalation selection
  const handleEscalationSelect = useCallback((escalation: Escalation) => {
    setSelectedEscalation(escalation);
    // Clear event selection when selecting escalation
    if (selectedEventKey) {
      deselectEvent();
    }
    console.log('[ESCALATION] Selected:', escalation.title, escalation.region);
  }, [selectedEventKey, deselectEvent]);

  // Handle escalation click - select first event in cluster
  const handleEscalationEventSelect = useCallback((escalation: Escalation) => {
    if (escalation.event_keys.length > 0) {
      setSelectedEventKey(escalation.event_keys[0]);
      setDetailsCollapsed(false);
    }
  }, [setSelectedEventKey]);

  // Events to display on map based on focusMode
  const mapEvents = focusMode && selectedEvent ? [selectedEvent] : filteredEvents;

  // Apply Event Fusion Layer — merges same-incident reports into one pin
  // Runs post-filter so focus mode + tier filter are respected
  const { visibleEvents: fusedMapEvents, fusionMap } = useMemo(
    () => applyFusion(mapEvents),
    [mapEvents]
  );

  // Intelligence Timeline — groups related events by geo proximity + time + category
  // Runs on filteredEvents (unfused) so all sources are considered
  const timelineMap = useMemo(
    () => computeTimelines(filteredEvents),
    [filteredEvents]
  );

  // Fusion proof log
  useEffect(() => {
    if (!mounted || mapEvents.length === 0) return;
    const fusedCount   = Array.from(fusionMap.values()).filter(m => m.wasFused).length;
    const mergedTotal  = Array.from(fusionMap.values()).reduce((s, m) => s + m.mergedKeys.length, 0);
    console.log('[FUSION]', {
      rawMapEvents: mapEvents.length,
      fusedPins: fusedMapEvents.length,
      fusedClusters: fusedCount,
      totalMerged: mergedTotal,
      reductionPct: mapEvents.length > 0
        ? ((mergedTotal / mapEvents.length) * 100).toFixed(1) + '%'
        : '0%',
    });
  }, [mounted, mapEvents.length, fusedMapEvents.length, fusionMap]);

  // Compute HUD stats from mapEvents (derived, no store writes)
  // When Spread On: all events shown — scatter handles placement.
  // When Spread Off: suppress country+breaking to avoid centroid clutter.
  const hudStats = useMemo(() => {
    const eventsToRender = spreadCentroidPins
      ? mapEvents.filter(e => e.locationPrecision !== 'none')
      : mapEvents.filter(e => e.coordPrecision !== 'centroid' && e.locationPrecision !== 'none' && !(e.locationPrecision === 'country' && e.tier === 'breaking'));

    // Suppressed only when Spread Off
    const countrySuppressed = spreadCentroidPins
      ? 0
      : mapEvents.filter(e => e.locationPrecision === 'country' && e.tier === 'breaking').length;

    let exact = 0;
    let city = 0;
    let region = 0;
    let country = 0;
    let unmapped = 0;

    for (const e of eventsToRender) {
      if (e.coordPrecision === 'exact') {
        exact++;
      } else {
        switch (e.locationPrecision) {
          case 'city': city++; break;
          case 'region': region++; break;
          case 'country': country++; break;
          default: unmapped++; break;
        }
      }
    }

    const total = exact + city + region + country + unmapped;
    
    // Proof log
    console.log('[HUD RENDER COUNTS]', { exact, city, region, country, unmapped, total, countrySuppressed });
    
    return { exact, city, region, country, unmapped, total, countrySuppressed };
  }, [mapEvents, spreadCentroidPins]);

  // ESC key handler - deselect and restore all pins
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedEventKey) {
        deselectEvent();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEventKey, deselectEvent]);

  // Command palette keyboard shortcut
  useEffect(() => {
    const handleCommandPaletteShortcut = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input, textarea, or contenteditable
      const target = e.target as HTMLElement;
      const isTyping = ['INPUT', 'TEXTAREA'].includes(target.tagName) || 
                       target.isContentEditable;
      
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        setCommandPaletteOpen(v => !v);
      }
    };
    
    window.addEventListener('keydown', handleCommandPaletteShortcut);
    return () => window.removeEventListener('keydown', handleCommandPaletteShortcut);
  }, []);

  // Intel keyboard shortcuts
  useEffect(() => {
    const handleIntelShortcuts = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      
      const key = e.key.toUpperCase();
      
      // Shift+X = Disable all intel layers
      if (e.shiftKey && key === 'X') {
        e.preventDefault();
        setIntelMode(false);
        setIntelConflictZones(false);
        setIntelDisputedBorders(false);
        setIntelSanctions(false);
        setIntelRestrictedAirspace(false);
        setIntelMaritimeZones(false);
        setIntelProtestUnrest(false);
        setIntelInternetShutdown(false);
        setIntelMilitaryActivity(false);
        setIntelStrikeIndicators(false);
        setIntelThermalAnomalies(false);
        return;
      }
      
      // Intel shortcuts: G, Z, B, K, Y, V, P, I, M, T, H
      const intelShortcuts: Record<string, () => void> = {
        'G': () => setIntelMode(v => !v),
        'Z': () => setIntelConflictZones(v => !v),
        'B': () => setIntelDisputedBorders(v => !v),
        'K': () => setIntelSanctions(v => !v),
        'Y': () => setIntelRestrictedAirspace(v => !v),
        'V': () => setIntelMaritimeZones(v => !v),
        'P': () => setIntelProtestUnrest(v => !v),
        'I': () => setIntelInternetShutdown(v => !v),
        'M': () => setIntelMilitaryActivity(v => !v),
        'T': () => setIntelStrikeIndicators(v => !v),
        'H': () => setIntelThermalAnomalies(v => !v),
      };
      
      if (intelShortcuts[key]) {
        e.preventDefault();
        intelShortcuts[key]();
      }
    };
    
    window.addEventListener('keydown', handleIntelShortcuts);
    return () => window.removeEventListener('keydown', handleIntelShortcuts);
  }, []);

  // Intel Mode proof log
  useEffect(() => {
    console.log("[INTEL MODE]", intelMode);
  }, [intelMode]);

  // Fetch Intel Manifest
  useEffect(() => {
    const fetchManifest = async () => {
      try {
        const response = await fetch("/intel/manifest.json");
        if (response.ok) {
          const manifest = await response.json();
          setIntelManifest(manifest);
          console.log("[INTEL] Manifest loaded:", manifest.total_features, "features across", manifest.total_datasets, "datasets");
        }
      } catch (error) {
        console.warn("[INTEL] Failed to fetch manifest:", error);
      }
    };
    
    fetchManifest();
  }, []);

  // Auto-scroll to selected event in feed
  useEffect(() => {
    if (selectedEventKey && mounted && !feedCollapsed) {
      const feedItem = feedItemRefs.current.get(selectedEventKey);
      if (feedItem && feedContainerRef.current) {
        feedItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedEventKey, mounted, feedCollapsed]);

  // Fetch data from API
  const fetchData = useCallback(async () => {
    if (liveTimeoutRef.current) clearTimeout(liveTimeoutRef.current);
    setIngestState('syncing');
    setFetching(true);
    try {
      const response = await fetch("/api/rss");
      const data = await response.json();
      if (data.success && data.articles) {
        ingestArticles(data.articles as RawArticle[]);
        setLastUpdate(new Date().toLocaleTimeString());
        setIngestState('live');
        liveTimeoutRef.current = setTimeout(() => setIngestState('idle'), 45000);
        console.log('[RSS] Debug:', data.debug);
      } else {
        setIngestState('error');
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      setIngestState('error');
    } finally {
      setFetching(false);
    }
  }, [ingestArticles, setFetching]);

  // Initial fetch
  useEffect(() => {
    const now = Date.now();
    const shouldFetch = !lastFetchTime || (now - lastFetchTime) > POLL_INTERVAL;
    
    if (shouldFetch) {
      fetchData();
    } else {
      setLastUpdate(new Date(lastFetchTime).toLocaleTimeString());
    }
  }, []);

  // Polling
  useEffect(() => {
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Handle event selection from feed
  const handleEventSelect = (event: Event) => {
    // Toggle: clicking same event deselects it
    if (selectedEventKey === event.eventKey) {
      deselectEvent();
    } else {
      setSelectedEventKey(event.eventKey);
      setShowSources(false);
    }
  };

  // Handle pin click from map
  const handlePinClick = (event: Event) => {
    // Toggle: clicking same pin deselects it
    if (selectedEventKey === event.eventKey) {
      deselectEvent();
    } else {
      setSelectedEventKey(event.eventKey);
      setDetailsCollapsed(false);
      setShowSources(false);
    }
  };

  // Handle deselect
  const handleDeselect = () => {
    deselectEvent();
  };

  // Get tier color
  const getTierColor = (tier: Tier) => TIER_COLORS[tier];

  // Format time
  const formatTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  // Filter counts - use stats from store
  const filterCounts = {
    all: mounted ? stats.total : 0,
    breaking: mounted ? stats.breaking : 0,
    watch: mounted ? stats.watch : 0,
    verified: mounted ? stats.verified : 0,
  };

  // Handle filter change - clear selection when filter changes
  const handleFilterChange = (filter: Tier | 'all') => {
    setCurrentFilter(filter);
    // Deselect when filter changes to ensure pins update
    if (selectedEventKey) {
      deselectEvent();
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-[#e8e8e8] overflow-hidden flex flex-col">
      {/* COMPACT SPREAD HUD CHIP - EXPANDABLE */}
      {(() => {
        const rightOffset = !feedCollapsed ? 396 : 16;
        const safeRight = Math.max(16, rightOffset);
        return (
          <div
            className="fixed top-[66px] orion-glass rounded-full z-[50000] pointer-events-auto transition-all duration-200 ease-out cursor-pointer select-none"
            style={{ right: safeRight }}
            onClick={(e) => {
              // Toggle HUD expansion (NOT spread state)
              e.stopPropagation();
              setHudOpen(!hudOpen);
            }}
            onMouseEnter={() => setHudOpen(true)}
            onMouseLeave={() => setHudOpen(false)}
          >
            {/* COLLAPSED VIEW - Always visible chip */}
            <div className="flex items-center gap-2 px-3 py-1.5 h-8">
              <Layers className={`w-4 h-4 pointer-events-none ${spreadCentroidPins ? 'text-[#00e676]' : 'text-[#6b6b70]'}`} />
              <span className={`pointer-events-none text-xs font-medium ${spreadCentroidPins ? 'text-white' : 'text-[#6b6b70]'}`}>
                {spreadCentroidPins ? 'Spread On' : 'Spread Off'}
              </span>
              {/* Small toggle switch inside chip */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[UI] toggle BEFORE:', spreadCentroidPins);
                  setSpreadCentroidPins(v => {
                    console.log('[UI] toggle FLIP to:', !v);
                    return !v;
                  });
                }}
                className={`ml-1 w-8 h-5 rounded-full transition-colors duration-200 flex items-center px-0.5 pointer-events-auto ${
                  spreadCentroidPins ? 'bg-[#00e676]' : 'bg-[#2a2a2d]'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                  spreadCentroidPins ? 'translate-x-3' : 'translate-x-0'
                }`} />
              </button>
              <ChevronDown className={`w-3 h-3 text-[#6b6b70] pointer-events-none transition-transform duration-200 ${hudOpen ? 'rotate-180' : ''}`} />
            </div>

            {/* EXPANDED VIEW - Stats breakdown */}
            {hudOpen && (
              <div
                className="absolute top-full right-0 mt-1 orion-glass rounded-xl p-3 min-w-[180px] max-w-[240px] pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-[10px] text-[#6b6b70] space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span>Exact:</span>
                    <span className="text-[#00e676] font-mono">{mounted ? hudStats.exact : 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>City:</span>
                    <span className="text-[#4ade80] font-mono">{mounted ? hudStats.city : 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Region:</span>
                    <span className="text-[#fbbf24] font-mono">{mounted ? hudStats.region : 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-[#2a2a2d] pt-1 mt-1">
                    <span className="text-white">Total Pins:</span>
                    <span className="text-white font-mono font-bold">{mounted ? hudStats.total : 0}</span>
                  </div>
                  {mounted && hudStats.countrySuppressed > 0 && (
                    <div className="flex items-center justify-between gap-4 text-[#ff6b35]">
                      <span>⚠️ Breaking/country (hidden):</span>
                      <span className="font-mono">{hudStats.countrySuppressed}</span>
                    </div>
                  )}
                  {mounted && hudStats.exact === 0 && hudStats.city === 0 && (
                    <div className="text-[8px] text-[#6b6b70] mt-2 border-t border-[#2a2a2d] pt-2 leading-relaxed">
                      Breaking country-level events suppressed. Watch/Verified shown as secondary pins.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Header — O.R.I.O.N. Command Bar */}
      <header className="h-[56px] bg-[#07070a] border-b border-white/[0.06] flex items-center justify-between px-8 z-50 relative orion-header-scanline flex-shrink-0">
        {/* Brand identity */}
        <div className="flex items-center gap-4">
          {/* Orion belt — three-star celestial navigation mark */}
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #0e0e14 0%, #07070b 100%)',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: '0 0 16px rgba(255,255,255,0.08), 0 0 32px rgba(255,255,255,0.05)',
            }}
          >
            <svg
              width="26"
              height="14"
              viewBox="0 0 26 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="orion-belt"
            >
              {/* Mintaka — left, faintest */}
              <circle cx="2.5" cy="9.5" r="1.15" fill="rgba(190,220,255,0.52)" />
              <circle cx="2.5" cy="9.5" r="2.8" fill="rgba(180,210,255,0.05)" />
              {/* Alnilam — center, brightest */}
              <circle cx="13" cy="7" r="1.55" fill="rgba(210,235,255,0.78)" />
              <circle cx="13" cy="7" r="3.8" fill="rgba(190,220,255,0.07)" />
              {/* Alnitak — right, medium */}
              <circle cx="23.5" cy="4.5" r="1.3" fill="rgba(200,228,255,0.63)" />
              <circle cx="23.5" cy="4.5" r="3.2" fill="rgba(180,210,255,0.06)" />
            </svg>
          </div>
          <div className="flex flex-col justify-center gap-[3px]">
            <div className="flex items-baseline gap-1.5 leading-none">
              <span className="text-[8px] font-bold tracking-[2px] text-white/50 uppercase font-mono">RSR</span>
              <span className="text-white/25 text-[8px] font-mono leading-none">//</span>
              <h1 className="text-[14px] font-bold tracking-[3px] text-white leading-none">O.R.I.O.N.</h1>
            </div>
            <p className="text-[7px] text-white/[0.32] tracking-[2px] font-mono uppercase leading-none">Operational Reconnaissance &amp; Intelligence Oversight Network</p>
          </div>
          {/* OSINT badge — active classified module tag */}
          <div
            className="orion-badge-live ml-1 px-2 py-[3px] rounded-sm text-[7px] font-bold tracking-[2px] uppercase font-mono"
            style={{
              border: '1px solid rgba(0,200,150,0.28)',
              color: 'rgba(0,200,150,0.7)',
              background: 'rgba(0,200,150,0.05)',
              boxShadow: '0 0 10px rgba(0,200,150,0.1), inset 0 0 8px rgba(0,200,150,0.04)',
            }}
          >
            OSINT
          </div>
        </div>

        {/* System status rail + command control */}
        <div className="flex items-center gap-3">

          {/* View Mode selector */}
          <div
            className="flex items-stretch h-8 overflow-hidden"
            style={{
              background: 'rgba(5,5,7,0.92)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 6,
            }}
          >
            {([['operator','OPR'],['focus','FOC'],['briefing','BRF']] as const).map(([mode, label], i) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="flex items-center px-3 text-[8px] font-bold tracking-[1.5px] uppercase font-mono transition-colors relative"
                style={{
                  borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  color: viewMode === mode ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.18)',
                  background: viewMode === mode ? 'rgba(255,255,255,0.05)' : 'transparent',
                }}
              >
                {label}
                {viewMode === mode && (
                  <span
                    className="orion-tab-underline-live absolute bottom-0 left-0 right-0 h-[1.5px]"
                    style={{ background: viewMode === 'operator' ? '#00e676' : viewMode === 'focus' ? '#ffab00' : 'rgba(255,255,255,0.35)' }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Status rail */}
          <div className="orion-status-pill">
            {/* System status — O.R.I.O.N. identity */}
            <div className="seg row">
              <div className="orion-live-dot w-1.5 h-1.5 rounded-full bg-[#00e676] flex-shrink-0" />
              <div>
                <div className="seg-label">O.R.I.O.N.</div>
                <div className="seg-value" style={{ fontSize: '10px', color: '#00e676' }}>ONLINE</div>
              </div>
            </div>
            {/* Last sync */}
            <div className="seg">
              <span className="seg-label">Last Sync</span>
              <span className="seg-value" style={{ fontSize: '11px' }}>{lastUpdate}</span>
            </div>
            {/* Intel feed count */}
            <div className="seg">
              <span className="seg-label">Intel Feed</span>
              <span className="seg-value">{mounted ? events.length : 0}</span>
            </div>
            {/* Active pins */}
            <div className="seg">
              <span className="seg-label">Active Pins</span>
              <span className="seg-value" style={{ color: '#00e676' }}>{mounted ? hudStats.total : 0}</span>
            </div>
          </div>

          {/* Ingest command — stateful system command: idle / syncing / live / error */}
          <button
            onClick={fetchData}
            disabled={ingestState === 'syncing'}
            className={`orion-cmd-btn${ingestState === 'syncing' ? ' orion-ingest-syncing' : ingestState === 'live' ? ' orion-ingest-live' : ingestState === 'error' ? ' orion-ingest-error' : ''}`}
            title={
              ingestState === 'idle' ? 'Trigger manual feed sync' :
              ingestState === 'syncing' ? 'Ingesting live feed data…' :
              ingestState === 'live' ? `Feed active — last sync ${lastUpdate}` :
              'Last sync failed — click to retry'
            }
          >
            {ingestState === 'syncing' ? (
              <RefreshCw className="w-3 h-3 flex-shrink-0 animate-spin" />
            ) : ingestState === 'error' ? (
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            ) : ingestState === 'live' ? (
              <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 inline-block" />
            ) : (
              <RefreshCw className="w-3 h-3 flex-shrink-0" />
            )}
            <span className="flex flex-col items-start leading-none gap-[3px]">
              <span>
                {ingestState === 'idle' ? 'SYNC NOW' :
                 ingestState === 'syncing' ? 'SYNCING' :
                 ingestState === 'live' ? 'FEED LIVE' : 'INGEST ERR'}
              </span>
              {ingestState === 'live' && (
                <span className="text-[7px] opacity-55 font-normal tracking-[1px] normal-case">{lastUpdate}</span>
              )}
              {ingestState === 'error' && (
                <span className="text-[7px] opacity-55 font-normal tracking-[1px]">RETRY</span>
              )}
            </span>
          </button>
        </div>
      </header>

      {/* Panel Tabs */}
      <div 
        className={`panel-tab left ${detailsCollapsed ? 'collapsed' : ''}`}
        onClick={() => setDetailsCollapsed(!detailsCollapsed)}
      >
        <span>DETAILS</span>
        <div className="arrow">
          <ChevronLeft className="w-4 h-4 text-white" />
        </div>
      </div>
      
      <div 
        className={`panel-tab right ${feedCollapsed ? 'collapsed' : ''}`}
        onClick={() => setFeedCollapsed(!feedCollapsed)}
      >
        <span>ALERTS</span>
        <div className="arrow">
          <ChevronRight className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex relative">
        {/* Left Panel - Details */}
        <div className={`panel-wrapper left`}>
          <aside className={`side-panel h-full bg-[#0a0a0c] border-r border-white/[0.05] flex flex-col ${detailsCollapsed ? 'collapsed' : ''}`}>
            <div className="px-4 py-3.5 border-b border-white/[0.05] flex items-center justify-between">
              <h2 className="orion-section-title">
                {selectedIntel ? 'Intel Brief' : 'Event Details'}
              </h2>
              {selectedEvent && (
                <span 
                  className="px-2 py-1 rounded text-[10px] font-bold uppercase"
                  style={{ backgroundColor: getTierColor(selectedEvent.tier), color: '#fff' }}
                >
                  {selectedEvent.tier}
                </span>
              )}
              {selectedIntel && (
                <span 
                  className="px-2 py-1 rounded text-[10px] font-bold uppercase"
                  style={{ backgroundColor: selectedIntel.severity >= 4 ? '#ff1744' : selectedIntel.severity >= 3 ? '#ffab00' : '#00e676', color: '#fff' }}
                >
                  {SEVERITY_LABELS[selectedIntel.severity] || 'Unknown'}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {/* INTEL BRIEF */}
              {selectedIntel ? (
                <div className="space-y-4">
                  {/* Intel Name */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 leading-tight">
                      {selectedIntel.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#6b6b70]">
                      <div className="flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        <span>{selectedIntel.kind.replace('_', ' ').toUpperCase()}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        <span>{selectedIntel.region}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Intel Type Badge */}
                  <div className="flex flex-wrap gap-2">
                    <span 
                      className="px-3 py-1 rounded-full text-xs font-semibold"
                      style={{ 
                        backgroundColor: `${selectedIntel.severity >= 4 ? '#ff1744' : selectedIntel.severity >= 3 ? '#ffab00' : '#00e676'}30`, 
                        color: selectedIntel.severity >= 4 ? '#ff1744' : selectedIntel.severity >= 3 ? '#ffab00' : '#00e676'
                      }}
                    >
                      {selectedIntel.kind.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#1a1a1d] text-[#a0a0a5]">
                      {selectedIntel.region}
                    </span>
                  </div>
                  
                  {/* Severity */}
                  <div className="bg-[#1a1a1d] rounded-lg p-3 border border-[#2a2a2d]">
                    <p className="text-xs text-[#6b6b70] mb-1">Severity</p>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div 
                            key={level} 
                            className={`w-3 h-3 rounded-sm ${level <= selectedIntel.severity ? 'bg-[#ff1744]' : 'bg-[#2a2a2d]'}`}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-semibold" style={{ color: selectedIntel.severity >= 4 ? '#ff1744' : selectedIntel.severity >= 3 ? '#ffab00' : '#00e676' }}>
                        {SEVERITY_LABELS[selectedIntel.severity] || 'Unknown'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Note/Description */}
                  {selectedIntel.note && (
                    <div className="bg-[#1a1a1d] rounded-lg p-4 border border-[#2a2a2d]">
                      <p className="text-[10px] text-[#6b6b70] mb-2 uppercase tracking-wider">Description</p>
                      <p className="text-sm text-[#a0a0a5] leading-relaxed">
                        {selectedIntel.note}
                      </p>
                    </div>
                  )}
                  
                  {/* Source */}
                  {selectedIntel.source && (
                    <div className="bg-[#1a1a1d] rounded-lg p-3 border border-[#2a2a2d]">
                      <p className="text-xs text-[#6b6b70] mb-1">Source</p>
                      <p className="text-sm text-white">{selectedIntel.source}</p>
                    </div>
                  )}
                  
                  {/* Updated timestamp */}
                  {selectedIntel.updated_at && (
                    <div className="text-xs text-[#6b6b70]">
                      Updated: {formatDate(selectedIntel.updated_at)} {formatTime(selectedIntel.updated_at)}
                    </div>
                  )}
                  
                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => {
                        // The map will auto-fly to the intel via the selectedIntelId effect
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1d] border border-[#2a2a2d] rounded-lg text-sm font-semibold text-[#a0a0a5] hover:text-white hover:border-white/20 transition-all flex-1 justify-center"
                    >
                      <Crosshair className="w-4 h-4" />
                      Center Map
                    </button>
                    <button
                      onClick={handleIntelDeselect}
                      className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1d] border border-white/[0.1] rounded-lg text-sm font-semibold text-[#a0a0a5] hover:text-white hover:border-white/20 transition-all flex-1 justify-center"
                    >
                      <X className="w-4 h-4" />
                      Clear
                    </button>
                  </div>
                </div>
              ) : selectedEvent ? (
                <div className="space-y-5">
                  {/* Title + meta */}
                  <div>
                    <h3 className="text-[15px] font-bold text-white leading-snug mb-2.5">
                      {cleanText(selectedEvent.title)}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#6b6b70]">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: getTierColor(selectedEvent.tier) }} />
                        <span>{selectedEvent.locationLabel || "Unknown"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        <span>{formatDate(selectedEvent.latestPublishedAt)} {formatTime(selectedEvent.latestPublishedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Primary identifiers row: tier / category / confidence */}
                  <div className="flex flex-wrap gap-2">
                    <span 
                      className="px-2.5 py-1 rounded text-[10px] font-bold tracking-widest uppercase"
                      style={{ backgroundColor: `${getTierColor(selectedEvent.tier)}25`, color: getTierColor(selectedEvent.tier), border: `1px solid ${getTierColor(selectedEvent.tier)}45` }}
                    >
                      {selectedEvent.tier}
                    </span>
                    {selectedEvent.category && (
                      <span
                        className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest"
                        style={{
                          backgroundColor: `${getCategoryColor(selectedEvent.category)}18`,
                          color: getCategoryColor(selectedEvent.category),
                          border: `1px solid ${getCategoryColor(selectedEvent.category)}35`,
                        }}
                      >
                        {selectedEvent.category}
                      </span>
                    )}
                    {selectedEvent.confidence && (
                      <span
                        className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-widest"
                        style={{
                          backgroundColor: `${getConfidenceColor(selectedEvent.confidence)}14`,
                          color: getConfidenceColor(selectedEvent.confidence),
                          border: `1px solid ${getConfidenceColor(selectedEvent.confidence)}30`,
                        }}
                      >
                        {selectedEvent.confidence} CONF
                      </span>
                    )}
                    <span className="px-2.5 py-1 rounded text-[10px] text-[#6b6b70] bg-[#1a1a1d] border border-[#2a2a2d]">
                      {selectedEvent.topic}
                    </span>
                    <span className="px-2.5 py-1 rounded text-[10px] text-[#6b6b70] bg-[#1a1a1d] border border-[#2a2a2d] font-mono">
                      {selectedEvent.sourceCount}src
                    </span>
                  </div>
                  
                  {/* THREAT SCORE */}
                  {selectedEventThreat && (
                    <div className="rounded-lg border px-4 py-3" style={{ borderColor: `${THREAT_COLORS[selectedEventThreat.level]}30`, backgroundColor: `${THREAT_COLORS[selectedEventThreat.level]}08` }}>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <Flame className="w-3.5 h-3.5" style={{ color: THREAT_COLORS[selectedEventThreat.level] }} />
                          <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: THREAT_COLORS[selectedEventThreat.level] }}>
                            {selectedEventThreat.level}
                          </span>
                        </div>
                        <span 
                          className="text-3xl font-mono font-bold leading-none"
                          style={{ color: THREAT_COLORS[selectedEventThreat.level] }}
                        >
                          {selectedEventThreat.score}
                        </span>
                      </div>
                      {selectedEventThreat.factors.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedEventThreat.factors.map((factor, i) => (
                            <span 
                              key={i}
                              className="px-2 py-0.5 rounded text-[9px] text-[#a0a0a5]"
                              style={{ backgroundColor: `${THREAT_COLORS[selectedEventThreat.level]}12`, border: `1px solid ${THREAT_COLORS[selectedEventThreat.level]}20` }}
                            >
                              {factor}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Description from first source */}
                  {selectedEvent.sources[0]?.description && (
                    <p className="text-[13px] text-[#9a9a9f] leading-relaxed border-l-2 border-white/10 pl-3">
                      {cleanText(selectedEvent.sources[0].description)}
                    </p>
                  )}

                  {/* Publishers */}
                  <div>
                    <p className="text-[9px] font-bold tracking-widest text-[#6b6b70] uppercase mb-1.5">Sources</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedEvent.sourceNames || []).map((name, i) => (
                        <span key={i} className="px-2 py-0.5 rounded text-[10px] text-[#a0a0a5] bg-[#1a1a1d] border border-[#2a2a2d]">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* LOCATION TRUST — determination method and confidence level */}
                  {(() => {
                    const lp = selectedEvent.locationPrecision;
                    const cp = selectedEvent.coordPrecision;

                    type LocConf = { method: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; color: string; confColor: string };
                    let loc: LocConf;

                    if (lp === 'city') {
                      loc = { method: 'Explicit city match', confidence: 'HIGH', color: '#00e676', confColor: '#00e676' };
                    } else if (lp === 'country' && cp !== 'centroid') {
                      loc = { method: 'Country-level context', confidence: 'MEDIUM', color: '#ff9800', confColor: '#ff9800' };
                    } else if (lp === 'country') {
                      loc = { method: 'Country centroid', confidence: 'MEDIUM', color: '#ff9800', confColor: '#ff9800' };
                    } else if (lp === 'region') {
                      loc = { method: 'Regional inference', confidence: 'LOW', color: '#ffab00', confColor: '#ffab00' };
                    } else {
                      loc = { method: 'Fallback centroid', confidence: 'LOW', color: '#6b6b70', confColor: '#6b6b70' };
                    }

                    return (
                      <div className="flex flex-col gap-1.5 p-2.5 rounded border border-[#2a2a2d] bg-[#111113]">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <MapPin className="w-3 h-3" style={{ color: loc.color }} />
                          <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: loc.color }}>Location Trust</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#c0c0c5] font-medium">{loc.method}</span>
                          <span
                            className="ml-auto text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded"
                            style={{ color: loc.confColor, backgroundColor: `${loc.confColor}18`, border: `1px solid ${loc.confColor}33` }}
                          >
                            {loc.confidence}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] text-[#6b6b70] font-mono">
                          <span>{selectedEvent.coordPrecision === 'exact' ? 'Exact coords' : 'Centroid coords'}</span>
                          {selectedEvent.lat !== null && selectedEvent.lng !== null && (
                            <>
                              <span className="text-white/15">·</span>
                              <span>{selectedEvent.lat.toFixed(3)}, {selectedEvent.lng.toFixed(3)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Keywords */}
                  {selectedEvent.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedEvent.keywords.map((kw, i) => (
                        <span key={i} className="px-2 py-1 bg-[#1a1a1d] border border-[#2a2a2d] rounded text-xs text-[#a0a0a5]">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {/* ESCALATION CONTEXT - Escalations this event belongs to */}
                  {selectedEventEscalations.length > 0 && (
                    <div className="border-l-2 border-[#ff6b35]/40 pl-3">
                      <div className="flex items-center gap-2 mb-2.5">
                        <Zap className="w-3 h-3 text-[#ffd700]" />
                        <p className="text-[9px] font-bold tracking-widest text-[#ffd700] uppercase">Escalation Context</p>
                      </div>
                      <div className="space-y-2">
                        {selectedEventEscalations.map((esc) => (
                          <div 
                            key={esc.id}
                            className="flex items-start gap-2 p-2 bg-[#121214] rounded border border-[#2a2a2d]"
                          >
                            <div 
                              className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0 mt-0.5"
                              style={{ 
                                backgroundColor: getEscalationBgColor(esc.severity),
                                color: getEscalationSeverityColor(esc.severity),
                              }}
                            >
                              {esc.event_count}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-[11px] font-semibold text-white truncate">
                                  {esc.title}
                                </p>
                                <span 
                                  className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
                                  style={{ 
                                    backgroundColor: getEscalationBgColor(esc.severity),
                                    color: getEscalationSeverityColor(esc.severity),
                                  }}
                                >
                                  {esc.severity}
                                </span>
                              </div>
                              <p className="text-[10px] text-[#6b6b70] mt-0.5">{esc.region}</p>
                              <p className="text-[9px] text-[#a0a0a5] mt-1 leading-relaxed">
                                {esc.summary}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* INTEL CONTEXT - Intel matches for this event */}
                  {eventIntelMatches.length > 0 && (
                    <div className="border-l-2 border-[#ffab00]/35 pl-3">
                      <div className="flex items-center gap-2 mb-2.5">
                        <AlertTriangle className="w-3 h-3 text-[#ffab00]" />
                        <p className="text-[9px] font-bold tracking-widest text-[#ffab00] uppercase">Intel Context</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {eventIntelMatches.map((match, i) => {
                          const contextType = INTEL_KIND_CONTEXT[match.intel.kind] || 'intel';
                          const getIcon = () => {
                            switch (match.intel.kind) {
                              case 'conflict_zone': return <AlertCircle className="w-3 h-3" />;
                              case 'restricted_airspace': return <Plane className="w-3 h-3" />;
                              case 'maritime_zone': return <Ship className="w-3 h-3" />;
                              case 'sanctions': return <Ban className="w-3 h-3" />;
                              case 'disputed_border': return <Shield className="w-3 h-3" />;
                              case 'protest_unrest': return <Flame className="w-3 h-3" />;
                              case 'internet_shutdown': return <WifiOff className="w-3 h-3" />;
                              case 'military_activity': return <Crosshair className="w-3 h-3" />;
                              case 'strike_indicators': return <Target className="w-3 h-3" />;
                              default: return <Target className="w-3 h-3" />;
                            }
                          };
                          const getSeverityColor = (severity: number) => {
                            if (severity >= 5) return '#ff1744';
                            if (severity >= 4) return '#ff6b35';
                            if (severity >= 3) return '#ffab00';
                            return '#00e676';
                          };
                          return (
                            <button
                              key={i}
                              onClick={() => {
                                // Enable the intel layer for this match
                                switch (match.intel.kind) {
                                  case 'conflict_zone': if (!intelConflictZones) setIntelConflictZones(true); break;
                                  case 'disputed_border': if (!intelDisputedBorders) setIntelDisputedBorders(true); break;
                                  case 'maritime_zone': if (!intelMaritimeZones) setIntelMaritimeZones(true); break;
                                  case 'sanctions': if (!intelSanctions) setIntelSanctions(true); break;
                                  case 'restricted_airspace': if (!intelRestrictedAirspace) setIntelRestrictedAirspace(true); break;
                                  case 'protest_unrest': if (!intelProtestUnrest) setIntelProtestUnrest(true); break;
                                  case 'internet_shutdown': if (!intelInternetShutdown) setIntelInternetShutdown(true); break;
                                  case 'military_activity': if (!intelMilitaryActivity) setIntelMilitaryActivity(true); break;
                                  case 'strike_indicators': if (!intelStrikeIndicators) setIntelStrikeIndicators(true); break;
                                  case 'thermal_anomaly': if (!intelThermalAnomalies) setIntelThermalAnomalies(true); break;
                                }
                                // Select the intel item
                                handleIntelSelect(match.intel);
                              }}
                              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition-all hover:bg-[#2a2a2d]"
                              style={{ 
                                borderColor: getSeverityColor(match.intel.severity),
                                color: getSeverityColor(match.intel.severity),
                              }}
                            >
                              {getIcon()}
                              <span>{match.intel.name}</span>
                              <span className="text-[9px] opacity-60">({match.matchType === 'inside' ? 'inside' : `${Math.round(match.distance || 0)}km`})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* FUSION SIGNALS - compound intelligence signals from overlapping layers */}
                  {eventFusionSignals.length > 0 && (
                    <div className="border-l-2 border-[#ff6b35]/40 pl-3">
                      <div className="flex items-center gap-2 mb-2.5">
                        <Zap className="w-3 h-3 text-[#ff6b35]" />
                        <p className="text-[9px] font-bold tracking-widest text-[#ff6b35] uppercase">Fusion Signals</p>
                        <span className="ml-auto text-[9px] text-[#6b6b70] font-mono">{eventFusionSignals.length}</span>
                      </div>
                      <div className="space-y-2.5">
                        {eventFusionSignals.map((signal) => {
                          const sigColor = signal.severity >= 5 ? '#ff1744' : signal.severity >= 4 ? '#ff6b35' : '#ffab00';
                          return (
                            <div key={signal.id} className="flex items-start gap-2.5">
                              <div className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: sigColor }} />
                              <div>
                                <div className="text-[10px] font-bold tracking-wide leading-snug" style={{ color: sigColor }}>{signal.label}</div>
                                <div className="text-[9px] text-[#6b6b70] mt-0.5 leading-relaxed">{signal.description}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* TRUST LAYER — "Why This Is Flagged" */}
                  {selectedEvent && selectedEventThreat && (() => {
                    // Compute trust signals inline from available event data
                    type TrustSignal = { label: string; status: 'pos' | 'warn' | 'caution' | 'neutral'; detail?: string };
                    const signals: TrustSignal[] = [];

                    // 1. Kinetic language
                    if (hasKineticLanguage(selectedEvent)) {
                      signals.push({ label: 'Kinetic language', status: 'pos', detail: 'Attack/combat terms in text' });
                    } else if (selectedEventThreat.factors.some(f => f.toLowerCase().includes('diplomatic'))) {
                      signals.push({ label: 'Diplomatic / policy', status: 'caution', detail: 'No kinetic language detected' });
                    }

                    // 2. US domestic sanity
                    if (selectedEventThreat.factors.some(f => f.toLowerCase().includes('domestic'))) {
                      signals.push({ label: 'Domestic gate applied', status: 'warn', detail: 'US location — kinetic bar raised' });
                    }

                    // 3. Source confirmation
                    if (selectedEvent.sourceCount >= 3) {
                      signals.push({ label: `${selectedEvent.sourceCount} sources confirmed`, status: 'pos', detail: 'Cross-publisher corroboration' });
                    } else if (selectedEvent.sourceCount === 2) {
                      signals.push({ label: 'Dual source', status: 'neutral', detail: 'Confirmed by 2 publishers' });
                    } else {
                      signals.push({ label: 'Single source', status: 'caution', detail: 'Unconfirmed — 1 publisher only' });
                    }

                    // 4. Intel layer overlap
                    if (eventIntelMatches.length > 0) {
                      const kinds = [...new Set(eventIntelMatches.map(m => m.intel.kind))];
                      const hasThermal = kinds.some(k => k.includes('thermal'));
                      signals.push({
                        label: `Intel overlap ×${eventIntelMatches.length}`,
                        status: hasThermal ? 'pos' : 'warn',
                        detail: kinds.slice(0, 2).map(k => k.replace(/_/g, ' ')).join(', '),
                      });
                    }

                    // 5. Escalation context
                    if (selectedEventEscalations.length > 0) {
                      signals.push({ label: 'Escalation cluster', status: 'warn', detail: `Part of ${selectedEventEscalations.length} escalation(s)` });
                    }

                    // 6. Fusion cluster
                    if ((selectedEvent.fusedArticleCount ?? 0) >= 3) {
                      signals.push({ label: 'Fusion cluster', status: 'pos', detail: `${selectedEvent.fusedArticleCount} articles fused` });
                    }

                    if (signals.length === 0) return null;

                    const statusColor: Record<string, string> = {
                      pos: '#00e676',
                      warn: '#ff9800',
                      caution: '#ffab00',
                      neutral: '#6b6b70',
                    };
                    const statusBg: Record<string, string> = {
                      pos: 'rgba(0,230,118,0.07)',
                      warn: 'rgba(255,152,0,0.07)',
                      caution: 'rgba(255,171,0,0.07)',
                      neutral: 'rgba(107,107,112,0.06)',
                    };

                    return (
                      <div className="border-l-2 border-[#00e676]/25 pl-3">
                        <div className="flex items-center gap-2 mb-2.5">
                          <CheckCircle className="w-3 h-3 text-[#00e676]/70" />
                          <p className="text-[9px] font-bold tracking-widest text-[#00e676]/70 uppercase">Trust Signals</p>
                          <span className="ml-auto text-[9px] text-[#6b6b70] font-mono">{signals.length}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {signals.map((sig, i) => (
                            <div
                              key={i}
                              className="flex flex-col gap-0.5 px-2 py-1.5 rounded"
                              style={{ backgroundColor: statusBg[sig.status], border: `1px solid ${statusColor[sig.status]}22` }}
                              title={sig.detail}
                            >
                              <span className="text-[9px] font-bold tracking-wide leading-tight" style={{ color: statusColor[sig.status] }}>
                                {sig.label}
                              </span>
                              {sig.detail && (
                                <span className="text-[8px] text-[#6b6b70] leading-tight truncate">{sig.detail}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Sources Section */}
                  <div className="border border-[#2a2a2d] rounded-lg overflow-hidden">
                    <button
                      onClick={() => setShowSources(!showSources)}
                      className="w-full p-3 flex items-center justify-between bg-[#1a1a1d] hover:bg-[#222225] transition-colors"
                    >
                      <span className="text-sm font-semibold text-white">Sources ({selectedEvent.sources.length})</span>
                      {showSources ? (
                        <ChevronUp className="w-4 h-4 text-[#6b6b70]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#6b6b70]" />
                      )}
                    </button>
                    {showSources && (
                      <div className="max-h-60 overflow-y-auto">
                        {selectedEvent.sources.map((source, idx) => (
                          <a
                            key={idx}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-3 border-t border-[#2a2a2d] hover:bg-[#1a1a1d]/50 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-white truncate">{source.sourceName}</div>
                              <div className="text-xs text-[#6b6b70] truncate">{cleanText(source.title)}</div>
                            </div>
                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                              <span className="text-[10px] text-[#6b6b70]">{formatTime(source.publishedAt)}</span>
                              <Link2 className="w-3 h-3 text-[#6b6b70]" />
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleSaved(selectedEvent.eventKey)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex-1 justify-center ${
                        selectedEvent.saved 
                          ? 'bg-[#0d2318] border border-[#00c896]/40 text-[#00c896]' 
                          : 'bg-[#1a1a1d] border border-[#2a2a2d] text-[#a0a0a5] hover:text-white hover:border-white/20'
                      }`}
                    >
                      {selectedEvent.saved ? (
                        <>
                          <BookmarkCheck className="w-4 h-4" />
                          Saved
                        </>
                      ) : (
                        <>
                          <Bookmark className="w-4 h-4" />
                          Save
                        </>
                      )}
                    </button>
                    
                    {selectedEvent.sources[0] && (
                      <a 
                        href={selectedEvent.sources[0].url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-[#1e1e22] border border-white/[0.12] rounded-lg text-sm font-semibold text-white/80 hover:text-white hover:border-white/22 transition-all flex-1 justify-center"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Read Article
                      </a>
                    )}
                  </div>
                  
                  {/* Show All Events Button */}
                  <button
                    onClick={handleDeselect}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#1a1a1d] border border-[#2a2a2d] rounded-lg text-sm font-semibold text-[#a0a0a5] hover:text-white hover:border-white/20 transition-all"
                  >
                    <X className="w-4 h-4" />
                    Show All Events
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Globe className="w-16 h-16 text-[#6b6b70]/30 mb-4" />
                  <p className="text-sm text-[#6b6b70]">Select an event from the feed</p>
                  <p className="text-xs text-[#6b6b70]/60 mt-1">or click a pin on the map</p>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Right Panel - Feed */}
        <div className="panel-wrapper right">
          <aside className={`side-panel right h-full bg-[#0a0a0c] border-l border-white/[0.05] flex flex-col ${feedCollapsed ? 'collapsed' : ''}`}>
            <div className="px-4 py-3.5 border-b border-white/[0.05] flex items-center justify-between">
              <div>
                <h2 className="orion-section-title">Signal Feed</h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[8px] text-white/22 font-mono bg-white/[0.04] border border-white/[0.05] px-2.5 py-1 rounded-sm tracking-widest">
                  {mounted ? filteredEvents.length : 0} events
                </div>
              </div>
            </div>
            
            {/* Tier filter chips — control both map and feed */}
            <div className="filter-scroll-container">
              {[
                { key: "all", label: "All", color: "#e8e8e8" },
                { key: "breaking", label: "Breaking", color: "#ff1744" },
                { key: "watch", label: "Watch", color: "#ffab00" },
                { key: "verified", label: "Verified", color: "#00e676" },
              ].map((filter) => (
                <div
                  key={filter.key}
                  className={`filter-chip ${currentFilter === filter.key ? 'selected' : ''}`}
                  onClick={() => handleFilterChange(filter.key as Tier | 'all')}
                >
                  <div 
                    className="filter-chip-dot"
                    style={{ 
                      background: filter.color,
                      boxShadow: currentFilter === filter.key ? `0 0 8px ${filter.color}` : 'none'
                    }}
                  />
                  <span className="filter-chip-label">{filter.label}</span>
                  <span className="filter-chip-count">{filterCounts[filter.key as keyof typeof filterCounts]}</span>
                </div>
              ))}
            </div>
            
            {/* Time window filter */}
            <div className="px-3 py-2 border-b border-white/[0.04] flex items-center gap-1.5 bg-[#0c0c0e]">
              <span className="text-[8px] text-white/22 font-mono tracking-[2px] uppercase mr-2">Window</span>
              {([
                { key: '1h', label: '1H' },
                { key: '6h', label: '6H' },
                { key: '24h', label: '24H' },
                { key: '7d', label: '7D' },
                { key: 'all', label: 'All' },
              ] as { key: string; label: string }[]).map(tf => (
                <button
                  key={tf.key}
                  onClick={() => setTimeFilter(tf.key as '1h' | '6h' | '24h' | '7d' | 'all')}
                  className="time-filter-chip"
                  style={{
                    background: timeFilter === tf.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: timeFilter === tf.key ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.22)',
                    border: `1px solid ${timeFilter === tf.key ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)'}`,
                    padding: '3px 9px',
                    borderRadius: '3px',
                    fontSize: '9px',
                    fontFamily: '"JetBrains Mono", monospace',
                    letterSpacing: '0.1em',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                    fontWeight: timeFilter === tf.key ? '700' : '500',
                  }}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {/* Feed Content - sync with map */}
            <div ref={feedContainerRef} className="flex-1 overflow-y-auto relative">
              {!mounted ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="spinner mb-4"></div>
                  <p className="text-sm text-[#6b6b70]">Loading...</p>
                </div>
              ) : isFetching && filteredEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="spinner mb-4"></div>
                  <p className="text-sm text-[#6b6b70]">Fetching intelligence...</p>
                </div>
              ) : (
                <div className="divide-y divide-[#2a2a2d]">
                  {filteredEvents.map((event) => {
                    const isSelected = selectedEventKey === event.eventKey;
                    return (
                      <div
                        key={event.eventKey}
                        id={`feed-item-${event.eventKey}`}
                        ref={(el) => {
                          if (el) feedItemRefs.current.set(event.eventKey, el);
                        }}
                        data-eventkey={event.eventKey}
                        className={`feed-item px-4 py-3.5 cursor-pointer ${isSelected ? 'active' : ''}`}
                        onClick={() => handleEventSelect(event)}
                      >
                        {/* Title row */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h4 className="text-[13px] font-semibold text-white/85 leading-snug line-clamp-2">{cleanText(event.title)}</h4>
                          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                            {event.saved && (
                              <BookmarkCheck className="w-3 h-3 text-[#00c896]" />
                            )}
                            <div 
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: getTierColor(event.tier), boxShadow: `0 0 4px ${getTierColor(event.tier)}` }}
                            />
                          </div>
                        </div>
                        {/* Meta row */}
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[#6b6b70] font-mono">
                          <span className="truncate max-w-[120px]">{event.locationLabel || '—'}</span>
                          <span className="text-white/12">·</span>
                          <span>{event.sourceCount}src</span>
                          <span className="text-white/12">·</span>
                          <span>{formatTime(event.latestPublishedAt)}</span>
                        </div>
                        {/* Category badge */}
                        {event.category && (
                          <div className="mt-2">
                            <span
                              className="px-1.5 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-wider font-mono"
                              style={{
                                backgroundColor: `${getCategoryColor(event.category)}18`,
                                color: getCategoryColor(event.category),
                                border: `1px solid ${getCategoryColor(event.category)}35`,
                              }}
                            >
                              {event.category}
                            </span>
                          </div>
                        )}
                        {/* Source names on selected */}
                        {(() => { const names = event.sourceNames || []; return isSelected && names.length > 1 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {names.slice(0, 4).map((name, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-[#1e1e21] border border-white/[0.06] rounded-sm text-[9px] text-white/40 font-mono">
                                {name}
                              </span>
                            ))}
                          </div>
                        ); })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Main Map Area */}
        <main className="flex-1 relative">
          <WorldMap
            events={fusedMapEvents}
            threatScores={allEventThreatScores}
            onPinClick={handlePinClick}
            selectedEventKey={selectedEventKey}
            focusMode={focusMode}
            onDeselect={handleDeselect}
            spreadCentroidPins={spreadCentroidPins}
            intelMode={intelMode}
            intelConflictZones={intelConflictZones}
            intelDisputedBorders={intelDisputedBorders}
            intelSanctions={intelSanctions}
            intelRestrictedAirspace={intelRestrictedAirspace}
            intelMaritimeZones={intelMaritimeZones}
            intelProtestUnrest={intelProtestUnrest}
            intelInternetShutdown={intelInternetShutdown}
            intelMilitaryActivity={intelMilitaryActivity}
            intelStrikeIndicators={intelStrikeIndicators}
            intelThermalAnomalies={intelThermalAnomalies}
            selectedIntelId={selectedIntel?.id || null}
            onIntelSelect={handleIntelSelect}
            onIntelDeselect={handleIntelDeselect}
            onIntelDataLoaded={handleIntelDataLoaded}
            sensorThermal={sensorThermal}
            sensorSeismic={sensorSeismic}
            sensorAircraft={sensorAircraft}
            timelineMap={timelineMap}
            intelDensityHeatmap={intelDensityHeatmap}
          />
          <div className="spy-grid pointer-events-none"></div>
          <div className="map-border-glow pointer-events-none"></div>
          
          {/* Map Hint */}
          <div className="map-hint">
            <MapPin className="w-4 h-4 text-white/40" />
            <span>Click pins to view events • Scroll to zoom • Drag to pan • ESC to deselect</span>
          </div>
          
          {/* ============================================ */}
          {/* LEFT HUD RAIL — single flex column, top-4 left-4, no overlap */}
          {/* Filter bar + Focus indicator live here so nothing collides   */}
          {/* ============================================ */}
          <div
            className="fixed z-[9999] flex flex-col gap-2"
            style={{
              top: 72,
              left: detailsCollapsed ? 16 : 396,
              width: 270,
              transition: 'left 0.35s cubic-bezier(0.4,0,0.2,1)',
            }}
          >

            {/* Row: Filter Display + Active Overlays toggle */}
            <div className="flex items-stretch gap-2">

              {/* Current Filter Display — flex-1 to fill row */}
              <div className="current-filter-display flex-1 min-w-0">
                <span className="current-filter-label">Showing:</span>
                <div className="current-filter-value">
                  <div 
                    className="current-filter-dot"
                    style={{ 
                      background: currentFilter === 'all' ? '#e8e8e8' : getTierColor(currentFilter as Tier),
                      boxShadow: `0 0 8px ${currentFilter === 'all' ? '#e8e8e8' : getTierColor(currentFilter as Tier)}`
                    }}
                  />
                  <span>
                    {currentFilter === 'all' ? 'All Events' : 
                     currentFilter === 'breaking' ? 'Breaking' :
                     currentFilter === 'watch' ? 'Watch' : 'Verified'}
                  </span>
                </div>
              </div>

              {/* Active Overlays — compact toggle beside filter, operator only */}
              {viewMode === 'operator' && (
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setOverlaysCollapsed(!overlaysCollapsed)}
                    className="orion-glass rounded-[10px] flex items-center gap-1.5 px-2.5 h-full hover:bg-white/[0.03] transition-colors"
                    title="Active Overlays"
                  >
                    <Layers className="w-3.5 h-3.5 text-white/30" />
                    {(intelMode || intelConflictZones || intelDisputedBorders || intelSanctions || intelRestrictedAirspace || intelMaritimeZones || intelProtestUnrest || intelInternetShutdown || intelMilitaryActivity || intelStrikeIndicators || intelThermalAnomalies || sensorThermal || sensorSeismic || sensorAircraft || intelDensityHeatmap) && (
                      <div className="orion-layer-dot-live w-1.5 h-1.5 rounded-full bg-[#00e676]" />
                    )}
                    <ChevronDown className={`w-3 h-3 text-white/20 transition-transform ${overlaysCollapsed ? '' : 'rotate-180'}`} />
                  </button>
                  {!overlaysCollapsed && (
                    <div className="absolute top-full left-0 mt-1 orion-glass rounded-xl z-20" style={{ minWidth: 200 }}>
                      <div className="px-3 py-2.5 border-b border-white/[0.05] flex items-center gap-2">
                        <Layers className="w-3 h-3 text-white/30" />
                        <h3 className="orion-section-title">Active Overlays</h3>
                      </div>
                      <div className="px-3 py-3 space-y-1.5">
                        {intelMode && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#00e676] shadow-[0_0_5px_#00e676]" />
                            <span className="text-[9px] text-[#00e676] font-medium uppercase tracking-wide">Intel Mode</span>
                          </div>
                        )}
                        {intelConflictZones && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#ff1744] shadow-[0_0_5px_#ff1744]" />
                            <span className="text-[9px] text-[#ff1744] font-medium uppercase tracking-wide">Conflict Zones</span>
                          </div>
                        )}
                        {intelDisputedBorders && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#ff4444] shadow-[0_0_5px_#ff4444]" />
                            <span className="text-[9px] text-[#ff4444] font-medium uppercase tracking-wide">Disputed Borders</span>
                          </div>
                        )}
                        {intelSanctions && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#b00020] shadow-[0_0_5px_#b00020]" />
                            <span className="text-[9px] text-[#b00020] font-medium uppercase tracking-wide">Sanctions</span>
                          </div>
                        )}
                        {intelRestrictedAirspace && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#ffab00] shadow-[0_0_5px_#ffab00]" />
                            <span className="text-[9px] text-[#ffab00] font-medium uppercase tracking-wide">Restricted Airspace</span>
                          </div>
                        )}
                        {intelMaritimeZones && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#00bcd4] shadow-[0_0_5px_#00bcd4]" />
                            <span className="text-[9px] text-[#00bcd4] font-medium uppercase tracking-wide">Maritime Zones</span>
                          </div>
                        )}
                        {intelProtestUnrest && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#e040fb] shadow-[0_0_5px_#e040fb]" />
                            <span className="text-[9px] text-[#e040fb] font-medium uppercase tracking-wide">Protest / Unrest</span>
                          </div>
                        )}
                        {intelInternetShutdown && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#5c6bc0] shadow-[0_0_5px_#5c6bc0]" />
                            <span className="text-[9px] text-[#5c6bc0] font-medium uppercase tracking-wide">Internet Shutdown</span>
                          </div>
                        )}
                        {intelMilitaryActivity && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#78909c] shadow-[0_0_5px_#78909c]" />
                            <span className="text-[9px] text-[#78909c] font-medium uppercase tracking-wide">Military Activity</span>
                          </div>
                        )}
                        {intelStrikeIndicators && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#ffca28] shadow-[0_0_5px_#ffca28]" />
                            <span className="text-[9px] text-[#ffca28] font-medium uppercase tracking-wide">Strike Indicators</span>
                          </div>
                        )}
                        {intelThermalAnomalies && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#ff6f00] shadow-[0_0_5px_#ff6f00]" />
                            <span className="text-[9px] text-[#ff6f00] font-medium uppercase tracking-wide">Thermal Anomalies</span>
                          </div>
                        )}
                        {sensorThermal && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#ff6d00] shadow-[0_0_5px_#ff6d00]" />
                            <span className="text-[9px] text-[#ff9800] font-medium uppercase tracking-wide">Live Thermal</span>
                          </div>
                        )}
                        {sensorSeismic && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#ab47bc] shadow-[0_0_5px_#ab47bc]" />
                            <span className="text-[9px] text-[#ce93d8] font-medium uppercase tracking-wide">Seismic Activity</span>
                          </div>
                        )}
                        {sensorAircraft && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#00e5ff] shadow-[0_0_5px_#00e5ff]" />
                            <span className="text-[9px] text-[#00e5ff] font-medium uppercase tracking-wide">Aircraft Activity</span>
                          </div>
                        )}
                        {intelDensityHeatmap && (
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#ff9800] shadow-[0_0_5px_#ff9800]" />
                            <span className="text-[9px] text-[#ff9800] font-medium uppercase tracking-wide">Intel Density</span>
                          </div>
                        )}
                        {!intelMode && !intelConflictZones && !intelDisputedBorders && !intelSanctions && !intelRestrictedAirspace && !intelMaritimeZones && !intelProtestUnrest && !intelInternetShutdown && !intelMilitaryActivity && !intelStrikeIndicators && !intelThermalAnomalies && !sensorThermal && !sensorSeismic && !sensorAircraft && !intelDensityHeatmap && (
                          <div className="text-[9px] text-white/20 py-1 tracking-wide">No layers active</div>
                        )}
                      </div>
                      {/* Sensor feed toggles */}
                      <div className="border-t border-white/[0.05] px-3 py-2.5 space-y-1.5">
                        <div className="text-[7px] text-white/20 font-mono tracking-[2px] uppercase mb-2">Sensor Feeds</div>
                        {[
                          { label: 'Thermal Anomalies', color: '#ff9800', val: sensorThermal, set: setSensorThermal },
                          { label: 'Seismic Activity',  color: '#ce93d8', val: sensorSeismic, set: setSensorSeismic },
                          { label: 'Aircraft Activity', color: '#00e5ff', val: sensorAircraft, set: setSensorAircraft },
                        ].map(({ label, color, val, set }) => (
                          <button
                            key={label}
                            onClick={() => set(v => !v)}
                            className="w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded hover:bg-white/[0.03] transition-colors"
                          >
                            <span className="text-[9px] font-medium uppercase tracking-wide" style={{ color: val ? color : 'rgba(255,255,255,0.30)' }}>{label}</span>
                            <div className={`w-6 h-3.5 rounded-full transition-colors duration-200 flex items-center px-0.5 ${val ? '' : 'bg-[#2a2a2d]'}`} style={val ? { background: color + '44' } : {}}>
                              <div className={`w-2.5 h-2.5 rounded-full transition-transform duration-200 ${val ? 'translate-x-2.5' : 'translate-x-0'}`} style={{ background: val ? color : '#6b6b70' }} />
                            </div>
                          </button>
                        ))}
                      </div>
                      {/* Analysis overlays */}
                      <div className="border-t border-white/[0.05] px-3 py-2.5 space-y-1.5">
                        <div className="text-[7px] text-white/20 font-mono tracking-[2px] uppercase mb-2">Analysis</div>
                        <button
                          onClick={() => setIntelDensityHeatmap(v => !v)}
                          className="w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded hover:bg-white/[0.03] transition-colors"
                        >
                          <span className="text-[9px] font-medium uppercase tracking-wide" style={{ color: intelDensityHeatmap ? '#ff9800' : 'rgba(255,255,255,0.30)' }}>Intel Density</span>
                          <div className={`w-6 h-3.5 rounded-full transition-colors duration-200 flex items-center px-0.5 ${intelDensityHeatmap ? '' : 'bg-[#2a2a2d]'}`} style={intelDensityHeatmap ? { background: '#ff980044' } : {}}>
                            <div className={`w-2.5 h-2.5 rounded-full transition-transform duration-200 ${intelDensityHeatmap ? 'translate-x-2.5' : 'translate-x-0'}`} style={{ background: intelDensityHeatmap ? '#ff9800' : '#6b6b70' }} />
                          </div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Focus Mode Indicator — rail-native */}
            {focusMode && selectedEvent && (
              <div className="single-pin-mode">
                <Eye className="w-3.5 h-3.5 text-white/70 flex-shrink-0" />
                <span>Focus Mode</span>
                <button 
                  onClick={handleDeselect}
                  className="ml-auto text-[10px] text-white/35 underline hover:text-white/60 hover:no-underline font-mono"
                >
                  ESC
                </button>
              </div>
            )}

            {/* Stats — compact horizontal strip */}
            <div className="orion-glass orion-panel-aurora rounded-xl">
              <div className="flex divide-x divide-white/[0.05]">
                <div className="px-3 py-3 text-center flex-1 min-w-0">
                  <div className="text-[17px] font-bold text-white/70 leading-none tabular-nums">{mounted ? stats.total : 0}</div>
                  <div className="text-[8px] text-white/25 font-semibold mt-[7px] mb-0.5 uppercase font-mono leading-none tracking-wide">Total</div>
                </div>
                <div className="px-3 py-3 text-center flex-1 min-w-0">
                  <div className="text-[17px] font-bold text-[#ff1744] leading-none tabular-nums">{mounted ? stats.breaking : 0}</div>
                  <div className="text-[8px] text-white/25 font-semibold mt-[7px] mb-0.5 uppercase font-mono leading-none tracking-wide">BRK</div>
                </div>
                <div className="px-3 py-3 text-center flex-1 min-w-0">
                  <div className="text-[17px] font-bold text-[#ffab00] leading-none tabular-nums">{mounted ? stats.watch : 0}</div>
                  <div className="text-[8px] text-white/25 font-semibold mt-[7px] mb-0.5 uppercase font-mono leading-none tracking-wide">WCH</div>
                </div>
                <div className="px-3 py-3 text-center flex-1 min-w-0">
                  <div className="text-[17px] font-bold text-[#00e676] leading-none tabular-nums">{mounted ? stats.verified : 0}</div>
                  <div className="text-[8px] text-white/25 font-semibold mt-[7px] mb-0.5 uppercase font-mono leading-none tracking-wide">VFD</div>
                </div>
              </div>
            </div>

            {/* Escalation Watch — secondary module, hidden in Focus/Briefing */}
            {viewMode === 'operator' && (
            <div className="orion-glass orion-panel-aurora rounded-xl min-w-[210px]">
              <button
                onClick={() => setEscalationsCollapsed(!escalationsCollapsed)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.02] transition-colors rounded-xl"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-3 h-3 text-[#ff6b35]/70" />
                  <h3 className="orion-section-title orion-warning-glow" style={{ color: 'rgba(255,107,53,0.82)' }}>Escalation Watch</h3>
                </div>
                <div className="flex items-center gap-2">
                  {mounted && activeEscalations.length > 0 && (
                    <>
                      <span className="text-[9px] text-[#6b6b70]">{activeEscalations.length}</span>
                      <div 
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: getEscalationSeverityColor(activeEscalations[0]?.severity || 'low') }}
                      />
                    </>
                  )}
                  <ChevronDown className={`w-3 h-3 text-white/20 transition-transform ${escalationsCollapsed ? '' : 'rotate-180'}`} />
                </div>
              </button>
              {!escalationsCollapsed && mounted && (
                <div className="px-3 pb-3 space-y-1.5">
                  {activeEscalations.length > 0 ? (
                    topEscalations.map((escalation) => (
                      <button
                        key={escalation.id}
                        onClick={() => handleEscalationEventSelect(escalation)}
                        className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/[0.03] transition-colors group text-left"
                      >
                        <div 
                          className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0"
                          style={{ 
                            backgroundColor: getEscalationBgColor(escalation.severity),
                            color: getEscalationSeverityColor(escalation.severity),
                          }}
                        >
                          {escalation.event_count}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-white/45 truncate group-hover:text-white/80 transition-colors leading-snug">
                            {escalation.title}
                          </p>
                          <p className="text-[9px] text-white/22 truncate mt-0.5">
                            {escalation.region}
                          </p>
                        </div>
                        <div 
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getEscalationSeverityColor(escalation.severity) }}
                        />
                      </button>
                    ))
                  ) : (
                    <div className="text-[10px] text-white/20 py-1.5 text-center tracking-wide">
                      No active escalations
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

          </div>

          {/* ============================================ */}
          {/* RIGHT RAIL — Intel DB · High Threat Events (mirrors Escalation Watch) */}
          {/* Operator: both | Focus: Intel DB only | Briefing: hidden             */}
          {/* Shifts down when Spread chip is expanded to prevent overlap          */}
          {/* ============================================ */}
          {viewMode !== 'briefing' && (
            <div
              className="fixed z-[9999] flex flex-col gap-2"
              style={{
                top: hudOpen ? 232 : 100,
                right: feedCollapsed ? 16 : 396,
                width: 220,
                transition: 'top 0.2s ease, right 0.35s cubic-bezier(0.4,0,0.2,1)',
              }}
            >

              {/* Intel DB — always visible when not briefing */}
              {intelManifest && (
                <div className="orion-glass orion-panel-aurora rounded-xl px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-3 orion-accent-bar">
                    <Database className="w-3 h-3 text-white/30" />
                    <h3 className="orion-section-title" style={{ color: 'rgba(255,255,255,0.35)' }}>Intel DB</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-baseline gap-4">
                      <span className="text-[8px] text-white/[0.30] tracking-[2px] font-mono uppercase">Datasets</span>
                      <span className="orion-mono font-bold">{intelManifest.total_datasets}</span>
                    </div>
                    <div className="flex justify-between items-baseline gap-4">
                      <span className="text-[8px] text-white/[0.30] tracking-[2px] font-mono uppercase">Features</span>
                      <span className="orion-mono font-bold" style={{ color: '#00e676' }}>{intelManifest.total_features}</span>
                    </div>
                    <div className="flex justify-between items-baseline gap-4">
                      <span className="text-[8px] text-white/[0.30] tracking-[2px] font-mono uppercase">Synced</span>
                      <span className="orion-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.32)' }}>
                        {new Date(intelManifest.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* High Threat Events — operator only, mirrors Escalation Watch on left */}
              {viewMode === 'operator' && mounted && topThreats.length > 0 && (
                <div className="orion-glass orion-panel-aurora rounded-xl">
                  <button
                    onClick={() => setGlobalThreatsCollapsed(!globalThreatsCollapsed)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.02] transition-colors rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-[#ff6b35]/70" />
                      <h3 className="orion-section-title orion-warning-glow" style={{ color: 'rgba(255,107,53,0.82)' }}>High Threat Events</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-white/20 font-mono">{topThreats.length}</span>
                      <ChevronDown className={`w-3 h-3 text-white/20 transition-transform ${globalThreatsCollapsed ? '' : 'rotate-180'}`} />
                    </div>
                  </button>
                  {!globalThreatsCollapsed && (
                    <div className="px-3 pb-3 space-y-1">
                      {topThreats.map(({ event, threat }) => (
                        <button
                          key={event.eventKey}
                          onClick={() => {
                            setSelectedEventKey(event.eventKey);
                            setDetailsCollapsed(false);
                          }}
                          className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/[0.03] transition-colors group text-left"
                        >
                          <div
                            className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0"
                            style={{
                              backgroundColor: THREAT_BG_COLORS[threat.level],
                              color: THREAT_COLORS[threat.level],
                            }}
                          >
                            {threat.score}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-white/40 truncate group-hover:text-white/80 transition-colors">
                              {cleanText(event.title)}
                            </p>
                          </div>
                          <div
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: THREAT_COLORS[threat.level] }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {/* ============================================ */}
          {/* SYSTEM KEY — Unified reference module, bottom-right, collapsed by default */}
          {/* Replaces separate Tier Legend + Topic Index permanently floating boxes */}
          {/* Hidden in Briefing mode */}
          {/* ============================================ */}
          {viewMode !== 'briefing' && <div
            className="fixed z-[9999]"
            style={{ bottom: 16, right: feedCollapsed ? 16 : 396, transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1)' }}
          >
            {!systemKeyOpen ? (
              /* Collapsed state — compact glass pill */
              <button
                onClick={() => setSystemKeyOpen(true)}
                className="orion-glass rounded-lg px-3 py-2 flex items-center gap-2 hover:bg-white/[0.03] transition-colors group"
              >
                <Shield className="w-3 h-3 text-white/25 group-hover:text-white/45 transition-colors" />
                <span className="text-[8px] font-bold tracking-[2.5px] text-white/22 uppercase font-mono group-hover:text-white/40 transition-colors">System Key</span>
                <ChevronDown className="w-3 h-3 text-white/15 group-hover:text-white/30 transition-colors" />
              </button>
            ) : (
              /* Expanded state — full reference panel */
              <div className="orion-glass rounded-xl p-4 min-w-[250px]">
                {/* Header row */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 orion-accent-bar">
                    <Shield className="w-3 h-3 text-white/30" />
                    <h3 className="orion-section-title">System Key</h3>
                  </div>
                  <button
                    onClick={() => setSystemKeyOpen(false)}
                    className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-white/[0.06] transition-colors text-white/25 hover:text-white/50"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                {/* Tier Classification */}
                <div className="mb-3.5">
                  <div className="orion-label mb-2.5">Tier Classification</div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ff1744', boxShadow: '0 0 4px rgba(255,23,68,0.5)' }} />
                      <span className="text-[10px] text-[#ff1744] font-bold tracking-widest flex-1">BREAKING</span>
                      <span className="text-[9px] text-white/18 font-mono">1 src</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ffab00', boxShadow: '0 0 4px rgba(255,171,0,0.4)' }} />
                      <span className="text-[10px] text-[#ffab00] font-bold tracking-widest flex-1">WATCH</span>
                      <span className="text-[9px] text-white/18 font-mono">2 src</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#00e676', boxShadow: '0 0 4px rgba(0,230,118,0.4)' }} />
                      <span className="text-[10px] text-[#00e676] font-bold tracking-widest flex-1">VERIFIED</span>
                      <span className="text-[9px] text-white/18 font-mono">3+</span>
                    </div>
                  </div>
                </div>

                <div className="orion-divider mb-3.5" />

                {/* Topic Index */}
                <div>
                  <div className="orion-label mb-2.5">Topic Index</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {[
                      { name: 'War', color: '#ef5350' },
                      { name: 'Politics', color: '#7986cb' },
                      { name: 'Economy', color: '#66bb6a' },
                      { name: 'Diplomacy', color: '#ba68c8' },
                      { name: 'Protests', color: '#ffd54f' },
                      { name: 'Disasters', color: '#ffa726' },
                      { name: 'Science', color: '#4dd0e1' },
                    ].map(topic => (
                      <div key={topic.name} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: topic.color }} />
                        <span className="text-[10px] text-white/32">{topic.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>}
        </main>
      </div>

      {/* Command Palette Modal */}
      {commandPaletteOpen && (
        <div 
          className="fixed inset-0 z-[100000] flex items-start justify-center pt-[15vh]"
          onClick={() => setCommandPaletteOpen(false)}
        >
          <div 
            className="orion-glass rounded-xl w-full max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05]">
              <span className="text-white/20 text-sm font-mono">/</span>
              <input
                type="text"
                placeholder="Type a command..."
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-[#6b6b70]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setCommandPaletteOpen(false);
                  }
                }}
              />
            </div>
            <div className="p-2 max-h-[60vh] overflow-y-auto">
              <div className="orion-label px-3 py-2">Intel Layers</div>
              <button
                onClick={() => { setIntelMode(v => !v); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${intelMode ? 'bg-[#00e676]' : 'bg-white/[0.10]'}`} />
                <span className="text-[13px] text-white/45">Toggle Intel Mode</span>
                <span className="ml-auto text-[9px] text-white/20 font-mono bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded">G</span>
              </button>
              <button
                onClick={() => { setIntelConflictZones(v => !v); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${intelConflictZones ? 'bg-[#ff1744]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Toggle Conflict Zones</span>
                <span className="ml-auto text-[10px] text-[#6b6b70]">Z</span>
              </button>
              <button
                onClick={() => { setIntelDisputedBorders(v => !v); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${intelDisputedBorders ? 'bg-[#ff4444]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Toggle Disputed Borders</span>
                <span className="ml-auto text-[10px] text-[#6b6b70]">B</span>
              </button>
              <button
                onClick={() => { setIntelSanctions(v => !v); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${intelSanctions ? 'bg-[#b00020]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Toggle Sanctions</span>
                <span className="ml-auto text-[10px] text-[#6b6b70]">K</span>
              </button>
              <button
                onClick={() => { setIntelRestrictedAirspace(v => !v); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${intelRestrictedAirspace ? 'bg-[#ffab00]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Toggle Restricted Airspace</span>
                <span className="ml-auto text-[10px] text-[#6b6b70]">Y</span>
              </button>
              <button
                onClick={() => { setIntelMaritimeZones(v => !v); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${intelMaritimeZones ? 'bg-[#00bcd4]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Toggle Maritime Zones</span>
                <span className="ml-auto text-[10px] text-[#6b6b70]">V</span>
              </button>
              <button
                onClick={() => { setIntelProtestUnrest(v => !v); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${intelProtestUnrest ? 'bg-[#e040fb]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Toggle Protest / Unrest</span>
                <span className="ml-auto text-[10px] text-[#6b6b70]">P</span>
              </button>
              <button
                onClick={() => { setIntelInternetShutdown(v => !v); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${intelInternetShutdown ? 'bg-[#5c6bc0]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Toggle Internet Shutdown</span>
                <span className="ml-auto text-[10px] text-[#6b6b70]">I</span>
              </button>
              <button
                onClick={() => { setIntelMilitaryActivity(v => !v); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${intelMilitaryActivity ? 'bg-[#78909c]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Toggle Military Activity</span>
                <span className="ml-auto text-[10px] text-[#6b6b70]">M</span>
              </button>
              <button
                onClick={() => { setIntelStrikeIndicators(v => !v); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${intelStrikeIndicators ? 'bg-[#ffca28]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Toggle Strike Indicators</span>
                <span className="ml-auto text-[10px] text-[#6b6b70]">T</span>
              </button>
              <button
                onClick={() => { setIntelThermalAnomalies(v => !v); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${intelThermalAnomalies ? 'bg-[#ff6f00]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Toggle Thermal Anomalies</span>
                <span className="ml-auto text-[10px] text-[#6b6b70]">H</span>
              </button>
              <button
                onClick={() => { 
                  setIntelMode(false);
                  setIntelConflictZones(false);
                  setIntelDisputedBorders(false);
                  setIntelSanctions(false);
                  setIntelRestrictedAirspace(false);
                  setIntelMaritimeZones(false);
                  setIntelProtestUnrest(false);
                  setIntelInternetShutdown(false);
                  setIntelMilitaryActivity(false);
                  setIntelStrikeIndicators(false);
                  setIntelThermalAnomalies(false);
                  setCommandPaletteOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-[#ff1744]" />
                <span className="text-sm text-[#a0a0a5]">Disable All Intel Layers</span>
                <span className="ml-auto text-[10px] text-[#6b6b70]">Shift+X</span>
              </button>
              <div className="text-[10px] text-[#6b6b70] px-3 py-2 mt-2 uppercase tracking-wider">Event Filters</div>
              <button
                onClick={() => { handleFilterChange('all'); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${currentFilter === 'all' ? 'bg-[#e8e8e8]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Show All Events</span>
              </button>
              <button
                onClick={() => { handleFilterChange('breaking'); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${currentFilter === 'breaking' ? 'bg-[#ff1744]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Show Breaking Only</span>
              </button>
              <button
                onClick={() => { handleFilterChange('watch'); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${currentFilter === 'watch' ? 'bg-[#ffab00]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Show Watch Only</span>
              </button>
              <button
                onClick={() => { handleFilterChange('verified'); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${currentFilter === 'verified' ? 'bg-[#00e676]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Show Verified Only</span>
              </button>
              <div className="text-[10px] text-[#6b6b70] px-3 py-2 mt-2 uppercase tracking-wider">View Controls</div>
              <button
                onClick={() => { setSpreadCentroidPins(v => !v); setCommandPaletteOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${spreadCentroidPins ? 'bg-[#00e676]' : 'bg-[#2a2a2d]'}`} />
                <span className="text-sm text-[#a0a0a5]">Toggle Pin Spread</span>
              </button>
              <button
                onClick={() => { 
                  if (selectedEventKey) {
                    deselectEvent();
                  }
                  setCommandPaletteOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-left transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-[#6b6b70]" />
                <span className="text-sm text-[#a0a0a5]">Clear Selection</span>
                <span className="ml-auto text-[10px] text-[#6b6b70]">ESC</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
