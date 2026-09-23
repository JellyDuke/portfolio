import * as THREE from './vendor/three.module.js';
import { createAssembly, createStudioEnvironment } from './assembly.js?v=14';

const clamp = THREE.MathUtils.clamp;
const hosts = [...document.querySelectorAll('[data-scene]')];
const controllers = [];
let pageMotion = { position: 0, chapter: document.documentElement.dataset.activeSection || 'home' };

function makeScene(host) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch {
    host.dataset.rendered = 'false';
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.transmissionResolutionScale = .75;
  renderer.setClearColor(0xffffff, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 50);
  camera.position.set(0, .12, 8.3);
  camera.lookAt(0, 0, 0);
  const environment = createStudioEnvironment();
  scene.environment = environment;
  scene.environmentIntensity = 1.1;
  scene.add(new THREE.HemisphereLight(0xf5f8ff, 0x60749a, .7));
  const keyLight = new THREE.DirectionalLight(0xfff8ee, 2.6);
  keyLight.position.set(-3, 6, 5); scene.add(keyLight);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024,1024);
  Object.assign(keyLight.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:20});
  keyLight.shadow.normalBias=.025; keyLight.shadow.bias=-.00015; keyLight.shadow.radius=3;
  const fill = new THREE.DirectionalLight(0x97bcff, 1.4);
  fill.position.set(5, 1, -2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd6e7ff, 2.1);
  rim.position.set(-2, 3, -4); scene.add(rim);
  const spinPivot = new THREE.Group(); scene.add(spinPivot);
  const group = new THREE.Group(); spinPivot.add(group);
  const mixer = new THREE.AnimationMixer(spinPivot);
  const spinTrack = new THREE.NumberKeyframeTrack('.rotation[y]', [0, .9, 1.8], [0, Math.PI, Math.PI * 2]);
  spinTrack.setInterpolation(THREE.InterpolateSmooth);
  const spinAction = mixer.clipAction(new THREE.AnimationClip('turn', 1.8, [spinTrack]));
  spinAction.setLoop(THREE.LoopOnce, 1); spinAction.clampWhenFinished = true;
  const assembly = createAssembly(); group.add(assembly.root);
  const faces = assembly.pickable;
  const groundGeometry = new THREE.PlaneGeometry(20,20);
  const groundMaterial = new THREE.ShadowMaterial({color:0x36517c,opacity:.1});
  const ground = new THREE.Mesh(groundGeometry,groundMaterial);
  ground.rotation.x=-Math.PI/2; ground.position.y=-2.12; ground.receiveShadow=true; scene.add(ground);
  const isSkills = host.dataset.scene === 'skills';
  const input = { x: 0, y: 0, choice: 0 };
  const displayed = { x: .12, y: -.5, z: 0, focus: 0, entrance: 0 };
  let visible = false, lost = false, disposed = false, animation = 0, lastRender = 0, wasActive = false, elapsed = 0;
  const sectionId = host.closest('section').id;
  const activeScene = () => pageMotion.chapter === sectionId;
  const observedArea = isSkills ? host.closest('.skills-layout') : host.closest('.story-layout');

  function targets() {
    const p = isSkills ? input.choice : pageMotion.position;
    const pointerX = input.x;
    const pointerY = input.y;
    return {
      x: .06 + pointerY * .075,
      y: -.06 + pointerX * .18 + Math.sin(p * Math.PI) * .08,
      z: -.025 + Math.sin(p * 1.5) * .025,
      focus: p,
      entrance: 1,
    };
  }
  function render(now = 0) {
    animation = 0;
    if (disposed || lost || !visible || !activeScene() || document.hidden) return;
    const deltaTime = Math.min(.06, lastRender ? (now - lastRender) / 1000 : 1 / 60);
    lastRender = now;
    mixer.update(deltaTime);
    const target = targets();
    for (const key of Object.keys(displayed)) {
      const delta = target[key] - displayed[key];
      displayed[key] = displayed[key] + delta * (1 - Math.exp(-(key === 'focus' ? 4.5 : 6) * deltaTime));
    }
    elapsed += deltaTime;
    const time = elapsed;
    const float = Math.sin(time * .7) * .045;
    const sway = Math.sin(time * .45) * .045;
    group.rotation.set(displayed.x, displayed.y + sway, displayed.z);
    group.position.y = float - (1 - displayed.entrance) * .35;
    group.scale.setScalar(.86 + displayed.entrance * .14);
    assembly.animate(time,displayed.focus,displayed.entrance);
    renderer.render(scene, camera);
    host.dataset.rendered = 'true';
    animation = requestAnimationFrame(render);
  }
  function requestRender() {
    if (!animation && !disposed && !lost && visible && activeScene() && !document.hidden) animation = requestAnimationFrame(render);
  }
  function updateScene() {
    const active = activeScene();
    if (active && !wasActive) { displayed.entrance = 0; displayed.y -= .5; lastRender = 0; }
    if (!active) { cancelAnimationFrame(animation); animation = 0; lastRender = 0; }
    wasActive = active;
    requestRender();
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep the complete geometry inside narrow cards and phone layouts.
    camera.position.z = Math.max(isSkills ? 8.7 : 8.3, 8.5 / camera.aspect);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix(); requestRender();
  }
  function pointerMove(event) {
    if (event.pointerType === 'touch') return;
    const rect = observedArea.getBoundingClientRect();
    input.x = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
    input.y = clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
    requestRender();
  }
  function pointerLeave() { input.x = 0; input.y = 0; requestRender(); }
  observedArea.addEventListener('pointermove', pointerMove, { passive: true });
  observedArea.addEventListener('pointerleave', pointerLeave);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pickLayer(event) {
    if (!activeScene() || pageMotion.moving) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(faces, false)[0];
    if (!hit) return;
    input.choice = hit.object.userData.sceneIndex;
    if (!isSkills) document.dispatchEvent(new CustomEvent('portfolio:choose', { detail: { index: input.choice } }));
    requestRender();
  }
  function hoverObject(event) {
    if (pageMotion.moving || !activeScene() || event.pointerType === 'touch') return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer,camera);
    const hit = raycaster.intersectObjects(faces,false)[0];
    renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
    renderer.domElement.title = hit ? ['소프트웨어 개발 소개 보기','AI 활용 소개 보기','CCTV·네트워크 소개 보기'][hit.object.userData.sceneIndex] : '';
  }
  function clearHover() { renderer.domElement.style.cursor = 'default'; renderer.domElement.title = ''; }
  renderer.domElement.addEventListener('click', pickLayer);
  renderer.domElement.addEventListener('pointermove', hoverObject, {passive:true});
  renderer.domElement.addEventListener('pointerleave', clearHover);
  const rowHandlers = [];
  if (isSkills) document.querySelectorAll('.skill-row').forEach((row,i) => {
    const onEnter = () => { input.choice = [0,1,2,1,0][i]; requestRender(); };
    row.addEventListener('pointerenter', onEnter); rowHandlers.push([row,onEnter]);
  });
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  const intersection = new IntersectionObserver(entries => {
    const entering = !visible && entries[0].isIntersecting;
    visible = entries[0].isIntersecting;
    if (entering) { displayed.entrance = 0; displayed.y -= .5; lastRender = 0; }
    if (visible) requestRender(); else { cancelAnimationFrame(animation); animation = 0; lastRender = 0; }
  }, { rootMargin: '80px' });
  intersection.observe(host);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true; host.dataset.rendered = 'false'; cancelAnimationFrame(animation); animation = 0;
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => { lost = false; requestRender(); });
  resize();
  return {
    update: updateScene,
    spin() { if (activeScene() && !spinAction.isRunning()) { spinAction.reset().play(); requestRender(); } },
    pause() { cancelAnimationFrame(animation); animation = 0; lastRender = 0; },
    dispose() {
      disposed = true; cancelAnimationFrame(animation); intersection.disconnect(); resizeObserver.disconnect();
      observedArea.removeEventListener('pointermove', pointerMove); observedArea.removeEventListener('pointerleave', pointerLeave);
      renderer.domElement.removeEventListener('click', pickLayer);
      renderer.domElement.removeEventListener('pointermove', hoverObject);
      renderer.domElement.removeEventListener('pointerleave', clearHover);
      mixer.stopAllAction(); mixer.uncacheRoot(spinPivot);
      rowHandlers.forEach(([row,fn]) => row.removeEventListener('pointerenter', fn));
      assembly.dispose(); environment.dispose(); groundGeometry.dispose(); groundMaterial.dispose(); renderer.dispose();
    },
  };
}

hosts.forEach(host => { const controller = makeScene(host); if (controller) controllers.push(controller); });
document.addEventListener('portfolio:motion', event => {
  pageMotion = event.detail; controllers.forEach(controller => controller.update());
});
document.addEventListener('portfolio:spin', () => controllers.forEach(controller => controller.spin()));
document.addEventListener('visibilitychange', () => controllers.forEach(controller => document.hidden ? controller.pause() : controller.update()));
window.addEventListener('pagehide', event => controllers.forEach(controller => event.persisted ? controller.pause() : controller.dispose()));
window.addEventListener('pageshow', () => controllers.forEach(controller => controller.update()));
