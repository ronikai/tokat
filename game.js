/* ===========================================================
   TOKAT BAR — oyun
   Iki oyuncu, iki bilgisayar, ayni WiFi (ya da internet).
   PeerJS (WebRTC) ile dogrudan baglanti, sunucu gerekmez.
   =========================================================== */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  const rnd = function (a, b) { return a + Math.random() * (b - a); };
  const pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  const MAX_HP = 100;
  const MISS_LIMIT = 0.08;

  /* guc derecesi -> isim/renk */
  function powerZone(p) {
    if (p >= 0.8) return { name: 'MERKEZ', color: '#6ef08a' };
    if (p >= 0.55) return { name: 'IYI', color: '#ffd76a' };
    if (p >= 0.25) return { name: 'ZAYIF', color: '#ffa94d' };
    return { name: 'KENAR', color: '#ff6b5a' };
  }

  const SWEEP_BASE = 1750;
  const SWEEP_STEP = 0.9;
  const LOCK_TIMEOUT = 6500;
  const PREFIX = 'tokatbar-v1-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /* ---------------- SES ---------------- */
  const SFX = {};
  const SOUNDS = {
    slap1: 'mp3', slap2: 'mp3', slap3: 'mp3',
    hit_soft: 'ogg', glass: 'ogg', click: 'ogg',
    tick: 'ogg', win: 'ogg', error: 'ogg', bong: 'ogg', select: 'ogg'
  };
  Object.keys(SOUNDS).forEach(function (n) {
    const a = new Audio('sfx/' + n + '.' + SOUNDS[n]);
    a.preload = 'auto';
    SFX[n] = a;
  });
  const SLAPS = ['slap1', 'slap2', 'slap3'];

  let actx = null;
  function audioCtx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function play(name, vol, rate) {
    const src = SFX[name];
    if (!src) return;
    try {
      const a = src.cloneNode();
      a.volume = vol == null ? 0.7 : vol;
      a.playbackRate = rate || 1;
      a.play().catch(function () { });
    } catch (e) { }
  }
  function whoosh(dur, vol) {
    const ac = audioCtx(); if (!ac) return;
    dur = dur || 0.26; vol = vol || 0.22;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(); s.buffer = buf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(420, ac.currentTime);
    bp.frequency.exponentialRampToValueAtTime(2600, ac.currentTime + dur * 0.85);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, ac.currentTime + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    s.connect(bp); bp.connect(g); g.connect(ac.destination);
    s.start();
  }
  function crowdNoise(vol) {
    const ac = audioCtx(); if (!ac) return;
    const dur = 1.15;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.03 * w) / 1.03;
      d[i] = last * 3.2;
    }
    const s = ac.createBufferSource(); s.buffer = buf;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(vol || 0.14, ac.currentTime + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    s.connect(lp); lp.connect(g); g.connect(ac.destination);
    s.start();
  }
  let ambGain = null;
  function startAmbience() {
    const ac = audioCtx(); if (!ac || ambGain) return;
    const len = Math.floor(ac.sampleRate * 4);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 4;
    }
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    ambGain = ac.createGain(); ambGain.gain.value = 0.045;
    s.connect(lp); lp.connect(ambGain); ambGain.connect(ac.destination);
    s.start();
  }

  /* ---------------- DURUM ---------------- */
  const S = {
    screen: 'title',
    mode: null,
    role: null,
    myChar: null,
    myHand: null,
    myName: '',
    foeName: '',
    foeChar: null,
    foeHand: null,
    foePicked: null,
    foeHandPicked: null,
    myReady: false,
    foeReady: false,
    myWants: false,
    foeWants: false,
    hpMe: MAX_HP,
    hpFoe: MAX_HP,
    round: 0,
    target: 0.5,
    sweepStart: 0,
    sweepPeriod: SWEEP_BASE,
    phase: 'idle',
    myLock: null,
    foeLock: null,
    timers: [],
    stats: { hits: 0, taken: 0, best: 0, rounds: 0 },
    lastResult: null,
    _needleV: 0.5
  };

  /* ---------------- EKRAN ---------------- */
  const SCREENS = ['screenTitle', 'screenLobby', 'screenSelect', 'screenOver'];
  function showScreen(id) {
    SCREENS.forEach(function (s) { $(s).classList.toggle('show', s === id); });
    $('hud').classList.toggle('off', !!id);
  }

  function after(ms, fn) {
    const t = setTimeout(function () {
      S.timers = S.timers.filter(function (x) { return x !== t; });
      fn();
    }, ms);
    S.timers.push(t);
    return t;
  }
  function clearTimers() {
    S.timers.forEach(clearTimeout);
    S.timers = [];
  }

  /* ===========================================================
     SAHNE
     =========================================================== */
  const glassColors = ['#2f5f3e', '#5a2a1a', '#3a3f6b', '#6b4a1f', '#2a5a5f', '#6b2233', '#8a6a1f'];

  function buildScene() {
    /* pixel yildizlar */
    const ps = $('pixelstars');
    ps.innerHTML = '';
    for (let i = 0; i < 60; i++) {
      const d = document.createElement('div');
      d.className = 'pstar';
      d.style.left = rnd(0, 1600).toFixed(0) + 'px';
      d.style.top = rnd(0, 620).toFixed(0) + 'px';
      d.style.animationDelay = rnd(0, 5).toFixed(2) + 's';
      d.style.opacity = rnd(0.2, 0.7).toFixed(2);
      const s = Math.random() < 0.2 ? 6 : 4;
      d.style.width = s + 'px'; d.style.height = s + 'px';
      ps.appendChild(d);
    }

    function fillShelf(el) {
      el.innerHTML = '';
      for (let i = 0; i < 7; i++) {
        const b = document.createElement('div');
        b.className = 'shelf-bottle';
        const h = Math.round(rnd(120, 210));
        b.style.height = h + 'px';
        b.style.left = (i * 56 + rnd(-8, 8) + 8) + 'px';
        b.style.width = (h * 0.36) + 'px';
        b.innerHTML = ASSETS.bottleSVG({ glass: pick(glassColors), liquid: pick(['#8a3b1e', '#c9873b', '#4a6b2a', '#7a2a2a']) });
        const sv = b.querySelector('svg'); sv.style.height = '100%'; sv.style.width = '100%';
        el.appendChild(b);
      }
      for (let i = 0; i < 6; i++) {
        const b = document.createElement('div');
        b.className = 'shelf-bottle';
        const h = Math.round(rnd(90, 150));
        b.style.height = h + 'px';
        b.style.left = (i * 62 + rnd(0, 10) + 12) + 'px';
        b.style.width = (h * 0.36) + 'px';
        b.style.bottom = '182px';
        b.style.opacity = '.65';
        b.innerHTML = ASSETS.bottleSVG({ glass: pick(glassColors) });
        const sv = b.querySelector('svg'); sv.style.height = '100%'; sv.style.width = '100%';
        el.appendChild(b);
      }
    }
    fillShelf($('shelfL'));
    fillShelf($('shelfR'));

    /* seyirciler */
    const near = [[-40, 396, 214], [148, 404, 224], [320, 414, 232], [1248, 414, 232], [1416, 404, 224], [1600, 396, 214]];
    const far = [[10, 336, 172], [188, 346, 182], [352, 356, 190], [1244, 356, 190], [1404, 346, 182], [1564, 336, 172]];
    const aEl = $('audience'), fEl = $('audienceFar');
    aEl.innerHTML = ''; fEl.innerHTML = '';
    near.forEach(function (p, i) {
      const d = document.createElement('div');
      d.className = 'seat';
      d.style.cssText = 'left:' + p[0] + 'px;top:' + p[1] + 'px;width:' + p[2] + 'px;height:' + (p[2] * 1.2) + 'px;animation-delay:' + (i * 0.37) + 's';
      d.innerHTML = ASSETS.audienceSVG(i, i % 2 === 0);
      aEl.appendChild(d);
    });
    far.forEach(function (p, i) {
      const d = document.createElement('div');
      d.className = 'seat far';
      d.style.cssText = 'left:' + p[0] + 'px;top:' + p[1] + 'px;width:' + p[2] + 'px;height:' + (p[2] * 1.2) + 'px;animation-delay:' + (i * 0.53 + 0.2) + 's';
      d.innerHTML = ASSETS.audienceSVG(i + 3, false);
      fEl.appendChild(d);
    });

    /* tezgah uzerindeki siseler */
    const cs = $('counterShelf');
    cs.innerHTML = '';
    const props = [
      { x: 110, y: 250, h: 240, kind: 'bottle' },
      { x: 200, y: 268, h: 150, kind: 'glass' },
      { x: 258, y: 252, h: 200, kind: 'bottle' },
      { x: 1292, y: 250, h: 230, kind: 'bottle' },
      { x: 1378, y: 266, h: 160, kind: 'glass' },
      { x: 1434, y: 254, h: 190, kind: 'bottle' }
    ];
    props.forEach(function (p) {
      const d = document.createElement('div');
      d.className = 'cprop';
      d.style.cssText = 'left:' + p.x + 'px;top:' + (p.y + 340) + 'px;height:' + p.h + 'px;width:' + (p.kind === 'glass' ? p.h * 0.62 : p.h * 0.36) + 'px';
      d.innerHTML = p.kind === 'glass' ? ASSETS.glassSVG() : ASSETS.bottleSVG({ glass: pick(glassColors) });
      cs.appendChild(d);
    });

    /* on plan */
    $('fgLeft').innerHTML =
      '<div style="left:20px;width:120px;height:420px">' + ASSETS.bottleSVG({ glass: '#24471f' }) + '</div>' +
      '<div style="left:130px;width:100px;height:300px">' + ASSETS.bottleSVG({ glass: '#4a2a14' }) + '</div>' +
      '<div style="left:212px;width:90px;height:170px">' + ASSETS.glassSVG('#b0713a') + '</div>';
    $('fgRight').innerHTML =
      '<div style="right:10px;width:130px;height:440px">' + ASSETS.bottleSVG({ glass: '#2f4a6b' }) + '</div>' +
      '<div style="right:132px;width:96px;height:290px">' + ASSETS.bottleSVG({ glass: '#3d1f10' }) + '</div>';

    renderHand();
  }

  /* ===========================================================
     RENDER
     =========================================================== */
  function renderOpponent(expr) {
    const c = S.foeChar ? ASSETS.byId[S.foeChar] : ASSETS.CHARACTERS[0];
    const src = expr === 'hit' ? c.hit : c.img;
    const op = $('opponent');
    op.classList.toggle('hurt', expr === 'hit');
    let img = op.querySelector('img');
    if (!img) { op.innerHTML = '<img alt="">'; img = op.querySelector('img'); }
    if (img.getAttribute('src') !== src) img.src = src;
  }
  function renderHand() {
    const h = S.myHand ? ASSETS.handById[S.myHand] : null;
    const c = S.myChar ? ASSETS.byId[S.myChar] : null;
    const src = h ? h.img : (c ? c.hand : ASSETS.HANDS[0].img);
    const el = $('hand');
    let img = el.querySelector('img');
    if (!img) { el.innerHTML = '<img alt="">'; img = el.querySelector('img'); }
    if (img.getAttribute('src') !== src) img.src = src;
  }

  function setHand(pose) {
    const h = $('hand');
    if (pose === 'rest') h.style.transform = 'rotate(-10deg) translate(-110px, -10px) scale(.96)';
    else if (pose === 'back') h.style.transform = 'rotate(-34deg) translate(150px, 190px) scale(1.02)';
    else if (pose === 'swing') h.style.transform = 'rotate(-4deg) translate(-380px, -180px) scale(1.12)';
    else if (pose === 'hit') h.style.transform = 'rotate(2deg) translate(-400px, -210px) scale(1.06)';
    else if (pose === 'blocked') h.style.transform = 'rotate(34deg) translate(210px, 260px) scale(.94)';
  }

  /* rakip vurdugunda onun eli ekranin onunden gelir */
  function strikeFoeHand() {
    const h = S.foeHand ? ASSETS.handById[S.foeHand] : null;
    if (!h) return;
    const img = $('foeHand');
    img.src = h.img;
    img.classList.remove('strike');
    void img.offsetWidth;
    img.classList.add('strike');
    setTimeout(function () { img.classList.remove('strike'); }, 740);
  }

  function shake() {
    const st = $('stage');
    st.classList.remove('shake');
    void st.offsetWidth;
    st.classList.add('shake');
    setTimeout(function () { st.classList.remove('shake'); }, 460);
  }
  function flash(kind) {
    const f = $('flash');
    f.classList.toggle('white', kind === 'white');
    f.classList.add('on');
    setTimeout(function () { f.classList.remove('on'); }, 130);
  }
  function announce(text, ms) {
    const el = $('announce');
    el.textContent = text;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    if (ms) after(ms, function () { el.classList.remove('pop'); });
  }
  function floater(text, x, y, color) {
    const d = document.createElement('div');
    d.className = 'floater';
    d.textContent = text;
    if (x != null) d.style.left = x + 'px';
    if (y != null) d.style.top = y + 'px';
    if (color) d.style.color = color;
    $('floaters').appendChild(d);
    setTimeout(function () { d.remove(); }, 1200);
  }
  function stars(cx, cy) {
    const fx = $('fx');
    for (let i = 0; i < 6; i++) {
      const s = document.createElement('div');
      s.className = 'fx-star';
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      const sz = rnd(48, 86);
      s.style.width = sz + 'px'; s.style.height = sz + 'px';
      s.style.setProperty('--dx', rnd(-260, 260).toFixed(0) + 'px');
      s.style.setProperty('--dy', rnd(-220, 60).toFixed(0) + 'px');
      s.style.setProperty('--rot', rnd(-220, 220).toFixed(0) + 'deg');
      s.style.animationDelay = (i * 0.02) + 's';
      s.innerHTML = ASSETS.starSVG();
      fx.appendChild(s);
      setTimeout(function () { s.remove(); }, 950);
    }
    const sp = document.createElement('div');
    sp.style.cssText = 'position:absolute;left:' + cx + 'px;top:' + cy + 'px;width:300px;height:300px;transform:translate(-50%,-50%);animation:starFly .5s ease-out forwards;--dx:0px;--dy:0px;--rot:0deg';
    sp.innerHTML = ASSETS.splashSVG();
    fx.appendChild(sp);
    setTimeout(function () { sp.remove(); }, 600);
  }
  function swooshFx() {
    const fx = $('fx');
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      d.className = 'swoosh';
      d.style.left = rnd(660, 860) + 'px';
      d.style.top = rnd(300, 460) + 'px';
      d.style.width = rnd(180, 320) + 'px';
      d.style.setProperty('--a', rnd(-45, 15).toFixed(0) + 'deg');
      d.style.animationDelay = (i * 0.03) + 's';
      fx.appendChild(d);
      setTimeout(function () { d.remove(); }, 380);
    }
  }
  function crowdJolt() {
    document.querySelectorAll('.seat').forEach(function (s, i) {
      s.classList.remove('jolt');
      void s.offsetWidth;
      s.style.animationDelay = '0s';
      s.classList.add('jolt');
      setTimeout(function () { s.classList.remove('jolt'); s.style.animationDelay = (i * 0.37) + 's'; }, 620);
    });
  }

  /* ===========================================================
     HUD
     =========================================================== */
  function setHp(who, value) {
    const isMe = who === 'me';
    const hp = clamp(Math.round(value), 0, MAX_HP);
    if (isMe) S.hpMe = hp; else S.hpFoe = hp;
    const fill = isMe ? $('myHpFill') : $('foeHpFill');
    const ghost = isMe ? $('myHpGhost') : $('foeHpGhost');
    const text = isMe ? $('myHpText') : $('foeHpText');
    const wrap = isMe ? document.querySelector('.hp-me') : document.querySelector('.hp-foe');
    const r = hp / MAX_HP;
    fill.style.transform = 'scaleX(' + r + ')';
    ghost.style.transform = 'scaleX(' + r + ')';
    text.textContent = hp;
    wrap.classList.toggle('danger', r <= 0.3);
  }
  function setNames() {
    $('myName').textContent = (S.myName || 'SEN').slice(0, 12);
    $('foeName').textContent = (S.foeName || 'RAKIP').slice(0, 12);
  }

  /* ===========================================================
     BAR
     =========================================================== */
  function meterShow(on) { $('meter').classList.toggle('show', !!on); }
  function meterReset() {
    $('meter').classList.remove('locked');
    $('meterPin').classList.remove('show');
    $('meterAbroad').classList.remove('show');
    $('meterPct').textContent = '-';
    $('meterPct').style.color = '';
    $('meterHint').textContent = 'FARE ILE TIKLA VE KILITLE';
    $('meterNeedle').style.left = '50%';
    $('meterZone').style.background = zoneGradient(S.target);
    $('meterCenter').style.left = (S.target * 100) + '%';
  }
  function meterLocked(power) {
    $('meter').classList.add('locked');
    const pin = $('meterPin');
    pin.style.left = (S._needleV * 100) + '%';
    pin.classList.add('show');
    const z = powerZone(power);
    $('meterPct').textContent = '%' + Math.round(power * 100);
    $('meterPct').style.color = z.color;
    $('meterHint').textContent = power <= MISS_LIMIT ? 'ISKA! sira rakibe gecer'
      : power > 0.955 ? 'MUKEMMEL VURUS!'
        : power > 0.8 ? 'MERKEZ - cok iyi'
          : power > 0.55 ? 'iyi vurus'
            : power > 0.25 ? 'zayif vurus' : 'kenar - dikkat';
  }
  function meterShowFoe(v) {
    const el = $('meterAbroad');
    el.style.left = (v * 100) + '%';
    el.classList.add('show');
    $('abroadTag').textContent = (S.foeName || 'RAKIP') + ' %' + Math.round(powerFromV(v) * 100);
  }

  /* ===========================================================
     AKIS
     =========================================================== */
  function resetMatch() {
    clearTimers();
    S.hpMe = MAX_HP; S.hpFoe = MAX_HP;
    S.round = 0;
    S.phase = 'idle';
    S.myLock = S.foeLock = null;
    S.stats = { hits: 0, taken: 0, best: 0, rounds: 0 };
    setHp('me', MAX_HP); setHp('foe', MAX_HP);
    setNames();
    meterReset();
    meterShow(false);
    $('roundBadge').classList.remove('show');
  }

  function startMatch(turn, target) {
    readName();
    S.target = (typeof target === 'number' && target > 0 && target < 1) ? target : newTarget();
    resetMatch();
    renderHand();
    renderOpponent('idle');
    showScreen(null);
    $('roundBadge').classList.add('show');
    S.phase = 'countdown';
    nextRound(turn || 'host', S.target);
  }

  function setTurnBadge() {
    const el = $('turnBadge');
    el.textContent = S.turnIsMine ? 'SIRA SENDE' : 'SIRA RAKİPTE';
    el.classList.remove('mine', 'theirs');
    el.classList.add(S.turnIsMine ? 'mine' : 'theirs');
    el.classList.add('show');
  }

  function nextRound(turn, target) {
    if (S.phase === 'over') return;
    S.turn = (turn === 'guest') ? 'guest' : 'host';
    S.turnIsMine = (S.turn === S.role);
    S.target = (typeof target === 'number' && target > 0 && target < 1) ? target : newTarget();
    S.round++;
    $('roundBadge').textContent = 'ROUND ' + S.round;
    $('roundBadge').classList.add('show');
    meterReset();
    meterShow(false);
    S.myLock = S.foeLock = null;
    S.foeV = null;
    S.phase = 'countdown';
    renderOpponent('idle');
    setHand('rest');
    setTurnBadge();

    announce('ROUND ' + S.round, 850);
    play('bong', 0.45);
    after(900, function () {
      if (S.phase !== 'countdown') return;
      if (S.turnIsMine) {
        startSweep();
      } else {
        announce('RAKIP VURUYOR', 800);
        S.phase = 'waitfoe';
        $('meterHint').textContent = 'rakip vuruyor...';
        if (S.mode === 'solo') {
          after(rnd(1100, 2200), function () {
            if (S.phase !== 'waitfoe') return;
            const bp = botPower(S.round);
            const maxD = Math.max(S.target, 1 - S.target);
            const dir = Math.random() < 0.5 ? -1 : 1;
            const bv = clamp(S.target + dir * (1 - bp) * maxD, 0, 1);
            foeAttack(bp, bv, damageFor(bp));
          });
        }
      }
    });
  }

  function startSweep() {
    if (!S.turnIsMine) return;
    S.phase = 'sweep';
    S.sweepPeriod = SWEEP_BASE * Math.pow(SWEEP_STEP, S.round - 1);
    S.sweepStart = performance.now();
    meterShow(true);
    meterReset();
    play('tick', 0.3);
    after(LOCK_TIMEOUT, function () { if (S.phase === 'sweep') lockNow(); });
  }
  function botPower(round) {
    return clamp(rnd(0.3, 0.84) + Math.min(round, 6) * 0.012, 0.05, 0.99);
  }

  function needleValue(now) {
    const t = now - S.sweepStart;
    const x = ((t % S.sweepPeriod) / S.sweepPeriod);
    return x < 0.5 ? x * 2 : 2 - x * 2;
  }
  /* hedef her raunt rastgele bir yerde: merkez sart degil */
  function newTarget() {
    return rnd(0.2, 0.8);
  }
  function powerFromV(v) {
    const maxD = Math.max(S.target, 1 - S.target);
    return clamp(1 - Math.abs(v - S.target) / maxD, 0, 1);
  }
  function zoneGradient(t) {
    const g = Math.round(t * 100);
    const a = Math.round(g * 0.35);
    const b = Math.round(g * 0.62);
    const c = Math.round(g * 0.82);
    const d = Math.round(g + (100 - g) * 0.18);
    const e = Math.round(g + (100 - g) * 0.38);
    const f = Math.round(g + (100 - g) * 0.65);
    return 'linear-gradient(90deg,#8e2233 0%,#b8452a ' + a + '%,#dd8a2a ' + b + '%,#e8c451 ' + c +
      '%,#57c47f ' + g + '%,#e8c451 ' + d + '%,#dd8a2a ' + e + '%,#b8452a ' + f + '%,#8e2233 100%)';
  }

  function damageFor(p) {
    if (p <= MISS_LIMIT) return 0;
    let d = 8 + p * 20;
    if (p > 0.955) d += 5;
    return Math.round(d);
  }

  function lockNow() {
    if (S.phase !== 'sweep' || !S.turnIsMine) return;
    const v = S._needleV == null ? S.target : S._needleV;
    const p = powerFromV(v);
    S.myLock = p;
    S.phase = 'resolve';
    clearTimers();
    meterLocked(p);
    play('click', 0.55);
    const dmg = damageFor(p);
    netSend({ t: 'attack', p: p, v: v, dmg: dmg, n: S.myName });
    myAttack(p, dmg);
  }

  /* ben vuruyorum */
  function myAttack(p, dmg) {
    setHand('back');
    if (dmg <= 0) {
      announce('ISKA!', 900);
      whoosh(0.32, 0.14);
      after(180, function () {
        setHand('blocked');
        play('hit_soft', 0.45);
        shake();
        crowdJolt();
      });
      after(1400, endTurnStep);
      return;
    }
    after(150, function () { setHand('swing'); swooshFx(); whoosh(0.22, 0.2); });
    after(330, function () {
      setHand('hit');
      shake();
      flash('white');
      play(pick(SLAPS), 0.9, rnd(0.96, 1.05));
      after(70, function () { play('glass', 0.16); });
      renderOpponent('hit');
      const op = $('opponent');
      op.style.transform = 'translateX(30px) rotate(6deg) scale(1.03)';
      setTimeout(function () { op.style.transform = ''; }, 720);
      stars(790, 380);
      crowdJolt();
      floater('-' + dmg, 800, 350);
      setHp('foe', S.hpFoe - dmg);
      S.stats.hits++;
      S.stats.best = Math.max(S.stats.best, dmg);
      if (p > 0.955) announce('MUKEMMEL!', 800);
      else if (dmg >= 26) announce('TEMIZ TOKAT!', 800);
      after(260, function () { crowdNoise(0.12); });
      after(420, function () { setHand('back'); });
    });
    after(900, function () { renderOpponent('idle'); });
    after(1400, endTurnStep);
  }

  /* rakip vuruyor */
  function foeAttack(p, v, dmg) {
    S.phase = 'resolve';
    clearTimers();
    S.foeV = v;
    meterShowFoe(v);
    $('meterHint').textContent = 'rakip vurdu';
    if (dmg <= 0) {
      announce('RAKIP ISKALADI', 950);
      whoosh(0.3, 0.1);
      after(1400, endTurnStep);
      return;
    }
    strikeFoeHand();
    after(150, function () {
      shake();
      flash('red');
      play(pick(SLAPS), 1, rnd(0.9, 1));
      play('glass', 0.22);
      setHand('blocked');
      floater('-' + dmg, 800, 350, '#ffb0a0');
      setHp('me', S.hpMe - dmg);
      S.stats.taken++;
      crowdJolt();
      crowdNoise(0.14);
      if (p > 0.955) after(150, function () { announce('SAGLAM YEDIN', 800); });
    });
    after(1400, endTurnStep);
  }

  function endTurnStep() {
    if (S.hpMe <= 0 || S.hpFoe <= 0) {
      endMatch(S.hpFoe <= 0 && S.hpMe > 0);
      return;
    }
    renderOpponent('idle');
    setHand('rest');
    meterShow(false);
    if (S.mode === 'p2p' && S.role !== 'host') return;
    after(650, function () {
      const next = S.turn === 'host' ? 'guest' : 'host';
      const tg = newTarget();
      if (S.mode === 'p2p') netSend({ t: 'next', turn: next, target: tg });
      nextRound(next, tg);
    });
  }

  function endMatch(iWon) {
    S.phase = 'over';
    clearTimers();
    meterShow(false);
    renderOpponent('idle');
    setHand('rest');
    play(iWon ? 'win' : 'error', 0.65);
    if (iWon) crowdNoise(0.2);
    const c = S.foeChar ? ASSETS.byId[S.foeChar] : ASSETS.CHARACTERS[0];
    after(650, function () {
      $('overTag').textContent = iWon ? 'KAZANDIN' : 'KAYBETTIN';
      $('overTitle').textContent = iWon ? 'TOKAT KRALI' : 'TOKAT YEDIN';
      $('overSub').textContent = iWon ? 'bar senin, tezgah senin' : 'merkeze daha yakin vur';
      $('overFoe').src = c.img;
      $('overStats').innerHTML =
        stat(S.stats.rounds, 'RAUNT') +
        stat(S.stats.best, 'EN SERT TOKAT') +
        stat(Math.max(0, S.hpMe), 'KALAN CAN');
      showScreen('screenOver');
    });
  }
  function stat(v, label) {
    return '<div class="stat"><b>' + v + '</b><span>' + label + '</span></div>';
  }

  /* ===========================================================
     AG
     =========================================================== */
  let peer = null, conn = null;

  /* http:// ile acildiysa (yerel sunucu) dogrudan WebSocket kullanilir:
     internet gerekmez, ayni modemdeki iki bilgisayar eslesir.
     https:// (surge / github) ise PeerJS + STUN kullanilir. */
  const USE_WS = location.protocol === 'http:' && !!location.host;

  function wsConnect(code, isHost) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    try { ws = new WebSocket(proto + '//' + location.host + '/ws'); }
    catch (e) { ws = null; }
    const L = { open: [], data: [], close: [], error: [] };
    const c = {
      open: false,
      send: function (obj) {
        if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (e) { } }
      },
      on: function (ev, cb) { (L[ev] || (L[ev] = [])).push(cb); },
      close: function () { try { if (ws) ws.close(); } catch (e) { } }
    };
    function fire(ev, arg) { (L[ev] || []).forEach(function (f) { f(arg); }); }
    if (!ws) { setTimeout(function () { fire('error', 'noserver'); }, 0); return c; }

    ws.onopen = function () {
      ws.send(JSON.stringify(isHost ? { t: 'create', room: code } : { t: 'join', room: code }));
    };
    ws.onmessage = function (ev) {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || !m.t) return;
      if (m.t === '__wait') { setConn('oda hazir: ' + code, 'ok'); return; }
      if (m.t === '__ready') {
        if (!c.open) { c.open = true; fire('open'); }
        return;
      }
      if (m.t === '__error') { c.failCode = m.code; fire('error', m.code); return; }
      if (m.t === '__peer-left') { c.open = false; fire('close'); return; }
      fire('data', m);
    };
    ws.onclose = function () { if (c.open) { c.open = false; fire('close'); } };
    ws.onerror = function () { fire('error', 'noserver'); };
    return c;
  }

  function setConn(text, cls) {
    $('connText').textContent = text;
    const el = $('conn');
    el.classList.remove('ok', 'bad');
    if (cls) el.classList.add(cls);
  }
  function netSend(obj) {
    if (S.mode !== 'p2p' || !conn || !conn.open) return;
    try { conn.send(obj); } catch (e) { }
  }
  function makeCode() {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  /* yapistirilan linkten ya da metinden 4 haneli kodu cikarir */
  function extractCode(v) {
    if (!v) return '';
    const m = String(v).match(/room=([A-Za-z0-9]{4})/i);
    if (m) return m[1].toUpperCase();
    return String(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  }

  function readName() {
    const el = $('nameInput');
    const v = el ? el.value.trim().slice(0, 12) : '';
    S.myName = v.toUpperCase() || 'OYUNCU';
    try { localStorage.setItem('tokat-name', v); } catch (e) { }
    setNames();
  }
  function destroyNet() {
    try { if (conn) conn.close(); } catch (e) { }
    try { if (peer) peer.destroy(); } catch (e) { }
    conn = null; peer = null;
  }
  function peerOpts() {
    return {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    };
  }

  function hostRoom() {
    if (!USE_WS && typeof Peer === 'undefined') { alert('Baglanti kutuphanesi yuklenemedi (peerjs.min.js).'); return; }
    destroyNet();
    S.mode = 'p2p'; S.role = 'host';
    const code = makeCode();
    $('roomCode').textContent = code;
    $('lobbyLink').textContent = location.origin + location.pathname.replace(/index\.html$/, '') + '?room=' + code;
    $('lobbySub').textContent = 'Arkadasin bu sitede kodu girsin...';
    showScreen('screenLobby');
    setConn('oda aciliyor...');

    if (USE_WS) {
      conn = wsConnect(code, true);
      conn.on('error', function (c) {
        setConn('oda acilamadi', 'bad');
        $('lobbySub').textContent = c === 'taken'
          ? 'Bu kod doldu, tekrar dene.'
          : 'Sunucuya baglanilamadi. start.bat calisiyor mu?';
      });
      wireConn();
      return;
    }

    peer = new Peer(PREFIX + code, peerOpts());
    peer.on('open', function () { setConn('oda hazir: ' + code, 'ok'); play('bong', 0.35); });
    peer.on('connection', function (c) {
      if (conn) { try { c.close(); } catch (e) { } return; }
      conn = c; wireConn();
    });
    peer.on('error', function (err) {
      setConn('hata: ' + (err.type || ''), 'bad');
      if (err.type === 'unavailable-id') $('lobbySub').textContent = 'Bu kod doldu, tekrar dene.';
    });
  }

  function joinRoom(code) {
    if (!USE_WS && typeof Peer === 'undefined') { alert('Baglanti kutuphanesi yuklenemedi.'); return; }
    code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 4) { play('error', 0.6); $('joinCode').focus(); return; }
    destroyNet();
    S.mode = 'p2p'; S.role = 'guest';
    $('roomCode').textContent = code;
    $('lobbySub').textContent = 'odaya baglaniyor...';
    showScreen('screenLobby');
    setConn('baglaniyor...');

    if (USE_WS) {
      conn = wsConnect(code, false);
      conn.on('error', function (c) {
        setConn('oda bulunamadi', 'bad');
        $('lobbySub').textContent = c === 'full'
          ? 'Oda dolu.'
          : 'Oda bulunamadi. Kodu kontrol et.';
        play('error', 0.6);
      });
      wireConn();
      return;
    }

    peer = new Peer(null, peerOpts());
    peer.on('open', function () {
      conn = peer.connect(PREFIX + code, { reliable: true });
      wireConn();
    });
    peer.on('error', function (err) {
      if (err.type === 'peer-unavailable') {
        setConn('oda bulunamadi', 'bad');
        $('lobbySub').textContent = 'Oda bulunamadi. Kodu kontrol et.';
        play('error', 0.6);
      } else {
        setConn('hata: ' + (err.type || ''), 'bad');
      }
    });
  }

  function wireConn() {
    if (!conn) return;
    conn.on('open', function () {
      setConn('bagli', 'ok');
      play('select', 0.55);
      conn.send({ t: 'hello', role: S.role, name: S.myName });
      if (S.role === 'host') {
        after(200, function () {
          showScreen('screenSelect');
          buildCards();
        });
      }
    });
    conn.on('data', onNet);
    conn.on('close', function () {
      setConn('baglanti kapandi', 'bad');
      play('error', 0.5);
      if (S.phase !== 'over') {
        S.phase = 'over';
        clearTimers();
        $('overTag').textContent = 'BAGLANTI KOPTU';
        $('overTitle').textContent = 'ODA DAGILDI';
        $('overSub').textContent = 'arkadasin cikti ya da ag koptu';
        $('overStats').innerHTML = '';
        $('overFoe').src = 'img/p10.png';
        showScreen('screenOver');
      }
    });
  }

  function onNet(m) {
    if (!m || !m.t) return;
    switch (m.t) {
      case 'hello':
        if (m.name) S.foeName = m.name;
        setNames();
        if (S.role === 'guest') { showScreen('screenSelect'); buildCards(); }
        break;
      case 'char':
        if (m.n) S.foeName = m.n;
        S.foePicked = m.char;
        S.foeHandPicked = m.hand || null;
        S.foeReady = false;
        updateCards();
        syncReady();
        break;
      case 'ready':
        if (m.n) S.foeName = m.n;
        S.foePicked = m.char; S.foeChar = m.char;
        S.foeHand = m.hand || null;
        S.foeReady = true;
        updateCards();
        syncReady();
        break;
      case 'fight': {
        const mine = S.role === 'guest' ? m.g : m.h;
        const theirs = S.role === 'guest' ? m.h : m.g;
        S.myChar = mine.c; S.myHand = mine.h;
        S.foeChar = theirs.c; S.foeHand = theirs.h;
        if (theirs.n) S.foeName = theirs.n;
        S.myReady = false; S.foeReady = false;
        startMatch(m.turn || 'host', m.target);
        break;
      }
      case 'attack':
        if (m.n) S.foeName = m.n;
        foeAttack(m.p, m.v, m.dmg);
        break;
      case 'next':
        nextRound(m.turn, m.target);
        break;
      case 'rematch':
        S.foeWants = true;
        perhapsRematch();
        break;
    }
  }

  /* ===========================================================
     SECIM EKRANI
     =========================================================== */
  function buildCards() {
    const wrap = $('cards');
    wrap.innerHTML = '';
    ASSETS.CHARACTERS.forEach(function (c) {
      const el = document.createElement('div');
      el.className = 'card';
      el.dataset.id = c.id;
      el.innerHTML = '<img src="' + c.img + '" alt="">' +
        '<div class="card-name">' + c.name + '</div>' +
        '<div class="card-tag">' + c.tag + '</div>';
      el.onclick = function () {
        if (S.foePicked === c.id) { play('error', 0.4); return; }
        S.myChar = c.id;
        if (!S.myHand) S.myHand = defaultHandFor(c.id);
        S.myReady = false;
        play('select', 0.55);
        updateCards();
        renderHand();
        $('btnReady').disabled = false;
        netSend({ t: 'char', char: c.id, hand: S.myHand, n: S.myName });
        syncReady();
      };
      wrap.appendChild(el);
    });

    const hw = $('hands');
    hw.innerHTML = '';
    ASSETS.HANDS.forEach(function (h) {
      const el = document.createElement('div');
      el.className = 'hcard';
      el.dataset.id = h.id;
      el.innerHTML = '<img src="' + h.img + '" alt="" title="' + h.name + '">';
      el.onclick = function () {
        S.myHand = h.id;
        S.myReady = false;
        play('select', 0.5);
        updateCards();
        renderHand();
        netSend({ t: 'char', char: S.myChar, hand: h.id, n: S.myName });
      };
      hw.appendChild(el);
    });

    updateCards();
    $('btnReady').disabled = !S.myChar;
  }

  function defaultHandFor(charId) {
    const c = ASSETS.byId[charId];
    if (!c) return ASSETS.HANDS[0].id;
    const f = c.hand.split('/').pop().replace('.png', '');
    return ASSETS.handById[f] ? f : ASSETS.HANDS[0].id;
  }

  function updateCards() {
    document.querySelectorAll('.card').forEach(function (el) {
      const id = el.dataset.id;
      el.classList.toggle('sel', id === S.myChar);
      el.classList.toggle('taken', id === S.foePicked && id !== S.myChar);
      const b = el.querySelector('.badge');
      if (b) b.remove();
      if (id === S.foePicked) {
        const nb = document.createElement('div'); nb.className = 'badge'; nb.textContent = 'RAKIP'; el.appendChild(nb);
      }
      if (id === S.myChar) {
        const nb = document.createElement('div'); nb.className = 'badge'; nb.textContent = 'SEN'; el.appendChild(nb);
      }
    });
    document.querySelectorAll('.hcard').forEach(function (el) {
      el.classList.toggle('sel', el.dataset.id === S.myHand);
    });
    const name = S.myChar ? ASSETS.byId[S.myChar].name : '-';
    const hname = S.myHand ? ASSETS.handById[S.myHand].name : '';
    $('myPick').textContent = S.myChar ? name + (hname ? ' / ' + hname : '') : '-';
  }

  function syncReady() {
    if (S.mode !== 'p2p') return;
    if (!S.myReady || !S.foeReady || !S.myChar || !S.foeChar) return;
    if (S.role !== 'host') return;
    const tg = newTarget();
    netSend({ t: 'fight', turn: 'host', target: tg, h: { c: S.myChar, h: S.myHand, n: S.myName }, g: { c: S.foeChar, h: S.foeHand, n: S.foeName } });
    startMatch('host', tg);
  }

  function perhapsRematch() {
    if (!S.myWants || !S.foeWants) return;
    S.myWants = false; S.foeWants = false;
    if (S.mode === 'solo' || !conn || !conn.open) { startMatch('host'); return; }
    if (S.role === 'host') {
      const tg = newTarget();
      netSend({ t: 'fight', turn: 'host', target: tg, h: { c: S.myChar, h: S.myHand, n: S.myName }, g: { c: S.foeChar, h: S.foeHand, n: S.foeName } });
      startMatch('host', tg);
    }
  }

  /* ===========================================================
     PANOYA KOPYALAMA (http uzerinde de calisir)
     =========================================================== */
  function copyText(text) {
    return new Promise(function (resolve) {
      let ok = false;
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;width:1px;height:1px;';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, text.length);
        ok = document.execCommand('copy');
        ta.remove();
      } catch (e) { ok = false; }
      if (ok) { resolve(true); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(function () { resolve(true); })
          .catch(function () { resolve(false); });
      } else {
        resolve(false);
      }
    });
  }

  /* ===========================================================
     BUTONLAR
     =========================================================== */
  function bind() {
    const nameEl = $('nameInput');
    nameEl.addEventListener('input', function () {
      const v = nameEl.value.trim().slice(0, 12);
      S.myName = v.toUpperCase() || 'OYUNCU';
      try { localStorage.setItem('tokat-name', v); } catch (e) { }
      setNames();
    });
    nameEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') nameEl.blur(); });

    $('btnHost').onclick = function () { audioCtx(); readName(); hostRoom(); };
    $('btnJoin').onclick = function () { audioCtx(); readName(); joinRoom($('joinCode').value); };
    $('joinCode').addEventListener('input', function (e) {
      e.target.value = extractCode(e.target.value);
    });
    $('joinCode').addEventListener('paste', function (e) {
      const txt = (e.clipboardData || window.clipboardData).getData('text');
      if (!txt) return;
      e.preventDefault();
      $('joinCode').value = extractCode(txt);
    });
    $('joinCode').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') joinRoom(e.target.value);
    });
    $('btnCopy').onclick = function () {
      const code = $('roomCode').textContent.trim();
      copyText(code).then(function (ok) {
        if (ok) {
          $('lobbySub').textContent = 'kopyalandi: ' + code + ' - arkadasin KATIL kutusuna yapistirsin.';
          play('click', 0.5);
        } else {
          $('lobbySub').textContent = 'kopyalanamadi, kodu elle sec: ' + code;
          play('error', 0.5);
        }
      });
    };
    $('btnCopyLink').onclick = function () {
      const code = $('roomCode').textContent.trim();
      const link = location.origin + location.pathname.replace(/index\.html$/, '') + '?room=' + code;
      copyText(link).then(function (ok) {
        $('lobbySub').textContent = ok ? ('link kopyalandi: ' + link) : ('kopyalanamadi: ' + link);
        if (!ok) play('error', 0.5);
      });
    };
    $('roomCode').addEventListener('click', function () {
      const r = document.createRange();
      r.selectNodeContents(this);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
    });
    $('btnCancel').onclick = function () {
      destroyNet(); S.mode = null; S.role = null;
      showScreen('screenTitle');
      setConn('hazir');
    };
    $('btnReady').onclick = function () {
      if (!S.myChar) return;
      play('click', 0.55);
      S.myReady = true;
      $('btnReady').disabled = true;
      if (S.mode === 'solo') {
        const others = ASSETS.CHARACTERS.filter(function (c) { return c.id !== S.myChar; });
        const foe = pick(others);
        S.foeChar = foe.id;
        S.foePicked = foe.id;
        S.foeHand = defaultHandFor(foe.id);
        S.foeReady = true;
        after(280, startMatch);
        return;
      }
      netSend({ t: 'ready', char: S.myChar, hand: S.myHand, n: S.myName });
      syncReady();
    };
    $('btnSolo').onclick = function () {
      audioCtx();
      S.mode = 'solo'; S.role = 'host';
      S.myChar = null; S.myHand = null; S.foeChar = null; S.foePicked = null;
      S.myReady = S.foeReady = false;
      showScreen('screenSelect');
      buildCards();
    };
    $('btnRematch').onclick = function () {
      play('click', 0.55);
      S.myWants = true;
      $('overSub').textContent = 'tekrar basliyor...';
      if (S.mode === 'solo' || !conn || !conn.open) { startMatch(); return; }
      netSend({ t: 'rematch' });
      perhapsRematch();
    };
    $('btnMenu').onclick = function () {
      destroyNet(); S.mode = null; S.role = null; S.phase = 'idle';
      showScreen('screenTitle');
      setConn('hazir');
    };
    $('btnFs').onclick = function (e) {
      e.stopPropagation();
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () { });
      else document.exitFullscreen().catch(function () { });
    };

    $('stage').addEventListener('pointerdown', function (e) {
      audioCtx(); startAmbience();
      if (e.target.closest('.btn') || e.target.closest('input') || e.target.closest('.card') ||
        e.target.closest('.hcard') || e.target.closest('.fs') || e.target.closest('.screen')) return;
      if (S.phase === 'sweep') lockNow();
    });
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space') {
        e.preventDefault();
        if (S.phase === 'sweep') lockNow();
      }
      if (e.key === 'f' || e.key === 'F') $('btnFs').click();
    });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* ===========================================================
     OLCEK + DONGU
     =========================================================== */
  function fit() {
    const s = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    const st = $('stage');
    st.style.setProperty('--scale', 'scale(' + s + ')');
    st.style.transform = 'scale(' + s + ')';
  }

  let lastV = null;
  function loop(now) {
    if (S.phase === 'sweep') {
      const v = needleValue(now);
      S._needleV = v;
      $('meterNeedle').style.left = (v * 100) + '%';
      const p = powerFromV(v);
      $('meterPct').textContent = '%' + Math.round(p * 100);
      $('meterPct').style.color = powerZone(p).color;
      if (p > 0.988 && (lastV == null || lastV < 0.988)) play('tick', 0.1, 1.7);
      lastV = p;
    }
    requestAnimationFrame(loop);
  }

  /* ===========================================================
     BASLAT
     =========================================================== */
  function init() {
    buildScene();
    bind();
    fit();
    window.addEventListener('resize', fit);
    try {
      const saved = localStorage.getItem('tokat-name');
      if (saved) $('nameInput').value = saved;
    } catch (e) { }
    readName();
    showScreen('screenTitle');
    setConn('hazir');
    setNames();
    setHp('me', MAX_HP);
    setHp('foe', MAX_HP);
    $('hud').classList.add('off');
    S.phase = 'idle';
    requestAnimationFrame(loop);

    const q = new URLSearchParams(location.search);
    const room = q.get('room');
    if (room) $('joinCode').value = room.toUpperCase();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
