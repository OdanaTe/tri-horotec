/* Décodeur Code 128 minimal, sans dépendance.
   decodeCode128Line(gray: Uint8Array|number[]) -> string|null
   decodeCode128Image(gray, width, height, lines) -> string|null */
(function (root) {
  var P = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
    "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
    "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
    "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
    "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
    "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
    "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
    "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
    "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
    "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
    "114131","311141","411131","211412","211214","211232"];
  var PW = P.map(function (s) { return s.split("").map(Number); });
  var STOP = [2,3,3,1,1,1,2];

  var PE = PW.map(function (p) { return [p[0]+p[1], p[1]+p[2], p[2]+p[3], p[3]+p[4]]; });
  function match(w, i) {
    var t = 0, k, j;
    if (i + 6 > w.length) return null;
    for (k = 0; k < 6; k++) t += w[i + k];
    if (!t) return null;
    var m = t / 11, best = -1, be = 1e9, e2 = 1e9;
    var me = [(w[i]+w[i+1])/m, (w[i+1]+w[i+2])/m, (w[i+2]+w[i+3])/m, (w[i+3]+w[i+4])/m];
    for (j = 0; j < 106; j++) {
      var e = 0, p = PW[j], q = PE[j];
      for (k = 0; k < 4; k++) e += Math.abs(me[k] - q[k]);
      for (k = 0; k < 6; k++) e += 0.3 * Math.abs(w[i + k] / m - p[k]);
      if (e < be) { e2 = be; be = e; best = j; } else if (e < e2) e2 = e;
    }
    return be < 2.4 ? [best, be, m] : null;
  }
  function isStop(w, i, m) {
    if (i + 7 > w.length) return false;
    var t = 0, k; for (k = 0; k < 7; k++) t += w[i + k];
    var mm = t / 13, e = 0;
    if (Math.abs(mm - m) > m * 0.35) return false;
    for (k = 0; k < 7; k++) e += Math.abs(w[i + k] / mm - STOP[k]);
    return e < 2.6;
  }
  function toText(vals) {
    var set = vals[0] === 103 ? "A" : vals[0] === 104 ? "B" : "C", out = "", shift = false;
    for (var i = 1; i < vals.length; i++) {
      var v = vals[i], cs = shift ? (set === "A" ? "B" : "A") : set; shift = false;
      if (cs === "C") {
        if (v < 100) out += (v < 10 ? "0" : "") + v;
        else if (v === 100) set = "B"; else if (v === 101) set = "A";
        continue;
      }
      if (v < 96) {
        if (cs === "B") out += String.fromCharCode(v + 32);
        else out += String.fromCharCode(v < 64 ? v + 32 : v - 64);
      } else if (v === 98) shift = true;
      else if (v === 99) set = "C";
      else if (v === 100 && cs === "A") set = "B";
      else if (v === 101 && cs === "B") set = "A";
    }
    return out;
  }
  function decodeRuns(w) {
    // w commence par une barre (index pair = barre)
    for (var s = 0; s + 6 <= w.length; s += 2) {
      var st = match(w, s);
      if (!st || st[0] < 103) continue;
      // marge blanche avant le start
      if (s > 0 && w[s - 1] < st[2] * 4) continue;
      var vals = [st[0]], i = s + 6, m = st[2], ok = false;
      while (i + 6 <= w.length) {
        if (isStop(w, i, m)) { ok = true; break; }
        var r = match(w, i);
        if (!r || r[0] > 105 || Math.abs(r[2] - m) > m * 0.4) break;
        vals.push(r[0]); m = (m * 3 + r[2]) / 4; i += 6;
      }
      if (!ok || vals.length < 3) continue;
      var chk = vals.pop(), sum = vals[0];
      for (var k = 1; k < vals.length; k++) sum += k * vals[k];
      if (sum % 103 !== chk) continue;
      var txt = toText(vals);
      if (txt) return txt;
    }
    return null;
  }
  function runs(line) {
    // bords détectés au maximum du gradient (insensible au seuil et au flou)
    var n = line.length, i;
    if (n < 40) return null;
    var g = new Float32Array(n);
    for (i = 0; i < n; i++) g[i] = (line[Math.max(0, i - 1)] + 2 * line[i] + line[Math.min(n - 1, i + 1)]) / 4;
    var d = new Float32Array(n), mx = 0;
    for (i = 1; i < n - 1; i++) { d[i] = g[i + 1] - g[i - 1]; if (Math.abs(d[i]) > mx) mx = Math.abs(d[i]); }
    if (mx < 20) return null;
    var thr = mx * 0.12, edges = [];
    for (i = 2; i < n - 2; i++) {
      var v = d[i], av = Math.abs(v);
      if (av < thr || av < Math.abs(d[i - 1]) || av < Math.abs(d[i + 1])) continue;
      var a0 = Math.abs(d[i - 1]), a2 = Math.abs(d[i + 1]), den = a0 - 2 * av + a2;
      var pos = i + (den ? 0.5 * (a0 - a2) / den : 0), sg = v < 0 ? -1 : 1;
      var L = edges[edges.length - 1];
      if (L && L.s === sg) { if (av > L.a) { L.p = pos; L.a = av; } }
      else edges.push({ p: pos, s: sg, a: av });
    }
    // premier bord descendant (clair -> sombre) = début d'une barre
    var k = 0; while (k < edges.length && edges[k].s !== -1) k++;
    if (edges.length - k < 20) return null;
    var w = [];
    for (i = k + 1; i < edges.length; i++) w.push(edges[i].p - edges[i - 1].p);
    return { w: w, lead: edges[k].p - (k > 0 ? edges[k - 1].p : 0) };
  }
  function decodeLine(line) {
    var r = runs(line); if (!r) return null;
    // ajoute la marge en tête (marqueur de blanc) : on la place comme "barre" fictive nulle + blanc
    var w = [0, r.lead].concat(r.w);
    var t = decodeRuns(w); if (t) return t;
    var rev = Array.prototype.slice.call(line).reverse();
    r = runs(rev); if (!r) return null;
    return decodeRuns([0, r.lead].concat(r.w));
  }
  function decodeImage(gray, W, H, lines) {
    lines = lines || 15;
    var row = new Uint8Array(W), col = new Uint8Array(H), y, x, k, t;
    for (k = 0; k < lines; k++) {
      y = Math.round(H * (k + 1) / (lines + 1));
      row.set(gray.subarray ? gray.subarray(y * W, y * W + W) : gray.slice(y * W, y * W + W));
      t = decodeLine(row); if (t) return t;
    }
    for (k = 0; k < lines; k++) {
      x = Math.round(W * (k + 1) / (lines + 1));
      for (y = 0; y < H; y++) col[y] = gray[y * W + x];
      t = decodeLine(col); if (t) return t;
    }
    return null;
  }
  root.decodeCode128Line = decodeLine;
  root.decodeCode128Image = decodeImage;
})(typeof window !== "undefined" ? window : globalThis);
