// 폴더의 화면 좌표에서 홀로그램 목록을 펼친다. 배치와 등장 계산은 DOM·WebGL에서 분리한다.
const clamp = value => Math.max(0, Math.min(1, value));
const easeOut = value => 1 - (1 - clamp(value)) ** 3;
const smooth = value => { const progress = clamp(value); return progress * progress * (3 - 2 * progress); };

/** 가로 화면은 폴더 오른쪽 위, 세로 화면은 상단에 읽기 쉬운 한 열 목록을 배치한다. */
export function getHologramLayout(width, height, anchor = null) {
  const isStacked = width / height < 0.9;
  const isCompactLandscape = !isStacked && height < 620;
  const margin = width < 700 ? 16 : 28;
  const panelWidth = Math.min(width - margin * 2, isCompactLandscape ? 300 : 360);
  const headerHeight = height < 740 ? 28 : 32;
  const rowGap = height < 740 ? 6 : 8;
  const rowHeight = height < 620 ? 44 : height < 740 ? 48 : isStacked ? 58 : 52;
  const panelHeight = headerHeight + rowHeight * 4 + rowGap * 3;
  const source = anchor || { x: width * 0.56, y: height * 0.7 };
  const x = isStacked || !anchor ? (width - panelWidth) / 2
    : isCompactLandscape ? width - margin - panelWidth
    : Math.max(margin, Math.min(width - margin - panelWidth, source.x - panelWidth / 2 + 64));
  const preferredTop = !anchor ? (height - panelHeight) / 2
    : isStacked ? Math.max(76, height * 0.105)
    : isCompactLandscape ? (height - panelHeight) / 2
    : Math.min(source.y - 64, (source.top ?? source.y - 48) - 28) - panelHeight;
  const y = Math.max(76, Math.min(height - panelHeight - 20, preferredTop));
  // 가로로 좁은 화면에서는 목록을 옆에 두므로 실제 원점과 연결되지 않는 투영광은 그리지 않는다.
  const projectionHeight = source.x >= x && source.x <= x + panelWidth
    ? Math.max(0, source.y - y - panelHeight) : 0;
  return { x, y, width: panelWidth, height: panelHeight, headerHeight, rowHeight, rowGap, isStacked,
    emitterX: Math.max(0, Math.min(panelWidth, source.x - x)),
    projectionHeight };
}

/** 크기를 확대하지 않고 번호 순서대로 투명도·짧은 이동만 변화시킨다. */
export function getHologramReveal(progress, index) {
  // 처음 350ms는 광원이 먼저 켜지고, 그 뒤에 번호 순서대로 글자와 얇은 표면이 맺힌다.
  const local = progress >= 1 ? 1 : clamp((progress - 0.20 - index * 0.13) / 0.38);
  const eased = easeOut(local);
  return { opacity: smooth(local), translateY: (1 - eased) * 8 };
}

/** 광원 점등 → 투영광 확장 → 목록 생성의 순서를 분리해 화면 전체가 한 번에 켜지지 않게 한다. */
export function getProjectionPhase(progress) {
  return {
    light: smooth(progress / 0.16),
    reach: smooth((progress - 0.04) / 0.22),
    header: smooth((progress - 0.14) / 0.28),
    scan: clamp((progress - 0.18) / 0.8),
  };
}

/** 하나의 시계로 광원·패널·목록을 갱신하며 재생·건너뛰기·리사이즈 시 같은 상태를 재현한다. */
export function createHologramPresentation({ panelElement, containerElement, elements, backdropElement, stageElement }) {
  return {
    update(progress, anchor, width, height) {
      const layout = getHologramLayout(width, height, anchor);
      const phase = getProjectionPhase(progress);
      panelElement.hidden = progress <= 0;
      containerElement.hidden = progress <= 0;
      containerElement.inert = progress < 1;
      containerElement.classList.toggle('is-presented', progress >= 1);
      panelElement.classList.toggle('is-presented', progress >= 1);
      Object.assign(panelElement.style, {
        left: `${layout.x}px`, top: `${layout.y}px`, width: `${layout.width}px`, height: `${layout.height}px`,
        opacity: '1', transform: 'none',
      });
      panelElement.style.setProperty('--hologram-header-height', `${layout.headerHeight}px`);
      panelElement.style.setProperty('--hologram-row-height', `${layout.rowHeight}px`);
      panelElement.style.setProperty('--hologram-row-gap', `${layout.rowGap}px`);
      panelElement.style.setProperty('--header-reveal', String(phase.header));
      panelElement.style.setProperty('--scan-y', `${phase.scan * (layout.height + 24) - 24}px`);
      panelElement.style.setProperty('--scan-opacity', String(Math.sin(phase.scan * Math.PI) * 0.25));
      Object.assign(backdropElement.style, {
        left: `${layout.x}px`, top: `${layout.y + layout.height}px`,
        width: `${layout.width}px`, height: `${layout.projectionHeight}px`, opacity: String(layout.projectionHeight > 0 ? phase.light * 0.65 : 0),
      });
      backdropElement.style.setProperty('--emitter-x', `${layout.emitterX}px`);
      backdropElement.style.setProperty('--projection-reach', String(phase.reach));
      // 광선의 양 끝도 폴더의 실제 투영점과 연결해 리사이즈해도 빛이 허공에서 시작하지 않게 한다.
      for (const [side, endX] of [['left', 12], ['right', layout.width - 12]]) {
        const dx = endX - layout.emitterX;
        backdropElement.style.setProperty(`--${side}-ray-length`, `${Math.hypot(dx, layout.projectionHeight)}px`);
        backdropElement.style.setProperty(`--${side}-ray-angle`, `${Math.atan2(dx, layout.projectionHeight)}rad`);
      }
      // 목록이 나타난 뒤에도 장면을 덮지 않는다. 멈춘 3D 프레임을 배경으로 계속 보여 준다.
      stageElement.style.opacity = '1';
      elements.forEach((element, index) => {
        const row = getHologramReveal(progress, index);
        element.style.opacity = String(row.opacity);
        element.style.transform = `translate3d(0, ${row.translateY}px, 0)`;
        element.style.setProperty('--row-reveal', String(row.opacity));
      });
    },
    /** WebGL이 없어도 같은 네 항목을 화면 중앙에서 선택할 수 있게 한다. */
    showFallback(width, height) { this.update(1, null, width, height); },
  };
}
