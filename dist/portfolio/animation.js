// 초 단위 시간에서 인물·폴더·전면 선택 화면의 자세를 계산한다. 렌더러와 분리해 검증한다.
export const PAPER_FLIGHT_START_SECONDS = 11.85;
export const INTRO_DURATION_SECONDS = 13.6;

const INITIAL_POSE = {
  characterX: -0.2, characterZ: 3.8, characterYaw: 0, hipHeight: 1.04,
  bodyLean: 0, bodyPitch: 0, torsoYaw: 0, headYaw: 0, headTilt: 0, eyeYaw: 0, eyePitch: 0,
  leftArm: 0.08, rightArm: -0.08, armReach: 0, elbowBend: 0.12, kneeBend: 0, stride: 0, grip: 0,
  folderX: 0.8, folderY: 14, folderTilt: -0.08, folderScale: 1,
  cameraReveal: 0, paperReveal: 0, presentation: 0,
};

// 시선이 먼저 움직이고 목·상체가 뒤따른다. 각 시선 사이에 정지 구간을 두어 좌우 진자 운동을 피한다.
const POSE_STEPS = [
  { time: 0, phase: 'closeup' },
  { time: 0.85, headTilt: -0.015 },
  { time: 1.08, phase: 'turning', eyeYaw: 0.65, headYaw: 0.45, torsoYaw: 0.08, characterYaw: 0.65, cameraReveal: 0.08 },
  { time: 1.4, phase: 'running', characterYaw: Math.PI, headYaw: 0, headTilt: 0, torsoYaw: 0, eyeYaw: 0, cameraReveal: 0.2, bodyPitch: 0.18, stride: 1.8 },
  { time: 2.55, characterX: 0, characterZ: -0.9, cameraReveal: 1 },
  { time: 3, phase: 'waiting', characterZ: -1.25, stride: 0, bodyPitch: 0 },
  { time: 3.55, characterYaw: Math.PI * 2 - 0.1, stride: 0.35, eyeYaw: -0.6, headYaw: -0.08 },
  { time: 3.85, phase: 'looking', stride: 0, headYaw: -0.36, torsoYaw: -0.07, eyeYaw: -0.18 },
  { time: 4.05 },
  { time: 4.2, eyeYaw: 0.7 },
  { time: 4.55, headYaw: 0.38, torsoYaw: 0.08, eyeYaw: 0.14, headTilt: -0.025 },
  { time: 4.7 },
  { time: 4.96, headYaw: 0.12, torsoYaw: 0.02, headTilt: -0.25, eyeYaw: 0, eyePitch: 0.5 },
  { time: 5.1, phase: 'falling', characterYaw: Math.PI * 2 + 0.15 },
  { time: 5.45, headYaw: 0.08, headTilt: -0.18, torsoYaw: 0, eyePitch: 0.2 },
  { time: 5.78, folderY: 0, folderTilt: 0.1, characterYaw: 0.25, headTilt: 0.1, eyePitch: 0 },
  { time: 6.2, phase: 'pickup', folderTilt: 1.43, characterX: -0.65, characterZ: 0.1, hipHeight: 0.66, kneeBend: 0.88, bodyLean: -0.16, bodyPitch: 0.1, headYaw: 0, headTilt: 0.14, leftArm: 1.65, rightArm: 1.4, armReach: -0.65, elbowBend: 0.45, grip: 1 },
  { time: 6.7, folderY: 0.08, folderTilt: 1.36, headTilt: 0.05 },
  { time: 7.5, phase: 'lifting', folderY: 0.4, folderTilt: 0.6, folderX: 1.05, characterX: -0.15, hipHeight: 1.04, kneeBend: 0, bodyLean: 0.1, bodyPitch: 0, characterYaw: 0.9, armReach: -1.05 },
  { time: 8.15, phase: 'carrying', folderY: 0.65, folderTilt: 0, folderX: 1.45, characterX: 0.1, stride: 0.9, leftArm: 1.1, rightArm: 1.2 },
  { time: 9.2, folderX: 2.25, characterX: 0.7, characterZ: 0, stride: 0 },
  { time: 9.9, phase: 'placing', folderY: 0, characterX: 0.95, characterZ: 0.4, kneeBend: 0.9, hipHeight: 0.7, bodyLean: 0, headTilt: 0 },
  { time: 10.6, characterX: -0.6, characterZ: 0, characterYaw: 0, kneeBend: 0, hipHeight: 1.04, armReach: 0, elbowBend: 0.12, leftArm: 0.08, rightArm: 0.3, stride: 0.6, headYaw: 0, grip: 0 },
  { time: 11.15, phase: 'opening', characterX: -1.05, stride: 0, headYaw: 0.1 },
  { time: PAPER_FLIGHT_START_SECONDS, phase: 'presenting', paperReveal: 1, headYaw: 0.06 },
  { time: INTRO_DURATION_SECONDS, phase: 'ready', presentation: 1, headYaw: 0 },
];
let previousPose = INITIAL_POSE;
const KEYFRAMES = POSE_STEPS.map(step => { previousPose = { ...previousPose, ...step }; return previousPose; });

/** 속도와 가속도가 양끝에서 0이 되는 보간으로 목과 상체의 꺾임을 줄인다. */
function easePose(progress) { return progress ** 3 * (progress * (progress * 6 - 15) + 10); }

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
  if (time >= 5.1 && time < 5.78) pose.folderY = 14 * (1 - ((time - 5.1) / 0.68) ** 2);
  // 화면 전개는 독립적으로 일정한 시간축을 받아 종이마다 다른 출발 시점을 사용할 수 있다.
  pose.presentation = Math.max(0, Math.min(1, (time - PAPER_FLIGHT_START_SECONDS) / (INTRO_DURATION_SECONDS - PAPER_FLIGHT_START_SECONDS)));
  return pose;
}
