// Switch presentation in place so camera streams, files and settings stay alive.
export function initCaptureMode() {
  const stage = document.getElementById('stage');
  const enter = document.getElementById('enter-capture');
  const ratio = document.getElementById('capture-ratio');
  const ratios = { wide: 16 / 9, standard: 4 / 3, square: 1 };
  let scrollPosition = 0;

  function exit() {
    if (!document.body.classList.contains('capture-mode')) return;
    document.body.classList.remove('capture-mode');
    enter.focus({ preventScroll: true });
    window.scrollTo({ top: scrollPosition, behavior: 'instant' });
  }

  enter.addEventListener('click', () => {
    scrollPosition = window.scrollY;
    stage.style.setProperty('--capture-ratio', ratios[ratio.value] || ratios.wide);
    document.body.classList.add('capture-mode');
    stage.focus({ preventScroll: true });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('capture-mode')) {
      event.preventDefault();
      exit();
    }
  });
  stage.addEventListener('dblclick', exit);
}
