import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/**
 * Back one step. If the person navigated inside the app (router location.key is not "default"), go back in
 * history so a chain like ladder -> player -> match -> player unwinds exactly; otherwise (deep link, new tab)
 * go to the sensible parent given in `fallback`.
 */
export function BackButton({ fallback = "/", label = "Back", className = "" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const onClick = () => {
    if (location.key !== "default") navigate(-1);
    else navigate(fallback, { replace: true });
  };
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6">
      <button
        type="button"
        onClick={onClick}
        data-testid="back-button"
        className={`-ml-2 inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-sm px-2 font-display text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground hover:bg-secondary hover:text-foreground ${className}`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
    </div>
  );
}
