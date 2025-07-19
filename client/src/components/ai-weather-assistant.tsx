import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Brain, AlertTriangle, CheckCircle, Clock, MapPin, Wind, Zap, RefreshCw } from "lucide-react";

interface StormData {
  id: string;
  lat: number;
  lon: number;
  intensity: number;
  distance: number;
  direction: string;
  bearing: number;
  category: string;
  movement?: {
    direction: number;
    speed: number;
    eta?: string;
    impact?: string;
  };
}

interface WindData {
  speed: number;
  direction: number;
  pressure_level: string;
}

interface WeatherAssessment {
  riskLevel: 'low' | 'moderate' | 'high' | 'extreme';
  summary: string;
  detailedAnalysis: string;
  recommendations: string[];
  timeToImpact?: string;
  confidence: number;
}

interface AIWeatherAssistantProps {
  userLocation: {
    lat: number;
    lon: number;
    address: string;
  };
  storms: StormData[];
  winds: WindData[];
  radarSource: string;
  lightningCount?: number;
}

export default function AIWeatherAssistant({
  userLocation,
  storms,
  winds,
  radarSource,
  lightningCount = 0
}: AIWeatherAssistantProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // AI Assessment mutation
  const assessmentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai-assessment", {
        userLocation,
        storms,
        winds,
        radarSource,
        lightningCount
      });
      return response.json();
    },
  });

  const assessment = assessmentMutation.data as WeatherAssessment | undefined;

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'extreme': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'moderate': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'extreme': 
      case 'high': return <AlertTriangle className="w-4 h-4" />;
      case 'moderate': return <Clock className="w-4 h-4" />;
      case 'low': return <CheckCircle className="w-4 h-4" />;
      default: return <Brain className="w-4 h-4" />;
    }
  };

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-900 border-blue-200 dark:border-blue-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          AI Weather Assistant
          {assessment && (
            <Badge className={`ml-auto ${getRiskColor(assessment.riskLevel)}`}>
              {getRiskIcon(assessment.riskLevel)}
              {assessment.riskLevel.toUpperCase()} RISK
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!assessment && !assessmentMutation.isPending && (
          <div className="text-center">
            <p className="text-muted-foreground mb-4">
              Get AI-powered weather impact analysis based on your current storm data
            </p>
            <Button 
              onClick={() => assessmentMutation.mutate()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Brain className="w-4 h-4 mr-2" />
              Analyze Weather Risk
            </Button>
          </div>
        )}

        {assessmentMutation.isPending && (
          <div className="text-center py-6">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-sm text-muted-foreground">
              AI is analyzing {storms.length} storms, wind patterns, and your location...
            </p>
          </div>
        )}

        {assessment && (
          <div className="space-y-4">
            {/* Risk Summary */}
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                {getRiskIcon(assessment.riskLevel)}
                Risk Assessment
              </h4>
              <p className="text-sm">{assessment.summary}</p>
              {assessment.timeToImpact && (
                <div className="flex items-center gap-2 mt-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-medium">Impact timing: {assessment.timeToImpact}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Data Context */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-500" />
                <span>{storms.length} storms tracked</span>
              </div>
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-gray-500" />
                <span>{winds.length} wind levels</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-gray-500" />
                <span>{lightningCount} lightning strikes</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                  {radarSource} radar
                </span>
              </div>
            </div>

            {isExpanded && (
              <>
                <Separator />
                
                {/* Detailed Analysis */}
                <div>
                  <h4 className="font-semibold mb-2">Detailed Analysis</h4>
                  <p className="text-sm whitespace-pre-line">{assessment.detailedAnalysis}</p>
                </div>

                <Separator />

                {/* Recommendations */}
                <div>
                  <h4 className="font-semibold mb-2">Safety Recommendations</h4>
                  <ul className="space-y-1">
                    {assessment.recommendations.map((rec, index) => (
                      <li key={index} className="text-sm flex items-start gap-2">
                        <span className="text-blue-600 mt-1">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Separator />

                {/* Confidence & Refresh */}
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    Confidence: {Math.round(assessment.confidence * 100)}%
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => assessmentMutation.mutate()}
                    disabled={assessmentMutation.isPending}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Refresh
                  </Button>
                </div>
              </>
            )}

            {/* Toggle Details */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full"
            >
              {isExpanded ? 'Show Less' : 'Show Detailed Analysis'}
            </Button>
          </div>
        )}

        {assessmentMutation.isError && (
          <div className="text-center py-4">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400">
              Unable to generate AI assessment. Please try again.
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => assessmentMutation.mutate()}
              className="mt-2"
            >
              Retry Analysis
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}