// 독립 포트폴리오의 렌더링 수명, 근접 카메라 연출과 홀로그램 목록의 전환을 연결한다.
import * as THREE from '../vendor/three.module.js';
import { INTRO_DURATION_SECONDS, getPortfolioPose } from './animation.js';
import { createPortfolioModel, framePortfolioCamera } from './scene-model.js';
import { loadBlenderPortfolioModel } from './blender-model.js';
import { createPaperLinks } from './paper-links.js';
import { createHologramPresentation } from './hologram-presentation.js';
import { portfolioProjects } from './projects.js';

const workspaceElement = document.querySelector('.portfolio-workspace');
const stageElement = document.querySelector('.portfolio-stage');
const captionElement = document.querySelector('.scene-caption');
const replayElement = document.querySelector('.replay-button');
const skipElement = document.querySelector('.skip-button');
const abortController = new AbortController();
const eventOptions = { signal: abortController.signal };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
// 로컬에서만 특정 자세를 멈춰 검토한다. 공개 사이트의 연출·조작에는 영향을 주지 않는다.
const reviewParameter = new URLSearchParams(window.location.search).get('review');
const reviewSeconds = ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname)
  && reviewParameter !== null && Number.isFinite(Number(reviewParameter))
  ? THREE.MathUtils.clamp(Number(reviewParameter), 0, INTRO_DURATION_SECONDS) : null;
let sceneController = null;
const paperLinks = createPaperLinks({
  containerElement: document.querySelector('.hologram-list'),
  projects: portfolioProjects,
  baseUrl: document.baseURI,
});
const presentation = createHologramPresentation({
  panelElement: document.querySelector('.hologram-panel'),
  containerElement: document.querySelector('.hologram-list'), elements: paperLinks.elements,
  backdropElement: document.querySelector('.presentation-backdrop'), stageElement,
});

/** 그래픽이 없어도 네 항목에 접근할 수 있게 번호 버튼을 남긴다. */
function showFallback() {
  workspaceElement.classList.add('is-fallback');
  workspaceElement.dataset.sceneState = 'fallback';
  paperLinks.setReady(true);
  presentation.showFallback(window.innerWidth, window.innerHeight);
  replayElement.disabled = true;
  captionElement.textContent = '3D 연출 대신 작업 목록을 표시합니다. 미등록 작품은 준비 중입니다.';
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
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true'); stageElement.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  scene.add(new THREE.HemisphereLight(0xf6f8ff, 0x8091b1, 1.6));
  const keyLight = new THREE.DirectionalLight(0xfffbf3, 2.7); keyLight.position.set(-3, 8, 7);
  keyLight.castShadow = true; keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, { left: -8, right: 8, top: 8, bottom: -5, near: 0.1, far: 30 });
  keyLight.shadow.normalBias = 0.03; keyLight.shadow.bias = -0.0002; scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xb5cdff, 1.5); rimLight.position.set(4, 5, -4); scene.add(rimLight);
  const groundGeometry = new THREE.PlaneGeometry(200, 200);
  const groundMaterial = new THREE.ShadowMaterial({ color: 0x38547d, opacity: 0.13 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.065; ground.receiveShadow = true; scene.add(ground);
  let model = createPortfolioModel(); model.root.visible = false; scene.add(model.root);
  const projectedAnchor = new THREE.Vector3();
  let width = 1, height = 1, elapsedSeconds = 0, previousTimeMs = 0, frameId = 0;
  let isReady = false, isLost = false, isDisposed = false, isModelReady = false;

  /** 폴더 입구의 한 점을 투영 원점으로 사용해 목록과 광선이 소품에서 떨어져 보이지 않게 한다. */
  function getHologramAnchor() {
    // 탭의 윗면까지 확인해 목록 밑면이 폴더에 닿거나 겹치지 않게 한다.
    projectedAnchor.set(1.44, 2.91, -0.15).applyMatrix4(model.folder.matrixWorld).project(camera);
    const top = (1 - projectedAnchor.y) * height / 2;
    projectedAnchor.set(1.44, 2.12, 0.65).applyMatrix4(model.folder.matrixWorld).project(camera);
    return { x: (projectedAnchor.x + 1) * width / 2, y: (1 - projectedAnchor.y) * height / 2, top };
  }

  /** 카메라와 자세를 같은 시간축으로 움직여 정면 뒷걸음 대신 뒤돌아 달려가는 원근을 만든다. */
  function updateScene() {
    const pose = getPortfolioPose(elapsedSeconds);
    model.update(pose, elapsedSeconds);
    framePortfolioCamera(camera, width, height, pose);
    workspaceElement.dataset.sceneState = pose.phase;
    if (!isReady && elapsedSeconds >= INTRO_DURATION_SECONDS) {
      isReady = true; paperLinks.setReady(true);
      captionElement.textContent = '홀로그램 작업 목록이 열렸습니다. 미등록 작품은 준비 중입니다.';
    }
    presentation.update(pose.presentation, pose.presentation > 0 ? getHologramAnchor() : null, width, height);
    renderer.render(scene, camera);
  }

  /** 숨긴 탭의 경과 시간을 누적하지 않아 돌아왔을 때 장면이 갑자기 건너뛰지 않는다. */
  function render(timeMs) {
    frameId = 0;
    if (isDisposed || isLost || document.hidden) return;
    const deltaSeconds = Math.min(0.05, previousTimeMs ? (timeMs - previousTimeMs) / 1000 : 0);
    previousTimeMs = timeMs;
    if (isModelReady && reviewSeconds === null) elapsedSeconds += deltaSeconds;
    updateScene();
    // 목록 등장 뒤에는 현재 3D 프레임을 보존하고 불필요한 연속 렌더링을 멈춘다.
    if (!isReady && (reviewSeconds === null || !isModelReady)) frameId = requestAnimationFrame(render);
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
  // 간이 모델이 얼굴 클로즈업에 잠깐 노출되지 않도록 자산 준비 뒤에 재생 시계를 시작한다.
  loadBlenderPortfolioModel(abortController.signal).then(blenderModel => {
    if (isDisposed) { blenderModel.dispose(); return; }
    scene.remove(model.root); model.dispose(); model = blenderModel; scene.add(model.root);
    isModelReady = true; previousTimeMs = 0;
    elapsedSeconds = reviewSeconds ?? (reducedMotion.matches ? INTRO_DURATION_SECONDS : elapsedSeconds);
    workspaceElement.dataset.modelSource = 'blender-v3'; updateScene(); resume();
  }).catch(error => {
    if (isDisposed) return;
    console.warn('Blender 포트폴리오 모델을 읽지 못해 기본 장면을 유지합니다.', error);
    model.root.visible = true; isModelReady = true;
    if (reducedMotion.matches) elapsedSeconds = INTRO_DURATION_SECONDS;
    workspaceElement.dataset.modelSource = 'procedural'; updateScene(); resume();
  });
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
    /** 대기 없이 목록이 펼쳐진 최종 자세를 보여 준다. */
    skipIntro() {
      if (isLost) return;
      elapsedSeconds = Math.max(elapsedSeconds, INTRO_DURATION_SECONDS); updateScene();
    },
    /** 사용자가 직접 다시보기를 선택하면 동작 줄이기 설정에서도 한 번은 재생한다. */
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
reducedMotion.addEventListener?.('change', () => { if (reducedMotion.matches) sceneController?.skipIntro(); }, eventOptions);
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
