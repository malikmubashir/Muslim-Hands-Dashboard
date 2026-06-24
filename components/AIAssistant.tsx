import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, X, Loader, Key } from 'lucide-react';
import { DashboardStats, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { generateAIResponse, getEnvApiKey } from '../services/geminiService';

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  stats: DashboardStats;
  lang: Language;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ isOpen, onClose, stats, lang }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  // API Key State for end-users
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [userApiKey, setUserApiKey] = useState('');
  const [tempKeyInput, setTempKeyInput] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    // Check if we have a key from Env or LocalStorage
    const envKey = getEnvApiKey();
    const storedKey = localStorage.getItem('gemini_api_key');
    
    if (!envKey && !storedKey) {
      setNeedsApiKey(true);
    } else {
      setNeedsApiKey(false);
      if (storedKey) setUserApiKey(storedKey);
    }

    if (isOpen && messages.length === 0) {
      setMessages([{ role: 'assistant', text: t.aiWelcome }]);
    }
  }, [isOpen, lang, messages.length, t.aiWelcome]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!isOpen) return null;

  const handleSaveKey = () => {
    if (tempKeyInput.trim()) {
      localStorage.setItem('gemini_api_key', tempKeyInput.trim());
      setUserApiKey(tempKeyInput.trim());
      setNeedsApiKey(false);
    }
  };

  const handleSend = async (textToUse: string = input) => {
    if (!textToUse.trim()) return;

    const userMsg: Message = { role: 'user', text: textToUse };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const responseText = await generateAIResponse(textToUse, stats, lang, userApiKey);
    
    setMessages(prev => [...prev, { role: 'assistant', text: responseText }]);
    setLoading(false);
  };

  const QuickChip = ({ text, prompt }: { text: string; prompt: string }) => (
    <button 
      onClick={() => handleSend(prompt)}
      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
    >
      {text}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-4 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg backdrop-blur-md">
              <Sparkles size={20} className="text-yellow-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{t.aiAssistant}</h2>
              <p className="text-green-100 text-xs opacity-90">Gemini Powered • Multi-language</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Chat Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 relative">
          
          {needsApiKey ? (
            <div className="absolute inset-0 z-10 bg-white/90 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="bg-white border border-gray-200 shadow-xl rounded-xl p-6 max-w-sm w-full text-center">
                <div className="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Key className="text-green-600" size={24} />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">API Key Required</h3>
                <p className="text-sm text-gray-600 mb-4">To use the AI Assistant, please enter your Google Gemini API Key.</p>
                <input 
                  type="password" 
                  placeholder="Paste your API key here"
                  value={tempKeyInput}
                  onChange={(e) => setTempKeyInput(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
                <button 
                  onClick={handleSaveKey}
                  disabled={!tempKeyInput}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  Save & Continue
                </button>
                <p className="text-xs text-gray-400 mt-4">
                  The key is stored locally in your browser and is never shared with us.
                </p>
              </div>
            </div>
          ) : null}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[85%] rounded-2xl p-4 shadow-sm text-sm whitespace-pre-wrap ${
                  msg.role === 'user' 
                    ? 'bg-green-600 text-white rounded-br-none' 
                    : 'bg-white border border-gray-200 text-gray-700 rounded-bl-none'
                } ${lang === 'ur' ? 'font-urdu' : 'font-sans'}`}
                dir={lang === 'ur' ? 'rtl' : 'ltr'}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-2">
                <Loader size={16} className="animate-spin text-green-600" />
                <span className="text-xs text-gray-500">{t.aiThinking}</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-gray-100 shrink-0">
          {!needsApiKey && messages.length < 3 && (
            <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar mb-2">
              <QuickChip text="📈 Analysis" prompt={t.quickPrompt1} />
              <QuickChip text="🌍 Geo" prompt={t.quickPrompt2} />
              <QuickChip text="✍️ Email" prompt={t.quickPrompt3} />
            </div>
          )}
          
          <div className="flex gap-2">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !needsApiKey && handleSend()}
              placeholder={needsApiKey ? "Enter API Key above..." : t.aiPlaceholder}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              disabled={loading || needsApiKey}
            />
            <button 
              onClick={() => handleSend()}
              disabled={loading || !input.trim() || needsApiKey}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};