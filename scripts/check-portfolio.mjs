// 별도 포트폴리오의 연출 순서, 투영 범위, 실제 링크와 수명 관리를 검증한다. GPU 픽셀 검사는 아니다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import FakeTimers from '@sinonjs/fake-timers';
import * as THREE from '../dist/vendor/three.module.js';
import { getPortfolioPose, INTRO_DURATION_SECONDS } from '../dist/portfolio/animation.js';
import { createPaperPresentation, getPaperDestinations, getPaperFlight } from '../dist/portfolio/paper-presentation.js';
import { createPortfolioModel, framePortfolioCamera } from '../dist/portfolio/scene-model.js';
import { createPaperLinks, resolveProjectAction } from '../dist/portfolio/paper-links.js';
import { portfolioProjects } from '../dist/portfolio/projects.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const initial = getPortfolioPose(0), running = getPortfolioPose(2.3), ready = getPortfolioPose(INTRO_DURATION_SECONDS);
assert.equal(initial.characterYaw, 0);
assert.equal(initial.cameraReveal, 0);
assert.ok(initial.characterZ > 3, 'The character starts close to the viewer');
assert.equal(getPortfolioPose(1.4).characterYaw, Math.PI, 'The turn finishes before running away');
assert.equal(running.characterYaw, Math.PI);
assert.ok(running.characterZ < initial.characterZ - 3, 'The character runs away facing the back');
assert.equal(getPortfolioPose(4.9).folderVisible, false);
assert.ok(getPortfolioPose(5.1).folderY > getPortfolioPose(5.45).folderY, 'The folder falls from above');
assert.ok(getPortfolioPose(6.2).folderTilt > 1 && getPortfolioPose(6.2).hipHeight < 0.8);
assert.ok(getPortfolioPose(8.15).folderY > 0.5, 'The character lifts the folder before carrying it');
assert.ok(getPortfolioPose(9.2).folderX > getPortfolioPose(6.2).folderX + 1);
assert.ok(getPortfolioPose(4.2).eyeYaw > 0 && getPortfolioPose(4.2).headYaw < 0, 'The eyes lead the turn, not the whole body at once');
assert.equal(getPortfolioPose(3.9).headYaw, getPortfolioPose(4.0).headYaw, 'The glance holds instead of oscillating');
assert.ok(getPortfolioPose(4.55).headYaw > 0 && getPortfolioPose(4.55).torsoYaw < getPortfolioPose(4.55).headYaw);
assert.equal(getPortfolioPose(20).headYaw, getPortfolioPose(40).headYaw, 'Idle does not repeat a pendulum head motion');
assert.equal(ready.folderTilt, 0); assert.equal(ready.folderY, 0);
assert.equal(ready.paperReveal, 1); assert.equal(ready.phase, 'ready');
assert.equal(getPortfolioPose(Number.NaN).characterX, initial.characterX);

const model = createPortfolioModel();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
const vertex = new THREE.Vector3();
const viewports = [[1920,1080],[1366,768],[768,1024],[390,844],[320,667]];
let triangles = 0, meshes = 0, maximumEdge = 0, maximumFrame;
model.root.traverse(object => {
  if (!object.isMesh) return;
  meshes += 1; triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
  for (const name of ['position', 'normal']) assert.ok(object.geometry.attributes[name].array.every(Number.isFinite));
});
assert.ok(triangles < 20000 && meshes < 70, 'Keep geometry and draw calls within a small budget');
assert.equal(model.papers.length, 4);
for (const [width, height] of viewports) {
  model.update(initial, 0); framePortfolioCamera(camera, width, height, initial);
  const headBounds = new THREE.Box3().setFromObject(model.head);
  const top = new THREE.Vector3(0, headBounds.max.y, headBounds.max.z).project(camera);
  const bottom = new THREE.Vector3(0, headBounds.min.y, headBounds.max.z).project(camera);
  assert.ok((top.y - bottom.y) / 2 > 0.4, 'The opening face is a close-up, not a distant full-body shot');
}
// 근접 장면의 몸통 잘림과 화면 위에서 내려오는 폴더는 의도적이므로 정착한 시점부터 검사한다.
for (const time of [3, 5.78, 6.2, 6.7, 7.5, 8.15, 9.2, 10.6, 11.85, 20]) {
  const pose = getPortfolioPose(time);
  model.update(pose, time);
  for (const [width, height] of viewports) {
    framePortfolioCamera(camera, width, height, pose);
    model.root.traverseVisible(object => {
      if (!object.isMesh) return;
      const positions = object.geometry.attributes.position;
      for (let index = 0; index < positions.count; index += 1) {
        vertex.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).project(camera);
        assert.ok(Number.isFinite(vertex.x) && vertex.z > -1 && vertex.z < 1);
        const edge = Math.max(Math.abs(vertex.x), Math.abs(vertex.y));
        if (edge > maximumEdge) { maximumEdge = edge; maximumFrame = { time, width, height, x: vertex.x, y: vertex.y }; }
      }
    });
  }
}
assert.ok(maximumEdge < 0.98, `Keep settled character and folder in view: ${JSON.stringify(maximumFrame)}`);
model.update(ready, INTRO_DURATION_SECONDS);
assert.ok(model.papers.every(paper => !paper.visible), 'Small papers disappear once the foreground covers the scene');
assert.ok(model.papers[0].position.x < model.papers[1].position.x && model.papers[2].position.x < model.papers[3].position.x);
// 들어 올리고 옮기고 내려놓는 전 구간에서 손이 폴더에서 떨어져 보이지 않게 한다.
for (let time = 6.2; time <= 9.9; time += 0.05) {
  model.update(getPortfolioPose(time), time);
  model.hands.forEach((hand, index) => {
    assert.ok(hand.getWorldPosition(vertex).distanceTo(model.gripTargets[index]) < 0.06, 'Hands stay on the folder while lifting and placing');
  });
}
model.dispose();

for (const [width, height] of [...viewports, [851,393]]) {
  const destinations = getPaperDestinations(width, height);
  const area = destinations.reduce((total, paper) => total + paper.width * paper.height, 0);
  assert.ok(area / (width * height) > 0.6, 'Four large choices occupy most of the screen');
  destinations.forEach((destination, index) => {
    assert.ok(destination.width > 100 && destination.height > 100);
    assert.ok(destination.x >= 0 && destination.y >= 70 && destination.x + destination.width <= width && destination.y + destination.height <= height);
    const origin = { x: width * 0.65, y: height * 0.6, width: 40, height: 65, rotate: 12 };
    const result = getPaperFlight(1, index, origin, destination);
    for (const key of ['x','y','width','height']) assert.ok(Math.abs(result[key] - destination[key]) < 0.001);
    assert.equal(result.rotate, 0); assert.equal(result.numberOpacity, 1);
    assert.ok(getPaperFlight(0.6, index, origin, destination).width > origin.width);
  });
  assert.equal(getPaperFlight(0.1, 3, destinations[3], destinations[3]).opacity, 0, 'Paper entrances are staggered');
}

const baseUrl = 'https://portfolio.example/portfolio/';
assert.equal(resolveProjectAction({ href: 'javascript:alert(1)' }, baseUrl), null);
assert.equal(resolveProjectAction({ kind: 'download', href: 'https://files.example/file.zip' }, baseUrl), null);
assert.equal(resolveProjectAction({ kind: 'download', href: '../files/work.zip' }, baseUrl).download, true);
assert.equal(resolveProjectAction({ href: 'https://example.com/work' }, baseUrl).external, true);

const html = fs.readFileSync(path.join(dist, 'portfolio/index.html'), 'utf8');
const source = fs.readFileSync(path.join(dist, 'portfolio/portfolio.js'), 'utf8').replace(/^import .*?;\r?\n/gm, '');

/** GPU 대신 렌더러 경계를 대체해 실제 컨트롤러의 DOM 이벤트와 정리 동작을 실행한다. */
function setup({ rendererFailure = false } = {}) {
  const errors = [], warnings = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error)); virtualConsole.on('warn', message => warnings.push(message));
  const dom = new JSDOM(html, { url: baseUrl, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom, { document } = window;
  const clock = FakeTimers.withGlobal(window).install({ loopLimit: 10000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  const state = { renderCount: 0, disposed: false, model: null, width: 1200, height: 700 };
  window.matchMedia = () => ({ matches: false });
  window.ResizeObserver = class { constructor(callback) { this.callback = callback; state.resize = callback; } observe() { this.callback(); } disconnect() {} };
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: state.width, height: state.height, right: state.width, bottom: state.height });
  class Renderer {
    constructor() {
      if (rendererFailure) throw new Error('Test graphics unavailable');
      this.domElement = document.createElement('canvas'); this.shadowMap = {};
    }
    setPixelRatio() {} setClearColor() {} setSize() {}
    render() { state.renderCount += 1; }
    dispose() { state.disposed = true; }
  }
  Object.assign(window, {
    THREE: { ...THREE, WebGLRenderer: Renderer }, INTRO_DURATION_SECONDS, getPortfolioPose,
    createPortfolioModel: () => { state.model = createPortfolioModel(); return state.model; },
    framePortfolioCamera, createPaperLinks, createPaperPresentation, portfolioProjects,
  });
  window.eval(source);
  return { window, document, clock, state, errors, warnings, close() { clock.uninstall(); window.close(); } };
}

const app = setup();
try {
  const { window, document, clock, state } = app;
  const papers = document.querySelector('.paper-links'), controls = [...papers.children];
  assert.equal(controls.length, 4);
  assert.equal(papers.querySelectorAll('a').length, 0, 'Pending projects have no fake destinations');
  assert.deepEqual(controls.map(element => element.textContent), ['1','2','3','4']);
  assert.ok(controls.every(element => element.getAttribute('aria-disabled') === 'true'));
  assert.equal(document.querySelectorAll('.workspace-heading,.folder-panel,.room-footer').length, 0, 'The stage has no visible headings or list panels');
  assert.equal(papers.hidden, true);
  document.querySelector('.skip-button').click();
  assert.equal(papers.hidden, false);
  assert.equal(document.activeElement, controls[0], 'Skip moves keyboard focus to the first paper');
  document.querySelector('.replay-button').click();
  assert.equal(papers.hidden, true);
  assert.equal(document.querySelector('.portfolio-workspace').dataset.sceneState, 'closeup');
  clock.tick(12400);
  assert.equal(papers.hidden, false, 'Papers are visible while flying forward');
  assert.equal(papers.inert, true, 'Moving choices cannot be activated before settling');
  clock.tick(1600);
  assert.equal(document.querySelector('.portfolio-workspace').dataset.sceneState, 'ready');
  assert.equal(papers.hidden, false);
  document.querySelector('.replay-button').focus();
  controls[2].dispatchEvent(new window.Event('pointerenter')); clock.tick(500);
  assert.ok(controls[2].classList.contains('is-active'));
  controls[2].dispatchEvent(new window.Event('pointerleave')); clock.tick(500);
  controls[1].focus(); clock.tick(500);
  assert.ok(controls[1].classList.contains('is-active'), 'Keyboard focus highlights the corresponding choice');
  controls[1].click(); assert.equal(window.location.href, baseUrl);
  document.querySelector('.replay-button').focus(); clock.tick(500);
  for (const [width, height] of viewports) {
    state.width = width; state.height = height; state.resize();
    for (const element of controls) {
      const x = Number.parseFloat(element.style.left), y = Number.parseFloat(element.style.top);
      const w = Number.parseFloat(element.style.width), h = Number.parseFloat(element.style.height);
      assert.ok(w >= 44 && h >= 44, 'Every paper remains a touch-sized target');
      assert.ok(x >= 0 && y >= 0 && x + w <= width && y + h <= height, 'Paper controls stay in the viewport');
    }
    const rectangles = controls.map(element => ({ x: parseFloat(element.style.left), y: parseFloat(element.style.top), width: parseFloat(element.style.width), height: parseFloat(element.style.height) }));
    for (let first = 0; first < 4; first += 1) for (let second = first + 1; second < 4; second += 1) {
      const a = rectangles[first], b = rectangles[second];
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'Final choices do not overlap');
    }
  }
  assert.equal(document.querySelector('.presentation-backdrop').style.opacity, '1');
  assert.equal(document.querySelector('.portfolio-stage').style.opacity, '0', 'Foreground completely hides the previous scene');
  assert.equal(papers.inert, false);
  const settledRenders = state.renderCount; clock.tick(500);
  assert.equal(state.renderCount, settledRenders, 'The covered 3D scene stops rendering');

  const separateContainer = document.createElement('div'); document.body.append(separateContainer);
  let activeIndex = -1;
  const links = createPaperLinks({
    containerElement: separateContainer, baseUrl, onActiveChange: index => { activeIndex = index; },
    projects: [
      { title: '<작업>', kind: 'link', href: 'https://example.com/work' },
      { title: '프로그램', kind: 'download', href: '../files/work.zip', downloadName: 'work.zip' },
    ],
  });
  assert.equal(links.elements[0].rel, 'noopener noreferrer');
  assert.equal(links.elements[1].getAttribute('download'), 'work.zip');
  assert.ok(links.elements[0].getAttribute('aria-label').includes('<작업>'));
  assert.equal(separateContainer.querySelector('작업'), null);
  links.elements[0].focus(); assert.equal(activeIndex, 0);
  links.setReady(false); assert.equal(activeIndex, -1); links.dispose();

  const canvas = document.querySelector('canvas');
  canvas.dispatchEvent(new window.Event('webglcontextlost', { cancelable: true }));
  assert.equal(document.querySelector('.portfolio-workspace').dataset.sceneState, 'fallback');
  assert.equal(papers.hidden, false);
  assert.equal(document.querySelector('.replay-button').disabled, true);
  canvas.dispatchEvent(new window.Event('webglcontextrestored'));
  assert.equal(document.querySelector('.portfolio-workspace').classList.contains('is-fallback'), false);
  assert.equal(papers.hidden, false);
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new window.Event('visibilitychange'));
  const previousRenders = state.renderCount; clock.tick(200); assert.equal(state.renderCount, previousRenders);
  window.dispatchEvent(new window.Event('pagehide')); assert.equal(state.disposed, true);
  assert.equal(app.errors.length, 0, app.errors.map(error => error.message).join('\n'));
} finally { app.close(); }

const fallback = setup({ rendererFailure: true });
try {
  assert.equal(fallback.document.querySelector('.paper-links').hidden, false);
  assert.equal(fallback.document.querySelectorAll('.paper-link').length, 4);
  assert.equal(fallback.warnings.length, 1, 'An initialization failure retains diagnostic context');
  fallback.document.querySelector('.skip-button').click();
  assert.equal(fallback.document.activeElement, fallback.document.querySelector('.paper-link'));
} finally { fallback.close(); }

const mainDocument = new JSDOM(fs.readFileSync(path.join(dist, 'index.html'), 'utf8')).window.document;
assert.equal(mainDocument.querySelectorAll('#projects .project-card').length, 2, 'No extra folder card is added');
assert.equal(mainDocument.querySelector('.project-current').getAttribute('href'), './portfolio/');
assert.equal(mainDocument.querySelector('.project-current').target, '_blank');
assert.ok(mainDocument.querySelector('.project-archive').href.startsWith('https://www.canva.com/'));
for (const match of html.matchAll(/(?:href|src)="(\.{1,2}\/[^"?#]+)(?:\?[^"#]*)?"/g)) {
  assert.ok(fs.existsSync(path.resolve(dist, 'portfolio', match[1])), `Missing portfolio asset: ${match[1]}`);
}
console.log(`PASS: close-up/turn/run/drop/lift/papers sequence, ${triangles} triangles / ${meshes} meshes, framing ${maximumEdge.toFixed(3)}, numbered links, keyboard/hover, replay/skip, graphics fallback, cleanup, and original personal portfolio entry.`);
console.log('UNVERIFIED: actual browser pixels and GPU shader output.');
