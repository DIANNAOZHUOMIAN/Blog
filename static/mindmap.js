/* 思维导图：分类 → 文章 → 二级标题 → 三级标题
   纯 SVG 实现。滚轮缩放、拖拽平移、单击展开/收起、悬停提示所属文章、
   双击跳转到文章对应章节，配色随主题变化。 */
(function () {
  'use strict';

  const data = window.MINDMAP_DATA;
  const svg      = document.getElementById('mm-svg');
  const viewport = document.getElementById('mm-viewport');
  const tabsBox  = document.getElementById('mm-tabs');
  if (!Array.isArray(data) || !data.length || !svg || !viewport) return;

  const NS   = 'http://www.w3.org/2000/svg';
  const ROOT = window.SITE_ROOT || '';

  /* 分支配色（CSS 变量随 paper/ink 主题切换） */
  const COLORS = ['--mm-c1','--mm-c2','--mm-c3','--mm-c4',
                  '--mm-c5','--mm-c6','--mm-c7','--mm-c8'];

  /* 字体（与站点一致） */
  const cs    = getComputedStyle(document.documentElement);
  const SANS  = (cs.getPropertyValue('--sans')  || 'sans-serif').trim();
  const SERIF = (cs.getPropertyValue('--serif') || 'serif').trim();
  const FONT  = {
    0: { size: 19,   weight: 400, family: SERIF },  // 根：分类名
    1: { size: 14,   weight: 400, family: SANS },   // 文章
    2: { size: 12.5, weight: 300, family: SANS },   // 二级标题
    3: { size: 11.5, weight: 300, family: SANS },   // 三级标题
  };
  const PAD_H  = { 0: 26, 1: 14, 2: 6, 3: 6 };      // 文字左右留白
  const NODE_H = { 0: 46, 1: 32, 2: 24, 3: 20 };
  const MAX_W  = { 0: 420, 1: 300, 2: 300, 3: 280 };
  const GAP_X  = { 0: 70, 1: 48, 2: 34 };           // 父子横向间距
  const GAP_Y  = { 1: 12, 2: 6, 3: 4 };             // 兄弟纵向间距
  const LINK_W = 22;                                // 文章节点 ↗ 图标区宽

  const measureCtx = document.createElement('canvas').getContext('2d');
  function textWidth(text, d) {
    const f = FONT[d];
    measureCtx.font = f.weight + ' ' + f.size + 'px ' + f.family;
    return measureCtx.measureText(text).width;
  }
  function fitText(text, d) {
    const max = MAX_W[d];
    if (textWidth(text, d) <= max) return text;
    let t = text;
    while (t.length > 1 && textWidth(t + '…', d) > max) t = t.slice(0, -1);
    return t + '…';
  }

  /* ───── 状态 ───── */
  let cat = null;                       // 当前分类数据
  let expanded = new Map();             // catId -> Set(展开的节点 id)
  let tx = 0, ty = 0, k = 1;            // 平移 / 缩放
  let world = null;                     // <g> 世界容器
  let panning = false;

  function expandSet() {
    if (!expanded.has(cat.id)) {
      // 默认展开到二级标题：根 + 所有文章节点，让图一打开就有细节
      const set = new Set(['root']);
      cat.posts.forEach(p => set.add(p.s));
      expanded.set(cat.id, set);
    }
    return expanded.get(cat.id);
  }

  /* ───── 树构建与布局 ───── */
  function buildTree() {
    return {
      id: 'root', depth: 0, label: cat.name, colorVar: '--mm-c1',
      children: cat.posts.map((p, i) => {
        const color = COLORS[i % COLORS.length];
        const href  = ROOT + 'posts/' + p.s + '.html';
        return {
          id: p.s, depth: 1, label: p.t, href: href, post: p.t,
          colorVar: color,
          children: (p.h || []).map(h2 => ({
            id: p.s + '::' + h2.a, depth: 2, label: h2.t,
            href: href + '#' + h2.a, post: p.t, colorVar: color,
            children: (h2.c || []).map(h3 => ({
              id: p.s + '::' + h3.a, depth: 3, label: h3.t,
              href: href + '#' + h3.a, post: p.t, colorVar: color,
              children: [],
            })),
          })),
        };
      }),
    };
  }

  function layout(node) {
    const shown = fitText(node.label, node.depth);
    node.text = shown;
    node.w = Math.ceil(textWidth(shown, node.depth)) + PAD_H[node.depth] * 2
             + (node.depth === 1 ? LINK_W : 0);
    node.h = NODE_H[node.depth];
    node.open = expandSet().has(node.id);
    node.shown = node.open ? node.children : [];
    let total = 0;
    node.shown.forEach((c, i) => {
      layout(c);
      if (i) total += GAP_Y[c.depth];
      total += c.subH;
    });
    node.subH = Math.max(node.h, total);
    return node;
  }

  function place(node, x, top) {
    node.x = x;
    let y = top;
    node.shown.forEach(c => {
      place(c, x + node.w + GAP_X[node.depth], y);
      y += c.subH + GAP_Y[c.depth];
    });
    if (node.shown.length) {
      const first = node.shown[0], last = node.shown[node.shown.length - 1];
      node.y = (first.y + last.y) / 2;
    } else {
      node.y = top + node.subH / 2;
    }
  }

  function bbox(node, b) {
    b.x1 = Math.min(b.x1, node.x);
    b.y1 = Math.min(b.y1, node.y - node.h / 2);
    b.x2 = Math.max(b.x2, node.x + node.w + (node.children.length ? 26 : 0));
    b.y2 = Math.max(b.y2, node.y + node.h / 2);
    node.shown.forEach(c => bbox(c, b));
    return b;
  }

  /* ───── SVG 辅助 ───── */
  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const a in attrs) e.setAttribute(a, attrs[a]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function linkPath(p, c) {
    const x1 = p.x + p.w, y1 = p.y, x2 = c.x, y2 = c.y;
    const mx = (x2 - x1) / 2;
    return 'M' + x1 + ' ' + y1 +
           'C' + (x1 + mx) + ' ' + y1 + ',' + (x1 + mx) + ' ' + y2 +
           ',' + x2 + ' ' + y2;
  }

  /* ───── 悬停提示：所属文章 + 双击跳转 ───── */
  const tip = document.createElement('div');
  tip.className = 'mm-tip';
  viewport.appendChild(tip);

  function showTip(node, clientX, clientY) {
    if (panning || node.depth === 0) return;
    let html = '';
    if (node.text !== node.label) {
      html += '<div class="mm-tip-name">' + escapeHtml(node.label) + '</div>';
    }
    html += '<div class="mm-tip-post"><span>文章</span>' +
            escapeHtml(node.post) + '</div>';
    html += '<div class="mm-tip-hint">双击跳转' +
            (node.depth > 1 ? '到对应章节' : '到文章') + '</div>';
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
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ───── 渲染 ───── */
  function render() {
    hideTip();
    const tree = layout(buildTree());
    place(tree, 0, 0);

    svg.innerHTML = '';
    world = el('g', {}, svg);
    applyTransform();

    drawLinks(tree);
    drawNode(tree);
    return tree;
  }

  function drawLinks(node) {
    node.shown.forEach(c => {
      const path = el('path', { d: linkPath(node, c), class: 'mm-link' }, world);
      path.style.stroke = 'var(' + c.colorVar + ')';
      drawLinks(c);
    });
  }

  function drawNode(node) {
    const g = el('g', { class: 'mm-node mm-d' + node.depth }, world);
    const f = FONT[node.depth];
    const hasKids = node.children.length > 0;

    if (node.depth === 0) {
      const r = el('rect', {
        x: node.x, y: node.y - node.h / 2, width: node.w, height: node.h,
        rx: node.h / 2, class: 'mm-rect-root',
      }, g);
      r.style.fill = 'var(--mm-root)';
    } else if (node.depth === 1) {
      const r = el('rect', {
        x: node.x, y: node.y - node.h / 2, width: node.w, height: node.h,
        rx: 9, class: 'mm-rect-post',
      }, g);
      r.style.stroke = 'var(' + node.colorVar + ')';
      r.style.fill = 'var(' + node.colorVar + ')';
    } else {
      /* 命中区域（透明矩形，方便悬停/双击） */
      el('rect', {
        x: node.x, y: node.y - node.h / 2, width: node.w, height: node.h,
        class: 'mm-hit',
      }, g);
      const u = el('line', {
        x1: node.x, y1: node.y + node.h / 2,
        x2: node.x + node.w, y2: node.y + node.h / 2,
        class: 'mm-underline mm-underline-' + node.depth,
      }, g);
      u.style.stroke = 'var(' + node.colorVar + ')';
    }

    const t = el('text', {
      x: node.x + PAD_H[node.depth],
      y: node.y, 'dominant-baseline': 'central',
      class: 'mm-text mm-text-d' + node.depth,
    }, g);
    t.style.font = f.weight + ' ' + f.size + 'px ' + f.family;
    t.textContent = node.text;

    /* 文章节点：↗ 直接打开（阻止冒泡，不触发展开） */
    if (node.depth === 1 && node.href) {
      const a = el('a', { href: node.href, class: 'mm-open' }, g);
      const ax = node.x + node.w - LINK_W + 4;
      el('rect', {
        x: ax - 3, y: node.y - 9, width: 18, height: 18, rx: 5,
        class: 'mm-open-bg',
      }, a);
      const at = el('text', {
        x: ax + 6, y: node.y + 0.5,
        'dominant-baseline': 'central', 'text-anchor': 'middle',
        class: 'mm-open-icon',
      }, a);
      at.textContent = '↗';
      a.addEventListener('click', e => e.stopPropagation());
      a.addEventListener('dblclick', e => e.stopPropagation());
    }

    /* 展开/收起圆点：展开显示 −，收起显示子节点数 */
    if (hasKids) {
      g.classList.add('mm-toggleable');
      const tg = el('g', { class: 'mm-toggle' }, g);
      const cx = node.x + node.w + 13, cy = node.y;
      const c = el('circle', { cx: cx, cy: cy, r: 9 }, tg);
      c.style.stroke = 'var(' + node.colorVar + ')';
      const tt = el('text', {
        x: cx, y: cy + 0.5,
        'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, tg);
      tt.textContent = node.open ? '−' : String(node.children.length);
    }

    /* 单击展开/收起（延迟执行，给双击让路）；双击跳转文章对应位置 */
    let clickTimer = 0;
    g.addEventListener('click', () => {
      clearTimeout(clickTimer);
      if (!hasKids) return;
      clickTimer = setTimeout(() => {
        const set = expandSet();
        if (set.has(node.id)) set.delete(node.id);
        else set.add(node.id);
        render();
      }, 230);
    });
    g.addEventListener('dblclick', (e) => {
      clearTimeout(clickTimer);
      e.preventDefault();
      if (node.href) location.href = node.href;
    });

    /* 悬停提示所属文章 */
    if (node.depth > 0) {
      g.addEventListener('pointerenter', e => showTip(node, e.clientX, e.clientY));
      g.addEventListener('pointermove',  e => moveTip(e.clientX, e.clientY));
      g.addEventListener('pointerleave', hideTip);
    }

    node.shown.forEach(drawNode);
  }

  /* ───── 平移 / 缩放 ───── */
  function applyTransform() {
    if (world) world.setAttribute(
      'transform', 'translate(' + tx + ' ' + ty + ') scale(' + k + ')');
  }
  function clampK(v) { return Math.max(0.08, Math.min(3, v)); }

  function zoomAt(px, py, factor) {
    const nk = clampK(k * factor);
    factor = nk / k;
    tx = px - (px - tx) * factor;
    ty = py - (py - ty) * factor;
    k = nk;
    applyTransform();
  }

  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  let px0 = 0, py0 = 0, tx0 = 0, ty0 = 0;
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.mm-node')) return;   // 节点点击不平移
    panning = true;
    hideTip();
    px0 = e.clientX; py0 = e.clientY; tx0 = tx; ty0 = ty;
    viewport.classList.add('mm-panning');
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  });
  svg.addEventListener('pointermove', e => {
    if (!panning) return;
    tx = tx0 + e.clientX - px0;
    ty = ty0 + e.clientY - py0;
    applyTransform();
  });
  function endPan() { panning = false; viewport.classList.remove('mm-panning'); }
  svg.addEventListener('pointerup', endPan);
  svg.addEventListener('pointercancel', endPan);

  function fit(tree) {
    const b = bbox(tree, { x1: 1e9, y1: 1e9, x2: -1e9, y2: -1e9 });
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const w = b.x2 - b.x1, h = b.y2 - b.y1, m = 48;
    k = clampK(Math.min((vw - m * 2) / w, (vh - m * 2) / h, 1));
    tx = (vw - w * k) / 2 - b.x1 * k;
    ty = (vh - h * k) / 2 - b.y1 * k;
    applyTransform();
  }

  viewport.querySelectorAll('.mm-toolbar button').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      const vw = viewport.clientWidth / 2, vh = viewport.clientHeight / 2;
      if (act === 'in')  zoomAt(vw, vh, 1.25);
      if (act === 'out') zoomAt(vw, vh, 1 / 1.25);
      if (act === 'fit') fit(render());
    });
  });

  /* ───── 分类切换 ───── */
  function setCategory(id, refit) {
    cat = data.find(c => c.id === id) || data[0];
    if (tabsBox) {
      tabsBox.querySelectorAll('.mm-tab').forEach(b =>
        b.classList.toggle('active', b.getAttribute('data-id') === cat.id));
    }
    try { history.replaceState(null, '', '#' + cat.id); } catch (_) {}
    const tree = render();
    if (refit !== false) fit(tree);
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
})();
