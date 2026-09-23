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
    offsetHeight: { configurable: true, get() { return this.classList.contains('card-details') ? 44 : cardHeight; } },
    clientHeight: { configurable: true, get() {
      const details = this.classList.contains('card-content') && this.parentElement.querySelector('.card-details');
      return cardHeight - 132 - (details && !details.hidden ? 56 : 0);
    } },
    scrollHeight: { configurable: true, get() { return Math.max(this.clientHeight, cardHeight - 132 + (overflow.has(this) ? 300 : 0)); } },
  });
  window.HTMLElement.prototype.getBoundingClientRect = function () { return { x: 0, y: 100, left: 0, top: 100, right: 600, bottom: 500, width: 600, height: 400 }; };
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  const style = document.createElement('style'); style.textContent = read('styles.css') + '\n' + read('deck.css'); document.head.append(style);
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
  assert.equal(app.window.getComputedStyle(q('.identity img')).width, '208px', 'The 1920×1080 portrait rule must be selected');
  assert.equal(app.window.getComputedStyle(q('.identity img')).height, '267px');
  // The reader occupies a separate flex row, never an absolute overlay. JSDOM
  // can verify this layout contract, but cannot prove the rendered geometry.
  assert.equal(app.window.getComputedStyle(q('#home')).display, 'flex');
  assert.equal(app.window.getComputedStyle(q('#home')).flexDirection, 'column');
  assert.equal(app.window.getComputedStyle(q('#home .card-content')).minHeight, '0');
  for (const card of app.document.querySelectorAll('.section-card')) {
    const details = card.querySelector('.card-details');
    assert.equal(details.previousElementSibling, card.querySelector('.card-content'), 'Read-all must follow the body in its own row');
    assert.equal(app.window.getComputedStyle(details).position, 'static', 'Reader buttons must not overlay any card');
    assert.equal(app.window.getComputedStyle(details).flexShrink, '0');
  }
  assert.equal(q('#home .card-details').hidden, true);

  const wheel = app.wheel(1);
  assert.ok(wheel.defaultPrevented);
  assert.equal(app.active, 'about', 'The first one-unit notch must select the next SECTION immediately');
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
  app.window.dispatchEvent(new app.window.Event('resize')); app.tick();
  assert.equal(q('#about .card-details').hidden, false);
  app.window.dispatchEvent(new app.window.Event('resize')); app.tick();
  assert.equal(q('#about .card-details').hidden, false, 'Reserving a reader row must not toggle the button off');
  app.overflow.delete(content);
  app.window.dispatchEvent(new app.window.Event('resize')); app.tick();
  assert.equal(q('#about .card-details').hidden, true, 'An expanded viewport must release the reserved reader row');
  app.overflow.add(content);
  app.window.dispatchEvent(new app.window.Event('resize')); app.tick();
  app.wheel(1, { target: content }); assert.equal(app.active, 'experience'); app.tick();
  app.click('#site-nav a[href="#education"]');
  app.click('.training > summary'); assert.ok(q('.content-dialog').open);
  assert.ok(q('.dialog-content .training').open);
  app.fire('.content-dialog','click',{clientX:200,clientY:200});
  assert.ok(q('.content-dialog').open,'Clicking inside the reader keeps it open');
  assert.equal(app.wheel(1, { target: q('.dialog-content') }).defaultPrevented, false);
  assert.equal(app.active, 'education'); app.click('.dialog-close'); assert.equal(q('.content-dialog').open, false);

  app.fire('body', 'keydown', { key: 'Home' }); app.tick(); assert.equal(app.active, 'home');
  app.fire('body', 'keydown', { key: 'ArrowDown' }); app.tick(); assert.equal(app.active, 'about');
  app.fire('body', 'keydown', { key: 'ArrowDown', repeat: true }); app.tick(); assert.equal(app.active, 'about');
  app.fire('body', 'keydown', { key: 'End' }); app.tick(); assert.equal(app.active, 'contact');
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
  const mobileContent = mobile.document.querySelector('#experience .card-content');
  mobile.overflow.add(mobileContent); mobile.window.dispatchEvent(new mobile.window.Event('resize')); mobile.tick();
  mobile.click('#experience .card-details');
  assert.equal(mobile.document.querySelectorAll('.dialog-content .experience-item.job-active').length, 3, 'The mobile reader includes every employer');
  mobile.fire('.content-dialog','click',{clientX:0,clientY:0});
  assert.equal(mobile.document.querySelector('.content-dialog').open,false,'Backdrop click closes the full reader');
  mobile.wheel(1); assert.equal(mobile.active, 'skills'); mobile.tick();
  assert.ok(!mobile.document.documentElement.classList.contains('motion-reduced'), 'Short viewports do not disable animation');

  for (const [width, height] of [[1920,1080],[1366,768],[1200,900],[1024,768],[851,900],[850,900],[768,1024],[390,844],[320,667]]) {
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
  }

  const graphics = setup(); graphics.runScene();
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
  assert.equal(fallback.document.querySelectorAll('[data-rendered="false"]').length, 2);

  assert.equal(fs.readFileSync(path.join(dist,'fonts/PretendardVariable.woff2')).subarray(0,4).toString(),'wOF2');
  assert.ok(fs.existsSync(path.join(dist,'fonts/OFL.txt')));
  const ids = [...app.document.querySelectorAll('[id]')].map(element => element.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const element of app.document.querySelectorAll('script[src], link[rel="stylesheet"], img[src]')) {
    const url = element.getAttribute('src') || element.getAttribute('href');
    if (url.startsWith('./')) assert.ok(fs.existsSync(path.join(dist, url.split('?')[0])), url);
  }
  for (const value of ['PostgreSQL', 'Supabase', 'CCTV·영상보안 시스템', '010-4335-4586', 'wnghqkr30520@naver.com']) assert.ok(html.includes(value));
  applications.forEach(application => assert.equal(application.errors.length, 0, application.errors.map(error => error.message).join('\n')));
  console.log('PASS: reader buttons in separate layout rows, reader show/hide after resize, actual packaged GSAP runtime, first-notch next-section routing, whole-card tween, staggered content reveal, gesture lock, reverse, keyboard, swipe, long-card reader, hero tabs, always-on motion including old/OS preferences, mobile routing, Three.js geometry/materials/mixer/pause/fallback, modified links, reader backdrop, pinch zoom, packaged font, assets and retained content.');
  console.log('UNVERIFIED: browser layout at 1920×1080 and actual GPU pixels. JSDOM dimensions are fixtures; this test is not visual QA.');
} finally { applications.forEach(application => application.destroy()); }
