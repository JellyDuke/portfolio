// 독립 포트폴리오의 렌더링 수명, 근접 카메라 연출과 전면 선택 화면의 전환을 연결한다.
import * as THREE from '../vendor/three.module.js';
import { INTRO_DURATION_SECONDS, getPortfolioPose } from './animation.js';
import { createPortfolioModel, framePortfolioCamera } from './scene-model.js';
import { createPaperLinks } from './paper-links.js';
import { createPaperPresentation } from './paper-presentation.js';
import { portfolioProjects } from './projects.js';

const workspaceElement = document.querySelector('.portfolio-workspace');
const stageElement = document.querySelector('.portfolio-stage');
const captionElement = document.querySelector('.scene-caption');
const replayElement = document.querySelector('.replay-button');
const skipElement = document.querySelector('.skip-button');
const abortController = new AbortController();
const eventOptions = { signal: abortController.signal };
let sceneController = null;
const paperLinks = createPaperLinks({
  containerElement: document.querySelector('.paper-links'),
  projects: portfolioProjects,
  baseUrl: document.baseURI,
});
const presentation = createPaperPresentation({
  containerElement: document.querySelector('.paper-links'), elements: paperLinks.elements,
  backdropElement: document.querySelector('.presentation-backdrop'), stageElement,
});

/** 그래픽이 없어도 네 항목에 접근할 수 있게 번호 버튼을 남긴다. */
function showFallback() {
  workspaceElement.classList.add('is-fallback');
  workspaceElement.dataset.sceneState = 'fallback';
  paperLinks.setReady(true);
  presentation.showFallback(window.innerWidth, window.innerHeight);
  replayElement.disabled = true;
  captionElement.textContent = '3D 연출 대신 포트폴리오 1부터 4를 표시합니다. 미등록 작품은 준비 중입니다.';
}

/** 렌더러·조명·모델을 소유하며, 탭 숨김과 페이지 종료 시 불필요한 렌더링을 중단한다. */
function createRoomScene() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (error) {
    console.warn('포트폴리오 3D 초기화 실패: 번호 목록으로 전환합니다.', error);
    showFallback(); return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.setClearColor(0xedf1f6, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true'); stageElement.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  scene.add(new THREE.HemisphereLight(0xf6f8ff, 0x8091b1, 2.25));
  const keyLight = new THREE.DirectionalLight(0xfffbf3, 3.5); keyLight.position.set(-3, 8, 7);
  keyLight.castShadow = true; keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, { left: -8, right: 8, top: 8, bottom: -5, near: 0.1, far: 30 });
  keyLight.shadow.normalBias = 0.03; keyLight.shadow.bias = -0.0002; scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xb5cdff, 2.1); rimLight.position.set(4, 5, -4); scene.add(rimLight);
  const groundGeometry = new THREE.PlaneGeometry(200, 200);
  const groundMaterial = new THREE.ShadowMaterial({ color: 0x38547d, opacity: 0.13 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.065; ground.receiveShadow = true; scene.add(ground);
  const model = createPortfolioModel(); scene.add(model.root);
  const projectedCorner = new THREE.Vector3();
  let width = 1, height = 1, elapsedSeconds = 0, previousTimeMs = 0, frameId = 0;
  let isReady = false, isLost = false, isDisposed = false;

  /** 작은 3D 종이의 화면 좌표를 전면 선택 면의 출발지로 전달한다. */
  function getPaperOrigins() {
    return model.papers.map(paper => {
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const x of [-0.46, 0.46]) for (const y of [-0.875, 0.875]) {
        projectedCorner.set(x, y, 0.04).applyMatrix4(paper.matrixWorld).project(camera);
        const screenX = (projectedCorner.x + 1) * width / 2, screenY = (1 - projectedCorner.y) * height / 2;
        left = Math.min(left, screenX); right = Math.max(right, screenX);
        top = Math.min(top, screenY); bottom = Math.max(bottom, screenY);
      }
      return { x: left, y: top, width: right - left, height: bottom - top, rotate: -paper.rotation.z * 180 / Math.PI };
    });
  }

  /** 카메라와 자세를 같은 시간축으로 움직여 정면 뒷걸음 대신 뒤돌아 달려가는 원근을 만든다. */
  function updateScene() {
    const pose = getPortfolioPose(elapsedSeconds);
    model.update(pose, elapsedSeconds);
    framePortfolioCamera(camera, width, height, pose);
    workspaceElement.dataset.sceneState = pose.phase;
    if (!isReady && elapsedSeconds >= INTRO_DURATION_SECONDS) {
      isReady = true; paperLinks.setReady(true);
      captionElement.textContent = '포트폴리오 1부터 4가 화면 앞으로 펼쳐졌습니다. 미등록 작품은 준비 중입니다.';
    }
    presentation.update(pose.presentation, pose.presentation > 0 ? getPaperOrigins() : [], width, height);
    renderer.render(scene, camera);
  }

  /** 숨긴 탭의 경과 시간을 누적하지 않아 돌아왔을 때 장면이 갑자기 건너뛰지 않는다. */
  function render(timeMs) {
    frameId = 0;
    if (isDisposed || isLost || document.hidden) return;
    const deltaSeconds = Math.min(0.05, previousTimeMs ? (timeMs - previousTimeMs) / 1000 : 0);
    previousTimeMs = timeMs;
    elapsedSeconds += deltaSeconds;
    updateScene();
    // 전면 선택 화면이 완전히 덮은 뒤에는 보이지 않는 3D 장면을 계속 렌더링하지 않는다.
    if (!isReady) frameId = requestAnimationFrame(render);
  }
  function resume() { if (!frameId && !isReady && !isDisposed && !isLost && !document.hidden) { previousTimeMs = 0; frameId = requestAnimationFrame(render); } }
  function pause() { cancelAnimationFrame(frameId); frameId = 0; previousTimeMs = 0; }

  /** 화면비가 달라도 인물·폴더·실제 링크의 좌표를 함께 맞춘다. */
  function resize() {
    if (isLost || isDisposed) return;
    const bounds = stageElement.getBoundingClientRect();
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    renderer.setSize(width, height, false); updateScene(); resume();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stageElement);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); isLost = true; pause(); showFallback();
  }, eventOptions);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    isLost = false; workspaceElement.classList.remove('is-fallback'); replayElement.disabled = false;
    elapsedSeconds = INTRO_DURATION_SECONDS; isReady = false; resize();
  }, eventOptions);
  resize();

  return {
    pause, resume,
    /** 대기 없이 종이가 펼쳐진 최종 자세를 보여 준다. */
    skipIntro() {
      if (isLost) return;
      elapsedSeconds = Math.max(elapsedSeconds, INTRO_DURATION_SECONDS); updateScene();
    },
    /** 링크를 숨기고 근접 장면부터 재생한다. */
    replay() {
      if (isLost) return;
      elapsedSeconds = 0; isReady = false;
      paperLinks.setReady(false);
      captionElement.textContent = '포트폴리오 소개 연출을 재생합니다.';
      updateScene(); resume();
    },
    dispose() {
      if (isDisposed) return;
      isDisposed = true; pause(); resizeObserver.disconnect(); model.dispose();
      groundGeometry.dispose(); groundMaterial.dispose(); keyLight.shadow.map?.dispose(); renderer.dispose();
    },
  };
}

sceneController = createRoomScene();
skipElement.addEventListener('click', () => { sceneController?.skipIntro(); paperLinks.elements[0]?.focus({ preventScroll: true }); }, eventOptions);
replayElement.addEventListener('click', () => sceneController?.replay(), eventOptions);
document.addEventListener('visibilitychange', () => document.hidden ? sceneController?.pause() : sceneController?.resume(), eventOptions);
window.addEventListener('resize', () => {
  if (workspaceElement.classList.contains('is-fallback')) presentation.showFallback(window.innerWidth, window.innerHeight);
}, eventOptions);
window.addEventListener('pagehide', event => {
  if (event.persisted) sceneController?.pause();
  else { sceneController?.dispose(); paperLinks.dispose(); abortController.abort(); }
}, eventOptions);
window.addEventListener('pageshow', () => sceneController?.resume(), eventOptions);
