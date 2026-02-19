// Squid Poker Solver — Vercel Serverless Function
// POST /api/solve → accepts JSON config, returns JSON result

// Binomial coefficient
function C(n, k) {
  if (k < 0 || k > n) return 0;
  if (k > n - k) k = n - k;
  let r = 1;
  for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
  return r;
}

// === ANALYTICAL SOLVER FOR SINGLE SQUID ===
function solveSingle(cfg) {
  const { n, heroWinRate: wr, penalty: pen, heroSquids: hSq, squidsDealt: sD, suddenDeath: sd, sdOrbit: sdO } = cfg;
  const k = n - sD;

  let ev_safe;
  if (!sd) { ev_safe = pen; }
  else {
    const p2 = 2 * (1 - wr) / (n - 1);
    ev_safe = pen * (1 + Math.pow(1 - p2, sdO));
  }

  function eOpp(m) {
    if (m <= 0) return 0;
    const tgt = sd ? 2 : 1;
    let h = 0;
    for (let q = m; q > tgt; q--) h += (n - 1) / (q * (1 - wr));
    if (sd && m >= 2) {
      const p2 = 2 * (1 - wr) / (n - 1), pw = 1 - p2;
      for (let j = 1; j < sdO; j++) h += j * Math.pow(pw, j - 1) * p2;
      h += sdO * Math.pow(pw, sdO - 1);
    }
    return h;
  }

  function evHero(hS, kk) {
    if (hS >= 1) return { ev: ev_safe, pL: 0, eH: eOpp(kk) };
    if (kk <= 0) return { ev: 0, pL: 0, eH: 0 };
    if (!sd) {
      let ev = -pen * (n - 1), pL = 1, eH = 0;
      for (let j = 2; j <= kk; j++) {
        const ph = wr, po = (j - 1) * (1 - wr) / (n - 1), pm = ph + po;
        eH = 1 / pm + (ph / pm) * eOpp(j - 1) + (po / pm) * eH;
        ev = (ph / pm) * ev_safe + (po / pm) * ev;
        pL = (po / pm) * pL;
      }
      return { ev, pL, eH };
    }
    if (kk === 1) return { ev: -pen * (n - 1), pL: 1, eH: 0 };
    const ph2 = wr, po2 = (1 - wr) / (n - 1), pm2 = ph2 + po2, pw = 1 - pm2;
    const pr = 1 - Math.pow(pw, sdO);
    let ev = (ph2 / pm2) * pr * pen + (po2 / pm2) * pr * (-pen * (n - 1)) + Math.pow(pw, sdO) * (-pen * (n - 2));
    let pL = (po2 / pm2) * pr + Math.pow(pw, sdO);
    let eH = 0;
    for (let j = 1; j < sdO; j++) eH += j * Math.pow(pw, j - 1) * pm2;
    eH += sdO * Math.pow(pw, sdO - 1);
    for (let j = 3; j <= kk; j++) {
      const ph = wr, po = (j - 1) * (1 - wr) / (n - 1), pm = ph + po;
      eH = 1 / pm + (ph / pm) * eOpp(j - 1) + (po / pm) * eH;
      ev = (ph / pm) * ev_safe + (po / pm) * ev;
      pL = (po / pm) * pL;
    }
    return { ev, pL, eH };
  }

  const res = evHero(hSq, k);
  const { ev, pL: pLose, eH: aH } = res;

  const sqt = [];
  if (hSq === 1) {
    sqt.push({ sq: 1, freq: 1, avgPay: ev_safe, marg: null });
  } else {
    const avgPay0 = pLose > 1e-15 ? (ev - (1 - pLose) * ev_safe) / pLose : -pen * (n - 1);
    sqt.push({ sq: 0, freq: pLose, avgPay: avgPay0, marg: null });
    sqt.push({ sq: 1, freq: 1 - pLose, avgPay: ev_safe, marg: ev_safe - avgPay0 });
  }

  let nsv = null;
  const rem = cfg.totalSquids - sD;
  if (hSq === 0 && rem > 0) {
    nsv = ev_safe - evHero(0, k - 1).ev;
  }

  const hist = [];
  if (hSq === 1) {
    if (sd) {
      const p2 = 2 * (1 - wr) / (n - 1), pnr = Math.pow(1 - p2, sdO);
      hist.push({ v: pen, f: 1 - pnr }, { v: pen * 2, f: pnr });
    } else { hist.push({ v: pen, f: 1 }); }
  } else if (!sd) {
    hist.push({ v: pen, f: 1 - pLose }, { v: -pen * (n - 1), f: pLose });
  } else {
    let pReach = 1;
    for (let j = k; j >= 3; j--) { const ph = wr, po = (j - 1) * (1 - wr) / (n - 1), pm = ph + po; pReach *= po / pm; }
    const pSafe = 1 - pReach;
    const ph2 = wr, po2 = (1 - wr) / (n - 1), pm2 = ph2 + po2, pw = 1 - pm2;
    const pr = 1 - Math.pow(pw, sdO);
    const p_opp2 = 2 * (1 - wr) / (n - 1), pOppR = 1 - Math.pow(1 - p_opp2, sdO);
    const f1 = pSafe * pOppR + pReach * (ph2 / pm2) * pr;
    const f2 = pSafe * (1 - pOppR);
    const f3 = pReach * (po2 / pm2) * pr;
    const f4 = pReach * Math.pow(pw, sdO);
    if (f1 > 1e-15) hist.push({ v: pen, f: f1 });
    if (f2 > 1e-15) hist.push({ v: pen * 2, f: f2 });
    if (f3 > 1e-15) hist.push({ v: -pen * (n - 1), f: f3 });
    if (f4 > 1e-15) hist.push({ v: -pen * (n - 2), f: f4 });
  }
  const mn = Math.min(...hist.map(h => h.v));
  const mx = Math.max(...hist.map(h => h.v));
  return { ev, pL: pLose, aH, mn, mx, nsv, sqt, hist, analytical: true };
}

// === ANALYTICAL SOLVER FOR PROGRESSIVE/MULTIPLIER ===
function solveProgMult(cfg) {
  const { n, heroWinRate: wr, penalty: pen, heroSquids: hSq, squidsDealt: sD, totalSquids: tSq, format: fmt, tiers, finalDouble: fd, doublePerHand: dph, oppDist } = cfg;
  const rem = tSq - sD, nO = n - 1, q = (nO - 1) / nO, p = 1 / nO;

  function hPay(sq) {
    if (fmt === 'progressive') return pen * sq;
    let m = 1; for (let i = 0; i < tiers.length; i++) if (tiers[i].squids <= sq) m = tiers[i].mult;
    return pen * sq * m;
  }

  function getMult(sq) {
    let m = 1; for (let i = 0; i < tiers.length; i++) if (tiers[i].squids <= sq) m = tiers[i].mult;
    return m;
  }

  const lpa = [];
  for (let nd = 0; nd <= 2; nd++) {
    if (fmt === 'progressive') { lpa.push(-pen * tSq); continue; }
    const rr = tSq - 2 * nd;
    if (rr < 0) { lpa.push(-pen * tSq); continue; }
    let eS = 0;
    for (let k = 1; k <= tSq; k++) {
      let pk = 0;
      for (let bh = 0; bh <= nd; bh++) {
        const kB = k - 2 * bh;
        if (kB < 0 || kB > rr) continue;
        pk += C(nd, bh) * Math.pow(p, bh) * Math.pow(1 - p, nd - bh) * C(rr, kB) * Math.pow(p, kB) * Math.pow(1 - p, rr - kB);
      }
      eS += k * getMult(k) * pk;
    }
    lpa.push(-pen * nO * eS);
  }

  let lpaKnown = null;
  if (oppDist && fmt === 'multiplier') {
    lpaKnown = [];
    const groups = {};
    for (const o of oppDist) groups[o] = (groups[o] || 0) + 1;
    for (let nd = 0; nd <= 2; nd++) {
      const rr = rem - 2 * nd;
      if (rr < 0) { lpaKnown.push(lpa[nd]); continue; }
      let total = 0;
      for (const oStr in groups) {
        const o = parseInt(oStr), cnt = groups[oStr];
        let eC = 0;
        for (let z = 0; z <= rem; z++) {
          let pz = 0;
          for (let bh = 0; bh <= nd; bh++) {
            const zB = z - 2 * bh;
            if (zB < 0 || zB > rr) continue;
            pz += C(nd, bh) * Math.pow(p, bh) * Math.pow(1 - p, nd - bh) * C(rr, zB) * Math.pow(p, zB) * Math.pow(1 - p, rr - zB);
          }
          eC += (o + z) * getMult(o + z) * pz;
        }
        total += cnt * eC;
      }
      lpaKnown.push(-pen * total);
    }
  }

  function compute(hS, sD2, ndOverride, nZOverride, lpaOvr) {
    const r = tSq - sD2;
    let nd = ndOverride !== undefined ? ndOverride : ((fd ? 1 : 0) + (dph ? 1 : 0));
    while (nd > 0 && r < 2 * nd) nd--;
    const rS = r - 2 * nd;
    const lp = (lpaOvr ? lpaOvr[nd] : null) || lpa[nd];
    const nZ = nZOverride !== undefined ? nZOverride : nO * Math.pow(q, sD2 - hS);
    let ev = 0, pL = 0;
    const sv = {}, hs = [];
    for (let x = 0; x <= r; x++) {
      let pxT = 0, cT = 0;
      for (let dw = 0; dw <= nd; dw++) {
        const xS = x - 2 * dw;
        if (xS < 0 || xS > rS) continue;
        const px = C(nd, dw) * Math.pow(wr, dw) * Math.pow(1 - wr, nd - dw) * C(rS, xS) * Math.pow(wr, xS) * Math.pow(1 - wr, rS - xS);
        if (px < 1e-18) continue;
        pxT += px;
        if (hS + x === 0) { pL += px; cT += px * lp; }
        else {
          const oc = nd - dw;
          const eL = nZ * Math.pow(q, r - x - oc);
          cT += hPay(hS + x) * eL * px;
        }
      }
      if (pxT < 1e-18) continue;
      ev += cT;
      const fSq = hS + x;
      if (!sv[fSq]) sv[fSq] = { freq: 0, tp: 0 };
      sv[fSq].freq += pxT; sv[fSq].tp += cT;
      hs.push({ v: cT / pxT, f: pxT });
    }
    return { ev, pL, sv, hs };
  }

  const nZ = oppDist ? oppDist.filter(function (v) { return v === 0; }).length : undefined;

  const main = compute(hSq, sD, undefined, nZ, lpaKnown);
  const { ev, pL: pLose } = main;

  const sqt = [];
  const keys = Object.keys(main.sv).map(Number).sort((a, b) => a - b);
  for (const k of keys) sqt.push({ sq: k, freq: main.sv[k].freq, avgPay: main.sv[k].tp / main.sv[k].freq, marg: null });
  for (let i = 0; i < sqt.length; i++) sqt[i].marg = i > 0 ? sqt[i].avgPay - sqt[i - 1].avgPay : null;

  let nsv = null;
  if (rem > 0) {
    const nsvNd = fd ? 1 : 0;
    const nZHero = nZ;
    if (dph && rem >= 2) {
      const nZOpp = nZ !== undefined ? nZ * q : undefined;
      nsv = compute(hSq + 2, sD + 2, nsvNd, nZHero).ev - compute(hSq, sD + 2, nsvNd, nZOpp).ev;
    } else {
      const nZOpp = nZ !== undefined ? nZ * q : undefined;
      nsv = compute(hSq + 1, sD + 1, nsvNd, nZHero).ev - compute(hSq, sD + 1, nsvNd, nZOpp).ev;
    }
  }

  let nd = ((fd ? 1 : 0) + (dph ? 1 : 0));
  while (nd > 0 && rem < 2 * nd) nd--;
  const aH = rem - nd;
  const hist = main.hs;
  const mn = hist.length ? Math.min(...hist.map(h => h.v)) : 0;
  const mx = hist.length ? Math.max(...hist.map(h => h.v)) : 0;
  return { ev, pL: pLose, aH, mn, mx, nsv, sqt, hist, analytical: true };
}

// === VERCEL HANDLER ===
const { verifyGoogleToken } = require('./_lib/auth');
const { checkSubscription } = require('./_lib/stripe');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cfg = req.body;

  // Input validation
  if (!cfg || typeof cfg !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { n, heroWinRate, penalty, format } = cfg;

  if (typeof n !== 'number' || n < 2 || n > 20) {
    return res.status(400).json({ error: 'Players must be between 2 and 20' });
  }
  if (typeof heroWinRate !== 'number' || heroWinRate <= 0 || heroWinRate >= 1) {
    return res.status(400).json({ error: 'Win rate must be between 0 and 1 (exclusive)' });
  }
  if (typeof penalty !== 'number' || penalty <= 0 || penalty > 100000) {
    return res.status(400).json({ error: 'Penalty must be between 0 and 100000' });
  }
  if (!['single', 'progressive', 'multiplier'].includes(format)) {
    return res.status(400).json({ error: 'Format must be single, progressive, or multiplier' });
  }

  // Auth required for progressive/multiplier
  if (format !== 'single') {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Sign in with Google to use this format' });
    }
    const user = await verifyGoogleToken(auth.slice(7));
    if (!user || user.error) {
      return res.status(401).json({ error: 'Auth failed: ' + (user ? user.error : 'no result') });
    }

    try {
      const subscribed = await checkSubscription(user.email);
      if (!subscribed) {
        return res.status(403).json({ error: 'Subscription required' });
      }
    } catch (err) {
      return res.status(500).json({ error: 'Stripe error: ' + err.message });
    }
  }

  try {
    const result = format === 'single' ? solveSingle(cfg) : solveProgMult(cfg);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Solver error: ' + err.message });
  }
};
