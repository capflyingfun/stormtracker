import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Bell, CheckCircle } from "lucide-react";

interface AlertSubscriptionProps {
  location: {
    lat: number;
    lon: number;
    name: string;
  } | null;
}

export default function AlertSubscription({ location }: AlertSubscriptionProps) {
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    minimumDbz: 45,
    alertRadius: 30,
  });
  const { toast } = useToast();

  const handleSubscribe = async () => {
    if (!location) {
      toast({
        title: "Location Required",
        description: "Please set your location first before subscribing to alerts.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.name || !formData.email) {
      toast({
        title: "Missing Information",
        description: "Please fill in your name and email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSubscribing(true);

    try {
      const response = await fetch('/api/alerts/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          lat: location.lat,
          lon: location.lon,
          locationName: location.name,
          minimumDbz: formData.minimumDbz,
          alertRadius: formData.alertRadius,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsSubscribed(true);
        toast({
          title: "✅ Subscription Created!",
          description: `You'll receive storm alerts for ${location.name}. ${data.testEmailSent ? 'Check your email for a test alert.' : ''}`,
        });
      } else {
        throw new Error(data.error || 'Subscription failed');
      }
    } catch (error) {
      console.error('Subscription error:', error);
      toast({
        title: "Subscription Failed",
        description: error instanceof Error ? error.message : "Failed to create alert subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleTestAlert = async () => {
    if (!formData.email) {
      toast({
        title: "Email Required",
        description: "Please enter your email address first.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch('/api/alerts/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: formData.email }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "📧 Test Alert Sent",
          description: "Check your email for the test alert notification.",
        });
      } else {
        throw new Error(data.error || 'Test alert failed');
      }
    } catch (error) {
      console.error('Test alert error:', error);
      toast({
        title: "Test Alert Failed",
        description: error instanceof Error ? error.message : "Failed to send test alert.",
        variant: "destructive",
      });
    }
  };

  const intensityOptions = [
    { value: 20, label: "Light Rain (20+ dBZ)", description: "All precipitation" },
    { value: 35, label: "Moderate Rain (35+ dBZ)", description: "Moderate to heavy rain" },
    { value: 45, label: "Heavy Rain (45+ dBZ)", description: "Heavy rain and storms" },
    { value: 55, label: "Severe Storms (55+ dBZ)", description: "Severe weather only" },
    { value: 61, label: "Extreme Storms (61+ dBZ)", description: "Extreme storms only" }
  ];

  const radiusOptions = [
    { value: 10, label: "10 miles" },
    { value: 20, label: "20 miles" },
    { value: 30, label: "30 miles" },
    { value: 50, label: "50 miles" }
  ];

  if (isSubscribed) {
    return (
      <Card className="bg-green-950/30 border-green-700">
        <CardContent className="pt-6">
          <div className="text-center">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-400 mb-2">
              Alert Subscription Active
            </h3>
            <p className="text-green-300 mb-4">
              You'll receive storm alerts for {location?.name} at {formData.email}
            </p>
            <Button 
              onClick={handleTestAlert}
              variant="outline"
              size="sm"
              className="border-green-600 text-green-400 hover:bg-green-900/50"
            >
              📧 Send Test Alert
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Bell className="w-5 h-5" />
          Storm Alert Notifications
        </CardTitle>
        <p className="text-slate-400 text-sm">
          Get email alerts when storms are detected near your location, even when the app is closed.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-slate-300">Your Name</Label>
          <Input
            id="name"
            placeholder="Enter your name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="bg-slate-700/50 border-slate-600 text-white"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-slate-300">Email Address</Label>
          <Input
            id="email"
            type="email"
            placeholder="your.email@example.com"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            className="bg-slate-700/50 border-slate-600 text-white"
          />
          <p className="text-xs text-slate-500">
            No password required - just simple email alerts when storms approach.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-slate-300">Alert Intensity</Label>
          <Select 
            value={formData.minimumDbz.toString()} 
            onValueChange={(value) => setFormData(prev => ({ ...prev, minimumDbz: parseInt(value) }))}
          >
            <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {intensityOptions.map(option => (
                <SelectItem key={option.value} value={option.value.toString()}>
                  <div>
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-slate-500">{option.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-slate-300">Alert Radius</Label>
          <Select 
            value={formData.alertRadius.toString()} 
            onValueChange={(value) => setFormData(prev => ({ ...prev, alertRadius: parseInt(value) }))}
          >
            <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {radiusOptions.map(option => (
                <SelectItem key={option.value} value={option.value.toString()}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-blue-950/30 border border-blue-700 rounded-lg p-3">
          <p className="text-blue-300 text-sm">
            <Mail className="w-4 h-4 inline mr-2" />
            You'll receive professional email alerts similar to AccuWeather and Weather Channel, 
            including storm details, safety recommendations, and arrival time estimates.
          </p>
        </div>

        <Button 
          onClick={handleSubscribe}
          disabled={isSubscribing || !location}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          {isSubscribing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Setting up alerts...
            </>
          ) : (
            <>
              <Bell className="w-4 h-4 mr-2" />
              Subscribe to Storm Alerts
            </>
          )}
        </Button>

        {!location && (
          <p className="text-yellow-400 text-sm text-center">
            ⚠️ Please set your location first to enable storm alerts
          </p>
        )}
      </CardContent>
    </Card>
  );
}