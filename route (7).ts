import { NextResponse } from "next/server";

// Domain to canonical publisher mapping
const DOMAIN_TO_PUBLISHER: Record<string, string> = {
  'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC',
  'bbci.co.uk': 'BBC',
  'reuters.com': 'Reuters',
  'apnews.com': 'AP',
  'nytimes.com': 'New York Times',
  'washingtonpost.com': 'Washington Post',
  'theguardian.com': 'The Guardian',
  'aljazeera.com': 'Al Jazeera',
  'cnn.com': 'CNN',
  'foxnews.com': 'Fox News',
  'bloomberg.com': 'Bloomberg',
  'npr.org': 'NPR',
  'dw.com': 'Deutsche Welle',
  'france24.com': 'France 24',
  'abcnews.go.com': 'ABC News',
  'nbcnews.com': 'NBC News',
  'cbsnews.com': 'CBS News',
  'nhk.or.jp': 'NHK',
  'jpost.com': 'Jerusalem Post',
  'arabnews.com': 'Arab News',
  'timesofindia.indiatimes.com': 'Times of India',
  'thehindu.com': 'The Hindu',
  'politico.com': 'Politico',
  'axios.com': 'Axios',
};

// Aggregator patterns
const AGGREGATOR_PATTERNS = [
  /Google News/i,
  /Google World/i,
  /Google US/i,
  /Google/i,
  /NewsNow/i,
  /Yahoo News/i,
];

// Source name patterns
const SOURCE_NAME_PATTERNS: Array<{ pattern: RegExp; publisher: string }> = [
  { pattern: /^BBC\s/i, publisher: 'BBC' },
  { pattern: /^Reuters\s/i, publisher: 'Reuters' },
  { pattern: /^Associated\s*Press/i, publisher: 'AP' },
  { pattern: /^AP\s*News/i, publisher: 'AP' },
  { pattern: /^New\s*York\s*Times/i, publisher: 'New York Times' },
  { pattern: /^Washington\s*Post/i, publisher: 'Washington Post' },
  { pattern: /^Guardian/i, publisher: 'The Guardian' },
  { pattern: /^Al\s*Jazeera/i, publisher: 'Al Jazeera' },
  { pattern: /^CNN\s/i, publisher: 'CNN' },
  { pattern: /^Fox\s*News/i, publisher: 'Fox News' },
  { pattern: /^Bloomberg\s/i, publisher: 'Bloomberg' },
  { pattern: /^Politico/i, publisher: 'Politico' },
  { pattern: /^Axios/i, publisher: 'Axios' },
];

const STOP_WORDS = new Set(['the', 'a', 'an', 'news', 'report', 'update']);

function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function normalizePublisher(url: string, sourceName: string, title: string): string {
  // Priority 1: Check if source is an aggregator - extract from title
  const isAggregator = AGGREGATOR_PATTERNS.some(p => p.test(sourceName));
  
  if (isAggregator) {
    // Pattern: " - Publisher" at end
    const dashMatch = title.match(/[-–—]\s*([A-Za-z][A-Za-z\s.]+?)\s*$/);
    if (dashMatch) {
      const extracted = dashMatch[1].trim();
      if (extracted.length > 2 && extracted.length < 50 && !STOP_WORDS.has(extracted.toLowerCase())) {
        for (const { pattern, publisher } of SOURCE_NAME_PATTERNS) {
          if (pattern.test(extracted)) {
            return publisher;
          }
        }
        return extracted;
      }
    }
  }
  
  // Priority 2: Extract domain from URL
  const domain = extractDomain(url);
  
  if (domain) {
    if (DOMAIN_TO_PUBLISHER[domain]) {
      return DOMAIN_TO_PUBLISHER[domain];
    }
    
    for (const [domainPattern, publisher] of Object.entries(DOMAIN_TO_PUBLISHER)) {
      if (domain.endsWith('.' + domainPattern)) {
        return publisher;
      }
    }
  }
  
  // Priority 3: Match sourceName against patterns
  for (const { pattern, publisher } of SOURCE_NAME_PATTERNS) {
    if (pattern.test(sourceName)) {
      return publisher;
    }
  }
  
  // Fallback: strip common suffixes
  let cleanName = sourceName;
  cleanName = cleanName.replace(/\s*[-|]\s*(World|Asia|Europe|Africa|Middle East|News)\s*$/i, '');
  cleanName = cleanName.replace(/\s+News\s*$/i, '');
  
  return cleanName.trim() || sourceName;
}

// Stop words for event key
const STOP_WORDS_KEY = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'for', 'in', 'on', 'with', 'from',
  'after', 'before', 'says', 'report', 'reports', 'update', 'live', 'breaking',
  'latest', 'new', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'news', 'article', 'according', 'told', 'tells', 'say'
]);

const COUNTRY_NORMALIZE: Record<string, string> = {
  'united states': 'us', 'usa': 'us', 'us': 'us',
  'united kingdom': 'uk', 'uk': 'uk', 'britain': 'uk', 'england': 'uk',
  'russia': 'ru', 'russian': 'ru',
  'china': 'cn', 'chinese': 'cn',
  'israel': 'il', 'israeli': 'il',
  'ukraine': 'ua', 'ukrainian': 'ua',
  'iran': 'ir', 'iranian': 'ir',
  'gaza': 'ps', 'palestinian': 'ps',
  'india': 'in', 'indian': 'in',
  'japan': 'jp', 'japanese': 'jp',
  'germany': 'de', 'german': 'de',
  'france': 'fr', 'french': 'fr',
};

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function removeStopWords(title: string): string[] {
  const words = normalize(title).split(/\s+/);
  return words.filter(w => !STOP_WORDS_KEY.has(w) && w.length > 2);
}

function normalizeCountryKey(locationLabel: string | null): string {
  if (!locationLabel) return 'unknown';
  const normalized = locationLabel.toLowerCase().trim();
  if (COUNTRY_NORMALIZE[normalized]) return COUNTRY_NORMALIZE[normalized];
  for (const [key, value] of Object.entries(COUNTRY_NORMALIZE)) {
    if (normalized.includes(key)) return value;
  }
  return normalized.replace(/[^a-z]/g, '').substring(0, 3) || 'unknown';
}

function getTimeBucket(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const hours = Math.floor(date.getUTCHours() / 12) * 12;
    return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${hours}`;
  } catch {
    return 'unknown';
  }
}

function generateEventKey(title: string, locationLabel: string | null, publishedAt: string): string {
  const titleTokens = removeStopWords(title).slice(0, 8).join('');
  const countryKey = normalizeCountryKey(locationLabel);
  const timeBucket = getTimeBucket(publishedAt);
  
  const combined = `${titleTokens}|${countryKey}|${timeBucket}`;
  
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(36);
}

function classifyTier(sourceCount: number): string {
  if (sourceCount >= 3) return 'verified';
  if (sourceCount === 2) return 'watch';
  return 'breaking';
}

interface Article {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  publishedAt: string;
  description: string;
  locationLabel: string | null;
  lat: number | null;
  lng: number | null;
}

interface Event {
  eventKey: string;
  title: string;
  locationLabel: string | null;
  countryKey: string;
  lat: number | null;
  lng: number | null;
  latestPublishedAt: string;
  sourceNames: string[];
  sourceCount: number;
  tier: string;
  urls: string[];
  originalSourceNames: string[];
}

export async function GET() {
  try {
    const response = await fetch('http://localhost:3000/api/rss', { cache: 'no-store' });
    const data = await response.json();
    const articles: Article[] = data.articles || [];
    
    const eventsByKey = new Map<string, Event>();
    
    for (const article of articles) {
      if (!article.lat || !article.lng) continue;
      
      const eventKey = generateEventKey(article.title, article.locationLabel, article.publishedAt);
      const countryKey = normalizeCountryKey(article.locationLabel);
      const publisher = normalizePublisher(article.url, article.sourceName, article.title);
      
      let existingEvent = eventsByKey.get(eventKey);
      
      if (existingEvent) {
        if (!existingEvent.urls.includes(article.url)) {
          existingEvent.urls.push(article.url);
        }
        
        if (!existingEvent.sourceNames.includes(publisher)) {
          existingEvent.sourceNames.push(publisher);
        }
        
        if (!existingEvent.originalSourceNames.includes(article.sourceName)) {
          existingEvent.originalSourceNames.push(article.sourceName);
        }
        
        existingEvent.sourceCount = existingEvent.sourceNames.length;
        existingEvent.tier = classifyTier(existingEvent.sourceCount);
        
        if (new Date(article.publishedAt) > new Date(existingEvent.latestPublishedAt)) {
          existingEvent.latestPublishedAt = article.publishedAt;
          existingEvent.title = article.title;
        }
      } else {
        eventsByKey.set(eventKey, {
          eventKey,
          title: article.title,
          locationLabel: article.locationLabel,
          countryKey,
          lat: article.lat,
          lng: article.lng,
          latestPublishedAt: article.publishedAt,
          sourceNames: [publisher],
          sourceCount: 1,
          tier: 'breaking',
          urls: [article.url],
          originalSourceNames: [article.sourceName],
        });
      }
    }
    
    const events = Array.from(eventsByKey.values())
      .sort((a, b) => new Date(b.latestPublishedAt).getTime() - new Date(a.latestPublishedAt).getTime());
    
    const stats = {
      totalArticles: articles.length,
      totalEvents: events.length,
      breaking: events.filter(e => e.tier === 'breaking').length,
      watch: events.filter(e => e.tier === 'watch').length,
      verified: events.filter(e => e.tier === 'verified').length,
    };
    
    const breakingExample = events.find(e => e.tier === 'breaking');
    const watchExample = events.find(e => e.tier === 'watch');
    const verifiedExample = events.find(e => e.tier === 'verified');
    
    return NextResponse.json({
      stats,
      examples: {
        breaking: breakingExample ? {
          title: breakingExample.title,
          sourceCount: breakingExample.sourceCount,
          sourceNames: breakingExample.sourceNames,
          originalSourceNames: breakingExample.originalSourceNames,
          tier: breakingExample.tier,
          countryKey: breakingExample.countryKey,
          url: breakingExample.urls[0],
        } : null,
        watch: watchExample ? {
          title: watchExample.title,
          sourceCount: watchExample.sourceCount,
          sourceNames: watchExample.sourceNames,
          originalSourceNames: watchExample.originalSourceNames,
          tier: watchExample.tier,
          countryKey: watchExample.countryKey,
          urls: watchExample.urls,
        } : null,
        verified: verifiedExample ? {
          title: verifiedExample.title,
          sourceCount: verifiedExample.sourceCount,
          sourceNames: verifiedExample.sourceNames,
          originalSourceNames: verifiedExample.originalSourceNames,
          tier: verifiedExample.tier,
          countryKey: verifiedExample.countryKey,
          urls: verifiedExample.urls.slice(0, 5),
        } : null,
      },
      publisherDistribution: (() => {
        const pubCounts: Record<string, number> = {};
        events.forEach(e => e.sourceNames.forEach(p => { pubCounts[p] = (pubCounts[p] || 0) + 1; }));
        return Object.entries(pubCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
      })(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
