import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const decodeHash = (hash) => {
  const id = hash.slice(1);
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
};

const STORE = "penged:scroll";
const read = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
};
const write = (key, y) => {
  try {
    const all = read();
    all[key] = y;
    const keys = Object.keys(all);
    if (keys.length > 60) delete all[keys[0]];
    sessionStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    /* storage unavailable: scroll simply is not restored */
  }
};

/**
 * Scrolls to the top (or the #hash target) on a new navigation, and restores the previous
 * position on back/forward (BrowserRouter has no <ScrollRestoration>, so we keep it per history entry).
 */
export function ScrollToTop() {
  const { pathname, hash, key } = useLocation(); // key identifies the history entry
  const navigationType = useNavigationType();
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    let t = 0;
    const onScroll = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => write(keyRef.current, window.scrollY), 80);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(t);
    };
  }, []);

  useLayoutEffect(() => {
    if (navigationType === "POP") {
      const y = read()[keyRef.current];
      if (!y) return;
      // The page may still be loading its list: keep trying until it is tall enough (max ~1.5s).
      let tries = 0,
        raf = 0;
      const attempt = () => {
        window.scrollTo({ top: y, left: 0, behavior: "instant" });
        const reached = Math.abs(window.scrollY - y) < 2;
        if (!reached && tries++ < 90) raf = requestAnimationFrame(attempt);
      };
      attempt();
      return () => cancelAnimationFrame(raf);
    }
    if (hash) {
      const id = decodeHash(hash);
      const timer = window.setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }, 50);
      return () => window.clearTimeout(timer);
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType]);
  return null;
}
