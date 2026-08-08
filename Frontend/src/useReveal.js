import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Content must never depend on JS to become visible, and these reveals hide
 * elements before animating them in. Two guards:
 *   - a hidden document throttles requestAnimationFrame, which freezes GSAP's
 *     ticker, so don't animate at all — leave everything visible
 *   - if the ticker never starts anyway, a backstop unhides everything
 */
const canAnimate = () => !reducedMotion() && document.visibilityState === 'visible';

// A live ticker fires within one frame; 1s is a generous margin.
const TICKER_PROBE_MS = 1000;

/** Runs `build(gsap)` inside a scoped context, with the same ticker guards. */
export function useEntrance(scope, build, deps = []) {
  useEffect(() => {
    if (!scope.current || !canAnimate()) return;

    const ctx = gsap.context(build, scope);

    let tickerAlive = false;
    requestAnimationFrame(() => { tickerAlive = true; });
    const safety = setTimeout(() => {
      if (!tickerAlive) ctx.revert();
    }, TICKER_PROBE_MS);

    return () => {
      clearTimeout(safety);
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Scroll-reveals everything inside `scope`:
 *   data-reveal          -> the element itself fades up
 *   data-reveal-stagger  -> its direct children fade up one after another
 *   data-count="1250"    -> counts up to that number (keeps any prefix/suffix
 *                           text you leave in a sibling span)
 *
 * gsap.context scopes every tween and ScrollTrigger to this page, so switching
 * tabs reverts them instead of leaking triggers.
 */
export default function useReveal(scope, deps = []) {
  useEffect(() => {
    const root = scope.current;
    if (!root) return;

    if (!canAnimate()) return;

    const ctx = gsap.context((self) => {
      self.selector('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 24,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        });
      });

      self.selector('[data-reveal-stagger]').forEach((row) => {
        const items = Array.from(row.children);
        if (!items.length) return;
        gsap.from(items, {
          opacity: 0,
          y: 26,
          duration: 0.5,
          ease: 'power2.out',
          stagger: 0.06,
          scrollTrigger: { trigger: row, start: 'top 90%', once: true },
        });
      });

      self.selector('[data-count]').forEach((el) => {
        const target = Number(el.dataset.count);
        if (!Number.isFinite(target)) return;
        const counter = { v: 0 };
        gsap.to(counter, {
          v: target,
          duration: 1.4,
          ease: 'power1.out',
          scrollTrigger: { trigger: el, start: 'top 92%', once: true },
          onUpdate: () => {
            el.textContent = Math.round(counter.v).toLocaleString('en-IN');
          },
        });
      });
    }, scope);

    // Images and fonts settle after mount and shift trigger positions.
    const refresh = setTimeout(() => ScrollTrigger.refresh(), 300);

    // Backstop, only for a dead ticker. Checking opacity alone would be wrong:
    // elements below the fold are legitimately still hidden, waiting to scroll in.
    let tickerAlive = false;
    requestAnimationFrame(() => { tickerAlive = true; });

    const safety = setTimeout(() => {
      if (tickerAlive) return;
      ctx.revert();
      root.querySelectorAll('[data-count]').forEach((el) => {
        el.textContent = Number(el.dataset.count).toLocaleString('en-IN');
      });
    }, TICKER_PROBE_MS);

    return () => {
      clearTimeout(refresh);
      clearTimeout(safety);
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
