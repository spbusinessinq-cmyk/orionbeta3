import { NextResponse } from "next/server";

// Debug endpoint showing publisher normalization proof

const DOMAIN_TO_PUBLISHER: Record<string, string> = {
  'bbc.com': 'BBC', 'bbc.co.uk': 'BBC', 'bbci.co.uk': 'BBC',
  'reuters.com': 'Reuters', 'reutersagency.com': 'Reuters',
  'apnews.com': 'AP', 'ap.org': 'AP',
  'nytimes.com': 'New York Times',
  'washingtonpost.com': 'Washington Post',
  'theguardian.com': 'The Guardian', 'guardian.co.uk': 'The Guardian',
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

const AGGREGATOR_PATTERNS = [
  /Google News/i, /Google World/i, /Google US/i, /Google/i,
];

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
  // Priority 1: Aggregator - extract from title
  const isAggregator = AGGREGATOR_PATTERNS.some(p => p.test(sourceName));
  if (isAggregator) {
    const dashMatch = title.match(/[-–—]\s*([A-Za-z][A-Za-z\s.]+?)\s*$/);
    if (dashMatch) {
      const extracted = dashMatch[1].trim();
      if (extracted.length > 2 && extracted.length < 50 && !STOP_WORDS.has(extracted.toLowerCase())) {
        for (const { pattern, publisher } of SOURCE_NAME_PATTERNS) {
          if (pattern.test(extracted)) return publisher;
        }
        return extracted;
      }
    }
  }
  
  // Priority 2: Domain mapping
  const domain = extractDomain(url);
  if (domain) {
    if (DOMAIN_TO_PUBLISHER[domain]) return DOMAIN_TO_PUBLISHER[domain];
    for (const [domainPattern, publisher] of Object.entries(DOMAIN_TO_PUBLISHER)) {
      if (domain.endsWith('.' + domainPattern)) return publisher;
    }
  }
  
  // Priority 3: Source name patterns
  for (const { pattern, publisher } of SOURCE_NAME_PATTERNS) {
    if (pattern.test(sourceName)) return publisher;
  }
  
  // Fallback: strip section suffixes
  let cleanName = sourceName;
  cleanName = cleanName.replace(/\s*[-|]\s*(World|Asia|Europe|Africa|Middle East|News)\s*$/i, '');
  cleanName = cleanName.replace(/\s+News\s*$/i, '');
  return cleanName.trim() || sourceName;
}

interface Article {
  title: string;
  url: string;
  sourceName: string;
}

export async function GET() {
  try {
    const response = await fetch('http://localhost:3000/api/rss', { cache: 'no-store' });
    const data = await response.json();
    const articles: Article[] = data.articles || [];
    
    // Show normalization examples
    const normalizationExamples: Array<{
      originalSourceName: string;
      normalizedPublisher: string;
      domain: string | null;
      title: string;
    }> = [];
    
    const seenSourceNames = new Set<string>();
    
    for (const article of articles) {
      if (seenSourceNames.has(article.sourceName)) continue;
      seenSourceNames.add(article.sourceName);
      
      const domain = extractDomain(article.url);
      const normalized = normalizePublisher(article.url, article.sourceName, article.title);
      
      normalizationExamples.push({
        originalSourceName: article.sourceName,
        normalizedPublisher: normalized,
        domain,
        title: article.title.substring(0, 50),
      });
      
      if (normalizationExamples.length >= 30) break;
    }
    
    // Count articles per normalized publisher
    const publisherCounts: Record<string, { count: number; originalNames: string[] }> = {};
    
    for (const article of articles) {
      const normalized = normalizePublisher(article.url, article.sourceName, article.title);
      if (!publisherCounts[normalized]) {
        publisherCounts[normalized] = { count: 0, originalNames: [] };
      }
      publisherCounts[normalized].count++;
      if (!publisherCounts[normalized].originalNames.includes(article.sourceName)) {
        publisherCounts[normalized].originalNames.push(article.sourceName);
      }
    }
    
    const sortedPublishers = Object.entries(publisherCounts)
      .map(([publisher, data]) => ({ publisher, ...data }))
      .sort((a, b) => b.count - a.count);
    
    return NextResponse.json({
      totalArticles: articles.length,
      normalizationExamples,
      publisherCounts: sortedPublishers,
      proof: {
        description: "BBC World, BBC News, BBC Middle East, BBC Asia all normalize to 'BBC'",
        bbcExample: {
          originalNames: sortedPublishers.find(p => p.publisher === 'BBC')?.originalNames || [],
          totalArticles: sortedPublishers.find(p => p.publisher === 'BBC')?.count || 0,
        }
      }
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
