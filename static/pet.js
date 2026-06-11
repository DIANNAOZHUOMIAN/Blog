/* 桌宠：待机动作、眼随鼠标、点击比心 */
(function () {
  const stage    = document.getElementById('pet-stage');
  const pet      = document.getElementById('pet');
  const msg      = document.getElementById('pet-msg');
  if (!stage || !pet) return;

  /* ── 状态 ────────────────────────────────────────── */
  let watching   = false;   // 鼠标是否在桌宠区域内
  let inHeart    = false;   // 是否处于比心状态
  let idleTimer  = null;

  /* ── 1) 眨眼（持续） ─────────────────────────────── */
  const leftLid  = pet.querySelector('#eye-left .lid');
  const rightLid = pet.querySelector('#eye-right .lid');
  function blink() {
    if (inHeart) return scheduleBlink();
    if (!leftLid || !rightLid) return scheduleBlink();
    leftLid.setAttribute('height', '26');
    rightLid.setAttribute('height', '26');
    setTimeout(() => {
      leftLid.setAttribute('height', '0');
      rightLid.setAttribute('height', '0');
    }, 130);
    scheduleBlink();
  }
  function scheduleBlink() {
    const ms = 2200 + Math.random() * 3500;
    setTimeout(blink, ms);
  }
  scheduleBlink();

  /* ── 2) 待机随机动作 ────────────────────────────── */
  const IDLE_ACTIONS = ['wave', 'tilt', 'wink'];
  function scheduleIdle() {
    clearTimeout(idleTimer);
    const ms = 4500 + Math.random() * 4500;
    idleTimer = setTimeout(doIdle, ms);
  }
  function doIdle() {
    if (watching || inHeart) return scheduleIdle();
    const act = IDLE_ACTIONS[Math.floor(Math.random() * IDLE_ACTIONS.length)];
    pet.classList.add(act);
    showMsg(idleMsg(act));
    setTimeout(() => {
      pet.classList.remove(act);
      scheduleIdle();
    }, 1400);
  }
  function idleMsg(a) {
    return { wave: '嗨～', tilt: '？', wink: '✦' }[a] || '';
  }
  scheduleIdle();

  /* ── 3) 鼠标进出 + 眼随鼠标 ─────────────────────── */
  const pupilWraps = pet.querySelectorAll('.pupil-wrap');
  const MAX_OFFSET = 3;   // 瞳孔最大位移

  stage.addEventListener('mouseenter', () => {
    watching = true;
    showMsg('看着你呢～');
  });
  stage.addEventListener('mouseleave', () => {
    watching = false;
    pupilWraps.forEach(p => p.removeAttribute('transform'));
    hideMsg();
  });
  stage.addEventListener('mousemove', (e) => {
    if (inHeart) return;
    const rect = pet.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const offX = (dx / dist) * MAX_OFFSET;
    const offY = (dy / dist) * MAX_OFFSET;
    pupilWraps.forEach(p =>
      p.setAttribute('transform', `translate(${offX.toFixed(2)},${offY.toFixed(2)})`));
  });

  /* ── 4) 点击 → 比心 ─────────────────────────────── */
  stage.addEventListener('click', () => {
    triggerHeart();
  });

  function triggerHeart() {
    inHeart = true;
    pet.classList.add('heart');
    showMsg('比心 ♡');
    // 复位飘心动画（重新挂动画类）
    const hearts = pet.querySelectorAll('.fh');
    hearts.forEach(h => {
      h.style.animation = 'none';
      void h.offsetWidth;
      h.style.animation = '';
    });
    setTimeout(() => {
      inHeart = false;
      pet.classList.remove('heart');
      hideMsg();
    }, 1800);
  }

  /* ── 提示气泡 ───────────────────────────────────── */
  let msgTimer;
  function showMsg(text) {
    if (!msg) return;
    msg.textContent = text;
    msg.classList.add('show');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(hideMsg, 1500);
  }
  function hideMsg() {
    if (!msg) return;
    msg.classList.remove('show');
  }
})();
