// 폴더에서 출발한 네 선택 면을 화면 앞으로 펼친다. 배치·시간 계산은 DOM 및 WebGL과 분리한다.
const clamp = value => Math.max(0, Math.min(1, value));

/** PC는 네 열, 세로 화면은 두 열로 화면 대부분을 채우는 동일한 크기의 선택 면을 만든다. */
export function getPaperDestinations(width, height) {
  const columns = width >= 900 && width / height >= 1.2 ? 4 : 2;
  const rows = 4 / columns;
  const margin = Math.max(16, Math.min(36, width * 0.022));
  const gap = Math.max(10, Math.min(22, width * 0.012));
  const top = Math.max(80, Math.min(104, height * 0.105));
  const sheetWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
  const sheetHeight = (height - top - margin - gap * (rows - 1)) / rows;
  return Array.from({ length: 4 }, (_, index) => ({
    x: margin + (index % columns) * (sheetWidth + gap),
    y: top + Math.floor(index / columns) * (sheetHeight + gap),
    width: sheetWidth, height: sheetHeight,
  }));
}

/** 출발지의 작은 면에서 각 최종 면까지 곡선을 따라 확대한다. 마지막에는 기울기와 잔여 변형을 없앤다. */
export function getPaperFlight(progress, index, origin, destination) {
  if (progress >= 1) return { ...destination, rotate: 0, tilt: 0, numberOpacity: 1, opacity: 1 };
  const local = clamp((progress - index * 0.065) / 0.805);
  const travel = 1 - (1 - local) ** 3;
  const growth = local * local * (3 - 2 * local);
  const arc = local === 0 || local === 1 ? 0 : Math.sin(Math.PI * local);
  const width = origin.width + (destination.width - origin.width) * growth;
  const height = origin.height + (destination.height - origin.height) * growth;
  const originX = origin.x + origin.width / 2, originY = origin.y + origin.height / 2;
  const destinationX = destination.x + destination.width / 2, destinationY = destination.y + destination.height / 2;
  return {
    x: originX + (destinationX - originX) * travel - width / 2,
    y: originY + (destinationY - originY) * travel - height / 2 - arc * Math.min(100, destination.height * 0.2),
    width, height,
    rotate: (origin.rotate || 0) * (1 - travel) + (index - 1.5) * 7 * arc,
    tilt: -22 * arc,
    numberOpacity: clamp((local - 0.16) / 0.36),
    opacity: clamp(local / 0.07),
  };
}

/** 한 시간축으로 네 면·배경·입력 허용을 갱신해 리사이즈와 다시 보기에도 중간 상태가 남지 않게 한다. */
export function createPaperPresentation({ containerElement, elements, backdropElement, stageElement }) {
  return {
    update(progress, origins, width, height) {
      const destinations = getPaperDestinations(width, height);
      const cover = clamp((progress - 0.16) / 0.7);
      backdropElement.style.opacity = String(cover);
      stageElement.style.opacity = String(1 - cover);
      containerElement.hidden = progress <= 0;
      containerElement.inert = progress < 1;
      containerElement.classList.toggle('is-presented', progress >= 1);
      elements.forEach((element, index) => {
        const flight = getPaperFlight(progress, index, origins[index] || destinations[index], destinations[index]);
        Object.assign(element.style, {
          left: `${flight.x}px`, top: `${flight.y}px`, width: `${flight.width}px`, height: `${flight.height}px`,
          transform: `perspective(1200px) rotateX(${flight.tilt}deg) rotateZ(${flight.rotate}deg)`,
          opacity: String(flight.opacity),
          fontSize: `${Math.max(1, Math.min(flight.width * 0.5, flight.height * 0.44, 224))}px`,
        });
        element.style.setProperty('--number-opacity', String(flight.numberOpacity));
      });
    },
    /** 그래픽 오류에서는 날아오는 출발 좌표 없이 완성된 선택 화면을 즉시 제공한다. */
    showFallback(width, height) { this.update(1, [], width, height); },
  };
}
