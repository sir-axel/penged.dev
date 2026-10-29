import { Link, useLocation } from "react-router-dom";
import { feedbackHref } from "@/pages/Feedback";

const readable = (p) => {
  try {
    return decodeURI(p);
  } catch {
    return p;
  }
};

export function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24">
      <p className="font-display text-6xl text-muted-foreground">404</p>
      <div className="mx-auto mt-3 h-0.5 w-16 bg-border" />
      <h1 className="mt-6 font-heading text-2xl font-semibold text-foreground">That page does not exist</h1>
      <p className="mt-3 break-all text-sm leading-relaxed text-muted-foreground">
        Nothing lives at <span className="font-mono text-foreground">{readable(pathname)}</span>. It may have moved,
        or the link is mistyped.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex min-h-10 items-center rounded-sm border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        Back to the board
      </Link>
      <p className="mt-4 text-sm text-muted-foreground">
        Something broken?{" "}
        <Link
          to={feedbackHref(pathname)}
          className="inline-flex min-h-10 items-center font-medium text-foreground underline underline-offset-4"
        >
          Send feedback
        </Link>
      </p>
    </div>
  );
}
