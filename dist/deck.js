(() => {
  const gsap = window.gsap;
  if (!gsap) return; // The complete document remains readable without the motion library.
  const root = document.documentElement;
  const main = document.querySelector('#main');
  const hero = document.querySelector('#home');
  const cards = [hero, ...document.querySelectorAll('.chapter')];
  const menu = document.querySelector('#site-nav');
  const menuButton = document.querySelector('.menu-button');
  const controls = document.querySelector('.deck-controls');
  const previousButton = document.querySelector('.previous-chapter');
  const nextButton = document.querySelector('.next-chapter');
  const dialog = document.querySelector('.content-dialog');
  const dialogContent = document.querySelector('.dialog-content');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const heroPanels = [...document.querySelectorAll('[data-story-panel]')];
  const heroButtons = [...document.querySelectorAll('[data-story-go]')];
  const heroState = { position: 0 };
  const colors = ['#fbfcff', '#f6f8fd', '#f3f7fc'];
  const sceneColors = ['#e8eef8', '#eceefa', '#e2edf2'];
  const names = ['첫 소개', '함께 일하는 방식', '경력', '경험과 활용', '프로젝트', '학력·자격', '연락처'];
  let active = 0, moving = false, transition = null, heroChoice = 0, heroTransition = null;
  let heroProgress = null, entranceComplete = false, wheelTimer = 0, wheelConsumed = false, wheelDirection = 0, touch = null;
  let lastDialogFocus = null;
  const heroLayout = document.querySelector('.story-layout');
  hero.replaceChildren(heroLayout);
  main.replaceChildren(...cards);
  main.classList.add('deck-stage');
  const dotButtons = [];

  cards.forEach((card, i) => {
    card.classList.add('section-card');
    card.setAttribute('tabindex', '-1');
    card.dataset.cardIndex = String(i);
    const content = document.createElement('div');
    content.className = 'card-content';
    const flow = i === 0 ? heroLayout : document.createElement('div');
    flow.classList.add('card-flow');
    if (i !== 0) flow.append(...card.childNodes);
    content.append(flow);
    card.replaceChildren(content);
    const dot = document.createElement('button');
    dot.type = 'button'; dot.setAttribute('aria-label', `${i + 1}. ${names[i]}`);
    dot.innerHTML = `<span aria-hidden="true"></span><span class="deck-tooltip" aria-hidden="true">${names[i]}</span>`;
    dot.addEventListener('click', () => navigate(i, { focus: true, force: true }));
    document.querySelector('.deck-dots').append(dot); dotButtons.push(dot);
    const selector = i === 0
      ? '.identity, .story-panels, .hero-actions, .story-visual, .story-bottom'
      : '.section-heading, .section-label, .about-body, .about-values > li, .experience-item, .skills-visual, .skill-row, .depth-card, .education-column, .training, .contact-row';
    card.querySelectorAll(selector).forEach(element => element.setAttribute('data-reveal', ''));
  });
  document.querySelector('#contact .card-flow').append(document.querySelector('.site-footer'));
  document.querySelector('.story-select').hidden = false;
  const spinButton = document.createElement('button');
  spinButton.type = 'button'; spinButton.className = 'scene-turn'; spinButton.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-turn"/></svg> 360° 둘러보기';
  spinButton.setAttribute('aria-label', '웹·AI·CCTV 3D 오브젝트 한 바퀴 돌려보기');
  spinButton.addEventListener('click', () => document.dispatchEvent(new CustomEvent('portfolio:spin')));
  document.querySelector('.story-visual').append(spinButton);

  // On phones, choose an employer without making the entire section scroll first.
  const jobs = [...document.querySelectorAll('.experience-item')];
  const jobTabs = document.createElement('div');
  jobTabs.className = 'job-tabs'; jobTabs.setAttribute('role', 'group'); jobTabs.setAttribute('aria-label', '경력 선택');
  const jobNames = ['한국기술통신', '파인이텍', '블렌딩'];
  jobs.forEach((job, i) => {
    job.id = `job-${i}`; job.classList.toggle('job-active', i === 0);
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = jobNames[i];
    button.setAttribute('aria-controls', job.id); button.setAttribute('aria-pressed', String(i === 0));
    button.addEventListener('click', () => {
      if (job.classList.contains('job-active')) return;
      gsap.killTweensOf(jobs);
      gsap.set(jobs, { clearProps: 'opacity,transform' });
      jobs.forEach((item, j) => item.classList.toggle('job-active', j === i));
      [...jobTabs.children].forEach((item, j) => item.setAttribute('aria-pressed', String(j === i)));
      gsap.fromTo(job, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .4, clearProps: 'opacity,transform' });
    });
    jobTabs.append(button);
  });
  document.querySelector('.experience-list').before(jobTabs);

  function closeMenu() {
    menu.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', '메뉴 열기');
  }
  menu.addEventListener('focusout', event => {
    if (event.relatedTarget && !event.relatedTarget.closest?.('.site-header')) closeMenu();
  });
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menu.classList.toggle('open', open); menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  });
  function publishMotion() {
    document.dispatchEvent(new CustomEvent('portfolio:motion', {
      detail: { position: heroState.position, chapter: cards[active].id, moving },
    }));
  }
  function updateNavigation(announce = false) {
    root.dataset.activeSection = cards[active].id;
    document.querySelector('.chapter-count').textContent = `${String(active + 1).padStart(2, '0')} / 07`;
    document.querySelector('.chapter-current').textContent = names[active];
    document.querySelector('.chapter-next').textContent = active < cards.length - 1 ? `다음 · ${names[active+1]}` : '';
    nextButton.setAttribute('aria-label', active < cards.length-1 ? `다음 섹션: ${names[active+1]}` : '마지막 섹션');
    previousButton.setAttribute('aria-label', active ? `이전 섹션: ${names[active-1]}` : '첫 섹션');
    previousButton.disabled = active === 0; nextButton.disabled = active === cards.length - 1;
    dotButtons.forEach((button, i) => {
      if (i === active) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
    menu.querySelectorAll('a').forEach(link => {
      if (link.getAttribute('href') === `#${cards[active].id}`) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    });
    gsap.to('.reading-progress > span', { scaleX: (active + 1) / cards.length, duration: .5 });
    if (announce) document.querySelector('.deck-announcement').textContent = `${active + 1} / 7, ${names[active]}`;
  }
  function reveal(card, timeline, position = .16) {
    if (card.id === 'contact') {
      // Contact methods and supporting information share the same quiet entrance.
      timeline.fromTo(card.querySelector('.contact-intro'),
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: .5, ease: 'power2.out', clearProps: 'opacity,transform' }, position);
      timeline.fromTo(card.querySelectorAll('.contact-row'),
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: .4, stagger: .06, ease: 'power2.out', clearProps: 'opacity,transform' }, position + .12);
      return;
    }
    if (card.id === 'about') {
      // Reveal the statement as one surface; keep its reading position stable.
      const intro = card.querySelector('.about-intro');
      const copy = card.querySelector('.about-body');
      const values = card.querySelectorAll('.about-values > li');
      timeline.fromTo(intro,
        { clipPath: 'inset(0 100% 0 0 round 18px)' },
        { clipPath: 'inset(0 0% 0 0 round 18px)', duration: .62, ease: 'power3.out', clearProps: 'clipPath' }, position);
      timeline.fromTo(copy,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: .5, ease: 'power2.out', clearProps: 'opacity,transform' }, position + .14);
      timeline.fromTo(values,
        { opacity: 0, x: 28 },
        { opacity: 1, x: 0, duration: .5, stagger: .1, ease: 'power2.out', clearProps: 'opacity,transform' }, position + .1);
      return;
    }
    if (card.id === 'experience') {
      const visibleJobs = [...card.querySelectorAll('.experience-item')]
        .filter(job => window.innerWidth > 850 || job.classList.contains('job-active'));
      timeline.fromTo(card.querySelector('.section-heading'),
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: .5, ease: 'power3.out', clearProps: 'opacity,transform' }, position);
      timeline.fromTo(visibleJobs,
        { opacity: 0, x: 32 },
        { opacity: 1, x: 0, duration: .6, stagger: .1, ease: 'power3.out', clearProps: 'opacity,transform' }, position + .08);
      return;
    }
    if (card.id === 'skills') {
      timeline.fromTo(card.querySelector('.section-heading'),
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: .45, ease: 'power3.out', clearProps: 'opacity,transform' }, position);
      timeline.fromTo(card.querySelector('.skills-visual'),
        { opacity: 0, scale: .94 },
        { opacity: 1, scale: 1, duration: .7, ease: 'power3.out', clearProps: 'opacity,transform' }, position);
      timeline.fromTo(card.querySelectorAll('.skill-row'),
        { opacity: 0, x: 22 },
        { opacity: 1, x: 0, duration: .48, stagger: .06, ease: 'power3.out', clearProps: 'opacity,transform' }, position + .1);
      return;
    }
    if (card.id === 'projects') {
      timeline.fromTo(card.querySelector('.section-heading'),
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: .45, ease: 'power3.out', clearProps: 'opacity,transform' }, position);
      timeline.fromTo(card.querySelectorAll('.project-card'),
        { opacity: 0, y: 42, rotationX: 4, transformPerspective: 1200 },
        { opacity: 1, y: 0, rotationX: 0, duration: .7, stagger: .12, ease: 'power3.out', clearProps: 'opacity,transform' }, position + .08);
      return;
    }
    if (card.id === 'education') {
      timeline.fromTo(card.querySelectorAll('.section-heading, .education-column, .training'),
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: .5, stagger: .08, ease: 'power3.out', clearProps: 'opacity,transform' }, position);
      return;
    }
    const elements = [...card.querySelectorAll('[data-reveal]')].filter(element => !element.closest('.experience-item') || window.innerWidth > 850 || element.classList.contains('job-active'));
    timeline.fromTo(elements,
      { opacity: 0, y: 30, rotationX: 7, transformPerspective: 1000 },
      { opacity: 1, y: 0, rotationX: 0, duration: .56, stagger: .065, ease: 'power2.out', clearProps: 'opacity,transform' },
      position);
  }
  function stopHeroTimer() { heroProgress?.pause(); }
  function scheduleHero() {
    if (!entranceComplete || active !== 0 || moving || document.hidden || dialog.open || (heroTransition && heroTransition.progress() < 1)) return;
    if (heroProgress) { heroProgress.resume(); return; }
    // The gauge itself owns the scene clock. Re-entry never resets a running
    // gauge, and there is no separate timeout that can drift from its fill.
    heroProgress = gsap.to(heroButtons[heroChoice], {
      '--story-progress': 1, duration: 7, ease: 'none',
      onComplete: () => { heroProgress = null; showHero((heroChoice + 1) % 3); },
    });
  }
  function showHero(index) {
    index = Math.max(0, Math.min(2, index));
    if (index === heroChoice) return;
    heroProgress?.kill(); heroProgress = null;
    gsap.set(heroButtons, { '--story-progress': 0 });
    if (heroTransition) heroTransition.kill();
    const previous = heroPanels[heroChoice], next = heroPanels[index];
    gsap.set(heroPanels.filter(panel => panel !== previous), { autoAlpha: 0, y: 0 });
    heroChoice = index;
    heroPanels.forEach((panel, i) => {
      panel.inert = i !== index; panel.setAttribute('aria-hidden', String(i !== index));
    });
    heroButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    heroTransition = gsap.timeline({ onComplete: scheduleHero });
    heroTransition.to('[data-scene-label]', { opacity: i => i === index ? 1 : 0, duration: .4 }, 0);
    if (previous !== next) heroTransition.to(previous, { autoAlpha: 0, y: -18, duration: .24 }, 0);
    heroTransition.fromTo(next, { autoAlpha: 0, y: 25 }, { autoAlpha: 1, y: 0, duration: .56, ease: 'power2.out' }, .1);
    heroTransition.to(hero, { backgroundColor: colors[index], duration: .8 }, 0);
    heroTransition.to(hero.querySelector('.story-visual'), { backgroundColor: sceneColors[index], duration: .8 }, 0);
    heroTransition.to(heroState, { position: index, duration: .8, ease: 'power2.inOut', onUpdate: publishMotion }, 0);
  }
  heroButtons.forEach((button, i) => button.addEventListener('click', () => showHero(i)));
  document.addEventListener('portfolio:choose', event => { if (active === 0) showHero(event.detail.index); });

  function navigate(index, { focus = false, force = false } = {}) {
    if (index < 0 || index >= cards.length || dialog.open) return false;
    if (moving) {
      if (!force) return false;
      transition.progress(1); transition.kill();
    }
    if (index === active) return false;
    stopHeroTimer(); closeMenu();
    const from = cards[active], to = cards[index], direction = index > active ? 1 : -1;
    if (heroTransition) { heroTransition.progress(1); heroTransition.kill(); stopHeroTimer(); }
    moving = true; active = index;
    root.classList.add('is-changing-card');
    cards.forEach(card => {
      card.inert = true;
      card.setAttribute('aria-hidden', String(card !== to));
      card.dataset.active = String(card === to);
    });
    gsap.set(from, { zIndex: 2 });
    gsap.set(to, { autoAlpha: 1, zIndex: 3, yPercent: direction * 105, rotationX: direction * 3, scale: .985 });
    updateNavigation(); publishMotion();
    const finish = () => {
      gsap.set(from, { autoAlpha: 0, yPercent: 0, rotationX: 0, scale: 1, zIndex: 0 });
      gsap.set(to, { autoAlpha: 1, yPercent: 0, rotationX: 0, scale: 1, zIndex: 2 });
      moving = false; to.inert = false; root.classList.remove('is-changing-card');
      if (focus) to.focus({ preventScroll: true });
      history.replaceState(null, '', `#${to.id}`);
      updateNavigation(true); publishMotion(); scheduleHero();
    };
    transition = gsap.timeline({ onComplete: finish });
    transition.to(from, { yPercent: -direction * 85, scale: .975, rotationX: -direction * 3, opacity: .55, duration: .7, ease: 'power2.out' }, 0);
    transition.to(to, { yPercent: 0, rotationX: 0, scale: 1, duration: .76, ease: 'power3.out' }, 0);
    reveal(to, transition);
    return true;
  }

  // Any first vertical wheel notch advances a whole card. No distance threshold,
  // window scrolling, intro stops, or inner-content scrolling owns that input.
  window.addEventListener('wheel', event => {
    if (dialog.open || menu.classList.contains('open') || event.ctrlKey || event.metaKey) return;
    if (!event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.cancelable) event.preventDefault();
    const direction = Math.sign(event.deltaY);
    if (direction !== wheelDirection && !moving) wheelConsumed = false;
    wheelDirection = direction;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelConsumed = false; }, 200);
    if (moving || wheelConsumed) { wheelConsumed = true; return; }
    wheelConsumed = true;
    navigate(active + direction);
  }, { passive: false });

  window.addEventListener('touchstart', event => {
    if (dialog.open || menu.classList.contains('open') || event.touches.length !== 1) { touch = null; return; }
    touch = { x: event.touches[0].clientX, y: event.touches[0].clientY, consumed: moving };
  }, { passive: true });
  window.addEventListener('touchmove', event => {
    if (!touch) return;
    if (event.touches.length !== 1) { touch = null; return; }
    const dy = touch.y - event.touches[0].clientY, dx = touch.x - event.touches[0].clientX;
    if (Math.abs(dx) > Math.abs(dy)) return;
    event.preventDefault();
    if (!touch.consumed && !moving && Math.abs(dy) >= 35) {
      touch.consumed = true; navigate(active + Math.sign(dy));
    }
  }, { passive: false });
  window.addEventListener('touchend', () => { touch = null; }, { passive: true });
  window.addEventListener('touchcancel', () => { touch = null; }, { passive: true });
  document.addEventListener('keydown', event => {
    if (dialog.open) return;
    if (event.key === 'Escape') { if (menu.classList.contains('open')) { closeMenu(); menuButton.focus(); } return; }
    if (event.altKey || event.ctrlKey || event.metaKey || menu.classList.contains('open') || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.target.closest('button, a, summary') && [' ', 'Enter'].includes(event.key)) return;
    const direction = { ArrowDown: 1, PageDown: 1, ' ': event.shiftKey ? -1 : 1, ArrowUp: -1, PageUp: -1 }[event.key];
    if (!direction && !['Home', 'End'].includes(event.key)) return;
    event.preventDefault(); if (moving || event.repeat) return;
    navigate(event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : active + direction, { focus: true });
  });
  previousButton.addEventListener('click', () => navigate(active - 1, { focus: true, force: true }));
  nextButton.addEventListener('click', () => navigate(active + 1, { focus: true, force: true }));
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (link) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const hash = link.getAttribute('href');
      const index = hash === '#main' ? 0 : cards.findIndex(card => `#${card.id}` === hash);
      if (index >= 0) {
        event.preventDefault(); if (dialog.open) dialog.close(); closeMenu();
        if (index === active) cards[index].focus({ preventScroll: true }); else navigate(index, { focus: true, force: true });
      }
    } else if (!event.target.closest('.site-header')) closeMenu();
  });

  function openDetails(card) {
    if (moving) return;
    stopHeroTimer(); lastDialogFocus = document.activeElement;
    const clone = card.querySelector('.card-flow').cloneNode(true);
    clone.querySelectorAll('[id], [aria-labelledby], [aria-controls]').forEach(element => {
      element.removeAttribute('id'); element.removeAttribute('aria-labelledby'); element.removeAttribute('aria-controls');
    });
    clone.querySelectorAll('[style]').forEach(element => element.removeAttribute('style'));
    clone.querySelectorAll('[aria-hidden], [inert]').forEach(element => { element.removeAttribute('aria-hidden'); element.inert = false; });
    clone.querySelectorAll('canvas, .scene-host, .job-tabs, .scene-turn').forEach(element => element.remove());
    clone.querySelectorAll('.experience-item').forEach(element => element.classList.add('job-active'));
    clone.querySelectorAll('details').forEach(element => { element.open = true; });
    dialogContent.replaceChildren(clone);
    document.querySelector('#dialog-title').textContent = names[cards.indexOf(card)];
    dialog.showModal();
  }
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { lastDialogFocus?.focus({ preventScroll: true }); scheduleHero(); });
  document.querySelector('.training > summary').addEventListener('click', event => { event.preventDefault(); openDetails(document.querySelector('#education')); });
  document.querySelectorAll('a.depth-card').forEach(card => {
    card.addEventListener('pointermove', event => {
      if (moving || !finePointer.matches || event.pointerType === 'touch') return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      gsap.to(card, { rotationY: x * 2, rotationX: -y * 2, transformPerspective: 1000, duration: .3, overwrite: 'auto' });
    });
    card.addEventListener('pointerleave', () => gsap.to(card, { rotationX: 0, rotationY: 0, duration: .4, clearProps: 'transform' }));
  });
  window.addEventListener('resize', () => { if (window.innerWidth > 850) closeMenu(); }, { passive: true });
  window.addEventListener('pageshow', () => { scheduleHero(); publishMotion(); });
  window.addEventListener('pagehide', () => { stopHeroTimer(); clearTimeout(wheelTimer); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopHeroTimer(); else scheduleHero(); });

  root.classList.add('deck-ready');
  controls.hidden = false;
  gsap.set(cards, { autoAlpha: 0, yPercent: 0, scale: 1, rotationX: 0 });
  gsap.set(heroPanels, { autoAlpha: 0 }); gsap.set(heroPanels[0], { autoAlpha: 1 });
  heroPanels.forEach((panel, i) => { panel.inert = i !== 0; panel.setAttribute('aria-hidden', String(i !== 0)); });
  const initial = cards.findIndex(card => `#${card.id}` === location.hash);
  active = initial >= 0 ? initial : 0;
  cards.forEach((card, i) => { card.inert = i !== active; card.setAttribute('aria-hidden', String(i !== active)); card.dataset.active = String(i === active); });
  gsap.set(cards[active], { autoAlpha: 1, zIndex: 2 });
  publishMotion(); updateNavigation();
  const entrance = gsap.timeline({ onComplete: () => { entranceComplete = true; scheduleHero(); } });
  entrance.fromTo(cards[active], { y: 24, scale: .985 }, { y: 0, scale: 1, duration: .7, ease: 'power3.out', clearProps: 'transform' }, 0);
  reveal(cards[active], entrance, .08);
})();
