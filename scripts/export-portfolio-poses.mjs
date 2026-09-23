// 브라우저와 Blender가 같은 연출 시간표를 쓰도록 자세 데이터를 원본 자산 옆에 저장한다.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getPortfolioPose, INTRO_DURATION_SECONDS } from '../frontend/portfolio/animation.js';

const framesPerSecond = 30;
const outputDirectory = new URL('../assets/source/blender/', import.meta.url);
const frames = Array.from({ length: Math.ceil(INTRO_DURATION_SECONDS * framesPerSecond) + 1 }, (_, frame) => ({
  frame: frame + 1,
  seconds: frame / framesPerSecond,
  pose: getPortfolioPose(frame / framesPerSecond),
}));
await mkdir(outputDirectory, { recursive: true });
const outputUrl = new URL('portfolio-poses.json', outputDirectory);
await writeFile(outputUrl, JSON.stringify({ framesPerSecond, frames }));
console.log(`Blender 연출 데이터: ${fileURLToPath(outputUrl)}`);
