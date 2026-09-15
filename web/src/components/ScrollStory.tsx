import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/** Content stays visible if motion APIs are unavailable or motion is disabled. */
export function ScrollStory({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || !("IntersectionObserver" in window) || !window.matchMedia) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dispose = () => {};
    const setup = () => {
      dispose();
      if (preference.matches) return;
      const sections = Array.from(element.querySelectorAll<HTMLElement>(".story-section"));
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
        });
      }, { threshold: 0.06 });
      sections.forEach((section) => { section.classList.add("will-reveal"); observer.observe(section); });
      let frame = 0;
      const update = () => {
        frame = 0;
        const rect = element.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, -rect.top / Math.max(1, rect.height - window.innerHeight)));
        element.style.setProperty("--reading-progress", String(progress));
        element.style.setProperty("--hero-shift", `${Math.min(110, Math.max(0, -rect.top) * 0.18)}px`);
        element.style.setProperty("--hero-opacity", String(Math.max(0, 1 - Math.max(0, -rect.top) / (window.innerHeight * 0.85))));
      };
      const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      update();
      dispose = () => {
        observer.disconnect(); cancelAnimationFrame(frame);
        window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule);
        sections.forEach((section) => section.classList.remove("will-reveal", "is-visible"));
        element.style.removeProperty("--reading-progress");
        element.style.removeProperty("--hero-shift"); element.style.removeProperty("--hero-opacity");
      };
    };
    setup(); preference.addEventListener("change", setup);
    return () => { dispose(); preference.removeEventListener("change", setup); };
  }, []);
  return <div className="quiet-landing scroll-story" ref={root}><div className="reading-progress" aria-hidden="true" />{children}</div>;
}
