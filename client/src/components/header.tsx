import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { LANGUAGES, type Language } from "@/lib/i18n";

interface HeaderProps {
  useMetric: boolean;
  onUnitsChange: (useMetric: boolean) => void;
  onOpenSettings: () => void;
  onOpenApiKeys?: () => void;
}

export default function Header({ useMetric, onUnitsChange, onOpenSettings, onOpenApiKeys }: HeaderProps) {
  const [showLangMenu, setShowLangMenu] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const currentLang = LANGUAGES.find(l => l.code === language);

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700/50 p-3 sm:p-4 select-none relative z-[55]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
          <div className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-400 select-none shrink-0">⚡</div>
          <div className="select-none min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold select-none leading-tight">StormTracker <span className="text-xs sm:text-sm font-normal text-slate-400">v1.50</span></h1>
            <p className="text-xs sm:text-sm text-slate-300 select-none truncate">{t.realTimeStorm}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowLangMenu(!showLangMenu); }}
              className="px-1.5 sm:px-2 py-1 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-xs sm:text-sm max-w-[120px] sm:max-w-none"
              title={t.language}
            >
              <span className="truncate">{currentLang?.flag} {currentLang?.nativeName}</span>
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

          <div className="hidden sm:flex items-center gap-1.5 text-gray-400">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
            <span className="text-sm">{t.ready}</span>
          </div>
          
          {onOpenApiKeys && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowLangMenu(false); onOpenApiKeys(); }}
              className="p-1.5 sm:p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 shrink-0"
              title="API Keys"
            >
              🔑
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowLangMenu(false); onOpenSettings(); }}
            className="p-1.5 sm:p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 shrink-0"
          >
            ⚙️
          </Button>
        </div>
      </div>
    </div>
  );
}
