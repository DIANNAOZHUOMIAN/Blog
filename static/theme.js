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

    /* 唤回桌宠：清掉所有相关存储 + 移除已存在 DOM + 重新加载脚本 */
    const restore = document.getElementById('pet-restore');
    if (restore) {
      restore.addEventListener('click', (e) => {
        e.preventDefault();

        // 1) 清掉所有 waifu / live2d / 模型相关的 storage 键
        const purge = (storage) => {
          try {
            Object.keys(storage).forEach(k => {
              if (/waifu|live2d|cubism|model/i.test(k)) storage.removeItem(k);
            });
          } catch (_) {}
        };
        purge(sessionStorage);
        purge(localStorage);

        // 2) 直接移除已存在的桌宠 DOM
        ['waifu', 'waifu-toggle'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.remove();
        });

        // 3) 移除旧脚本，重新加载（带时间戳防缓存）
        document.querySelectorAll('script[src*="live2d-widget"]').forEach(s => s.remove());
        const s = document.createElement('script');
        s.async = true;
        s.src = 'https://fastly.jsdelivr.net/gh/stevenjoezhang/live2d-widget@latest/autoload.js?t=' + Date.now();
        document.body.appendChild(s);

        // 4) 视觉反馈
        const old = restore.textContent;
        restore.textContent = '正在唤回…';
        setTimeout(() => { restore.textContent = old; }, 2500);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
