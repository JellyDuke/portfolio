// 초 단위 시간에서 인물·폴더·전면 선택 화면의 자세를 계산한다. 렌더러와 분리해 검증한다.
export const PAPER_FLIGHT_START_SECONDS = 11.85;
export const INTRO_DURATION_SECONDS = 13.6;

const INITIAL_POSE = {
  characterX: -0.2, characterZ: 3.8, characterYaw: 0, hipHeight: 0.98, hipDepth: 0,
  bodyLean: 0, bodyPitch: 0, torsoYaw: 0, headYaw: 0, headTilt: 0, eyeYaw: 0, eyePitch: 0,
  leftArm: 0.08, rightArm: -0.08, armReach: 0, elbowBend: 0.12, kneeBend: 0, stride: 0, grip: 0,
  folderX: 0.8, folderY: 8, folderTilt: 0, folderScale: 0.52,
  cameraReveal: 0, folderOpen: 0, paperReveal: 0, presentation: 0,
};

// 시선이 먼저 움직이고 목·상체가 뒤따른다. 각 시선 사이에 정지 구간을 두어 좌우 진자 운동을 피한다.
const POSE_STEPS = [
  { time: 0, phase: 'closeup' },
  { time: 0.85, headTilt: -0.015 },
  { time: 1.08, phase: 'turning', eyeYaw: 0.65, headYaw: 0.45, torsoYaw: 0.08, characterYaw: 0.65, cameraReveal: 0.08 },
  { time: 1.4, phase: 'running', characterYaw: Math.PI, headYaw: 0, headTilt: 0, torsoYaw: 0, eyeYaw: 0, cameraReveal: 0.2, bodyPitch: 0.18, stride: 1.8 },
  { time: 2.55, characterX: 0, characterZ: -0.9, cameraReveal: 1 },
  { time: 3, phase: 'waiting', characterZ: -1.25, stride: 0, bodyPitch: 0 },
  { time: 3.7, characterYaw: Math.PI * 2 - 0.1, stride: 0.35, eyeYaw: -0.6, headYaw: -0.08 },
  { time: 3.85, phase: 'looking', stride: 0, headYaw: -0.36, torsoYaw: -0.07, eyeYaw: -0.18 },
  { time: 4.05 },
  { time: 4.2, eyeYaw: 0.7 },
  { time: 4.55, headYaw: 0.38, torsoYaw: 0.08, eyeYaw: 0.14, headTilt: -0.025 },
  { time: 4.7 },
  { time: 4.96, headYaw: 0.12, torsoYaw: 0.02, headTilt: -0.25, eyeYaw: 0, eyePitch: 0.5 },
  { time: 5.1, phase: 'falling', characterYaw: Math.PI * 2 + 0.15 },
  { time: 5.3, headYaw: 0.08, headTilt: -0.18, torsoYaw: 0, eyePitch: 0.2, stride: 0.55 },
  { time: 5.78, folderY: 0, characterX: 0.35, characterZ: -0.96, characterYaw: 0, headTilt: 0.1, eyePitch: 0 },
  { time: 6.15, phase: 'pickup', characterX: 0.8, characterZ: -0.64, characterYaw: 0, stride: 0, hipHeight: 0.80, hipDepth: -0.12, kneeBend: 0.5, bodyPitch: 0.16, headYaw: 0, headTilt: 0.12, leftArm: 0.15, rightArm: -0.15, armReach: -0.55, elbowBend: 0.3, grip: 0.35 },
  { time: 6.5, grip: 1, hipHeight: 0.76, headTilt: 0.08 },
  { time: 6.75, hipHeight: 0.74, bodyPitch: 0.18 },
  { time: 7.6, phase: 'lifting', folderY: 0.58, hipHeight: 0.98, hipDepth: 0, kneeBend: 0, bodyPitch: -0.035, headTilt: 0 },
  { time: 8.0, phase: 'carrying', bodyPitch: 0, stride: 0.6 },
  { time: 9.2, folderX: 2, characterX: 2, stride: 0 },
  { time: 9.85, phase: 'placing', folderY: 0, hipHeight: 0.76, hipDepth: -0.12, kneeBend: 0.5, bodyPitch: 0.16, headTilt: 0.1 },
  { time: 10.05, grip: 1 },
  { time: 10.3, grip: 0, hipHeight: 0.98, hipDepth: 0, kneeBend: 0, bodyPitch: 0, armReach: 0, elbowBend: 0.12, leftArm: 0.08, rightArm: -0.08, stride: 0.65 },
  { time: 11.0, characterX: 0.75, characterZ: -0.1, stride: 0, headYaw: 0.18, headTilt: 0 },
  { time: 11.25, phase: 'opening', folderOpen: 1 },
  { time: PAPER_FLIGHT_START_SECONDS, phase: 'presenting', paperReveal: 1, headYaw: 0.06 },
  { time: INTRO_DURATION_SECONDS, phase: 'ready', presentation: 1, headYaw: 0 },
];
let previousPose = INITIAL_POSE;
const KEYFRAMES = POSE_STEPS.map(step => { previousPose = { ...previousPose, ...step }; return previousPose; });

/** 속도와 가속도가 양끝에서 0이 되는 보간으로 목과 상체의 꺾임을 줄인다. */
function easePose(progress) { return progress ** 3 * (progress * (progress * 6 - 15) + 10); }

/** 이동 중간에 속도가 과도하게 치솟지 않도록 출발·정지 구간에만 가속을 배분한다. */
function easeTravel(progress) {
  const ramp = 0.2;
  if (progress > 1 - ramp) return 1 - easeTravel(1 - progress);
  if (progress >= ramp) return (progress - ramp / 2) / (1 - ramp);
  return (progress - ramp / Math.PI * Math.sin(Math.PI * progress / ramp)) / (2 * (1 - ramp));
}

/** 뒤돌기·둘러보기·종이 펼치기 자세를 반환한다. 종료 뒤에는 시선을 정면에 두고 반복 흔들기를 하지 않는다. */
export function getPortfolioPose(elapsedSeconds) {
  const time = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const endIndex = KEYFRAMES.findIndex(frame => frame.time > time);
  if (endIndex === -1) return { ...KEYFRAMES.at(-1), folderVisible: true };
  const start = KEYFRAMES[Math.max(0, endIndex - 1)], end = KEYFRAMES[endIndex];
  const progress = (time - start.time) / (end.time - start.time || 1);
  const eased = easePose(progress);
  const pose = { phase: start.phase, folderVisible: time >= 5.1 };
  for (const key of Object.keys(INITIAL_POSE)) {
    const difference = end[key] - start[key];
    const delta = key === 'characterYaw' ? Math.atan2(Math.sin(difference), Math.cos(difference)) : difference;
    pose[key] = start[key] + delta * eased;
  }
  // 카메라 키프레임과 이동 속도를 분리해 달리기 중간에 멈추거나 보폭이 갑자기 커지지 않게 한다.
  if (time >= 0.85 && time <= 1.4) pose.characterYaw = Math.PI * easeTravel((time - 0.85) / 0.55);
  if (time >= 3 && time <= 3.7) pose.characterYaw = Math.PI + (Math.PI - 0.1) * easeTravel((time - 3) / 0.7);
  if (time >= 1.4 && time <= 3) {
    const travel = easeTravel((time - 1.4) / 1.6);
    pose.characterX = -0.2 + 0.2 * travel;
    pose.characterZ = 3.8 - 5.05 * travel;
    pose.stride = 1.4 * (1 - easePose(Math.max(0, (time - 2.68) / 0.32)));
    // 멀어지는 인물의 발이 화면 끝에 걸리지 않도록 달리기 초반에 전신 구도를 확보한다.
    pose.cameraReveal = 0.2 + 0.8 * easePose(Math.min(1, (time - 1.4) / 0.7));
  }
  if (time >= 8 && time <= 9.2) {
    pose.characterX = pose.folderX = 0.8 + 1.2 * easeTravel((time - 8) / 1.2);
  }
  if (time >= 10.3 && time <= 11) {
    const travel = easeTravel((time - 10.3) / 0.7);
    pose.characterX = 2 - 1.25 * travel;
    pose.characterZ = -0.64 + 0.54 * travel;
  }
  if (time >= 5.1 && time < 5.78) pose.folderY = 8 * (1 - ((time - 5.1) / 0.68) ** 2);
  // 충돌 뒤 한 번만 짧게 반동을 주고, 손이 닿은 뒤에는 폴더 크기와 접점을 바꾸지 않는다.
  if (time >= 5.78 && time < 6.03) pose.folderY = Math.sin((time - 5.78) / 0.25 * Math.PI) * 0.07;
  // 화면 전개는 독립적으로 일정한 시간축을 받아 종이마다 다른 출발 시점을 사용할 수 있다.
  pose.presentation = Math.max(0, Math.min(1, (time - PAPER_FLIGHT_START_SECONDS) / (INTRO_DURATION_SECONDS - PAPER_FLIGHT_START_SECONDS)));
  return pose;
}

// 시작·종료·발수·선행 발·발 들기 높이·옆걸음 여부를 한 곳에 둔다.
const FOOT_TRAVELS = [
  [0.85, 1.4, 2, 1, 0.07, false], [1.4, 3, 6, -1, 0.20, false],
  [3, 3.7, 2, -1, 0.07, false], [5.3, 6.15, 4, 1, 0.08, true],
  [8, 9.2, 6, 1, 0.08, true], [10.3, 11, 4, -1, 0.09, true],
];

/** 신체 중심과 방향으로 기본 디딤 위치를 구한다. 실제 고정점은 이동 계획에서 한 번만 확정한다. */
function getFootAnchor(seconds, side) {
  const pose = getPortfolioPose(seconds), yaw = pose.characterYaw;
  return { x: pose.characterX + side * 0.20 * Math.cos(yaw) + 0.10 * Math.sin(yaw),
    y: 0.042, z: pose.characterZ - side * 0.20 * Math.sin(yaw) + 0.10 * Math.cos(yaw), yaw };
}

/** 양발 계획을 함께 계산해 뒤따르는 발이 먼저 디딘 발을 추월하는 교차 보행을 막는다. */
function planFootContacts() {
  const planted = { '-1': getFootAnchor(0, -1), 1: getFootAnchor(0, 1) }, contacts = [];
  for (const [start, end, count, firstSide, height, isLateral] of FOOT_TRAVELS) {
    const duration = (end - start) / count;
    for (let step = 0; step < count; step += 1) {
      const side = step % 2 === 0 ? firstSide : -firstSide;
      const lift = start + duration * step, land = lift + duration;
      const anchorTime = isLateral && step === count - 2 ? end : Math.min(end, land + duration * 0.4);
      const next = getFootAnchor(anchorTime, side);
      if (isLateral && side !== firstSide) {
        // 옆걸음은 벌리고 모으는 순서로 진행한다. 두 발 사이의 최소 폭은 34cm다.
        next.x = firstSide > 0 ? Math.min(next.x, planted[firstSide].x - 0.34) : Math.max(next.x, planted[firstSide].x + 0.34);
      }
      contacts.push({ side, lift, land, height, from: planted[side], to: next });
      planted[side] = next;
    }
  }
  return contacts;
}
const FOOT_CONTACTS = planFootContacts();

/** 발 디딤 위치를 월드 좌표에 고정한다. 정지·쪼그림 동안 골반만 움직여 미끄러짐을 막는다. */
export function getPortfolioFootPlacement(time, side) {
  let planted = getFootAnchor(0, side);
  for (const { side: contactSide, lift, land, height, to: next } of FOOT_CONTACTS) {
    if (contactSide !== side) continue;
    if (time < lift) return planted;
    if (time >= land) { planted = next; continue; }
    const progress = (time - lift) / (land - lift), eased = easePose(progress);
    const yawDelta = Math.atan2(Math.sin(next.yaw - planted.yaw), Math.cos(next.yaw - planted.yaw));
    return { x: planted.x + (next.x - planted.x) * eased, z: planted.z + (next.z - planted.z) * eased,
      y: 0.042 + Math.sin(Math.PI * progress) ** 2 * height, yaw: planted.yaw + yawDelta * eased,
      pitch: height >= 0.20 ? Math.sin(Math.PI * 2 * progress) * 0.30 : 0 };
  }
  return planted;
}

/** 종이는 폴더 입구에서만 짧게 드러나고, 광원이 켜지는 동안 부드럽게 사라진다. */
export function getPortfolioPaperPose(pose, index) {
  const progress = Math.max(0, Math.min(1, (pose.paperReveal - index * 0.13) / 0.61));
  const lift = easePose(progress), fan = easePose(Math.max(0, (progress - 0.55) / 0.45));
  const opacity = 1 - easePose(Math.max(0, Math.min(1, pose.presentation / 0.24)));
  return { x: (index - 1.5) * (0.035 + 0.10 * fan), y: 1.22 + lift * 0.62,
    z: -0.015 + index * 0.022 + fan * 0.04, rotate: -(index - 1.5) * 0.035 * fan,
    bend: Math.sin(progress * Math.PI) * 0.06, opacity,
    visible: pose.folderVisible && pose.folderOpen > 0.35 && opacity > 0.001 };
}
