// Builds assets/night-city.svg: an animated pixel-art night city drawn from
// a GitHub user's contribution calendar.
//   - every building is one week of the last year; taller = more contributions
//   - lit windows = days you contributed that week, brighter = busier day
//   - quiet weeks stay as dark low-rise houses with the lights off
//   - a pixel ghost drifts over the skyline; stars twinkle
//
// Usage: GITHUB_TOKEN=... node scripts/night-city.mjs [login] [out.svg]
// No dependencies; needs Node 18+ (global fetch).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const LOGIN = process.argv[2] || process.env.GITHUB_REPOSITORY_OWNER || 'IsmailOpu1';
const OUT = process.argv[3] || 'assets/night-city.svg';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('GITHUB_TOKEN is required'); process.exit(1); }

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'night-city' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

// ── data ────────────────────────────────────────────────────────────────
const { user } = await gql(`query($l:String!){ user(login:$l){
  contributionsCollection{ contributionYears contributionCalendar{ totalContributions
    weeks{ contributionDays{ date contributionCount } } } } } }`, { l: LOGIN });
const cal = user.contributionsCollection.contributionCalendar;
const weeks = cal.weeks.map(w => w.contributionDays.map(d => d.contributionCount));
const days = cal.weeks.flatMap(w => w.contributionDays);

let allTime = 0;
for (const y of user.contributionsCollection.contributionYears) {
  const d = await gql(`query($l:String!,$f:DateTime!,$t:DateTime!){ user(login:$l){
    contributionsCollection(from:$f,to:$t){ contributionCalendar{ totalContributions } } } }`,
    { l: LOGIN, f: `${y}-01-01T00:00:00Z`, t: `${y}-12-31T23:59:59Z` });
  allTime += d.user.contributionsCollection.contributionCalendar.totalContributions;
}

let longest = 0, run = 0;
for (const d of days) { run = d.contributionCount ? run + 1 : 0; longest = Math.max(longest, run); }
// current streak: today may still be empty, so start counting from yesterday in that case
let current = 0, i = days.length - 1;
if (i >= 0 && !days[i].contributionCount) i--;
for (; i >= 0 && days[i].contributionCount; i--) current++;

// ── drawing helpers ─────────────────────────────────────────────────────
let seed = 1337;                                   // fixed seed: the SVG only changes when the data does
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const W = 880, H = 330, GROUND = 286, COL = 16, BW = 12;
const X0 = Math.round((W - weeks.length * COL) / 2) + 2;
const fmt = n => n.toLocaleString('en-US');
const r = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`;

// pixel sprites: each char is one pixel, '.' is transparent
function sprite(rows, palette, px, x0, y0) {
  let out = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== '.') out += r(x0 + x * px, y0 + y * px, px, px, palette[c]);
  }));
  return out;
}
const GHOST = [
  '....wwwww....',
  '..wwwwwwwww..',
  '.wwwwwwwwwww.',
  '.wwkkwwwkkww.',
  'wwwkkwwwkkwww',
  'wwwwwwwwwwwww',
  'wwwwwpppwwwww',
  'wwwwwwpwwwwww',
  'wwwwwwwwwwwww',
  'wwwwwwwwwwwww',
  'ww.www.www.ww',
  'w...w...w...w',
];
const BAT = ['k.....k', 'kk.k.kk', 'kkkkkkk', '.k...k.'];

// ── scene ───────────────────────────────────────────────────────────────
// stars
let stars = '';
for (let n = 0; n < 70; n++) {
  const x = Math.floor(rand() * W / 2) * 2, y = Math.floor(rand() * (GROUND - 120) / 2) * 2;
  const big = rand() < .15, c = ['#ffffff', '#c4b5fd', '#67e8f9', '#f9a8d4'][Math.floor(rand() * 4)];
  stars += r(x, y, big ? 3 : 2, big ? 3 : 2, c, ` class="tw" style="animation-delay:${(rand() * 4).toFixed(2)}s;animation-duration:${(2.5 + rand() * 3).toFixed(2)}s"`);
}

// moon (pixel disc with craters)
let moon = '';
const MX = W - 92, MY = 40, MR = 22;
for (let y = -MR; y <= MR; y += 2) for (let x = -MR; x <= MR; x += 2)
  if (x * x + y * y <= MR * MR) moon += r(MX + x, MY + y, 2, 2, (x + 8) ** 2 + (y + 4) ** 2 < 40 || (x - 9) ** 2 + (y - 8) ** 2 < 24 ? '#ddd6fe' : '#f5f3ff');

// skyline
const maxWeek = Math.max(1, ...weeks.map(w => w.reduce((a, b) => a + b, 0)));
const maxDay = Math.max(1, ...weeks.flat());
const winColor = c => c / maxDay > .66 ? '#f0abfc' : c / maxDay > .33 ? '#67e8f9' : '#c4b5fd';
let city = '', backCity = '';

// far silhouette layer for depth
for (let x = 0; x < W; x += 24) {
  const h = 30 + Math.floor(rand() * 9) * 6;
  backCity += r(x, GROUND - h, 22, h, '#1c1538');
}

weeks.forEach((week, wi) => {
  const total = week.reduce((a, b) => a + b, 0);
  const x = X0 + wi * COL;
  if (!total) {                                     // quiet week → dark low-rise, lights off
    const lh = 12 + Math.floor(rand() * 3) * 6;
    city += r(x, GROUND - lh, BW, lh, '#1d1638') + r(x, GROUND - lh, BW, 2, '#2a2050');
    for (let y = GROUND - lh + 5; y + 3 < GROUND - 3; y += 6) city += r(x + 2, y, 3, 3, '#140f28') + r(x + 7, y, 3, 3, '#140f28');
    return;
  }
  const h = Math.max(30, Math.round((24 + Math.sqrt(total / maxWeek) * 150) / 6) * 6);
  const top = GROUND - h;
  city += r(x, top, BW, h, '#241b45') + r(x, top, BW, 2, '#3b2d6b');
  if (total === maxWeek) city += r(x + 5, top - 10, 2, 10, '#a78bfa') + r(x + 5, top - 12, 2, 2, '#f472b6', ' class="blink"');
  // window grid: 2 columns, rows every 6px
  const slots = [];
  for (let y = top + 5; y + 3 < GROUND - 3; y += 6) slots.push([x + 2, y], [x + 7, y]);
  // the 7 days of the week light the lowest windows, in order
  week.forEach((c, d) => {
    const slot = slots[slots.length - 1 - d];
    if (!slot) return;
    city += c
      ? r(slot[0], slot[1], 3, 3, winColor(c), rand() < .12 ? ` class="fl" style="animation-delay:${(rand() * 6).toFixed(1)}s"` : '')
      : r(slot[0], slot[1], 3, 3, '#18122e');
  });
  // upper floors: mostly dark, a few lit for texture
  for (let k = 0; k < slots.length - 7; k++)
    city += r(slots[k][0], slots[k][1], 3, 3, rand() < .18 ? '#4c3d80' : '#18122e');
});

// ground
const ground = r(0, GROUND, W, H - GROUND, '#0d0a1c') + r(0, GROUND, W, 2, '#3b2d6b') +
  Array.from({ length: 22 }, (_, k) => r(k * 40 + 8, GROUND + 14, 18, 2, '#1f1840')).join('');

const ghost = sprite(GHOST, { w: '#f5f3ff', k: '#1e1b4b', p: '#f472b6' }, 3, 0, 0);
const bat = sprite(BAT, { k: '#0b0816' }, 3, 0, 0);

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" role="img" aria-label="${LOGIN}'s contribution night city: ${fmt(allTime)} total contributions">
<title>${LOGIN}'s contribution city</title>
<style>
  .tw{animation:tw 3s ease-in-out infinite}
  .fl{animation:fl 6s steps(1) infinite}
  .blink{animation:tw 1.2s steps(1) infinite}
  .ghost{animation:fly 26s linear infinite}
  .bob{animation:bob 2.4s ease-in-out infinite}
  .bat{animation:bat 19s linear infinite 4s;transform:translate(-60px,0)}
  .flap{animation:flap .35s steps(1) infinite}
  .t{font-family:'Courier New',ui-monospace,monospace;font-weight:700}
  @keyframes tw{0%,100%{opacity:1}50%{opacity:.25}}
  @keyframes fl{0%,88%,100%{opacity:1}90%,94%{opacity:.15}}
  @keyframes fly{0%{transform:translate(-60px,92px)}50%{transform:translate(${W / 2}px,48px)}100%{transform:translate(${W + 60}px,96px)}}
  @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
  @keyframes bat{0%{transform:translate(${W + 30}px,70px)}100%{transform:translate(-40px,130px)}}
  @keyframes flap{0%{transform:scaleY(1)}50%{transform:scaleY(-.6)}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#07060d"/><stop offset=".7" stop-color="#160f2e"/><stop offset="1" stop-color="#2a1650"/>
  </linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="#a78bfa" stop-opacity=".35"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></radialGradient>
  <clipPath id="frame"><rect width="${W}" height="${H}" rx="14"/></clipPath>
</defs>
<g clip-path="url(#frame)">
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<circle cx="${MX}" cy="${MY}" r="60" fill="url(#glow)" shape-rendering="auto"/>
${stars}${moon}
<g opacity=".9">${backCity}</g>
${city}
${ground}
<g class="bat"><g class="flap" style="transform-origin:10px 6px">${bat}</g></g>
<g class="ghost"><g class="bob">
  <ellipse cx="19" cy="18" rx="30" ry="26" fill="url(#glow)" shape-rendering="auto"/>${ghost}
</g></g>
<text class="t" x="22" y="34" font-size="18" fill="#f5f3ff">${LOGIN}<tspan fill="#a78bfa">.city</tspan></text>
<text class="t" x="22" y="54" font-size="11" fill="#a1a1c2">one tower per week · lit windows = days I shipped · the city grows as I code</text>
<g class="t" font-size="12">
  <text x="22" y="${GROUND + 30}" fill="#c4b5fd">total contributions <tspan fill="#f5f3ff">${fmt(allTime)}</tspan></text>
  <text x="${W / 2}" y="${GROUND + 30}" text-anchor="middle" fill="#67e8f9">last year <tspan fill="#f5f3ff">${fmt(cal.totalContributions)}</tspan> · busiest day <tspan fill="#f5f3ff">${maxDay}</tspan></text>
  <text x="${W - 22}" y="${GROUND + 30}" text-anchor="end" fill="#f9a8d4">streak <tspan fill="#f5f3ff">${current}</tspan> · best <tspan fill="#f5f3ff">${longest}</tspan></text>
</g>
</g>
</svg>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg.trim() + '\n');
console.log(`wrote ${OUT}: ${weeks.length} weeks, ${fmt(allTime)} all-time, ${cal.totalContributions} last year, streak ${current}/${longest}`);
