import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, ChevronDown, ChevronUp, RefreshCw, Cpu, Zap } from "lucide-react";

interface WeatherSummaryProps {
  lat: number;
  lon: number;
  locationName: string;
  useMetric?: boolean;
}

export function WeatherSummary({ lat, lon, locationName, useMetric }: WeatherSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['/api/ai-summary', lat, lon, useMetric],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/ai-summary', {
        lat, lon, locationName, useMetric,
      });
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card className="bg-slate-900/80 border-cyan-500/30 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-cyan-400 flex items-center gap-2">
            <BookOpen className="w-4 h-4 animate-pulse" />
            Generating Weather Briefing...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-3 bg-slate-700 rounded animate-pulse w-full" />
            <div className="h-3 bg-slate-700 rounded animate-pulse w-5/6" />
            <div className="h-3 bg-slate-700 rounded animate-pulse w-4/6" />
            <div className="h-3 bg-slate-700 rounded animate-pulse w-full" />
            <div className="h-3 bg-slate-700 rounded animate-pulse w-3/6" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data?.summary) {
    return (
      <Card className="bg-slate-900/80 border-red-500/30 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-red-400 flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Weather Briefing Unavailable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-400 text-sm">Unable to generate weather summary. Check AI provider configuration.</p>
          <Button variant="outline" size="sm" className="mt-2 border-slate-600" onClick={() => refetch()}>
            <RefreshCw className="w-3 h-3 mr-1" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summary = data.summary as string;
  const sections = parseSections(summary);
  const condensedSections = sections.slice(0, 3);
  const remainingSections = sections.slice(3);

  const dataPointCount = Object.values(data.dataPointsUsed || {}).filter(v => v && v !== 0).length;
  const providerLabel = data.provider === 'openrouter' ? 'OpenRouter' : data.provider === 'groq' ? 'Groq' : 'OpenAI';
  const providerColor = data.free ? 'text-green-400' : 'text-amber-400';

  return (
    <Card className="bg-slate-900/80 border-cyan-500/30 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-cyan-400 flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Weather Briefing
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">
              <Cpu className="w-3 h-3 mr-1" />
              <span className={providerColor}>{providerLabel}</span>
              {data.free && <Zap className="w-3 h-3 ml-1 text-green-400" />}
            </Badge>
            <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">
              {dataPointCount} sources
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-slate-400 hover:text-cyan-400"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {condensedSections.map((section, i) => (
          <SectionBlock key={i} section={section} />
        ))}

        {remainingSections.length > 0 && (
          <>
            {expanded && remainingSections.map((section, i) => (
              <SectionBlock key={`exp-${i}`} section={section} />
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-cyan-400 hover:text-cyan-300 hover:bg-slate-800/50 text-xs"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <>Show Less <ChevronUp className="w-3 h-3 ml-1" /></>
              ) : (
                <>Show Full Briefing ({remainingSections.length} more sections) <ChevronDown className="w-3 h-3 ml-1" /></>
              )}
            </Button>
          </>
        )}

        <div className="text-[10px] text-slate-500 text-right pt-1">
          {new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {' · '}{data.model}
        </div>
      </CardContent>
    </Card>
  );
}

interface Section {
  title: string;
  content: string;
}

function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  const lines = text.split('\n');
  let currentTitle = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(?:\*\*)?([A-Z][A-Z &/]+(?:[A-Z]))(?:\*\*)?:?\s*(.*)/);
    if (headerMatch && line.trim().length < 60) {
      if (currentTitle || currentContent.length > 0) {
        sections.push({
          title: currentTitle || 'Overview',
          content: currentContent.join('\n').trim(),
        });
      }
      currentTitle = headerMatch[1].replace(/\*\*/g, '').trim();
      currentContent = headerMatch[2] ? [headerMatch[2]] : [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentTitle || currentContent.length > 0) {
    sections.push({
      title: currentTitle || 'Overview',
      content: currentContent.join('\n').trim(),
    });
  }

  return sections.filter(s => s.content.trim().length > 0);
}

function SectionBlock({ section }: { section: Section }) {
  const titleColor = getTitleColor(section.title);

  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase tracking-wider mb-1 ${titleColor}`}>
        {section.title}
      </h4>
      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
        {section.content}
      </p>
    </div>
  );
}

function getTitleColor(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('right now') || t.includes('current')) return 'text-cyan-400';
  if (t.includes('today')) return 'text-blue-400';
  if (t.includes('week') || t.includes('ahead')) return 'text-indigo-400';
  if (t.includes('storm')) return 'text-amber-400';
  if (t.includes('alert') || t.includes('warning')) return 'text-red-400';
  if (t.includes('aviation')) return 'text-sky-400';
  if (t.includes('marine') || t.includes('outdoor')) return 'text-teal-400';
  if (t.includes('atmosphere')) return 'text-purple-400';
  if (t.includes('bottom line') || t.includes('takeaway')) return 'text-green-400';
  return 'text-slate-400';
}
