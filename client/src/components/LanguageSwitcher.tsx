import { useLanguage, LANGUAGES } from "@/lib/language";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe } from "lucide-react";

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLanguage();

  return (
    <Select value={lang} onValueChange={(v) => setLang(v as any)}>
      <SelectTrigger
        className={`w-auto gap-2 border-none bg-transparent shadow-none focus:ring-0 ${className}`}
        data-testid="select-language-switcher"
      >
        <Globe className="h-4 w-4 opacity-70" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code} data-testid={`option-language-${l.code}`}>
            <span className="mr-2">{l.flag}</span>
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
