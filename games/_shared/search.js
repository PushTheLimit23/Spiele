// Gemeinsame Zugsuche für Computer-Gegner (nur Server). Negamax mit Alpha-Beta-Schnitt.
// Ein Spiel liefert nur:
//   gen(node, color)   -> [{ acts, next }]  alle Züge der Farbe `color` (acts = Aktionen wie aus dem Browser)
//   evaluate(node, c)  -> Zahl aus Sicht von c; ±WIN bei Sieg/Niederlage, 0 bei Remis
//   over(node)         -> true, wenn die Partie vorbei ist
//   other(color)       -> die andere Farbe
// Stufen:
//   leicht – nur der eigene Zug, viel Zufall, ab und zu ein beliebiger Zug (macht echte Fehler)
//   mittel – eigener Zug + Antwort, wenig Zufall
//   schwer – so tief wie in der Bedenkzeit möglich (iterative Vertiefung), kaum Zufall
const WIN = 1e6;

function choose(root, me, o) {
  const opt = { budgetMs: 300, maxDepth: 12, beam: 0, mittelDepth: 2, leichtNoise: 80, leichtRandom: 0.25, mittelNoise: 8, ...o };
  const level = opt.level || 'mittel';
  const list = opt.gen(root, me);
  if (!list.length) return null;
  if (list.length === 1) return list[0].acts;
  const rnd = Math.random;

  // statisch vorsortieren (beste zuerst) – hilft dem Schnitt und dem Strahl (beam)
  const scoreOf = (t) => opt.evaluate(t.next, me);
  for (const t of list) t.s0 = scoreOf(t) + rnd() * 0.01; // winziger Zufall: gleich gute Züge variieren
  list.sort((a, b) => b.s0 - a.s0);
  // sofortiger Sieg: nehmen
  if (list[0].s0 >= WIN / 2) return list[0].acts;

  if (level === 'leicht') {
    if (rnd() < opt.leichtRandom) return list[Math.floor(rnd() * list.length)].acts;
    let best = list[0], bv = -Infinity;
    for (const t of list) { const v = t.s0 + rnd() * opt.leichtNoise; if (v > bv) { bv = v; best = t; } }
    return best.acts;
  }

  const stats = { nodes: 0, timeout: false, deadline: 0 };
  const children = (node, color) => {
    const l = opt.gen(node, color);
    if (opt.beam && l.length > opt.beam) {
      for (const t of l) t.s0 = opt.evaluate(t.next, color);
      l.sort((a, b) => b.s0 - a.s0);
      l.length = opt.beam;
    }
    return l;
  };
  function negamax(node, color, depth, alpha, beta, ply) {
    stats.nodes++;
    if (opt.over(node) || depth === 0) {
      const v = opt.evaluate(node, color);
      return v >= WIN / 2 ? v - ply : v <= -WIN / 2 ? v + ply : v; // schneller Sieg ist besser
    }
    if (stats.deadline && (stats.nodes & 255) === 0 && Date.now() > stats.deadline) { stats.timeout = true; return 0; }
    const l = children(node, color);
    if (!l.length) return opt.evaluate(node, color);
    let best = -Infinity;
    for (const t of l) {
      const v = -negamax(t.next, opt.other(color), depth - 1, -beta, -alpha, ply + 1);
      if (stats.timeout) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  const rootList = opt.beam && list.length > opt.beam * 2 ? list.slice(0, opt.beam * 2) : list;
  // exact=true: jeder Zug bekommt seinen echten Wert (für mittel, damit Zufall nur unter gleich guten Zügen wählt).
  // Sonst Alpha-Beta auch an der Wurzel: Züge, die nicht besser sind als der bisher beste, liefern nur eine
  // Obergrenze – sie werden als schlechter markiert, damit sie nie per Gleichstand gewählt werden.
  const run = (depth, exact) => {
    const out = [];
    let alpha = -Infinity;
    for (const t of rootList) {
      let v = -negamax(t.next, opt.other(me), depth - 1, -Infinity, exact ? Infinity : -alpha, 1);
      if (stats.timeout) return null;
      if (!exact && out.length && v <= alpha) v = alpha - 1;
      out.push({ t, v });
      if (v > alpha) alpha = v;
    }
    return out;
  };

  let scored;
  if (level === 'mittel') {
    scored = run(opt.mittelDepth, true).map((x) => ({ ...x, v: x.v + rnd() * opt.mittelNoise }));
  } else {
    stats.deadline = Date.now() + opt.budgetMs;
    scored = rootList.map((t) => ({ t, v: t.s0 }));
    for (let d = 1; d <= opt.maxDepth; d++) {
      const r = run(d);
      if (!r) break;
      scored = r;
      // bessere Züge zuerst in die nächste Tiefe
      rootList.sort((a, b) => (r.find((x) => x.t === b).v) - (r.find((x) => x.t === a).v));
      if (Math.max(...r.map((x) => x.v)) >= WIN / 2) break;
    }
  }
  scored.sort((a, b) => b.v - a.v); // stabil: bei Gleichstand der Zug, der in der Vorrunde vorn lag
  return scored[0].t.acts;
}

module.exports = { choose, WIN };
