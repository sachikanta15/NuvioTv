import { Link } from "react-router-dom";
import { Compass, Home, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function NotFoundScreen() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 pb-24 pt-16 text-center lg:pb-16">
      <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgb(var(--nuvio-accent)/0.14)] text-[rgb(var(--nuvio-accent))]">
        <Compass size={30} />
      </span>
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-tertiary">Error 404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Page not found</h1>
      <p className="mt-3 max-w-sm text-text-secondary">
        The page you were looking for has drifted off into the void.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link to="/">
          <Button variant="primary" icon={<Home size={16} />}>
            Back to home
          </Button>
        </Link>
        <Link to="/search">
          <Button variant="outline" icon={<Search size={16} />}>
            Search titles
          </Button>
        </Link>
      </div>
    </div>
  );
}
