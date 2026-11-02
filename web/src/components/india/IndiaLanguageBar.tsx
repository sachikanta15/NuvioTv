import { Flame } from "lucide-react";
import { INDIA_LANGUAGES, indiaCountsByLanguage } from "@/lib/india";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/lib/cn";

interface IndiaLanguageBarProps {
  value: string;
  onChange: (language: string) => void;
  /** Hide the counts on compact surfaces. */
  compact?: boolean;
  className?: string;
}

/** A horizontal language filter tuned for Indian users. */
export function IndiaLanguageBar({ value, onChange, compact, className }: IndiaLanguageBarProps) {
  const counts = indiaCountsByLanguage();

  return (
    <div
      className={cn(
        "no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
        className,
      )}
      aria-label="Filter by Indian language"
    >
      <Chip
        active={value === "all"}
        size={compact ? "sm" : "md"}
        onClick={() => onChange("all")}
        icon={<Flame size={14} />}
      >
        All India
        {!compact && (
          <span className="ml-1 text-[11px] opacity-70">{counts.all}</span>
        )}
      </Chip>
      {INDIA_LANGUAGES.map((language) => {
        const count = counts[language.id] ?? 0;
        if (count === 0) return null;
        return (
          <Chip
            key={language.id}
            active={value === language.id}
            size={compact ? "sm" : "md"}
            onClick={() => onChange(language.id)}
          >
            <span className="text-[13px] leading-none">{language.native}</span>
            <span className="text-[11px] opacity-75">{language.label}</span>
            {!compact && <span className="text-[11px] opacity-60">{count}</span>}
          </Chip>
        );
      })}
    </div>
  );
}
