import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import FakeTimers from '@sinonjs/fake-timers';
import * as THREE from '../dist/vendor/three.module.js';
import { createAssembly, createStudioEnvironment } from '../dist/assembly.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const read = name => fs.readFileSync(path.join(dist, name), 'utf8');
const html = read('index.html');
const applications = [];

/** 실제 배포 문서와 같은 CSS 순서로 각 화면 크기의 동작을 검증한다. */
function setup({ width = 1920, height = 1080, reduced = false, webgl = true } = {}) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://portfolio.example/', virtualConsole: console });
  const { window } = dom;
  const { document } = window;
  window.innerWidth = width; window.innerHeight = height;
  window.localStorage.setItem('juho-card-motion', 'reduced');
  const clock = FakeTimers.withGlobal(window).install({ now: 1000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  window.matchMedia = query => ({ matches: query.includes('reduced-motion') ? reduced : query.includes('pointer: fine') ? width > 800 : false, addEventListener() {} });
  window.ResizeObserver = class { constructor(callback) { this.callback = callback; } observe() { this.callback([]); } disconnect() {} };
  window.IntersectionObserver = class { constructor(callback) { this.callback = callback; } observe() { this.callback([{ isIntersecting: true }]); } disconnect() {} };
  const overflow = new WeakSet();
  const cardHeight = height - (width <= 800 ? 144 : 168);
  // JSDOM has no layout engine. These dimensions are input fixtures, not visual QA.
  Object.defineProperties(window.HTMLElement.prototype, {
    offsetWidth: { configurable: true, get() { return 600; } },
    offsetHeight: { configurable: true, get() { return cardHeight; } },
    clientHeight: { configurable: true, get() {
      return cardHeight - 132;
    } },
    scrollHeight: { configurable: true, get() { return Math.max(this.clientHeight, cardHeight - 132 + (overflow.has(this) ? 300 : 0)); } },
  });
  window.HTMLElement.prototype.getBoundingClientRect = function () { return { x: 0, y: 100, left: 0, top: 100, right: 600, bottom: 500, width: 600, height: 400 }; };
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  const stylesheetPaths = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map(link => new URL(link.href).pathname.replace(/^\//, ''));
  const style = document.createElement('style');
  style.textContent = stylesheetPaths.map(read).join('\n');
  document.head.append(style);
  // JSDOM does not evaluate viewport media queries. Select the real source rules
  // for each fixture to check the cascade, without claiming rendered geometry.
  const viewportCSS = rules => [...rules].map(rule => {
    if (!rule.media) return rule.cssText;
    const matches = [...rule.conditionText.matchAll(/\((min|max)-(width|height):\s*(\d+)px\)/g)];
    assert.ok(matches.length, `Unsupported viewport query: ${rule.conditionText}`);
    return matches.every(([, bound, axis, limit]) => bound === 'min'
      ? ({ width, height })[axis] >= Number(limit)
      : ({ width, height })[axis] <= Number(limit)) ? viewportCSS(rule.cssRules) : '';
  }).join('\n');
  style.textContent = viewportCSS(style.sheet.cssRules);
  window.eval(read('vendor/gsap.min.js'));
  assert.ok(window.gsap, 'The actual packaged GSAP build must load');
  window.eval(read('deck.js'));
  const tick = (ms = 1500) => clock.tick(ms);
  tick();
  function wheel(deltaY = 1, init = {}) {
    const event = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, deltaX: 0, ...init });
    (init.target || document.body).dispatchEvent(event); return event;
  }
  function fire(selector, type, fields = {}) {
    const target = typeof selector === 'string' ? document.querySelector(selector) : selector;
    assert.ok(target, String(selector));
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, fields); target.dispatchEvent(event); return event;
  }
  function click(selector) { document.querySelector(selector).click(); tick(); }
  const renders = [];
  class Renderer {
    constructor() { if (!webgl) throw new Error('No WebGL'); this.domElement = document.createElement('canvas'); this.shadowMap = {}; }
    setPixelRatio() {} setClearColor() {} setSize() {} dispose() {}
    render(scene, camera) {
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const pivot = scene.children.find(child => child.isGroup);
      scene.traverse(object => { if (object.geometry) assert.ok(object.geometry.getAttribute('position').array.every(Number.isFinite)); });
      renders.push({ scene, camera, spin: pivot.rotation.y, rotation: pivot.children[0].rotation.y });
    }
  }
  const api = { window, document, tick, wheel, fire, click, overflow, errors, renders,
    get active() { return document.documentElement.dataset.activeSection; },
    runScene() { window.THREE = { ...THREE, WebGLRenderer: Renderer }; window.createAssembly = createAssembly; window.createStudioEnvironment = createStudioEnvironment; window.eval(read('scene.js').replace(/^import .*?;\r?\n/gm, '')); tick(); },
    destroy() { window.dispatchEvent(new window.Event('pagehide')); window.gsap.globalTimeline.clear(); clock.uninstall(); window.close(); },
  };
  applications.push(api); return api;
}

try {
  const app = setup();
  const q = selector => app.document.querySelector(selector);
  assert.equal(q('.chapter-count').textContent, '01 / 07');
  assert.equal(app.document.querySelectorAll('.section-card').length, 7);
  assert.equal(app.document.querySelectorAll('.story-stop, .chapter-scroll').length, 0);
  assert.equal(app.active, 'home');
  assert.equal(q('#motion-toggle'), null);
  assert.equal(q('.scene-heading'), null, 'Remove duplicated decorative labels above the 3D model');
  assert.equal(app.window.getComputedStyle(q('.identity img')).width, 'min(160px,calc(128 * var(--reference-unit)))', 'The reference proportion must not exceed the previous portrait width cap');
  assert.equal(app.window.getComputedStyle(q('.identity img')).height, 'min(205px,calc(164 * var(--reference-unit)))');
  // 배경은 장식 이미지로만 사용하고 시안의 설명·연락처는 실제 DOM으로 유지한다.
  assert.equal(app.document.querySelectorAll('.site-backgrounds img[alt=""]').length, 3);
  assert.equal(q('.site-backgrounds').getAttribute('aria-hidden'), 'true');
  assert.equal(q('#home [data-scene]'), null, 'The home background replaces the old boxed 3D scene');
  assert.equal(q('.scene-turn').closest('section').id, 'skills', 'Interactive 3D remains in the skills section');
  assert.equal(q('.dialog-close .icon use')?.getAttribute('href'), '#icon-close', 'The dialog close mark uses centered vector geometry');
  assert.equal(app.window.getComputedStyle(q('.background-home')).opacity, '1');
  assert.equal(app.document.querySelectorAll('.section-meta').length, 4);
  assert.equal(app.window.getComputedStyle(q('#about .about-values')).position, 'absolute');
  assert.equal(app.window.getComputedStyle(q('#home')).display, 'flex');
  assert.equal(app.window.getComputedStyle(q('#home')).flexDirection, 'column');
  assert.equal(app.window.getComputedStyle(q('#home .card-content')).minHeight, '0');
  assert.equal(app.document.querySelectorAll('.card-details').length, 0, 'Full-view buttons must not be rendered');

  const wheel = app.wheel(1);
  assert.ok(wheel.defaultPrevented);
  assert.equal(app.active, 'about', 'The first one-unit notch must select the next SECTION immediately');
  assert.equal(app.window.getComputedStyle(q('.background-home')).opacity, '0');
  assert.equal(app.window.getComputedStyle(q('.background-about')).opacity, '1');
  app.tick(120);
  const entering = q('#about');
  const during = Number(app.window.gsap.getProperty(entering, 'yPercent'));
  assert.ok(during > 0 && during < 105, 'The real GSAP engine must be moving the whole incoming card');
  const opacity = Number(app.window.gsap.getProperty(q('#about .about-body'), 'opacity'));
  assert.ok(opacity < 1, 'The content reveal must be sequenced with card movement');
  app.tick(1500);
  assert.equal(Number(app.window.gsap.getProperty(entering, 'yPercent')), 0);
  assert.equal(entering.style.visibility, 'inherit');
  assert.equal(q('#home').style.visibility, 'hidden');
  assert.equal(q('#home').inert, true); assert.equal(entering.inert, false);
  assert.equal(q('#home').hidden, true, 'A completed transition removes the previous surface from rendering');
  assert.equal(app.document.querySelectorAll('.section-card:not([hidden])').length, 1);
  assert.equal(Number(app.window.gsap.getProperty(q('#about .about-body'), 'opacity')), 1);
  assert.equal(q('#about .about-intro').style.clipPath, '', 'The statement must not remain clipped after its reveal');
  for (const value of app.document.querySelectorAll('#about .about-values > li')) {
    assert.equal(Number(app.window.gsap.getProperty(value, 'opacity')), 1, 'All working-style descriptions must become readable');
  }
  assert.equal(app.window.scrollY, 0, 'Deck navigation must not depend on document scroll position');

  for (const delta of [120, 90, 70, 50, 40, 30, 20, 15, 10, 5, 2, 1]) { app.wheel(delta); app.tick(90); }
  app.tick(1000);
  assert.equal(app.active, 'experience', 'One trackpad gesture including its tail advances one card');
  app.wheel(-1); app.tick(); assert.equal(app.active, 'about');
  assert.equal(q('#about .about-intro').style.clipPath, '', 'Returning to About must finish the reveal again');
  assert.equal(app.wheel(1, { ctrlKey: true }).defaultPrevented, false);
  assert.equal(app.wheel(1, { deltaX: 100 }).defaultPrevented, false);

  // A long card must not consume the wheel in an inner scroller.
  const content = q('#about .card-content'); app.overflow.add(content);
  app.wheel(1, { target: content }); assert.equal(app.active, 'experience'); app.tick();
  app.click('#site-nav a[href="#education"]');
  app.click('.training > summary'); assert.ok(q('.content-dialog').open);
  assert.ok(q('.dialog-content .training').open);
  app.fire('.content-dialog','click',{clientX:200,clientY:200});
  assert.ok(q('.content-dialog').open,'Clicking inside the training dialog keeps it open');
  assert.equal(app.wheel(1, { target: q('.dialog-content') }).defaultPrevented, false);
  assert.equal(app.active, 'education'); app.click('.dialog-close'); assert.equal(q('.content-dialog').open, false);

  app.fire('body', 'keydown', { key: 'Home' }); app.tick(); assert.equal(app.active, 'home');
  app.fire('body', 'keydown', { key: 'ArrowDown' }); app.tick(); assert.equal(app.active, 'about');
  app.fire('body', 'keydown', { key: 'ArrowDown', repeat: true }); app.tick(); assert.equal(app.active, 'about');
  app.fire('body', 'keydown', { key: 'End' }); app.tick(); assert.equal(app.active, 'contact');
  assert.equal(app.window.getComputedStyle(q('.background-contact')).opacity, '1');
  assert.equal(q('.next-chapter').disabled, true);
  assert.equal(q('#contact .contact-email').style.clipPath, '', 'The email link must be completely revealed');
  assert.equal(q('#contact .contact-email').getAttribute('href'), 'mailto:wnghqkr30520@naver.com');
  assert.equal(q('#contact .contact-email strong').textContent, 'wnghqkr30520@naver.com', 'Responsive email wrapping must preserve the address');
  assert.equal(q('#contact .contact-phone').getAttribute('href'), 'tel:+821043354586');
  for (const item of app.document.querySelectorAll('#contact .contact-row')) {
    assert.equal(Number(app.window.gsap.getProperty(item,'opacity')), 1, 'Contact metadata must finish its entrance');
  }
  app.click('#contact .site-footer a'); assert.equal(app.active, 'home', 'The closing link returns to the first section');
  app.fire('body', 'touchstart', { touches: [{ clientX: 100, clientY: 500 }] });
  app.fire('body', 'touchmove', { touches: [{ clientX: 105, clientY: 460 }] });
  assert.equal(app.active, 'about'); app.tick();
  app.fire('body', 'touchmove', { touches: [{ clientX: 105, clientY: 100 }] }); app.tick();
  assert.equal(app.active, 'about'); app.fire('body', 'touchend');

  app.click('.brand');
  const modified = new app.window.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true,button:0});
  q('#site-nav a[href="#projects"]').dispatchEvent(modified);
  assert.equal(modified.defaultPrevented,false,'Modified links preserve native new-tab behavior');
  assert.equal(app.active,'home');
  app.click('[data-story-go="2"]');
  assert.equal(app.active, 'home', 'Hero tabs never consume a section-navigation step');
  assert.equal(q('[data-story-panel="2"]').getAttribute('aria-hidden'), 'false');
  assert.equal(app.document.querySelectorAll('[data-story-panel][aria-hidden="false"]').length, 1);
  app.wheel(1); assert.equal(app.active, 'about'); app.tick();
  assert.equal(q('#motion-toggle'), null, 'No motion control is present');
  app.wheel(1); app.tick(120); assert.equal(app.active, 'experience');
  assert.ok(Number(app.window.gsap.getProperty(q('#experience'), 'yPercent')) > 0, 'Card animation stays enabled');
  app.tick();
  const alwaysOn = setup({ reduced: true });
  alwaysOn.wheel(1); alwaysOn.tick(120);
  assert.ok(Number(alwaysOn.window.gsap.getProperty(alwaysOn.document.querySelector('#about'), 'yPercent')) > 0, 'Requested always-on motion ignores old preferences and OS reduction');
  alwaysOn.tick(); alwaysOn.click('.brand'); alwaysOn.tick(7200);
  assert.equal(alwaysOn.document.querySelector('[data-story-panel="1"]').getAttribute('aria-hidden'), 'false', 'Hero continues automatic scene changes');

  const gauge = setup();
  const gaugeButton = index => gauge.document.querySelector(`[data-story-go="${index}"]`);
  const fill = index => parseFloat(gaugeButton(index).style.getPropertyValue('--story-progress')) || 0;
  const initialFill = fill(0);
  assert.ok(initialFill > 0 && initialFill < 1);
  gauge.window.dispatchEvent(new gauge.window.Event('pageshow')); gauge.tick(100);
  assert.ok(fill(0) > initialFill, 'Repeated page-show events must not restart the gauge');
  const beforeSameChoice = fill(0);
  gaugeButton(0).click(); gauge.tick(100);
  assert.ok(fill(0) > beforeSameChoice, 'Selecting the current scene must not reset its gauge');
  Object.defineProperty(gauge.document, 'hidden', { configurable: true, value: true });
  gauge.document.dispatchEvent(new gauge.window.Event('visibilitychange'));
  const pausedFill = fill(0); gauge.tick(2000);
  assert.equal(fill(0), pausedFill, 'A hidden page freezes the gauge at its current value');
  Object.defineProperty(gauge.document, 'hidden', { configurable: true, value: false });
  gauge.document.dispatchEvent(new gauge.window.Event('visibilitychange')); gauge.tick(100);
  assert.ok(fill(0) > pausedFill && fill(0) < pausedFill + .04, 'Returning resumes the remaining duration');
  gaugeButton(1).click(); gauge.tick(100); gaugeButton(2).click(); gauge.tick(1000);
  assert.equal(gaugeButton(2).getAttribute('aria-pressed'), 'true');
  assert.equal(gauge.document.querySelectorAll('[data-story-panel][aria-hidden="false"]').length, 1);
  const remaining = (1 - fill(2)) * 7000;
  gauge.tick(Math.max(0, Math.floor(remaining) - 40));
  assert.equal(gaugeButton(2).getAttribute('aria-pressed'), 'true', 'Keep the scene until its gauge finishes');
  gauge.tick(100);
  assert.equal(gaugeButton(0).getAttribute('aria-pressed'), 'true', 'A completed gauge changes the scene on the same clock');

  const mobile = setup({ width: 390, height: 650 });
  mobile.fire('body','touchstart',{touches:[{clientX:100,clientY:400}]});
  const pinch = mobile.fire('body','touchmove',{touches:[{clientX:90,clientY:300},{clientX:200,clientY:300}]});
  assert.equal(pinch.defaultPrevented,false,'Pinch-to-zoom does not trigger section paging');
  assert.equal(mobile.active,'home');
  mobile.wheel(1); assert.equal(mobile.active, 'about'); mobile.tick();
  mobile.click('#site-nav a[href="#experience"]');
  mobile.click('.job-tabs button:nth-child(2)');
  assert.ok(mobile.document.querySelector('#job-1').classList.contains('job-active'));
  mobile.document.querySelector('.job-tabs button:nth-child(2)').click();
  assert.equal(Number(mobile.window.gsap.getProperty(mobile.document.querySelector('#job-1'), 'opacity')), 1, 'Selecting the current employer again must not hide or restart its content');
  mobile.document.querySelector('.job-tabs button:nth-child(1)').click(); mobile.tick(80);
  mobile.document.querySelector('.job-tabs button:nth-child(3)').click(); mobile.tick();
  assert.equal(mobile.document.querySelectorAll('#experience .job-active').length, 1);
  assert.equal(mobile.document.querySelector('#job-2').classList.contains('job-active'), true);
  assert.equal(mobile.document.querySelector('.job-tabs button:nth-child(3)').getAttribute('aria-pressed'), 'true');
  assert.equal(Number(mobile.window.gsap.getProperty(mobile.document.querySelector('#job-2'), 'opacity')), 1, 'Rapid company selection settles on the final readable employer');
  mobile.wheel(1); assert.equal(mobile.active, 'skills'); mobile.tick();
  assert.ok(!mobile.document.documentElement.classList.contains('motion-reduced'), 'Short viewports do not disable animation');

  // 교육 이수 패널의 수직 이동은 진입 중에만 생기는 스크롤바의 원인이므로 사용하지 않는다.
  const educationEntrance = setup({ width: 1366, height: 768 });
  educationEntrance.document.querySelector('#site-nav a[href="#education"]').click();
  educationEntrance.tick(400);
  assert.equal(Number(educationEntrance.window.gsap.getProperty(educationEntrance.document.querySelector('#education .training'), 'y')), 0);

  // 짧은 화면에서 학력·자격을 끝까지 읽기 전에는 다음 카드로 넘기지 않는다.
  const compactEducation = setup({ width: 320, height: 667 });
  compactEducation.click('#site-nav a[href="#education"]');
  const educationContentElement = compactEducation.document.querySelector('#education .card-content');
  compactEducation.overflow.add(educationContentElement);
  compactEducation.wheel(120, { target: educationContentElement });
  assert.equal(compactEducation.active, 'education');
  assert.equal(educationContentElement.scrollTop, 120);
  compactEducation.tick(220);
  compactEducation.wheel(300, { target: educationContentElement });
  assert.equal(educationContentElement.scrollTop, 300);
  compactEducation.tick(220);
  compactEducation.wheel(120, { target: educationContentElement });
  assert.equal(compactEducation.active, 'contact', 'The next wheel gesture advances after the education content ends');
  compactEducation.tick();
  compactEducation.click('#site-nav a[href="#education"]');
  assert.equal(educationContentElement.scrollTop, 0, 'Re-entering education starts at the beginning');
  compactEducation.fire('body', 'keydown', { key: 'PageDown' });
  assert.equal(compactEducation.active, 'education');
  assert.ok(educationContentElement.scrollTop > 0, 'Keyboard paging reads the clipped remainder');
  educationContentElement.scrollTop = 100;
  compactEducation.fire('body', 'touchstart', { touches: [{ clientX: 100, clientY: 350 }] });
  const previousScrollTop = educationContentElement.scrollTop;
  compactEducation.fire('body', 'touchmove', { touches: [{ clientX: 100, clientY: 320 }] });
  assert.equal(educationContentElement.scrollTop, previousScrollTop + 30, 'One touch step scrolls the record only once');
  compactEducation.fire('body', 'touchend');

  for (const [width, height] of [[1920,1080],[1920,947],[1672,941],[1366,768],[1366,650],[1200,900],[1024,768],[851,900],[850,900],[768,1024],[390,844],[320,667]]) {
    const layout = setup({ width, height });
    const select = selector => layout.document.querySelector(selector);
    const computed = selector => layout.window.getComputedStyle(select(selector));
    const label = `${width}×${height}`;
    for (const flow of layout.document.querySelectorAll('.section-card .card-flow')) {
      const css = layout.window.getComputedStyle(flow);
      assert.equal(css.width, '100%', `${label}: every section uses the full shared content width`);
      assert.equal(css.maxWidth, 'none', `${label}: no section-specific maximum may shift the gutters`);
      assert.equal(css.marginLeft, '0px', `${label}: every content column starts on the same edge`);
      assert.equal(css.marginRight, '0px', `${label}: every content column ends on the same edge`);
    }
    assert.equal(computed('#experience .card-flow').display, 'flex', `${label}: career title precedes the full-width list`);
    const displayedJobs = [...layout.document.querySelectorAll('.experience-item')]
      .filter(job => layout.window.getComputedStyle(job).display !== 'none');
    assert.equal(displayedJobs.length, width > 850 ? 3 : 1, `${label}: desktop and mobile employer modes stay separate`);
    assert.equal(computed('.job-tabs').display, width > 850 ? 'none' : 'grid');
    assert.equal(computed('.contact-email strong').fontSize, computed('.contact-phone strong').fontSize, `${label}: email and phone have equal emphasis`);
    assert.equal(computed('.contact-email').backgroundColor, computed('.contact-phone').backgroundColor);
    assert.equal(select('.contact-email-arrow'), null, 'No oversized email-only action remains');
    assert.equal(computed('#about .about-values').position, width > 1100 ? 'absolute' : 'static', `${label}: artwork alignment becomes normal reading order on narrow screens`);
    if (width > 1100) {
      assert.equal(computed('#about .about-signature').position, 'relative', `${label}: the underline follows the introduction text`);
      assert.equal(computed('#about .about-signature').marginTop, 'calc(12 * var(--reference-unit))', `${label}: the paragraph-to-rule gap stays compact`);
      assert.equal(computed('#about .about-signature').paddingTop, 'calc(12 * var(--reference-unit))', `${label}: the rule-to-name gap stays compact`);
    }
    assert.equal(computed('#contact .contact-composition').display, width > 850 ? 'grid' : 'flex', `${label}: contact information stacks on mobile`);
    if (width > 1100) assert.equal(computed('#contact .contact-composition').gridTemplateColumns, 'minmax(0,1fr) minmax(0,max(340px,24vw))', `${label}: contact details stay in a narrow right-hand block`);
    else if (width > 850) assert.equal(computed('#contact .contact-composition').gridTemplateColumns, 'minmax(0,1fr) minmax(0,max(310px,32vw))', `${label}: contact details remain narrow on tablets`);
    assert.equal(computed('.story-layout').gridTemplateColumns, width <= 850 ? 'minmax(0,1fr)' : width <= 1100 ? 'minmax(0,.58fr) minmax(0,.42fr)' : 'minmax(0,.44fr) minmax(0,.56fr)');
    // 렌더링 픽셀 대신 배경과 설명을 같은 원본 좌표에 연결하는 CSS 계약을 검증한다.
    assert.equal(computed('.background-home').objectFit, 'cover');
    if (width > 1100) {
      assert.equal(computed('#home .story-copy').left, 'calc(82 * var(--reference-unit))');
      assert.equal(computed('#home .story-copy').top, 'calc(344 * var(--reference-unit))');
      assert.equal(computed('#home .story-bottom').top, 'calc(739 * var(--reference-unit))');
      assert.equal(computed('#about .about-values').width, 'var(--art-width)');
      assert.equal(computed('#about .about-values').top, 'calc((var(--reference-height) - var(--art-height)) / 2)');
      for (const [index, x, y] of [[1,209,618],[2,718,485],[3,1285,418]]) {
        assert.equal(computed(`#about .about-values>li:nth-child(${index})`).left, `calc(${x} * var(--art-unit))`);
        assert.equal(computed(`#about .about-values>li:nth-child(${index})`).top, `calc(${y} * var(--art-unit))`);
      }
    }
    assert.equal(computed('#education .card-content').overflowY, 'auto', `${label}: small viewports keep the full record readable`);
    assert.equal(computed('#education .card-flow').height, 'auto');
    assert.equal(computed('#education .education-grid').gridTemplateRows, 'auto repeat(2,minmax(max-content,1fr))', `${label}: both education columns share record rows without clipping`);
    assert.equal(computed('#education .education-grid').rowGap, '0', `${label}: aligned rows must not gain extra vertical gutters`);
    assert.equal(computed('#education .education-column').display, 'contents', `${label}: both education columns participate in the same grid`);
    assert.equal(computed('.dialog-close').minHeight, '44px', `${label}: the smaller close visual retains a touch-sized hit area`);
    assert.equal(computed('.dialog-close').paddingTop, '0px', `${label}: the close control has no extra vertical padding`);
    if (width > 850) {
      assert.equal(computed('#skills .card-flow').height, '100%');
      assert.equal(computed('#skills .skills-layout').minHeight, '0');
      assert.equal(computed('#skills .skill-scene').flexGrow, '1');
      assert.equal(computed('#skills .skill-scene').height, 'auto');
      if (height <= 800) assert.equal(computed('#skills .skill-row').getPropertyValue('padding-block'), '8px');
    }
  }

  // 역방향·강제 전환·처음/끝 반복에서도 활성 카드 외의 표면은 표시하지 않는다.
  const settled = setup();
  for (const destination of ['#contact','#home','#education','#skills','#about','#home']) {
    settled.click(`a[href="${destination}"]`);
    for (const card of settled.document.querySelectorAll('.section-card')) {
      const isActive = card.id === settled.active;
      assert.equal(card.hidden, !isActive);
      assert.equal(settled.window.getComputedStyle(card).display, isActive ? 'flex' : 'none');
      if (!isActive) assert.equal(Number(settled.window.gsap.getProperty(card, 'opacity')), 0);
    }
  }
  settled.document.querySelector('a[href="#education"]').click(); settled.tick(100);
  settled.document.querySelector('a[href="#contact"]').click(); settled.tick();
  assert.equal(settled.document.querySelectorAll('.section-card:not([hidden])').length, 1);
  assert.equal(settled.active, 'contact');

  const graphics = setup(); graphics.runScene();
  assert.equal(graphics.renders.length, 0, 'The image-led opening does not render hidden 3D');
  graphics.click('#site-nav a[href="#skills"]');
  assert.ok(graphics.renders.length > 1);
  graphics.click('.scene-turn');
  assert.ok(graphics.renders.some(frame => frame.spin > .1 && frame.spin < 6));
  const renderedScene = graphics.renders.at(-1).scene;
  assert.ok(renderedScene.getObjectByName('CCTV lens'));
  assert.ok(renderedScene.getObjectByName('Network switch'));
  assert.ok(renderedScene.getObjectByName('AI core'));
  assert.ok(renderedScene.environment.isDataTexture, 'Metal and lens use a packaged studio environment');
  graphics.wheel(1); graphics.tick(100);
  const paused = graphics.renders.length; graphics.tick(1000);
  assert.equal(graphics.renders.length, paused, 'Invisible cards must stop their Three.js renderer');
  graphics.click('#site-nav a[href="#skills"]');
  assert.equal(graphics.document.querySelector('[data-scene="skills"]').dataset.rendered, 'true');
  const fallback = setup({ webgl: false }); fallback.runScene();
  assert.equal(fallback.document.querySelectorAll('[data-rendered="false"]').length, 1);

  assert.equal(fs.readFileSync(path.join(dist,'fonts/PretendardVariable.woff2')).subarray(0,4).toString(),'wOF2');
  assert.ok(fs.existsSync(path.join(dist,'fonts/OFL.txt')));
  const ids = [...app.document.querySelectorAll('[id]')].map(element => element.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const element of app.document.querySelectorAll('script[src], link[rel="stylesheet"], img[src]')) {
    const url = element.getAttribute('src') || element.getAttribute('href');
    if (url.startsWith('./')) assert.ok(fs.existsSync(path.join(dist, url.split('?')[0])), url);
  }
  // CSS 이동 뒤에도 글꼴·이미지 URL이 해당 CSS 파일을 기준으로 실제 배포 자산을 가리켜야 한다.
  for (const link of app.document.querySelectorAll('link[rel="stylesheet"]')) {
    const stylesheetUrl = new URL(link.href);
    const stylesheetPath = decodeURIComponent(stylesheetUrl.pathname).slice(1);
    const cssText = read(stylesheetPath).replace(/\/\*[\s\S]*?\*\//g, '');
    const assetReferences = cssText.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi);
    for (const [, doubleQuoted, singleQuoted, unquoted] of assetReferences) {
      const assetReference = doubleQuoted ?? singleQuoted ?? unquoted;
      if (assetReference.startsWith('#')) continue;
      const assetUrl = new URL(assetReference, stylesheetUrl);
      if (assetUrl.origin !== stylesheetUrl.origin) continue;
      const assetPath = path.join(dist, decodeURIComponent(assetUrl.pathname).slice(1));
      assert.ok(fs.existsSync(assetPath), `${stylesheetPath}: missing CSS asset ${assetReference}`);
    }
  }
  for (const value of ['PostgreSQL', 'Supabase', 'CCTV·영상보안 시스템', '010-4335-4586', 'wnghqkr30520@naver.com']) assert.ok(html.includes(value));
  applications.forEach(application => assert.equal(application.errors.length, 0, application.errors.map(error => error.message).join('\n')));
  console.log('PASS: reference-coordinate CSS contracts, fullscreen aspect-preserving backgrounds, bounded portrait sizing, constrained skills/education layouts, equal education rows, hidden inactive cards including interrupted transitions, responsive reading order, retained skills 3D, no full-view buttons, packaged GSAP runtime, first-notch routing, whole-card tween, content reveal, gesture lock, reverse, keyboard, swipe, hero tabs, mobile routing, Three.js geometry/materials/mixer/pause/fallback, modified links, training dialog, pinch zoom, packaged font, assets and retained content.');
  console.log('UNVERIFIED: browser layout at 1920×1080 and actual GPU pixels. JSDOM dimensions are fixtures; this test is not visual QA.');
} finally { applications.forEach(application => application.destroy()); }
