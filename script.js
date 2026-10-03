// lógica do jogo.
// Imagens e sons (ficam em recursos.js.)

const cv = document.getElementById('g'), ctx = cv.getContext('2d');
const W = 480, H = 700, R = 20, D = 40, RH = 34.64, SX = W / 2, SY = H - 114, DEAD = H - 176;
let shootT = 0, hurtT = 0, appearT = 0, winAt = 0, power = null, armed = false, charge = 0, fx = [];
const BUF = {}, SRC = {}, B64 = {}, GAIN = { nice: 2.8 };
function getAC() { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac }
function loadAll() {
  B64.vit = VIT_B64; B64.lose = LOSE_B64; B64.risada = RISADA_B64; B64.grito = GRITO_B64; B64.nice = NICE_B64;
  for (const k in B64) {
    if (BUF[k]) continue;
    try {
      const c = getAC(), bin = atob(B64[k]), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++)u[i] = bin.charCodeAt(i);
      const ok = x => { BUF[k] = x };
      const p = c.decodeAudioData(u.buffer, ok, () => { }); if (p && p.then) p.then(ok).catch(() => { });
    } catch (e) { }
  }
}
function stopAll() { for (const k in SRC) { try { SRC[k].stop() } catch (e) { } delete SRC[k] } }
function playSnd(k, fallback) {
  if (mute) return;
  if (k === 'vit' || k === 'lose') stopAll(); else { try { if (SRC[k]) SRC[k].stop() } catch (e) { } }
  if (!BUF[k]) { fallback(); return }
  try { const c = getAC(), s = c.createBufferSource(), g = c.createGain(); g.gain.value = GAIN[k] || 1; s.buffer = BUF[k]; s.connect(g); g.connect(c.destination); s.start(); SRC[k] = s } catch (e) { fallback() }
}
const COL = ['#ffc21a', '#c9ced6', '#2f9bff', '#d9803a', '#9a5cff'];
const ov = document.getElementById('ov'), ovt = document.getElementById('ovt'), ovp = document.getElementById('ovp'), go = document.getElementById('go');
let rows = [], par = 0, cur = 0, nxt = 0, proj = null, fall = [], parts = [], score = 0, lvl = 1, miss = 0, st = 'idle', ang = -Math.PI / 2, best = 0, mute = false, ac, combo = 0, bombs = [];
try { best = +localStorage.getItem('lp-best') || 0 } catch (e) { }
const rnd = (a, b) => a + Math.random() * (b - a);
const cols = r => ((r + par) % 2) ? 11 : 12;
const bx = (r, c) => c * D + R + (((r + par) % 2) ? R : 0), by = r => r * RH + R + 8;

/* sons gerados pelo navegador */
function snd(f, d, type, v, to, delay) {
  if (mute) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(v || .15, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
  } catch (e) { }
}
document.getElementById('mute').onclick = function () { mute = !mute; if (mute) stopAll(); this.textContent = 'Som: ' + (mute ? 'desligado' : 'ligado') };

function newRow(n) { return new Array(n).fill(-1) }
function pick() {
  const s = new Set(); rows.forEach(r => r.forEach(c => { if (c >= 0) s.add(c) }));
  const a = [...s]; return a.length ? a[Math.floor(Math.random() * a.length)] : 0;
}
function initLevel() {
  par = 0; rows = []; miss = 0; fall = []; parts = []; proj = null; bombs = []; appearT = .9;
  const nr = Math.min(4 + lvl, 8), nc = Math.min(3 + lvl, 5);
  for (let r = 0; r < nr; r++) { rows.push(newRow(cols(r)).map(() => Math.floor(Math.random() * nc))) }
  cur = pick(); nxt = pick();
}
function start() { stopAll(); loadAll(); power = null; armed = false; charge = 0; fx = []; score = 0; lvl = 1; initLevel(); st = 'play'; ov.hidden = true; combo = 0 }
function nextLevel() { stopAll(); loadAll(); lvl++; initLevel(); st = 'play'; ov.hidden = true }
function neigh(r, c) {
  const p = (r + par) % 2;
  const l = p ? [[r, c - 1], [r, c + 1], [r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]] : [[r, c - 1], [r, c + 1], [r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]];
  return l.filter(([a, b]) => a >= 0 && a < rows.length && b >= 0 && b < cols(a));
}
function addRow() {
  par ^= 1;
  const nc = Math.min(3 + lvl, 5);
  rows.unshift(newRow(cols(0)).map(() => Math.floor(Math.random() * nc)));
  hurtT = .6; snd(160, .25, 'square', .08, 100);
}
function burst(x, y, c, n) { for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), s = rnd(40, 220); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: rnd(.3, .7), c }) } }

function plantBomb(x, y) {
  let bd = 1e9, bx0 = x, by0 = y;
  rows.forEach((row, r) => row.forEach((v, c) => { if (v < 0) { const d = Math.hypot(bx(r, c) - x, by(r) - y); if (d < bd) { bd = d; bx0 = bx(r, c); by0 = by(r) } } }));
  if (bd >= D) { bx0 = x; by0 = y }
  bombs.push({ x: bx0, y: by0, t: 3 });
  snd(200, .12, 'square', .12, 120);
  playSnd('grito', () => { });
  finish();
}
function settle(x, y) {
  if (proj.type === 'bomb') { plantBomb(x, y); return }
  const need = Math.floor((y - R - 8) / RH) + 2;
  while (rows.length < need) rows.push(newRow(cols(rows.length)));
  let bd = 1e9, br = 0, bc = 0;
  rows.forEach((row, r) => row.forEach((v, c) => {
    if (v >= 0) return;
    const d = Math.hypot(bx(r, c) - x, by(r) - y);
    if (d < bd) { bd = d; br = r; bc = c }
  }));
  if (proj.type === 'wild') { const cnt = {}; neigh(br, bc).forEach(([a, b]) => { const v = rows[a][b]; if (v >= 0) cnt[v] = (cnt[v] || 0) + 1 }); const ks = Object.keys(cnt).sort((p, o) => cnt[o] - cnt[p]); proj.c = ks.length ? +ks[0] : proj.c }
  rows[br][bc] = proj.c;
  // grupo da mesma cor
  const seen = new Set([br + ',' + bc]), q = [[br, bc]];
  for (let i = 0; i < q.length; i++)for (const [a, b] of neigh(q[i][0], q[i][1])) {
    const k = a + ',' + b;
    if (!seen.has(k) && rows[a][b] === proj.c) { seen.add(k); q.push([a, b]) }
  }
  let popped = 0;
  if (q.length >= 3) {
    combo++; charge += q.length; if (combo > 1) { score += 10 * combo; floaty('COMBO x' + combo, x, y); snd(700 + combo * 80, .2, 'triangle', .1); if (combo >= 7 && (combo - 7) % 3 === 0) { try { if (SRC.risada) SRC.risada.stop() } catch (e) { } playSnd('nice', () => { }) } else if (combo >= 3) playSnd('risada', () => { }) }
    q.forEach(([a, b], i) => {
      burst(bx(a, b), by(a), COL[rows[a][b]], 8); rows[a][b] = -1; score += 10; popped++;
      snd(520 + i * 70, .14, 'triangle', .12, null, i * .05);
    });
    dropFloating();
    miss = 0;
  } else { miss++; combo = 0; snd(220, .1, 'square', .06) }
  finish();
}
function finish(keep) {
  grant(); if (miss >= 5) { addRow(); miss = 0 }
  while (rows.length > 1 && rows[rows.length - 1].every(v => v < 0)) rows.pop();
  if (!keep) proj = null;
  const empty = rows.every(r => r.every(v => v < 0));
  let lost = false;
  rows.forEach((row, r) => row.forEach(v => { if (v >= 0 && by(r) + R > DEAD) lost = true }));
  if (empty) {
    bombs = []; st = 'win'; winAt = performance.now(); ovt.textContent = 'Fase ' + lvl + ' concluída!'; ovp.textContent = 'Pontos: ' + score + '. A próxima fase tem mais moedas e mais tipos.'; go.textContent = 'Próxima fase'; ov.hidden = false;
    playSnd('vit', () => [523, 659, 784, 1047].forEach((f, i) => snd(f, .2, 'triangle', .12, null, i * .12)));
    return;
  }
  if (lost) {
    bombs = []; st = 'over'; if (score > best) { best = score; try { localStorage.setItem('lp-best', best) } catch (e) { } }
    ovt.textContent = 'As moedas chegaram ao fundo'; ovp.textContent = 'Pontos: ' + score + '. Recorde: ' + best + '.'; go.textContent = 'Tentar de novo'; ov.hidden = false;
    playSnd('lose', () => snd(300, .7, 'sawtooth', .1, 70)); return;
  }
  if (!rows.some(r => r.includes(cur))) cur = pick();
  if (!rows.some(r => r.includes(nxt))) nxt = pick();
}
function shoot() {
  if (st !== 'play' || proj) return;
  const s = 900;
  proj = { x: SX, y: SY, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, c: cur };
  if (armed && power) { proj.type = power; power = null; armed = false } else { cur = nxt; nxt = pick() } shootT = .35; snd(420, .14, 'sine', .14, 900);
}
function swap() { const t = cur; cur = nxt; nxt = t; snd(700, .06, 'sine', .08) }
function aimAt(e) {
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
  ang = Math.max(-Math.PI + .15, Math.min(-.15, Math.atan2(y - SY, x - SX)));
}
let aiming = false, aimId = null;
const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H] };
cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || aiming) aimAt(e) });
cv.addEventListener('pointerdown', e => {
  cv.focus({ preventScroll: true });
  const [x, y] = pt(e);
  if (st === 'play' && power && Math.hypot(x - 130, y - (H - 45)) < 34) { armed = !armed; snd(800, .08, 'sine', .1); return }
  if (st === 'play' && Math.hypot(x - 60, y - (H - 45)) < 34) { swap(); return }
  aimAt(e);
  if (e.pointerType === 'mouse') { shoot(); return }
  aiming = true; aimId = e.pointerId; try { cv.setPointerCapture(e.pointerId) } catch (_) { }
});
cv.addEventListener('pointerup', e => {
  if (!aiming || e.pointerId !== aimId) return;
  aiming = false;
  const y = pt(e)[1];
  if (y < H - 70) { aimAt(e); shoot() }
});
cv.addEventListener('pointercancel', () => { aiming = false });
cv.addEventListener('contextmenu', e => e.preventDefault());
go.onclick = () => { (st === 'win' ? nextLevel : start)(); cv.focus({ preventScroll: true }) };
addEventListener('keydown', e => {
  if (document.activeElement !== cv) return;
  if (e.key === 'ArrowLeft') { ang = Math.max(-Math.PI + .15, ang - .06); e.preventDefault() }
  if (e.key === 'ArrowRight') { ang = Math.min(-.15, ang + .06); e.preventDefault() }
  if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); if (st === 'play') shoot(); else { go.click() } }
  if (e.key.toLowerCase() === 'x' && st === 'play') swap();
  if (e.key.toLowerCase() === 'c' && st === 'play' && power) { armed = !armed; snd(800, .08, 'sine', .1) }
});

function update(dt) {
  shootT -= dt; hurtT -= dt; appearT -= dt; fx = fx.filter(f => (f.t += dt) < 1.1);
  if (st === 'play' && bombs.length) {
    bombs.forEach(b => b.t -= dt);
    const due = bombs.filter(b => b.t <= 0); bombs = bombs.filter(b => b.t > 0);
    for (const b of due) { if (st !== 'play') break; boom(b.x, b.y, true) }
  }
  if (proj) {
    const steps = Math.ceil(Math.hypot(proj.vx, proj.vy) * dt / 6);
    for (let i = 0; i < steps && proj; i++) {
      proj.x += proj.vx * dt / steps; proj.y += proj.vy * dt / steps;
      if (proj.x < R) { proj.x = R; proj.vx *= -1 }
      if (proj.x > W - R) { proj.x = W - R; proj.vx *= -1 }
      let hit = proj.y <= R + 8;
      if (!hit) rows.forEach((row, r) => row.forEach((v, c) => { if (v >= 0 && Math.hypot(bx(r, c) - proj.x, by(r) - proj.y) < D - 5) hit = true }));
      if (hit) { settle(proj.x, proj.y); break }
    }
  }
  fall = fall.filter(f => { f.vy += 900 * dt; f.y += f.vy * dt; return f.y < H + 30 });
  parts = parts.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt; return p.l > 0 });
}
function bubble(x, y, c, a) {
  ctx.globalAlpha = a || 1;
  if (CN.complete && CN.naturalWidth) {
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(CN, c * 80, 0, 80, 80, x - R + .5, y - R + .5, D - 1, D - 1);
    ctx.imageSmoothingEnabled = false;
  } else {
    ctx.fillStyle = COL[c]; ctx.beginPath(); ctx.arc(x, y, R - 1.5, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function guide() {
  let x = SX, y = SY, vx = Math.cos(ang) * 6, vy = Math.sin(ang) * 6;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 0; i < 260; i++) {
    x += vx; y += vy;
    if (x < R || x > W - R) { vx *= -1; x = Math.max(R, Math.min(W - R, x)) }
    if (y <= R + 8) break;
    let hit = false;
    rows.forEach((row, r) => row.forEach((v, c) => { if (v >= 0 && Math.hypot(bx(r, c) - x, by(r) - y) < D - 5) hit = true }));
    if (hit) break;
    if (i % 4 === 0 && i > 6) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 6.283); ctx.fill() }
  }
}
const SP = { "idle": [[0, 0, 62, 138], [64, 0, 61, 137], [127, 0, 59, 139], [188, 0, 60, 138], [250, 0, 58, 139], [310, 0, 59, 138]], "shoot": [[371, 0, 85, 139], [458, 0, 79, 138], [539, 0, 141, 138]], "hurt": [[682, 0, 115, 138]], "lose": [[799, 0, 159, 68], [960, 0, 135, 58]], "appear": [[0, 141, 132, 133], [134, 141, 67, 133], [203, 141, 67, 133], [272, 141, 67, 133]], "back": [[341, 141, 75, 154], [418, 141, 75, 152], [495, 141, 76, 153], [573, 141, 74, 154]], "avatar": [[649, 141, 163, 158]], "logo": [[814, 141, 283, 164]], "win": [[0, 310, 73, 108], [75, 310, 73, 108], [150, 310, 73, 108], [225, 310, 73, 108], [300, 310, 73, 108], [375, 310, 73, 108], [450, 310, 73, 108], [525, 310, 73, 108]], "winv": [[0, 422, 98, 125], [100, 422, 98, 125], [200, 422, 98, 125], [300, 422, 98, 125]] };
function spr(c, n, i, cx, bot, s, flip) {
  const f = SP[n][i % SP[n].length]; if (!AT.complete || !f) return;
  const w = f[2] * s, h = f[3] * s;
  c.save(); c.translate(cx, bot); if (flip) c.scale(-1, 1); c.imageSmoothingEnabled = false;
  c.drawImage(AT, f[0], f[1], f[2], f[3], -w / 2, -h, w, h); c.restore();
}
function mascot(now) {
  const L = Math.cos(ang) < 0, b = H - 6, s = .72;
  if (st === 'win') { const k = (now - winAt) / 130, w = 1; if (k < 8) spr(ctx, 'win', Math.floor(k), SX, b, w); else spr(ctx, 'winv', Math.floor((k - 8) / 5), SX, b, w) }
  else if (st === 'over') spr(ctx, 'lose', Math.floor(now / 700), SX, b, s);
  else if (appearT > 0) spr(ctx, 'appear', Math.min(3, Math.floor((.9 - appearT) / .9 * 4)), SX, b, s);
  else if (hurtT > 0) spr(ctx, 'hurt', 0, SX, b, s, L);
  else if (shootT > 0) spr(ctx, 'shoot', Math.min(2, Math.floor((.35 - shootT) / .35 * 3)), SX, b, s, L);
  else spr(ctx, 'back', Math.floor(now / 230), SX, b, s);
}
function draw(now) {
  ctx.imageSmoothingEnabled = false;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a2870'); g.addColorStop(1, '#070b1f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,226,120,.3)';
  for (let i = 0; i < 10; i++) { const y = ((H + 40) - ((now / 18 + i * 83) % (H + 40))), x = (i * 97) % W, s = 3 + i % 3 * 2; ctx.fillRect(x - 1, y - s, 2, s * 2); ctx.fillRect(x - s, y - 1, s * 2, 2) }
  ctx.fillStyle = '#0a1a6b'; ctx.fillRect(0, H - 10, W, 10);
  ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(255,107,107,.9)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, DEAD); ctx.lineTo(W, DEAD); ctx.stroke(); ctx.setLineDash([]);
  rows.forEach((row, r) => row.forEach((v, c) => { if (v >= 0) bubble(bx(r, c), by(r), v) }));
  fall.forEach(f => bubble(f.x, f.y, f.c));
  bombs.forEach(b => {
    const k = Math.max(0, b.t) / 3, p = 1 + .1 * Math.sin(now / (40 + k * 120));
    ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,93,143,' + (.25 + .45 * (1 - k)) + ')'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, D * 2.3, 0, 6.283); ctx.stroke(); ctx.restore();
    icon(b.x, b.y, 'bomb', R * p);
    if (b.t < 1) { ctx.globalAlpha = .4 * (.5 + .5 * Math.sin(now / 40)); ctx.fillStyle = '#ff5d8f'; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1 }
    ctx.fillStyle = '#fff'; ctx.font = '700 16px Silkscreen,monospace'; ctx.textAlign = 'center'; ctx.fillText(Math.ceil(b.t), b.x, b.y - R - 8); ctx.textAlign = 'left';
  });
  parts.forEach(p => { ctx.globalAlpha = Math.max(0, p.l * 1.5); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 6.283); ctx.fill() });
  ctx.globalAlpha = 1;
  drawFx(); if (st === 'play' && !proj) guide();
  mascot(now);
  if (proj) { proj.type ? icon(proj.x, proj.y, proj.type, R - 1) : bubble(proj.x, proj.y, proj.c) } else if (st !== 'idle') { (armed && power) ? icon(SX, SY, power, R - 1) : bubble(SX, SY, cur) }
  // próxima moeda
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(60, H - 45, 27, 0, 6.283); ctx.fill();
  if (st !== 'idle') bubble(60, H - 45, nxt); drawPower();
  // HUD
  ctx.fillStyle = '#fff'; ctx.font = '700 15px Silkscreen,monospace'; ctx.textAlign = 'left';
  ctx.fillText('Pontos ' + score, 14, DEAD + 26);
  ctx.textAlign = 'right'; ctx.fillText('Fase ' + lvl, W - 14, DEAD + 26);
  ctx.font = '700 10px Silkscreen,monospace'; ctx.fillText('próxima fileira', W - 14, H - 38);
  for (let i = 0; i < 5; i++) { ctx.fillStyle = i < miss ? '#ff6b6b' : 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(W - 18 - i * 18, H - 22 + (-4), 6, 0, 6.283); ctx.fill() }
}
let last = 0;
function loop(ts) {
  const dt = Math.min(.05, (ts - last) / 1000 || 0); last = ts;
  update(dt); draw(ts); if (sp.hidden !== (st !== 'win')) { sp.hidden = st !== 'win'; if (!sp.hidden) drawSplash() } requestAnimationFrame(loop);
}
initLevel(); st = 'idle';
requestAnimationFrame(loop);

function floaty(txt, x, y) { fx.push({ txt, x: Math.max(70, Math.min(W - 70, x)), y, t: 0 }) }
function grant() {
  if (charge >= 12) {
    if (!power) { charge -= 12; power = Math.random() < .5 ? 'bomb' : 'wild'; snd(900, .1, 'triangle', .12); snd(1200, .15, 'triangle', .12, null, .1); floaty(power === 'bomb' ? 'BOMBA!' : 'CURINGA!', W / 2, H - 200) }
    else charge = 12;
  }
}
function dropFloating() {
  const ok = new Set(), q2 = [];
  rows[0].forEach((v, c) => { if (v >= 0) { ok.add('0,' + c); q2.push([0, c]) } });
  for (let i = 0; i < q2.length; i++)for (const [a, b] of neigh(q2[i][0], q2[i][1])) { const k = a + ',' + b; if (!ok.has(k) && rows[a][b] >= 0) { ok.add(k); q2.push([a, b]) } }
  let n = 0;
  rows.forEach((row, r) => row.forEach((v, c) => { if (v >= 0 && !ok.has(r + ',' + c)) { fall.push({ x: bx(r, c), y: by(r), vy: rnd(-120, 0), c: v }); row[c] = -1; score += 20; n++ } }));
  if (n) { charge += n; snd(500, .45, 'sine', .12, 120, .1) }
}
function boom(x, y, keep) {
  let n = 0;
  rows.forEach((row, r) => row.forEach((v, c) => { if (v >= 0 && Math.hypot(bx(r, c) - x, by(r) - y) < D * 2.3) { burst(bx(r, c), by(r), COL[v], 10); row[c] = -1; score += 10; n++ } }));
  burst(x, y, '#ffd24a', 40); fx.push({ ring: 1, x, y, t: 0 }); floaty('+' + n * 10, x, y - 10);
  snd(110, .5, 'sawtooth', .2, 35); snd(60, .4, 'square', .15, 30);
  dropFloating(); miss = 0; finish(keep);
}
function icon(x, y, t, r) {
  if (t === 'bomb') {
    ctx.fillStyle = '#10152b'; ctx.beginPath(); ctx.arc(x, y + 2, r * .82, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#33e0ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = '#ffd24a'; ctx.beginPath(); ctx.moveTo(x + r * .35, y - r * .65); ctx.quadraticCurveTo(x + r * .7, y - r * 1.1, x + r * .95, y - r * .85); ctx.stroke();
    ctx.fillStyle = '#ff5d8f'; ctx.beginPath(); ctx.arc(x + r * .95, y - r * .85, 3.5, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(x - 6, y - 5, 4, 3, -.6, 0, 6.283); ctx.fill();
  } else {
    for (let i = 0; i < 5; i++) { ctx.fillStyle = COL[i]; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * .9, i * 1.2566 - 1.57, (i + 1) * 1.2566 - 1.57); ctx.fill() }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * .9, 0, 6.283); ctx.stroke();
  }
}
function drawFx() {
  fx.forEach(f => {
    if (f.ring) { ctx.globalAlpha = Math.max(0, 1 - f.t * 2); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, D * 2.3 * Math.min(1, f.t * 3), 0, 6.283); ctx.stroke() }
    else { ctx.globalAlpha = Math.max(0, 1.2 - f.t); ctx.fillStyle = '#fff'; ctx.font = '700 16px Silkscreen,monospace'; ctx.textAlign = 'center'; ctx.fillText(f.txt, f.x, f.y - f.t * 40) }
  });
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}
function drawPower() {
  const x = 130, y = H - 45;
  ctx.fillStyle = armed ? 'rgba(255,210,74,.5)' : 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(x, y, 27, 0, 6.283); ctx.fill();
  if (power) { icon(x, y, power, R); if (armed) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 27, 0, 6.283); ctx.stroke() } }
  ctx.fillStyle = '#9fb0e6'; ctx.font = '700 9px Silkscreen,monospace'; ctx.textAlign = 'center';
  ctx.fillText(power ? (armed ? 'ATIVADO' : 'TOQUE OU C') : 'PODER', x, y - 32); ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(30, H - 14, 200, 5);
  ctx.fillStyle = '#ffd24a'; ctx.fillRect(30, H - 14, 200 * Math.min(1, charge / 12), 5);
}

const sp = document.getElementById('splash');
function drawSplash() {
  const x = sp.getContext('2d'); x.clearRect(0, 0, sp.width, sp.height);
  if (VI.complete && VI.naturalWidth) x.drawImage(VI, 0, 0, sp.width, sp.height); else VI.onload = drawSplash;
}
const gal = [...document.querySelectorAll('canvas[data-a]')];
function galLoop(now) {
  gal.forEach(c => {
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); const n = c.dataset.a;
    spr(x, n, Math.floor(now / (n === 'win' ? 170 : n === 'idle' ? 200 : 280)), c.width / 2, c.height - 2, +c.dataset.s)
  });
  requestAnimationFrame(galLoop);
}
requestAnimationFrame(galLoop);

