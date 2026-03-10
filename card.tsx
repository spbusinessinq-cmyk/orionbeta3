import { NextResponse } from "next/server";

// Simplified clustering debug to check fallback merge

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'for', 'in', 'on', 'with', 'from',
  'after', 'before', 'says', 'report', 'reports', 'update', 'live', 'breaking',
  'latest', 'new', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'news', 'article', 'according', 'told', 'tells', 'say'
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
  return words.filter(w => !STOP_WORDS.has(w) && w.length > 2);
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

function titleSimilarity(title1: string, title2: string): number {
  const tokens1 = new Set(removeStopWords(title1));
  const tokens2 = new Set(removeStopWords(title2));
  
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  const intersection = Array.from(tokens1).filter(x => tokens2.has(x));
  const unionSize = new Set([...Array.from(tokens1), ...Array.from(tokens2)]).size;
  
  return unionSize > 0 ? intersection.length / unionSize : 0;
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

export async function GET() {
  try {
    const response = await fetch('http://localhost:3000/api/rss', { cache: 'no-store' });
    const data = await response.json();
    const articles: Article[] = data.articles || [];
    
    // Find similar article pairs
    const similarPairs: Array<{
      title1: string;
      title2: string;
      similarity: number;
      country1: string;
      country2: string;
      source1: string;
      source2: string;
    }> = [];
    
    const articlesWithCoords = articles.filter(a => a.lat && a.lng);
    
    for (let i = 0; i < Math.min(articlesWithCoords.length, 200); i++) {
      for (let j = i + 1; j < Math.min(articlesWithCoords.length, 200); j++) {
        const a1 = articlesWithCoords[i];
        const a2 = articlesWithCoords[j];
        
        const country1 = normalizeCountryKey(a1.locationLabel);
        const country2 = normalizeCountryKey(a2.locationLabel);
        
        // Skip if different countries
        if (country1 !== country2 && country1 !== 'unknown' && country2 !== 'unknown') continue;
        
        const similarity = titleSimilarity(a1.title, a2.title);
        
        if (similarity >= 0.50) {
          similarPairs.push({
            title1: a1.title.substring(0, 60),
            title2: a2.title.substring(0, 60),
            similarity: Math.round(similarity * 100) / 100,
            country1,
            country2,
            source1: a1.sourceName,
            source2: a2.sourceName,
          });
        }
      }
    }
    
    // Sort by similarity
    similarPairs.sort((a, b) => b.similarity - a.similarity);
    
    return NextResponse.json({
      totalArticles: articles.length,
      articlesWithCoords: articlesWithCoords.length,
      pairsAboveThreshold: similarPairs.length,
      topSimilarPairs: similarPairs.slice(0, 20),
      pairsAt70: similarPairs.filter(p => p.similarity >= 0.70).length,
      pairsAt60: similarPairs.filter(p => p.similarity >= 0.60).length,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
