import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { ArrowLeft, Mail, MessageSquare, Clock, MapPin, Trash2, MailOpen } from "lucide-react";
import type { MessageInbox, AlertSubscription } from "@shared/schema";

export default function MessageInboxPage() {
  const [selectedMessage, setSelectedMessage] = useState<MessageInbox | null>(null);
  const [searchEmail, setSearchEmail] = useState("");
  const queryClient = useQueryClient();

  // Get all messages
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["/api/messages/all"],
  });

  // Get subscriptions for email lookup
  const { data: subscriptions = [] } = useQuery({
    queryKey: ["/api/alerts/subscriptions"],
  });

  // Mark message as read
  const markAsReadMutation = useMutation({
    mutationFn: (messageId: number) => 
      apiRequest(`/api/messages/${messageId}/read`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/all"] });
    },
  });

  // Delete message
  const deleteMutation = useMutation({
    mutationFn: (messageId: number) => 
      apiRequest(`/api/messages/${messageId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/all"] });
      setSelectedMessage(null);
    },
  });

  // Filter messages by search email
  const filteredMessages = messages.filter((msg: MessageInbox) => 
    !searchEmail || msg.recipientEmail?.toLowerCase().includes(searchEmail.toLowerCase())
  );

  const unreadMessages = filteredMessages.filter((msg: MessageInbox) => !msg.isRead);
  const emailMessages = filteredMessages.filter((msg: MessageInbox) => msg.messageType === 'email');
  const smsMessages = filteredMessages.filter((msg: MessageInbox) => msg.messageType === 'sms');

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getIntensityColor = (intensity: number) => {
    if (intensity >= 61) return "bg-purple-500";
    if (intensity >= 55) return "bg-red-500";
    if (intensity >= 46) return "bg-orange-500";
    if (intensity >= 35) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getIntensityLabel = (intensity: number) => {
    if (intensity >= 61) return "Extreme";
    if (intensity >= 55) return "Very Heavy";
    if (intensity >= 46) return "Heavy";
    if (intensity >= 35) return "Moderate";
    return "Light";
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Tracker
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Message Inbox</h1>
        </div>
        <div className="text-center py-8">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tracker
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Storm Alert Messages</h1>
        <Badge variant="secondary" className="ml-auto">
          {unreadMessages.length} unread
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Message List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  All Messages ({filteredMessages.length})
                </CardTitle>
                <Input
                  placeholder="Search by email..."
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  className="w-64"
                />
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="all" className="space-y-4">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="all">All ({filteredMessages.length})</TabsTrigger>
                  <TabsTrigger value="unread">Unread ({unreadMessages.length})</TabsTrigger>
                  <TabsTrigger value="email">Email ({emailMessages.length})</TabsTrigger>
                  <TabsTrigger value="sms">SMS ({smsMessages.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="space-y-2">
                  {filteredMessages.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No messages found
                    </div>
                  ) : (
                    filteredMessages.map((message: MessageInbox) => (
                      <MessageItem 
                        key={message.id} 
                        message={message} 
                        onSelect={setSelectedMessage}
                        isSelected={selectedMessage?.id === message.id}
                      />
                    ))
                  )}
                </TabsContent>

                <TabsContent value="unread" className="space-y-2">
                  {unreadMessages.map((message: MessageInbox) => (
                    <MessageItem 
                      key={message.id} 
                      message={message} 
                      onSelect={setSelectedMessage}
                      isSelected={selectedMessage?.id === message.id}
                    />
                  ))}
                </TabsContent>

                <TabsContent value="email" className="space-y-2">
                  {emailMessages.map((message: MessageInbox) => (
                    <MessageItem 
                      key={message.id} 
                      message={message} 
                      onSelect={setSelectedMessage}
                      isSelected={selectedMessage?.id === message.id}
                    />
                  ))}
                </TabsContent>

                <TabsContent value="sms" className="space-y-2">
                  {smsMessages.map((message: MessageInbox) => (
                    <MessageItem 
                      key={message.id} 
                      message={message} 
                      onSelect={setSelectedMessage}
                      isSelected={selectedMessage?.id === message.id}
                    />
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Message Detail */}
        <div className="lg:col-span-1">
          {selectedMessage ? (
            <MessageDetail 
              message={selectedMessage}
              onMarkAsRead={() => markAsReadMutation.mutate(selectedMessage.id)}
              onDelete={() => deleteMutation.mutate(selectedMessage.id)}
            />
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Mail className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Select a message to view details
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageItem({ 
  message, 
  onSelect, 
  isSelected 
}: { 
  message: MessageInbox; 
  onSelect: (message: MessageInbox) => void;
  isSelected: boolean;
}) {
  const getIntensityColor = (intensity: number) => {
    if (intensity >= 61) return "bg-purple-500";
    if (intensity >= 55) return "bg-red-500";
    if (intensity >= 46) return "bg-orange-500";
    if (intensity >= 35) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getIntensityLabel = (intensity: number) => {
    if (intensity >= 61) return "Extreme";
    if (intensity >= 55) return "Very Heavy";
    if (intensity >= 46) return "Heavy";
    if (intensity >= 35) return "Moderate";
    return "Light";
  };

  return (
    <div 
      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
      } ${!message.isRead ? 'font-semibold' : ''}`}
      onClick={() => onSelect(message)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {message.messageType === 'email' ? (
              <Mail className="w-4 h-4" />
            ) : (
              <MessageSquare className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">
              {message.recipientName}
            </span>
            {!message.isRead && (
              <Badge variant="destructive" className="text-xs">New</Badge>
            )}
          </div>
          
          <p className="text-sm text-muted-foreground mb-1">
            {message.recipientEmail || message.recipientPhone}
          </p>
          
          <p className="text-sm font-medium mb-2">
            {message.subject}
          </p>
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(message.sentAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
            
            {message.maxIntensity > 0 && (
              <Badge 
                className={`text-white text-xs ${getIntensityColor(message.maxIntensity)}`}
              >
                {getIntensityLabel(message.maxIntensity)} ({message.maxIntensity} dBZ)
              </Badge>
            )}
            
            {message.stormCount > 0 && (
              <span>{message.stormCount} storms</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageDetail({ 
  message, 
  onMarkAsRead, 
  onDelete 
}: { 
  message: MessageInbox;
  onMarkAsRead: () => void;
  onDelete: () => void;
}) {
  const getIntensityColor = (intensity: number) => {
    if (intensity >= 61) return "bg-purple-500";
    if (intensity >= 55) return "bg-red-500";
    if (intensity >= 46) return "bg-orange-500";
    if (intensity >= 35) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getIntensityLabel = (intensity: number) => {
    if (intensity >= 61) return "Extreme";
    if (intensity >= 55) return "Very Heavy";
    if (intensity >= 46) return "Heavy";
    if (intensity >= 35) return "Moderate";
    return "Light";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {message.messageType === 'email' ? (
            <Mail className="w-5 h-5" />
          ) : (
            <MessageSquare className="w-5 h-5" />
          )}
          Message Details
        </CardTitle>
        <div className="flex gap-2">
          {!message.isRead && (
            <Button variant="outline" size="sm" onClick={onMarkAsRead}>
              <MailOpen className="w-4 h-4 mr-2" />
              Mark as Read
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">{message.subject}</h4>
          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>To:</strong> {message.recipientName}</p>
            <p><strong>Contact:</strong> {message.recipientEmail || message.recipientPhone}</p>
            <p><strong>Sent:</strong> {new Date(message.sentAt).toLocaleString()}</p>
            {message.readAt && (
              <p><strong>Read:</strong> {new Date(message.readAt).toLocaleString()}</p>
            )}
          </div>
        </div>

        {/* Storm Information */}
        {(message.stormCount > 0 || message.maxIntensity > 0) && (
          <div className="border-t pt-4">
            <h5 className="font-semibold mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Storm Alert Details
            </h5>
            <div className="text-sm space-y-2">
              {message.alertLocation && (
                <p><strong>Location:</strong> {message.alertLocation}</p>
              )}
              {message.stormCount > 0 && (
                <p><strong>Storms Detected:</strong> {message.stormCount}</p>
              )}
              {message.maxIntensity > 0 && (
                <div className="flex items-center gap-2">
                  <strong>Max Intensity:</strong>
                  <Badge className={`text-white ${getIntensityColor(message.maxIntensity)}`}>
                    {getIntensityLabel(message.maxIntensity)} ({message.maxIntensity} dBZ)
                  </Badge>
                </div>
              )}
              {message.nearestDistance > 0 && (
                <p><strong>Nearest Storm:</strong> {message.nearestDistance.toFixed(1)} miles</p>
              )}
            </div>
          </div>
        )}

        {/* Message Content */}
        <div className="border-t pt-4">
          <h5 className="font-semibold mb-2">Message Content</h5>
          <div className="bg-gray-50 p-3 rounded-lg">
            {message.htmlContent ? (
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: message.htmlContent }}
              />
            ) : (
              <pre className="text-sm whitespace-pre-wrap">{message.content}</pre>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}