// Blender GLB 관절을 기존 시간표에 연결한다. 파일 로드 실패 시 같은 구조의 간단한 모델을 사용한다.
import * as THREE from '../vendor/three.module.js';
import { getPortfolioFootPlacement, getPortfolioPaperPose } from './animation.js';

/** 모델 로딩 실패와 페이지 종료에서 공유 지오메트리·재질·텍스처를 한 번씩 해제한다. */
export function disposePortfolioResources(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
}

/** GLB를 읽지 못했을 때도 포트폴리오 링크를 열 수 있는 기본 관절과 형상을 만든다. */
function createProceduralPortfolioRig() {
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
    const shoulder = new THREE.Group(); shoulder.position.set(direction * 0.38, 0.71, 0); torso.add(shoulder);
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
  const folderBody = new THREE.Group(); folderBody.position.x = 1.44; folder.add(folderBody);

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
      // 두꺼운 상자 대신 얇고 살짝 휘어진 표면을 사용한다. 홀로그램 목록은 별도 HTML 링크가 이어받는다.
    const geometry = new THREE.PlaneGeometry(1.24, 1.75, 10, 16);
    const positions = geometry.attributes.position;
    for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
      const x = positions.getX(vertexIndex), y = positions.getY(vertexIndex);
      positions.setZ(vertexIndex, 0.012 * (y / 0.875) ** 2 + 0.004 * Math.cos(x * Math.PI / 1.24));
    }
    geometry.computeVertexNormals();
    addMesh(paper, geometry, materials.paper);
    papers.push(paper);
  }
  const folderFront = new THREE.Group(); folderFront.position.set(0, 0.025, 0.2); folderBody.add(folderFront);
  addMesh(folderFront, createFolderPanel(false), materials.folder);

  return { root, character, hips, torso, head, eyeGroups, pupils, leftArm, rightArm, leftLeg, rightLeg, folder, folderFront, papers };
}

/** Blender에서 내보낸 이름 있는 피벗을 검사해 기존 연출의 관절 계약에 매핑한다. */
function bindBlenderPortfolioRig(root) {
  function requireJoint(name) {
    const target = root.getObjectByName(name);
    if (!target) throw new Error(`Blender 포트폴리오 관절 누락: ${name}`);
    return target;
  }
  root.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  const arm = side => ({ shoulder: requireJoint(`shoulder_${side}`), elbow: requireJoint(`elbow_${side}`), hand: requireJoint(`hand_${side}`) });
  const leg = side => ({ thigh: requireJoint(`thigh_${side}`), knee: requireJoint(`knee_${side}`), ankle: requireJoint(`ankle_${side}`) });
  return {
    root, character: requireJoint('character'), hips: requireJoint('hips'), torso: requireJoint('torso'), head: requireJoint('head'),
    eyeGroups: [requireJoint('eye_left'), requireJoint('eye_right')],
    pupils: [requireJoint('pupil_left'), requireJoint('pupil_right')],
    leftArm: arm('left'), rightArm: arm('right'), leftLeg: leg('left'), rightLeg: leg('right'),
    folder: requireJoint('folder'), folderFront: requireJoint('folder_front'),
    papers: Array.from({ length: 4 }, (_, index) => requireJoint(`paper_${index}`)),
  };
}

/** 웹과 Blender가 공유하는 피벗에 기존 동작을 적용하고 GPU 자원을 한 번씩 해제한다. */
export function createPortfolioModel(blenderRoot = null) {
  const {
    root, character, hips, torso, head, eyeGroups, pupils, leftArm, rightArm, leftLeg, rightLeg, folder, folderFront, papers,
  } = blenderRoot ? bindBlenderPortfolioRig(blenderRoot) : createProceduralPortfolioRig();

  const gripTargets = [new THREE.Vector3(), new THREE.Vector3()];
  const armDirection = new THREE.Vector3(), elbowPosition = new THREE.Vector3(), bendDirection = new THREE.Vector3();
  const downDirection = new THREE.Vector3(0, -1, 0), localTarget = new THREE.Vector3();
  const shoulderRotation = new THREE.Quaternion(), elbowRotation = new THREE.Quaternion(), inverseRotation = new THREE.Quaternion();
  const worldRotation = new THREE.Quaternion(), gripRotation = new THREE.Quaternion(), contactPosition = new THREE.Vector3();
  const wristEuler = new THREE.Euler(), folderBody = folderFront.parent;
  const feet = [leftLeg, rightLeg];
  const fingerGroups = ['left', 'right'].map(side => root.getObjectByName(`fingers_${side}`));
  const paperSurfaces = papers.map(paper => {
    const mesh = paper.children.find(child => child.isMesh);
    if (!mesh) return null;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // 같은 종이 재질은 함께 사라진다. 깊이 기록을 꺼 얇은 겹침이 검게 번지는 것을 막는다.
    materials.forEach(material => { material.transparent = true; material.depthWrite = false; });
    mesh.castShadow = false;
    return { mesh, materials, rest: mesh.geometry.attributes.position.array.slice(), bend: -1 };
  });

  /** 관절 길이와 좌우 굽힘 방향을 보존하는 두 뼈 IK. 매 프레임 초기 자세에서 계산한다. */
  function alignLimb(parent, upper, lower, target, pole, upperLength, lowerLength, weight = 1) {
    localTarget.copy(target); parent.worldToLocal(localTarget);
    armDirection.subVectors(localTarget, upper.position);
    const distance = Math.min(upperLength + lowerLength - 0.001, Math.max(0.02, armDirection.length()));
    armDirection.normalize();
    bendDirection.set(...pole);
    bendDirection.addScaledVector(armDirection, -bendDirection.dot(armDirection)).normalize();
    const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
    elbowPosition.copy(upper.position).addScaledVector(armDirection, along)
      .addScaledVector(bendDirection, Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)));
    shoulderRotation.setFromUnitVectors(downDirection, armDirection.subVectors(elbowPosition, upper.position).normalize());
    inverseRotation.copy(shoulderRotation).invert();
    armDirection.subVectors(localTarget, elbowPosition).normalize().applyQuaternion(inverseRotation);
    elbowRotation.setFromUnitVectors(downDirection, armDirection);
    upper.quaternion.slerp(shoulderRotation, weight); lower.quaternion.slerp(elbowRotation, weight);
  }

  /** 관절·시선·짧은 눈 깜빡임을 반영한다. 반복 고개 흔들기 없이 호흡만 미세하게 남긴다. */
  function update(pose, elapsedSeconds) {
    const step = Math.sin(elapsedSeconds * 10) * pose.stride;
    character.position.set(pose.characterX, 0, pose.characterZ); character.rotation.y = pose.characterYaw;
    hips.position.set(0, pose.hipHeight + Math.sin(elapsedSeconds * 1.8) * 0.004 * (1 - pose.grip), pose.hipDepth);
    torso.rotation.set(pose.bodyPitch, pose.torsoYaw, pose.bodyLean);
    head.rotation.set(pose.headTilt, pose.headYaw, -pose.bodyLean * 0.2, 'YXZ');
    const blinkDistance = Math.min(...[0.55, 3.25, 4.23, 10.45].map(time => Math.abs(elapsedSeconds - time)));
    const blink = blinkDistance < 0.095 ? Math.cos(blinkDistance / 0.095 * Math.PI / 2) ** 2 : 0;
    eyeGroups.forEach(eye => { eye.scale.y = 1 - blink * 0.94; });
    pupils.forEach(pupil => { pupil.position.x = pose.eyeYaw * 0.018; pupil.position.y = -0.001 + pose.eyePitch * 0.012; });
    leftArm.shoulder.rotation.set(pose.armReach + step * 0.32, 0, pose.leftArm);
    rightArm.shoulder.rotation.set(pose.armReach - step * 0.32, 0, pose.rightArm);
    leftArm.elbow.rotation.set(-pose.elbowBend, 0, 0); rightArm.elbow.rotation.set(-pose.elbowBend, 0, 0);
    leftArm.hand.rotation.set(0, 0, 0); rightArm.hand.rotation.set(0, 0, 0);
    const footPlacements = [-1, 1].map(side => getPortfolioFootPlacement(elapsedSeconds, side));
    root.updateMatrixWorld(true);
    // 발을 끌어올리는 대신 골반을 조금 낮춰 다리 길이 안에서 디딤점을 유지한다.
    feet.forEach((leg, index) => {
      const foot = footPlacements[index]; leg.thigh.getWorldPosition(contactPosition);
      const horizontalSquared = (contactPosition.x - foot.x) ** 2 + (contactPosition.z - foot.z) ** 2;
      hips.position.y = Math.min(hips.position.y, foot.y + Math.sqrt(Math.max(0.20, 0.865 ** 2 - horizontalSquared)) + 0.08);
    });
    root.updateMatrixWorld(true);
    feet.forEach((leg, index) => {
      const foot = footPlacements[index]; contactPosition.set(foot.x, foot.y, foot.z);
      leg.thigh.rotation.set(0, 0, 0); leg.knee.rotation.set(0, 0, 0);
      alignLimb(hips, leg.thigh, leg.knee, contactPosition, [0, 0, 1], 0.44, 0.43);
      root.updateMatrixWorld(true);
      leg.knee.getWorldQuaternion(inverseRotation).invert();
      worldRotation.setFromEuler(wristEuler.set(0, foot.yaw, 0));
      leg.ankle.quaternion.copy(inverseRotation).multiply(worldRotation);
    });
    folder.position.set(pose.folderX - 1.44 * pose.folderScale, pose.folderY, 0); folder.rotation.z = pose.folderTilt;
    folder.visible = pose.folderVisible;
    folder.scale.setScalar(pose.folderScale); folderFront.rotation.x = pose.folderOpen * 0.48;
    papers.forEach((paper, index) => {
      const sheet = getPortfolioPaperPose(pose, index);
      paper.position.set(sheet.x, sheet.y, sheet.z); paper.rotation.z = sheet.rotate; paper.visible = sheet.visible;
      const surface = paperSurfaces[index];
      if (!surface) return;
      surface.materials.forEach(material => { material.opacity = sheet.opacity; });
      if (surface.bend === sheet.bend) return;
      surface.bend = sheet.bend;
      const positions = surface.mesh.geometry.attributes.position;
      for (let vertex = 0; vertex < positions.count; vertex += 1) {
        const y = surface.rest[vertex * 3 + 1];
        positions.setZ(vertex, surface.rest[vertex * 3 + 2] + sheet.bend * ((y + 0.875) / 1.75) ** 2);
      }
      positions.needsUpdate = true; surface.mesh.geometry.computeVertexNormals();
    });
    root.updateMatrixWorld(true);
    if (pose.grip > 0) {
      gripTargets.forEach((target, index) => {
        const side = index === 0 ? -1 : 1, arm = index === 0 ? leftArm : rightArm;
        target.set(side * 1.62, 2.08, -0.30); folderBody.localToWorld(target);
        const weight = index === 0 ? pose.grip : THREE.MathUtils.smoothstep(pose.grip, 0.12, 1);
        alignLimb(torso, arm.shoulder, arm.elbow, target, [side * 0.8, -0.6, -0.2], 0.42, 0.42, weight);
        root.updateMatrixWorld(true);
        folderBody.getWorldQuaternion(gripRotation);
        worldRotation.setFromEuler(wristEuler.set(-0.25, 0, -side * Math.PI / 2)); gripRotation.multiply(worldRotation);
        arm.elbow.getWorldQuaternion(inverseRotation).invert();
        arm.hand.quaternion.slerp(inverseRotation.multiply(gripRotation), weight);
      });
      root.updateMatrixWorld(true);
    }
    fingerGroups.forEach(fingers => { if (fingers) fingers.rotation.x = -0.65 * pose.grip; });
  }

  /** 두 모델 경로 모두에서 공유 재질과 중복 지오메트리를 한 번씩만 해제한다. */
  function dispose() {
    disposePortfolioResources(root);
  }
  return { root, character, head, folder, papers, hands: [leftArm.hand, rightArm.hand], feet: feet.map(leg => leg.ankle), gripTargets, update, dispose };
}

/** 인물과 폴더를 모두 담도록 화면비에 맞춰 카메라 거리를 조정한다. */
export function framePortfolioCamera(camera, width, height, pose) {
  camera.aspect = width / Math.max(1, height);
  const reveal = pose.cameraReveal;
  // 얼굴은 처음에 화면을 크게 채우고, 달리기와 함께 인물·폴더 전체가 보이는 원근으로 풀린다.
  const closeDistance = Math.max(1.85, 0.84 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
  const closePosition = new THREE.Vector3(-0.2, 2.28, 3.8 + closeDistance);
  // 폴더가 열리는 동안 먼저 목록 자리를 확보해 등장 중 얼굴이 패널 뒤로 가려지지 않게 한다.
  const presentation = THREE.MathUtils.smoothstep(pose.folderOpen * 0.25 + pose.paperReveal * 0.75, 0, 1);
  const isStacked = camera.aspect < 0.9;
  const wideCenterX = (pose.characterX + pose.folderX) * 0.5 + (isStacked ? 0 : presentation * 0.5);
  // 세로 화면에서는 좌우 여백만 확보해 인물이 지나치게 작아지지 않도록 한다.
  const distance = Math.max(7.8, 5.6 / camera.aspect);
  // PC의 화면 높이만 커졌다고 모델이 비대해지지 않게 최종 전신 크기를 제한한다.
  const finalDistance = isStacked ? Math.max(distance, 10.8) : distance * Math.max(1, height / 820);
  const widePosition = new THREE.Vector3(wideCenterX, 3.3, distance + (finalDistance - distance) * presentation);
  camera.position.copy(closePosition).lerp(widePosition, reveal);
  // 목록의 자리를 만들되 인물과 폴더는 계속 화면 안에 남긴다. 세로 화면에서는 장면이 목록 아래로 내려간다.
  const listClearance = isStacked ? (height < 740 ? 1.52 : 1.4) : -0.1;
  camera.lookAt(-0.2 + reveal * (wideCenterX + 0.2), 2.23 - reveal * 0.73 + presentation * listClearance, 3.8 * (1 - reveal));
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}
