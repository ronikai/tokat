/* ===========================================================
   TOKAT BAR — varliklar
   Karakter portreleri ve eller: pixel-art PNG (img/)
   Sise / kadeh / seyirci: kod ile cizilmis SVG
   =========================================================== */
const ASSETS = (function () {
  'use strict';

  /* ---------------- KARAKTERLER ---------------- */
  const CHARACTERS = [
    { id: 'p1', name: 'BARAN', tag: 'Sert Bakis', img: 'img/p1.png', hit: 'img/a1.png', hand: 'img/hand1.png' },
    { id: 'p2', name: 'AYHAN', tag: 'Demir Yumruk', img: 'img/p2.png', hit: 'img/a2.png', hand: 'img/hand5.png' },
    { id: 'p3', name: 'METIN', tag: 'Soguk Kan', img: 'img/p3.png', hit: 'img/a3.png', hand: 'img/hand3.png' },
    { id: 'p4', name: 'HASAN', tag: 'Dag Gibi', img: 'img/p4.png', hit: 'img/a4.png', hand: 'img/hand6.png' },
    { id: 'p5', name: 'KENAN', tag: 'Metal Cene', img: 'img/p5.png', hit: 'img/a5.png', hand: 'img/hand9.png' },
    { id: 'p6', name: 'POLAT', tag: 'Celik Bilek', img: 'img/p6.png', hit: 'img/a6.png', hand: 'img/hand2.png' },
    { id: 'p7', name: 'RECEP', tag: 'Biyikli Dev', img: 'img/p7.png', hit: 'img/a7.png', hand: 'img/hand4.png' },
    { id: 'p8', name: 'CAN', tag: 'Dovmeler', img: 'img/p8.png', hit: 'img/a8.png', hand: 'img/hand7.png' },
    { id: 'p9', name: 'RUSTEM', tag: 'Tecrube', img: 'img/p9.png', hit: 'img/a9.png', hand: 'img/hand8.png' },
    { id: 'p10', name: 'GOLGE', tag: 'Gizemli Tokatci', img: 'img/p10.png', hit: 'img/a10.png', hand: 'img/hand9.png' }
  ];
  const byId = {};
  CHARACTERS.forEach(function (c) { byId[c.id] = c; });

  /* ---------------- ELLER ---------------- */
  const HANDS = [
    { id: 'hand1', name: 'Deri Eldiven', img: 'img/hand1.png' },
    { id: 'hand2', name: 'Yumruk', img: 'img/hand2.png' },
    { id: 'hand3', name: 'Beyaz Kol', img: 'img/hand3.png' },
    { id: 'hand4', name: 'Uzun Parmak', img: 'img/hand4.png' },
    { id: 'hand5', name: 'Robot El', img: 'img/hand5.png' },
    { id: 'hand6', name: 'Iri El', img: 'img/hand6.png' },
    { id: 'hand7', name: 'Yuzuklu', img: 'img/hand7.png' },
    { id: 'hand8', name: 'Acik Avuc', img: 'img/hand8.png' },
    { id: 'hand9', name: 'Siyah Eldiven', img: 'img/hand9.png' }
  ];
  const handById = {};
  HANDS.forEach(function (h) { handById[h.id] = h; });

  /* ---------------- SISE / KADEH ---------------- */
  function bottleSVG(o) {
    o = o || {};
    const glass = o.glass || '#2f5f3e';
    const liquid = o.liquid || '#8a3b1e';
    const cap = o.cap || '#c9a15a';
    const label = o.label || '#efe0c2';
    return `
<svg viewBox="0 0 100 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
  <path d="M38,14 h24 v58 c0,10 22,24 22,56 v140 c0,16 -12,26 -34,26 c-22,0 -34,-10 -34,-26 v-140 c0,-32 22,-46 22,-56 z" fill="${glass}"/>
  <path d="M40,72 c-4,18 -18,30 -18,58 v130 c0,10 6,18 14,22 c-6,-8 -8,-14 -8,-24 v-128 c0,-26 10,-40 12,-58 z" fill="#ffffff" opacity=".22"/>
  <path d="M46,150 h12 v118 c0,6 -4,10 -10,10 c-6,0 -10,-4 -10,-10 z" fill="${liquid}"/>
  <rect x="26" y="166" width="52" height="66" rx="5" fill="${label}"/>
  <rect x="26" y="166" width="52" height="66" rx="5" fill="${glass}" opacity=".12"/>
  <rect x="34" y="180" width="36" height="6" rx="3" fill="${glass}" opacity=".5"/>
  <rect x="34" y="194" width="26" height="5" rx="2.5" fill="${glass}" opacity=".35"/>
  <rect x="34" y="206" width="30" height="5" rx="2.5" fill="${glass}" opacity=".35"/>
  <rect x="36" y="6" width="28" height="16" rx="4" fill="${cap}"/>
</svg>`;
  }

  function glassSVG(liquid) {
    liquid = liquid || '#c9873b';
    return `
<svg viewBox="0 0 100 160" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
  <path d="M14,12 h72 l-8,130 c-1,12 -16,16 -28,16 c-12,0 -27,-4 -28,-16 z" fill="#e8f2f4" opacity=".28"/>
  <path d="M20,76 h60 l-6,66 c-1,9 -14,12 -24,12 c-10,0 -23,-3 -24,-12 z" fill="${liquid}" opacity=".9"/>
  <path d="M20,76 h60 l-1,10 h-58 z" fill="#ffffff" opacity=".35"/>
  <path d="M24,16 l-4,116 c6,6 14,8 24,8 c-8,-3 -13,-7 -14,-13 z" fill="#ffffff" opacity=".35"/>
  <path d="M14,12 h72 l-1,8 h-70 z" fill="#ffffff" opacity=".7"/>
</svg>`;
  }

  /* ---------------- SEYIRCI ---------------- */
  const crowdTints = ['#0c0a14', '#120e1c', '#171021', '#0f0c18', '#141020'];
  function audienceSVG(i, hot) {
    const tint = crowdTints[i % crowdTints.length];
    const shirt = hot ? '#241a2e' : tint;
    return `
<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg">
  <path d="M30,240 C30,192 60,168 100,168 C140,168 170,192 170,240 Z" fill="${shirt}"/>
  <circle cx="100" cy="112" r="44" fill="${tint}"/>
  <path d="M64,96 C68,68 90,56 110,60 C132,64 142,84 138,104 C126,88 106,80 84,86 Z" fill="#000" opacity=".35"/>
  <path d="M126,76 C140,84 146,98 144,112" stroke="#c98b46" stroke-width="5" fill="none" opacity=".5"/>
  <path d="M54,196 C62,178 78,170 96,170" stroke="#c98b46" stroke-width="4" fill="none" opacity=".22"/>
</svg>`;
  }

  /* ---------------- EFEKTLER ---------------- */
  function starSVG() {
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50,4 L61,36 L96,38 L68,58 L78,92 L50,72 L22,92 L32,58 L4,38 L39,36 Z" fill="#ffd76a" stroke="#a86a12" stroke-width="4" stroke-linejoin="round"/></svg>`;
  }
  function splashSVG() {
    return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><path d="M100,10 C114,54 146,86 190,100 C146,114 114,146 100,190 C86,146 54,114 10,100 C54,86 86,54 100,10 Z" fill="#fff3c4"/></svg>`;
  }

  return {
    CHARACTERS: CHARACTERS, byId: byId,
    HANDS: HANDS, handById: handById,
    bottleSVG: bottleSVG,
    glassSVG: glassSVG,
    audienceSVG: audienceSVG,
    starSVG: starSVG,
    splashSVG: splashSVG
  };
})();
