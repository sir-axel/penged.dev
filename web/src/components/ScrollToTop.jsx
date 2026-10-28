import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const decodeHash = (hash) => {
  const id = hash.slice(1);
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
};

/** Scrolls to the top (or the #hash target) on navigation, except back/forward. */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType === "POP") return;
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
