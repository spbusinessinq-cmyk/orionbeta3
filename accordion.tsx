import { NextRequest, NextResponse } from "next/server";
import { classifyTopic, generateArticleId, classifyCategory, isOsintRelevant } from "@/lib/news-store";

// Maximum raw articles to return (items with location labels sent to store)
const MAX_RAW_ARTICLES = 6000;
const MAX_FETCH_ARTICLES = 9000;

// Expanded RSS sources for maximum cross-publisher overlap
const RSS_SOURCES = [
  // === WIRE SERVICES (highest overlap) ===
  // Reuters
  { id: "reuters-world", name: "Reuters World", url: "https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best", isAggregator: false },
  { id: "reuters-top", name: "Reuters Top News", url: "https://www.reutersagency.com/feed/?post_type=best", isAggregator: false },
  
  // AP News
  { id: "ap-world", name: "AP World News", url: "https://feeds.apnews.com/rss/worldnews", isAggregator: false },
  { id: "ap-top", name: "AP Top News", url: "https://feeds.apnews.com/rss/apf-topnews", isAggregator: false },
  { id: "ap-politics", name: "AP Politics", url: "https://feeds.apnews.com/rss/apf-politics", isAggregator: false },
  { id: "ap-business", name: "AP Business", url: "https://feeds.apnews.com/rss/apf-business", isAggregator: false },
  { id: "ap-science", name: "AP Science", url: "https://feeds.apnews.com/rss/apf-science", isAggregator: false },
  { id: "ap-health", name: "AP Health", url: "https://feeds.apnews.com/rss/apf-health", isAggregator: false },
  { id: "ap-us", name: "AP US News", url: "https://feeds.apnews.com/rss/apf-usnews", isAggregator: false },
  
  // AFP (if accessible)
  { id: "afp", name: "AFP News", url: "https://www.afp.com/en/rss/feed", isAggregator: false },
  
  // === MAJOR PUBLISHERS ===
  // BBC feeds
  { id: "bbc-world", name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", isAggregator: false },
  { id: "bbc-news", name: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml", isAggregator: false },
  { id: "bbc-uk", name: "BBC UK", url: "https://feeds.bbci.co.uk/news/uk/rss.xml", isAggregator: false },
  { id: "bbc-us-canada", name: "BBC US/Canada", url: "https://feeds.bbci.co.uk/news/us_and_canada/rss.xml", isAggregator: false },
  { id: "bbc-middle-east", name: "BBC Middle East", url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", isAggregator: false },
  { id: "bbc-asia", name: "BBC Asia", url: "https://feeds.bbci.co.uk/news/world/asia/rss.xml", isAggregator: false },
  { id: "bbc-europe", name: "BBC Europe", url: "https://feeds.bbci.co.uk/news/world/europe/rss.xml", isAggregator: false },
  
  // Guardian feeds
  { id: "guardian-world", name: "Guardian World", url: "https://www.theguardian.com/world/rss", isAggregator: false },
  { id: "guardian-us", name: "Guardian US", url: "https://www.theguardian.com/us-news/rss", isAggregator: false },
  { id: "guardian-uk", name: "Guardian UK", url: "https://www.theguardian.com/uk-news/rss", isAggregator: false },
  { id: "guardian-politics", name: "Guardian Politics", url: "https://www.theguardian.com/politics/rss", isAggregator: false },
  
  // NPR feeds
  { id: "npr-world", name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml", isAggregator: false },
  { id: "npr-news", name: "NPR News", url: "https://feeds.npr.org/1001/rss.xml", isAggregator: false },
  { id: "npr-politics", name: "NPR Politics", url: "https://feeds.npr.org/1014/rss.xml", isAggregator: false },
  
  // CNN feeds
  { id: "cnn-world", name: "CNN World", url: "http://rss.cnn.com/rss/edition_world.rss", isAggregator: false },
  { id: "cnn-top", name: "CNN Top Stories", url: "http://rss.cnn.com/rss/edition.rss", isAggregator: false },
  { id: "cnn-us", name: "CNN US", url: "http://rss.cnn.com/rss/edition_us.rss", isAggregator: false },
  { id: "cnn-politics", name: "CNN Politics", url: "http://rss.cnn.com/rss/cnn_allpolitics.rss", isAggregator: false },
  
  // Other major sources
  { id: "dw", name: "DW News", url: "https://rss.dw.com/rdf/rss-en-all", isAggregator: false },
  { id: "france24", name: "France 24", url: "https://www.france24.com/en/rss", isAggregator: false },
  { id: "nhk-world", name: "NHK World", url: "https://www3.nhk.or.jp/rss/news/cat0.xml", isAggregator: false },
  { id: "abc-news", name: "ABC News", url: "https://abcnews.go.com/abcnews/topstories.rss", isAggregator: false },
  { id: "abc-intl", name: "ABC International", url: "https://abcnews.go.com/abcnews/internationalheadlines.rss", isAggregator: false },
  
  // Regional
  { id: "jpost", name: "Jerusalem Post", url: "https://www.jpost.com/rss/rssfeedsheadlines", isAggregator: false },
  { id: "arab-news", name: "Arab News", url: "https://www.arabnews.com/rss.xml", isAggregator: false },
  { id: "times-india", name: "Times of India", url: "https://timesofindia.indiatimes.com/rssfeeds/296589292.cms", isAggregator: false },
  { id: "hindu", name: "The Hindu", url: "https://www.thehindu.com/news/international/feeder/default.rss", isAggregator: false },
  
  // === AGGREGATORS (topic feeds for overlap) ===
  // Google News topics - flagged as aggregators
  { id: "google-world", name: "Google News World", url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB", isAggregator: true },
  { id: "google-us", name: "Google News US", url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB", isAggregator: true },
  { id: "google-business", name: "Google News Business", url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGxqTjNjd0FtVnVHZ0pWVXlnQVAB", isAggregator: true },
  { id: "google-tech", name: "Google News Technology", url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB", isAggregator: true },
  { id: "google-mideast", name: "Google News Middle East", url: "https://news.google.com/rss/search?q=middle+east&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-europe", name: "Google News Europe", url: "https://news.google.com/rss/search?q=europe&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-iran", name: "Google News Iran", url: "https://news.google.com/rss/search?q=iran&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-ukraine", name: "Google News Ukraine", url: "https://news.google.com/rss/search?q=ukraine&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-china", name: "Google News China", url: "https://news.google.com/rss/search?q=china&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // === TARGETED COVERAGE EXPANSION (high location-label yield) ===
  { id: "google-russia", name: "Google News Russia", url: "https://news.google.com/rss/search?q=russia+war&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-israel-gaza", name: "Google News Israel/Gaza", url: "https://news.google.com/rss/search?q=israel+gaza+war&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-africa", name: "Google News Africa", url: "https://news.google.com/rss/search?q=africa&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "aljazeera-world", name: "Al Jazeera English", url: "https://www.aljazeera.com/xml/rss/all.xml", isAggregator: false },
  // === SECOND EXPANSION: HIGH-YIELD GEOPOLITICAL SOURCES ===
  // Voice of America — excellent location-specific coverage across regions
  { id: "voa-world", name: "VOA World", url: "https://www.voanews.com/api/zrqpov$oyog", isAggregator: false },
  { id: "voa-africa", name: "VOA Africa", url: "https://www.voaafrica.com/api/zmgqpm$ttge", isAggregator: false },
  // Radio Free Europe / Radio Liberty — Eastern Europe, Central Asia, Middle East
  { id: "rfe-frontline", name: "RFE/RL Frontline", url: "https://www.rferl.org/api/z_yqrsmqt", isAggregator: false },
  // Middle East Eye — strong ME/North Africa coverage
  { id: "mee-latest", name: "Middle East Eye", url: "https://www.middleeasteye.net/rss", isAggregator: false },
  // Dawn (Pakistan) — South Asia specialist
  { id: "dawn-pk", name: "Dawn Pakistan", url: "https://www.dawn.com/feeds/home", isAggregator: false },
  // Kyiv Independent — Ukraine-specific depth
  { id: "kyiv-independent", name: "Kyiv Independent", url: "https://kyivindependent.com/rss/", isAggregator: false },
  // Haaretz English — Israel/Palestine depth
  { id: "haaretz", name: "Haaretz", url: "https://www.haaretz.com/cmlink/1.4985331", isAggregator: false },
  // South China Morning Post — Asia/China depth
  { id: "scmp-world", name: "SCMP World", url: "https://www.scmp.com/rss/91/feed", isAggregator: false },
  // Google News targeted conflict/crisis feeds (high yield for location-labelled events)
  { id: "google-myanmar", name: "Google News Myanmar", url: "https://news.google.com/rss/search?q=myanmar+conflict&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-sudan", name: "Google News Sudan", url: "https://news.google.com/rss/search?q=sudan+war&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-taiwan", name: "Google News Taiwan Strait", url: "https://news.google.com/rss/search?q=taiwan+strait+china&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-venezuela", name: "Google News Venezuela", url: "https://news.google.com/rss/search?q=venezuela+maduro&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-nkorea", name: "Google News North Korea", url: "https://news.google.com/rss/search?q=north+korea&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-drc", name: "Google News DRC", url: "https://news.google.com/rss/search?q=congo+DRC+conflict&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-pakistan", name: "Google News Pakistan", url: "https://news.google.com/rss/search?q=pakistan+imran+khan&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-sahel", name: "Google News Sahel", url: "https://news.google.com/rss/search?q=sahel+mali+niger+burkina&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // === THIRD EXPANSION: BBC REGIONAL + CRISIS-ZONE GOOGLE FEEDS ===
  { id: "bbc-africa", name: "BBC Africa", url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", isAggregator: false },
  { id: "bbc-latam", name: "BBC Latin America", url: "https://feeds.bbci.co.uk/news/world/latin_america/rss.xml", isAggregator: false },
  { id: "times-of-israel", name: "Times of Israel", url: "https://www.timesofisrael.com/feed/", isAggregator: false },
  { id: "google-iran-nuclear", name: "Google News Iran Nuclear", url: "https://news.google.com/rss/search?q=iran+nuclear+sanctions&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-iran-war", name: "Google News Iran War Strikes", url: "https://news.google.com/rss/search?q=israel+iran+war+strikes+2026&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-iran-retaliation", name: "Google News Iran Retaliation", url: "https://news.google.com/rss/search?q=iran+retaliation+missile+ballistic&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-hormuz-crisis", name: "Google News Hormuz Crisis", url: "https://news.google.com/rss/search?q=hormuz+iran+strait+closure+shipping&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-india-china", name: "Google News India-China", url: "https://news.google.com/rss/search?q=india+china+border+lac&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-ethiopia", name: "Google News Ethiopia", url: "https://news.google.com/rss/search?q=ethiopia+conflict+tigray&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-haiti", name: "Google News Haiti", url: "https://news.google.com/rss/search?q=haiti+gang+crisis&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-libya", name: "Google News Libya", url: "https://news.google.com/rss/search?q=libya+conflict+tripoli&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-korea-s", name: "Google News Korea", url: "https://news.google.com/rss/search?q=north+korea+south+korea+military&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-armenia-az", name: "Google News Armenia-Azerbaijan", url: "https://news.google.com/rss/search?q=armenia+azerbaijan+nagorno&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-serbia-kosovo", name: "Google News Serbia-Kosovo", url: "https://news.google.com/rss/search?q=serbia+kosovo+balkans&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // === FOURTH EXPANSION: CONFLICT ZONE DEPTH + GLOBAL COVERAGE ===
  // Yemen / Red Sea / Houthi
  { id: "google-yemen", name: "Google News Yemen", url: "https://news.google.com/rss/search?q=yemen+houthi+war&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  { id: "google-redsea", name: "Google News Red Sea", url: "https://news.google.com/rss/search?q=red+sea+houthi+shipping+attack&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Syria
  { id: "google-syria", name: "Google News Syria", url: "https://news.google.com/rss/search?q=syria+war+rebels&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Afghanistan
  { id: "google-afghanistan", name: "Google News Afghanistan", url: "https://news.google.com/rss/search?q=afghanistan+taliban&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Somalia / Al-Shabaab
  { id: "google-somalia", name: "Google News Somalia", url: "https://news.google.com/rss/search?q=somalia+alshabaab+conflict&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Iraq
  { id: "google-iraq", name: "Google News Iraq", url: "https://news.google.com/rss/search?q=iraq+militia+iran&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Lebanon / Hezbollah
  { id: "google-lebanon", name: "Google News Lebanon", url: "https://news.google.com/rss/search?q=lebanon+hezbollah&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // South Sudan
  { id: "google-southsudan", name: "Google News South Sudan", url: "https://news.google.com/rss/search?q=south+sudan+conflict&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Mozambique / ISCAP
  { id: "google-mozambique", name: "Google News Mozambique", url: "https://news.google.com/rss/search?q=mozambique+cabo+delgado+insurgency&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Kashmir / India-Pakistan
  { id: "google-kashmir", name: "Google News Kashmir", url: "https://news.google.com/rss/search?q=kashmir+india+pakistan+border&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Belarus
  { id: "google-belarus", name: "Google News Belarus", url: "https://news.google.com/rss/search?q=belarus+lukashenko&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Sanctions / OFAC
  { id: "google-sanctions", name: "Google News Sanctions", url: "https://news.google.com/rss/search?q=sanctions+iran+russia+regime&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Espionage / Intelligence
  { id: "google-intel", name: "Google News Intelligence", url: "https://news.google.com/rss/search?q=espionage+spy+intelligence+agency&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Nuclear proliferation
  { id: "google-nuclear", name: "Google News Nuclear", url: "https://news.google.com/rss/search?q=nuclear+weapon+missile+icbm+proliferation&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Colombia / FARC / ELN
  { id: "google-colombia", name: "Google News Colombia", url: "https://news.google.com/rss/search?q=colombia+farc+eln+conflict&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Haiti
  { id: "google-haiti-gangs", name: "Google News Haiti Crisis", url: "https://news.google.com/rss/search?q=haiti+gang+ariel+henry+crisis&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Israel-Palestine deeper
  { id: "google-westbank", name: "Google News West Bank", url: "https://news.google.com/rss/search?q=west+bank+settlers+idf+palestinians&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // South China Sea
  { id: "google-scs", name: "Google News South China Sea", url: "https://news.google.com/rss/search?q=south+china+sea+philippines+vessels&hl=en-US&gl=US&ceid=US:en", isAggregator: true },
  // Specialized publishers
  { id: "rfe-ukraine", name: "RFE/RL Ukraine", url: "https://www.rferl.org/api/z_yqrsmqt_ukraine", isAggregator: false },
  { id: "new-arab", name: "The New Arab", url: "https://www.newarab.com/rss", isAggregator: false },
  { id: "africa-report", name: "The Africa Report", url: "https://www.theafricareport.com/feed/", isAggregator: false },
  { id: "eurasianet", name: "Eurasianet", url: "https://eurasianet.org/feed", isAggregator: false },
  { id: "defensenews", name: "Defense News", url: "https://www.defensenews.com/arc/outboundfeeds/rss/", isAggregator: false },
  { id: "fp-world", name: "Foreign Policy", url: "https://foreignpolicy.com/feed/", isAggregator: false },
];

const CORS_PROXIES = [
  "https://api.allorigins.win/raw?url=",
  "https://corsproxy.io/?",
];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];

// === LOCATION EXTRACTION V3 ===
// Context-first matching with confidence scoring + aboutness detection
// Returns structured result with confidence level and placement metadata

type LocationPrecision = "city" | "state" | "country" | "region" | "none";
type LocationReason =
  | "dateline"
  | "preposition"
  | "comma_state"
  | "explicit_country"
  | "subject_match"
  | "fallback"
  | "rejected_ambiguous"
  | "rejected_low_confidence"
  | "rejected_not_about"
  | "no_match";

interface LocationResult {
  label: string | null;
  precision: LocationPrecision;
  confidence: 0 | 1 | 2 | 3;  // 3=strong, 2=medium, 1=weak, 0=none
  reason: LocationReason;
  matchedToken?: string;
  debug?: string;  // Debug info for placement quality
}

// Helper: escape regex special characters
function escapeReg(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholeToken(textLower: string, tokenLower: string): boolean {
  return new RegExp(`\\b${escapeReg(tokenLower)}\\b`, 'i').test(textLower);
}

// Multi-word phrase match that tolerates punctuation between words:
// "DR Congo", "DR. Congo", "DR-Congo", "DR  Congo" all match "dr congo"
function hasWholePhrase(textLower: string, phraseLower: string): boolean {
  const parts = phraseLower.trim().split(/\s+/).map(escapeReg);
  // allow punctuation/whitespace between parts
  const sep = `[\\s\\u00A0\\-.,/()]*`;
  return new RegExp(`\\b${parts.join(sep)}\\b`, 'i').test(textLower);
}

function matchKey(textLower: string, key: string): boolean {
  const k = key.toLowerCase();
  return k.includes(' ') ? hasWholePhrase(textLower, k) : hasWholeToken(textLower, k);
}

// Multi-word countries that must be handled explicitly (avoid "Congo" ambiguity)
const MULTI_WORD_COUNTRIES: Map<string, string> = new Map([
  ['dr congo', 'Democratic Republic of the Congo'],
  ['drc', 'Democratic Republic of the Congo'],
  ['democratic republic of the congo', 'Democratic Republic of the Congo'],
  ['democratic republic of congo', 'Democratic Republic of the Congo'],
  ['republic of the congo', 'Republic of the Congo'],
  ['congo-brazzaville', 'Republic of the Congo'],
  ['congo brazzaville', 'Republic of the Congo'],
]);

// AMBIGUOUS_TOKENS - single words that cause false positives
const AMBIGUOUS_TOKENS = new Set([
  'georgia', 'jordan', 'turkey',
  'congo',
  'may', 'march', 'june', 'august',
  'austin', 'washington', 'victoria', 'regina', 'alexandria', 'athens',
  'phoenix', 'dallas', 'houston', 'lincoln', 'jackson', 'madison',
  'franklin', 'clinton', 'greenville', 'springfield', 'georgetown',
  'burlington', 'rochester', 'salem', 'ashland', 'richmond',
]);

// Unambiguous major cities (safe to match without strong context)
const UNAMBIGUOUS_CITIES: Map<string, { city: string; country: string }> = new Map([
  // Format: "lowercase_match" => { city: "Display Name", country: "CC" }
  ["tehran", { city: "Tehran", country: "IR" }],
  ["beijing", { city: "Beijing", country: "CN" }],
  ["shanghai", { city: "Shanghai", country: "CN" }],
  ["hong kong", { city: "Hong Kong", country: "HK" }],
  ["tokyo", { city: "Tokyo", country: "JP" }],
  ["seoul", { city: "Seoul", country: "KR" }],
  ["pyongyang", { city: "Pyongyang", country: "KP" }],
  ["taipei", { city: "Taipei", country: "TW" }],
  ["moscow", { city: "Moscow", country: "RU" }],
  ["kyiv", { city: "Kyiv", country: "UA" }],
  ["kiev", { city: "Kyiv", country: "UA" }],
  ["jerusalem", { city: "Jerusalem", country: "IL" }],
  ["tel aviv", { city: "Tel Aviv", country: "IL" }],
  ["cairo", { city: "Cairo", country: "EG" }],
  ["baghdad", { city: "Baghdad", country: "IQ" }],
  ["damascus", { city: "Damascus", country: "SY" }],
  ["dubai", { city: "Dubai", country: "AE" }],
  ["riyadh", { city: "Riyadh", country: "SA" }],
  ["karachi", { city: "Karachi", country: "PK" }],
  ["islamabad", { city: "Islamabad", country: "PK" }],
  ["new delhi", { city: "Delhi", country: "IN" }],
  ["mumbai", { city: "Mumbai", country: "IN" }],
  ["kabul", { city: "Kabul", country: "AF" }],
  ["singapore", { city: "Singapore", country: "SG" }],
  ["bangkok", { city: "Bangkok", country: "TH" }],
  ["jakarta", { city: "Jakarta", country: "ID" }],
  ["manila", { city: "Manila", country: "PH" }],
  ["london", { city: "London", country: "UK" }],
  ["paris", { city: "Paris", country: "FR" }],
  ["berlin", { city: "Berlin", country: "DE" }],
  ["brussels", { city: "Brussels", country: "BE" }],
  ["amsterdam", { city: "Amsterdam", country: "NL" }],
  ["geneva", { city: "Geneva", country: "CH" }],
  ["zurich", { city: "Zurich", country: "CH" }],
  ["vienna", { city: "Vienna", country: "AT" }],
  ["rome", { city: "Rome", country: "IT" }],
  ["madrid", { city: "Madrid", country: "ES" }],
  ["barcelona", { city: "Barcelona", country: "ES" }],
  ["lisbon", { city: "Lisbon", country: "PT" }],
  ["athens", { city: "Athens", country: "GR" }],
  ["ankara", { city: "Ankara", country: "TR" }],
  ["istanbul", { city: "Istanbul", country: "TR" }],
  ["beirut", { city: "Beirut", country: "LB" }],
  ["doha", { city: "Doha", country: "QA" }],
  ["abu dhabi", { city: "Abu Dhabi", country: "AE" }],
  ["sanaa", { city: "Sanaa", country: "YE" }],
  ["lagos", { city: "Lagos", country: "NG" }],
  ["nairobi", { city: "Nairobi", country: "KE" }],
  ["johannesburg", { city: "Johannesburg", country: "ZA" }],
  ["cape town", { city: "Cape Town", country: "ZA" }],
  ["sydney", { city: "Sydney", country: "AU" }],
  ["melbourne", { city: "Melbourne", country: "AU" }],
  ["toronto", { city: "Toronto", country: "CA" }],
  ["montreal", { city: "Montreal", country: "CA" }],
  ["vancouver", { city: "Vancouver", country: "CA" }],
  ["mexico city", { city: "Mexico City", country: "MX" }],
  ["buenos aires", { city: "Buenos Aires", country: "AR" }],
  ["sao paulo", { city: "Sao Paulo", country: "BR" }],
  ["rio de janeiro", { city: "Rio de Janeiro", country: "BR" }],
  ["caracas", { city: "Caracas", country: "VE" }],
  ["havana", { city: "Havana", country: "CU" }],
  // DC is unambiguous
  ["washington dc", { city: "Washington DC", country: "US" }],
  ["washington d.c.", { city: "Washington DC", country: "US" }],
  ["washington, d.c.", { city: "Washington DC", country: "US" }],
  // US national-security institutions → Washington DC / Virginia
  ["the pentagon", { city: "Washington DC", country: "US" }],
  ["pentagon officials", { city: "Washington DC", country: "US" }],
  ["state department", { city: "Washington DC", country: "US" }],
  ["white house", { city: "Washington DC", country: "US" }],
  ["national security council", { city: "Washington DC", country: "US" }],
  ["cia headquarters", { city: "Washington DC", country: "US" }],
  ["langley", { city: "Washington DC", country: "US" }],
  // Conflict-zone African capitals
  ["khartoum", { city: "Khartoum", country: "SD" }],
  ["addis ababa", { city: "Addis Ababa", country: "ET" }],
  ["mogadishu", { city: "Mogadishu", country: "SO" }],
  ["asmara", { city: "Asmara", country: "ER" }],
  ["juba", { city: "Juba", country: "SS" }],
  ["bamako", { city: "Bamako", country: "ML" }],
  ["niamey", { city: "Niamey", country: "NE" }],
  ["ouagadougou", { city: "Ouagadougou", country: "BF" }],
  ["ndjamena", { city: "N'Djamena", country: "TD" }],
  ["bangui", { city: "Bangui", country: "CF" }],
  ["tripoli", { city: "Tripoli", country: "LY" }],
  ["benghazi", { city: "Benghazi", country: "LY" }],
  ["kinshasa", { city: "Kinshasa", country: "CD" }],
  ["port-au-prince", { city: "Port-au-Prince", country: "HT" }],
  ["port au prince", { city: "Port-au-Prince", country: "HT" }],
  ["bogota", { city: "Bogota", country: "CO" }],
  ["bogotá", { city: "Bogota", country: "CO" }],
  ["minsk", { city: "Minsk", country: "BY" }],
  ["belgrade", { city: "Belgrade", country: "RS" }],
  ["yerevan", { city: "Yerevan", country: "AM" }],
  ["baku", { city: "Baku", country: "AZ" }],
  // Conflict cities in existing regions
  ["mosul", { city: "Mosul", country: "IQ" }],
  ["basra", { city: "Basra", country: "IQ" }],
  ["aleppo", { city: "Aleppo", country: "SY" }],
  ["homs", { city: "Homs", country: "SY" }],
  ["idlib", { city: "Idlib", country: "SY" }],
  ["mariupol", { city: "Mariupol", country: "UA" }],
  ["kharkiv", { city: "Kharkiv", country: "UA" }],
  ["zaporizhzhia", { city: "Zaporizhzhia", country: "UA" }],
  ["odesa", { city: "Odesa", country: "UA" }],
  ["odessa", { city: "Odesa", country: "UA" }],
  ["donetsk", { city: "Donetsk", country: "UA" }],
  ["ramallah", { city: "Ramallah", country: "PS" }],
  ["rafah", { city: "Rafah", country: "PS" }],
  ["khan younis", { city: "Khan Younis", country: "PS" }],
  ["aden", { city: "Aden", country: "YE" }],
  ["marib", { city: "Marib", country: "YE" }],
  ["lahore", { city: "Lahore", country: "PK" }],
  ["peshawar", { city: "Peshawar", country: "PK" }],
  ["dhaka", { city: "Dhaka", country: "BD" }],
  ["colombo", { city: "Colombo", country: "LK" }],
  ["kathmandu", { city: "Kathmandu", country: "NP" }],
  ["naypyidaw", { city: "Naypyidaw", country: "MM" }],
  ["yangon", { city: "Yangon", country: "MM" }],
  ["kandahar", { city: "Kandahar", country: "AF" }],
]);

// Unambiguous countries - safe to match with moderate context
const UNAMBIGUOUS_COUNTRIES: Map<string, string> = new Map([
  ["iran", "Iran"], ["iranian", "Iran"],
  ["israel", "Israel"], ["israeli", "Israel"],
  ["ukraine", "Ukraine"], ["ukrainian", "Ukraine"],
  ["russia", "Russia"], ["russian", "Russia"],
  ["china", "China"], ["chinese", "China"],
  ["north korea", "North Korea"],
  ["south korea", "South Korea"],
  ["afghanistan", "Afghanistan"],
  ["pakistan", "Pakistan"],
  ["syria", "Syria"], ["syrian", "Syria"],
  ["yemen", "Yemen"],
  ["saudi arabia", "Saudi Arabia"],
  ["egypt", "Egypt"], ["egyptian", "Egypt"],
  ["iraq", "Iraq"],
  ["gaza", "Gaza"],
  ["palestinian", "Gaza"], ["palestine", "Gaza"],
  ["taiwan", "Taiwan"], ["taiwanese", "Taiwan"],
  ["myanmar", "Myanmar"],
  ["somalia", "Somalia"],
  ["sudan", "Sudan"],
  ["ethiopia", "Ethiopia"],
  ["venezuela", "Venezuela"],
  ["cuba", "Cuba"],
  ["argentina", "Argentina"],
  ["brazil", "Brazil"], ["brazilian", "Brazil"],
  ["australia", "Australia"], ["australian", "Australia"],
  ["new zealand", "New Zealand"],
  ["japan", "Japan"], ["japanese", "Japan"],
  ["germany", "Germany"], ["german", "Germany"],
  ["france", "France"], ["french", "France"],
  ["italy", "Italy"], ["italian", "Italy"],
  ["spain", "Spain"], ["spanish", "Spain"],
  ["poland", "Polish"], ["polish", "Poland"],
  ["sweden", "Sweden"], ["swedish", "Sweden"],
  ["netherlands", "Netherlands"], ["dutch", "Netherlands"],
  // Real countries that were incorrectly rejected before
  ["india", "India"], ["indian", "India"],
  ["lebanon", "Lebanon"], ["lebanese", "Lebanon"],
  ["libyan", "Libya"], ["libya", "Libya"],
  ["somalian", "Somalia"], ["somali", "Somalia"],
  ["yemeni", "Yemen"],
  ["iraqi", "Iraq"],
  ["afghan", "Afghanistan"],
  ["haitian", "Haiti"], ["haiti", "Haiti"],
  ["colombian", "Colombia"], ["colombia", "Colombia"],
  ["ethiopian", "Ethiopia"],
  ["sudanese", "Sudan"],
  ["eritrean", "Eritrea"], ["eritrea", "Eritrea"],
  ["malian", "Mali"], ["mali", "Mali"],
  ["nigerien", "Niger"],
  ["belarusian", "Belarus"], ["belarus", "Belarus"],
  ["armenian", "Armenia"], ["armenia", "Armenia"],
  ["azerbaijani", "Azerbaijan"], ["azerbaijan", "Azerbaijan"],
  ["serbian", "Serbia"], ["serbia", "Serbia"],
  ["bangladeshi", "Bangladesh"], ["bangladesh", "Bangladesh"],
  ["burmese", "Myanmar"],
  ["thai", "Thailand"], ["thailand", "Thailand"],
  ["vietnamese", "Vietnam"], ["vietnam", "Vietnam"],
  ["philippine", "Philippines"], ["philippine", "Philippines"],
  ["moroccan", "Morocco"], ["morocco", "Morocco"],
  ["algerian", "Algeria"], ["algeria", "Algeria"],
  // Note: Plain "congo" is in AMBIGUOUS_TOKENS - use specific forms in MULTI_WORD_COUNTRIES
]);

// Ambiguous countries - need strong context (confidence 3)
// ONLY truly ambiguous country names that are ALSO common US places/names
const AMBIGUOUS_COUNTRIES = new Set([
  'turkey', 'turkish',  // Also a bird and common word
  'jordan',  // Also a common name
  'georgia',  // Also a US state
]);

// US State abbreviations (2-letter) - ONLY valid after comma
const US_STATE_ABBREV: Map<string, string> = new Map([
  ["TX", "Texas"], ["CA", "California"], ["FL", "Florida"], ["NY", "New York"],
  ["PA", "Pennsylvania"], ["IL", "Illinois"], ["OH", "Ohio"], ["GA", "Georgia"],
  ["NC", "North Carolina"], ["MI", "Michigan"], ["VA", "Virginia"], ["AZ", "Arizona"],
  ["WA", "Washington"], ["CO", "Colorado"], ["MA", "Massachusetts"], ["NV", "Nevada"],
  ["OR", "Oregon"], ["TN", "Tennessee"], ["MD", "Maryland"], ["MN", "Minnesota"],
  ["WI", "Wisconsin"], ["MO", "Missouri"], ["LA", "Louisiana"], ["AL", "Alabama"],
  ["KY", "Kentucky"], ["SC", "South Carolina"], ["OK", "Oklahoma"], ["CT", "Connecticut"],
  ["UT", "Utah"], ["IA", "Iowa"], ["NJ", "New Jersey"], ["KS", "Kansas"],
  ["AR", "Arkansas"], ["MS", "Mississippi"], ["IN", "Indiana"], ["NM", "New Mexico"],
  ["HI", "Hawaii"], ["AK", "Alaska"], ["MT", "Montana"], ["ND", "North Dakota"],
  ["SD", "South Dakota"], ["WV", "West Virginia"], ["DE", "Delaware"], ["RI", "Rhode Island"],
  ["NH", "New Hampshire"], ["VT", "Vermont"], ["ME", "Maine"], ["ID", "Idaho"],
  ["NE", "Nebraska"], ["WY", "Wyoming"],
]);

// US State full names - need preposition context for ambiguous ones
const US_STATE_NAMES: Map<string, string> = new Map([
  ["texas", "Texas"], ["california", "California"], ["florida", "Florida"],
  ["pennsylvania", "Pennsylvania"], ["illinois", "Illinois"], ["ohio", "Ohio"],
  ["north carolina", "North Carolina"], ["michigan", "Michigan"], ["virginia", "Virginia"],
  ["arizona", "Arizona"], ["colorado", "Colorado"], ["massachusetts", "Massachusetts"],
  ["nevada", "Nevada"], ["tennessee", "Tennessee"], ["maryland", "Maryland"],
  ["minnesota", "Minnesota"], ["wisconsin", "Wisconsin"], ["missouri", "Missouri"],
  ["louisiana", "Louisiana"], ["alabama", "Alabama"], ["kentucky", "Kentucky"],
  ["south carolina", "South Carolina"], ["oklahoma", "Oklahoma"], ["connecticut", "Connecticut"],
  ["utah", "Utah"], ["iowa", "Iowa"], ["new jersey", "New Jersey"], ["kansas", "Kansas"],
  ["arkansas", "Arkansas"], ["mississippi", "Mississippi"], ["new mexico", "New Mexico"],
  ["hawaii", "Hawaii"], ["alaska", "Alaska"], ["montana", "Montana"],
  ["north dakota", "North Dakota"], ["south dakota", "South Dakota"],
  ["west virginia", "West Virginia"], ["delaware", "Delaware"], ["rhode island", "Rhode Island"],
  ["new hampshire", "New Hampshire"], ["vermont", "Vermont"], ["maine", "Maine"],
  ["idaho", "Idaho"], ["nebraska", "Nebraska"], ["wyoming", "Wyoming"],
  // Ambiguous - need context
  ["new york", "New York"], ["oregon", "Oregon"], ["washington", "Washington"],
  ["georgia", "Georgia"], ["indiana", "Indiana"],
]);

// Regions (always safe, low priority)
const REGIONS: Map<string, string> = new Map([
  ["europe", "Europe"], ["european", "Europe"],
  ["asia", "Asia"], ["asian", "Asia"],
  ["africa", "Africa"], ["african", "Africa"],
  ["middle east", "Middle East"],
]);

// === ABOUTNESS DETECTION ===
// Check if an article is actually ABOUT a location vs. just mentioning it
// Returns true if the article appears to be about the given country
function isArticleAboutCountry(text: string, countryKey: string): boolean {
  const lower = text.toLowerCase();
  
  // Normalize countryKey - handle common variations
  const normalizedKey = countryKey.toLowerCase().replace(/[^a-z]/g, '');
  
  // Demonym map: base country → demonym form
  const demonyms: Record<string, string> = {
    'iran': 'iranian', 'israel': 'israeli', 'russia': 'russian', 'china': 'chinese',
    'ukraine': 'ukrainian', 'syria': 'syrian', 'yemen': 'yemeni', 'lebanon': 'lebanese',
    'iraq': 'iraqi', 'egypt': 'egyptian', 'turkey': 'turkish', 'saudi': 'saudi',
    'gaza': 'palestinian', 'palestine': 'palestinian', 'northkorea': 'north korean',
    'southkorea': 'south korean', 'afghanistan': 'afghan', 'pakistan': 'pakistani',
    'india': 'indian', 'japan': 'japanese', 'germany': 'german', 'france': 'french',
    'turkey': 'turkish', 'georgia': 'georgian', 'jordan': 'jordanian',
  };
  
  // Reverse map: demonym → base country (for when key IS the demonym)
  const reverseDemonyms: Record<string, string> = {};
  for (const [base, dem] of Object.entries(demonyms)) {
    reverseDemonyms[dem.replace(/\s+/g, '')] = base;
  }
  
  // Determine both base country form and demonym form
  let baseCountry = normalizedKey;
  let demonym = demonyms[normalizedKey] || '';
  
  // If the key IS a demonym, find the base country form
  if (reverseDemonyms[normalizedKey]) {
    baseCountry = reverseDemonyms[normalizedKey];
    demonym = normalizedKey;
  }
  
  // Articles about a country typically have these patterns
  // The key is detecting when the COUNTRY is the SUBJECT, not just mentioned
  // NOTE: (?:'s)? handles possessive forms like "Iran's nuclear"
  // Uses baseCountry (normalized form) and demonym for matching
  const aboutPatterns = [
    // === GOVERNMENT/LEADERSHIP ===
    // "Iran's government/military/president..." or "Iran government"
    new RegExp(`\\b(${baseCountry}|${demonym})(?:'s)?\\s+(government|military|army|navy|air\\s*force|president|minister|parliament|court|election|regime|leadership|officials|authorities|forces|troops|border|capital|people|citizens|population|economy|currency|central\\s*bank)\\b`, 'i'),
    // "Government/military of Iran"
    new RegExp(`\\b(government|military|army|president|minister|parliament|court|election|regime|leadership|authorities|forces)\\s+(of|in)\\s+(${baseCountry}|${demonym})\\b`, 'i'),
    
    // === CONFLICT/WAR - COUNTRY AS LOCATION ===
    // "War in Iran", "Conflict in Iran", "Strikes on Iran"
    new RegExp(`\\b(war|conflict|invasion|occupation|offensive|campaign|operation|airstrikes?|bombing|attacks?|strikes?|missile|drone|offensive)\\s+(in|on|against|near)\\s+(${baseCountry}|${demonym})\\b`, 'i'),
    // "Iran war", "Iran conflict", "Iran invasion"
    new RegExp(`\\b(${baseCountry}|${demonym})(?:'s)?\\s+(war|conflict|crisis|invasion|occupation|offensive|campaign)\\b`, 'i'),
    // "Fighting in Iran", "Clashes in Iran"
    new RegExp(`\\b(fighting|clashes|violence|unrest|protests?|demonstrations?|uprising|revolt|revolution)\\s+(in|across)\\s+(${baseCountry}|${demonym})\\b`, 'i'),
    
    // === ACTION PATTERNS - COUNTRY AS SUBJECT ===
    // "Iran attacks/invades/strikes..." or "Israeli forces strike"
    new RegExp(`\\b(${baseCountry}|${demonym})(?:'s)?\\s+(attacks?|invades?|strikes?|bombards?|seizes?|captures?|launches?|fires?|threatens?|warns?|announces?|sanctions?|blocks?|bans?)\\b`, 'i'),
    // "Iranian/Israeli forces/troops/missiles attack/strike..."
    new RegExp(`\\b(${demonym})\\s+(forces?|troops?|military|army|guards?|fighters?|missiles?|drones?|authorities?|government)\\s+(attack|strike|fire|launch|seize|capture|threaten)\\b`, 'i'),
    
    // === DOMESTIC EVENTS ===
    // "Protests in Iran", "Election in Iran", "Crisis in Iran"
    new RegExp(`\\b(protests?|demonstrations?|elections?|crisis|disaster|earthquake|flood|fire|explosion|collapse|shortage|famine)\\s+(in|across)\\s+(${baseCountry}|${demonym})\\b`, 'i'),
    // "Iran protests", "Iran election", "Iran crisis"
    new RegExp(`\\b(${baseCountry}|${demonym})(?:'s)?\\s+(protests?|demonstrations?|elections?|crisis|disaster|earthquake|revolution)\\b`, 'i'),
    
    // === GEOGRAPHIC FEATURES ===
    // "Tehran, Iran" or "in southern Iran"
    new RegExp(`\\b(in|near|at|from|across)\\s+(?:the\\s+)?(?:\\w+\\s+)?(${baseCountry}|${demonym})\\s+(?:border|region|province|capital|city|coast|waters|territory)\\b`, 'i'),
    
    // === NEWS ABOUT COUNTRY'S ACTIONS ON WORLD STAGE ===
    // "Iran nuclear program", "Iran sanctions", "Iran's nuclear"
    new RegExp(`\\b(${baseCountry}|${demonym})(?:'s)?\\s+(nuclear|sanctions?|diplomat|ambassador|delegation|talks?|negotiations?|treaty|agreement|deal|program|programme|policy|policies)\\b`, 'i'),
    
    // === ECONOMIC/INFRASTRUCTURE ===
    // "Iran's economy", "Iran's currency", "Iran's inflation"
    new RegExp(`\\b(${baseCountry}|${demonym})(?:'s)?\\s+(economy|currency|inflation|gdp|stock\\s*market|bank|banks|financial|trade|exports?|imports?|oil|gas|energy|infrastructure)\\b`, 'i'),
    // "Economy of Iran", "Inflation in Iran"
    new RegExp(`\\b(economy|currency|inflation|gdp|stock\\s*market|financial|trade|exports?|imports?|oil|gas|energy|infrastructure)\\s+(of|in)\\s+(${baseCountry}|${demonym})\\b`, 'i'),
    
    // === DIPLOMATIC ===
    // "Iran's foreign minister", "Iran's delegation"
    new RegExp(`\\b(${baseCountry}|${demonym})(?:'s)?\\s+(foreign\\s*minister|diplomat|ambassador|delegation|envoy|spokesman|spokeswoman|foreign\\s*ministry|state\\s*department)\\b`, 'i'),
  ];
  
  for (const pattern of aboutPatterns) {
    if (pattern.test(lower)) return true;
  }
  
  return false;
}

// Check if article is U.S.-centric (about U.S. domestic affairs)
function isUSDomesticArticle(text: string): boolean {
  const lower = text.toLowerCase();
  
  // Strong indicators of U.S. domestic news
  const usDomesticPatterns = [
    /\b(congress|senate|house of representatives|supreme court|white house|federal reserve)\b/i,
    /\b(democrat|republican|democrats|republicans)\s+(senator|congressman|governor|legislature)?\b/i,
    /\b(senate|congress)\s+(bill|vote|hearing|committee)\b/i,
    /\b(u\.?s\.?|united states)\s+(economy|stock market|military|troops|forces)\b/i,
    /\b(american|u\.?s\.?)\s+(citizens|people|workers|voters|consumers)\b/i,
    /\b(irs|fbi|cia|nsa|fcc|ftc|sec|doj|department of)\b/i,
    /\b(state department|pentagon|capitol)\b/i,
    /\b(texas|california|florida|new york)\s+(governor|legislature|senate)\b/i,
  ];
  
  for (const pattern of usDomesticPatterns) {
    if (pattern.test(lower)) return true;
  }
  
  return false;
}

// Check if article is about international affairs (not U.S. domestic)
function isInternationalArticle(text: string): boolean {
  const lower = text.toLowerCase();
  
  // Indicators of international news
  const internationalPatterns = [
    /\b(war|conflict|invasion|ceasefire|peace talks|summit|treaty|sanctions)\b/i,
    /\b(strikes|attacks|bombing|missile|airstrike)\s+(in|on|near)\b/i,
    /\b(embassy|ambassador|diplomat|consulate)\b/i,
    /\b(united nations|un security council|nato|eu|g7|g20)\b/i,
    /\b(humanitarian|refugees|displaced)\s+(crisis|aid)\b/i,
  ];
  
  for (const pattern of internationalPatterns) {
    if (pattern.test(lower)) return true;
  }
  
  return false;
}

// Publisher / newsroom name patterns to strip from article text before location extraction.
// These publisher phrases must NEVER survive as geographic signals.
// Order: longest / most specific first to prevent partial matches.
const NEWSROOM_STRIP_PATTERNS: RegExp[] = [
  // Full masthead names — strip entire phrase so "New York" never leaks from "New York Times"
  /\bNew\s+York\s+Times\b/gi,
  /\bNew\s+York\s+Post\b/gi,
  /\bNew\s+York\s+Daily\s+News\b/gi,
  /\bNew\s+York\s+Magazine\b/gi,
  /\bNew\s+York\s+Review\b/gi,
  /\bWashington\s+Post\b/gi,
  /\bWashington\s+Examiner\b/gi,
  /\bWashington\s+Times\b/gi,
  /\bWashington\s+Free\s+Beacon\b/gi,
  /\bWall\s+Street\s+Journal\b/gi,
  /\bFinancial\s+Times\b/gi,
  /\bAssociated\s+Press\b/gi,
  /\bAl\s+Jazeera\b/gi,
  /\bSky\s+News\b/gi,
  /\bFox\s+News\b/gi,
  /\bABC\s+News\b/gi,
  /\bCBS\s+News\b/gi,
  /\bNBC\s+News\b/gi,
  /\bNBC\s+Universal\b/gi,
  /\bMSNBC\b/gi,
  /\bPolitico\b/gi,
  /\bAxios\b/gi,
  /\bHuffPost\b/gi,
  /\bHuffington\s+Post\b/gi,
  /\bBuzzFeed\b/gi,
  /\bBusiness\s+Insider\b/gi,
  /\bDaily\s+Beast\b/gi,
  /\bThe\s+Atlantic\b/gi,
  /\bNew\s+Yorker\b/gi,
  // Common short-form abbreviations used as publisher bylines
  /\bNYT\b/g,
  /\bWSJ\b/g,
  /\bWaPo\b/gi,
  /\bAPNews\b/gi,
  // Wire service byline patterns: "(Reuters)" "| Reuters" "— Reuters" "via Reuters"
  /\(Reuters\)/gi,
  /\s*[|—–-]\s*Reuters\b/gi,
  /\breported\s+by\s+Reuters\b/gi,
  /\bvia\s+Reuters\b/gi,
  // AP wire bylines
  /\(AP\)/g,
  /\(The\s+Associated\s+Press\)/gi,
  /\s*[|—–-]\s*\bAP\b/g,
  // Newsroom dateline / bureau references that embed city names
  /\bNew\s+York\s+bureau\b/gi,
  /\bWashington\s+bureau\b/gi,
  /\bNew\s+York\s+newsroom\b/gi,
  /\bWashington\s+newsroom\b/gi,
  // Generic source attribution fragments
  /\bsource:\s*(NYT|WaPo|Reuters|AP|CNN|BBC|FT|WSJ)\b/gi,
  /\breported\s+by\s+the\s+(New\s+York\s+Times|Washington\s+Post|Wall\s+Street\s+Journal|Financial\s+Times|Associated\s+Press)\b/gi,
  // Google News-style title suffix: "Article title - The New York Times"
  // Strip the " - Publisher" tail that appears at the end of aggregated article titles
  /\s*[-–—]\s+The\s+(New\s+York\s+Times|Washington\s+Post|Wall\s+Street\s+Journal|Financial\s+Times|Guardian|Independent|Telegraph|Atlantic)\s*$/gi,
  /\s*[-–—]\s+(Reuters|BBC|CNN|AP|Al\s+Jazeera|Sky\s+News|Fox\s+News|Politico|Axios)\s*$/gi,
  // Parenthetical publisher at end of title or beginning of description
  /\s*\(\s*(Reuters|AP|AFP|BBC|CNN)\s*\)\s*$/gi,
  /^\s*\(\s*(Reuters|AP|AFP|BBC|CNN)\s*\)\s*[-–—]?\s*/gi,
];

/**
 * Strip newsroom, publisher, and wire-service references from article text before location extraction.
 * This ensures "New York Times" never becomes a "New York" geo signal,
 * and "Washington Post" never becomes "Washington, DC".
 * Only strips publisher identifiers — genuine event geography is preserved.
 */
function stripNewsroomReferences(text: string): string {
  let result = text;
  for (const pattern of NEWSROOM_STRIP_PATTERNS) {
    result = result.replace(pattern, ' ');
  }
  // Collapse multiple spaces left by replacements
  return result.replace(/\s{2,}/g, ' ').trim();
}

// Foreign topic signal — article is primarily about a foreign country/conflict
// Returns true when strong foreign signals are present in the text
function hasClearForeignSignal(text: string): boolean {
  const lower = text.toLowerCase();
  const FOREIGN_SIGNALS = [
    /\b(iran|iranian|russia|russian|ukraine|ukrainian|china|chinese|israel|israeli|gaza|palestinian|syria|syrian|north korea|north korean|afghanistan|afghan|pakistan|pakistani|iraq|iraqi|lebanon|lebanese|yemen|yemeni|hamas|hezbollah|taiwan|taiwanese)\b/i,
    /\b(airstrike|missile strike|bombing|shelling|artillery|incursion|offensive|invasion|drone attack|rocket fire|military operation|ground operation|air defense)\s+(in|on|near|over|against)\b/i,
    /\b(war|conflict|ceasefire|humanitarian crisis)\s+(in|across|near)\s+[a-z]/i,
    /\b(sanctions against|sanctions on)\s+(iran|russia|china|north korea)\b/i,
    /\b(tel aviv|kyiv|kiev|moscow|tehran|beijing|shanghai|kabul|damascus|baghdad|beirut|gaza city|ramallah)\b/i,
  ];
  return FOREIGN_SIGNALS.some(p => p.test(lower));
}

// Check for dateline pattern: "CITY, COUNTRY —" or "CITY (COUNTRY) -"
function checkDateline(text: string): { city: string; country: string } | null {
  // Pattern: "KYIV, Ukraine —" or "PARIS, France -"
  const datelineIntl = text.match(/^([A-Z][a-zA-Z\s]+),\s*([A-Z][a-zA-Z\s]+)\s*[—–-]/);
  if (datelineIntl) {
    const city = datelineIntl[1].trim();
    const country = datelineIntl[2].trim();
    return { city, country };
  }
  return null;
}

// Check for comma-state pattern: "City, ST" where ST is valid state abbrev
function checkCommaState(text: string): { city: string; state: string } | null {
  // Pattern: "Austin, TX" or "Los Angeles, CA"
  const commaState = text.match(/\b([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\b/);
  if (commaState) {
    const city = commaState[1].trim();
    const abbrev = commaState[2].toUpperCase();
    const state = US_STATE_ABBREV.get(abbrev);
    if (state) {
      return { city, state };
    }
  }
  return null;
}

// Check for preposition context: "in <place>", "near <place>", "at <place>"
function hasPrepositionContext(text: string, token: string): boolean {
  const lower = text.toLowerCase();
  const tokenLower = token.toLowerCase();
  // Check for "in/near/at <token>"
  if (new RegExp(`\\b(in|near|at|from|to)\\s+${escapeReg(tokenLower)}\\b`, 'i').test(lower)) {
    return true;
  }
  // Check for "<token>'s" (possessive, e.g., "Turkey's president")
  // BUT reject if followed by person-reference words (king, queen, prince, leader, minister)
  const possessiveMatch = lower.match(new RegExp(`\\b${escapeReg(tokenLower)}'s\\s+(\\w+)`, 'i'));
  if (possessiveMatch) {
    const followingWord = possessiveMatch[1];
    // Person reference words - NOT country context
    // Expanded to include common person/office references
    const personWords = ['king', 'queen', 'prince', 'princess', 'president', 'pm',
                         'prime', 'minister', 'governor', 'mayor', 'senator',
                         'representative', 'rep', 'congressman', 'congresswoman',
                         'judge', 'lawyer', 'man', 'woman', 'teen', 'boy', 'girl',
                         'ambassador', 'delegation', 'envoy', 'royal', 'monarch', 'crown',
                         'leader', 'official', 'deputy', 'spokesperson', 'spokesman', 'spokeswoman'];
    if (personWords.includes(followingWord)) {
      return false; // This is a person reference, not country context
    }
    return true; // "Turkey's economy", "Jordan's border", etc. - country context
  }
  return false;
}

// Check for explicit country context: "Iranian", "in Iran", "Iran's", etc.
function hasExplicitCountryContext(text: string, country: string): boolean {
  const lower = text.toLowerCase();
  const countryLower = country.toLowerCase();

  // Known demonyms for countries (must be explicit, not generated)
  const countryDemonyms: Record<string, string[]> = {
    'iran': ['iranian'],
    'israel': ['israeli'],
    'russia': ['russian'],
    'china': ['chinese'],
    'ukraine': ['ukrainian'],
    'syria': ['syrian'],
    'yemen': ['yemeni'],
    'lebanon': ['lebanese'],
    'iraq': ['iraqi'],
    'egypt': ['egyptian'],
    'turkey': ['turkish'],
    'saudi': ['saudi', 'saudi arabian'],
    'india': ['indian'],
    'pakistan': ['pakistani'],
    'afghanistan': ['afghan'],
    'north korea': ['north korean'],
    'south korea': ['south korean'],
    'germany': ['german'],
    'france': ['french'],
    'gaza': ['palestinian', 'gazan'],
    'palestine': ['palestinian'],
    'georgia': ['georgian'],
    'jordan': ['jordanian'],
    'japan': ['japanese'],
    'australia': ['australian'],
    'canada': ['canadian'],
    'brazil': ['brazilian'],
    'argentina': ['argentine', 'argentinian'],
  };
  
  const demonyms = countryDemonyms[countryLower] || [];

  // "in <country>", "from <country>", "of <country>"
  if (new RegExp(`\\b(in|from|of)\\s+${escapeReg(countryLower)}\\b`, 'i').test(lower)) {
    return true;
  }
  // Possessive form: "India's economy", "Iran's nuclear"
  if (new RegExp(`\\b${escapeReg(countryLower)}'s\\b`, 'i').test(lower)) {
    return true;
  }
  // Demonym forms: "Iranian forces", "Israeli troops", "Chinese officials"
  for (const demonym of demonyms) {
    if (new RegExp(`\\b${escapeReg(demonym)}\\b`, 'i').test(lower)) {
      return true;
    }
  }
  return false;
}

// Main extraction function V3
// Improvements over V2:
// 1. Confidence threshold filtering (only accept >= 2)
// 2. Aboutness detection for U.S. articles
// 3. Better rejection of ambiguous cases
// 4. Debug info for placement quality
function extractLocationV3(text: string): LocationResult {
  const lower = text.toLowerCase();
  
  // First, check if this is a U.S. domestic article
  // U.S. domestic articles should NOT be placed in foreign countries
  // even if they mention foreign locations
  const isUSDomestic = isUSDomesticArticle(text);
  const isInternational = isInternationalArticle(text);

  // === CONFIDENCE 3: Dateline patterns ===
  const dateline = checkDateline(text);
  if (dateline) {
    // Check if city is in our known cities
    const cityKey = dateline.city.toLowerCase();
    const knownCity = UNAMBIGUOUS_CITIES.get(cityKey);
    if (knownCity) {
      return {
        label: `city:${knownCity.city}, ${knownCity.country}`,
        precision: "city",
        confidence: 3,
        reason: "dateline",
        matchedToken: dateline.city,
        debug: `dateline:${dateline.city}`
      };
    }
    // Unknown city from dateline - use country if valid
    const countryLower = dateline.country.toLowerCase();
    if (UNAMBIGUOUS_COUNTRIES.has(countryLower)) {
      return {
        label: `country:${UNAMBIGUOUS_COUNTRIES.get(countryLower)}`,
        precision: "country",
        confidence: 3,
        reason: "dateline",
        matchedToken: dateline.country,
        debug: `dateline-country:${dateline.country}`
      };
    }
  }

  // === CONFIDENCE 3: Multi-word countries (must run BEFORE any single-word matching) ===
  for (const [key, country] of MULTI_WORD_COUNTRIES) {
    if (matchKey(lower, key)) {
      // Check aboutness for DRC/Congo
      if (isArticleAboutCountry(text, 'congo') || isArticleAboutCountry(text, 'dr congo')) {
        return {
          label: `country:${country}`,
          precision: "country",
          confidence: 3,
          reason: "subject_match",
          matchedToken: key,
          debug: `subject:${key}`
        };
      }
      // Even without explicit aboutness, multi-word countries are reliable
      return {
        label: `country:${country}`,
        precision: "country",
        confidence: 3,
        reason: "explicit_country",
        matchedToken: key,
        debug: `multi-word:${key}`
      };
    }
  }

  // === CONFIDENCE 3: Comma-state pattern (U.S. cities) ===
  const commaState = checkCommaState(text);
  if (commaState) {
    // Suppress US location if the article is clearly about a foreign country/conflict
    // This prevents publisher datelines like "New York, NY" from contaminating foreign event geo
    if (!hasClearForeignSignal(text)) {
      return {
        label: `state:${commaState.state}, US`,
        precision: "state",
        confidence: 3,
        reason: "comma_state",
        matchedToken: `${commaState.city}, ${commaState.state}`,
        debug: `comma-state:${commaState.city}, ${commaState.state}`
      };
    }
    // Foreign signal detected — do not assign US state; fall through to foreign matching
  }

  // === CONFIDENCE 3: Unambiguous cities with preposition ===
  for (const [key, info] of UNAMBIGUOUS_CITIES) {
    if (matchKey(lower, key)) {
      if (hasPrepositionContext(text, key) || hasPrepositionContext(text, info.city)) {
        // If this is a U.S. domestic article and the city is outside the U.S.,
        // only accept if there's strong aboutness evidence
        if (isUSDomestic && !isInternational && info.country !== 'US') {
          // U.S. article mentioning foreign city - require explicit aboutness
          if (!isArticleAboutCountry(text, key)) {
            continue; // Skip, likely just a passing reference
          }
        }
        return {
          label: `city:${info.city}, ${info.country}`,
          precision: "city",
          confidence: 3,
          reason: "preposition",
          matchedToken: info.city,
          debug: `city-prep:${info.city}`
        };
      }
    }
  }

  // === CONFIDENCE 2: Unambiguous countries with STRONG context + ABOUTNESS ===
  // IMPORTANT: Country centroid placement now requires BOTH:
  // 1. Explicit context (preposition like "in Iran", "from Iran") AND
  // 2. Aboutness evidence (article is ABOUT the country, not just mentioning it)
  //
  // This prevents bad placements like:
  // - "UK Prime Minister discusses Iran nuclear deal" → was placed in Iran
  // - "Biden meets with Israeli leaders about Gaza" → was placed in Gaza
  for (const [key, country] of UNAMBIGUOUS_COUNTRIES) {
    if (matchKey(lower, key)) {
      if (hasExplicitCountryContext(text, country)) {
        // Check it's not in ambiguous list
        if (!AMBIGUOUS_COUNTRIES.has(key)) {
          // REQUIRE ABOUTNESS FOR ALL COUNTRY PLACEMENTS
          // Not just US domestic - ANY article must be ABOUT the country
          if (!isArticleAboutCountry(text, key) && !isArticleAboutCountry(text, country)) {
            // Has context but not aboutness - reject
            // Example: "UK discusses Iran nuclear deal" - has "Iran" but not ABOUT Iran
            continue;
          }
          return {
            label: `country:${country}`,
            precision: "country",
            confidence: 2,
            reason: "explicit_country",
            matchedToken: key,
            debug: `country-ctx+about:${country}`
          };
        }
      }
    }
  }

  // === CONFIDENCE 2: Unambiguous countries (REQUIRE CONTEXT OR ABOUTNESS) ===
  // IMPORTANT: We do NOT accept bare country mentions anymore.
  // Country centroid placement requires EITHER:
  // 1. Explicit context (preposition, possessive, etc.) OR
  // 2. Strong aboutness evidence (article is ABOUT the country)
  //
  // This section was too permissive before - it accepted any mention of a country
  // name with confidence 2, causing bad clustering (e.g., Iran blob).
  //
  // The bare match loop has been REMOVED. Use the explicit context section above
  // (lines 576-599) which requires hasExplicitCountryContext() or aboutness.
  //
  // If no context is found, the article will fall through to NO MATCH.
  // This is intentional - prioritize trustworthiness over volume.

  // === CONFIDENCE 2: US States with preposition context ===
  // Skip entirely if article is clearly about a foreign topic — prevents publisher geo bleed
  if (!hasClearForeignSignal(text)) {
    for (const [key, state] of US_STATE_NAMES) {
      if (matchKey(lower, key)) {
        // Ambiguous states need context
        if (AMBIGUOUS_TOKENS.has(key)) {
          if (hasPrepositionContext(text, key)) {
            return {
              label: `state:${state}, US`,
              precision: "state",
              confidence: 2,
              reason: "preposition",
              matchedToken: state,
              debug: `state-prep:${state}`
            };
          }
          // Reject ambiguous without context
          continue;
        }
        // Non-ambiguous states - accept with confidence 2
        return {
          label: `state:${state}, US`,
          precision: "state",
          confidence: 2,
          reason: "explicit_country",
          matchedToken: state,
          debug: `state:${state}`
        };
      }
    }
  }

  // === CONFIDENCE 2: Ambiguous countries with STRONG context ===
  for (const key of AMBIGUOUS_COUNTRIES) {
    if (matchKey(lower, key)) {
      const countryName = key === 'turkey' || key === 'turkish' ? 'Turkey' :
                          key === 'jordan' ? 'Jordan' :
                          key === 'georgia' ? 'Georgia' : null;
      if (countryName && (hasExplicitCountryContext(text, countryName) || hasPrepositionContext(text, key))) {
        // For ambiguous countries, require aboutness check
        if (!isArticleAboutCountry(text, key) && !isArticleAboutCountry(text, countryName)) {
          continue; // Likely a reference, not about the country
        }
        return {
          label: `country:${countryName}`,
          precision: "country",
          confidence: 2,
          reason: "explicit_country",
          matchedToken: key,
          debug: `ambiguous-ctx:${countryName}`
        };
      }
    }
  }

  // === CONFIDENCE 1: Regions - ONLY for international articles with ABOUTNESS ===
  // Don't place U.S. domestic articles in generic regions
  // ALSO: Require aboutness evidence - "European leaders" is NOT about Europe
  if (!isUSDomestic || isInternational) {
    for (const [key, region] of REGIONS) {
      if (matchKey(lower, key)) {
        // CRITICAL: Check aboutness for regions too
        // "European leaders respond" is NOT about Europe - reject
        // "War in Europe", "Crisis in Europe" IS about Europe - accept
        const regionLower = region.toLowerCase();
        const regionDemonyms: Record<string, string[]> = {
          'Europe': ['european'],
          'Asia': ['asian'],
          'Africa': ['african'],
          'Middle East': ['middle eastern'],
        };
        const demonyms = regionDemonyms[region] || [];
        
        // Check if there's a preposition context like "in Europe", "crisis in Europe"
        const hasPrepContext = new RegExp(`\\b(in|across|throughout)\\s+${escapeReg(regionLower)}\\b`, 'i').test(lower);
        
        // Check for event patterns: "War in Europe", "Crisis in Middle East"
        const hasEventPattern = new RegExp(`\\b(war|conflict|crisis|disaster|unrest|revolution)\\s+(in|across)\\s+${escapeReg(regionLower)}\\b`, 'i').test(lower);
        
        // Check if demonym is used in a way that indicates ABOUTNESS
        // "European leaders discuss X" → NOT about Europe (just describes leaders' origin)
        // "European economy/crisis/union" → IS about Europe
        let hasDemonymAboutness = false;
        for (const dem of demonyms) {
          // Pattern: "European Union", "European economy", "European crisis"
          if (new RegExp(`\\b${escapeReg(dem)}\\s+(union|commission|parliament|council|economy|crisis|markets?|financial|trade|policy|countries|nations)\\b`, 'i').test(lower)) {
            hasDemonymAboutness = true;
            break;
          }
        }
        
        // Accept region only if there's genuine aboutness
        if (hasPrepContext || hasEventPattern || hasDemonymAboutness) {
          return {
            label: `region:${region}`,
            precision: "region",
            confidence: 1,
            reason: "fallback",
            matchedToken: key,
            debug: `region:${region}`
          };
        }
        // Otherwise, it's just a passing reference to the region - reject
        // Example: "European leaders respond to Russia" → European is just describing leaders
      }
    }
  }

  // === NO MATCH or REJECTED ===
  // Check if we would have matched something ambiguous
  for (const token of AMBIGUOUS_TOKENS) {
    if (matchKey(lower, token)) {
      return {
        label: null,
        precision: "none",
        confidence: 0,
        reason: "rejected_ambiguous",
        matchedToken: token,
        debug: `rejected-ambiguous:${token}`
      };
    }
  }

  return {
    label: null,
    precision: "none",
    confidence: 0,
    reason: "no_match",
    debug: "no-location-found"
  };
}

// Keep V2 for backwards compatibility but delegate to V3
function extractLocationV2(text: string): LocationResult {
  return extractLocationV3(text);
}

// === LOCATION PROOF TRACKING ===
interface LocationStats {
  withLocationLabel: number;
  byPrecision: { city: number; state: number; country: number; region: number; none: number };
  rejectedAmbiguousCount: number;
  acceptedLabels: Map<string, number>;
  rejectedTokens: Map<string, number>;
  sampleRejected: Array<{ title: string; token: string; reason: string }>;
}

function createLocationStats(): LocationStats {
  return {
    withLocationLabel: 0,
    byPrecision: { city: 0, state: 0, country: 0, region: 0, none: 0 },
    rejectedAmbiguousCount: 0,
    acceptedLabels: new Map(),
    rejectedTokens: new Map(),
    sampleRejected: []
  };
}

function recordLocationResult(
  stats: LocationStats,
  result: LocationResult,
  title: string
): void {
  stats.byPrecision[result.precision]++;

  if (result.label) {
    stats.withLocationLabel++;
    stats.acceptedLabels.set(result.label, (stats.acceptedLabels.get(result.label) || 0) + 1);
  }

  if (result.reason === "rejected_ambiguous" && result.matchedToken) {
    stats.rejectedAmbiguousCount++;
    stats.rejectedTokens.set(result.matchedToken, (stats.rejectedTokens.get(result.matchedToken) || 0) + 1);
    if (stats.sampleRejected.length < 10) {
      stats.sampleRejected.push({
        title: title.substring(0, 100),
        token: result.matchedToken,
        reason: result.reason
      });
    }
  }
}

function printLocationProof(stats: LocationStats): void {
  const topAccepted = Array.from(stats.acceptedLabels.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const topRejected = Array.from(stats.rejectedTokens.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  console.log('\n=== LOCATION PROOF ===');
  console.log(`withLocationLabel: ${stats.withLocationLabel}`);
  console.log(`acceptedByPrecision: ${JSON.stringify(stats.byPrecision)}`);
  console.log(`rejectedAmbiguousCount: ${stats.rejectedAmbiguousCount}`);
  console.log(`topAcceptedLabels: ${JSON.stringify(topAccepted)}`);
  console.log(`topRejectedAmbiguous: ${JSON.stringify(topRejected)}`);
  console.log(`sampleRejected:`);
  if (stats.sampleRejected.length > 0) {
    stats.sampleRejected.forEach((s, i) => {
      console.log(`  ${i + 1}. { token: "${s.token}", title: "${s.title}" }`);
    });
  } else {
    console.log('  (no rejections this run)');
  }
  console.log('=== END LOCATION PROOF ===\n');
}

// === DEV-ONLY LOCATION TEST CASES ===
function runLocationTests(): void {
  if (process.env.NODE_ENV === 'production') return;

  const testCases = [
    // === DATELINE PATTERNS (CONFIDENCE 3) ===
    {
      title: "KYIV, Ukraine — Zelenskyy addresses parliament",
      expectLabel: /city:Kyiv/,
      expectConfidence: 3,
      label: 'A1) Dateline KYIV, Ukraine'
    },
    {
      title: "Paris, FR — French officials announce new policy",
      expectLabel: /city:Paris/,
      expectConfidence: 3,
      label: 'A2) Dateline Paris, FR'
    },
    
    // === CRITICAL: MUST REJECT - Person references ===
    {
      title: "Trump meets Jordan's king at White House",
      expectLabel: /Washington DC/,  // White House → DC (correct); Jordan should NOT match
      expectConfidence: 3,
      label: "B1) Jordan's king (MUST REJECT jordan-country; White House→DC is correct)"
    },
    {
      title: "Georgia man sentenced to 20 years in prison",
      expectLabel: null,  // Should NOT map to country Georgia
      expectConfidence: 0,
      label: "B2) Georgia man (MUST REJECT - US state person)"
    },
    
    // === CRITICAL: MUST REJECT - Vague mentions ===
    {
      title: "UK Prime Minister discusses Iran nuclear deal",
      expectLabel: null,  // Should NOT map to Iran - not about Iran
      expectConfidence: 0,
      label: "C1) UK discusses Iran (MUST REJECT - vague mention)"
    },
    {
      title: "Biden meets with Israeli leaders about Gaza situation",
      expectLabel: null,  // Should NOT map to Gaza - not about Gaza
      expectConfidence: 0,
      label: "C2) Biden meets about Gaza (MUST REJECT - vague mention)"
    },
    {
      title: "European leaders respond to Russian aggression",
      expectLabel: null,  // Should NOT map to Russia without aboutness
      expectConfidence: 0,
      label: "C3) EU responds to Russia (MUST REJECT - vague mention)"
    },
    
    // === CRITICAL: MUST ACCEPT - Strong aboutness ===
    {
      title: "Iran's nuclear program advances despite sanctions",
      expectLabel: /country:Iran/,  // ABOUT Iran's nuclear program
      expectConfidence: 2,
      label: "D1) Iran's nuclear program (ACCEPT - aboutness)"
    },
    {
      title: "War in Ukraine enters third year",
      expectLabel: /country:Ukraine/,  // ABOUT war IN Ukraine
      expectConfidence: 2,
      label: "D2) War in Ukraine (ACCEPT - conflict location)"
    },
    {
      title: "Protests in Iran continue for third day",
      expectLabel: /country:Iran/,  // ABOUT protests IN Iran
      expectConfidence: 2,
      label: "D3) Protests in Iran (ACCEPT - event location)"
    },
    {
      title: "Turkey's inflation rises amid economic crisis",
      expectLabel: /country:Turkey/,  // ABOUT Turkey's economy
      expectConfidence: 2,
      label: "D4) Turkey's inflation (ACCEPT - aboutness)"
    },
    
    // === CRITICAL: Congo variants - must use specific forms ===
    {
      title: "DR Congo faces humanitarian crisis amid ongoing conflict",
      expectLabel: /Democratic Republic of the Congo/,
      expectConfidence: 3,  // Multi-word match = confidence 3
      label: "E1) DR Congo (ACCEPT as Democratic Republic of the Congo)"
    },
    {
      title: "Republic of the Congo signs new trade agreement",
      expectLabel: /Republic of the Congo/,
      expectConfidence: 3,
      label: "E2) Republic of the Congo (ACCEPT)"
    },
    {
      title: "Congo river flooding displaces thousands",
      expectLabel: null,  // Plain "congo" should be rejected as ambiguous
      expectConfidence: 0,
      label: "E3) Plain Congo (MUST REJECT - ambiguous)"
    },
    
    // === ACCEPT: Strong country aboutness patterns ===
    {
      title: "India's economy grows at fastest pace in two years",
      expectLabel: /India/,
      expectConfidence: 2,
      label: "F1) India's economy (ACCEPT - aboutness)"
    },
    {
      title: "Lebanon's central bank devalues currency amid crisis",
      expectLabel: /Lebanon/,
      expectConfidence: 2,
      label: "F2) Lebanon's currency (ACCEPT - aboutness)"
    },
    {
      title: "Israeli forces strike Gaza targets",
      expectLabel: /country:Israel|Gaza/,  // Either Israel or Gaza acceptable
      expectConfidence: 2,
      label: "F3) Israeli forces strike (ACCEPT - action by country)"
    },
    
    // === REJECT: Month names (ambiguous) ===
    {
      title: "May election results show shift in voter sentiment",
      expectLabel: null,  // Should NOT map to anything
      expectConfidence: 0,
      label: "G1) May election (MUST REJECT - month name)"
    },
    {
      title: "March for justice draws thousands",
      expectLabel: null,  // Should NOT map to anything
      expectConfidence: 0,
      label: "G2) March for justice (MUST REJECT - month/event)"
    },
  ];

  console.log('\n=== LOCATION EXTRACTION TEST CASES ===');
  for (const tc of testCases) {
    const result = extractLocationV2(tc.title);
    const labelMatch = tc.expectLabel ? tc.expectLabel.test(result.label || '') : result.label === null;
    const confMatch = result.confidence >= tc.expectConfidence;
    const pass = labelMatch && confMatch;
    const status = pass ? '✓ PASS' : '✗ FAIL';

    console.log(`${status} ${tc.label}`);
    console.log(`    Title: "${tc.title.substring(0, 60)}..."`);
    console.log(`    Result: label=${result.label}, conf=${result.confidence}, reason=${result.reason}`);
    // Debug: show which checks were triggered for Turkey
    if (tc.label.includes('Turkey') && !pass) {
      console.log(`    DEBUG: hasWholeToken('turkey')=${hasWholeToken(tc.title.toLowerCase(), 'turkey')}`);
      console.log(`    DEBUG: hasPrepositionContext=${hasPrepositionContext(tc.title, 'turkey')}`);
      console.log(`    DEBUG: hasExplicitCountryContext=${hasExplicitCountryContext(tc.title, 'Turkey')}`);
    }
    if (!pass) {
      console.log(`    EXPECTED: label match=${tc.expectLabel?.source || 'null'}, conf>=${tc.expectConfidence}`);
    }
  }
  console.log('=== END LOCATION TEST CASES ===\n');
}

// Run tests at module load (dev only)
runLocationTests();

function extractKeywords(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'it', 'its', 'this', 'that', 'these', 'those', 'says', 'said', 'say', 'told', 'tell', 'reports', 'report']);
  
  return text.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 4 && !stopWords.has(w) && /^[a-z]+$/.test(w))
    .slice(0, 5);
}

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'");
}

// Strip HTML tags
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

// Normalize URL for deduplication
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove tracking parameters
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref', 'source', '_ga'];
    trackingParams.forEach(param => urlObj.searchParams.delete(param));
    // Remove trailing slash
    let normalized = urlObj.origin + urlObj.pathname + urlObj.search;
    if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    return normalized.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

async function fetchWithProxy(url: string): Promise<string | null> {
  // Try direct fetch first
  try {
    const directResponse = await fetch(url, {
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml',
        'User-Agent': USER_AGENTS[0],
      },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (directResponse.ok) {
      const text = await directResponse.text();
      if (text.includes('<') && (text.includes('rss') || text.includes('feed') || text.includes('item'))) {
        return text;
      }
    }
  } catch {
    // Direct fetch failed
  }

  // Try proxies
  for (const proxy of CORS_PROXIES) {
    try {
      const response = await fetch(proxy + encodeURIComponent(url), {
        headers: { 'Accept': 'application/rss+xml, application/xml, text/xml' },
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      });
      if (response.ok) {
        const text = await response.text();
        if (text.includes('<') && (text.includes('rss') || text.includes('feed') || text.includes('item'))) {
          return text;
        }
      }
    } catch {
      // Continue to next proxy
    }
  }
  return null;
}

// === SPAM DETECTION SYSTEM ===
// Scoring approach: reject if score >= 4
// Standardized reason keys for aggregation
type SpamReason =
  | 'casino_terms'
  | 'seo_phrase'
  | 'spam_domain'
  | 'affiliate_param'
  | 'year_top_list'
  | 'caps'
  | 'multi_exclaim'
  | 'money_promo'
  | 'crypto_trade_spam'
  | 'adult_promo';

interface SpamCheckResult {
  isSpam: boolean;
  wouldReject: boolean;  // True if score >= 4, but may be overridden by allowlist
  score: number;
  reasons: SpamReason[];
  isAllowlisted: boolean;
}

// TRUSTED PUBLISHER ALLOWLIST - Hard override, never reject
const ALLOWLIST_DOMAINS = new Set([
  // Major wire services
  'reuters.com', 'reutersagency.com', 'apnews.com', 'afp.com',
  // Major US publishers
  'bbc.com', 'bbci.co.uk', 'cnn.com', 'npr.org', 'abcnews.go.com',
  'nbcnews.com', 'cbsnews.com', 'pbs.org',
  // Major international
  'theguardian.com', 'dw.com', 'france24.com', 'nhk.or.jp',
  'nytimes.com', 'washingtonpost.com', 'wsj.com', 'latimes.com',
  'usatoday.com', 'time.com', 'ap.org',
  // Regional quality sources
  'jpost.com', 'arabnews.com', 'timesofindia.indiatimes.com',
  'thehindu.com', 'hindustantimes.com', 'scmp.com',
  'straitstimes.com', 'smh.com.au', 'theage.com.au',
  'aljazeera.com', 'aljazeera.net',
  // Second expansion sources
  'voanews.com', 'voa.com', 'voaafrica.com',
  'rferl.org',
  'middleeasteye.net',
  'dawn.com',
  'kyivindependent.com',
  'haaretz.com',
  'timesofisrael.com',
]);

// Known spam domains/patterns (for scoring, not hard block)
const SPAM_DOMAIN_PATTERNS = [
  /casino/i, /gambl/i, /betting/i, /poker/i, /slots/i, /bingo/i,
  /crypto/i, /forex/i, /trading/i, /invest/i, /loan/i, /payday/i,
  /coupon/i, /deal/i, /discount/i, /promo/i, /offer/i, /bonus/i,
  /affiliat/i, /partner/i, /referral/i,
];

// Affiliate/tracking URL patterns
const AFFILIATE_URL_PATTERNS = [
  /[?&]ref=/i, /[?&]aff=/i, /[?&]affiliate=/i,
  /[?&]utm_campaign=/i, /[?&]utm_source=/i,
  /[?&]promo=/i, /[?&]code=/i, /[?&]bonus=/i,
  /\/go\//i, /\/click\//i, /\/track\//i, /\/ref\//i,
];

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function isSpamArticle(title: string, url: string, sourceName: string): SpamCheckResult {
  let score = 0;
  const reasons: SpamReason[] = [];
  let isAllowlisted = false;

  // Check allowlist FIRST - hard override
  const domain = getDomain(url);
  if (domain && ALLOWLIST_DOMAINS.has(domain)) {
    isAllowlisted = true;
  }

  // === +3: Casino/Gambling terms (highest weight) ===
  const casinoTerms = /\b(casinos?|sportsbooks?|betting|wagers?|slots?|blackjack|roulette|gambl(?:ing|er)?|poker|bingo)\b/gi;
  const casinoMatches = title.match(casinoTerms);
  const gamblingBonusContext = /\b(payout|bonus)\b/gi.test(title) && /\b(casinos?|betting|gambl|slots?|poker|bingo)\b/i.test(title);

  if (casinoMatches && casinoMatches.length > 0) {
    score += 3;
    reasons.push('casino_terms');
  } else if (gamblingBonusContext) {
    score += 3;
    reasons.push('casino_terms');
  }

  // === +2: SEO/Affiliate marketing terms ===
  const seoTerms = /\b(top\s+instant\s+withdrawal|best\s+\w+\s+(casino|site|app)|our\s+review|editor'?s?\s+review|full\s+review|promo\s+code|coupon|%\s*off|cheap|buy\s+now|limited\s+time|act\s+now|don'?t\s+miss|exclusive\s+offer|special\s+offer)\b/gi;
  if (seoTerms.test(title)) {
    score += 2;
    reasons.push('seo_phrase');
  }

  // === +2: Spam domain patterns ===
  if (domain) {
    for (const pattern of SPAM_DOMAIN_PATTERNS) {
      if (pattern.test(domain)) {
        score += 2;
        reasons.push('spam_domain');
        break;
      }
    }
  }

  // === +2: Affiliate URL parameters ===
  for (const pattern of AFFILIATE_URL_PATTERNS) {
    if (pattern.test(url)) {
      score += 2;
      reasons.push('affiliate_param');
      break;
    }
  }

  // === +2: Year + "top" + brand list vibe ===
  const hasYear = /\b(202[0-9])\b/.test(title);
  const hasTop = /\b(top\s+\d+|best\s+\d+|top\s+\w+\s+\d{4})\b/i.test(title);
  const hasBrandList = /\b(vs\.?|versus|comparison|ranked|reviewed)\b/i.test(title);
  if (hasYear && (hasTop || hasBrandList)) {
    score += 2;
    reasons.push('year_top_list');
  }

  // === +1: Excessive caps ===
  const capsWords = title.match(/\b[A-Z]{3,}\b/g);
  if (capsWords && capsWords.length > 3) {
    score += 1;
    reasons.push('caps');
  }

  // === +1: Multiple exclamation marks ===
  if ((title.match(/!/g) || []).length > 2) {
    score += 1;
    reasons.push('multi_exclaim');
  }

  // === +2: Dollar amounts with "win" or "free" ===
  if (/\$\d+/.test(title) && /\b(win|free|bonus|cash)\b/i.test(title)) {
    score += 2;
    reasons.push('money_promo');
  }

  // === +2: Crypto trading spam ===
  if (/\b(bitcoin|btc|ethereum|eth|crypto|nft|blockchain)\b/i.test(title) &&
      /\b(price|buy|sell|trade|invest|moon|pump|dump)\b/i.test(title)) {
    score += 2;
    reasons.push('crypto_trade_spam');
  }

  // === +4: Adult content spam (promotional only, not news) ===
  const adultPromoTerms = /\b(porn\s*(site|video|star|hub)|xxx\s*(site|video)|adult\s*(site|video|chat|dating)|escort\s*(service|agency|girl|ads?)|sex\s*(chat|cams?|site|video|dating)|onlyfans|chaturbate)\b/i;
  if (adultPromoTerms.test(title)) {
    score += 4;
    reasons.push('adult_promo');
  }

  const wouldReject = score >= 4;
  // Allowlist override: never reject if from trusted publisher
  const isSpam = wouldReject && !isAllowlisted;

  return { isSpam, wouldReject, score, reasons, isAllowlisted };
}

// === DEV-ONLY TEST CASES ===
// Runs once at module load to verify spam detection
function runSpamTests(): void {
  if (process.env.NODE_ENV === 'production') return;

  const testCases = [
    {
      title: 'Fast Payout Casinos USA 2026: Top Instant Withdrawal Casinos That Pay Out in Minutes',
      url: 'https://spam-site.com/casino',
      sourceName: 'Spam Site',
      expectReject: true,
      label: 'A) Casino spam'
    },
    {
      title: 'Top instant withdrawal casino bonus - get $500 free!',
      url: 'https://affiliate.com/go/casino?ref=123',
      sourceName: 'Affiliate Site',
      expectReject: true,
      label: 'B) Casino bonus + affiliate param'
    },
    {
      title: 'Court hears sex-trafficking case against high-end real estate broker brothers',
      url: 'https://reuters.com/article/court-case',
      sourceName: 'Reuters',
      expectReject: false,
      label: 'C) Legitimate news (sex-trafficking)'
    },
    {
      title: 'Senate votes on online gambling regulation bill',
      url: 'https://apnews.com/article/politics',
      sourceName: 'AP News',
      expectReject: false,
      label: 'D) Legitimate news (gambling regulation)'
    },
    {
      title: 'Reuters: Oil prices fall as OPEC maintains output levels',
      url: 'https://reuters.com/markets/oil',
      sourceName: 'Reuters',
      expectReject: false,
      label: 'E) Reuters allowlist test'
    }
  ];

  console.log('\n=== SPAM DETECTION TEST CASES ===');
  for (const tc of testCases) {
    const result = isSpamArticle(tc.title, tc.url, tc.sourceName);
    const pass = result.isSpam === tc.expectReject;
    const status = pass ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} ${tc.label}`);
    console.log(`    Title: "${tc.title.substring(0, 60)}..."`);
    console.log(`    Domain: ${getDomain(tc.url)}`);
    console.log(`    Score: ${result.score}, Reasons: [${result.reasons.join(', ')}]`);
    console.log(`    isSpam: ${result.isSpam}, wouldReject: ${result.wouldReject}, allowlisted: ${result.isAllowlisted}`);
    if (!pass) {
      console.log(`    EXPECTED: isSpam=${tc.expectReject}, GOT: isSpam=${result.isSpam}`);
    }
  }
  console.log('=== END TEST CASES ===\n');
}

// Run tests at module load (dev only)
runSpamTests();

function parseRSSFeed(xml: string, sourceId: string, sourceName: string, isAggregator: boolean): Omit<RawArticle, 'topic' | 'keywords' | 'fetchedAt'>[] {
  const items: Omit<RawArticle, 'topic' | 'keywords' | 'fetchedAt'>[] = [];
  
  try {
    const itemMatches = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
    
    for (const itemXml of itemMatches) {
      const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
      const descMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/i);
      const linkMatch = itemXml.match(/<link>(.*?)<\/link>/i);
      const dateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/i);
      
      let title = titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : '';
      let description = descMatch ? (descMatch[1] || descMatch[2] || '').trim() : '';
      const link = linkMatch ? linkMatch[1].trim() : '';
      const pubDate = dateMatch ? dateMatch[1].trim() : new Date().toISOString();
      
      // Decode HTML entities and strip HTML
      title = decodeHtmlEntities(stripHtml(title));
      description = decodeHtmlEntities(stripHtml(description));
      
      if (title && link) {
        const id = generateArticleId(link);
        
        items.push({
          id,
          title,
          url: link,
          sourceName,
          sourceId,
          publishedAt: pubDate,
          description: description.substring(0, 500),
          locationLabel: null,
          lat: null,
          lng: null,
          isAggregator,
        });
      }
    }
  } catch (error) {
    console.error('Error parsing RSS feed:', error);
  }
  
  return items;
}

export async function GET(request: NextRequest) {
  try {
    const allItems: Omit<RawArticle, 'topic' | 'keywords' | 'fetchedAt'>[] = [];
    
    // Fetch all RSS sources in parallel
    const fetchPromises = RSS_SOURCES.map(async (source) => {
      const xml = await fetchWithProxy(source.url);
      if (xml) {
        return parseRSSFeed(xml, source.id, source.name, source.isAggregator);
      }
      return [];
    });
    
    const results = await Promise.all(fetchPromises);
    results.forEach(items => allItems.push(...items));
    
    // Deduplicate by normalized URL before processing
    const urlMap = new Map<string, Omit<RawArticle, 'topic' | 'keywords' | 'fetchedAt'>>();
    for (const item of allItems) {
      const normalizedUrl = normalizeUrl(item.url);
      if (!urlMap.has(normalizedUrl)) {
        urlMap.set(normalizedUrl, item);
      }
    }
    
    const dedupedItems = Array.from(urlMap.values());

    // === SPAM FILTERING ===
    // Apply spam detection AFTER URL dedupe, BEFORE location extraction
    let spamRejectedCount = 0;
    let wouldHaveRejectedCount = 0;  // Allowlisted but would have rejected
    const reasonCounts: Map<SpamReason, number> = new Map();
    const spamSamples: { title: string; domain: string | null; score: number; reasons: SpamReason[] }[] = [];

    const nonSpamItems = dedupedItems.filter(item => {
      const spamCheck = isSpamArticle(item.title, item.url, item.sourceName);

      // Track reason counts (for wouldReject, not just isSpam)
      if (spamCheck.wouldReject) {
        for (const reason of spamCheck.reasons) {
          reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
        }
      }

      // Handle allowlist override
      if (spamCheck.wouldReject && spamCheck.isAllowlisted) {
        wouldHaveRejectedCount++;
        // Don't reject - allowlist overrides
        return true;
      }

      if (spamCheck.isSpam) {
        spamRejectedCount++;
        // Keep top 10 samples with highest scores
        const domain = getDomain(item.url);
        if (spamSamples.length < 10) {
          spamSamples.push({
            title: item.title.substring(0, 120),
            domain,
            score: spamCheck.score,
            reasons: spamCheck.reasons
          });
          spamSamples.sort((a, b) => b.score - a.score);
        } else if (spamCheck.score > spamSamples[spamSamples.length - 1].score) {
          spamSamples.pop();
          spamSamples.push({
            title: item.title.substring(0, 120),
            domain,
            score: spamCheck.score,
            reasons: spamCheck.reasons
          });
          spamSamples.sort((a, b) => b.score - a.score);
        }
        return false; // REJECT - spam never reaches event creation
      }
      return true; // ACCEPT - legitimate article
    });

    // === ALWAYS-ON SPAM PROOF BLOCK ===
    // Print this EVERY run, even if 0 spam, for regression tracking
    const topSpamReasons = Array.from(reasonCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => [reason, count] as [string, number]);

    console.log('\n=== SPAM PROOF ===');
    console.log(`rawArticles: ${allItems.length}`);
    console.log(`afterDedup: ${dedupedItems.length}`);
    console.log(`spamRejectedCount: ${spamRejectedCount}`);
    console.log(`wouldHaveRejectedCount (allowlisted): ${wouldHaveRejectedCount}`);
    console.log(`afterSpamFilter: ${nonSpamItems.length}`);
    console.log(`topSpamReasons: ${JSON.stringify(topSpamReasons)}`);
    console.log(`spamSamples:`);
    if (spamSamples.length > 0) {
      spamSamples.forEach((sample, i) => {
        console.log(`  ${i + 1}. { score: ${sample.score}, domain: "${sample.domain}", reasons: [${sample.reasons.join(', ')}] }`);
        console.log(`      title: "${sample.title}"`);
      });
    } else {
      console.log('  (no spam rejected this run)');
    }
    console.log('=== END SPAM PROOF ===\n');

    // Limit to MAX_FETCH_ARTICLES (from non-spam items)
    const limitedItems = nonSpamItems.slice(0, MAX_FETCH_ARTICLES);
    
    // Process items with location extraction
    // IMPORTANT: lat/lng are ALWAYS null - the store will assign centroid coords
    // === LOCATION EXTRACTION WITH PROOF TRACKING ===
    const locationStats = createLocationStats();

    const processedItems: RawArticle[] = limitedItems.map(item => {
      // Strip publisher/newsroom names BEFORE location extraction.
      // Also include item.source (the RSS channel/publisher name) so publisher
      // names embedded in that field don't contaminate location signals.
      const rawText = `${item.title} ${item.description} ${item.source ?? ''}`;
      const text = stripNewsroomReferences(rawText);
      const locResult = extractLocationV2(text);

      // Record for proof logging
      recordLocationResult(locationStats, locResult, item.title);

      const topic = classifyTopic(item.title, item.description);
      const category = classifyCategory(item.title, item.description);
      const keywords = extractKeywords(text);

      return {
        ...item,
        locationLabel: locResult.label,  // May be null if rejected
        lat: null,          // NO coordinates assigned at API level
        lng: null,          // NO coordinates assigned at API level
        topic,
        category,
        keywords,
        fetchedAt: Date.now(),
        // V3: Include confidence and debug metadata
        locationConfidence: locResult.confidence,
        locationReason: locResult.reason,
        locationDebug: locResult.debug,
      };
    });

    // === ALWAYS-ON LOCATION PROOF ===
    printLocationProof(locationStats);

    // === OSINT RELEVANCE FILTER ===
    // Filter out non-geopolitical articles (sports, entertainment, general)
    // BEFORE the locationLabel filter so they never reach the store.
    let osintRejectedCount = 0;
    const osintRelevantItems = processedItems.filter(item => {
      if (!item.category || !isOsintRelevant(item.category)) {
        osintRejectedCount++;
        return false;
      }
      return true;
    });
    console.log(`[OSINT FILTER] rejected: ${osintRejectedCount} non-relevant articles, remaining: ${osintRelevantItems.length}`);

    // Return ALL items with location labels (coords will be assigned by store)
    // Limit to MAX_RAW_ARTICLES
    const itemsWithLocation = osintRelevantItems
      .filter(e => e.locationLabel !== null)
      .slice(0, MAX_RAW_ARTICLES);
    
    // Debug stats - prove NO coordinates are assigned
    const coordsNonNullCount = itemsWithLocation.filter(e => e.lat !== null || e.lng !== null).length;
    const locationCounts: Record<string, number> = {};
    for (const item of itemsWithLocation) {
      if (item.locationLabel) {
        locationCounts[item.locationLabel] = (locationCounts[item.locationLabel] || 0) + 1;
      }
    }
    
    // Top 10 location buckets
    const topLocations = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([location, count]) => ({ location, count }));
    
    // Calculate publisher distribution for debug
    const publisherCounts: Record<string, number> = {};
    for (const item of itemsWithLocation) {
      publisherCounts[item.sourceName] = (publisherCounts[item.sourceName] || 0) + 1;
    }
    
    const topPublishers = Object.entries(publisherCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }));
    
    // API DEBUG STATS
    console.log('=== API DEBUG STATS ===');
    console.log(`totalArticles: ${allItems.length}`);
    console.log(`afterDedup: ${dedupedItems.length}`);
    console.log(`withLocationLabel: ${itemsWithLocation.length}`);
    console.log(`coordsNonNullCount: ${coordsNonNullCount} (MUST be 0)`);
    
    // Top 30 location buckets with suspicious detection
    const top30Locations = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
    
    console.log('Top 30 location buckets:');
    top30Locations.forEach(([location, count]) => {
      console.log(`  ${location}: ${count}`);
    });
    
    // SUSPICIOUS BUCKET DETECTION - any bucket count > 200
    const suspiciousThreshold = 200;
    const suspiciousBuckets = top30Locations.filter(([_, count]) => count > suspiciousThreshold);
    
    if (suspiciousBuckets.length > 0) {
      console.log('\n=== SUSPICIOUS BUCKETS (count > 200) ===');
      for (const [label, count] of suspiciousBuckets) {
        // Find sample titles that produced this label
        const sampleTitles: string[] = [];
        for (const item of itemsWithLocation) {
          if (item.locationLabel === label && sampleTitles.length < 10) {
            sampleTitles.push(item.title.substring(0, 100));
          }
        }
        console.log(`\n[API] SUSPICIOUS label: "${label}" count: ${count}`);
        console.log(`  Sample titles (${sampleTitles.length}):`);
        sampleTitles.forEach((t, i) => console.log(`    ${i+1}. "${t}"`));
      }
    }
    
    console.log('\nTop 10 publishers:', topPublishers.slice(0, 10));
    
    return NextResponse.json({
      success: true,
      articles: itemsWithLocation,
      articleCount: itemsWithLocation.length,
      timestamp: new Date().toISOString(),
      sourcesFetched: RSS_SOURCES.length,
      debug: {
        rawArticles: allItems.length,
        afterDedup: dedupedItems.length,
        spamRejected: spamRejectedCount,
        wouldHaveRejectedAllowlisted: wouldHaveRejectedCount,
        afterSpamFilter: nonSpamItems.length,
        topSpamReasons,
        withLocationLabel: itemsWithLocation.length,
        coordsNonNullCount,  // MUST be 0
        topLocations,
        topPublishers,
        spamSamples,
      }
    });
  } catch (error) {
    console.error('Error fetching RSS feeds:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch RSS feeds',
      articles: [],
      articleCount: 0,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
// Force refresh 1772746818
