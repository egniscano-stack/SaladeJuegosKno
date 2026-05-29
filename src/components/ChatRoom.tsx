import React, { useState, useRef, useEffect } from 'react';
import { useBingo } from '../context/BingoContext';
import { Send, MessageSquare } from 'lucide-react';

interface ChatRoomProps {
  playerName?: string;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({ playerName }) => {
  const { chatMessages, sendChatMessage } = useBingo();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendChatMessage(inputText, playerName);
    setInputText('');
  };

  return (
    <div className="panel-card chat-container">
      <div className="panel-header">
        <h3 className="panel-title">
          <MessageSquare size={18} className="text-violet-400" />
          Chat en Vivo
        </h3>
        <span style={{ fontSize: '0.75rem', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', padding: '0.1rem 0.5rem', borderRadius: '9999px', fontWeight: 'bold' }}>
          En línea
        </span>
      </div>

      <div className="chat-messages">
        {chatMessages.length === 0 ? (
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center', gap: '0.5rem' }}>
            <MessageSquare size={32} strokeWidth={1.5} />
            <p style={{ fontSize: '0.85rem' }}>No hay mensajes aún. ¡Comienza la conversación!</p>
          </div>
        ) : (
          chatMessages.map(msg => (
            <div 
              key={msg.id} 
              className={`chat-message-bubble ${msg.isHost ? 'is-host' : ''}`}
              style={{
                alignSelf: msg.isHost ? 'flex-start' : 'flex-end',
                borderRadius: msg.isHost ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                background: msg.isHost ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                border: msg.isHost ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid var(--border-color)',
                alignItems: msg.isHost ? 'flex-start' : 'flex-end'
              }}
            >
              <div className="chat-message-meta" style={{ justifyContent: msg.isHost ? 'flex-start' : 'flex-end' }}>
                <span className={`chat-username ${msg.isHost ? 'host-name' : ''}`}>
                  {msg.sender}
                </span>
                <span className="chat-time">{msg.timestamp}</span>
              </div>
              <p className="chat-text" style={{ textAlign: msg.isHost ? 'left' : 'right' }}>
                {msg.text}
              </p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="chat-input-wrapper">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="chat-input"
        />
        <button type="submit" className="chat-send-btn">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};
