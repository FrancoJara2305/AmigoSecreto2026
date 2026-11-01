// Explicit easing keeps section navigation consistent even when the browser's
// native smooth scrolling is disabled. User input always interrupts the motion.
export function scrollToSection(target: HTMLElement): () => void {
  const start = window.scrollY;
  const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const limit = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const destination = Math.max(0, Math.min(limit, start + target.getBoundingClientRect().top - padding - margin));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches || Math.abs(destination - start) < 1) {
    window.scrollTo({ top: destination, behavior: 'instant' });
    return () => {};
  }
  const started = performance.now();
  const duration = Math.min(650, 350 + Math.abs(destination - start) * .15);
  let frame = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) stop();
  };
  const step = (now: number) => {
    if (stopped) return;
    const t = reduced.matches ? 1 : Math.min(1, (now - started) / duration);
    const eased = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    window.scrollTo({ top: start + (destination - start) * eased, behavior: 'instant' });
    if (t < 1) frame = requestAnimationFrame(step);
    else stop();
  };
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('keydown', onKey);
  frame = requestAnimationFrame(step);
  return stop;
}
