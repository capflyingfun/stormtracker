import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { LANGUAGES, type Language } from "@/lib/i18n";

interface HeaderProps {
  useMetric: boolean;
  onUnitsChange: (useMetric: boolean) => void;
  onOpenSettings: () => void;
}

export default function Header({ useMetric, onUnitsChange, onOpenSettings }: HeaderProps) {
  const [showLangMenu, setShowLangMenu] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const currentLang = LANGUAGES.find(l => l.code === language);

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700/50 p-4 select-none relative z-[55]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 text-yellow-400 select-none">⚡</div>
          <div className="select-none">
            <h1 className="text-2xl font-bold select-none">StormTracker <span className="text-sm font-normal text-slate-400">v1.50</span></h1>
            <p className="text-sm text-slate-300 select-none">{t.realTimeStorm}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowLangMenu(!showLangMenu); }}
              className="px-2 py-1 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-sm"
              title={t.language}
            >
              {currentLang?.flag} {currentLang?.nativeName}
            </Button>
            {showLangMenu && (
              <div className="absolute right-0 top-full mt-1 z-[60] bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[180px] max-h-[320px] overflow-y-auto">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => { setLanguage(lang.code as Language); setShowLangMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center gap-2 ${language === lang.code ? 'bg-slate-700/60 text-blue-400' : 'text-slate-200'}`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.nativeName}</span>
                    <span className="text-slate-400 text-xs ml-auto">{lang.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
            <span className="text-sm">{t.ready}</span>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowLangMenu(false); onOpenSettings(); }}
            className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50"
          >
            ⚙️
          </Button>
        </div>
      </div>
    </div>
  );
}
