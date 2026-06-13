/* 主题切换 + 侧栏 + 唤回桌宠 */
(function () {
  const THEMES = [
    { id: 'paper',  name: '纸' },
    { id: 'ink',    name: '墨' },
    { id: 'sakura', name: '樱' },
  ];

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
