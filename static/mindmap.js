/* 思维导图：分类 → 文章 → 二级标题 → 三级标题
   3D 星云视图（Canvas 手写投影，无依赖）：
   分类是呼吸发光的核心恒星，文章是环绕的恒星（斐波那契球面均匀分布），
   知识点像星团聚在各自文章周围；彩色星云雾、远景视差星云、星尘闪烁、
   十字光斑、节点漂移、能量光点沿光束流向文章，加暗角与景深。
   拖拽旋转、滚轮缩放、悬停点亮分支并显示标签、
   单击展开/收起、双击跳转到文章对应章节。 */
(function () {
  'use strict';

  const data     = window.MINDMAP_DATA;
  const canvas   = document.getElementById('mm-canvas');
  const viewport = document.getElementById('mm-viewport');
  const tabsBox  = document.getElementById('mm-tabs');
  if (!Array.isArray(data) || !data.length || !canvas || !viewport) return;

  const ctx  = canvas.getContext('2d');
  const ROOT = window.SITE_ROOT || '';
  const TAU  = Math.PI * 2;
  const GOLD = Math.PI * (3 - Math.sqrt(5));   // 黄金角

  /* 星云配色（深空背景固定，不随主题切换——星云需要夜空） */
  const PALETTE = ['#ffb27a', '#7ec8ff', '#a8e08a', '#ffd36b',
                   '#c9a6ff', '#6fe0d0', '#ff9fc8', '#b0b8c8'];
  const BG0 = '#171a26', BG1 = '#0b0c12';
  const CORE = '#ffe9c4';
  const INK  = '#e3e6ef', INK2 = '#b8bdcc', INK3 = '#828a9e';
  const HALO = 'rgba(9,10,16,0.85)';

  const cs    = getComputedStyle(document.documentElement);
  const SANS  = (cs.getPropertyValue('--sans')  || 'sans-serif').trim();
  const SERIF = (cs.getPropertyValue('--serif') || 'serif').trim();
  const FONT  = {
    0: '400 21px ' + SERIF,
    1: '400 13px ' + SANS,
    2: '300 11px ' + SANS,
    3: '300 10px ' + SANS,
  };
  const LABEL_MAX = { 0: 420, 1: 220, 2: 190, 3: 170 };
  const CORE_R    = { 1: 5, 2: 2.8, 3: 2 };      // 恒星核半径（世界像素）

  const REDUCED = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fitText(text, d) {
    ctx.font = FONT[d];
    if (ctx.measureText(text).width <= LABEL_MAX[d]) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > LABEL_MAX[d]) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  /* ───── 状态 ───── */
  let cat = null;
  let expanded = new Map();              // catId -> Set(展开的节点 id)
  let nodes = [], links = [], stars = [], hazes = [], farBlobs = [];
  let R1 = 280, R2 = 500;
  let yaw = -0.5, pitch = 0.26, dist = 1400;
  const F = 900;                          // 焦距
  let W = 0, H = 0, dpr = 1;
  let hover = null, litSet = null;
  let dragging = false, moved = false, clickTimer = 0;
  let lastT = 0;

  function expandSet() {
    if (!expanded.has(cat.id)) {
      // 默认展开到二级标题：核心 + 所有文章，一打开就是完整星云
      const set = new Set(['root']);
      cat.posts.forEach(p => set.add(p.s));
      expanded.set(cat.id, set);
    }
    return expanded.get(cat.id);
  }

  /* ───── 确定性伪随机（切分类/刷新时星空稳定不闪） ───── */
  function lcg(seed) {
    let s = seed >>> 0 || 1;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  }
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h = (h ^ str.charCodeAt(i)) * 16777619 >>> 0;
    }
    return h;
  }

  /* ───── 3D 布局 ───── */
  function basis(u) {
    // u 的正交基（u 为单位向量）
    const a = Math.abs(u.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    let e1 = {
      x: u.y * a.z - u.z * a.y,
      y: u.z * a.x - u.x * a.z,
      z: u.x * a.y - u.y * a.x,
    };
    const l = Math.hypot(e1.x, e1.y, e1.z);
    e1 = { x: e1.x / l, y: e1.y / l, z: e1.z / l };
    const e2 = {
      x: u.y * e1.z - u.z * e1.y,
      y: u.z * e1.x - u.x * e1.z,
      z: u.x * e1.y - u.y * e1.x,
    };
    return [e1, e2];
  }

  /* 围绕方向 u 的球冠上第 j/n 个点（斐波那契螺旋，分布均匀） */
  function capPoint(u, j, n, capAngle, radius) {
    const t = (j + 0.5) / n;
    const g = capAngle * Math.sqrt(t);
    const b = j * GOLD;
    const [e1, e2] = basis(u);
    const sg = Math.sin(g), cg = Math.cos(g);
    const cb = Math.cos(b), sb = Math.sin(b);
    return {
      x: (u.x * cg + (e1.x * cb + e2.x * sb) * sg) * radius,
      y: (u.y * cg + (e1.y * cb + e2.y * sb) * sg) * radius,
      z: (u.z * cg + (e1.z * cb + e2.z * sb) * sg) * radius,
    };
  }

  function rebuild() {
    const set = expandSet();
    nodes = []; links = []; hazes = [];

    const root = {
      id: 'root', depth: 0, label: cat.name, color: CORE,
      post: '', href: '', kids: cat.posts.length,
      open: set.has('root'),
      pos: { x: 0, y: 0, z: 0 }, parent: null,
    };
    root.text = fitText(cat.name, 0);
    nodes.push(root);
    if (!root.open) { finalize(); return; }

    const nP = cat.posts.length;
    R1 = 250 + nP * 3;
    R2 = R1 * 1.8;
    const R3 = R2 * 1.32;

    cat.posts.forEach((p, i) => {
      // 斐波那契球面：文章均匀铺满整个球
      const y = nP === 1 ? 0 : 1 - (2 * (i + 0.5)) / nP;
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const th = i * GOLD;
      const u = { x: Math.cos(th) * rr, y: y, z: Math.sin(th) * rr };
      const color = PALETTE[i % PALETTE.length];
      const href  = ROOT + 'posts/' + p.s + '.html';
      const h2s   = p.h || [];

      const art = {
        id: p.s, depth: 1, label: p.t, text: fitText(p.t, 1),
        color: color, post: p.t, href: href, kids: h2s.length,
        open: set.has(p.s),
        pos: { x: u.x * R1, y: u.y * R1, z: u.z * R1 },
        parent: root,
      };
      nodes.push(art);
      links.push({ a: root, b: art });

      if (!art.open || !h2s.length) return;

      // 文章的知识点星团 + 同色星云雾
      hazes.push({
        pos: { x: u.x * R1 * 1.45, y: u.y * R1 * 1.45, z: u.z * R1 * 1.45 },
        color: color, r: R2 * 0.42,
      });
      const cap2 = Math.min(0.6, Math.max(0.18, 0.12 * Math.sqrt(h2s.length)));
      h2s.forEach((h2, j) => {
        const n2 = {
          id: p.s + '::' + h2.a, depth: 2, label: h2.t, text: fitText(h2.t, 2),
          color: color, post: p.t, href: href + '#' + h2.a,
          kids: (h2.c || []).length, open: set.has(p.s + '::' + h2.a),
          pos: capPoint(u, j, h2s.length, cap2, R2),
          parent: art,
        };
        nodes.push(n2);
        links.push({ a: art, b: n2 });

        if (!n2.open || !n2.kids) return;
        const u2 = {
          x: n2.pos.x / R2, y: n2.pos.y / R2, z: n2.pos.z / R2,
        };
        const cap3 = Math.min(0.28, 0.09 * Math.sqrt(n2.kids) + 0.08);
        h2.c.forEach((h3, m) => {
          const n3 = {
            id: p.s + '::' + h3.a, depth: 3, label: h3.t, text: fitText(h3.t, 3),
            color: color, post: p.t, href: href + '#' + h3.a,
            kids: 0, open: false,
            pos: capPoint(u2, m, h2.c.length, cap3, R3),
            parent: n2,
          };
          nodes.push(n3);
          links.push({ a: n2, b: n3 });
        });
      });
    });
    finalize();
  }

  function finalize() {
    const rnd = lcg(hashStr(cat.id));
    const SR = Math.max(900, R2 * 1.7);

    // 星尘：随分类固定播种；少数亮星带十字光斑
    stars = [];
    for (let i = 0; i < 340; i++) {
      const v = 2 * rnd() - 1, th = rnd() * TAU;
      const rr = Math.sqrt(1 - v * v);
      const rad = SR * (0.3 + 0.7 * Math.cbrt(rnd()));
      const cc = rnd();
      stars.push({
        pos: { x: Math.cos(th) * rr * rad, y: v * rad, z: Math.sin(th) * rr * rad },
        r: 0.5 + rnd() * 1.3, a: 0.08 + rnd() * 0.34,
        tw: 0.4 + rnd() * 1.8, ph: rnd() * TAU,
        color: cc < 0.6 ? '#cdd6ee' : cc < 0.85 ? '#ffe9d0' : '#bcd8ff',
        flare: rnd() < 0.06,
      });
    }

    // 远景星云：巨大、极淡，旋转时产生视差纵深
    farBlobs = [];
    const FB = ['#3d4380', '#5a3a7e', '#2a5c6e', '#6e3a55'];
    for (let i = 0; i < 4; i++) {
      const v = 2 * rnd() - 1, th = rnd() * TAU;
      const rr = Math.sqrt(1 - v * v);
      const rad = SR * (0.85 + 0.5 * rnd());
      farBlobs.push({
        pos: { x: Math.cos(th) * rr * rad, y: v * rad * 0.7, z: Math.sin(th) * rr * rad },
        r: SR * (0.55 + 0.4 * rnd()),
        color: FB[i % FB.length],
      });
    }

    // 节点缓慢漂移（确定性相位，星云是活的）
    nodes.forEach(n => {
      const h = hashStr(n.id);
      n.dph  = (h % 628) / 100;
      n.dsp  = 0.0003 + ((h >>> 3) % 100) * 0.0000036;
      n.damp = [0, 5, 8, 11][n.depth];
    });

    hover = null; litSet = null;
  }

  /* ───── 发光/光斑贴图缓存 ───── */
  const glowCache = new Map();
  function glow(color) {
    let g = glowCache.get(color);
    if (!g) {
      g = document.createElement('canvas');
      g.width = g.height = 128;
      const gc = g.getContext('2d');
      const gr = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, color);
      gr.addColorStop(0.16, color + 'b0');
      gr.addColorStop(0.45, color + '36');
      gr.addColorStop(1, color + '00');
      gc.fillStyle = gr;
      gc.fillRect(0, 0, 128, 128);
      glowCache.set(color, g);
    }
    return g;
  }
  const flareCache = new Map();
  function flare(color) {
    let f = flareCache.get(color);
    if (!f) {
      f = document.createElement('canvas');
      f.width = f.height = 256;
      const fc = f.getContext('2d');
      fc.translate(128, 128);
      for (let i = 0; i < 2; i++) {
        const gr = fc.createLinearGradient(-128, 0, 128, 0);
        gr.addColorStop(0, color + '00');
        gr.addColorStop(0.5, color + 'cc');
        gr.addColorStop(1, color + '00');
        fc.fillStyle = gr;
        fc.fillRect(-128, -2.2, 256, 4.4);
        fc.rotate(Math.PI / 2);
      }
      flareCache.set(color, f);
    }
    return f;
  }

  /* ───── 投影与渲染 ───── */
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (w === W && h === H && canvas.width === Math.round(w * dpr)) return;
    W = w; H = h;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  function project(p, cyw, syw, cpt, spt) {
    const x1 = p.x * cyw + p.z * syw;
    const z1 = -p.x * syw + p.z * cyw;
    const y1 = p.y * cpt - z1 * spt;
    const z2 = p.y * spt + z1 * cpt;
    const depth = z2 + dist;
    if (depth < 60) return null;
    const s = F / depth;
    return { x: W / 2 + x1 * s, y: H / 2 + y1 * s, s: s, d: depth };
  }

  function fog(s) {
    const rel = s / (F / dist);
    return Math.max(0.18, Math.min(1, 0.25 + (rel - 0.72) * 1.6));
  }

  let vig = { w: 0, h: 0, g: null };
  function vignette() {
    if (vig.w !== W || vig.h !== H) {
      const g = ctx.createRadialGradient(
        W / 2, H / 2, Math.min(W, H) * 0.42,
        W / 2, H / 2, Math.max(W, H) * 0.74);
      g.addColorStop(0, 'rgba(4,5,10,0)');
      g.addColorStop(1, 'rgba(4,5,10,0.55)');
      vig = { w: W, h: H, g: g };
    }
    return vig.g;
  }

  function renderFrame(t) {
    resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* 深空背景 */
    const bg = ctx.createRadialGradient(
      W / 2, H * 0.42, 0, W / 2, H / 2, Math.max(W, H) * 0.8);
    bg.addColorStop(0, BG0);
    bg.addColorStop(1, BG1);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* 相机：拖拽的俯仰上叠加极缓慢的呼吸摆动，增强纵深 */
    const wob = REDUCED ? 0 : 0.05 * Math.sin(t * 0.00005);
    const cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const cpt = Math.cos(pitch + wob), spt = Math.sin(pitch + wob);
    const P = p => project(p, cyw, syw, cpt, spt);

    /* 漂移后的节点投影（连线 / 命中检测共用） */
    nodes.forEach(n => {
      if (!n.damp || REDUCED) { n.pr = P(n.pos); return; }
      const ph = t * n.dsp + n.dph;
      n.pr = P({
        x: n.pos.x + Math.sin(ph) * n.damp,
        y: n.pos.y + Math.cos(ph * 0.9) * n.damp,
        z: n.pos.z + Math.sin(ph * 0.7 + 1.7) * n.damp,
      });
    });

    ctx.globalCompositeOperation = 'lighter';

    /* 远景星云（视差纵深） */
    farBlobs.forEach(fb => {
      const q = P(fb.pos);
      if (!q) return;
      const r = fb.r * q.s;
      ctx.globalAlpha = 0.05 * (litSet ? 0.5 : 1);
      ctx.drawImage(glow(fb.color), q.x - r, q.y - r, r * 2, r * 2);
    });

    /* 星团雾 */
    hazes.forEach(hz => {
      const q = P(hz.pos);
      if (!q) return;
      const r = hz.r * q.s;
      ctx.globalAlpha = 0.085 * fog(q.s) * (litSet ? 0.35 : 1);
      ctx.drawImage(glow(hz.color), q.x - r, q.y - r, r * 2, r * 2);
    });

    /* 星尘：闪烁 + 少量十字光斑 */
    stars.forEach(st => {
      const q = P(st.pos);
      if (!q) return;
      const twk = REDUCED ? 1 : 0.65 + 0.35 * Math.sin(t * 0.001 * st.tw + st.ph);
      const a = st.a * twk * (litSet ? 0.3 : 1);
      const r = Math.max(0.4, st.r * q.s * 3.2);
      ctx.globalAlpha = a;
      ctx.drawImage(glow(st.color), q.x - r, q.y - r, r * 2, r * 2);
      if (st.flare) {
        const fr = r * 7;
        ctx.globalAlpha = a * 0.5;
        ctx.drawImage(flare(st.color), q.x - fr, q.y - fr, fr * 2, fr * 2);
      }
    });
    ctx.globalCompositeOperation = 'source-over';

    /* 连线（微光呼吸） */
    links.forEach((lk, i) => {
      const a = lk.a.pr, b = lk.b.pr;
      if (!a || !b) return;
      const lit = !litSet || litSet.has(lk.b.id);
      const shim = REDUCED ? 1 : 0.8 + 0.2 * Math.sin(t * 0.0012 + i * 0.61);
      ctx.globalAlpha = Math.min(0.85,
        (lk.b.depth === 1 ? 0.26 : 0.3) * fog(b.s) * shim *
        (lit ? (litSet ? 2.6 : 1) : 0.1));
      ctx.strokeStyle = lk.b.color;
      ctx.lineWidth = Math.max(0.4, (lk.b.depth === 1 ? 1.2 : 0.9) * b.s);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    ctx.globalCompositeOperation = 'lighter';

    /* 能量光点：沿核心 → 文章的光束流动 */
    if (!REDUCED) {
      links.forEach((lk, i) => {
        if (lk.b.depth !== 1) return;
        const a = lk.a.pr, b = lk.b.pr;
        if (!a || !b) return;
        if (litSet && !litSet.has(lk.b.id)) return;
        const u = (t * 0.00012 + i * 0.137) % 1;
        const x = a.x + (b.x - a.x) * u;
        const y = a.y + (b.y - a.y) * u;
        const r = Math.max(1.5, 3.4 * b.s);
        ctx.globalAlpha = 0.4 * Math.sin(u * Math.PI);
        ctx.drawImage(glow(lk.b.color), x - r, y - r, r * 2, r * 2);
      });
    }

    /* 节点（先远后近；彩色光晕 + 白热核心，像真的恒星） */
    const order = nodes.filter(n => n.pr)
                       .sort((a, b) => b.pr.d - a.pr.d);
    order.forEach(n => {
      const q = n.pr;
      const lit = !litSet || litSet.has(n.id);
      const dim = lit ? 1 : 0.15;
      if (n.depth === 0) {
        const breath = REDUCED ? 1 : 1 + 0.07 * Math.sin(t * 0.0008);
        const r = 78 * q.s * breath;
        ctx.globalAlpha = 0.95 * dim;
        ctx.drawImage(glow(CORE), q.x - r, q.y - r, r * 2, r * 2);
        const fr = r * 2.1;
        ctx.globalAlpha = 0.5 * dim;
        ctx.drawImage(flare(CORE), q.x - fr, q.y - fr, fr * 2, fr * 2);
        return;
      }
      const cr = Math.max(1, CORE_R[n.depth] * q.s * 1.9);
      const gr = cr * (n.depth === 1 ? 5 : 4);
      ctx.globalAlpha = (n.depth === 1 ? 0.55 : 0.38) * fog(q.s) * dim *
                        (hover === n ? 1.6 : 1);
      ctx.drawImage(glow(n.color), q.x - gr, q.y - gr, gr * 2, gr * 2);
      const wr = cr * 1.35;
      ctx.globalAlpha = Math.min(1, 0.9 * fog(q.s) * dim);
      ctx.drawImage(glow('#fff6ea'), q.x - wr, q.y - wr, wr * 2, wr * 2);
      if (n.depth === 1 && hover === n) {
        const fr = cr * 6;
        ctx.globalAlpha = 0.45;
        ctx.drawImage(flare(n.color), q.x - fr, q.y - fr, fr * 2, fr * 2);
      }
      if (n.kids && !n.open) {          // 收起标记：细环
        ctx.globalAlpha = 0.55 * fog(q.s) * dim;
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(q.x, q.y, cr + 3.5, 0, TAU);
        ctx.stroke();
      }
    });
    ctx.globalCompositeOperation = 'source-over';

    /* 标签：核心与文章常显；知识点在分支点亮或凑近时浮现 */
    ctx.textBaseline = 'middle';
    order.forEach(n => {
      const q = n.pr;
      let alpha;
      const inBranch = litSet && litSet.has(n.id);
      if (n.depth === 0) {
        alpha = litSet && !inBranch ? 0.25 : 1;
      } else if (n.depth === 1) {
        alpha = litSet ? (inBranch ? 1 : 0.1) : Math.min(1, fog(q.s) * 1.25);
      } else {
        const near = Math.max(0, (q.s - (n.depth === 2 ? 0.9 : 1.25)) * 2.2);
        alpha = inBranch ? 0.95 : (litSet ? 0 : Math.min(0.85, near * fog(q.s)));
      }
      if (alpha <= 0.02) return;
      ctx.globalAlpha = alpha;
      ctx.font = FONT[n.depth];
      const fill = n.depth <= 1 ? INK : n.depth === 2 ? INK2 : INK3;
      ctx.lineWidth = 3;
      ctx.strokeStyle = HALO;
      ctx.lineJoin = 'round';
      let tx, ty;
      if (n.depth === 0) {
        ctx.textAlign = 'center';
        tx = q.x; ty = q.y;
      } else {
        ctx.textAlign = q.x < W / 2 ? 'right' : 'left';
        const off = (CORE_R[n.depth] * q.s * 1.9) + 7;
        tx = q.x + (q.x < W / 2 ? -off : off);
        ty = q.y;
      }
      ctx.strokeText(n.text, tx, ty);
      ctx.fillStyle = fill;
      ctx.fillText(n.text, tx, ty);
      if (n.kids && !n.open && n.depth > 0) {
        const w = ctx.measureText(n.text).width;
        const sx = tx + (ctx.textAlign === 'right' ? -w - 4 : w + 4);
        ctx.font = '300 9px ' + SANS;
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeText('+' + n.kids, sx, ty);
        ctx.fillStyle = INK3;
        ctx.fillText('+' + n.kids, sx, ty);
      }
    });

    /* 暗角：视线聚向中心 */
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette();
    ctx.fillRect(0, 0, W, H);
  }

  /* ───── 主循环：闲时缓慢自转 ───── */
  function loop(t) {
    const dt = Math.min(50, t - lastT || 16);
    lastT = t;
    if (!REDUCED && !dragging && !hover) yaw += dt * 0.00006;
    renderFrame(t);
    requestAnimationFrame(loop);
  }

  /* ───── 命中检测与交互 ───── */
  function pick(mx, my) {
    let best = null, bestD = 1e9;
    nodes.forEach(n => {
      const q = n.pr;
      if (!q) return;
      const rr = n.depth === 0 ? 40 * q.s
               : Math.max(9, CORE_R[n.depth] * q.s * 1.9 + 6);
      const dx = mx - q.x, dy = my - q.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && q.d < bestD) { bestD = q.d; best = n; }
    });
    return best;
  }

  function litFor(node) {
    const set = new Set();
    for (let n = node; n; n = n.parent) set.add(n.id);
    (function down(n) {
      nodes.forEach(c => {
        if (c.parent === n) { set.add(c.id); down(c); }
      });
    })(node);
    return set;
  }

  /* 悬停提示 */
  const tip = document.createElement('div');
  tip.className = 'mm-tip';
  viewport.appendChild(tip);
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function showTip(node, clientX, clientY) {
    let html = '';
    if (node.depth > 1 || node.text !== node.label) {
      html += '<div class="mm-tip-name">' + escapeHtml(node.label) + '</div>';
    }
    html += '<div class="mm-tip-post"><span>文章</span>' +
            escapeHtml(node.post) + '</div>';
    html += '<div class="mm-tip-hint">双击跳转' +
            (node.depth > 1 ? '到对应章节' : '到文章') +
            (node.kids ? ' · 单击' + (node.open ? '收起' : '展开') : '') +
            '</div>';
    tip.innerHTML = html;
    tip.classList.add('show');
    moveTip(clientX, clientY);
  }
  function moveTip(clientX, clientY) {
    if (!tip.classList.contains('show')) return;
    const r = viewport.getBoundingClientRect();
    let x = clientX - r.left + 14, y = clientY - r.top + 16;
    x = Math.min(x, r.width - tip.offsetWidth - 10);
    y = Math.min(y, r.height - tip.offsetHeight - 10);
    tip.style.left = Math.max(6, x) + 'px';
    tip.style.top  = Math.max(6, y) + 'px';
  }
  function hideTip() { tip.classList.remove('show'); }

  /* 指针：拖拽旋转 / 双指缩放 / 悬停 / 单击展开 / 双击跳转 */
  const pointers = new Map();
  let px0 = 0, py0 = 0, yaw0 = 0, pitch0 = 0, pinch0 = 0, dist0 = 0;

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      px0 = e.clientX; py0 = e.clientY;
      yaw0 = yaw; pitch0 = pitch;
      moved = false;
      dragging = true;
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinch0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      dist0 = dist;
    }
    viewport.classList.add('mm-panning');
  });

  canvas.addEventListener('pointermove', e => {
    const rect = viewport.getBoundingClientRect();
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointers.size === 2) {          // 双指缩放
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinch0 > 0) dist = clampDist(dist0 * pinch0 / d);
      moved = true;
      return;
    }
    if (dragging && pointers.size === 1) {
      const dx = e.clientX - px0, dy = e.clientY - py0;
      if (Math.hypot(dx, dy) > 4) moved = true;
      if (moved) {
        hideTip(); hover = null; litSet = null;
        yaw   = yaw0 + dx * 0.005;
        pitch = Math.max(-1.25, Math.min(1.25, pitch0 + dy * 0.005));
      }
      return;
    }
    /* 悬停 */
    const n = pick(e.clientX - rect.left, e.clientY - rect.top);
    if (n !== hover) {
      hover = n;
      litSet = n && n.depth > 0 ? litFor(n) : null;
      canvas.style.cursor = n ? 'pointer' : 'grab';
      if (n && n.depth > 0) showTip(n, e.clientX, e.clientY);
      else hideTip();
    } else if (n) {
      moveTip(e.clientX, e.clientY);
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (!pointers.size) {
      dragging = false;
      viewport.classList.remove('mm-panning');
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => {
    if (!dragging) { hover = null; litSet = null; hideTip(); }
  });

  canvas.addEventListener('click', () => {
    if (moved || !hover || !hover.kids) return;
    const node = hover;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      const set = expandSet();
      if (set.has(node.id)) set.delete(node.id);
      else set.add(node.id);
      rebuild();
      renderFrame(performance.now());   // 立即重算投影，不等下一帧
    }, 230);
  });
  canvas.addEventListener('dblclick', e => {
    clearTimeout(clickTimer);
    e.preventDefault();
    if (!moved && hover && hover.href) location.href = hover.href;
  });

  function clampDist(v) {
    return Math.max(F * 0.35, Math.min(5200, v));
  }
  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    dist = clampDist(dist * (e.deltaY < 0 ? 1 / 1.1 : 1.1));
  }, { passive: false });

  function fitCamera() {
    yaw = -0.5; pitch = 0.26;
    const target = Math.max(80, Math.min(W, H) * 0.44);
    dist = clampDist(R2 * 1.12 * F / target);
  }

  viewport.querySelectorAll('.mm-toolbar button').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      if (act === 'in')  dist = clampDist(dist / 1.25);
      if (act === 'out') dist = clampDist(dist * 1.25);
      if (act === 'fit') fitCamera();
    });
  });

  /* ───── 分类切换 ───── */
  function setCategory(id) {
    cat = data.find(c => c.id === id) || data[0];
    if (tabsBox) {
      tabsBox.querySelectorAll('.mm-tab').forEach(b =>
        b.classList.toggle('active', b.getAttribute('data-id') === cat.id));
    }
    try { history.replaceState(null, '', '#' + cat.id); } catch (_) {}
    rebuild();
    resize();
    fitCamera();
    renderFrame(performance.now());
  }

  if (tabsBox) {
    tabsBox.addEventListener('click', e => {
      const b = e.target.closest('.mm-tab');
      if (b) setCategory(b.getAttribute('data-id'));
    });
  }
  window.addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (cat && id && id !== cat.id) setCategory(id);
  });

  setCategory(decodeURIComponent(location.hash.slice(1)) || data[0].id);
  requestAnimationFrame(loop);
})();
