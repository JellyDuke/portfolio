// 별도 포트폴리오의 연출 순서, 투영 범위, 실제 링크와 수명 관리를 검증한다. GPU 픽셀 검사는 아니다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import FakeTimers from '@sinonjs/fake-timers';
import * as THREE from '../dist/vendor/three.module.js';
import { GLTFLoader } from '../dist/vendor/GLTFLoader.js';
import { getPortfolioPose, getPortfolioPaperPose, getPortfolioFootPlacement, INTRO_DURATION_SECONDS } from '../dist/portfolio/animation.js';
import { createHologramPresentation, getHologramLayout, getHologramReveal, getProjectionPhase } from '../dist/portfolio/hologram-presentation.js';
import { createPortfolioModel, framePortfolioCamera } from '../dist/portfolio/scene-model.js';
import { createSkinnedPortfolioModel } from '../dist/portfolio/skinned-model.js';
import { createPaperLinks, resolveProjectAction } from '../dist/portfolio/paper-links.js';
import { portfolioProjects } from '../dist/portfolio/projects.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
/** GLB 헤더와 크기를 확인한 뒤 골격·소품 계약 검사에 쓸 JSON 청크를 읽는다. */
function readBlenderAsset(filename, maxBytes) {
  const binary = fs.readFileSync(path.join(dist, 'models', filename));
  assert.equal(binary.toString('utf8', 0, 4), 'glTF', '배포 결과에 유효한 GLB가 포함돼야 한다');
  assert.ok(binary.length <= maxBytes, '브라우저 로더의 자산 크기 상한을 지킨다');
  return JSON.parse(binary.subarray(20, 20 + binary.readUInt32LE(12)).toString('utf8'));
}
const blenderScene = readBlenderAsset('portfolio-props-v3.glb', 2 * 1024 * 1024);
const blenderNodes = new Set(blenderScene.nodes.map(node => node.name));
const propsRoot = blenderScene.nodes.find(node => node.name === 'portfolio_root');
assert.ok((propsRoot.rotation || [0, 0, 0, 1]).slice(0, 3).every(component => Math.abs(component) < 0.00001), '웹 소품 피벗에는 Blender 스튜디오의 축 회전이 남지 않는다');
const folderFrontPivot = blenderScene.nodes.find(node => node.name === 'folder_front');
assert.ok(Math.abs(folderFrontPivot.translation[1] - 0.025) < 0.001 && Math.abs(folderFrontPivot.translation[2] - 0.2) < 0.001, '폴더 높이와 깊이의 로컬 축을 바꾸지 않는다');
for (const name of ['character', 'hips', 'torso', 'head', 'folder', 'folder_front', 'hand_left', 'hand_right', ...Array.from({ length: 4 }, (_, index) => `paper_${index}`)]) {
  assert.ok(blenderNodes.has(name), `Missing Blender animation pivot: ${name}`);
}
const initial = getPortfolioPose(0), running = getPortfolioPose(2.3), ready = getPortfolioPose(INTRO_DURATION_SECONDS);
assert.ok(blenderScene.meshes?.length >= 6, '소품 GLB에는 빈 피벗뿐 아니라 실제 폴더와 종이 표면이 있어야 한다');
const characterAsset = readBlenderAsset('portfolio-character-v3.glb', 12 * 1024 * 1024);
assert.ok(characterAsset.skins?.some(skin => skin.joints.length >= 45), '인물에는 손가락을 포함한 스킨 골격이 있어야 한다');
assert.ok(characterAsset.nodes.some(node => node.name === 'character_skeleton'));
assert.ok(characterAsset.animations?.some(animation => animation.channels.length > 30), '몸 전체의 검토된 동작을 포함한다');
assert.ok(characterAsset.meshes.some(mesh => mesh.extras?.targetNames?.includes('blink')), '눈꺼풀 변형을 보존한다');
assert.ok(characterAsset.images.every(image => image.bufferView !== undefined), '외부 텍스처 요청 없이 로컬 GLB에 재질을 포함한다');
// 여러 트랙이 같은 GLB 시간 배열을 공유해도 원본 손상 없이 시작 오프셋을 한 번만 보정한다.
const propsBinary = fs.readFileSync(path.join(dist, 'models/portfolio-props-v3.glb'));
const propsAsset = await new GLTFLoader().parseAsync(propsBinary.buffer.slice(propsBinary.byteOffset, propsBinary.byteOffset + propsBinary.byteLength), '');
const avatarScene = new THREE.Group(), skeletonPivot = new THREE.Group();
skeletonPivot.name = 'character_skeleton'; avatarScene.add(skeletonPivot);
const sharedTimes = new Float32Array([1 / 30, 1 + 1 / 30]);
const sourceClip = new THREE.AnimationClip('공유 시간 배열 검토', -1, [
  new THREE.NumberKeyframeTrack('character_skeleton.position[x]', sharedTimes, [0, 2]),
  new THREE.NumberKeyframeTrack('character_skeleton.scale[y]', sharedTimes, [1, 2]),
]);
const alignedModel = createSkinnedPortfolioModel(propsAsset, { scene: avatarScene, animations: [sourceClip] });
alignedModel.update(getPortfolioPose(0.5), 0.5);
assert.ok(Math.abs(skeletonPivot.position.x - 1) < 0.00001 && Math.abs(skeletonPivot.scale.y - 1.5) < 0.00001, '동작 클립은 웹의 0초부터 재생된다');
assert.equal(sourceClip.tracks[0].times[0], sharedTimes[0], '입력 클립의 시간 배열은 수정하지 않는다');
assert.ok(Math.abs(sharedTimes[0] - 1 / 30) < 0.000001, '공유된 시간 배열을 중복 이동하지 않는다');
alignedModel.dispose();
assert.equal(initial.characterYaw, 0);
assert.equal(initial.cameraReveal, 0);
assert.ok(initial.characterZ > 3, 'The character starts close to the viewer');
assert.equal(getPortfolioPose(1.4).characterYaw, Math.PI, 'The turn finishes before running away');
assert.equal(running.characterYaw, Math.PI);
assert.ok(running.characterZ < initial.characterZ - 2.7, '중간 급가속 없이 뒤를 보고 멀어진다');
assert.equal(getPortfolioPose(2.1).cameraReveal, 1, '달리기 초반에 발까지 보이는 전신 구도로 전환한다');
// 옆걸음은 발을 벌린 뒤 모은다. 뒤따르는 발이 선행 발을 넘지 않고 접촉 전후에는 제자리를 유지한다.
for (const [start, end] of [[8, 9.2], [10.3, 11]]) {
  for (let time = start; time <= end; time += 1 / 60) {
    const right = getPortfolioFootPlacement(time, -1), left = getPortfolioFootPlacement(time, 1);
    assert.ok(left.x - right.x >= 0.339, '횡이동 중 양발이 교차하지 않는다');
    assert.ok(right.y >= 0.0419 && left.y >= 0.0419, '발 목표점이 바닥 아래로 내려가지 않는다');
  }
}
for (const side of [-1, 1]) {
  assert.deepEqual(getPortfolioFootPlacement(6.5, side), getPortfolioFootPlacement(7.6, side), '들어 올리는 동안 발을 고정한다');
}
for (let time = 1.4; time < 3; time += 1 / 60) {
  const speed = Math.abs(getPortfolioPose(time + 1 / 60).characterZ - getPortfolioPose(time).characterZ) * 60;
  assert.ok(speed <= 4, '달리기 중간의 과속 때문에 보폭이 급격히 늘어나지 않는다');
}
assert.equal(getPortfolioPose(4.9).folderVisible, false);
assert.ok(getPortfolioPose(5.1).folderY > getPortfolioPose(5.45).folderY, 'The folder falls from above');
assert.ok(getPortfolioPose(6.5).hipHeight < 0.8 && getPortfolioPose(6.5).grip === 1);
assert.equal(getPortfolioPose(6.5).folderY, 0, '두 손 접촉이 끝나기 전에 폴더가 들리지 않는다');
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
assert.ok(model.papers.every(paper => !paper.visible), '홀로그램 목록으로 이어지면 작은 종이를 숨긴다');
assert.ok(model.papers[0].position.x < model.papers[1].position.x && model.papers[2].position.x < model.papers[3].position.x);
// 들어 올리고 옮기고 내려놓는 전 구간에서 손이 폴더에서 떨어져 보이지 않게 한다.
for (let time = 6.5; time <= 10.05; time += 0.05) {
  model.update(getPortfolioPose(time), time);
  model.hands.forEach((hand, index) => {
    assert.ok(hand.getWorldPosition(vertex).distanceTo(model.gripTargets[index]) < 0.06, 'Hands stay on the folder while lifting and placing');
  });
}
// 시작·낙하·집기 동안 종이가 보이지 않고, 표지가 열린 뒤 서로 다른 높이로 나온다.
for (const time of [0, 5.4, 6.5, 8.2, 10.8]) {
  model.update(getPortfolioPose(time), time);
  assert.ok(model.papers.every(paper => !paper.visible), '닫힌 폴더에서 종이가 먼저 나타나지 않는다');
}
const paperExit = getPortfolioPose(11.5);
assert.ok(getPortfolioPaperPose(paperExit, 0).y > getPortfolioPaperPose(paperExit, 3).y, '종이를 한 장씩 꺼낸다');
// 같은 시간으로 되돌려도 이전 IK 회전이 팔꿈치에 누적되지 않는다.
model.update(getPortfolioPose(6.7), 6.7);
const firstHand = model.hands[0].getWorldPosition(new THREE.Vector3()).clone();
model.update(getPortfolioPose(9.5), 9.5); model.update(getPortfolioPose(6.7), 6.7);
assert.ok(firstHand.distanceTo(model.hands[0].getWorldPosition(vertex)) < 0.0001);
// 화면 높이가 늘어도 최종 인물만 확대되어 목록과 비율이 달라지지 않는다.
model.update(ready, INTRO_DURATION_SECONDS);
const finalCharacterBounds = new THREE.Box3().setFromObject(model.character);
const finalCharacterCenter = finalCharacterBounds.getCenter(new THREE.Vector3());
const finalCharacterHeights = [[1366,768],[1920,1080]].map(([width, height]) => {
  framePortfolioCamera(camera, width, height, ready);
  const top = new THREE.Vector3(finalCharacterCenter.x, finalCharacterBounds.max.y, finalCharacterCenter.z).project(camera);
  const bottom = new THREE.Vector3(finalCharacterCenter.x, finalCharacterBounds.min.y, finalCharacterCenter.z).project(camera);
  return (top.y - bottom.y) * height / 2;
});
assert.ok(finalCharacterHeights[1] / finalCharacterHeights[0] < 1.2, '1080p의 최종 인물 크기는 노트북 화면과 비슷하게 유지한다');
model.dispose();

for (const [width, height] of [...viewports, [320,568], [851,393]]) {
  for (const anchor of [null, { x: width * 0.65, y: height * 0.68 }]) {
    const layout = getHologramLayout(width, height, anchor);
    assert.ok(layout.width <= 360 && layout.rowHeight >= 44, '목록 폭은 작게 유지하고 각 행의 터치 영역은 확보한다');
    assert.ok(layout.x >= 16 && layout.y >= 76 && layout.x + layout.width <= width - 16 && layout.y + layout.height <= height - 20, '세로·가로 화면 모두 목록이 조작 버튼 및 화면 밖으로 벗어나지 않는다');
    assert.equal(layout.height, layout.headerHeight + layout.rowHeight * 4 + layout.rowGap * 3, '같은 높이의 네 줄을 한 패널에 배치한다');
    assert.ok(layout.emitterX >= 0 && layout.emitterX <= layout.width);
  }
}
for (let index = 0; index < 4; index += 1) {
  assert.deepEqual(getHologramReveal(0, index), { opacity: 0, translateY: 8 });
  assert.deepEqual(getHologramReveal(1, index), { opacity: 1, translateY: 0 });
  const middle = getHologramReveal(0.6, index);
  assert.ok(middle.opacity >= 0 && middle.opacity <= 1 && middle.translateY >= 0 && middle.translateY <= 8, '등장 중에도 확대 없이 짧게 이동한다');
}
assert.ok(getHologramReveal(0.4, 0).opacity > getHologramReveal(0.4, 2).opacity, '번호 순서대로 목록이 나타난다');
assert.equal(getHologramReveal(0.4, 3).opacity, 0);
const ignition = getProjectionPhase(0.12);
assert.ok(ignition.light > 0 && ignition.header === 0 && getHologramReveal(0.12, 0).opacity === 0, '광원이 먼저 켜지고 텍스트는 아직 보이지 않는다');
assert.equal(getProjectionPhase(0.4).reach, 1, '목록 생성 전에 투영광이 자리에 도달한다');
assert.deepEqual(getProjectionPhase(1), { light: 1, reach: 1, header: 1, scan: 1 });
const paperDuringProjection = getPortfolioPaperPose(getPortfolioPose(12.08), 0);
assert.ok(paperDuringProjection.opacity > 0 && paperDuringProjection.opacity < 1 && paperDuringProjection.y < 2, '종이는 입구에서 연속적으로 사라지고 대형 판으로 솟지 않는다');

const baseUrl = 'https://portfolio.example/portfolio/';
assert.equal(resolveProjectAction({ href: 'javascript:alert(1)' }, baseUrl), null);
assert.equal(resolveProjectAction({ kind: 'download', href: 'https://files.example/file.zip' }, baseUrl), null);
assert.equal(resolveProjectAction({ kind: 'download', href: '../files/work.zip' }, baseUrl).download, true);
assert.equal(resolveProjectAction({ href: 'https://example.com/work' }, baseUrl).external, true);

const html = fs.readFileSync(path.join(dist, 'portfolio/index.html'), 'utf8');
for (const filename of ['portfolio.css', 'portfolio.js']) {
  const revision = createHash('sha256').update(fs.readFileSync(path.join(dist, 'portfolio', filename))).digest('hex').slice(0, 12);
  assert.ok(html.includes(`./${filename}?v=${revision}`), '배포 HTML은 실제 파일 내용의 캐시 키를 사용한다');
}
const source = fs.readFileSync(path.join(dist, 'portfolio/portfolio.js'), 'utf8').replace(/^import .*?;\r?\n/gm, '');

/** GPU 대신 렌더러 경계를 대체해 실제 컨트롤러의 DOM 이벤트와 정리 동작을 실행한다. */
function setup({ rendererFailure = false, reducedMotion = false } = {}) {
  const errors = [], warnings = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error)); virtualConsole.on('warn', message => warnings.push(message));
  const dom = new JSDOM(html, { url: baseUrl, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom, { document } = window;
  const clock = FakeTimers.withGlobal(window).install({ loopLimit: 10000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  const state = { renderCount: 0, disposed: false, model: null, width: 1200, height: 700 };
  window.matchMedia = () => ({ matches: reducedMotion });
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
    // 파일 로딩 경계만 즉시 완료하고 실제 연출 시계·DOM 처리는 그대로 사용한다.
    loadBlenderPortfolioModel: () => ({ then(callback) { callback(createPortfolioModel()); return { catch() {} }; } }),
    framePortfolioCamera, createPaperLinks, createHologramPresentation, portfolioProjects,
  });
  window.eval(source);
  return { window, document, clock, state, errors, warnings, close() { clock.uninstall(); window.close(); } };
}

const app = setup();
try {
  const { window, document, clock, state } = app;
  const papers = document.querySelector('.hologram-list'), controls = [...papers.children];
  const panel = document.querySelector('.hologram-panel');
  assert.equal(controls.length, 4);
  assert.equal(papers.querySelectorAll('a').length, 0, 'Pending projects have no fake destinations');
  assert.deepEqual(controls.map(element => element.querySelector('.hologram-number').textContent), ['01','02','03','04']);
  assert.deepEqual(controls.map(element => element.querySelector('.hologram-name').textContent), portfolioProjects.map(project => project.title));
  assert.ok(controls.every(element => element.querySelector('.hologram-status').textContent === '준비 중'));
  assert.equal(document.querySelectorAll('.paper-link,.paper-number,.paper-links').length, 0, '캐시된 대형 종이 CSS가 새 목록의 번호와 배치에 매칭되지 않는다');
  assert.ok(controls.every(element => element.getAttribute('aria-disabled') === 'true'));
  assert.equal(document.querySelectorAll('.hologram-panel').length, 1, '네 개의 대형 카드 대신 하나의 목록을 사용한다');
  assert.equal(papers.hidden, true);
  assert.equal(panel.hidden, true);
  document.querySelector('.skip-button').click();
  assert.equal(papers.hidden, false);
  assert.equal(document.activeElement, controls[0], '건너뛰기는 목록의 첫 번째 항목으로 초점을 옮긴다');
  document.querySelector('.replay-button').click();
  assert.equal(papers.hidden, true);
  assert.equal(document.querySelector('.portfolio-workspace').dataset.sceneState, 'closeup');
  clock.tick(12400);
  assert.equal(papers.hidden, false, '투영 중에는 네 줄 목록이 나타난다');
  assert.equal(papers.inert, true, '등장을 마치기 전에는 항목을 조작하지 않는다');
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
    const x = Number.parseFloat(panel.style.left), y = Number.parseFloat(panel.style.top);
    const w = Number.parseFloat(panel.style.width), h = Number.parseFloat(panel.style.height);
    assert.ok(w <= 360 && Number.parseFloat(panel.style.getPropertyValue('--hologram-row-height')) >= 44);
    assert.ok(x >= 16 && y >= 76 && x + w <= width - 16 && y + h <= height - 20, '목록 전체가 화면 안에 들어온다');
    assert.ok(controls.every(element => element.style.opacity === '1' && element.style.transform === 'translate3d(0, 0px, 0)'), '등장이 끝나면 네 줄 모두 제자리에 정착한다');
  }
  assert.ok(['0', '0.65'].includes(document.querySelector('.presentation-backdrop').style.opacity), '목록 아래 공간이 있을 때만 옅은 투영광을 보여 준다');
  assert.equal(document.querySelector('.portfolio-stage').style.opacity, '1', '목록 뒤의 인물과 폴더 장면을 유지한다');
  assert.equal(papers.inert, false);
  const settledRenders = state.renderCount; clock.tick(500);
  assert.equal(state.renderCount, settledRenders, '최종 3D 프레임은 보존하고 연속 렌더링만 멈춘다');

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
  assert.equal(fallback.document.querySelector('.hologram-list').hidden, false);
  assert.equal(fallback.document.querySelectorAll('.hologram-item').length, 4);
  assert.equal(fallback.warnings.length, 1, 'An initialization failure retains diagnostic context');
  fallback.document.querySelector('.skip-button').click();
  assert.equal(fallback.document.activeElement, fallback.document.querySelector('.hologram-item'));
} finally { fallback.close(); }

const reduced = setup({ reducedMotion: true });
try {
  assert.equal(reduced.document.querySelector('.portfolio-workspace').dataset.sceneState, 'ready', '동작 줄이기 환경에서는 자동 소개 재생을 생략한다');
  assert.equal(reduced.document.querySelector('.hologram-list').inert, false);
  assert.equal(reduced.document.querySelector('.hologram-panel').hidden, false);
  reduced.document.querySelector('.replay-button').click();
  assert.equal(reduced.document.querySelector('.portfolio-workspace').dataset.sceneState, 'closeup', '사용자의 명시적인 다시보기는 한 번 재생한다');
} finally { reduced.close(); }

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
