import React, { useState, useRef, useEffect } from 'react';
import { useBingo, YappyTransaction, parseReceiptData, formatPayoutAmount } from '../context/BingoContext';
import { RotateCcw, Copy, Check, UserCheck, Zap, Video, VideoOff, Award } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export const HostView: React.FC = () => {
  const {
    chatMessages,
    sendChatMessage,
    gameId,
    drawnNumbers,
    lastDrawn,
    pendingTransactions,
    isStreaming,
    setIsStreaming,
    drawNumber,
    resetGame,
    approveTransaction,
    rejectTransaction,
    leaveGame,
    gameConfig,
    updateGameConfig,
    pendingClaims,
    resolveClaim,
    sendPayoutChatMessage,
    completePayout,
    hostProfile,
    regenerateRoom
  } = useBingo();

  const getLineOwner = (lineNum: number) => {
    const tx = pendingTransactions.find(t => {
      if (t.status !== 'approved') return false;
      const parsed = parseReceiptData(t.paymentReceipt);
      return parsed.lines.includes(lineNum);
    });
    return tx ? tx.playerName : null;
  };

  const getLinePendingOwner = (lineNum: number) => {
    const tx = pendingTransactions.find(t => {
      if (t.status !== 'pending') return false;
      const parsed = parseReceiptData(t.paymentReceipt);
      return parsed.lines.includes(lineNum);
    });
    return tx ? tx.playerName : null;
  };

  const [copied, setCopied]             = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatInput, setChatInput]       = useState('');
  const [stream, setStream]             = useState<MediaStream | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // Automatic draw states
  const [isAutoDrawing, setIsAutoDrawing] = useState(false);
  const autoDrawIntervalRef = useRef<any>(null);
  const [autoDrawSpeed, setAutoDrawSpeed] = useState(6); // Default 6 seconds

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Private payout settlement states
  const [activePayoutClaimId, setActivePayoutClaimId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [activeAuditTx, setActiveAuditTx] = useState<YappyTransaction | null>(null);
  const [showRejectionInput, setShowRejectionInput] = useState(false);
  const [rejectionReasonText, setRejectionReasonText] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningTxId, setAssigningTxId] = useState<string | null>(null);
  const [selectedLinesForAssign, setSelectedLinesForAssign] = useState<number[]>([]);
  const [hostChatInput, setHostChatInput] = useState('');
  const payoutChatMessagesEndRef = useRef<HTMLDivElement>(null);

  // Completed payout receipt states
  const [claimPayoutReceipt, setClaimPayoutReceipt] = useState<string | null>(null);
  const [compressingClaimPayout, setCompressingClaimPayout] = useState(false);

  // Auto scroll private chat to bottom on new messages
  useEffect(() => {
    payoutChatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [pendingClaims]);

  // Request Notification Permissions for Host on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleOpenAssignModal = (txId: string) => {
    setAssigningTxId(txId);
    setSelectedLinesForAssign([]);
    setShowAssignModal(true);
  };

  // Reset receipt state on console toggle
  useEffect(() => {
    if (!chatExpanded) {
      setClaimPayoutReceipt(null);
      setActivePayoutClaimId(null);
      setCompressingClaimPayout(false);
    }
  }, [chatExpanded]);

  // Self-healing branding synchronization for old/recreated rooms
  useEffect(() => {
    if (!gameId) return;
    
    const syncBranding = async () => {
      try {
        const { data: roomData, error: fetchError } = await supabase
          .from('rooms')
          .select('custom_logo, qr_code')
          .eq('id', gameId)
          .single();
          
        if (fetchError) {
          console.error('Error fetching room for branding sync:', fetchError);
          return;
        }
        
        // If room lacks branding or differs, but we have it in our local config, update the room!
        const needsLogoSync = gameConfig.customLogo && (!roomData.custom_logo || roomData.custom_logo !== gameConfig.customLogo);
        const needsQrSync = gameConfig.qrCode && (!roomData.qr_code || roomData.qr_code !== gameConfig.qrCode);
        
        if (needsLogoSync || needsQrSync) {
          const updates: any = {};
          if (needsLogoSync) updates.custom_logo = gameConfig.customLogo;
          if (needsQrSync) updates.qr_code = gameConfig.qrCode;
          
          const { error: updateError } = await supabase
            .from('rooms')
            .update(updates)
            .eq('id', gameId);
            
          if (updateError) {
            console.error('Error updating room branding:', updateError);
          } else {
            console.log('Room branding self-healed successfully!');
          }
        }
      } catch (err) {
        console.error('Unexpected error in branding sync:', err);
      }
    };
    
    syncBranding();
  }, [gameId, gameConfig.customLogo, gameConfig.qrCode]);

  // SaaS blocking logic
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [paymentImage, setPaymentImage] = useState<string | null>(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [requestingDemo, setRequestingDemo] = useState(false);
  const isExpired = hostProfile && (
    hostProfile.status === 'suspended' ||
    hostProfile.status === 'pending_payment' ||
    hostProfile.status === 'requesting_access' ||
    hostProfile.status === 'requesting_demo' ||
    (hostProfile.subscription_end_date && new Date() > new Date(hostProfile.subscription_end_date))
  );

  useEffect(() => {
    if (isExpired) {
      // Fetch global settings for QR
      import('../lib/supabaseClient').then(({ supabase }) => {
        supabase.from('platform_settings').select('*').eq('id', 'global').single()
          .then(({ data }) => setGlobalSettings(data));
      });
    }
  }, [isExpired]);

  const submitSubscriptionPayment = async () => {
    if (!paymentImage || !hostProfile) return;
    setSubmittingPayment(true);
    const { supabase } = await import('../lib/supabaseClient');
    const paymentId = `sub-pay-${Date.now()}`;
    
    await supabase.from('host_payments').insert({
      id: paymentId,
      host_id: hostProfile.id,
      amount: globalSettings?.subscription_price || 80,
      receipt_image: paymentImage,
      status: 'pending'
    });

    await supabase.from('host_profiles').update({ status: 'pending_payment' }).eq('id', hostProfile.id);
    
    // We must reload the window or ideally the profile state in Context would update. 
    // To keep it simple, we'll just reload so it fetches the new status.
    window.location.reload();
  };

  const requestDemo = async () => {
    if (!hostProfile) return;
    setRequestingDemo(true);
    const { supabase } = await import('../lib/supabaseClient');
    await supabase.from('host_profiles').update({ status: 'requesting_demo' }).eq('id', hostProfile.id);
    window.location.reload();
  };

  const handleSubQRUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 600; canvas.height = 800; // Compress receipt
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, 600, 800);
          setPaymentImage(canvas.toDataURL('image/jpeg', 0.8));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };


  // If subscription is blocked, show payment overlay and stop normal render
  if (isExpired) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)', padding: '2rem' }}>
        <div className="panel-card" style={{ maxWidth: '500px', width: '100%', padding: '2rem', textAlign: 'center', background: 'rgba(20, 10, 10, 0.95)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <h2 style={{ color: '#ef4444', margin: '0 0 1rem 0' }}>Suscripción Inactiva</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            {hostProfile?.status === 'pending_payment' 
              ? 'Tu pago ha sido recibido y está pendiente de verificación por el Super Administrador.'
              : hostProfile?.status === 'requesting_demo'
              ? 'Has solicitado un DEMO. El administrador está revisando tu solicitud.'
              : hostProfile?.status === 'suspended'
              ? 'Tu cuenta ha sido suspendida. Para reactivar tu sala, realiza tu pago mensual y adjunta el comprobante.'
              : `Bienvenido a Salas de Juegos K-NO. Para activar tu sala, realiza el pago mensual de $${globalSettings?.subscription_price || '80.00'} o solicita una prueba gratuita (DEMO).`}
          </p>

          {hostProfile?.status !== 'pending_payment' && hostProfile?.status !== 'requesting_demo' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
              {globalSettings?.subscription_qr_code ? (
                <img 
                  src={globalSettings.subscription_qr_code} 
                  alt="Pago Yappy" 
                  style={{ width: '200px', height: '200px', borderRadius: '12px', border: '2px solid rgba(255,255,255,0.1)', cursor: 'zoom-in' }} 
                  onClick={() => setLightboxImage(globalSettings.subscription_qr_code)}
                />
              ) : (
                <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>QR de pago no configurado</div>
              )}
              
              <div style={{ width: '100%', textAlign: 'left' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sube el comprobante de pago de Yappy:</label>
                <input type="file" accept="image/*" onChange={handleSubQRUpload} style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.8rem' }} />
              </div>

              {paymentImage && (
                <button onClick={submitSubscriptionPayment} disabled={submittingPayment} className="btn-primary" style={{ width: '100%', padding: '0.8rem', justifyContent: 'center', background: '#22c55e', borderColor: '#16a34a' }}>
                  {submittingPayment ? 'Enviando...' : 'Enviar Comprobante y Activar Sala'}
                </button>
              )}

              <hr style={{ width: '100%', border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />

              {hostProfile?.status !== 'suspended' && (
                <button onClick={requestDemo} disabled={requestingDemo} className="btn-secondary" style={{ width: '100%', padding: '0.8rem', justifyContent: 'center', color: '#c084fc', borderColor: '#c084fc' }}>
                  {requestingDemo ? 'Solicitando...' : 'Solicitar DEMO de prueba'}
                </button>
              )}
            </div>
          )}
          
          <button onClick={leaveGame} className="btn-secondary" style={{ marginTop: '2rem', border: 'none' }}>Cerrar Sesión</button>
        </div>
      </div>
    );
  }

  const compressClaimPayoutReceipt = (file: File) => {
    setCompressingClaimPayout(true);
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
          setClaimPayoutReceipt(base64);
          setCompressingClaimPayout(false);
        }
      };
      img.onerror = () => {
        setCompressingClaimPayout(false);
        alert('Error al procesar la imagen.');
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setCompressingClaimPayout(false);
      alert('Error al leer el archivo.');
    };
    reader.readAsDataURL(file);
  };
  const lastDrawnRef       = useRef(lastDrawn);

  const latestMessage = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;

  useEffect(() => { lastDrawnRef.current = lastDrawn; }, [lastDrawn]);

  useEffect(() => {
    if (chatExpanded) chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatExpanded]);

  // ── Broadcast audio tracks in real-time using Raw PCM Web Audio API ──
  useEffect(() => {
    if (!isStreaming || !stream || stream.getAudioTracks().length === 0) return;

    const audioBc = new BroadcastChannel('bingo-kno-audio-channel');
    
    // Set up AudioContext to capture microphone
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) {
      console.warn('AudioContext not supported on this browser');
      return;
    }

    let audioCtx: AudioContext | null = (window as any).hostAudioCtx || null;
    let source: MediaStreamAudioSourceNode | null = null;
    let processor: ScriptProcessorNode | null = null;

    try {
      if (!audioCtx) {
        audioCtx = new AudioCtx();
      }
      
      // Mono capture stream
      const audioStream = new MediaStream(stream.getAudioTracks());
      source = audioCtx.createMediaStreamSource(audioStream);
      
      // ScriptProcessorNode(bufferSize, inputChannels, outputChannels)
      // 4096 samples at 44.1kHz is ~93ms chunks
      processor = audioCtx.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (!audioCtx) return;
        const inputData = e.inputBuffer.getChannelData(0); // Mono channel
        const len = inputData.length;
        
        // Convert Float32 samples [-1.0, 1.0] to Int16Array
        const pcm16 = new Int16Array(len);
        for (let i = 0; i < len; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Convert Int16Array buffer to base64
        try {
          const base64Audio = arrayBufferToBase64(pcm16.buffer);
          const payload = { rawPcm: base64Audio, sampleRate: audioCtx.sampleRate };
          
          // Post to local BroadcastChannel
          audioBc.postMessage(payload);
          
          // Broadcast to remote players over Supabase Realtime
          supabase.channel(`room-${gameId}`).send({
            type: 'broadcast',
            event: 'stream-audio',
            payload: payload
          }).catch(() => {});
        } catch (err) {
          console.error('Error processing audio chunk:', err);
        }
      };

      // Connect nodes
      source.connect(processor);
      processor.connect(audioCtx.destination);
    } catch (err) {
      console.error('Error setting up Web Audio API processor:', err);
    }

    return () => {
      try {
        if (processor && source) {
          source.disconnect(processor);
          processor.disconnect();
        }
        if (audioCtx) {
          audioCtx.close();
        }
      } catch (err) {
        console.error('Error cleaning up audio nodes:', err);
      }
      audioBc.close();
    };
  }, [isStreaming, stream]);

  // ── Stream handlers ──
  const handleStartStream = async () => {
    try {
      // Pre-unlock and run host AudioContext inside the user gesture callback
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        try {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            await ctx.resume().catch(() => {});
          }
          (window as any).hostAudioCtx = ctx;
        } catch (e) {
          console.error("Failed to pre-unlock AudioContext:", e);
        }
      }

      const ms = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true
      });
      setStream(ms);
      setIsStreaming(true);
    } catch {
      setIsStreaming(true); // no mic/audio -> fallback stream state
    }
  };

  const handleStopStream = () => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setIsStreaming(false);
  };

  useEffect(() => () => { stream?.getTracks().forEach(t => t.stop()); }, [stream]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput, 'Organizador');
    setChatInput('');
  };

  const copyInviteLink = () => {
    const roomUrl = `${window.location.origin}?room=${gameId}`;
    let shareMsg = `📢 ¡Te invito a jugar en mi Bingo: ${gameConfig.gameName}! 🎮\n`;
    if (gameConfig.startDate) {
      shareMsg += `📅 Fecha de inicio: ${gameConfig.startDate}`;
      if (gameConfig.startTime) shareMsg += ` a las ${gameConfig.startTime} ⏰`;
      shareMsg += `\n`;
    }
    if (gameConfig.payoutAmount) {
      shareMsg += `🏆 Premio Acumulado: ${formatPayoutAmount(gameConfig.payoutAmount)} 💰\n`;
    }
    shareMsg += `🔗 Enlace de ingreso: ${roomUrl}`;

    navigator.clipboard.writeText(shareMsg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startAutoDraw = () => {
    if (isAutoDrawing) return;
    setIsAutoDrawing(true);
    triggerToast('▶️ Extracción automática iniciada.');
    
    // Draw the first number immediately
    drawNumber();
    
    autoDrawIntervalRef.current = setInterval(() => {
      drawNumber().then((res) => {
        if (res === null) {
          stopAutoDraw();
          triggerToast('🏁 Juego terminado: Todas las balotas cantadas.');
        }
      });
    }, autoDrawSpeed * 1000);
  };

  const stopAutoDraw = () => {
    setIsAutoDrawing(false);
    if (autoDrawIntervalRef.current) {
      clearInterval(autoDrawIntervalRef.current);
      autoDrawIntervalRef.current = null;
    }
    triggerToast('⏸️ Extracción automática en pausa.');
  };

  const handleReset = () => {
    stopAutoDraw();
    resetGame();
    triggerToast('🔄 Partida reiniciada.');
  };

  // Clear auto-draw on unmount
  useEffect(() => {
    return () => {
      if (autoDrawIntervalRef.current) {
        clearInterval(autoDrawIntervalRef.current);
      }
    };
  }, []);

  const getBallLetter = (num: number) => {
    if (num >= 1  && num <= 15) return 'B';
    if (num >= 16 && num <= 30) return 'I';
    if (num >= 31 && num <= 45) return 'N';
    if (num >= 46 && num <= 60) return 'G';
    return 'O';
  };

  const getBallColor = (letter: string) => {
    switch (letter) {
      case 'B': return { bg: 'linear-gradient(135deg, #00b0ff, #0088cc)', shadow: '#00b0ff', color: '#0088cc' };
      case 'I': return { bg: 'linear-gradient(135deg, #ff4d4d, #ef4444)', shadow: '#ef4444', color: '#ef4444' };
      case 'N': return { bg: 'linear-gradient(135deg, #a8a29e, #78716c)', shadow: '#78716c', color: '#78716c' };
      case 'G': return { bg: 'linear-gradient(135deg, #4ade80, #22c55e)', shadow: '#22c55e', color: '#22c55e' };
      case 'O': return { bg: 'linear-gradient(135deg, #facc15, #eab308)', shadow: '#eab308', color: '#eab308' };
      default:  return { bg: 'linear-gradient(135deg, #6b7280, #374151)', shadow: '#6b7280', color: '#6b7280' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>

      {/* ── Collapsible Chat ── */}
      <div style={{ background: 'rgba(18,20,32,0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 'var(--radius-md)', padding: '0.6rem 1rem', display: 'flex', flexDirection: 'column', gap: chatExpanded ? '0.75rem' : '0', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', maxHeight: chatExpanded ? '300px' : '45px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, overflow: 'hidden' }}>
            <span className="badge-live" style={{ background: 'var(--accent-violet)', animation: 'none', padding: '0.15rem 0.5rem', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <span className="voice-status-dot" style={{ backgroundColor: 'white', boxShadow: 'none', width: '6px', height: '6px' }} />CHAT (HOST)
            </span>
            {!chatExpanded && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                {latestMessage ? <><strong style={{ color: latestMessage.isHost ? '#c084fc' : 'white' }}>{latestMessage.sender}</strong>: {latestMessage.text}</> : <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No hay mensajes aún.</span>}
              </div>
            )}
          </div>
          <button onClick={() => setChatExpanded(!chatExpanded)} style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#c084fc', fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            {chatExpanded ? '✕ Contraer' : '💬 Abrir Chat'}
          </button>
        </div>
        {chatExpanded && (
          <>
            <div style={{ flex: 1, maxHeight: '160px', overflowY: 'auto', padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', marginTop: '0.25rem' }}>
              {chatMessages.length === 0
                ? <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Escribe un mensaje para comenzar</div>
                : chatMessages.map(msg => (
                    <div key={msg.id} style={{ alignSelf: msg.isHost ? 'flex-start' : 'flex-end', background: msg.isHost ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)', border: msg.isHost ? '1px solid rgba(139,92,246,0.25)' : '1px solid var(--border-color)', borderRadius: msg.isHost ? '4px 10px 10px 10px' : '10px 4px 10px 10px', padding: '0.4rem 0.6rem', maxWidth: '85%', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.1rem', justifyContent: msg.isHost ? 'flex-start' : 'flex-end' }}>
                        <strong style={{ color: msg.isHost ? '#c084fc' : 'white' }}>{msg.sender}</strong>
                        <span>{msg.timestamp}</span>
                      </div>
                      <p style={{ color: '#e2e8f0', wordBreak: 'break-word', textAlign: msg.isHost ? 'left' : 'right' }}>{msg.text}</p>
                    </div>
                  ))}
              <div ref={chatMessagesEndRef} />
            </div>
            <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '0.4rem' }}>
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Escribe en el chat..." style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.35rem 0.75rem', color: 'white', fontSize: '0.8rem', outline: 'none' }} />
              <button type="submit" style={{ background: 'var(--accent-violet)', border: 'none', color: 'white', borderRadius: '4px', padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Enviar</button>
            </form>
          </>
        )}
      </div>

      {/* ── Main layout ── */}
      <div className="player-layout-grid">

        {/* ══ LEFT COLUMN: BINGO 75 BOARD DASHBOARD ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>

          {/* Bingo 75 Board Wrapper */}
          <div style={{
            background: '#f3e8c9',
            borderRadius: '16px',
            border: '4px solid #b45309',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'row',
            gap: '1rem',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            flexWrap: 'wrap' // Wrap on mobile
          }}>
            
            {/* Left Control Panel (Retro style red containers) */}
            <div style={{
              flex: '1 1 280px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.8rem',
              alignItems: 'stretch'
            }}>
              
              {/* Banner Container */}
              <div style={{
                background: '#991b1b',
                border: '2px solid #b45309',
                borderRadius: '8px',
                padding: '0.6rem 0.5rem',
                textAlign: 'center',
                boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
              }}>
                <h2 style={{
                  margin: 0,
                  fontSize: '1.8rem',
                  fontWeight: 'bold',
                  color: '#facc15',
                  textShadow: '2px 2px 0px #7f1d1d',
                  fontFamily: '"Outfit", sans-serif',
                  letterSpacing: '1px'
                }}>
                  {gameConfig.gameName.toUpperCase() !== 'BINGO-KNO' ? gameConfig.gameName.toUpperCase() : 'BINGO 75'}
                </h2>
              </div>

              {/* Extraction Display (Pantalla de Balota Actual) */}
              <div style={{
                background: '#7f1d1d',
                border: '3px solid #b45309',
                borderRadius: '10px',
                padding: '1rem',
                minHeight: '140px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.5), 0 4px 8px rgba(0,0,0,0.3)',
                position: 'relative'
              }}>
                {lastDrawn ? (() => {
                  const letter = getBallLetter(lastDrawn);
                  const colConfig = getBallColor(letter);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: '#facc15', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Última Balota</span>
                      <div style={{
                        width: '82px',
                        height: '82px',
                        borderRadius: '50%',
                        background: colConfig.bg,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 8px 20px rgba(0,0,0,0.6), inset -8px -8px 16px rgba(0,0,0,0.4), inset 8px 8px 16px rgba(255,255,255,0.4), 0 0 15px ${colConfig.shadow}`,
                        animation: 'ballPopBig 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        border: '2px solid rgba(255,255,255,0.35)'
                      }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 900, color: 'rgba(255,255,255,0.85)', lineHeight: 1, textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>{letter}</span>
                        <span style={{ fontSize: '2.1rem', fontWeight: 950, color: 'white', lineHeight: 1, textShadow: '2px 2px 4px rgba(0,0,0,0.6)' }}>{lastDrawn}</span>
                      </div>
                    </div>
                  );
                })() : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', opacity: 0.8 }}>
                    <RotateCcw size={28} style={{ color: '#eedba2', animation: 'spin 8s linear infinite' }} />
                    <span style={{ fontSize: '0.7rem', color: '#eedba2', fontWeight: 'bold', letterSpacing: '0.5px' }}>ESPERANDO BALOTA...</span>
                  </div>
                )}
              </div>

              {/* Automatic Draw Controls (Yellow Play / Grey Stop) */}
              <div style={{
                background: '#451a03',
                border: '2px solid #b45309',
                borderRadius: '8px',
                padding: '0.6rem 0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: '#eedba2', fontWeight: 'bold' }}>MODO AUTOMÁTICO</span>
                  {isAutoDrawing && <span className="voice-status-dot" style={{ backgroundColor: '#22c55e', boxShadow: '0 0 8px #22c55e' }}></span>}
                </div>
                
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  {/* Yellow Play Button */}
                  <button
                    onClick={startAutoDraw}
                    disabled={isAutoDrawing}
                    style={{
                      flex: 1,
                      height: '42px',
                      background: isAutoDrawing ? '#451a03' : '#eedba2',
                      border: '3px solid #78350f',
                      borderRadius: '8px',
                      color: isAutoDrawing ? 'rgba(0,0,0,0.25)' : '#78350f',
                      fontSize: '1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: isAutoDrawing ? 'not-allowed' : 'pointer',
                      boxShadow: isAutoDrawing ? 'none' : '0 3px 6px rgba(0,0,0,0.3)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseOver={(e) => {
                      if (!isAutoDrawing) {
                        e.currentTarget.style.background = '#fcf0d3';
                        e.currentTarget.style.transform = 'scale(1.03)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isAutoDrawing) {
                        e.currentTarget.style.background = '#eedba2';
                        e.currentTarget.style.transform = 'scale(1)';
                      }
                    }}
                    title="Iniciar Extracción Automática"
                  >
                    ▶
                  </button>

                  {/* Grey Stop Button */}
                  <button
                    onClick={stopAutoDraw}
                    disabled={!isAutoDrawing}
                    style={{
                      flex: 1,
                      height: '42px',
                      background: !isAutoDrawing ? '#451a03' : '#9ea3a8',
                      border: '3px solid #374151',
                      borderRadius: '8px',
                      color: !isAutoDrawing ? 'rgba(255,255,255,0.15)' : '#1f2937',
                      fontSize: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: !isAutoDrawing ? 'not-allowed' : 'pointer',
                      boxShadow: !isAutoDrawing ? 'none' : '0 3px 6px rgba(0,0,0,0.3)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseOver={(e) => {
                      if (isAutoDrawing) {
                        e.currentTarget.style.background = '#bdc3c7';
                        e.currentTarget.style.transform = 'scale(1.03)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (isAutoDrawing) {
                        e.currentTarget.style.background = '#9ea3a8';
                        e.currentTarget.style.transform = 'scale(1)';
                      }
                    }}
                    title="Pausar Extracción"
                  >
                    ■
                  </button>
                </div>

                {/* Speed selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '0.62rem', color: '#eedba2' }}>Velocidad:</span>
                  <select
                    value={autoDrawSpeed}
                    onChange={(e) => {
                      const newSpeed = Number(e.target.value);
                      setAutoDrawSpeed(newSpeed);
                      if (isAutoDrawing) {
                        // Restart auto draw with new speed
                        stopAutoDraw();
                        setIsAutoDrawing(true);
                        autoDrawIntervalRef.current = setInterval(() => {
                          drawNumber().then(res => {
                            if (res === null) stopAutoDraw();
                          });
                        }, newSpeed * 1000);
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '0.15rem 0.3rem',
                      fontSize: '0.65rem',
                      borderRadius: '4px',
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid #b45309',
                      color: '#eedba2',
                      cursor: 'pointer'
                    }}
                  >
                    <option value={4}>Rápido (4s)</option>
                    <option value={6}>Normal (6s)</option>
                    <option value={8}>Medio (8s)</option>
                    <option value={10}>Lento (10s)</option>
                  </select>
                </div>
              </div>

              {/* Voice Live / Directo de Voz and Reset buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto' }}>
                
                {/* Voice Direct Controller */}
                {isStreaming ? (
                  <button 
                    className="btn-secondary" 
                    onClick={handleStopStream} 
                    style={{
                      padding: '0.45rem',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem',
                      borderColor: 'var(--danger)',
                      color: 'var(--danger)',
                      background: 'rgba(239, 68, 68, 0.05)',
                      borderRadius: '8px',
                      fontWeight: 'bold'
                    }}
                  >
                    <VideoOff size={12} /> Detener Directo de Voz
                  </button>
                ) : (
                  <button 
                    className="btn-primary" 
                    onClick={handleStartStream} 
                    style={{
                      padding: '0.45rem',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      background: 'var(--accent-violet)',
                      color: 'white',
                      border: 'none'
                    }}
                  >
                    <Video size={12} /> Iniciar Directo de Voz
                  </button>
                )}

                <button 
                  className="btn-secondary" 
                  onClick={handleReset} 
                  style={{
                    padding: '0.4rem',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.3rem',
                    borderRadius: '8px',
                    borderColor: 'rgba(255,255,255,0.15)',
                    color: 'white'
                  }}
                >
                  <RotateCcw size={12} /> Reiniciar Partida
                </button>
              </div>

            </div>

            {/* Right Tablero Panel (The 75-Ball Grid) */}
            <div style={{
              flex: '2 1 340px',
              background: '#eedba2',
              borderRadius: '12px',
              border: '3px solid #b45309',
              padding: '0.6rem 0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.15)'
            }}>
              
              {/* B-I-N-G-O Columns Headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '0.35rem',
                justifyItems: 'stretch'
              }}>
                {[
                  { letter: 'B', color: '#0088cc' },
                  { letter: 'I', color: '#ef4444' },
                  { letter: 'N', color: '#78716c' },
                  { letter: 'G', color: '#22c55e' },
                  { letter: 'O', color: '#eab308' }
                ].map(col => (
                  <div
                    key={col.letter}
                    style={{
                      background: col.color,
                      borderRadius: '6px',
                      padding: '0.3rem',
                      textAlign: 'center',
                      color: 'white',
                      fontWeight: 900,
                      fontSize: '1rem',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
                      textShadow: '1px 1px 1px rgba(0,0,0,0.4)'
                    }}
                  >
                    {col.letter}
                  </div>
                ))}
              </div>

              {/* 15 rows of 5 columns */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '0.35rem',
                justifyItems: 'center'
              }}>
                {Array.from({ length: 15 }).map((_, rIdx) => {
                  return [0, 1, 2, 3, 4].map(cIdx => {
                    const num = cIdx * 15 + rIdx + 1;
                    const letter = getBallLetter(num);
                    const colConfig = getBallColor(letter);
                    const isDrawn = drawnNumbers.includes(num);
                    const isLast = lastDrawn === num;
                    const owner = getLineOwner(rIdx + 1);
                    const pendingOwner = getLinePendingOwner(rIdx + 1);

                    return (
                      <div
                        key={num}
                        onClick={() => !isDrawn && drawNumber(num)}
                        title={isDrawn ? `${letter}-${num} ya cantada` : `Cantar ${letter}-${num}`}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          border: `2px solid ${isLast ? '#c084fc' : isDrawn ? '#a855f7' : colConfig.color}`,
                          background: isDrawn ? 'linear-gradient(135deg, #a855f7, #6b21a8)' : 'white',
                          color: isDrawn ? 'white' : colConfig.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 900,
                          fontSize: '0.85rem',
                          cursor: isDrawn ? 'not-allowed' : 'pointer',
                          boxShadow: isLast 
                            ? '0 0 15px #c084fc, inset 0 0 4px rgba(255,255,255,0.6)' 
                            : isDrawn 
                            ? '0 0 6px rgba(168, 85, 247, 0.4)' 
                            : 'inset 0 1px 3px rgba(0,0,0,0.1)',
                          transform: isLast ? 'scale(1.18)' : 'scale(1)',
                          animation: isLast ? 'ringPulse 1.5s infinite' : 'none',
                          zIndex: isLast ? 10 : 1,
                          transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                          position: 'relative'
                        }}
                        onMouseOver={(e) => {
                          if (!isDrawn) {
                            e.currentTarget.style.transform = 'scale(1.15)';
                            e.currentTarget.style.background = '#fcfcfc';
                          }
                        }}
                        onMouseOut={(e) => {
                          if (!isDrawn) {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.background = 'white';
                          }
                        }}
                      >
                        {num}
                        {cIdx === 0 && owner && (
                          <span style={{
                            position: 'absolute',
                            left: '-62px',
                            background: 'var(--accent-gold)',
                            color: 'black',
                            fontSize: '0.55rem',
                            padding: '0.05rem 0.25rem',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                            border: '1px solid #78350f',
                            zIndex: 5
                          }}>
                            👤 {owner.split(' ')[0]}
                          </span>
                        )}
                        {cIdx === 0 && pendingOwner && !owner && (
                          <span style={{
                            position: 'absolute',
                            left: '-62px',
                            background: '#fbbf24',
                            color: 'black',
                            fontSize: '0.55rem',
                            padding: '0.05rem 0.25rem',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                            border: '1px solid #78350f',
                            zIndex: 5,
                            opacity: 0.85
                          }}>
                            ⏳ {pendingOwner.split(' ')[0]}
                          </span>
                        )}
                      </div>
                    );
                  });
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.2rem 0.5rem', background: 'rgba(0,0,0,0.04)', borderRadius: '6px', fontSize: '0.68rem', color: '#78350f', fontWeight: 'bold' }}>
                <span>Modo de juego: <span style={{ textTransform: 'uppercase', color: '#991b1b' }}>{gameConfig.winningMechanic === 'full' ? 'Cartón Lleno' : gameConfig.winningMechanic === 'terna' ? 'Terna' : gameConfig.winningMechanic === 'cajon' ? 'Cajón' : 'Línea Horizontal'}</span></span>
                <span>Cantadas: {drawnNumbers.length}/75</span>
              </div>

            </div>

          </div>

        </div>

        {/* ══ RIGHT COLUMN ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Yappy QR */}
          <div className="panel-card" style={{ flex: '0 0 auto', maxHeight: '220px' }}>
            <div className="panel-header" style={{ padding: '0.5rem 0.75rem', background: '#0088cc10', borderBottom: '1px solid rgba(0,136,204,0.2)' }}>
              <h3 className="panel-title" style={{ color: '#0088cc', fontSize: '0.9rem' }}><UserCheck size={14} /> Validación Yappy QR</h3>
              <span style={{ fontSize: '0.7rem', background: '#0088cc', color: 'white', padding: '0.05rem 0.35rem', borderRadius: '4px', fontWeight: 'bold' }}>
                {pendingTransactions.filter(t => t.status === 'pending').length} Pendientes
              </span>
            </div>
            <div className="panel-body" style={{ overflowY: 'auto', gap: '0.5rem', padding: '0.5rem' }}>
              {pendingTransactions.length === 0
                ? <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>No hay compras por Yappy</div>
                : pendingTransactions.map(tx => (
                    <div key={tx.id} className="winners-list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem', padding: '0.4rem 0.5rem', border: tx.status === 'pending' ? '1px solid rgba(0,136,204,0.3)' : '1px solid var(--border-color)', background: tx.status === 'pending' ? 'rgba(0,136,204,0.04)' : 'var(--bg-tertiary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ fontWeight: 'bold', color: 'white' }}>{tx.playerName}</span>
                        <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>${tx.amount.toFixed(2)}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{tx.quantity} cartones • {tx.id}</div>
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginTop: '0.2rem' }}>
                        {tx.status === 'pending' ? (
                          <>
                            <button 
                              className="btn-primary" 
                              onClick={() => handleOpenAssignModal(tx.id)} 
                              style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: '4px', justifyContent: 'center' }}
                            >
                              Aprobar y Emitir
                            </button>
                            {tx.paymentReceipt && (
                              <button 
                                className="btn-accent" 
                                onClick={() => {
                                  setActiveAuditTx(tx);
                                  setShowRejectionInput(false);
                                  setRejectionReasonText('');
                                }}
                                style={{ padding: '0.25rem 0.4rem', fontSize: '0.7rem', borderRadius: '4px', background: '#0088cc', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                              >
                                🧾 Ver Pago
                              </button>
                            )}
                          </>
                        ) : tx.status === 'approved' ? (
                          <div style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>✓ Aprobado</span>
                            {tx.paymentReceipt && (
                              <span 
                                onClick={() => {
                                  setActiveAuditTx(tx);
                                  setShowRejectionInput(false);
                                }} 
                                style={{ cursor: 'pointer', color: '#0088cc', textDecoration: 'underline', fontSize: '0.65rem' }}
                              >
                                (Ver Comprobante)
                              </span>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', width: '100%' }}>
                            <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span>❌ Rechazado</span>
                              {tx.paymentReceipt && (
                                <span 
                                  onClick={() => {
                                    setActiveAuditTx(tx);
                                    setShowRejectionInput(false);
                                  }} 
                                  style={{ cursor: 'pointer', color: '#0088cc', textDecoration: 'underline', fontSize: '0.65rem' }}
                                >
                                  (Ver Comprobante)
                                </span>
                              )}
                            </div>
                            {tx.rejectionReason && (
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic', display: 'block', textAlign: 'left' }}>
                                Motivo: {tx.rejectionReason}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
            </div>
          </div>

          {/* Ajustes de Partida */}
          <div className="panel-card" style={{ flex: '0 0 auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.50rem' }}>
            <div className="panel-header" style={{ paddingBottom: '0.35rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="panel-title" style={{ fontSize: '0.9rem' }}><Zap size={14} className="text-amber-400" /> Ajustes de Partida</h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Nombre del Bingo</label>
              <input
                type="text"
                value={gameConfig.gameName}
                onChange={(e) => updateGameConfig({ gameName: e.target.value })}
                placeholder="Ej: Gran Bingo Familiar"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', padding: '0.3rem 0.5rem', color: 'white', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Foto de Logotipo / Marca</label>
              {gameConfig.customLogo ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <img src={gameConfig.customLogo} alt="Logo" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent-violet)', boxShadow: '0 0 10px rgba(139,92,246,0.3)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: 'white', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Logotipo Personalizado</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Foto cargada correctamente</div>
                  </div>
                  <button
                    onClick={() => updateGameConfig({ customLogo: null })}
                    style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 'bold' }}
                    title="Eliminar Foto"
                  >
                    Eliminar
                  </button>
                </div>
              ) : (
                <div className="file-upload-wrapper" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border-color)', borderRadius: '6px', padding: '0.75rem 0.5rem', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s ease', background: 'rgba(255,255,255,0.01)' }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      // Read file using FileReader
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const img = new Image();
                        img.src = event.target?.result as string;
                        img.onload = () => {
                          // Scale image down to 128x128 for high performance and lightweight syncing
                          const tempCanvas = document.createElement('canvas');
                          const maxDim = 128;
                          tempCanvas.width = maxDim;
                          tempCanvas.height = maxDim;
                          const tempCtx = tempCanvas.getContext('2d');
                          if (tempCtx) {
                            // Perform a perfect center-square crop
                            const minSide = Math.min(img.width, img.height);
                            const sx = (img.width - minSide) / 2;
                            const sy = (img.height - minSide) / 2;
                            
                            // Draw the cropped and scaled image onto the temporary canvas
                            tempCtx.drawImage(img, sx, sy, minSide, minSide, 0, 0, maxDim, maxDim);
                            
                            // Compress as lightweight JPEG
                            const compressedBase64 = tempCanvas.toDataURL('image/jpeg', 0.82);
                            updateGameConfig({ customLogo: compressedBase64 });
                          }
                        };
                      };
                      reader.readAsDataURL(file);
                    }}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', zIndex: 5 }}
                  />
                  <div style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#c084fc', fontWeight: 'bold' }}>⚡ Subir Foto / Logo</span>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Formatos: PNG, JPG, WEBP (Max 1MB)</span>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Precio por Línea ($)</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={gameConfig.cardPrice}
                  onChange={(e) => updateGameConfig({ cardPrice: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', padding: '0.3rem 0.5rem', color: 'white', outline: 'none', width: '100%' }}
                />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Mecánica</label>
                <select
                  value={gameConfig.winningMechanic}
                  onChange={(e) => updateGameConfig({ winningMechanic: e.target.value as any })}
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', padding: '0.3rem 0.5rem', color: 'white', outline: 'none', width: '100%', cursor: 'pointer' }}
                >
                  <option value="line">Línea Horizontal (5 números)</option>
                  <option value="full">Cartón Lleno (24 celdas)</option>
                  <option value="cajon">Cajón (Marco Exterior)</option>
                  <option value="terna">Terna (Horizontal &gt;= 3)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Instrucciones de Pago (Yappy)</label>
              <textarea
                value={gameConfig.paymentDetails}
                onChange={(e) => updateGameConfig({ paymentDetails: e.target.value })}
                placeholder="Ej: Yappy: @antigravity o Celular: 6666-1234"
                rows={2}
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', padding: '0.3rem 0.5rem', color: 'white', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
              />
            </div>

            {/* Custom Yappy QR Code Upload */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Código QR de Yappy (Cobro)</label>
              {gameConfig.qrCode ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <img 
                    src={gameConfig.qrCode} 
                    alt="Yappy QR" 
                    style={{ width: '40px', height: '40px', objectFit: 'contain', background: 'white', padding: '2px', borderRadius: '4px', border: '1px solid var(--border-color)', cursor: 'zoom-in' }} 
                    onClick={() => setLightboxImage(gameConfig.qrCode)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: 'white', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>QR de Cobro</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Captura QR cargada</div>
                  </div>
                  <button
                    onClick={() => updateGameConfig({ qrCode: null })}
                    style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Eliminar
                  </button>
                </div>
              ) : (
                <div className="file-upload-wrapper" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border-color)', borderRadius: '6px', padding: '0.5rem', textAlign: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.01)' }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const img = new Image();
                        img.src = event.target?.result as string;
                        img.onload = () => {
                          const tempCanvas = document.createElement('canvas');
                          const maxDim = 150;
                          let w = img.width;
                          let h = img.height;
                          if (w > h) {
                            if (w > maxDim) {
                              h = (h * maxDim) / w;
                              w = maxDim;
                            }
                          } else {
                            if (h > maxDim) {
                              w = (w * maxDim) / h;
                              h = maxDim;
                            }
                          }
                          tempCanvas.width = w;
                          tempCanvas.height = h;
                          const tempCtx = tempCanvas.getContext('2d');
                          if (tempCtx) {
                            tempCtx.drawImage(img, 0, 0, w, h);
                            const compressedBase64 = tempCanvas.toDataURL('image/jpeg', 0.82);
                            updateGameConfig({ qrCode: compressedBase64 });
                          }
                        };
                      };
                      reader.readAsDataURL(file);
                    }}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', zIndex: 5 }}
                  />
                  <div style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
                    <span style={{ fontSize: '0.7rem', color: '#0088cc', fontWeight: 'bold' }}>📲 Subir Imagen QR Yappy</span>
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>Sube tu código QR de Yappy</span>
                  </div>
                </div>
              )}
            </div>

            {/* Configuración de Premios */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Premio de Bingo ($)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={gameConfig.bingoPrize}
                  onChange={(e) => updateGameConfig({ bingoPrize: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                  placeholder="Ej: 20"
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', padding: '0.3rem 0.5rem', color: 'white', outline: 'none', width: '100%' }}
                />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Premio de Terna ($)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={gameConfig.ternaPrize}
                  onChange={(e) => updateGameConfig({ ternaPrize: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                  placeholder="Ej: 5"
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', padding: '0.3rem 0.5rem', color: 'white', outline: 'none', width: '100%' }}
                />
              </div>
            </div>

            {/* Programación de Fecha y Hora de Inicio */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Fecha de Inicio</label>
                <input
                  type="date"
                  value={gameConfig.startDate}
                  onChange={(e) => updateGameConfig({ startDate: e.target.value })}
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', padding: '0.3rem 0.5rem', color: 'white', outline: 'none', width: '100%', colorScheme: 'dark' }}
                />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Hora de Inicio</label>
                <input
                  type="time"
                  value={gameConfig.startTime}
                  onChange={(e) => updateGameConfig({ startTime: e.target.value })}
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', padding: '0.3rem 0.5rem', color: 'white', outline: 'none', width: '100%', colorScheme: 'dark' }}
                />
              </div>
            </div>
          </div>

          {/* Invitación */}
          <div style={{ background: 'var(--bg-tertiary)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Invitar Jugadores</span>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <input type="text" readOnly value={`${window.location.origin}?room=${gameId}`} style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', padding: '0.3rem 0.5rem', color: 'var(--text-secondary)', outline: 'none' }} />
              <button className="btn-secondary" onClick={copyInviteLink} style={{ padding: '0.3rem 0.5rem' }}>
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
            <button 
              className="btn-secondary" 
              onClick={async () => {
                const newCode = await regenerateRoom();
                alert(`Nueva sala generada con éxito: ${newCode}`);
              }}
              style={{
                marginTop: '0.25rem',
                padding: '0.35rem',
                fontSize: '0.75rem',
                width: '100%',
                justifyContent: 'center',
                borderColor: 'rgba(139,92,246,0.3)',
                color: '#c084fc',
                background: 'rgba(139,92,246,0.06)',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              🔄 Generar Nueva Sala / Código
            </button>
          </div>

          <button className="btn-secondary" onClick={leaveGame} style={{ width: '100%', padding: '0.5rem 1rem', fontSize: '0.85rem', height: '36px', justifyContent: 'center' }}>
            Salir de la Sala
          </button>
        </div>
      </div>

      {/* ── Visual Bingo Claim Verification Modal ── */}
      {(() => {
        const activeClaim = pendingClaims.find(c => c.status === 'pending');
        if (!activeClaim) return null;

        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            animation: 'fadeInOverlay 0.3s ease'
          }}>
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid rgba(139,92,246,0.4)',
              borderRadius: 'var(--radius-lg)',
              width: '90%',
              maxWidth: '460px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              animation: 'ballPopBig 0.4s cubic-bezier(0.175,0.885,0.32,1.275)'
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    🏆 Validación de Ganador
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Jugador: <strong style={{ color: '#c084fc' }}>{activeClaim.playerName}</strong> • {activeClaim.winType}
                  </span>
                </div>
                <span className="badge-live" style={{ background: 'var(--accent-gold)' }}>PENDIENTE</span>
              </div>

              {/* Grid 5x5 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', width: '100%', maxWidth: '320px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-around', fontWeight: 'bold', color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: '0.2rem' }}>
                  {['B', 'I', 'N', 'G', 'O'].map(l => <span key={l} style={{ width: '100%', textAlign: 'center' }}>{l}</span>)}
                </div>
                {activeClaim.matrix.map((row, rIdx) => (
                  <div key={rIdx} style={{ display: 'flex', gap: '0.3rem', justifyContent: 'space-around' }}>
                    {row.map((val, cIdx) => {
                      const isFree = rIdx === 2 && cIdx === 2;
                      const isMarked = activeClaim.marked[rIdx][cIdx];
                      const isValidCalled = isFree || (val !== null && drawnNumbers.includes(val));

                      // Highlight colors
                      let cellBg = 'rgba(255,255,255,0.02)';
                      let cellBorder = '1px solid var(--border-color)';
                      let textColor = '#e2e8f0';

                      if (isMarked && isValidCalled) {
                        cellBg = 'rgba(16, 185, 129, 0.15)';
                        cellBorder = '2px solid var(--success)';
                        textColor = '#10b981';
                      } else if (isMarked && !isValidCalled) {
                        cellBg = 'rgba(239, 68, 68, 0.15)';
                        cellBorder = '2px solid var(--danger)';
                        textColor = '#ef4444';
                      } else if (!isMarked && isValidCalled && !isFree) {
                        cellBg = 'rgba(139, 92, 246, 0.04)';
                        cellBorder = '1px dashed rgba(139, 92, 246, 0.3)';
                        textColor = 'rgba(255,255,255,0.4)';
                      }

                      return (
                        <div
                          key={cIdx}
                          style={{
                            flex: 1,
                            aspectRatio: 1,
                            borderRadius: '6px',
                            background: cellBg,
                            border: cellBorder,
                            color: textColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.95rem',
                            fontWeight: 'bold',
                            position: 'relative'
                          }}
                        >
                          {isFree ? (
                            <span style={{ fontSize: '0.5rem', color: 'var(--success)' }}>LIBRE</span>
                          ) : val}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Leyenda */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '0.4rem', borderRadius: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }}></span> Correcto
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--danger)' }}></span> Error (Marca Falsa)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6b7280', border: '1px dashed rgba(139, 92, 246, 0.6)' }}></span> Cantada / No marcada
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  className="btn-secondary"
                  onClick={() => resolveClaim(activeClaim.id, 'rejected')}
                  style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', borderColor: 'var(--danger)', color: 'var(--danger)', justifyContent: 'center' }}
                >
                  ❌ Rechazar Bingo
                </button>
                <button
                  className="btn-primary"
                  onClick={() => resolveClaim(activeClaim.id, 'approved')}
                  style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', background: 'var(--success)', borderColor: 'var(--success)', color: 'white', justifyContent: 'center' }}
                >
                  ✅ Aprobar Bingo
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Floating Push Notification Alerts (Real-Time) */}
      {(() => {
        const submittedPayoutClaims = pendingClaims.filter(c => c.payoutStatus === 'submitted');
        return submittedPayoutClaims.map(claim => (
          <div 
            key={claim.id}
            onClick={() => {
              setActivePayoutClaimId(claim.id);
            }}
            style={{
              position: 'fixed',
              top: '1.5rem',
              right: '1.5rem',
              zIndex: 5000,
              background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.95) 0%, rgba(17, 16, 38, 0.95) 100%)',
              border: '2px solid var(--accent-gold)',
              borderRadius: '12px',
              padding: '1rem',
              width: '320px',
              boxShadow: '0 10px 30px rgba(245, 158, 11, 0.3), 0 0 15px rgba(245, 158, 11, 0.1)',
              cursor: 'pointer',
              animation: 'fadeInRight 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 12px 35px rgba(245, 158, 11, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 10px 30px rgba(245, 158, 11, 0.3)';
            }}
          >
            <div style={{
              background: 'rgba(245, 158, 11, 0.15)',
              color: 'var(--accent-gold)',
              padding: '0.5rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'ringPulse 1.5s infinite'
            }}>
              <Award size={20} />
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--accent-gold)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  🔔 Notificación Push
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                  Ahora mismo
                </span>
              </div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'white', margin: '0 0 0.15rem 0' }}>
                ¡DATOS DE PAGO RECIBIDOS!
              </h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                El ganador <strong style={{ color: 'white' }}>{claim.playerName}</strong> envió sus datos de cobro. Haz clic para procesar.
              </p>
            </div>
          </div>
        ));
      })()}

      {/* Dedicated Private Payout Console Modal */}
      {(() => {
        if (!activePayoutClaimId) return null;
        const claim = pendingClaims.find(c => c.id === activePayoutClaimId);
        if (!claim) return null;

        const details = claim.payoutDetails;
        
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 4000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            animation: 'fadeInOverlay 0.2s ease',
            padding: '1rem'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.98) 0%, rgba(18, 16, 38, 0.98) 100%)',
              border: '2px solid rgba(139,92,246,0.6)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: '540px',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
              animation: 'ballPopBig 0.4s cubic-bezier(0.175,0.885,0.32,1.275)'
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.6rem' }}>
                <div style={{ textAlign: 'left' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                    💼 Consola de Pago Privada
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Premio de <strong style={{ color: 'var(--accent-gold)' }}>{claim.playerName}</strong> • {claim.winType}
                  </span>
                </div>
                <span className="badge-live" style={{ 
                  background: claim.payoutStatus === 'completed' ? 'var(--success)' : 'var(--accent-gold)', 
                  color: claim.payoutStatus === 'completed' ? 'white' : 'black',
                  fontWeight: 'bold'
                }}>
                  {claim.payoutStatus === 'completed' ? 'PAGADO ✅' : 'COBRO ENVIADO ⏳'}
                </span>
              </div>

              {/* Payout Information Grid */}
              <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', padding: '1rem', textAlign: 'left' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'white', marginTop: 0, marginBottom: '0.6rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  💰 Datos del Beneficiario
                </h4>
                
                {!details ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                    El jugador aún no ha ingresado sus datos de pago...
                  </p>
                ) : details.method === 'yappy' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>MÉTODO DE COBRO:</div>
                      <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#0088cc' }}>Yappy Panamá 📱</div>
                      
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.6rem' }}>MONTO A TRANSFERIR:</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10b981' }}>{formatPayoutAmount(gameConfig.payoutAmount) || '$150.00 USD'}</div>
                    </div>
                    {details.yappyQrCode && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                        <img 
                          src={details.yappyQrCode} 
                          alt="Yappy QR Code" 
                          onClick={() => setLightboxImage(details.yappyQrCode || null)}
                          style={{ width: '100px', height: '100px', borderRadius: '8px', border: '2px solid rgba(255,255,255,0.1)', cursor: 'zoom-in', boxShadow: '0 0 10px rgba(0,0,0,0.5)' }} 
                        />
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>🔍 Clic para ampliar</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>MÉTODO DE COBRO:</span>
                      <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'white' }}>Transferencia Bancaria 🏦</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>MONTO A TRANSFERIR:</span>
                      <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#10b981' }}>{formatPayoutAmount(gameConfig.payoutAmount) || '$150.00 USD'}</div>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>BENEFICIARIO:</span>
                      <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'white' }}>{details.fullName}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>BANCO:</span>
                      <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'white' }}>{details.bankName}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>TIPO Y NÚMERO DE CUENTA:</span>
                      <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'white' }}>{details.accountType} - {details.accountNumber}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Dedicated Chat Feed */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '0.3rem', margin: 0 }}>
                  💬 Chat Directo con el Ganador
                </h4>
                
                <div style={{
                  background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.6rem',
                  height: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem'
                }}>
                  {(!claim.privateChat || claim.privateChat.length === 0) ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic', margin: 'auto', textAlign: 'center' }}>
                      Coordinación del pago. Saluda al ganador aquí...
                    </div>
                  ) : (
                    claim.privateChat.map((msg) => {
                      const isMe = msg.isHost;
                      return (
                        <div 
                          key={msg.id} 
                          style={{
                            alignSelf: isMe ? 'flex-end' : 'flex-start',
                            maxWidth: '85%',
                            background: isMe ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.07)',
                            border: isMe ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.1)',
                            borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                            padding: '0.4rem 0.6rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.15rem'
                          }}
                        >
                          <div style={{ fontSize: '0.6rem', color: isMe ? '#c084fc' : '#a7f3d0', fontWeight: 'bold' }}>
                            {isMe ? 'Tú (Organizador)' : msg.sender}
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

                {/* Reply form */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!hostChatInput.trim()) return;
                    sendPayoutChatMessage(claim.id, hostChatInput, 'Organizador');
                    setHostChatInput('');
                  }}
                  style={{ display: 'flex', gap: '0.4rem' }}
                >
                  <input 
                    type="text"
                    placeholder="Escribe un mensaje de coordinación..."
                    value={hostChatInput}
                    onChange={(e) => setHostChatInput(e.target.value)}
                    style={{
                      flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(0,0,0,0.3)', color: 'white'
                    }}
                  />
                  <button 
                    type="submit"
                    className="btn-accent"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: 'var(--accent-purple)' }}
                  >
                    Enviar
                  </button>
                </form>
              </div>

              {/* Receipt Upload section */}
              {claim.payoutStatus !== 'completed' ? (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(139,92,246,0.3)', borderRadius: '8px', padding: '0.75rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.2rem', margin: 0 }}>
                    🧾 Cargar captura del comprobante de transferencia realizada:
                  </label>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) compressClaimPayoutReceipt(file);
                    }}
                    style={{
                      fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.35rem', borderRadius: '6px', width: '100%', cursor: 'pointer'
                    }}
                  />
                  {compressingClaimPayout && <p style={{ fontSize: '0.65rem', color: 'var(--accent-gold)', margin: 0 }}>⏳ Procesando imagen del comprobante...</p>}
                  {claimPayoutReceipt && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                      <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 'bold' }}>✓ Comprobante listo para enviar</span>
                      <img 
                        src={claimPayoutReceipt} 
                        alt="Receipt Preview" 
                        onClick={() => setLightboxImage(claimPayoutReceipt)}
                        style={{ width: '40px', height: '40px', borderRadius: '4px', border: '1px solid #10b981', cursor: 'zoom-in' }} 
                        title="Haz clic para ampliar"
                      />
                    </div>
                  )}
                </div>
              ) : claim.payoutReceipt && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.3rem', background: 'rgba(16,185,129,0.02)', padding: '0.6rem', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.15)', textAlign: 'left' }}>
                  <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 'bold' }}>🧾 Comprobante de Transferencia enviado:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <img 
                      src={claim.payoutReceipt} 
                      alt="Payout Receipt" 
                      onClick={() => setLightboxImage(claim.payoutReceipt || null)}
                      style={{ width: '60px', height: '60px', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.3)', cursor: 'zoom-in', boxShadow: '0 0 10px rgba(0,0,0,0.4)' }} 
                    />
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>🔍 Haz clic para ampliar comprobante</span>
                  </div>
                </div>
              )}

              {/* Bottom Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button 
                  className="btn-secondary" 
                  onClick={() => setActivePayoutClaimId(null)}
                  style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem', justifyContent: 'center' }}
                >
                  Cerrar Consola
                </button>
                
                {claim.payoutStatus !== 'completed' && (
                  <button 
                    className="btn-primary" 
                    onClick={() => {
                      if (!claimPayoutReceipt) {
                        alert('Por favor carga la captura de la transferencia realizada para confirmar el pago.');
                        return;
                      }
                      completePayout(claim.id, claimPayoutReceipt);
                      setActivePayoutClaimId(null); // Close modal on complete
                      triggerToast('¡Pago confirmado y comprobante enviado al jugador!');
                    }}
                    disabled={compressingClaimPayout}
                    style={{ flex: 1.5, padding: '0.5rem', fontSize: '0.8rem', background: 'var(--success)', borderColor: 'var(--success)', color: 'white', justifyContent: 'center', opacity: compressingClaimPayout ? 0.6 : 1 }}
                  >
                    ✅ Confirmar Pago Efectuado
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Auditor de Comprobante de Pago Yappy Modal */}
      {(() => {
        if (!activeAuditTx) return null;
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 4000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            animation: 'fadeInOverlay 0.2s ease',
            padding: '1rem'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)',
              border: '2px solid rgba(0, 136, 204, 0.6)',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '460px',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
              animation: 'ballPopBig 0.4s cubic-bezier(0.175,0.885,0.32,1.275)'
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.6rem' }}>
                <div style={{ textAlign: 'left' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                    🔍 Auditor de Comprobante Yappy
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Verificación de pago de <strong style={{ color: 'var(--accent-gold)' }}>{activeAuditTx.playerName}</strong>
                  </span>
                </div>
                <span className="badge-live" style={{ 
                  background: activeAuditTx.status === 'approved' ? 'var(--success)' : activeAuditTx.status === 'rejected' ? '#ef4444' : '#0088cc', 
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '0.65rem'
                }}>
                  {activeAuditTx.status === 'approved' ? 'APROBADO ✅' : activeAuditTx.status === 'rejected' ? 'RECHAZADO ❌' : 'PENDIENTE ⏳'}
                </span>
              </div>

              {/* Transaction Metadata Card */}
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem', textAlign: 'left' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Desglose de Monto:</span>
                    <p style={{ margin: '0.1rem 0 0 0', fontWeight: 'bold', color: 'var(--accent-gold)', fontSize: '0.9rem' }}>
                      {activeAuditTx.quantity} cartón(es) × ${(Number(gameConfig.cardPrice) || 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Total a Validar:</span>
                    <p style={{ margin: '0.1rem 0 0 0', fontWeight: 'bold', color: 'white', fontSize: '0.95rem' }}>
                      ${activeAuditTx.amount.toFixed(2)} USD
                    </p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Referencia Única:</span>
                    <p style={{ margin: '0.1rem 0 0 0', fontFamily: 'monospace', color: '#38bdf8' }}>{activeAuditTx.id}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Hora Solicitud:</span>
                    <p style={{ margin: '0.1rem 0 0 0', color: 'white' }}>{activeAuditTx.timestamp}</p>
                  </div>
                </div>
              </div>

              {/* Receipt Image Display */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>🖼️ Comprobante de Pago Subido:</span>
                {activeAuditTx.paymentReceipt ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#090d16', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(0, 136, 204, 0.2)' }}>
                    <img 
                      src={activeAuditTx.paymentReceipt} 
                      alt="Payment Receipt Screenshot" 
                      style={{ maxWidth: '100%', maxHeight: '260px', objectFit: 'contain', borderRadius: '4px', cursor: 'zoom-in', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}
                      onClick={() => setLightboxImage(activeAuditTx.paymentReceipt || null)}
                    />
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>🔍 Haz clic en la imagen para ver a pantalla completa</span>
                  </div>
                ) : (
                  <div style={{ background: 'rgba(239, 68, 68, 0.05)', color: '#f87171', border: '1px dashed #ef4444', borderRadius: '8px', padding: '1rem', textAlign: 'center', fontSize: '0.75rem' }}>
                    No se adjuntó imagen del comprobante.
                  </div>
                )}
              </div>

              {/* Rejection input */}
              {showRejectionInput && activeAuditTx.status === 'pending' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.75rem', borderRadius: '8px', textAlign: 'left', animation: 'fadeInOverlay 0.2s ease' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#f87171' }}>Motivo del Rechazo:</label>
                  <input
                    type="text"
                    value={rejectionReasonText}
                    onChange={(e) => setRejectionReasonText(e.target.value)}
                    placeholder="Ej: Captura recortada, imagen falsa, monto menor..."
                    style={{ background: 'var(--bg-primary)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '4px', fontSize: '0.75rem', padding: '0.4rem 0.5rem', color: 'white', outline: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                    <button 
                      className="btn-secondary" 
                      onClick={() => setShowRejectionInput(false)}
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                    >
                      Cancelar
                    </button>
                    <button 
                      className="btn-accent" 
                      onClick={() => {
                        if (!rejectionReasonText.trim()) {
                          alert('Por favor describe el motivo de rechazo para notificar al jugador.');
                          return;
                        }
                        rejectTransaction(activeAuditTx.id, rejectionReasonText);
                        setActiveAuditTx(null);
                        setShowRejectionInput(false);
                        setRejectionReasonText('');
                        triggerToast('¡Pago rechazado y jugador notificado!');
                      }}
                      style={{ padding: '0.2rem 0.6rem', fontSize: '0.7rem', background: '#ef4444', borderColor: '#ef4444', color: 'white' }}
                    >
                      Confirmar Rechazo ❌
                    </button>
                  </div>
                </div>
              )}

              {/* Bottom Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button 
                  className="btn-secondary" 
                  onClick={() => {
                    setActiveAuditTx(null);
                    setShowRejectionInput(false);
                    setRejectionReasonText('');
                  }}
                  style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem', justifyContent: 'center' }}
                >
                  Cerrar
                </button>

                {activeAuditTx.status === 'pending' && !showRejectionInput && (
                  <>
                    <button 
                      className="btn-accent" 
                      onClick={() => setShowRejectionInput(true)}
                      style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', borderColor: '#ef4444', color: '#f87171', justifyContent: 'center' }}
                    >
                      ❌ Rechazar Pago
                    </button>
                    <button 
                      className="btn-primary" 
                      onClick={() => {
                        handleOpenAssignModal(activeAuditTx.id);
                        setActiveAuditTx(null);
                      }}
                      style={{ flex: 1.5, padding: '0.45rem', fontSize: '0.8rem', background: 'var(--success)', borderColor: 'var(--success)', color: 'white', justifyContent: 'center' }}
                    >
                      ✅ Aprobar y Emitir
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Lightbox / Zoom modal */}
      {lightboxImage && (
        <div 
          onClick={() => setLightboxImage(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(10, 5, 15, 0.95)', backdropFilter: 'blur(10px)',
            animation: 'fadeInOverlay 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            cursor: 'zoom-out', padding: '1rem'
          }}
        >
          {/* Elegant Circular Close "X" Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxImage(null);
            }}
            style={{
              position: 'absolute', top: '1.5rem', right: '1.5rem',
              width: '46px', height: '46px', borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'white', fontSize: '1.5rem', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)', transition: 'all 0.2s ease',
              outline: 'none', zIndex: 10000
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            ✕
          </button>
          <img 
            src={lightboxImage} 
            alt="Zoomed preview" 
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the image itself
            style={{
              maxWidth: '95vw', maxHeight: '95vh',
              objectFit: 'contain', borderRadius: '12px',
              border: '2px solid rgba(255,255,255,0.15)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.7), 0 0 40px rgba(139,92,246,0.15)',
              cursor: 'default',
              animation: 'zoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }} 
          />
        </div>
      )}

      {/* ── Line Assignment Modal ── */}
      {showAssignModal && assigningTxId && (() => {
        const tx = pendingTransactions.find(t => t.id === assigningTxId);
        if (!tx) return null;

        // Parse lines from other approved/pending transactions to see which are occupied
        const soldLines: Record<number, string> = {};
        const pendingLines: Record<number, string> = {};
        
        pendingTransactions.forEach(t => {
          if (t.id === assigningTxId) return;
          const parsed = parseReceiptData(t.paymentReceipt);
          parsed.lines.forEach((lineNum: number) => {
            if (t.status === 'approved') {
              soldLines[lineNum] = t.playerName;
            } else if (t.status === 'pending') {
              pendingLines[lineNum] = t.playerName;
            }
          });
        });

        const toggleLineSelection = (lineNum: number) => {
          setSelectedLinesForAssign(prev => {
            if (prev.includes(lineNum)) {
              return prev.filter(l => l !== lineNum);
            }
            if (prev.length >= tx.quantity) {
              return [...prev.slice(1), lineNum];
            }
            return [...prev, lineNum];
          });
        };

        const handleConfirm = () => {
          if (selectedLinesForAssign.length !== tx.quantity) {
            alert(`Debes asignar exactamente ${tx.quantity} línea(s) para este pago.`);
            return;
          }
          approveTransaction(tx.id, selectedLinesForAssign);
          setShowAssignModal(false);
          setAssigningTxId(null);
          triggerToast(`¡Pago aprobado y línea(s) ${selectedLinesForAssign.join(', ')} asignada(s) con éxito!`);
        };

        return (
          <div className="yappy-modal-overlay" style={{ zIndex: 10000 }}>
            <div className="yappy-card" style={{ maxWidth: '520px', width: '90%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-secondary)', border: '2px solid var(--accent-gold)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', color: 'white', boxShadow: '0 20px 40px rgba(0,0,0,0.8)' }}>
              
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.6rem', textAlign: 'left' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  🎯 Asignar Líneas a {tx.playerName}
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  El jugador pagó <strong>${tx.amount.toFixed(2)} USD</strong> y solicitó <strong>{tx.quantity} línea(s)</strong>.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                  Selecciona {tx.quantity} línea(s) de la lista ({selectedLinesForAssign.length} de {tx.quantity} seleccionadas):
                </span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '320px', overflowY: 'auto', paddingRight: '0.2rem' }}>
                  {Array.from({ length: 15 }).map((_, idx) => {
                    const lineNum = idx + 1;
                    const owner = soldLines[lineNum];
                    const reserver = pendingLines[lineNum];
                    const isSold = !!owner;
                    const isReserved = !!reserver;
                    const isSelected = selectedLinesForAssign.includes(lineNum);
                    
                    let statusLabel = '';
                    let btnBg = 'rgba(255,255,255,0.02)';
                    let btnBorder = '1px solid var(--border-color)';
                    let textColor = 'white';
                    let cursorStyle = 'pointer';
                    let isDisabled = false;

                    if (isSold) {
                      statusLabel = `Ocupada por ${owner}`;
                      btnBg = 'rgba(239, 68, 68, 0.05)';
                      btnBorder = '1px solid rgba(239, 68, 68, 0.25)';
                      textColor = '#f87171';
                      cursorStyle = 'not-allowed';
                      isDisabled = true;
                    } else if (isReserved) {
                      statusLabel = `Reservada por ${reserver}`;
                      btnBg = 'rgba(245, 158, 11, 0.05)';
                      btnBorder = '1px solid rgba(245, 158, 11, 0.25)';
                      textColor = '#fbbf24';
                      cursorStyle = 'not-allowed';
                      isDisabled = true;
                    } else if (isSelected) {
                      btnBg = 'rgba(245, 158, 11, 0.15)';
                      btnBorder = '2px solid var(--accent-gold)';
                      textColor = 'var(--accent-gold)';
                    }

                    return (
                      <button
                        key={lineNum}
                        disabled={isDisabled}
                        onClick={() => toggleLineSelection(lineNum)}
                        style={{
                          background: btnBg,
                          border: btnBorder,
                          borderRadius: '8px',
                          padding: '0.45rem 0.75rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: cursorStyle,
                          color: textColor,
                          outline: 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{
                            width: '24px', height: '24px', borderRadius: '50%',
                            background: isSelected ? 'var(--accent-gold)' : 'rgba(255,255,255,0.08)',
                            color: isSelected ? 'black' : 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.72rem', fontWeight: 'bold'
                          }}>
                            {lineNum}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                            {lineNum}, {lineNum + 15}, {lineNum + 30}, {lineNum + 45}, {lineNum + 60}
                          </span>
                        </div>
                        {statusLabel && <span style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>{statusLabel}</span>}
                        {isSelected && !statusLabel && <span style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>ASIGNADA ✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setShowAssignModal(false);
                    setAssigningTxId(null);
                  }}
                  style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem', justifyContent: 'center', borderColor: 'rgba(255,255,255,0.15)' }}
                >
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  disabled={selectedLinesForAssign.length !== tx.quantity}
                  onClick={handleConfirm}
                  style={{
                    flex: 1.5, padding: '0.45rem', fontSize: '0.8rem',
                    background: selectedLinesForAssign.length === tx.quantity ? 'var(--success)' : 'rgba(255,255,255,0.05)',
                    borderColor: selectedLinesForAssign.length === tx.quantity ? 'var(--success)' : 'rgba(255,255,255,0.08)',
                    color: selectedLinesForAssign.length === tx.quantity ? 'white' : 'rgba(255,255,255,0.2)',
                    cursor: selectedLinesForAssign.length === tx.quantity ? 'pointer' : 'not-allowed',
                    justifyContent: 'center'
                  }}
                >
                  Confirmar Asignación
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Toast Alert Div */}
      {toastMessage && <div className="toast-notification">{toastMessage}</div>}
    </div>
  );
};

// Helper utility to convert ArrayBuffer to Base64 in HostView
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};
