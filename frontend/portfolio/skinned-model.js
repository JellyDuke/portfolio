// Blender에서 검토한 연속 스킨 동작과 웹 폴더·종이 시간표를 같은 초 단위 시계에 연결한다.
import * as THREE from '../vendor/three.module.js';
import { createPortfolioModel, disposePortfolioResources } from './scene-model.js';
import { INTRO_DURATION_SECONDS } from './animation.js';

/** 분리된 인물·소품 자산을 결합한다. 원본의 골격 길이와 손바닥 접촉은 굽힌 애니메이션이 소유한다. */
export function createSkinnedPortfolioModel(propsAsset, characterAsset) {
  if (!characterAsset.animations.length || !characterAsset.scene.getObjectByName('character_skeleton')) {
    throw new Error('인물 GLB에 스킨 골격 또는 애니메이션이 없습니다.');
  }
  const model = createPortfolioModel(propsAsset.scene);
  const avatarRoot = characterAsset.scene;
  avatarRoot.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    // 머리카락 끝과 눈썹의 얇은 알파 면이 피부를 가리는 정렬 오류를 줄인다.
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.transparent) {
        material.alphaTest = 0.35;
        material.depthWrite = true;
        material.transparent = false;
      }
    }
    object.frustumCulled = false;
  });
  model.root.add(avatarRoot);
  const mixer = new THREE.AnimationMixer(avatarRoot);
  const actions = characterAsset.animations.map(sourceClip => {
    // GLB 트랙은 시간 배열을 공유할 수 있으므로 독립 복사본에서만 키 시간을 옮긴다.
    const clip = sourceClip.clone();
    // Blender의 1번 프레임은 GLB에서 1/30초다. 첫 키를 0초에 맞춰 웹 소품보다 한 프레임 늦는 현상을 막는다.
    const startSeconds = Math.min(...clip.tracks.map(track => track.times[0]));
    if (Number.isFinite(startSeconds) && startSeconds > 0) {
      clip.tracks.forEach(track => track.shift(-startSeconds));
      clip.resetDuration();
    }
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    return action;
  });
  let isDisposed = false;
  return {
    ...model,
    /** 재생·건너뛰기·다시보기 모두 절대 시간으로 맞춰 두 자산의 접촉 시점이 어긋나지 않게 한다. */
    update(pose, elapsedSeconds) {
      model.update(pose, elapsedSeconds);
      actions.forEach(action => { action.paused = false; action.enabled = true; });
      mixer.setTime(THREE.MathUtils.clamp(elapsedSeconds, 0, INTRO_DURATION_SECONDS));
      model.root.updateMatrixWorld(true);
    },
    /** 믹서 바인딩과 피부 텍스처까지 함께 정리해 다시 열었을 때 GPU 자원이 누적되지 않게 한다. */
    dispose() {
      if (isDisposed) return;
      isDisposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(avatarRoot);
      disposePortfolioResources(model.root);
    },
  };
}
