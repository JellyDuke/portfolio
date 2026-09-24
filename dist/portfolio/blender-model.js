// 같은 출처의 인물·소품 GLB를 병렬로 읽고 두 자산이 준비된 뒤 하나의 장면으로 전달한다.
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { disposePortfolioResources } from './scene-model.js';
import { createSkinnedPortfolioModel } from './skinned-model.js';

const MODEL_ASSETS = [
  { url: new URL('../models/portfolio-props-v3.glb', import.meta.url), maxBytes: 2 * 1024 * 1024 },
  { url: new URL('../models/portfolio-character-v3.glb', import.meta.url), maxBytes: 12 * 1024 * 1024 },
];

/** 응답 본문에도 상한을 적용해 잘못된 자산이 과도한 메모리를 차지하지 않게 한다. */
async function readModelAsset({ url, maxBytes }, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Blender 모델 요청 실패: HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Blender 모델 크기 제한 초과');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error('Blender 모델 크기 제한 초과');
  return new GLTFLoader().parseAsync(bytes, url.href);
}

/** 페이지 종료와 시간 초과를 모두 처리하며 모델을 한 번만 가져온다. */
export async function loadBlenderPortfolioModel(signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 20000);
  let results = [];
  try {
    if (signal.aborted) throw new Error('포트폴리오 페이지가 닫혔습니다.');
    results = await Promise.allSettled(MODEL_ASSETS.map(asset => readModelAsset(asset, controller.signal)));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    if (controller.signal.aborted) throw new Error('Blender 모델 읽기가 취소되었습니다.');
    return createSkinnedPortfolioModel(results[0].value, results[1].value);
  } catch (error) {
    for (const result of results) if (result.status === 'fulfilled') disposePortfolioResources(result.value.scene);
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
