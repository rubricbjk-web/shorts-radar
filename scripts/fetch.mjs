import fs from 'node:fs/promises';

const API_KEY = process.env.YOUTUBE_API_KEY;
if (!API_KEY) throw new Error('YOUTUBE_API_KEY secret is required');

const config = JSON.parse(await fs.readFile(new URL('../config.json', import.meta.url), 'utf8'));
const base = 'https://www.googleapis.com/youtube/v3';

function isoDurationToSeconds(iso = 'PT0S') {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

function hoursSince(date) {
  return Math.max(0.25, (Date.now() - new Date(date).getTime()) / 3600000);
}

function categoryOf(text = '') {
  const t = text.toLowerCase();
  const rules = [
    ['게임', /(게임|game|롤|발로란트|마인크래프트|배그|스팀|닌텐도)/],
    ['음식', /(먹방|요리|레시피|맛집|음식|food|recipe|카페|디저트)/],
    ['동물', /(강아지|고양이|반려|동물|dog|cat|puppy|kitten)/],
    ['뷰티', /(메이크업|화장|뷰티|beauty|헤어|스킨케어|패션|코디)/],
    ['지식·정보', /(과학|역사|상식|정보|알려|이유|원리|지식|꿀팁|tip|경제|심리)/],
    ['스포츠', /(축구|야구|농구|골프|운동|헬스|sports|football|baseball|soccer)/],
    ['브이로그', /(브이로그|vlog|일상|하루|출근|퇴근|여행)/],
    ['코미디·밈', /(웃긴|ㅋㅋ|코미디|개그|밈|meme|상황극|레전드)/]
  ];
  return rules.find(([, rx]) => rx.test(t))?.[0] || '기타';
}

async function api(path, params) {
  const u = new URL(base + path);
  for (const [k,v] of Object.entries({...params, key: API_KEY})) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  }
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`);
  return r.json();
}

async function searchSource(label, extra, pages, publishedAfter, ids, diagnostics) {
  let pageToken = '';
  let sourceCount = 0;
  for (let page = 0; page < pages; page++) {
    const j = await api('/search', {
      part: 'snippet',
      type: 'video',
      maxResults: 50,
      order: 'viewCount',
      publishedAfter,
      regionCode: config.regionCode,
      relevanceLanguage: config.regionCode === 'KR' ? 'ko' : undefined,
      safeSearch: 'none',
      videoDuration: 'short',
      pageToken,
      ...extra
    });
    diagnostics.searchCalls++;
    for (const x of j.items || []) {
      if (x.id?.videoId) {
        ids.add(x.id.videoId);
        sourceCount++;
      }
    }
    pageToken = j.nextPageToken || '';
    if (!pageToken) break;
  }
  diagnostics.sources[label] = sourceCount;
  console.log(`[search] ${label}: ${sourceCount} rows`);
}

async function collectSearch() {
  const publishedAfter = new Date(Date.now() - config.days * 86400000).toISOString();
  const ids = new Set();
  const diagnostics = { searchCalls: 0, sources: {} };

  for (const q of config.searchQueries || []) {
    await searchSource(`q:${q}`, { q }, config.queryPages || 1, publishedAfter, ids, diagnostics);
  }
  for (const topicId of config.topicIds || []) {
    await searchSource(`topic:${topicId}`, { topicId }, config.topicPages || 1, publishedAfter, ids, diagnostics);
  }

  diagnostics.uniqueSearchCandidates = ids.size;
  return { ids: [...ids], diagnostics };
}

async function getVideos(ids) {
  const all = [];
  for (let i=0; i<ids.length; i+=50) {
    const j = await api('/videos', {
      part: 'snippet,statistics,contentDetails',
      id: ids.slice(i,i+50).join(','), maxResults: 50
    });
    all.push(...(j.items || []));
  }
  return all;
}

async function getChannels(ids) {
  const unique = [...new Set(ids)];
  const map = new Map();
  for (let i=0; i<unique.length; i+=50) {
    const j = await api('/channels', {
      part: 'snippet,statistics', id: unique.slice(i,i+50).join(','), maxResults: 50
    });
    for (const c of j.items || []) map.set(c.id, c);
  }
  return map;
}

const { ids, diagnostics } = await collectSearch();
console.log(`Unique search candidates: ${ids.length}`);
const raw = await getVideos(ids);
diagnostics.videoDetailsReturned = raw.length;

const durationEligible = raw.filter(v => {
  const sec = isoDurationToSeconds(v.contentDetails?.duration);
  return sec > 0 && sec <= config.maxDurationSeconds;
});
diagnostics.durationEligible = durationEligible.length;

const filtered = durationEligible.filter(v => +(v.statistics?.viewCount || 0) >= config.minViews);
diagnostics.minViewsEligible = filtered.length;

console.log(`Duration <= ${config.maxDurationSeconds}s: ${durationEligible.length}`);
console.log(`Views >= ${config.minViews}: ${filtered.length}`);

const channels = await getChannels(filtered.map(v => v.snippet.channelId));
const videos = filtered.map(v => {
  const s = v.snippet || {}, st = v.statistics || {};
  const ch = channels.get(s.channelId);
  const views = +(st.viewCount || 0), likes = +(st.likeCount || 0), comments = +(st.commentCount || 0);
  const subscribers = +(ch?.statistics?.subscriberCount || 0);
  const ageHours = hoursSince(s.publishedAt);
  const viewsPerHour = views / ageHours;
  const viewsPerDay = viewsPerHour * 24;
  const engagement = views ? (likes + comments) / views : 0;
  const subscriberBreakout = subscribers ? views / subscribers : 0;
  const text = `${s.title || ''} ${s.description || ''} ${s.channelTitle || ''}`;
  const hasKoreanText = /[가-힣]/.test(text);
  const channelCountry = ch?.snippet?.country || '';
  const koreaAffinity = channelCountry === 'KR' ? 14 : hasKoreanText ? 8 : 0;
  const score = Math.log10(Math.max(views,1))*20
    + Math.log10(Math.max(viewsPerHour,1))*20
    + Math.min(25, subscriberBreakout*3)
    + Math.min(15, engagement*300)
    + koreaAffinity;
  const thumb = s.thumbnails?.maxres?.url || s.thumbnails?.standard?.url || s.thumbnails?.high?.url || s.thumbnails?.medium?.url || '';
  return {
    id: v.id,
    title: s.title,
    description: s.description || '',
    channelId: s.channelId,
    channelTitle: s.channelTitle,
    channelCountry,
    channelSubscribers: subscribers,
    publishedAt: s.publishedAt,
    durationSeconds: isoDurationToSeconds(v.contentDetails?.duration),
    captionAvailable: v.contentDetails?.caption === 'true',
    views, likes, comments, viewsPerHour, viewsPerDay, engagement, subscriberBreakout, score,
    category: categoryOf(text),
    thumbnail: thumb,
    url: `https://www.youtube.com/shorts/${v.id}`,
    thumbnailText: '',
    transcript: ''
  };
}).sort((a,b) => b.score - a.score).slice(0, config.resultLimit);

diagnostics.saved = videos.length;

await fs.writeFile(new URL('../data/latest.json', import.meta.url), JSON.stringify({
  generatedAt: new Date().toISOString(),
  regionCode: config.regionCode,
  days: config.days,
  diagnostics,
  videos
}, null, 2));
console.log(`Saved ${videos.length} Shorts candidates.`);
