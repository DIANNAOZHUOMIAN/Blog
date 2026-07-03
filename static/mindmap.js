/* 思维导图：分类 → 文章 → 二级标题 → 三级标题
   放射状「星图 / 烟花」布局（参考 Obsidian 知识图谱）：
   分类居中，文章呈 360° 散开，知识点在外环展开。
   滚轮缩放（放大逐级显示标签）、拖拽平移、单击展开/收起、
   悬停高亮所在分支并提示所属文章、双击跳转到文章对应章节。 */
(function () {
  'use strict';

  const data = window.MINDMAP_DATA;
  const svg      = document.getElementById('mm-svg');
  const viewport = document.getElementById('mm-viewport');
  const tabsBox  = document.getElementById('mm-tabs');
  if (!Array.isArray(data) || !data.length || !svg || !viewport) return;

  const NS   = 'http://www.w3.org/2000/svg';
  const ROOT = window.SITE_ROOT || '';
  const TAU  = Math.PI * 2;

  /* 分支配色（CSS 变量随 paper/ink 主题切换） */
  const COLORS = ['--mm-c1','--mm-c2','--mm-c3','--mm-c4',
                  '--mm-c5','--mm-c6','--mm-c7','--mm-c8'];

  const cs    = getComputedStyle(document.documentElement);
  const SANS  = (cs.getPropertyValue('--sans')  || 'sans-serif').trim();
  const SERIF = (cs.getPropertyValue('--serif') || 'serif').trim();
  const FONT = {
    0: '400 20px ' + SERIF,
    1: '400 13px ' + SANS,
    2: '300 11px ' + SANS,
    3: '300 10px ' + SANS,
  };
  const LABEL_MAX = { 0: 420, 1: 230, 2: 200, 3: 180 };   // 标签超宽截断
  const DOT       = { 1: 7, 2: 3.5, 3: 2.5 };             // 圆点基准半径

  const measureCtx = document.createElement('canvas').getContext('2d');
  function textWidth(text, d) {
    measureCtx.font = FONT[d];
    return measureCtx.measureText(text).width;
  }
  function fitText(text, d) {
    const max = LABEL_MAX[d];
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
  let bounds = null;                    // 本次布局的包围盒（含标签）
  let focusEls = [];                    // 悬停高亮中的元素

  function expandSet() {
    if (!expanded.has(cat.id)) {
      // 默认展开到二级标题：根 + 所有文章节点，一打开就是完整星图
      const set = new Set(['root']);
      cat.posts.forEach(p => set.add(p.s));
      expanded.set(cat.id, set);
    }
    return expanded.get(cat.id);
  }

  /* ───── 树构建 ───── */
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

  /* ───── 放射状布局 ─────
     角度按可见叶子数分摊扇区；半径按每环节点数自适应，保证圆周不拥挤。 */
  function layout(tree) {
    const set = expandSet();
    const counts = { 1: 0, 2: 0, 3: 0 };

    (function prepare(node) {
      node.text  = fitText(node.label, node.depth);
      node.open  = set.has(node.id);
      node.shown = node.open ? node.children : [];
      node.shown.forEach(c => { c.parent = node; });
      if (node.depth) counts[node.depth]++;
      let lv = 0;
      node.shown.forEach(c => { lv += prepare(c); });
      node.leaves = node.shown.length ? lv : 1;
      return node.leaves;
    })(tree);

    const R = { 0: 0 };
    R[1] = Math.max(150, counts[1] * 46 / TAU);
    R[2] = Math.max(R[1] + 160, counts[2] * 13 / TAU);
    R[3] = Math.max(R[2] + 130, counts[3] * 12 / TAU);

    bounds = { x1: -60, y1: -40, x2: 60, y2: 40 };

    (function assign(node, a0, a1) {
      node.a = (a0 + a1) / 2;
      node.r = R[node.depth];
      node.x = Math.cos(node.a) * node.r;
      node.y = Math.sin(node.a) * node.r;
      if (node.depth) { placeLabel(node); grow(node); }
      let acc = a0;
      node.shown.forEach(c => {
        const span = (a1 - a0) * c.leaves / node.leaves;
        assign(c, acc, acc + span);
        acc += span;
      });
    })(tree, -Math.PI / 2, TAU - Math.PI / 2);

    return tree;
  }

  function dotR(node) {
    const base = DOT[node.depth];
    return node.depth === 1
      ? base + Math.min(4, node.children.length * 0.3)
      : base;
  }

  /* 标签位置：左右半球分别外扩，接近正上/正下时居中放到上/下方 */
  function placeLabel(node) {
    const r = dotR(node) + 6;
    const c = Math.cos(node.a), s = Math.sin(node.a);
    if (Math.abs(c) >= 0.35) {
      node.anchor = c > 0 ? 'start' : 'end';
      node.lx = node.x + (c > 0 ? r : -r);
      node.ly = node.y + s * 3;
    } else {
      node.anchor = 'middle';
      node.lx = node.x;
      node.ly = node.y + (s > 0 ? r + 9 : -(r + 5));
    }
  }

  function grow(node) {
    const w = textWidth(node.text, node.depth);
    const x1 = node.anchor === 'start' ? node.lx
             : node.anchor === 'end'   ? node.lx - w
             : node.lx - w / 2;
    bounds.x1 = Math.min(bounds.x1, node.x - 12, x1 - 4);
    bounds.x2 = Math.max(bounds.x2, node.x + 12, x1 + w + 4);
    bounds.y1 = Math.min(bounds.y1, node.y - 14, node.ly - 12);
    bounds.y2 = Math.max(bounds.y2, node.y + 14, node.ly + 6);
  }

  /* ───── SVG 辅助 ───── */
  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const a in attrs) e.setAttribute(a, attrs[a]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* 放射连线：沿极坐标过渡的贝塞尔曲线，根出发的是直线光束 */
  function linkPath(p, c) {
    if (p.depth === 0) {
      const r0 = 34;
      return 'M' + (Math.cos(c.a) * r0) + ' ' + (Math.sin(c.a) * r0) +
             'L' + c.x + ' ' + c.y;
    }
    const rm = (p.r + c.r) / 2;
    const c1x = Math.cos(p.a) * rm, c1y = Math.sin(p.a) * rm;
    const c2x = Math.cos(c.a) * rm, c2y = Math.sin(c.a) * rm;
    return 'M' + p.x + ' ' + p.y +
           'C' + c1x + ' ' + c1y + ',' + c2x + ' ' + c2y +
           ',' + c.x + ' ' + c.y;
  }

  /* ───── 悬停提示 ───── */
  const tip = document.createElement('div');
  tip.className = 'mm-tip';
  viewport.appendChild(tip);

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function showTip(node, clientX, clientY) {
    if (panning || node.depth === 0) return;
    let html = '';
    if (node.depth > 1 || node.text !== node.label) {
      html += '<div class="mm-tip-name">' + escapeHtml(node.label) + '</div>';
    }
    html += '<div class="mm-tip-post"><span>文章</span>' +
            escapeHtml(node.post) + '</div>';
    html += '<div class="mm-tip-hint">双击跳转' +
            (node.depth > 1 ? '到对应章节' : '到文章') +
            (node.children.length ? ' · 单击' + (node.open ? '收起' : '展开') : '') +
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

  /* ───── 悬停高亮：点亮根→节点路径与其子树，其余淡出 ───── */
  function markLit(n) {
    if (n.el)     { n.el.classList.add('lit');     focusEls.push(n.el); }
    if (n.linkEl) { n.linkEl.classList.add('lit'); focusEls.push(n.linkEl); }
  }
  function setFocus(node) {
    clearFocus();
    svg.classList.add('mm-focus');
    for (let n = node; n; n = n.parent) markLit(n);
    (function down(n) {
      n.shown.forEach(c => { markLit(c); down(c); });
    })(node);
  }
  function clearFocus() {
    svg.classList.remove('mm-focus');
    focusEls.forEach(e => e.classList.remove('lit'));
    focusEls = [];
  }

  /* ───── 渲染 ───── */
  function render() {
    hideTip();
    clearFocus();
    const tree = layout(buildTree());

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
      c.linkEl = path;
      drawLinks(c);
    });
  }

  function drawNode(node) {
    const g = el('g', { class: 'mm-node mm-d' + node.depth }, world);
    g.style.setProperty('--c', 'var(' + node.colorVar + ')');
    node.el = g;
    const hasKids = node.children.length > 0;
    if (hasKids) g.classList.add('mm-toggleable');

    if (node.depth === 0) {
      /* 根：居中胶囊 */
      const w = Math.ceil(textWidth(node.text, 0)) + 52, h = 46;
      el('rect', {
        x: -w / 2, y: -h / 2, width: w, height: h, rx: h / 2,
        class: 'mm-root-pill',
      }, g);
      const t = el('text', {
        x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        class: 'mm-root-label',
      }, g);
      t.style.font = FONT[0];
      t.textContent = node.text;
    } else {
      const r = dotR(node);
      /* 命中区（比圆点大一圈，方便悬停小点） */
      el('circle', { cx: node.x, cy: node.y, r: r + 8, class: 'mm-hitc' }, g);
      el('circle', { cx: node.x, cy: node.y, r: r, class: 'mm-dot' }, g);
      if (hasKids && !node.open) {
        el('circle', { cx: node.x, cy: node.y, r: r + 3.5, class: 'mm-ring' }, g);
      }
      const t = el('text', {
        x: node.lx, y: node.ly,
        'text-anchor': node.anchor, 'dominant-baseline': 'central',
        class: 'mm-label mm-label-d' + node.depth,
      }, g);
      t.style.font = FONT[node.depth];
      t.textContent = node.text;
      if (hasKids && !node.open) {
        const ts = el('tspan', { class: 'mm-count' }, t);
        ts.textContent = ' +' + node.children.length;
      }
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

    /* 悬停：提示所属文章 + 点亮分支 */
    if (node.depth > 0) {
      g.addEventListener('pointerenter', e => {
        if (panning) return;
        setFocus(node);
        showTip(node, e.clientX, e.clientY);
      });
      g.addEventListener('pointermove',  e => moveTip(e.clientX, e.clientY));
      g.addEventListener('pointerleave', () => { clearFocus(); hideTip(); });
    }

    node.shown.forEach(drawNode);
  }

  /* ───── 平移 / 缩放 ───── */
  function applyTransform() {
    if (world) world.setAttribute(
      'transform', 'translate(' + tx + ' ' + ty + ') scale(' + k + ')');
    // 缩放层级：放大逐级显示二/三级标签（星图看形，放大看字）
    const z = k > 1.5 ? '3' : k > 0.75 ? '2' : '1';
    if (svg.getAttribute('data-z') !== z) svg.setAttribute('data-z', z);
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

  function fit() {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const w = bounds.x2 - bounds.x1, h = bounds.y2 - bounds.y1, m = 40;
    k = clampK(Math.min((vw - m * 2) / w, (vh - m * 2) / h, 1.2));
    tx = (vw - w * k) / 2 - bounds.x1 * k;
    ty = (vh - h * k) / 2 - bounds.y1 * k;
    applyTransform();
  }

  viewport.querySelectorAll('.mm-toolbar button').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      const vw = viewport.clientWidth / 2, vh = viewport.clientHeight / 2;
      if (act === 'in')  zoomAt(vw, vh, 1.25);
      if (act === 'out') zoomAt(vw, vh, 1 / 1.25);
      if (act === 'fit') { render(); fit(); }
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
    render();
    fit();
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
