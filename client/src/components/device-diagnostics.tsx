import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface DeviceDiagnostics {
  device: {
    userAgent: string;
    platform: string;
    language: string;
    cookieEnabled: boolean;
    onLine: boolean;
    hardwareConcurrency: number;
    maxTouchPoints: number;
  };
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelDepth: number;
    orientation?: string;
  };
  memory?: {
    jsHeapSizeLimit?: number;
    totalJSHeapSize?: number;
    usedJSHeapSize?: number;
    deviceMemory?: number;
  };
  network?: {
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
  performance: {
    loadTime: number;
    domContentLoaded: number;
    firstPaint?: number;
    firstContentfulPaint?: number;
    renderTime: number;
  };
  speedTest: {
    downloadSpeed?: number;
    uploadSpeed?: number;
    latency?: number;
    status: 'idle' | 'running' | 'completed' | 'error';
  };
}

interface DeviceDiagnosticsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DeviceDiagnostics({ isOpen, onClose }: DeviceDiagnosticsProps) {
  const [diagnostics, setDiagnostics] = useState<DeviceDiagnostics | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const speedTestRef = useRef<AbortController>();

  const runDiagnostics = async () => {
    setIsRunning(true);
    const startTime = performance.now();

    try {
      // Basic device information
      const device = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        hardwareConcurrency: navigator.hardwareConcurrency || 1,
        maxTouchPoints: navigator.maxTouchPoints || 0,
      };

      // Screen information
      const screen = {
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
        colorDepth: window.screen.colorDepth,
        pixelDepth: window.screen.pixelDepth,
        orientation: (window.screen as any).orientation?.type || 'unknown',
      };

      // Memory information (if available)
      let memory = {};
      if ('memory' in performance) {
        const memInfo = (performance as any).memory;
        memory = {
          jsHeapSizeLimit: memInfo.jsHeapSizeLimit,
          totalJSHeapSize: memInfo.totalJSHeapSize,
          usedJSHeapSize: memInfo.usedJSHeapSize,
        };
      }
      if ('deviceMemory' in navigator) {
        (memory as any).deviceMemory = (navigator as any).deviceMemory;
      }

      // Network information (if available)
      let network = {};
      if ('connection' in navigator) {
        const conn = (navigator as any).connection;
        network = {
          type: conn.type,
          effectiveType: conn.effectiveType,
          downlink: conn.downlink,
          rtt: conn.rtt,
          saveData: conn.saveData,
        };
      }

      // Performance timing
      const perfTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const performanceData = {
        loadTime: perfTiming.loadEventEnd - perfTiming.loadEventStart,
        domContentLoaded: perfTiming.domContentLoadedEventEnd - perfTiming.domContentLoadedEventStart,
        renderTime: performance.now() - startTime,
      };

      // Try to get paint metrics
      const paintEntries = performance.getEntriesByType('paint');
      paintEntries.forEach((entry) => {
        if (entry.name === 'first-paint') {
          (performanceData as any).firstPaint = entry.startTime;
        } else if (entry.name === 'first-contentful-paint') {
          (performanceData as any).firstContentfulPaint = entry.startTime;
        }
      });

      setDiagnostics({
        device,
        screen,
        memory: Object.keys(memory).length > 0 ? memory : undefined,
        network: Object.keys(network).length > 0 ? network : undefined,
        performance: performanceData,
        speedTest: { status: 'idle' },
      });
    } catch (error) {
      console.error('Error running diagnostics:', error);
    }

    setIsRunning(false);
  };

  const runSpeedTest = async () => {
    if (!diagnostics) return;

    // Abort any existing speed test
    if (speedTestRef.current) {
      speedTestRef.current.abort();
    }

    speedTestRef.current = new AbortController();
    
    setDiagnostics(prev => prev ? {
      ...prev,
      speedTest: { status: 'running' }
    } : null);

    try {
      // Test download speed using a small API call
      const downloadStart = performance.now();
      const response = await fetch('/api/speed-test', {
        method: 'GET',
        signal: speedTestRef.current.signal,
      });
      const downloadEnd = performance.now();
      
      if (!response.ok) {
        throw new Error('Speed test failed');
      }

      const downloadTime = downloadEnd - downloadStart;
      const downloadSpeed = (1024 * 8) / (downloadTime / 1000); // Assuming 1KB response, convert to Kbps

      // Test upload speed with a small POST
      const uploadStart = performance.now();
      const uploadData = new Array(1024).fill('x').join(''); // 1KB of data
      const uploadResponse = await fetch('/api/speed-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: uploadData }),
        signal: speedTestRef.current.signal,
      });
      const uploadEnd = performance.now();

      if (!uploadResponse.ok) {
        throw new Error('Upload test failed');
      }

      const uploadTime = uploadEnd - uploadStart;
      const uploadSpeed = (1024 * 8) / (uploadTime / 1000); // Convert to Kbps

      // Test latency
      const latencyStart = performance.now();
      await fetch('/api/speed-test?ping=true', {
        signal: speedTestRef.current.signal,
      });
      const latencyEnd = performance.now();
      const latency = latencyEnd - latencyStart;

      setDiagnostics(prev => prev ? {
        ...prev,
        speedTest: {
          downloadSpeed,
          uploadSpeed,
          latency,
          status: 'completed'
        }
      } : null);

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Speed test error:', error);
        setDiagnostics(prev => prev ? {
          ...prev,
          speedTest: { status: 'error' }
        } : null);
      }
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (kbps: number) => {
    if (kbps >= 1000) {
      return (kbps / 1000).toFixed(2) + ' Mbps';
    }
    return kbps.toFixed(2) + ' Kbps';
  };

  const getPerformanceStatus = (value: number, thresholds: { good: number; fair: number }) => {
    if (value <= thresholds.good) return 'good';
    if (value <= thresholds.fair) return 'fair';
    return 'poor';
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      good: 'bg-green-500',
      fair: 'bg-yellow-500',
      poor: 'bg-red-500',
    };
    return <Badge className={`${variants[status as keyof typeof variants] || 'bg-gray-500'} text-white`}>{status}</Badge>;
  };

  useEffect(() => {
    if (isOpen && !diagnostics) {
      runDiagnostics();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (speedTestRef.current) {
        speedTestRef.current.abort();
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-600">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Device Diagnostics</CardTitle>
            <Button onClick={onClose} variant="outline" size="sm">
              Close
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {isRunning ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="text-slate-300 mt-2">Running diagnostics...</p>
            </div>
          ) : diagnostics ? (
            <>
              {/* Device Information */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Device Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-300">Platform:</span>
                      <span className="text-white">{diagnostics.device.platform}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-300">CPU Cores:</span>
                      <span className="text-white">{diagnostics.device.hardwareConcurrency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-300">Touch Points:</span>
                      <span className="text-white">{diagnostics.device.maxTouchPoints}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-300">Online:</span>
                      <span className="text-white">{diagnostics.device.onLine ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-300">Screen:</span>
                      <span className="text-white">{diagnostics.screen.width}×{diagnostics.screen.height}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-300">Color Depth:</span>
                      <span className="text-white">{diagnostics.screen.colorDepth} bit</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-300">Orientation:</span>
                      <span className="text-white">{diagnostics.screen.orientation}</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="bg-slate-600" />

              {/* Memory Information */}
              {diagnostics.memory && (
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Memory Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {diagnostics.memory.deviceMemory && (
                        <div className="flex justify-between">
                          <span className="text-slate-300">Device Memory:</span>
                          <span className="text-white">{diagnostics.memory.deviceMemory} GB</span>
                        </div>
                      )}
                      {diagnostics.memory.jsHeapSizeLimit && (
                        <div className="flex justify-between">
                          <span className="text-slate-300">JS Heap Limit:</span>
                          <span className="text-white">{formatBytes(diagnostics.memory.jsHeapSizeLimit)}</span>
                        </div>
                      )}
                      {diagnostics.memory.usedJSHeapSize && (
                        <div className="flex justify-between">
                          <span className="text-slate-300">JS Heap Used:</span>
                          <span className="text-white">{formatBytes(diagnostics.memory.usedJSHeapSize)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Separator className="bg-slate-600" />
                </>
              )}

              {/* Network Information */}
              {diagnostics.network && (
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Network Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {diagnostics.network.effectiveType && (
                        <div className="flex justify-between">
                          <span className="text-slate-300">Connection Type:</span>
                          <span className="text-white">{diagnostics.network.effectiveType}</span>
                        </div>
                      )}
                      {diagnostics.network.downlink && (
                        <div className="flex justify-between">
                          <span className="text-slate-300">Downlink:</span>
                          <span className="text-white">{diagnostics.network.downlink} Mbps</span>
                        </div>
                      )}
                      {diagnostics.network.rtt && (
                        <div className="flex justify-between">
                          <span className="text-slate-300">Round Trip Time:</span>
                          <span className="text-white">{diagnostics.network.rtt} ms</span>
                        </div>
                      )}
                      {typeof diagnostics.network.saveData !== 'undefined' && (
                        <div className="flex justify-between">
                          <span className="text-slate-300">Data Saver:</span>
                          <span className="text-white">{diagnostics.network.saveData ? 'On' : 'Off'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Separator className="bg-slate-600" />
                </>
              )}

              {/* Performance Metrics */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Performance Metrics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Page Load Time:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white">{diagnostics.performance.loadTime.toFixed(2)} ms</span>
                      {getStatusBadge(getPerformanceStatus(diagnostics.performance.loadTime, { good: 1000, fair: 3000 }))}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">DOM Content Loaded:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white">{diagnostics.performance.domContentLoaded.toFixed(2)} ms</span>
                      {getStatusBadge(getPerformanceStatus(diagnostics.performance.domContentLoaded, { good: 800, fair: 1600 }))}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Render Time:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white">{diagnostics.performance.renderTime.toFixed(2)} ms</span>
                      {getStatusBadge(getPerformanceStatus(diagnostics.performance.renderTime, { good: 100, fair: 300 }))}
                    </div>
                  </div>
                  {diagnostics.performance.firstContentfulPaint && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300">First Contentful Paint:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white">{diagnostics.performance.firstContentfulPaint.toFixed(2)} ms</span>
                        {getStatusBadge(getPerformanceStatus(diagnostics.performance.firstContentfulPaint, { good: 1500, fair: 2500 }))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Separator className="bg-slate-600" />

              {/* Speed Test */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white">Network Speed Test</h3>
                  <Button 
                    onClick={runSpeedTest} 
                    disabled={diagnostics.speedTest.status === 'running'}
                    size="sm"
                    variant="outline"
                  >
                    {diagnostics.speedTest.status === 'running' ? 'Testing...' : 'Run Speed Test'}
                  </Button>
                </div>
                
                {diagnostics.speedTest.status === 'running' && (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-slate-300 mt-2">Testing network speed...</p>
                  </div>
                )}
                
                {diagnostics.speedTest.status === 'completed' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300">Download Speed:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white">{formatSpeed(diagnostics.speedTest.downloadSpeed!)}</span>
                        {getStatusBadge(getPerformanceStatus(diagnostics.speedTest.downloadSpeed!, { good: 10000, fair: 1000 }))}
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300">Upload Speed:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white">{formatSpeed(diagnostics.speedTest.uploadSpeed!)}</span>
                        {getStatusBadge(getPerformanceStatus(diagnostics.speedTest.uploadSpeed!, { good: 5000, fair: 500 }))}
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300">Latency:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white">{diagnostics.speedTest.latency!.toFixed(2)} ms</span>
                        {getStatusBadge(getPerformanceStatus(diagnostics.speedTest.latency!, { good: 100, fair: 300 }))}
                      </div>
                    </div>
                  </div>
                )}
                
                {diagnostics.speedTest.status === 'error' && (
                  <p className="text-red-400">Speed test failed. Please check your connection.</p>
                )}
              </div>

              {/* User Agent */}
              <Separator className="bg-slate-600" />
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">User Agent</h3>
                <p className="text-sm text-slate-300 break-all">{diagnostics.device.userAgent}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                <Button onClick={runDiagnostics} variant="outline" size="sm">
                  Refresh Diagnostics
                </Button>
                <Button 
                  onClick={() => {
                    const data = JSON.stringify(diagnostics, null, 2);
                    navigator.clipboard?.writeText(data);
                  }}
                  variant="outline" 
                  size="sm"
                >
                  Copy Results
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-300">No diagnostics data available.</p>
              <Button onClick={runDiagnostics} className="mt-4">
                Run Diagnostics
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}