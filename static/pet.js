/* Live2D 桌宠：右下角固定，待机/眼随鼠标/点击交互均由库内置 */
(function () {
  function load() {
    if (typeof OML2D === 'undefined') {
      return setTimeout(load, 200);
    }
    OML2D.loadOml2d({
      sayHello: false,
      transitionTime: 800,
      dockedPosition: 'right',
      dockedStyle: { borderRadius: '20px 0 0 20px' },
      statusBar: { disable: true },
      menus: {
        disable: false,
        items: ['Rest', 'SwitchModel', 'About'],
        style: { fontSize: '12px' }
      },
      tips: {
        idleTips: {
          message: [
            '在看什么有趣的内容呀～',
            '陪你一起写代码 ✦',
            '今天也要加油哦！',
            '记得多喝水～',
            '该休息一下了！',
            '咦？这段代码挺有意思的',
          ],
          duration: 5000,
          interval: 20000,
          priority: 2,
          wordTheDay: false,
        },
        welcomeTips: {
          message: { daybreak: '清晨好～', morning: '上午好～',
                     noon: '中午好～', afternoon: '下午好～',
                     night: '晚上好～', lateNight: '夜深啦' },
          duration: 4000, priority: 3,
        },
        copyTips: { message: ['复制了喔～', '记得别忘了引用来源哦'], priority: 5 },
      },
      models: [
        {
          name: 'HK416-1',
          path: 'https://model.oml2d.com/HK416-1-normal/model.json',
          scale: 0.08,
          position: [0, 60],
          stageStyle: { width: 280, height: 400 },
          motionPreloadStrategy: 'IDLE',
        },
        {
          name: 'HK416-2',
          path: 'https://model.oml2d.com/HK416-2-normal/model.json',
          scale: 0.08,
          position: [0, 60],
          stageStyle: { width: 280, height: 400 },
        },
        {
          name: 'Pio',
          path: 'https://model.oml2d.com/Pio/model.json',
          scale: 0.5,
          position: [0, 60],
          stageStyle: { width: 280, height: 400 },
        },
      ],
      mobileDisplay: false,
      initialStatus: 'active',
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
