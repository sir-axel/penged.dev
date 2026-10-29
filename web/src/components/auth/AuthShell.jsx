import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";

export function AuthShell({
  icon: Icon,
  title,
  subtitle,
  footer,
  children,
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4 py-20">
      <div className="absolute inset-x-0 top-0 border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="Penged.dev home" className="inline-flex min-h-10 items-center rounded-none py-1">
            <Logo />
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-10 items-center gap-1.5 font-display text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to the board
          </Link>
        </div>
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-sm bg-primary mb-4">
            <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-sm shadow-sm border border-border p-8">{children}</div>
        {footer && <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>}
      </div>
    </div>
  );
}
