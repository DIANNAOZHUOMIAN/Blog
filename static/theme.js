/* 主题切换：纸 → 墨 → 樱 → ... */
(function () {
  const THEMES = [
    { id: 'paper',  name: '纸' },
    { id: 'ink',    name: '墨' },
    { id: 'sakura', name: '樱' },
  ];

  const body = document.body;
  const btn  = document.getElementById('theme-toggle');
  const label = btn ? btn.querySelector('.theme-name') : null;

  let saved = localStorage.getItem('blog-theme');
  if (!THEMES.find(t => t.id === saved)) saved = 'paper';
  applyTheme(saved);

  if (btn) {
    btn.addEventListener('click', () => {
      const idx = THEMES.findIndex(t => t.id === currentTheme());
      const next = THEMES[(idx + 1) % THEMES.length];
      applyTheme(next.id);
      localStorage.setItem('blog-theme', next.id);
    });
  }

  function currentTheme() {
    return body.getAttribute('data-theme') || 'paper';
  }
  function applyTheme(id) {
    body.setAttribute('data-theme', id);
    const t = THEMES.find(x => x.id === id);
    if (label && t) label.textContent = t.name;
  }

  /* 侧边栏移动端切换 */
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
  }
})();
