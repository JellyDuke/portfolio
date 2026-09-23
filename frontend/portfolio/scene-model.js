// 외부 모델 파일 없이 관절이 있는 로우폴리 인물과 열리는 3D 폴더를 만든다.
import * as THREE from '../vendor/three.module.js';

/** 캐릭터 관절과 폴더 회전축을 반환한다. 생성한 지오메트리·재질은 dispose에서 한 번씩 해제한다. */
export function createPortfolioModel() {
  const root = new THREE.Group(); root.name = 'Portfolio room';
  const materials = {
    jacket: new THREE.MeshStandardMaterial({ color: 0x345edf, roughness: 0.72, flatShading: true }),
    shirt: new THREE.MeshStandardMaterial({ color: 0xf9fafc, roughness: 0.9, flatShading: true }),
    trousers: new THREE.MeshStandardMaterial({ color: 0x273750, roughness: 0.85, flatShading: true }),
    skin: new THREE.MeshStandardMaterial({ color: 0xe8b49a, roughness: 0.9, flatShading: true }),
    hair: new THREE.MeshStandardMaterial({ color: 0x1d2535, roughness: 0.88, flatShading: true }),
    sole: new THREE.MeshStandardMaterial({ color: 0xdce5f1, roughness: 0.8 }),
    folder: new THREE.MeshStandardMaterial({ color: 0x315ae0, metalness: 0.06, roughness: 0.38 }),
    folderBack: new THREE.MeshStandardMaterial({ color: 0x2443ae, metalness: 0.05, roughness: 0.46 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xf8faff, roughness: 0.62, side: THREE.DoubleSide }),
  };

  /** 그림자를 주고받는 메시를 부모 좌표계에 배치한다. */
  function addMesh(parent, geometry, material, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  }

  const character = new THREE.Group(); character.name = 'Low-poly developer'; root.add(character);
  const hips = new THREE.Group(); character.add(hips);
  addMesh(hips, new THREE.BoxGeometry(0.55, 0.24, 0.33), materials.trousers);
  const torso = new THREE.Group(); torso.position.y = 0.06; hips.add(torso);
  const jacket = addMesh(torso, new THREE.CylinderGeometry(0.41, 0.32, 0.78, 6), materials.jacket, 0, 0.43);
  jacket.scale.z = 0.6;
  addMesh(torso, new THREE.BoxGeometry(0.22, 0.57, 0.025), materials.shirt, 0, 0.47, 0.229);
  addMesh(torso, new THREE.CylinderGeometry(0.11, 0.13, 0.2, 7), materials.skin, 0, 0.93);
  // 얼굴 중심이 아니라 목 아래를 회전축으로 사용해 머리가 제자리에서 팽이처럼 돌지 않게 한다.
  const head = new THREE.Group(); head.name = 'Character head'; head.position.y = 0.98; torso.add(head);
  const skull = new THREE.Group(); skull.position.y = 0.22; head.add(skull);
  const eyeGroups = [], pupils = [];
  const face = addMesh(skull, new THREE.IcosahedronGeometry(0.36, 1), materials.skin);
  face.scale.set(0.86, 1.1, 0.86);
  const hair = addMesh(skull, new THREE.SphereGeometry(0.36, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.53), materials.hair, 0, 0.055, -0.015);
  hair.scale.set(0.92, 1.08, 0.94);
  for (const direction of [-1, 1]) {
    addMesh(skull, new THREE.IcosahedronGeometry(0.066, 0), materials.skin, direction * 0.306, -0.015, 0);
    const eye = new THREE.Group(); eye.position.set(direction * 0.116, 0.017, 0.285); skull.add(eye); eyeGroups.push(eye);
    addMesh(eye, new THREE.SphereGeometry(0.043, 8, 6), materials.shirt);
    pupils.push(addMesh(eye, new THREE.SphereGeometry(0.024, 8, 6), materials.hair, 0, -0.001, 0.035));
    const eyebrow = addMesh(skull, new THREE.BoxGeometry(0.08, 0.025, 0.025), materials.hair, direction * 0.116, 0.098, 0.291);
    eyebrow.rotation.z = direction * -0.07;
  }
  const nose = addMesh(skull, new THREE.ConeGeometry(0.051, 0.13, 4), materials.skin, 0, -0.055, 0.331);
  nose.rotation.x = Math.PI / 2;
  addMesh(skull, new THREE.BoxGeometry(0.083, 0.018, 0.021), materials.hair, 0, -0.155, 0.264);

  /** 어깨와 팔꿈치를 분리해 달리기와 폴더 들어 올리기를 표현한다. */
  function createArm(direction) {
    const shoulder = new THREE.Group(); shoulder.position.set(direction * 0.38, 0.73, 0); torso.add(shoulder);
    addMesh(shoulder, new THREE.CylinderGeometry(0.125, 0.105, 0.42, 6), materials.jacket, 0, -0.21);
    const elbow = new THREE.Group(); elbow.position.y = -0.42; shoulder.add(elbow);
    addMesh(elbow, new THREE.CylinderGeometry(0.105, 0.08, 0.36, 6), materials.jacket, 0, -0.18);
    const hand = addMesh(elbow, new THREE.IcosahedronGeometry(0.115, 0), materials.skin, 0, -0.42);
    return { shoulder, elbow, hand };
  }

  /** 골반·무릎·발목을 연결해 달리기와 폴더 아래 웅크림을 표현한다. */
  function createLeg(direction) {
    const thigh = new THREE.Group(); thigh.position.set(direction * 0.17, -0.08, 0); hips.add(thigh);
    addMesh(thigh, new THREE.CylinderGeometry(0.155, 0.13, 0.44, 6), materials.trousers, 0, -0.22);
    const knee = new THREE.Group(); knee.position.y = -0.44; thigh.add(knee);
    addMesh(knee, new THREE.CylinderGeometry(0.13, 0.105, 0.42, 6), materials.trousers, 0, -0.21);
    const ankle = new THREE.Group(); ankle.position.y = -0.43; knee.add(ankle);
    addMesh(ankle, new THREE.BoxGeometry(0.25, 0.13, 0.43), materials.hair, 0, -0.005, 0.08);
    addMesh(ankle, new THREE.BoxGeometry(0.26, 0.04, 0.44), materials.sole, 0, -0.083, 0.08);
    return { thigh, knee, ankle };
  }
  const leftArm = createArm(-1), rightArm = createArm(1);
  const leftLeg = createLeg(-1), rightLeg = createLeg(1);

  const folder = new THREE.Group(); folder.name = 'Portfolio folder'; root.add(folder);
  const folderBody = new THREE.Group(); folderBody.rotation.y = -0.12; folderBody.position.x = 1.44; folder.add(folderBody);

  /** 탭이 있는 실제 폴더 윤곽을 두께가 있는 메시로 만든다. */
  function createFolderPanel(hasTab) {
    const shape = new THREE.Shape();
    const top = hasTab ? 2.64 : 2.35;
    shape.moveTo(-1.34, 0); shape.lineTo(1.34, 0); shape.quadraticCurveTo(1.44, 0, 1.44, 0.1);
    shape.lineTo(1.44, top - 0.1); shape.quadraticCurveTo(1.44, top, 1.34, top);
    if (hasTab) {
      shape.lineTo(-0.05, top); shape.lineTo(-0.26, 2.91); shape.lineTo(-1.2, 2.91);
      shape.quadraticCurveTo(-1.44, 2.91, -1.44, 2.73);
    } else { shape.lineTo(-1.34, top); shape.quadraticCurveTo(-1.44, top, -1.44, top - 0.1); }
    shape.lineTo(-1.44, 0.1); shape.quadraticCurveTo(-1.44, 0, -1.34, 0);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.035, bevelThickness: 0.035, curveSegments: 6 });
  }
  addMesh(folderBody, createFolderPanel(true), materials.folderBack, 0, 0, -0.15);
  const papers = [];
  for (let index = 0; index < 4; index += 1) {
    const paper = new THREE.Group(); paper.name = `Portfolio paper ${index + 1}`; folderBody.add(paper);
    // 두꺼운 상자 대신 얇고 살짝 휘어진 표면을 사용한다. 확대 선택 화면은 별도 HTML 링크가 이어받는다.
    const geometry = new THREE.PlaneGeometry(0.92, 1.75, 10, 16);
    const positions = geometry.attributes.position;
    for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
      const x = positions.getX(vertexIndex), y = positions.getY(vertexIndex);
      positions.setZ(vertexIndex, 0.055 * (y / 0.875) ** 2 + 0.025 * Math.cos(x * Math.PI / 0.92));
    }
    geometry.computeVertexNormals();
    addMesh(paper, geometry, materials.paper);
    papers.push(paper);
  }
  const folderFront = new THREE.Group(); folderFront.position.set(0, 0.025, 0.2); folderBody.add(folderFront);
  addMesh(folderFront, createFolderPanel(false), materials.folder);

  const gripTargets = [new THREE.Vector3(), new THREE.Vector3()];
  const armDirection = new THREE.Vector3(), elbowPosition = new THREE.Vector3(), bendDirection = new THREE.Vector3();
  const downDirection = new THREE.Vector3(0, -1, 0), localTarget = new THREE.Vector3();
  const shoulderRotation = new THREE.Quaternion(), elbowRotation = new THREE.Quaternion(), inverseRotation = new THREE.Quaternion();

  /** 두 관절의 길이를 유지하며 손을 폴더 표면에 붙인다. 연출 전후에는 기존 달리기 자세와 섞는다. */
  function alignArmToGrip(arm, target, weight) {
    localTarget.copy(target); torso.worldToLocal(localTarget);
    armDirection.subVectors(localTarget, arm.shoulder.position);
    const distance = Math.min(0.839, Math.max(0.001, armDirection.length()));
    armDirection.normalize();
    torso.getWorldQuaternion(inverseRotation).invert();
    bendDirection.set(0, 0, 1).applyQuaternion(inverseRotation);
    bendDirection.addScaledVector(armDirection, -bendDirection.dot(armDirection)).normalize();
    elbowPosition.copy(arm.shoulder.position).addScaledVector(armDirection, distance / 2)
      .addScaledVector(bendDirection, Math.sqrt(0.42 ** 2 - (distance / 2) ** 2));
    shoulderRotation.setFromUnitVectors(downDirection, armDirection.subVectors(elbowPosition, arm.shoulder.position).normalize());
    inverseRotation.copy(shoulderRotation).invert();
    armDirection.subVectors(localTarget, elbowPosition).normalize().applyQuaternion(inverseRotation);
    elbowRotation.setFromUnitVectors(downDirection, armDirection);
    arm.shoulder.quaternion.slerp(shoulderRotation, weight); arm.elbow.quaternion.slerp(elbowRotation, weight);
  }

  /** 관절·시선·짧은 눈 깜빡임을 반영한다. 반복 고개 흔들기 없이 호흡만 미세하게 남긴다. */
  function update(pose, elapsedSeconds) {
    const step = Math.sin(elapsedSeconds * 10) * pose.stride;
    character.position.set(pose.characterX, 0, pose.characterZ); character.rotation.y = pose.characterYaw;
    hips.position.y = pose.hipHeight + Math.sin(elapsedSeconds * 1.8) * 0.006 + Math.abs(step) * 0.035;
    torso.rotation.set(pose.bodyPitch - pose.kneeBend * 0.16, pose.torsoYaw, pose.bodyLean);
    head.rotation.set(pose.headTilt, pose.headYaw, -pose.bodyLean * 0.2, 'YXZ');
    const blinkDistance = Math.min(...[0.55, 3.25, 4.23, 10.45].map(time => Math.abs(elapsedSeconds - time)));
    const blink = blinkDistance < 0.095 ? Math.cos(blinkDistance / 0.095 * Math.PI / 2) ** 2 : 0;
    eyeGroups.forEach(eye => { eye.scale.y = 1 - blink * 0.94; });
    pupils.forEach(pupil => { pupil.position.x = pose.eyeYaw * 0.018; pupil.position.y = -0.001 + pose.eyePitch * 0.012; });
    leftArm.shoulder.rotation.set(pose.armReach + step * 0.32, 0, pose.leftArm);
    rightArm.shoulder.rotation.set(pose.armReach - step * 0.32, 0, pose.rightArm);
    leftArm.elbow.rotation.x = -pose.elbowBend; rightArm.elbow.rotation.x = -pose.elbowBend;
    for (const [leg, direction] of [[leftLeg, 1], [rightLeg, -1]]) {
      leg.thigh.rotation.x = -pose.kneeBend * 1.05 + step * 0.32 * direction;
      leg.knee.rotation.x = pose.kneeBend * 2.1 + Math.max(0, -step * direction) * 0.2;
      leg.ankle.rotation.x = -pose.kneeBend * 1.05;
    }
    // 왼쪽 아래 모서리를 축으로 넘어져 바닥 아래로 폴더가 파고들지 않는다.
    folder.position.set(pose.folderX - 1.44, pose.folderY, 0); folder.rotation.z = pose.folderTilt;
    folder.visible = pose.folderVisible;
    folder.scale.setScalar(pose.folderScale); folderFront.rotation.x = 0.035 + pose.paperReveal * 0.48;
    papers.forEach((paper, index) => {
      const spread = (index - 1.5) * 1.05;
      paper.position.set(spread * pose.paperReveal, 1.42 + pose.paperReveal * 1.32, 0.03 + index * 0.028);
      paper.rotation.z = -(index - 1.5) * 0.11 * pose.paperReveal;
      // 날아가는 선택 면과 원래 메시가 겹쳐 잔상처럼 남지 않게 같은 순서로 감춘다.
      paper.visible = pose.presentation <= index * 0.065 + 0.055;
    });
    root.updateMatrixWorld(true);
    if (pose.grip > 0) {
      const tiltAmount = Math.min(1, pose.folderTilt / 1.43);
      gripTargets.forEach((target, index) => {
        // 폴더가 누웠을 때는 윗면을 잡고, 세울수록 왼쪽 면으로 손을 옮긴다.
        target.set(0.2 + index * 0.45 + tiltAmount * 0.8, 0.8 - tiltAmount * 0.5, 0.28);
        folder.localToWorld(target);
        alignArmToGrip(index === 0 ? leftArm : rightArm, target, pose.grip);
      });
      root.updateMatrixWorld(true);
    }
  }

  /** 공유 재질과 중복 지오메트리를 한 번씩만 해제한다. */
  function dispose() {
    const geometries = new Set(); root.traverse(object => { if (object.isMesh) geometries.add(object.geometry); });
    geometries.forEach(geometry => geometry.dispose()); Object.values(materials).forEach(material => material.dispose());
  }
  return { root, character, head, folder, papers, hands: [leftArm.hand, rightArm.hand], gripTargets, update, dispose };
}

/** 인물과 폴더를 모두 담도록 화면비에 맞춰 카메라 거리를 조정한다. */
export function framePortfolioCamera(camera, width, height, pose) {
  camera.aspect = width / Math.max(1, height);
  const reveal = pose.cameraReveal;
  // 얼굴은 처음에 화면을 크게 채우고, 달리기와 함께 인물·폴더 전체가 보이는 원근으로 풀린다.
  const closeDistance = Math.max(1.85, 0.84 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
  const closePosition = new THREE.Vector3(-0.2, 2.28, 3.8 + closeDistance);
  const wideCenterX = (pose.characterX + pose.folderX) * 0.5 + 0.55 - pose.folderTilt * 0.7;
  const widePosition = new THREE.Vector3(wideCenterX, 3.8, Math.max(10.8, 12 / camera.aspect));
  camera.position.copy(closePosition).lerp(widePosition, reveal);
  camera.lookAt(-0.2 + reveal * (wideCenterX + 0.2), 2.23 - reveal * 0.73, 3.8 * (1 - reveal));
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}
