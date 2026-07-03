/* 主题切换 + 侧栏 + 唤回桌宠 */
(function () {
  const THEMES = [
    { id: 'paper',  name: '纸' },
    { id: 'ink',    name: '墨' },
  ];

  /* ───── 桌宠模型固定：切换文章时不再随机换装 ─────
     上游 widget 每次加载都会对多套服装的模型随机选一套（e(models[id])），
     于是每翻一篇文章桌宠就换一次。这里包住 loadlive2d：页面初始化那一次
     沿用"上次显示的模型"，手动切换/换装仍照常生效并更新记忆。
     必须在 live2d.min.js（window.loadlive2d=L）执行前装好，故同步运行。 */
  (function pinPetModel() {
    const KEY = 'waifu-model-url';
    let real = null, pinnedThisLoad = false;
    function wrapped() {
      const args = Array.prototype.slice.call(arguments);
      if (args[0] === 'live2d' && args[1]) {
        if (!pinnedThisLoad) {                 // 初始化加载：优先用上次的模型
          const saved = localStorage.getItem(KEY);
          if (saved) args[1] = saved;
          pinnedThisLoad = true;
        }
        try { localStorage.setItem(KEY, args[1]); } catch (_) {}
      }
      return real ? real.apply(window, args) : undefined;
    }
    try {
      Object.defineProperty(window, 'loadlive2d', {
        configurable: true,
        get() { return wrapped; },
        set(v) { real = v; },          // live2d.min.js 赋值时捕获真函数
      });
    } catch (_) {}
  })();

  function init() {
    const body  = document.body;
    const btn   = document.getElementById('theme-toggle');
    const label = btn ? btn.querySelector('.theme-name') : null;

    let saved = localStorage.getItem('blog-theme');
    if (!THEMES.find(t => t.id === saved)) saved = 'paper';
    applyTheme(saved);

    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const cur = body.getAttribute('data-theme') || 'paper';
        const idx = THEMES.findIndex(t => t.id === cur);
        const next = THEMES[(idx + 1) % THEMES.length];
        applyTheme(next.id);
        localStorage.setItem('blog-theme', next.id);
      });
    }

    function applyTheme(id) {
      body.setAttribute('data-theme', id);
      const t = THEMES.find(x => x.id === id);
      if (label && t) label.textContent = t.name;
    }

    /* 侧栏移动端开关 */
    const sToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (sToggle && sidebar) {
      sToggle.addEventListener('click', e => {
        e.stopPropagation();
        sidebar.classList.toggle('open');
      });
      document.addEventListener('click', e => {
        if (sidebar.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            e.target !== sToggle) {
          sidebar.classList.remove('open');
        }
      });
      sidebar.addEventListener('click', e => {
        if (e.target.tagName === 'A' && window.innerWidth <= 980) {
          sidebar.classList.remove('open');
        }
      });
    }

    /* 唤回桌宠：优先就地复位，无需刷新页面 */
    const LIVE2D = 'https://fastly.jsdelivr.net/gh/stevenjoezhang/live2d-widget@latest/';
    const CDN    = 'https://fastly.jsdelivr.net/gh/fghrsh/live2d_api/';

    function restorePet() {
      // 去掉「关闭 24h」标记，否则脚本会继续把它藏起来
      try { localStorage.removeItem('waifu-display'); } catch (_) {}

      const waifu  = document.getElementById('waifu');
      const toggle = document.getElementById('waifu-toggle');

      // 1) 已加载、仅被隐藏（点 × 关闭后 DOM 仍在）→ 直接复位，最快、无需刷新
      if (waifu) {
        waifu.style.display = '';
        requestAnimationFrame(() => { waifu.style.bottom = '0'; });
        if (toggle) toggle.classList.remove('waifu-toggle-active');
        return;
      }

      // 2) 脚本已就绪但 #waifu 未挂载（刷新时正处于隐藏期）→ 直接重新挂载
      if (typeof window.loadWidget === 'function') {
        try { window.loadWidget(LIVE2D + 'waifu-tips.json', CDN); return; } catch (_) {}
      }

      // 3) 完全未加载 → 重新注入 autoload（带时间戳防缓存）
      document.querySelectorAll('script[src*="live2d-widget"]').forEach(s => s.remove());
      const s = document.createElement('script');
      s.async = true;
      s.src = LIVE2D + 'autoload.js?t=' + Date.now();
      document.body.appendChild(s);
    }

    const restore = document.getElementById('pet-restore');
    if (restore) {
      restore.addEventListener('click', (e) => {
        e.preventDefault();
        restorePet();
        const old = restore.textContent;
        restore.textContent = '已唤回';
        setTimeout(() => { restore.textContent = old; }, 1500);
      });
    }

    enablePetDrag();
    guardPetSwitching();
    initDivider();
    initSearch();
    initCodeCopy();
    initReadProgress();
    initBackTop();
  }

  /* ───── 代码块一键复制 ───── */
  function initCodeCopy() {
    document.querySelectorAll('.post-body pre').forEach((pre) => {
      // codehilite 已有外层 div，裸 pre 则补一个包装层做按钮定位
      let host = pre.parentElement;
      if (!host.classList.contains('codehilite')) {
        host = document.createElement('div');
        host.className = 'code-wrap';
        pre.parentNode.insertBefore(host, pre);
        host.appendChild(pre);
      }
      host.classList.add('code-host');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy';
      btn.title = '复制代码';
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<rect x="9" y="9" width="11" height="11" rx="2"></rect>' +
        '<path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>' +
        '<span>复制</span>';

      btn.addEventListener('click', async () => {
        const text = pre.innerText.replace(/\n$/, '');
        let ok = false;
        try {
          await navigator.clipboard.writeText(text);
          ok = true;
        } catch (_) {
          // http / 旧浏览器降级
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          try { ok = document.execCommand('copy'); } catch (_) {}
          ta.remove();
        }
        btn.classList.add(ok ? 'copied' : 'failed');
        btn.querySelector('span').textContent = ok ? '已复制' : '失败';
        clearTimeout(btn._t);
        btn._t = setTimeout(() => {
          btn.classList.remove('copied', 'failed');
          btn.querySelector('span').textContent = '复制';
        }, 1600);
      });
      host.appendChild(btn);
    });
  }

  /* ───── 文章页顶部阅读进度条 ───── */
  function initReadProgress() {
    if (!document.querySelector('.post-full')) return;
    const bar = document.createElement('div');
    bar.className = 'read-progress';
    document.body.appendChild(bar);
    function update() {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? doc.scrollTop / max : 0) + ')';
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ───── 返回顶部 ───── */
  function initBackTop() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'back-top';
    btn.title = '返回顶部';
    btn.textContent = '↑';
    document.body.appendChild(btn);
    btn.addEventListener('click', () =>
      window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('scroll', () => {
      btn.classList.toggle('show', window.scrollY > 400);
    }, { passive: true });
  }

  /* ───── 分隔条：装饰光晕（随鼠标/主题）+ 拖拽改变目录宽度 ───── */
  function initDivider() {
    const d = document.getElementById('divider');
    if (!d) return;
    const root = document.documentElement;
    const BP = 980, MIN = 200, MAX_ABS = 460, WKEY = 'sidebar-w';

    function clampW(w) {
      const max = Math.min(MAX_ABS, Math.round(window.innerWidth * 0.4));
      return Math.max(MIN, Math.min(max, w));
    }
    // 应用保存的宽度（仅桌面；移动端清掉内联值，让媒体查询的 0 生效）
    function applySavedWidth() {
      if (window.innerWidth <= BP) { root.style.removeProperty('--side-w'); return; }
      const w = parseInt(localStorage.getItem(WKEY) || '', 10);
      if (w) root.style.setProperty('--side-w', clampW(w) + 'px');
    }
    applySavedWidth();

    // 拖拽：侧栏右边缘 = 光标 X
    let resizing = false;
    d.addEventListener('pointerdown', (e) => {
      if (window.innerWidth <= BP || e.button !== 0) return;
      e.preventDefault();
      resizing = true;
      try { d.setPointerCapture(e.pointerId); } catch (_) {}
      document.body.classList.add('resizing-sidebar');
    });
    window.addEventListener('pointermove', (e) => {
      if (!resizing) return;
      root.style.setProperty('--side-w', clampW(e.clientX) + 'px');
    });
    function stopResize() {
      if (!resizing) return;
      resizing = false;
      document.body.classList.remove('resizing-sidebar');
      const w = parseInt(getComputedStyle(root).getPropertyValue('--side-w'), 10);
      if (w) localStorage.setItem(WKEY, w);
    }
    d.addEventListener('pointerup', stopResize);
    d.addEventListener('pointercancel', stopResize);
    window.addEventListener('resize', applySavedWidth);

    // 装饰光晕：跟随鼠标 Y、按横向距离渐强
    let raf = 0, mx = 0, my = 0;
    function update() {
      raf = 0;
      if (resizing) return;
      const rect = d.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const glow = Math.max(0, 1 - Math.abs(mx - cx) / 140);
      d.style.setProperty('--gy', (my - rect.top) + 'px');
      d.style.setProperty('--glow', glow.toFixed(3));
    }
    window.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      if (!raf) raf = requestAnimationFrame(update);
    }, { passive: true });
    document.addEventListener('mouseleave', () => d.style.setProperty('--glow', '0'));
  }

  /* ───── 顶部搜索框：标题模糊搜索 ───── */
  function initSearch() {
    const box = document.getElementById('search');
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    if (!box || !input || !results || !Array.isArray(window.SEARCH_INDEX)) return;
    const ROOT = window.SITE_ROOT || '';
    let current = [], active = -1;

    function esc(s) {
      return s.replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    // 模糊打分：子序列匹配，连续/开头加权；返回 -1 表示不匹配
    function score(q, text) {
      q = q.toLowerCase(); const t = text.toLowerCase();
      if (!q) return -1;
      const sub = t.indexOf(q);
      if (sub >= 0) return 100 - sub + (sub === 0 ? 20 : 0);   // 子串命中优先
      let qi = 0, sc = 0, prev = -2;
      for (let i = 0; i < t.length && qi < q.length; i++) {
        if (t[i] === q[qi]) {
          sc += (i === prev + 1) ? 3 : 1;
          if (i === 0) sc += 2;
          prev = i; qi++;
        }
      }
      return qi === q.length ? sc : -1;
    }
    function highlight(title, q) {
      const t = title.toLowerCase(), i = t.indexOf(q.toLowerCase());
      if (q && i >= 0) {
        return esc(title.slice(0, i)) + '<mark>' + esc(title.slice(i, i + q.length)) +
               '</mark>' + esc(title.slice(i + q.length));
      }
      return esc(title);
    }

    function close() { box.classList.remove('open'); active = -1; }
    function setActive(n) {
      const items = results.querySelectorAll('.search-item');
      if (!items.length) return;
      active = (n + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('active', i === active));
      items[active].scrollIntoView({ block: 'nearest' });
    }
    function run() {
      const q = input.value.trim();
      if (!q) { close(); return; }
      current = window.SEARCH_INDEX
        .map(it => ({ it, s: score(q, it.t) }))
        .filter(x => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 8)
        .map(x => x.it);
      if (!current.length) {
        results.innerHTML = '<div class="search-empty">没有匹配的文章</div>';
      } else {
        results.innerHTML = current.map(it =>
          '<a class="search-item" href="' + ROOT + 'posts/' + it.s + '.html">' +
          '<span class="search-cat">' + esc(it.c) + '</span>' +
          '<span class="search-title">' + highlight(it.t, q) + '</span></a>'
        ).join('');
      }
      box.classList.add('open');
      active = -1;
    }

    input.addEventListener('input', run);
    input.addEventListener('focus', () => { if (input.value.trim()) run(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') {
        const items = results.querySelectorAll('.search-item');
        const target = items[active >= 0 ? active : 0];
        if (target) location.href = target.getAttribute('href');
      } else if (e.key === 'Escape') { input.value = ''; close(); input.blur(); }
    });
    document.addEventListener('click', (e) => { if (!box.contains(e.target)) close(); });
  }

  /* ───── 在 #waifu-tips 气泡里显示一句话（复用 widget 的样式） ───── */
  function showWaifuTip(text, ms) {
    const tips = document.getElementById('waifu-tips');
    if (!tips) return;
    tips.innerHTML = text;
    tips.classList.add('waifu-tips-active');
    clearTimeout(showWaifuTip._t);
    showWaifuTip._t = setTimeout(
      () => tips.classList.remove('waifu-tips-active'), ms || 3000);
  }

  /* ───── 串行化「切换模型 / 换装」，避免并行加载导致画布空白 ─────
     上游 live2d.min.js 的 loadlive2d 不可重入：上一个模型贴图还没加载完
     就再点一次，两次加载会竞争，画布变空白（但气泡已弹出）。这里在一次
     切换完成前，用冷却锁挡掉后续点击。 */
  function guardPetSwitching() {
    let lock = false;
    const COOLDOWN = 2000;   // 一次切换的保护窗口

    document.addEventListener('click', (e) => {
      const btn = e.target.closest(
        '#waifu-tool-switch-model, #waifu-tool-switch-texture');
      if (!btn) return;

      if (lock) {
        // 上一次切换还在进行，丢弃这次点击
        e.stopImmediatePropagation();
        e.preventDefault();
        showWaifuTip('正在换装中，稍等一下下～', 2000);
        return;
      }

      // 放行这次点击（不阻止冒泡，widget 的回调照常执行），同时上锁
      lock = true;
      const waifu = document.getElementById('waifu');
      if (waifu) waifu.classList.add('waifu-switching');
      setTimeout(() => {
        lock = false;
        const w = document.getElementById('waifu');
        if (w) w.classList.remove('waifu-switching');
      }, COOLDOWN);
    }, true);   // 捕获阶段，先于 widget 自身的处理器
  }

  /* ───── 桌宠鼠标拖拽（widget 本身不带，自行实现） ───── */
  function enablePetDrag() {
    const POS_KEY = 'waifu-pos';
    let waifu = null, dragging = false, engaged = false;
    let startX = 0, startY = 0, baseLeft = 0, baseTop = 0;
    const THRESHOLD = 4;   // 移动超过 4px 才算拖动，否则视为点击（保留点按交互）

    function clamp(v, max) { return Math.min(Math.max(0, v), Math.max(0, max)); }

    function placeAt(el, left, top) {
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.left = clamp(left, window.innerWidth - el.offsetWidth) + 'px';
      el.style.top = clamp(top, window.innerHeight - el.offsetHeight) + 'px';
    }

    // 还原上次拖到的位置（#waifu 由 widget 异步创建，出现后再应用）
    function applySavedPos() {
      const el = document.getElementById('waifu');
      if (!el) return;
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch (_) {}
      if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
        placeAt(el, saved.left, saved.top);
        // widget 载入时会用 setTimeout 重设 bottom，稍后再覆盖一次
        setTimeout(() => placeAt(el, saved.left, saved.top), 80);
      }
    }
    const obs = new MutationObserver(() => {
      if (document.getElementById('waifu')) { applySavedPos(); }
    });
    obs.observe(document.body, { childList: true });
    applySavedPos();

    document.addEventListener('pointerdown', (e) => {
      const el = document.getElementById('waifu');
      if (!el || !el.contains(e.target)) return;
      if (e.target.closest('#waifu-tool')) return;   // 工具按钮不触发拖动
      if (e.button !== 0) return;
      waifu = el;
      const r = el.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      baseLeft = r.left; baseTop = r.top;
      dragging = true; engaged = false;
    });

    document.addEventListener('pointermove', (e) => {
      if (!dragging || !waifu) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!engaged) {
        if (Math.hypot(dx, dy) < THRESHOLD) return;   // 未越过阈值，仍当点击
        engaged = true;
        waifu.classList.add('waifu-dragging');
        document.body.style.userSelect = 'none';
      }
      placeAt(waifu, baseLeft + dx, baseTop + dy);
      e.preventDefault();
    });

    function endDrag() {
      if (dragging && engaged && waifu) {
        try {
          localStorage.setItem(POS_KEY, JSON.stringify({
            left: parseFloat(waifu.style.left) || 0,
            top:  parseFloat(waifu.style.top) || 0,
          }));
        } catch (_) {}
        waifu.classList.remove('waifu-dragging');
      }
      document.body.style.userSelect = '';
      dragging = false; engaged = false; waifu = null;
    }
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);

    // 窗口缩放时把桌宠拉回可视区域
    window.addEventListener('resize', () => {
      const el = document.getElementById('waifu');
      if (el && el.style.left) {
        placeAt(el, parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
