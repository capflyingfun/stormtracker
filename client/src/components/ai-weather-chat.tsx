import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, Send, Bot, User, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/hooks/use-language';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface AIWeatherChatProps {
  userLocation: {
    lat: number;
    lon: number;
    address?: string;
  };
  useMetric: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

export function AIWeatherChat({ userLocation, useMetric, isOpen, onToggle }: AIWeatherChatProps) {
  const { language } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      text: "Hi! I'm your AI weather assistant. Ask me anything about current conditions, forecasts, or weather phenomena in your area. For example: 'What's the temperature?' or 'Will it rain today?'",
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');

  const chatMutation = useMutation({
    mutationFn: async (question: string) => {
      const response = await apiRequest("POST", "/api/ai-chat", {
        question,
        userLocation,
        useMetric,
        preferredLanguage: language
      });
      return response as { response: string; contextUsed: any };
    },
    onSuccess: (data) => {
      const assistantMessage: Message = {
        id: `ai-${Date.now()}`,
        text: data.response,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
    },
    onError: (error) => {
      console.error('AI chat error:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        text: "Sorry, I'm having trouble processing your question right now. Please try again in a moment.",
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || chatMutation.isPending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      text: inputText,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    chatMutation.mutate(inputText);
    setInputText('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Quick question suggestions
  const quickQuestions = [
    "What's the current temperature?",
    "Will it rain today?", 
    "How likely are thunderstorms?",
    "What's the wind speed?",
    "Are there any weather alerts?"
  ];

  if (!isOpen) {
    return (
      <Button
        onClick={onToggle}
        className="fixed bottom-4 right-4 rounded-full w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white shadow-lg z-50"
      >
        <MessageCircle className="w-6 h-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 w-96 h-96 bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-lg">Weather Assistant</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-8 w-8 p-0"
          >
            ✕
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${message.isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                message.isUser 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}>
                {message.isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`max-w-[280px] rounded-lg p-3 text-sm ${
                message.isUser 
                  ? 'bg-blue-600 text-white ml-2' 
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 mr-2'
              }`}>
                {message.text}
              </div>
            </div>
          ))}
          
          {/* Loading indicator */}
          {chatMutation.isPending && (
            <div className="flex gap-2">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <Bot className="w-4 h-4 text-gray-700 dark:text-gray-300" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Questions (only show when no messages yet) */}
        {messages.length === 1 && !chatMutation.isPending && (
          <div className="px-4 pb-2">
            <div className="text-xs text-gray-500 mb-2">Quick questions:</div>
            <div className="flex flex-wrap gap-1">
              {quickQuestions.slice(0, 3).map((question) => (
                <Button
                  key={question}
                  variant="outline"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => {
                    setInputText(question);
                    // Auto-submit after a brief delay to show the question first
                    setTimeout(() => {
                      const userMessage: Message = {
                        id: `user-${Date.now()}`,
                        text: question,
                        isUser: true,
                        timestamp: new Date()
                      };
                      setMessages(prev => [...prev, userMessage]);
                      chatMutation.mutate(question);
                      setInputText('');
                    }, 100);
                  }}
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="border-t p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask about the weather..."
              disabled={chatMutation.isPending}
              className="text-sm"
            />
            <Button 
              type="submit" 
              size="sm"
              disabled={!inputText.trim() || chatMutation.isPending}
              className="px-3"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}