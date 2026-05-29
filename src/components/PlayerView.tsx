import React, { useState, useEffect, useRef } from 'react';
import { useBingo } from '../context/BingoContext';
import { 
  Tv, CreditCard, 
  Award, Sparkles, User, ShoppingBag, Plus, Minus,
  Volume2, VolumeX
} from 'lucide-react';


export const PlayerView: React.FC = () => {
  const {
    chatMessages,
    sendChatMessage,
    drawnNumbers,
    lastDrawn,
    playerCards,
    setPlayerCards,
    pendingTransactions,
    playerName,
    setPlayerName,
    buyCards,
    leaveGame,
    isStreaming,
    gameConfig,
    submitClaim,
    pendingClaims,
    submitPayoutDetails,
    sendPayoutChatMessage
  } = useBingo();

  const winningCard = playerCards.find(c => c.isWinner);

  const [quantity, setQuantity] = useState(1);
  const [purchaseTxId, setPurchaseTxId] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [localMarked, setLocalMarked] = useState<Record<string, boolean[][]>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [streamFrame, setStreamFrame] = useState<string | null>(null);
  // Animated ball state
  const [animatedBall, setAnimatedBall] = useState<number | null>(null);
  const [showBallAnim, setShowBallAnim] = useState(false);

  // Private payout settlement states
  const [payoutMethod, setPayoutMethod] = useState<'yappy' | 'transfer'>('yappy');
  const [yappyQrBase64, setYappyQrBase64] = useState<string | null>(null);
  const [compressingQr, setCompressingQr] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountType, setAccountType] = useState<'Ahorro' | 'Corriente'>('Ahorro');
  const [accountNumber, setAccountNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [payoutChatInput, setPayoutChatInput] = useState('');
  
  const payoutChatMessagesEndRef = useRef<HTMLDivElement>(null);
 
  // Payer receipt states
  const [purchaseReceipt, setPurchaseReceipt] = useState<string | null>(null);
  const [compressingPurchase, setCompressingPurchase] = useState(false);
  const [purchaseSubmitted, setPurchaseSubmitted] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
 
  // Auto scroll private chat to bottom on new messages
  useEffect(() => {
    payoutChatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [playerCards, pendingClaims]);
 
  const compressPurchaseReceipt = (file: File) => {
    setCompressingPurchase(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > 150) {
            height = Math.round((height * 150) / width);
            width = 150;
          }
        } else {
          if (height > 150) {
            width = Math.round((width * 150) / height);
            height = 150;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/jpeg', 0.8);
          setPurchaseReceipt(base64);
          setCompressingPurchase(false);
        }
      };
      img.onerror = () => {
        setCompressingPurchase(false);
        alert('Error al procesar la imagen.');
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setCompressingPurchase(false);
      alert('Error al leer el archivo.');
    };
    reader.readAsDataURL(file);
  };

  const compressQrCode = (file: File) => {
    setCompressingQr(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Proportional resize to 150x150 max bounding box
        if (width > height) {
          if (width > 150) {
            height = Math.round((height * 150) / width);
            width = 150;
          }
        } else {
          if (height > 150) {
            width = Math.round((width * 150) / height);
            height = 150;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/jpeg', 0.8);
          setYappyQrBase64(base64);
          setCompressingQr(false);
        }
      };
      img.onerror = () => {
        setCompressingQr(false);
        alert('Error al procesar la imagen. Intenta con otra.');
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setCompressingQr(false);
      alert('Error al leer el archivo.');
    };
    reader.readAsDataURL(file);
  };

  // Live audio streaming refs & state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const queueRef = useRef<ArrayBuffer[]>([]);
  const [isMuted, setIsMuted] = useState(false);


  // Collapsible top chat state
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll collapsible chat to bottom
  useEffect(() => {
    if (chatExpanded) {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatExpanded]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput, playerName);
    setChatInput('');
  };

  const latestMessage = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;

  // Show animated ball every time a new number is drawn
  useEffect(() => {
    if (lastDrawn !== null) {
      setAnimatedBall(lastDrawn);
      setShowBallAnim(false);
      // brief delay so re-trigger works even for same-mount
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setShowBallAnim(true));
      });
      // hide overlay after 3.5s
      const t = setTimeout(() => setShowBallAnim(false), 3500);
      return () => clearTimeout(t);
    }
  }, [lastDrawn]);

  // Sync state request upon mounting PlayerView
  useEffect(() => {
    const syncBc = new BroadcastChannel('bingo-kno-sync-channel');
    syncBc.postMessage({ type: 'request-game-sync' });
    syncBc.close();
  }, []);

  // Receive LIVE stream frames from host
  useEffect(() => {
    const bc = new BroadcastChannel('bingo-kno-stream-channel');
    bc.addEventListener('message', (e: MessageEvent) => {
      setStreamFrame(e.data?.frame ?? null);
    });
    return () => { bc.close(); };
  }, []);

  // Manage muting / unmuting and playback initialization
  useEffect(() => {
    if (isMuted) {
      if (audioRef.current) audioRef.current.muted = true;
      return;
    }
    if (audioRef.current) {
      audioRef.current.muted = false;
      audioRef.current.play().catch(err => console.log('Autoplay audio wait:', err));
    }
  }, [isMuted]);

  // Set up WebM/MP4 MSE audio chunk streaming via BroadcastChannel
  useEffect(() => {
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audioRef.current = audio;
    document.body.appendChild(audio);

    if (typeof window === 'undefined' || !window.MediaSource) {
      console.warn('MediaSource API no está soportada en este navegador (ej. iOS Safari). El audio en vivo no funcionará.');
      return;
    }

    const ms = new MediaSource();
    mediaSourceRef.current = ms;
    audio.src = URL.createObjectURL(ms);

    let mimeType = 'audio/webm; codecs="opus"';
    if (typeof MediaRecorder !== 'undefined') {
      if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus') && MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }
    }

    ms.addEventListener('sourceopen', () => {
      try {
        const sb = ms.addSourceBuffer(mimeType);
        sourceBufferRef.current = sb;

        sb.addEventListener('updateend', () => {
          if (queueRef.current.length > 0 && !sb.updating) {
            const next = queueRef.current.shift();
            if (next) sb.appendBuffer(next);
          }
        });
      } catch (err) {
        console.error('Error adding SourceBuffer:', err);
      }
    });

    const audioBc = new BroadcastChannel('bingo-kno-audio-channel');
    
    const handleAudioMessage = (e: MessageEvent) => {
      const chunk = e.data?.audioChunk;
      if (!chunk) return;

      const sb = sourceBufferRef.current;
      if (sb) {
        if (!sb.updating && queueRef.current.length === 0) {
          try {
            sb.appendBuffer(chunk);
          } catch (err) {
            console.error('Error appending buffer directly:', err);
          }
        } else {
          queueRef.current.push(chunk);
        }

        // Try playing if paused (handles user gesture autoplay resumption)
        if (audio.paused && !isMuted) {
          audio.play().catch(() => {});
        }
      }
    };

    audioBc.addEventListener('message', handleAudioMessage);

    return () => {
      audioBc.removeEventListener('message', handleAudioMessage);
      audioBc.close();
      audio.pause();
      if (audio.parentNode) {
        document.body.removeChild(audio);
      }
      audioRef.current = null;
    };
  }, []);

  const getBallLetter = (num: number) => {
    if (num >= 1 && num <= 15) return 'B';
    if (num >= 16 && num <= 30) return 'I';
    if (num >= 31 && num <= 45) return 'N';
    if (num >= 46 && num <= 60) return 'G';
    return 'O';
  };

  const getBallColor = (letter: string) => {
    switch (letter) {
      case 'B': return { bg: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', shadow: '#3b82f6' };
      case 'I': return { bg: 'linear-gradient(135deg,#f59e0b,#d97706)', shadow: '#f59e0b' };
      case 'N': return { bg: 'linear-gradient(135deg,#10b981,#059669)', shadow: '#10b981' };
      case 'G': return { bg: 'linear-gradient(135deg,#ec4899,#be185d)', shadow: '#ec4899' };
      case 'O': return { bg: 'linear-gradient(135deg,#f97316,#c2410c)', shadow: '#f97316' };
      default:  return { bg: 'linear-gradient(135deg,#6b7280,#374151)', shadow: '#6b7280' };
    }
  };

  // Synced card states for interactive clicking
  useEffect(() => {
    playerCards.forEach(card => {
      if (!localMarked[card.id]) {
        setLocalMarked(prev => ({
          ...prev,
          [card.id]: card.marked
        }));
      }
    });
  }, [playerCards]);

  // Auto-mark numbers on player cards in real-time when they are drawn
  useEffect(() => {
    if (drawnNumbers.length === 0 || playerCards.length === 0) return;

    setLocalMarked(prev => {
      const nextMarked = { ...prev };
      let hasUpdates = false;

      playerCards.forEach(card => {
        const currentGrid = nextMarked[card.id] 
          ? nextMarked[card.id].map(row => [...row]) 
          : card.marked.map(row => [...row]);

        let cardUpdated = false;
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            const val = card.matrix[r][c];
            if (val !== null && drawnNumbers.includes(val) && !currentGrid[r][c]) {
              currentGrid[r][c] = true;
              cardUpdated = true;
            }
          }
        }

        if (cardUpdated) {
          nextMarked[card.id] = currentGrid;
          card.marked = currentGrid; // sync back to context model
          hasUpdates = true;
        }
      });

      return hasUpdates ? nextMarked : prev;
    });
  }, [drawnNumbers, playerCards]);

  // Track transaction approvals to automatically close QR modal
  useEffect(() => {
    if (purchaseTxId) {
      const currentTx = pendingTransactions.find(t => t.id === purchaseTxId);
      if (currentTx) {
        if (currentTx.status === 'approved') {
          setShowQrModal(false);
          setPurchaseTxId(null);
          setPurchaseReceipt(null);
          setPurchaseSubmitted(false);
          triggerToast('¡Pago de Yappy aprobado! Cartones digitales agregados.');
        } else if (currentTx.status === 'rejected') {
          triggerToast('❌ Tu pago de Yappy fue rechazado por el administrador de sala.');
        }
      }
    }
  }, [pendingTransactions, purchaseTxId]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handlePurchase = () => {
    const tempTxId = `YAP-${Math.floor(100000 + Math.random() * 900000)}`;
    setPurchaseTxId(tempTxId);
    setPurchaseReceipt(null);
    setPurchaseSubmitted(false);
    setShowQrModal(true);
  };

  const toggleCell = (cardId: string, rowIndex: number, colIndex: number, cellVal: number | null) => {
    // Free space cannot be unmarked
    if (rowIndex === 2 && colIndex === 2) return;

    setLocalMarked(prev => {
      const grid = prev[cardId] ? prev[cardId].map(row => [...row]) : Array(5).fill(null).map(() => Array(5).fill(false));
      grid[rowIndex][colIndex] = !grid[rowIndex][colIndex];
      
      // Update central state context as well to make it synced
      const card = playerCards.find(c => c.id === cardId);
      if (card) {
        card.marked = grid;
      }

      // Visual validation feedback
      if (grid[rowIndex][colIndex] && cellVal !== null) {
        if (drawnNumbers.includes(cellVal)) {
          triggerToast(`¡Bien marcado! El número ${cellVal} ya fue cantado.`);
        } else {
          triggerToast(`⚠️ Marcado Preventivo: El número ${cellVal} aún no ha sido cantado.`);
        }
      }

      return {
        ...prev,
        [cardId]: grid
      };
    });
  };

  const handleClaim = (cardId: string) => {
    submitClaim(cardId, playerName);
    const winTypeString = 
      gameConfig.winningMechanic === 'full' ? 'Cartón Lleno' :
      gameConfig.winningMechanic === 'cajon' ? 'Cajón' :
      gameConfig.winningMechanic === 'terna' ? 'Terna' : 'Línea';
    triggerToast(`🎉 ¡Gritaste ${winTypeString}! Tu cartón fue enviado al administrador de sala para su verificación en vivo.`);
  };



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div className="toast-alert" style={{ zIndex: 1100 }}>
          <Sparkles size={18} className="text-amber-400" />
          <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: 500 }}>{toastMessage}</span>
        </div>
      )}
      {/* Dynamic Game Config Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(18, 20, 32, 0.4) 100%)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(139, 92, 246, 0.18)',
        borderRadius: 'var(--radius-md)',
        padding: '0.75rem 1rem',
        display: 'flex',
        gap: '1.5rem',
        flexWrap: 'wrap',
        boxShadow: 'var(--shadow-sm)',
        fontSize: '0.85rem'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
          🏆 Modo de Juego: <strong style={{ color: 'var(--accent-gold)', marginLeft: '0.15rem' }}>
            {gameConfig.winningMechanic === 'full' ? 'Cartón Lleno (24 celdas)' :
             gameConfig.winningMechanic === 'cajon' ? 'Cajón (Marco Exterior)' :
             gameConfig.winningMechanic === 'terna' ? 'Terna (Horizontal >= 3)' :
             'Línea (Horiz/Vert/Diag)'}
          </strong>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
          💸 Precio Cartón: <strong style={{ color: 'white', marginLeft: '0.15rem' }}>${(Number(gameConfig.cardPrice) || 0).toFixed(2)} USD</strong>
        </span>
      </div>

      {/* Collapsible Top Chat Room Bar */}
      <div 
        style={{
          background: 'rgba(18, 20, 32, 0.9)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(139, 92, 246, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '0.6rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: chatExpanded ? '0.75rem' : '0',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: chatExpanded ? '0 10px 25px rgba(0, 0, 0, 0.4)' : 'var(--shadow-sm)',
          maxHeight: chatExpanded ? '300px' : '45px',
          overflow: 'hidden'
        }}
      >
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '24px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, overflow: 'hidden' }}>
            <span className="badge-live" style={{ background: 'var(--accent-violet)', animation: 'none', padding: '0.15rem 0.5rem', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <span className="voice-status-dot" style={{ backgroundColor: 'white', boxShadow: 'none', width: '6px', height: '6px' }}></span>
              CHAT
            </span>
            
            {/* Collapsed message preview ticker */}
            {!chatExpanded && (
              <div 
                style={{ 
                  fontSize: '0.8rem', 
                  color: 'var(--text-secondary)', 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  animation: latestMessage ? 'flash-message 0.3s ease' : 'none',
                  flex: 1
                }}
              >
                {latestMessage ? (
                  <>
                    <strong style={{ color: latestMessage.isHost ? '#c084fc' : 'white' }}>{latestMessage.sender}</strong>: {latestMessage.text}
                  </>
                ) : (
                  <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No hay mensajes de chat aún. ¡Saluda!</span>
                )}
              </div>
            )}
          </div>
          
          <button 
            onClick={() => setChatExpanded(!chatExpanded)}
            style={{ 
              background: 'rgba(139, 92, 246, 0.15)', 
              border: '1px solid rgba(139, 92, 246, 0.3)', 
              color: '#c084fc', 
              fontSize: '0.75rem', 
              padding: '0.2rem 0.6rem', 
              borderRadius: '4px', 
              cursor: 'pointer', 
              fontWeight: 'bold',
              transition: 'var(--transition-fast)'
            }}
          >
            {chatExpanded ? '✕ Contraer' : '💬 Abrir Chat'}
          </button>
        </div>

        {/* Expanded Messages Log */}
        {chatExpanded && (
          <>
            <div 
              style={{ 
                flex: 1, 
                maxHeight: '160px', 
                overflowY: 'auto', 
                padding: '0.5rem 0', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.5rem',
                borderTop: '1px solid var(--border-color)',
                borderBottom: '1px solid var(--border-color)',
                marginTop: '0.25rem'
              }}
            >
              {chatMessages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  Escribe un mensaje abajo para comenzar
                </div>
              ) : (
                chatMessages.map(msg => (
                  <div 
                    key={msg.id} 
                    style={{ 
                      alignSelf: msg.isHost ? 'flex-start' : 'flex-end',
                      background: msg.isHost ? 'rgba(139, 92, 246, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                      border: msg.isHost ? '1px solid rgba(139, 92, 246, 0.25)' : '1px solid var(--border-color)',
                      borderRadius: msg.isHost ? '4px 10px 10px 10px' : '10px 4px 10px 10px',
                      padding: '0.4rem 0.6rem',
                      maxWidth: '85%',
                      fontSize: '0.8rem'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.1rem', justifyContent: msg.isHost ? 'flex-start' : 'flex-end' }}>
                      <strong style={{ color: msg.isHost ? '#c084fc' : 'white' }}>{msg.sender}</strong>
                      <span>{msg.timestamp}</span>
                    </div>
                    <p style={{ color: '#e2e8f0', wordBreak: 'break-word', textAlign: msg.isHost ? 'left' : 'right' }}>{msg.text}</p>
                  </div>
                ))
              )}
              <div ref={chatMessagesEndRef} />
            </div>

            {/* Expanded Chat Input Form */}
            <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '0.4rem' }}>
              <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Escribe en el chat de la sala..."
                style={{
                  flex: 1,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '0.35rem 0.75rem',
                  color: 'white',
                  fontSize: '0.8rem',
                  outline: 'none'
                }}
              />
              <button 
                type="submit" 
                style={{
                  background: 'var(--accent-violet)',
                  border: 'none',
                  color: 'white',
                  borderRadius: '4px',
                  padding: '0.35rem 0.75rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 'bold'
                }}
              >
                Enviar
              </button>
            </form>
          </>
        )}
      </div>

      {/* Main content grid: stream + digital cards in Left Column, others in Right Column */}
      <div className="player-layout-grid">
        {/* Left/Main Column: Stream Viewer & Digital Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Transmisión en Vivo */}
          <div className="panel-card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <h3 className="panel-title" style={{ fontSize: '0.9rem' }}>
                <Tv size={14} className="text-violet-400" /> Transmisión en Vivo
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {isStreaming && (
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    style={{
                      background: 'rgba(139, 92, 246, 0.15)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '4px',
                      color: isMuted ? '#6b7280' : '#c084fc',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.2rem 0.4rem',
                      transition: 'var(--transition-fast)',
                      outline: 'none'
                    }}
                    title={isMuted ? 'Activar Audio' : 'Silenciar'}
                  >
                    {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                    <span style={{ fontSize: '0.65rem', marginLeft: '0.2rem', fontWeight: 'bold' }}>
                      {isMuted ? 'SILENCIO' : 'AUDIO'}
                    </span>
                  </button>
                )}
                {isStreaming && <span className="badge-live" style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem' }}><span className="voice-status-dot" />LIVE HD</span>}
              </div>
            </div>

            <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
              {isStreaming && streamFrame
                ? <img src={streamFrame} alt="Transmisión del Administrador" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'linear-gradient(135deg,#0d0a1f,#050311)', minHeight: '120px', aspectRatio: '16/9' }}>
                    <Tv size={28} style={{ color: 'rgba(255,255,255,0.2)', animation: isStreaming ? 'pulse 2s infinite' : 'none' }} />
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                      {isStreaming ? 'Conectando con la transmisión...' : 'Esperando al administrador de sala para iniciar el directo...'}
                    </span>
                  </div>
              }

              {/* ── Animated Ball Overlay inside the live viewport ── */}
              {showBallAnim && animatedBall !== null && (() => {
                const letter = getBallLetter(animatedBall);
                const { bg, shadow } = getBallColor(letter);
                return (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
                    animation: 'fadeInOverlay 0.3s ease',
                    pointerEvents: 'none'
                  }}>
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
                      animation: 'ballPopBig 0.5s cubic-bezier(0.175,0.885,0.32,1.275)'
                    }}>
                      {/* Glow rings */}
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ position: 'absolute', width: '130px', height: '130px', borderRadius: '50%', background: `${shadow}22`, animation: 'ringPulse 1s ease infinite' }} />
                        <div style={{ position: 'absolute', width: '105px', height: '105px', borderRadius: '50%', background: `${shadow}33`, animation: 'ringPulse 1s ease 0.15s infinite' }} />
                        {/* Ball */}
                        <div style={{
                          width: '80px', height: '80px', borderRadius: '50%',
                          background: bg,
                          boxShadow: `0 0 35px ${shadow}bb, 0 0 70px ${shadow}55`,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          position: 'relative'
                        }}>
                          {/* Highlight */}
                          <div style={{ position: 'absolute', top: '8px', left: '14px', width: '20px', height: '12px', borderRadius: '50%', background: 'rgba(255,255,255,0.35)', transform: 'rotate(-30deg)' }} />
                          <span style={{ fontSize: '0.8rem', fontWeight: 900, color: 'rgba(255,255,255,0.9)', lineHeight: 1, letterSpacing: '0.5px' }}>{letter}</span>
                          <span style={{ fontSize: '2.3rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{animatedBall}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 900, color: 'white', letterSpacing: '1px', textShadow: `0 0 10px ${shadow}` }}>¡{letter} - {animatedBall}!</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* A. Balota actual del administrador */}
          <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="panel-title" style={{ fontSize: '1rem' }}>
                <Sparkles size={16} className="text-amber-400" />
                Balota Actual
              </h3>
              {drawnNumbers.length > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Cantadas: <strong>{drawnNumbers.length}/75</strong></span>}
            </div>

            {lastDrawn ? (() => {
              const letter = getBallLetter(lastDrawn);
              const { bg, shadow } = getBallColor(letter);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
                  <div style={{
                    width: '90px', height: '90px', borderRadius: '50%',
                    background: bg, boxShadow: `0 0 28px ${shadow}88`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    animation: 'ballPop 0.4s ease'
                  }}>
                    <span style={{ fontSize: '1rem', fontWeight: 900, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }}>{letter}</span>
                    <span style={{ fontSize: '2.5rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{lastDrawn}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Última balota cantada</div>
                  {/* Últimas 5 balotas */}
                  {drawnNumbers.length > 1 && (
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {[...drawnNumbers].slice(-5).reverse().slice(1).map(n => {
                        const l = getBallLetter(n);
                        const { bg: bg2 } = getBallColor(l);
                        return (
                          <div key={n} style={{ width: '32px', height: '32px', borderRadius: '50%', background: bg2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
                            <span style={{ fontSize: '0.5rem', color: 'white', fontWeight: 900 }}>{l}</span>
                            <span style={{ fontSize: '0.75rem', color: 'white', fontWeight: 900, lineHeight: 1 }}>{n}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })() : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '1rem 0' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '2px dashed rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '2rem', color: 'rgba(255,255,255,0.2)' }}>?</span>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Esperando al administrador...</span>
              </div>
            )}
          </div>

          {/* B. Digital Cards */}
          <div className="panel-card" style={{ flex: 1, padding: '0.75rem' }}>
            <div className="panel-header" style={{ padding: '0.5rem 0.25rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.75rem' }}>
              <h3 className="panel-title" style={{ fontSize: '1rem' }}>
                <Sparkles size={16} className="text-amber-400" />
                Mis Cartones Digitales
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Total: <strong>{playerCards.length} activos</strong>
              </span>
            </div>

            <div className="panel-body" style={{ overflowY: 'auto', padding: '0.25rem', gap: '1rem' }}>
              {/* Purchase panel if no cards */}
              {playerCards.length === 0 ? (
                <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '1.5rem 1rem', background: 'rgba(255,255,255,0.01)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-color)', gap: '1rem' }}>
                  <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(0, 136, 204, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0088cc' }}>
                    <ShoppingBag size={24} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 'bold', color: 'white' }}>¡Adquiere tus Cartones!</h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '280px', margin: '0.2rem auto 0 auto' }}>
                      Cada cartón digital es único y cuesta solo <strong>${(Number(gameConfig.cardPrice) || 0).toFixed(2)} Yappy</strong>. Paga de forma segura.
                    </p>
                  </div>
 
                   {/* Counter quantity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-primary)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <button 
                      onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                      style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <Minus size={14} />
                    </button>
                    <span style={{ fontStyle: 'normal', fontWeight: 'bold', fontSize: '1rem', width: '18px', color: 'white' }}>{quantity}</span>
                    <button 
                      onClick={() => setQuantity(prev => Math.min(6, prev + 1))}
                      style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
 
                  <button className="btn-accent" onClick={handlePurchase} style={{ width: '100%', maxWidth: '240px', padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'linear-gradient(135deg, #0088cc 0%, #006699 100%)', boxShadow: '0 4px 10px rgba(0, 136, 204, 0.3)' }}>
                    <CreditCard size={14} /> Pagar con Yappy QR
                  </button>
                </div>
              ) : (
                /* Cards interactive grid: side-by-side row wrap */
                <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'center' }}>
                  {playerCards.map((card, cardIdx) => {
                    const isCardWinner = card.isWinner;
                    return (
                      <div key={card.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: '1 1 300px', maxWidth: '340px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                            Cartón #{cardIdx + 1} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({card.id.substr(-6).toUpperCase()})</span>
                          </span>

                          <button 
                            className="btn-accent" 
                            onClick={() => handleClaim(card.id)}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px' }}
                            disabled={drawnNumbers.length === 0}
                          >
                            <Award size={12} /> ¡Cantar BINGO!
                          </button>
                        </div>

                        {isCardWinner && (
                          <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid var(--accent-gold)', borderRadius: 'var(--radius-sm)', padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', color: 'var(--accent-gold)', fontSize: '0.75rem', fontWeight: 'bold' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <Sparkles size={14} />
                              <span>¡Ganador de {card.type}! Verificación aprobada.</span>
                            </div>
                            <button
                              onClick={() => {
                                setPlayerCards(prev => prev.map(c => c.id === card.id ? { ...c, isWinner: true } : c));
                              }}
                              style={{
                                marginTop: '0.2rem',
                                padding: '0.3rem 0.5rem',
                                fontSize: '0.7rem',
                                background: 'var(--accent-gold)',
                                color: 'black',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.2rem',
                                boxShadow: '0 2px 6px rgba(245,158,11,0.2)'
                              }}
                            >
                              💼 Cobrar / Ver Chat de Pago
                            </button>
                          </div>
                        )}

                        {/* 5x5 Board grid */}
                        <div className="bingo-card-container">
                          <div className="bingo-card-header-row">
                            {['B', 'I', 'N', 'G', 'O'].map(letter => (
                              <div key={letter} className="bingo-card-header-cell" style={{ fontSize: '1.2rem', aspectRatio: 1.1 }}>{letter}</div>
                            ))}
                          </div>

                          <div className="bingo-card-grid">
                            {card.matrix.map((row, rIdx) => 
                              row.map((val, cIdx) => {
                                const isFree = rIdx === 2 && cIdx === 2;
                                const isMarked = localMarked[card.id] ? localMarked[card.id][rIdx][cIdx] : isFree;
                                const isValidCalled = val !== null && drawnNumbers.includes(val);

                                return (
                                  <div
                                    key={`${rIdx}-${cIdx}`}
                                    onClick={() => toggleCell(card.id, rIdx, cIdx, val)}
                                    className={`bingo-card-cell ${isMarked ? 'is-marked' : ''} ${isFree ? 'is-free' : ''}`}
                                    style={{
                                      fontSize: '1rem',
                                      borderColor: (isMarked && isValidCalled) ? 'var(--success)' : 
                                                   (isMarked && !isValidCalled && val !== null) ? 'var(--danger)' : 'var(--border-color)',
                                      boxShadow: (isMarked && isValidCalled) ? '0 0 8px rgba(16, 185, 129, 0.2)' : 'none'
                                    }}
                                  >
                                    {isFree ? 'LIBRE' : val}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right/Secondary Column: Recent Balls, Profile, Leave Button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Recent Balls Monitor */}
          <div className="panel-card" style={{ flex: '0 0 auto' }}>
            <div className="panel-header" style={{ padding: '0.75rem 1rem' }}>
              <h3 className="panel-title" style={{ fontSize: '0.9rem' }}>
                🏆 Últimas Bolas Cantadas
              </h3>
            </div>
            <div className="panel-body" style={{ flexDirection: 'row', gap: '0.4rem', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', padding: '0.75rem' }}>
              {drawnNumbers.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic', textAlign: 'center', width: '100%', padding: '0.5rem 0' }}>
                  Esperando sorteo...
                </div>
              ) : (
                drawnNumbers.slice(-5).reverse().map((num, i) => (
                  <div 
                    key={num} 
                    className={`ball-indicator ${i === 0 ? 'last-drawn' : 'is-drawn'}`}
                    style={{ width: '36px', height: '36px', fontSize: '0.85rem', fontStyle: 'normal' }}
                  >
                    {num}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* User Profile Card */}
          <div className="panel-card" style={{ padding: '0.75rem', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem', paddingLeft: '0.25rem' }}>
              <User size={12} /> Perfil del Jugador
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                value={playerName} 
                onChange={(e) => setPlayerName(e.target.value)} 
                placeholder="Tu nombre o apodo"
                style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.8rem', padding: '0.35rem 0.5rem', color: 'white', outline: 'none' }}
              />
            </div>
          </div>

          {/* Leave game button */}
          <button className="btn-secondary" onClick={leaveGame} style={{ width: '100%', padding: '0.5rem 1rem', fontSize: '0.85rem', height: '36px', justifyContent: 'center' }}>
            Abandonar Partida
          </button>
        </div>
      </div>

      {/* Yappy QR Payment Modal */}
      {/* Yappy QR Payment Modal */}
      {showQrModal && purchaseTxId && (() => {
        const tx = pendingTransactions.find(t => t.id === purchaseTxId);
        return (
          <div className="yappy-modal-overlay">
            <div className="yappy-card" style={{ maxWidth: '400px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="yappy-header">
                <h3 className="yappy-brand-name">Yappy Panamá</h3>
                <p style={{ fontSize: '0.8rem', opacity: 0.9 }}>Pago Directo e Instantáneo</p>
              </div>
              
              {tx && tx.status === 'rejected' && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  padding: '0.6rem 0.75rem',
                  color: '#f87171',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  margin: '1.2rem 1.2rem 0 1.2rem',
                  textAlign: 'left',
                  boxShadow: '0 0 10px rgba(239, 68, 68, 0.15)'
                }}>
                  ❌ Pago rechazado por el administrador de sala: {tx.rejectionReason || 'Comprobante inválido.'}
                </div>
              )}

              <div className="yappy-qr-container">
                {gameConfig.qrCode ? (
                  <img 
                    src={gameConfig.qrCode} 
                    alt="QR Yappy Administrador" 
                    style={{ 
                      width: '120px', 
                      height: '120px', 
                      objectFit: 'contain', 
                      background: 'white', 
                      padding: '6px', 
                      borderRadius: '8px', 
                      border: '3px solid #0088cc',
                      boxShadow: '0 4px 15px rgba(0, 136, 204, 0.2)'
                    }} 
                  />
                ) : (
                  /* Custom simulated QR code using SVG styling */
                  <div className="yappy-qr-placeholder" style={{ width: '120px', height: '120px' }}>
                    <svg width="120" height="120" viewBox="0 0 29 29" style={{ shapeRendering: 'crispEdges' }}>
                      <path fill="#000" d="M0 0h7v7H0zm22 0h7v7h-7zM0 22h7v7H0zm13-17h2v2h-2zm-2 2h2v2h-2zm4 0h2v2h-2zm-2 2h2v2h-2zm-6 2h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-6 2h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z" />
                      <path fill="#0088cc" d="M3 3h1v1H3zm1 1h1v1H4zm1 1h1v1H5zm15-2h1v1h-1zm1 1h1v1h-1zm1 1h1v1h-1zM3 25h1v1H3zm1 1h1v1H4zm1 1h1v1H5zm16-16h2v2h-2zm-2 2h2v2h-2zm4 0h2v2h-2zm-2 2h2v2h-2z" />
                    </svg>
                    <div className="yappy-qr-inner-logo" style={{ fontSize: '0.65rem' }}>Yp</div>
                  </div>
                )}
                <p style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '0.9rem', marginTop: '0.5rem', marginBottom: 0 }}>
                  Monto: ${(quantity * (Number(gameConfig.cardPrice) || 0)).toFixed(2)} USD
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.1rem', marginBottom: 0 }}>
                  Referencia temporal: {purchaseTxId}
                </p>
              </div>
   
              <div className="yappy-step-info" style={{ gap: '0.5rem', padding: '0.75rem 1rem' }}>
                <ol style={{ textAlign: 'left', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', margin: 0 }}>
                  <li>Abre tu app de <strong>Banco General</strong>.</li>
                  <li>Escanea este código QR o busca en Yappy con los datos del administrador:</li>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.3rem 0.5rem', color: '#1e293b', fontSize: '0.7rem', fontWeight: 'bold', fontStyle: 'normal', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {gameConfig.paymentDetails}
                  </div>
                  
                  {!purchaseSubmitted ? (
                    <>
                      <li style={{ color: 'var(--accent-purple)', fontWeight: 'bold' }}>Sube captura de tu transferencia de pago:</li>
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) compressPurchaseReceipt(file);
                        }}
                        style={{
                          fontSize: '0.7rem', color: '#1e293b', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '0.25rem', borderRadius: '4px', width: '100%', cursor: 'pointer'
                        }}
                      />
                      {compressingPurchase && <p style={{ fontSize: '0.65rem', color: 'var(--accent-gold)', margin: 0 }}>⏳ Comprimiendo comprobante...</p>}
                      {purchaseReceipt && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                          <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 'bold' }}>✓ Comprobante cargado</span>
                          <img src={purchaseReceipt} alt="Receipt Preview" style={{ width: '40px', height: '40px', borderRadius: '4px', border: '1px solid #10b981' }} />
                        </div>
                      )}
                    </>
                  ) : (
                    <li>
                      {tx && tx.status === 'rejected' ? (
                        <span style={{ color: '#ef4444', fontWeight: 'bold' }}>❌ El administrador rechazó este pago. Por favor sube un nuevo comprobante.</span>
                      ) : (
                        <span>Comprobante de pago enviado con éxito. Esperando aprobación.</span>
                      )}
                    </li>
                  )}
                </ol>
   
                {purchaseSubmitted && tx && tx.status === 'pending' && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.7rem', background: '#e0f2fe', color: '#0369a1', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span className="voice-status-dot" style={{ backgroundColor: '#0088cc', boxShadow: '0 0 6px #0088cc' }}></span>
                      Esperando aprobación del Administrador de Sala...
                    </span>
                  </div>
                )}
              </div>
   
              <div style={{ padding: '0 1rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {!purchaseSubmitted ? (
                  <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                    <button 
                      className="btn-secondary" 
                      onClick={() => {
                        setShowQrModal(false);
                        setPurchaseTxId(null);
                        setPurchaseReceipt(null);
                        setPurchaseSubmitted(false);
                      }} 
                      style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem' }}
                    >
                      Cancelar
                    </button>
                    <button 
                      className="btn-primary" 
                      onClick={async () => {
                        if (!purchaseReceipt) {
                          alert('Por favor sube la captura de tu transferencia de pago Yappy.');
                          return;
                        }
                        const txId = await buyCards(quantity, playerName, purchaseReceipt);
                        setPurchaseTxId(txId);
                        setPurchaseSubmitted(true);
                        triggerToast('¡Comprobante de pago enviado al organizador!');
                      }} 
                      disabled={compressingPurchase}
                      style={{ flex: 1.5, padding: '0.4rem', fontSize: '0.8rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderColor: '#10b981', color: 'white' }}
                    >
                      🚀 Enviar Comprobante
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                    {tx && tx.status === 'rejected' && (
                      <button 
                        className="btn-primary" 
                        onClick={() => {
                          setPurchaseSubmitted(false);
                          setPurchaseReceipt(null);
                        }} 
                        style={{ 
                          width: '100%', 
                          padding: '0.5rem', 
                          fontSize: '0.8rem', 
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', 
                          borderColor: '#8b5cf6', 
                          color: 'white',
                          fontWeight: 'bold',
                          justifyContent: 'center'
                        }}
                      >
                        🔄 Subir Nuevo Comprobante
                      </button>
                    )}
                    <button 
                      className="btn-secondary" 
                      onClick={() => {
                        setShowQrModal(false);
                        setPurchaseTxId(null);
                        setPurchaseReceipt(null);
                        setPurchaseSubmitted(false);
                      }} 
                      style={{ width: '100%', padding: '0.4rem', fontSize: '0.8rem', justifyContent: 'center' }}
                    >
                      Cerrar Ventana
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
      {winningCard && (() => {
        const activeClaim = pendingClaims.find(c => c.cardId === winningCard.id && c.status === 'approved');
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 4000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)',
            animation: 'fadeInOverlay 0.3s ease',
            padding: '1rem'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.96) 0%, rgba(18, 16, 38, 0.96) 100%)',
              border: '2px solid var(--accent-gold)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: '520px',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '1.75rem 1.5rem',
              textAlign: 'center',
              boxShadow: '0 0 50px rgba(245, 158, 11, 0.4), 0 0 100px rgba(245, 158, 11, 0.2)',
              animation: 'ballPopBig 0.5s cubic-bezier(0.175,0.885,0.32,1.275)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              position: 'relative'
            }}>
              <div style={{ position: 'absolute', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(245,158,11,0.06)', filter: 'blur(30px)', top: '-50px', left: '150px', pointerEvents: 'none' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', justifyContent: 'center' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px var(--accent-gold)' }}>
                  <Award size={28} style={{ color: 'white' }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <span className="badge-live" style={{ background: 'var(--accent-gold)', color: 'black', animation: 'pulse 1.5s infinite', fontSize: '0.7rem', padding: '0.2rem 0.5rem', fontWeight: 900 }}>🏆 ¡BINGO COMPLETO!</span>
                  <h2 style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'white', fontFamily: 'var(--font-display)', margin: 0 }}>¡FELICIDADES!</h2>
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '0.75rem 1rem', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>MECÁNICA:</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--accent-gold)', textTransform: 'uppercase' }}>{winningCard.type}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>PREMIO GANADO:</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981' }}>{gameConfig.payoutAmount || '$150.00 USD'}</div>
                </div>
              </div>

              {/* Settlement Form or Bilateral Chat Feed */}
              {!activeClaim ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '2rem 0' }}>
                  <span className="spinner-border" style={{ width: '24px', height: '24px', border: '3px solid var(--accent-gold)', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cargando consola de cobros...</p>
                </div>
              ) : (!activeClaim.payoutStatus || activeClaim.payoutStatus === 'pending') ? (
                <div style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'white', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                    <CreditCard size={16} style={{ color: 'var(--accent-gold)' }} /> Selecciona tu método de cobro:
                  </h3>
                  
                  {/* Tab Selector */}
                  <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <button 
                      type="button"
                      onClick={() => setPayoutMethod('yappy')}
                      style={{
                        flex: 1, padding: '0.4rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', border: 'none', cursor: 'pointer',
                        background: payoutMethod === 'yappy' ? 'var(--accent-gold)' : 'transparent',
                        color: payoutMethod === 'yappy' ? 'black' : 'var(--text-secondary)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      Yappy Panamá
                    </button>
                    <button 
                      type="button"
                      onClick={() => setPayoutMethod('transfer')}
                      style={{
                        flex: 1, padding: '0.4rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', border: 'none', cursor: 'pointer',
                        background: payoutMethod === 'transfer' ? 'var(--accent-gold)' : 'transparent',
                        color: payoutMethod === 'transfer' ? 'black' : 'var(--text-secondary)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      Transferencia Bancaria
                    </button>
                  </div>

                  {payoutMethod === 'yappy' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Sube tu código QR de Yappy para recibir el pago:</label>
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) compressQrCode(file);
                        }}
                        style={{
                          fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.4rem', borderRadius: '6px', width: '100%', cursor: 'pointer'
                        }}
                      />
                      {compressingQr && <p style={{ fontSize: '0.7rem', color: 'var(--accent-gold)', margin: 0 }}>⏳ Procesando y optimizando imagen QR...</p>}
                      {yappyQrBase64 && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', marginTop: '0.3rem' }}>
                          <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 'bold' }}>✓ QR Optimizado Proporcionalmente (150x150)</span>
                          <img src={yappyQrBase64} alt="Yappy QR Preview" style={{ width: '120px', height: '120px', borderRadius: '8px', border: '2px solid #10b981', boxShadow: '0 0 10px rgba(16,185,129,0.2)' }} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Nombre Completo en la Cuenta:</label>
                        <input 
                          type="text" 
                          placeholder="Ej. Ana María Pérez"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: 'white', width: '100%' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Banco:</label>
                          <input 
                            type="text" 
                            placeholder="Ej. Banco General"
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                            style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: 'white', width: '100%' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Tipo:</label>
                          <select
                            value={accountType}
                            onChange={(e) => setAccountType(e.target.value as 'Ahorro' | 'Corriente')}
                            style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: 'white', height: '28px', width: '100%' }}
                          >
                            <option value="Ahorro">Ahorro</option>
                            <option value="Corriente">Corriente</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Número de Cuenta:</label>
                        <input 
                          type="text" 
                          placeholder="Ej. 0472910394"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: 'white', width: '100%' }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (payoutMethod === 'yappy') {
                        if (!yappyQrBase64) {
                          alert('Por favor sube tu código QR de Yappy.');
                          return;
                        }
                        submitPayoutDetails(activeClaim.id, {
                          method: 'yappy',
                          yappyQrCode: yappyQrBase64
                        });
                      } else {
                        if (!fullName.trim() || !bankName.trim() || !accountNumber.trim()) {
                          alert('Por favor completa todos los datos bancarios.');
                          return;
                        }
                        submitPayoutDetails(activeClaim.id, {
                          method: 'transfer',
                          fullName,
                          bankName,
                          accountType,
                          accountNumber
                        });
                      }
                      triggerToast('¡Datos de cobro enviados al administrador de sala en tiempo real!');
                    }}
                    disabled={compressingQr}
                    style={{
                      width: '100%', padding: '0.55rem', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white',
                      boxShadow: '0 4px 12px rgba(16,185,129,0.3)', transition: 'transform 0.1s ease',
                      opacity: compressingQr ? 0.6 : 1, marginTop: '0.25rem'
                    }}
                  >
                    {compressingQr ? '⏳ Procesando Imagen QR...' : '🚀 Enviar Datos de Cobro'}
                  </button>
                </div>
              ) : (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left' }}>
                  {/* Status Banner */}
                  {activeClaim.payoutStatus === 'submitted' ? (
                    <div style={{
                      background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '0.6rem 0.75rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--accent-gold)', fontSize: '0.8rem', fontWeight: 'bold'
                    }}>
                      <span className="spinner-border" style={{ width: '10px', height: '10px', border: '2px solid var(--accent-gold)', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
                      <span>⏳ Procesando pago: Datos enviados al organizador.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                      <div style={{
                        background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '8px', padding: '0.6rem 0.75rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#10b981', fontSize: '0.8rem', fontWeight: 'bold',
                        boxShadow: '0 0 15px rgba(16,185,129,0.15)'
                      }}>
                        <span>🎉 ¡PAGO COMPLETADO POR EL ADMINISTRADOR DE SALA! ✅</span>
                      </div>
                      {activeClaim.payoutReceipt && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginTop: '0.2rem' }}>
                          <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 'bold' }}>🧾 Comprobante de Transferencia:</span>
                          <img 
                            src={activeClaim.payoutReceipt} 
                            alt="Comprobante de Premio" 
                            onClick={() => setLightboxImage(activeClaim.payoutReceipt || null)}
                            style={{ width: '110px', height: '110px', borderRadius: '8px', border: '2px solid rgba(16,185,129,0.3)', cursor: 'zoom-in', boxShadow: '0 0 10px rgba(0,0,0,0.5)' }} 
                          />
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>🔍 Clic para ampliar comprobante</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Private message feed */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <h4 style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '0.3rem', margin: 0 }}>
                      💬 Chat Bilateral de Pago
                    </h4>
                    <div style={{
                      background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.6rem',
                      height: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem'
                    }}>
                      {(!activeClaim.privateChat || activeClaim.privateChat.length === 0) ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontStyle: 'italic', margin: 'auto', textAlign: 'center' }}>
                          ¡Coordinemos el pago! Escríbele al organizador aquí.
                        </div>
                      ) : (
                        activeClaim.privateChat.map((msg) => {
                          const isMe = !msg.isHost;
                          return (
                            <div 
                              key={msg.id} 
                              style={{
                                alignSelf: isMe ? 'flex-end' : 'flex-start',
                                maxWidth: '85%',
                                background: isMe ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.07)',
                                border: isMe ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.1)',
                                borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                padding: '0.4rem 0.6rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.15rem'
                              }}
                            >
                              <div style={{ fontSize: '0.6rem', color: isMe ? '#a7f3d0' : 'var(--accent-gold)', fontWeight: 'bold' }}>
                                {msg.sender}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'white', wordBreak: 'break-word' }}>
                                {msg.text}
                              </div>
                              <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', alignSelf: 'flex-end', marginTop: '0.1rem' }}>
                                {msg.timestamp}
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={payoutChatMessagesEndRef} />
                    </div>

                    {/* Chat input */}
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!payoutChatInput.trim()) return;
                        sendPayoutChatMessage(activeClaim.id, payoutChatInput, playerName);
                        setPayoutChatInput('');
                      }}
                      style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}
                    >
                      <input 
                        type="text"
                        placeholder="Mensaje de confirmación o consulta..."
                        value={payoutChatInput}
                        onChange={(e) => setPayoutChatInput(e.target.value)}
                        style={{
                          flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)',
                          background: 'rgba(0,0,0,0.3)', color: 'white'
                        }}
                      />
                      <button 
                        type="submit"
                        className="btn-accent"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                      >
                        Enviar
                      </button>
                    </form>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}>
                <button 
                  className="btn-primary" 
                  onClick={() => {
                    // Set this card's winner flag to false locally to close the overlay
                    setPlayerCards(prev => prev.map(c => c.id === winningCard.id ? { ...c, isWinner: false } : c));
                    triggerToast('¡Felicidades por tu victoria! Disfruta de la partida.');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    justifyContent: 'center',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Cerrar Consola
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Yappy QR Payment Modal is handled separately above */}
 
      {/* Lightbox / Zoom modal */}
      {lightboxImage && (
        <div 
          onClick={() => setLightboxImage(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 6000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(5px)',
            animation: 'fadeInOverlay 0.2s ease',
            cursor: 'zoom-out'
          }}
        >
          <img 
            src={lightboxImage} 
            alt="Receipt Zoomed" 
            style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '12px', border: '3px solid white', boxShadow: '0 0 50px rgba(255,255,255,0.2)' }} 
          />
        </div>
      )}
    </div>
  );
};
