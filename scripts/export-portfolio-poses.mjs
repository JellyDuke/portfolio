// 웹의 연출 시간표를 Blender 원본의 키프레임 입력으로 저장한다.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getPortfolioPose, getPortfolioPaperPose, getPortfolioFootPlacement, INTRO_DURATION_SECONDS } from '../frontend/portfolio/animation.js';

const framesPerSecond = 30;
const outputDirectory = new URL('../assets/source/blender/', import.meta.url);
const frames = Array.from({ length: Math.ceil(INTRO_DURATION_SECONDS * framesPerSecond) + 1 }, (_, index) => ({
  frame: index + 1,
  seconds: index / framesPerSecond,
  pose: getPortfolioPose(index / framesPerSecond),
  feet: [-1, 1].map(side => getPortfolioFootPlacement(index / framesPerSecond, side)),
}));
// Blender도 웹 IK의 실제 결과를 사용한다. 별도 파이썬 모션 복제에서 생기는 접점 오차를 없앤다.
if (process.argv.includes('--rig')) {
  const { GLTFLoader } = await import('../assets/vendor/GLTFLoader.js');
  const moduleUrl = new URL('../frontend/portfolio/scene-model.js', import.meta.url);
  const moduleSource = (await readFile(moduleUrl, 'utf8'))
    .replace("'../vendor/three.module.js'", JSON.stringify(new URL('../assets/vendor/three.module.js', import.meta.url).href))
    .replace("'./animation.js'", JSON.stringify(new URL('../frontend/portfolio/animation.js', import.meta.url).href));
  const { createPortfolioModel } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
  const binary = await readFile(new URL('../assets/models/portfolio-scene-v2.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength), '');
  const model = createPortfolioModel(gltf.scene);
  for (const sample of frames) {
    model.update(sample.pose, sample.seconds);
    model.root.updateMatrixWorld(true);
    sample.joints = {};
    model.root.traverse(object => {
      if (object.isMesh || !object.name || object.name === 'portfolio_root') return;
      sample.joints[object.name] = { position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray(), visible: object.visible };
    });
    sample.paperBends = model.papers.map((paper, index) => getPortfolioPaperPose(sample.pose, index).bend);
    sample.contacts = model.hands.map((hand, index) => ({ hand: hand.getWorldPosition(hand.position.clone()).toArray(), target: model.gripTargets[index].toArray() }));
  }
  model.dispose();
}
await mkdir(outputDirectory, { recursive: true });
const outputUrl = new URL('portfolio-poses.json', outputDirectory);
await writeFile(outputUrl, JSON.stringify({ framesPerSecond, frames }));
console.log(`Blender 자세 데이터: ${fileURLToPath(outputUrl)}`);
