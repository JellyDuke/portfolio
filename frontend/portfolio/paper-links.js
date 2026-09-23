// 전면 선택 화면의 실제 HTML 링크를 관리한다. 미정 항목에는 가짜 목적지를 만들지 않는다.

/** 안전한 웹 주소와 같은 사이트의 다운로드 경로만 링크로 구성한다. */
export function resolveProjectAction(project, baseUrl) {
  if (!project.href) return null;
  try {
    const destination = new URL(project.href, baseUrl);
    const origin = new URL(baseUrl).origin;
    if (!['https:', 'http:'].includes(destination.protocol)) return null;
    if (project.kind === 'download' && destination.origin !== origin) return null;
    return { href: destination.href, download: project.kind === 'download', external: destination.origin !== origin };
  } catch { return null; }
}

/** 화면에는 큰 번호만, 보조기술에는 작품명·연결 상태를 제공한다. 면의 전개는 별도 모듈이 맡는다. */
export function createPaperLinks({ containerElement, projects, baseUrl, onActiveChange = () => {} }) {
  const document = containerElement.ownerDocument;
  const abortController = new document.defaultView.AbortController();
  const eventOptions = { signal: abortController.signal };
  containerElement.replaceChildren();
  let pointerIndex = -1, focusIndex = -1;
  const updateActive = () => {
    const activeIndex = focusIndex >= 0 ? focusIndex : pointerIndex;
    elements.forEach((element, index) => element.classList.toggle('is-active', index === activeIndex));
    onActiveChange(activeIndex);
  };
  const elements = projects.map((project, index) => {
    const action = resolveProjectAction(project, baseUrl);
    const element = document.createElement(action ? 'a' : 'button');
    element.className = 'paper-link';
    const numberElement = document.createElement('span');
    numberElement.className = 'paper-number'; numberElement.textContent = String(index + 1);
    numberElement.setAttribute('aria-hidden', 'true'); element.append(numberElement);
    const actionLabel = action ? (action.download ? '다운로드' : action.external ? '새 탭에서 열기' : '열기') : '준비 중';
    element.setAttribute('aria-label', `${index + 1}. ${project.title}, ${actionLabel}`);
    if (action) {
      element.href = action.href;
      if (action.download) element.setAttribute('download', project.downloadName || '');
      else if (action.external) { element.target = '_blank'; element.rel = 'noopener noreferrer'; }
    } else {
      element.type = 'button';
      element.setAttribute('aria-disabled', 'true');
      // 준비 중인 종이도 키보드로 살펴볼 수 있지만 클릭·Enter는 이동을 일으키지 않는다.
      element.addEventListener('click', event => event.preventDefault(), eventOptions);
    }
    element.addEventListener('pointerenter', () => { pointerIndex = index; updateActive(); }, eventOptions);
    element.addEventListener('pointerleave', () => { pointerIndex = -1; updateActive(); }, eventOptions);
    element.addEventListener('focus', () => { focusIndex = index; updateActive(); }, eventOptions);
    element.addEventListener('blur', () => { focusIndex = -1; updateActive(); }, eventOptions);
    containerElement.append(element);
    return element;
  });
  return {
    elements,
    /** 종이가 펼쳐진 뒤에만 링크를 노출해 보이지 않는 클릭 영역을 없앤다. */
    setReady(isReady) {
      containerElement.hidden = !isReady;
      if (!isReady) { pointerIndex = -1; focusIndex = -1; updateActive(); }
    },
    dispose() { abortController.abort(); },
  };
}
