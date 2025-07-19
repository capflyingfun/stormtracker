import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Bell, CheckCircle, Smartphone } from "lucide-react";

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
    phoneNumber: "",
    carrier: "",
    smsEnabled: false,
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
          phoneNumber: formData.smsEnabled ? formData.phoneNumber : null,
          carrier: formData.smsEnabled ? formData.carrier : null,
          smsEnabled: formData.smsEnabled,
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
          description: `You'll receive storm alerts for ${location.name}. ${data.testEmailSent ? 'Check your email' : ''}${data.testSMSSent ? ' and phone' : ''} for test alerts.`,
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
          title: "📧 Test Alerts Sent",
          description: `Check your ${data.emailSent ? 'email' : ''}${data.smsSent ? ' and phone' : ''} for test notifications.`,
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

  const carrierOptions = [
    { value: "ATT", label: "AT&T" },
    { value: "Verizon", label: "Verizon" },
    { value: "T-Mobile", label: "T-Mobile" },
    { value: "US Cellular", label: "US Cellular" },
    { value: "Boost", label: "Boost Mobile" },
    { value: "Cricket", label: "Cricket" },
    { value: "Metro", label: "Metro by T-Mobile" },
    { value: "Google Fi", label: "Google Fi" },
    { value: "Mint Mobile", label: "Mint Mobile" },
    { value: "Visible", label: "Visible" },
    { value: "Xfinity Mobile", label: "Xfinity Mobile" },
    { value: "Simple Mobile", label: "Simple Mobile" },
    { value: "US Mobile", label: "US Mobile" },
    { value: "Consumer Cellular", label: "Consumer Cellular" },
    { value: "Pure Talk", label: "Pure Talk" },
    { value: "H2O Wireless", label: "H2O Wireless" },
    { value: "Page Plus", label: "Page Plus" },
    { value: "Ultra Mobile", label: "Ultra Mobile" },
    { value: "Tello", label: "Tello" },
    { value: "Tracfone", label: "Tracfone" },
    { value: "Twigby", label: "Twigby" },
    { value: "Ting GSM", label: "Ting (GSM)" },
    { value: "Ting CDMA", label: "Ting (CDMA)" },
    { value: "C-Spire", label: "C-Spire" }
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
              You'll receive storm alerts for {location?.name} via email{formData.smsEnabled ? ' and SMS text' : ''}
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

        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <Checkbox 
              id="sms-enabled"
              checked={formData.smsEnabled}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, smsEnabled: !!checked }))}
            />
            <Label htmlFor="sms-enabled" className="text-slate-300 flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Enable SMS text alerts (instant notifications)
            </Label>
          </div>

          {formData.smsEnabled && (
            <div className="ml-7 space-y-3 border-l-2 border-blue-600 pl-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-300">Phone Number</Label>
                <Input
                  id="phone"
                  placeholder="(555) 123-4567"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
                <p className="text-xs text-slate-500">
                  US phone numbers only. Standard messaging rates may apply.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Mobile Carrier</Label>
                <Select 
                  value={formData.carrier} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, carrier: value }))}
                >
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue placeholder="Select your carrier" />
                  </SelectTrigger>
                  <SelectContent>
                    {carrierOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <div className="bg-blue-950/30 border border-blue-700 rounded-lg p-3">
          <p className="text-blue-300 text-sm">
            <Mail className="w-4 h-4 inline mr-2" />
            You'll receive professional alerts similar to AccuWeather and Weather Channel, 
            including storm details, safety recommendations, and arrival time estimates.
            {formData.smsEnabled && (
              <>
                <br /><br />
                <Smartphone className="w-4 h-4 inline mr-2" />
                SMS text alerts provide instant notifications even when email is delayed.
              </>
            )}
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