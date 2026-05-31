import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

// Interfaces for our state model
export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  isHost: boolean;
}

export interface BingoCard {
  id: string;
  matrix: (number | null)[][]; // 5x5 grid, null for FREE space
  marked: boolean[][]; // 5x5 marked status
  isWinner: boolean;
  type?: 'Bingo' | 'Línea' | 'Terna' | 'Cajón' | null;
  purchasedLine?: number;
}

export interface YappyTransaction {
  id: string;
  playerName: string;
  quantity: number;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: string;
  paymentReceipt?: string; // base64 receipt
  rejectionReason?: string;
}

export interface GameConfig {
  gameName: string;
  cardPrice: number | '';
  paymentDetails: string;
  winningMechanic: 'line' | 'full' | 'cajon' | 'terna';
  customLogo: string | null;
  qrCode: string | null;
  payoutAmount: string;
  startDate: string;
  startTime: string;
  bingoPrize?: number | '';
  ternaPrize?: number | '';
}

export interface PayoutDetails {
  method: 'yappy' | 'transfer';
  yappyQrCode?: string; // base64 resized to 150x150
  bankName?: string;
  accountType?: 'Ahorro' | 'Corriente';
  accountNumber?: string;
  fullName?: string;
}

export interface PrivateMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  isHost: boolean;
}

export interface BingoClaim {
  id: string;
  playerName: string;
  cardId: string;
  matrix: (number | null)[][];
  marked: boolean[][];
  winType: string;
  status: 'pending' | 'approved' | 'rejected';
  payoutDetails?: PayoutDetails;
  payoutStatus?: 'pending' | 'submitted' | 'completed';
  privateChat?: PrivateMessage[];
  payoutReceipt?: string; // base64 receipt completed by host
}

export interface HostProfileData {
  id: string;
  status: 'demo' | 'active' | 'suspended' | 'pending_payment' | 'requesting_access' | 'requesting_demo';
  subscription_end_date: string;
}

export type Role = 'select' | 'host' | 'player' | 'superadmin-login' | 'superadmin';

interface BingoContextType {
  role: Role;
  setRole: (role: Role) => void;
  gameId: string;
  setGameId: (id: string) => void;
  gameStatus: 'idle' | 'active' | 'finished';
  drawnNumbers: number[];
  lastDrawn: number | null;
  chatMessages: ChatMessage[];
  playerCards: BingoCard[];
  setPlayerCards: React.Dispatch<React.SetStateAction<BingoCard[]>>;
  pendingTransactions: YappyTransaction[];
  voiceEnabled: boolean;
  setVoiceEnabled: (enabled: boolean) => void;
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;
  streamFrame: string | null;
  setStreamFrame: (frame: string | null) => void;
  playerName: string;
  setPlayerName: (name: string) => void;
  
  // Auth state & actions
  hostUser: string | null;
  hostProfile: HostProfileData | null;
  hostRegister: (user: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  hostLogin: (user: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  hostLogout: () => Promise<void>;
  
  superAdminUser: string | null;
  superAdminRegister: (user: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  superAdminLogin: (user: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  superAdminLogout: () => Promise<void>;
  
  // Actions
  createGame: () => Promise<string>;
  joinGame: (id: string) => Promise<boolean>;
  leaveGame: () => void;
  drawNumber: (specificNum?: number) => Promise<number | null>;
  resetGame: () => void;
  regenerateRoom: () => Promise<string>;
  sendChatMessage: (text: string, senderName?: string) => Promise<void>;
  buyCards: (quantity: number, playerName: string, paymentReceipt?: string) => Promise<string>; // Returns transaction ID
  approveTransaction: (id: string, assignedLines?: number[]) => Promise<void>;
  rejectTransaction: (id: string, reason: string) => Promise<void>;
  claimBingo: (cardId: string, playerName: string) => { won: boolean; type: 'Bingo' | 'Línea' | 'Terna' | 'Cajón' | null };
  gameConfig: GameConfig;
  updateGameConfig: (config: Partial<GameConfig>) => void;
  pendingClaims: BingoClaim[];
  submitClaim: (cardId: string, playerName: string) => Promise<void>;
  resolveClaim: (claimId: string, status: 'approved' | 'rejected') => Promise<void>;
  submitPayoutDetails: (claimId: string, details: PayoutDetails) => Promise<void>;
  sendPayoutChatMessage: (claimId: string, text: string, senderName: string) => Promise<void>;
  completePayout: (claimId: string, receiptBase64?: string) => Promise<void>;
}

const BingoContext = createContext<BingoContextType | undefined>(undefined);

// Initialize BroadcastChannel for cross-tab local communication!
const bc = new BroadcastChannel('bingo-kno-sync-channel');

export const parsePayoutAmount = (payoutAmount: string) => {
  let bingoPrize: number | '' = '';
  let ternaPrize: number | '' = '';
  if (payoutAmount && payoutAmount.trim().startsWith('{')) {
    try {
      const data = JSON.parse(payoutAmount);
      bingoPrize = data.bingo !== undefined && data.bingo !== '' ? data.bingo : '';
      ternaPrize = data.terna !== undefined && data.terna !== '' ? data.terna : '';
    } catch (e) {
      console.error('Error parsing payout_amount JSON:', e);
    }
  }
  return { bingoPrize, ternaPrize };
};

export const formatPayoutAmount = (payoutAmount: string) => {
  if (!payoutAmount) return '';
  try {
    if (payoutAmount.trim().startsWith('{')) {
      const data = JSON.parse(payoutAmount);
      const b = data.bingo !== undefined && data.bingo !== '' ? Number(data.bingo).toFixed(2) : '0.00';
      const t = data.terna !== undefined && data.terna !== '' ? Number(data.terna).toFixed(2) : '0.00';
      return `Bingo: $${b} USD / Terna: $${t} USD`;
    }
  } catch (e) {
    // fallback
  }
  return payoutAmount;
};

export const parseReceiptData = (paymentReceipt?: string) => {
  if (!paymentReceipt) return { lines: [], receipt: undefined };
  try {
    const trimmed = paymentReceipt.trim();
    if (trimmed.startsWith('{')) {
      const data = JSON.parse(trimmed);
      return {
        lines: data.lines || [],
        receipt: data.receipt
      };
    }
  } catch (e) {
    console.error('Error parsing receipt JSON:', e);
  }
  return { lines: [], receipt: paymentReceipt };
};


// Helper to generate a classic Bingo 75 card
export const generateBingoCard = (): BingoCard => {
  const matrix: (number | null)[][] = Array(5).fill(null).map(() => Array(5).fill(null));
  const marked: boolean[][] = Array(5).fill(null).map(() => Array(5).fill(false));

  // Bingo 75 Columns intervals:
  // B: 1-15, I: 16-30, N: 31-45 (middle is free), G: 46-60, O: 61-75
  const intervals = [
    { min: 1, max: 15 },
    { min: 16, max: 30 },
    { min: 31, max: 45 },
    { min: 46, max: 60 },
    { min: 61, max: 75 }
  ];

  for (let col = 0; col < 5; col++) {
    const { min, max } = intervals[col];
    const pool: number[] = [];
    for (let val = min; val <= max; val++) pool.push(val);
    
    // Draw 5 unique numbers for this column
    const colNumbers: number[] = [];
    for (let row = 0; row < 5; row++) {
      const idx = Math.floor(Math.random() * pool.length);
      colNumbers.push(pool.splice(idx, 1)[0]);
    }
    
    // Sort column numbers to resemble real bingo cards
    colNumbers.sort((a, b) => a - b);

    for (let row = 0; row < 5; row++) {
      if (col === 2 && row === 2) {
        matrix[row][col] = null; // Free space in the center
        marked[row][col] = true; // Free space starts marked
      } else {
        matrix[row][col] = colNumbers[row];
      }
    }
  }

  return {
    id: `card-${Math.random().toString(36).substr(2, 9)}`,
    matrix,
    marked,
    isWinner: false,
    type: null
  };
};

// Helper to generate a custom card representing a single purchased horizontal line
export const generateLineCard = (lineNumber: number): BingoCard => {
  const matrix: (number | null)[][] = Array(5).fill(null).map(() => Array(5).fill(null));
  const marked: boolean[][] = Array(5).fill(null).map(() => Array(5).fill(false));

  matrix[0][0] = lineNumber;
  matrix[0][1] = lineNumber + 15;
  matrix[0][2] = lineNumber + 30;
  matrix[0][3] = lineNumber + 45;
  matrix[0][4] = lineNumber + 60;

  return {
    id: `line-${lineNumber}-${Math.floor(1000 + Math.random() * 9000)}`,
    matrix,
    marked,
    isWinner: false,
    type: null,
    purchasedLine: lineNumber
  };
};

// Text-to-speech helper for live voice announcements
const speakText = (text: string) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-LA'; // Latin American Spanish
    utterance.rate = 0.95; // Slightly slower for clarity
    window.speechSynthesis.speak(utterance);
  }
};

// Helper for sound and push notifications
const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046.50, ctx.currentTime);
      gain2.gain.setValueAtTime(0.1, ctx.currentTime);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.3);
    }, 150);
  } catch (e) {
    console.error('AudioContext not supported');
  }
};

const notifyHost = (title: string, body: string) => {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, { body, icon: '/favicon.ico' });
        }
      });
    }
  }
};

export const BingoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<Role>(() => (sessionStorage.getItem('bingo_role') as Role) || 'select');
  const [gameId, setGameId] = useState<string>(() => sessionStorage.getItem('bingo_gameId') || '');
  const [gameStatus, setGameStatus] = useState<'idle' | 'active' | 'finished'>('idle');
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [lastDrawn, setLastDrawn] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [playerCards, setPlayerCards] = useState<BingoCard[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<YappyTransaction[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [isStreaming, setIsStreamingState] = useState<boolean>(false);
  const [streamFrame, setStreamFrame] = useState<string | null>(null);
  
  // Host user authentication state
  const [hostUser, setHostUser] = useState<string | null>(() => sessionStorage.getItem('bingo_hostUser') || null);
  const [hostProfile, setHostProfile] = useState<HostProfileData | null>(() => {
    const saved = sessionStorage.getItem('bingo_hostProfile');
    return saved ? JSON.parse(saved) : null;
  });
  const [superAdminUser, setSuperAdminUser] = useState<string | null>(() => sessionStorage.getItem('bingo_superAdminUser') || null);

  useEffect(() => {
    sessionStorage.setItem('bingo_role', role);
    sessionStorage.setItem('bingo_gameId', gameId);
    if (hostUser) sessionStorage.setItem('bingo_hostUser', hostUser);
    else sessionStorage.removeItem('bingo_hostUser');
    if (superAdminUser) sessionStorage.setItem('bingo_superAdminUser', superAdminUser);
    else sessionStorage.removeItem('bingo_superAdminUser');
    if (hostProfile) sessionStorage.setItem('bingo_hostProfile', JSON.stringify(hostProfile));
    else sessionStorage.removeItem('bingo_hostProfile');
  }, [role, gameId, hostUser, superAdminUser, hostProfile]);

  const [gameConfig, setGameConfigState] = useState<GameConfig>({
    gameName: 'Bingo-KNO',
    cardPrice: '',
    paymentDetails: 'Yappy Panamá: @bingokno / Banco General',
    winningMechanic: 'full',
    customLogo: null,
    qrCode: null,
    payoutAmount: '',
    startDate: '',
    startTime: '',
    bingoPrize: '',
    ternaPrize: ''
  });
  const [pendingClaims, setPendingClaims] = useState<BingoClaim[]>([]);

  const setIsStreaming = useCallback((streaming: boolean) => {
    setIsStreamingState(streaming);
    bc.postMessage({ type: streaming ? 'stream-start' : 'stream-stop' });
    if (gameIdRef.current) {
      supabase.channel(`room-${gameIdRef.current}`).send({
        type: 'broadcast',
        event: 'stream-state',
        payload: { isStreaming: streaming }
      });
    }
  }, []);
  
  // Local Player name synced in context
  const [playerName, setPlayerNameState] = useState(() => {
    const adjectives = ['Veloz', 'Afortunado', 'Ganador', 'Inteligente', 'Activo'];
    const names = ['Carlos', 'Maria', 'Jose', 'Ana', 'Luis', 'Sofia'];
    return `${names[Math.floor(Math.random() * names.length)]} ${adjectives[Math.floor(Math.random() * adjectives.length)]}`;
  });

  const playerNameRef = useRef(playerName);
  const setPlayerName = (name: string) => {
    setPlayerNameState(name);
    playerNameRef.current = name;
  };

  // Keep Refs of active game state to prevent stale closures in BroadcastChannel listener
  const roleRef = useRef(role);
  const drawnNumbersRef = useRef(drawnNumbers);
  const lastDrawnRef = useRef(lastDrawn);
  const gameStatusRef = useRef(gameStatus);
  const isStreamingRef = useRef(isStreaming);
  const gameConfigRef = useRef(gameConfig);
  const pendingClaimsRef = useRef(pendingClaims);
  const hostUserRef = useRef(hostUser);
  const pendingTransactionsRef = useRef(pendingTransactions);
  const gameIdRef = useRef(gameId);
  const updateConfigTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { drawnNumbersRef.current = drawnNumbers; }, [drawnNumbers]);
  useEffect(() => { lastDrawnRef.current = lastDrawn; }, [lastDrawn]);
  useEffect(() => { gameStatusRef.current = gameStatus; }, [gameStatus]);
  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);
  useEffect(() => { gameConfigRef.current = gameConfig; }, [gameConfig]);
  useEffect(() => { pendingClaimsRef.current = pendingClaims; }, [pendingClaims]);
  useEffect(() => { hostUserRef.current = hostUser; }, [hostUser]);
  useEffect(() => { pendingTransactionsRef.current = pendingTransactions; }, [pendingTransactions]);
  useEffect(() => { gameIdRef.current = gameId; }, [gameId]);

  // Audio announcer of drawn numbers
  const announceNumber = useCallback((num: number) => {
    if (!voiceEnabled) return;
    
    let letter = '';
    if (num >= 1 && num <= 15) letter = 'B';
    else if (num >= 16 && num <= 30) letter = 'I';
    else if (num >= 31 && num <= 45) letter = 'N';
    else if (num >= 46 && num <= 60) letter = 'G';
    else if (num >= 61 && num <= 75) letter = 'O';

    const textToSpeak = `¡${letter}! ${num}. Repito. ¡${letter}! ${num}.`;
    speakText(textToSpeak);
  }, [voiceEnabled]);

  // Supabase Realtime Subscriptions (Phase 3)
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase.channel(`room-${gameId}`)
      // Listen to room updates (e.g. drawn_numbers, game_status, configs)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${gameId}` }, async (payload) => {
        const data = payload.new as any;
        if (roleRef.current === 'player') {
          if (data.drawn_numbers) {
            setDrawnNumbers(prev => {
              // Only announce if a NEW number was added
              if (data.drawn_numbers.length > prev.length) {
                const newNum = data.drawn_numbers[data.drawn_numbers.length - 1];
                announceNumber(newNum);
                setLastDrawn(newNum);
              }
              return data.drawn_numbers;
            });
          }
          if (data.game_status) setGameStatus(data.game_status);

          // Re-fetch full room data from DB to avoid truncated payload (base64 images)
          // postgres_changes payloads truncate large text fields like custom_logo and qr_code
          const { data: fullRoom } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', gameIdRef.current)
            .single();
          
          if (fullRoom) {
            let customLogo = fullRoom.custom_logo || null;
            let qrCode = fullRoom.qr_code || null;
            
            if ((!customLogo || !qrCode) && fullRoom.host_id) {
              try {
                const { data: profile } = await supabase
                  .from('host_profiles')
                  .select('custom_logo, qr_code')
                  .eq('id', fullRoom.host_id)
                  .single();
                if (profile) {
                  if (!customLogo) customLogo = profile.custom_logo || null;
                  if (!qrCode) qrCode = profile.qr_code || null;
                }
              } catch (e) {
                console.error('Error fetching host profile fallback on update:', e);
              }
            }

            const { bingoPrize, ternaPrize } = parsePayoutAmount(fullRoom.payout_amount || '');

            setGameConfigState({
              gameName: fullRoom.game_name || '',
              cardPrice: fullRoom.card_price !== undefined ? fullRoom.card_price : '',
              paymentDetails: fullRoom.payment_details || '',
              winningMechanic: (fullRoom.winning_mechanic || 'full') as any,
              customLogo,
              qrCode,
              payoutAmount: fullRoom.payout_amount || '',
              startDate: fullRoom.start_date || '',
              startTime: fullRoom.start_time || '',
              bingoPrize,
              ternaPrize
            });
          }
        }
      })
      // Listen to new chat messages
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${gameId}` }, (payload) => {
        const msg = payload.new as any;
        const newMsg: ChatMessage = {
          id: msg.id,
          sender: msg.sender,
          text: msg.text,
          timestamp: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isHost: msg.is_host
        };
        setChatMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;

          // Emit soft alert sound for incoming chat messages from others
          const isFromMe = newMsg.sender === playerNameRef.current || (roleRef.current === 'host' && newMsg.isHost);
          if (!isFromMe) {
            playChatBeep();
          }

          return [...prev, newMsg];
        });
      })
      // Listen to new transactions (buyCards)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions', filter: `room_id=eq.${gameId}` }, (payload) => {
        const tx = payload.new as any;
        if (roleRef.current === 'host') {
          const newTx: YappyTransaction = {
            id: tx.id,
            playerName: tx.player_name,
            quantity: tx.quantity,
            amount: tx.amount,
            status: tx.status,
            paymentReceipt: tx.payment_receipt,
            timestamp: new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setPendingTransactions(prev => {
            if (prev.some(t => t.id === newTx.id)) return prev;
            
            // Trigger sound and push notification
            playNotificationSound();
            notifyHost('Nuevo Pago Recibido 💰', `${newTx.playerName} ha enviado un comprobante por $${newTx.amount}`);
            
            return [...prev, newTx];
          });
        }
      })
      // Listen to updated transactions (approve/reject)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions', filter: `room_id=eq.${gameId}` }, (payload) => {
        const tx = payload.new as any;
        setPendingTransactions(prev => 
          prev.map(t => t.id === tx.id ? { ...t, status: tx.status, rejectionReason: tx.rejection_reason } : t)
        );
      })
      // Listen to fast broadcast events (like drawing a number instantly before DB syncs)
      .on('broadcast', { event: 'draw-number' }, (payload) => {
        if (roleRef.current === 'player') {
          const num = payload.payload.number;
          setDrawnNumbers(prev => {
            if (prev.includes(num)) return prev;
            announceNumber(num);
            return [...prev, num];
          });
          setLastDrawn(num);
          setGameStatus('active');
        }
      })
      .on('broadcast', { event: 'approve-tx' }, (payload) => {
        const { playerName, lines } = payload.payload;
        // Generate local cards representing purchased lines for the matching player tab
        if (roleRef.current === 'player' && playerNameRef.current === playerName) {
          const cards: BingoCard[] = [];
          const linesToGen = lines || [];
          linesToGen.forEach((lineNum: number) => {
            cards.push(generateLineCard(lineNum));
          });
          setPlayerCards(prevCards => [...prevCards, ...cards]);
        }
      })
      .on('broadcast', { event: 'stream-state' }, (payload) => {
        setIsStreamingState(payload.payload.isStreaming);
        if (!payload.payload.isStreaming) {
          setStreamFrame(null);
        }
      })
      .on('broadcast', { event: 'request-stream-state' }, () => {
        if (roleRef.current === 'host') {
          supabase.channel(`room-${gameId}`).send({
            type: 'broadcast',
            event: 'stream-state',
            payload: { isStreaming: isStreamingRef.current }
          });
        }
      })
      .on('broadcast', { event: 'stream-frame' }, (payload) => {
        if (roleRef.current === 'player') {
          setStreamFrame(payload.payload.frame);
        }
      })
      .on('broadcast', { event: 'stream-audio' }, (payload) => {
        if (roleRef.current === 'player') {
          try {
            const audioBc = new BroadcastChannel('bingo-kno-audio-channel');
            audioBc.postMessage(payload.payload);
            audioBc.close();
          } catch (err) {
            console.error('Error forwarding stream-audio payload:', err);
          }
        }
      })
      // Listen to new claims
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'claims', filter: `room_id=eq.${gameId}` }, (payload) => {
        const claim = payload.new as any;
        const newClaim: BingoClaim = {
          id: claim.id,
          playerName: claim.player_name,
          cardId: claim.card_id,
          matrix: claim.matrix,
          marked: claim.marked,
          winType: claim.win_type,
          status: claim.status,
          payoutStatus: claim.payout_status,
          payoutDetails: claim.payout_details,
          payoutReceipt: claim.payout_receipt,
          privateChat: []
        };
        setPendingClaims(prev => {
          if (prev.some(c => c.id === newClaim.id)) return prev;
          return [...prev, newClaim];
        });
      })
      // Listen to updated claims (resolve, payout updates)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'claims', filter: `room_id=eq.${gameId}` }, (payload) => {
        const claim = payload.new as any;
        setPendingClaims(prev => 
          prev.map(c => c.id === claim.id ? { 
            ...c, 
            status: claim.status, 
            payoutStatus: claim.payout_status,
            payoutDetails: claim.payout_details || c.payoutDetails,
            payoutReceipt: claim.payout_receipt || c.payoutReceipt
          } : c)
        );
      })
      // Listen to private messages for claims
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_messages' }, (payload) => {
        const msg = payload.new as any;
        const newMsg: PrivateMessage = {
          id: msg.id,
          sender: msg.sender,
          text: msg.text,
          timestamp: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isHost: msg.is_host
        };
        
        setPendingClaims(prev => 
          prev.map(c => {
            if (c.id === msg.claim_id) {
              const chat = c.privateChat || [];
              if (chat.some(m => m.id === newMsg.id)) return c;
              return { ...c, privateChat: [...chat, newMsg] };
            }
            return c;
          })
        );
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (roleRef.current === 'player') {
            supabase.channel(`room-${gameId}`).send({
              type: 'broadcast',
              event: 'request-stream-state',
              payload: {}
            });
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, announceNumber]);

  // Sync state between tabs/windows in same computer
  useEffect(() => {
    const handleSyncMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || !data.type) return;

      switch (data.type) {
        case 'request-game-sync':
          // If this tab is the host, reply with the current game status
          if (roleRef.current === 'host') {
            bc.postMessage({
              type: 'game-sync-response',
              drawnNumbers: drawnNumbersRef.current,
              lastDrawn: lastDrawnRef.current,
              gameStatus: gameStatusRef.current,
              isStreaming: isStreamingRef.current,
              gameConfig: gameConfigRef.current,
              pendingClaims: pendingClaimsRef.current
            });
          }
          break;
        case 'game-sync-response':
          // If this tab is a player, absorb the synced host state
          if (roleRef.current === 'player') {
            setDrawnNumbers(data.drawnNumbers);
            setLastDrawn(data.lastDrawn);
            setGameStatus(data.gameStatus);
            setIsStreamingState(data.isStreaming);
            if (data.gameConfig) setGameConfigState(data.gameConfig);
            if (data.pendingClaims) setPendingClaims(data.pendingClaims);
          }
          break;
        case 'chat-message':
          setChatMessages(prev => {
            if (prev.some(m => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
          break;
        case 'stream-start':
          setIsStreamingState(true);
          break;
        case 'stream-stop':
          setIsStreamingState(false);
          setStreamFrame(null);
          break;
        case 'draw-number':
          setDrawnNumbers(prev => {
            if (prev.includes(data.number)) return prev;
            announceNumber(data.number);
            return [...prev, data.number];
          });
          setLastDrawn(data.number);
          setGameStatus('active');
          break;
        case 'reset-game':
          setDrawnNumbers([]);
          setLastDrawn(null);
          setGameStatus('idle');
          setChatMessages([]);
          break;
        case 'buy-cards':
          setPendingTransactions(prev => {
            if (prev.some(t => t.id === data.transaction.id)) return prev;
            return [...prev, data.transaction];
          });
          break;
        case 'approve-tx':
          setPendingTransactions(prev => 
            prev.map(tx => {
              if (tx.id === data.id && tx.status === 'pending') {
                // If it is this player tab who matches the purchaser, generate the digital cards!
                if (playerNameRef.current === data.playerName) {
                  const cards: BingoCard[] = [];
                  const linesToGen = data.lines || [];
                  linesToGen.forEach((lineNum: number) => {
                    cards.push(generateLineCard(lineNum));
                  });
                  setPlayerCards(prevCards => [...prevCards, ...cards]);
                }
                const receiptData = JSON.stringify({
                  lines: data.lines || [],
                  receipt: parseReceiptData(tx.paymentReceipt).receipt
                });
                return { ...tx, status: 'approved', paymentReceipt: receiptData };
              }
              return tx;
            })
          );
          break;
        case 'reject-tx':
          setPendingTransactions(prev => 
            prev.map(tx => {
              if (tx.id === data.id && tx.status === 'pending') {
                return { ...tx, status: 'rejected', rejectionReason: data.reason };
              }
              return tx;
            })
          );
          break;
        case 'claim-victory':
          speakText(`¡Atención! ¡El jugador ${data.playerName} canta ${data.winType}! Repito. ¡El jugador ${data.playerName} canta ${data.winType}!`);
          break;
        case 'update-config':
          setGameConfigState(data.config);
          break;
        case 'submit-claim':
          setPendingClaims(prev => {
            if (prev.some(c => c.id === data.claim.id)) return prev;
            return [...prev, data.claim];
          });
          if (roleRef.current === 'host') {
            speakText(`¡Atención! ¡El jugador ${data.claim.playerName} canta ${data.claim.winType}!`);
          }
          break;
        case 'resolve-claim':
          setPendingClaims(prev => prev.map(c => {
            if (c.id === data.claimId) {
              return { ...c, status: data.status, payoutStatus: data.status === 'approved' ? 'pending' : undefined, privateChat: [] };
            }
            return c;
          }));
          if (data.status === 'approved') {
            setPlayerCards(prev => prev.map(c => {
              if (c.id === data.cardId) {
                return { ...c, isWinner: true, type: data.winType };
              }
              return c;
            }));
          } else {
            // If rejected, ensure player's card clears winner state so congrats overlay closes
            setPlayerCards(prev => prev.map(c => {
              if (c.id === data.cardId) {
                return { ...c, isWinner: false };
              }
              return c;
            }));
          }
          break;
        case 'submit-payout-details':
          setPendingClaims(prev => 
            prev.map(c => {
              if (c.id === data.claimId) {
                return { ...c, payoutDetails: data.details, payoutStatus: 'submitted' };
              }
              return c;
            })
          );
          break;
        case 'payout-chat-message':
          setPendingClaims(prev => 
            prev.map(c => {
              if (c.id === data.claimId) {
                const chat = c.privateChat || [];
                if (chat.some(m => m.id === data.message.id)) return c;
                return { ...c, privateChat: [...chat, data.message] };
              }
              return c;
            })
          );
          break;
        case 'complete-payout':
          setPendingClaims(prev => 
            prev.map(c => {
              if (c.id === data.claimId) {
                return { ...c, payoutStatus: 'completed', payoutReceipt: data.receipt };
              }
              return c;
            })
          );
          break;
        default:
          break;
      }
    };

    bc.addEventListener('message', handleSyncMessage);
    
    // Broadcast a sync request if we are already in player role to catch up on mount
    if (roleRef.current === 'player') {
      bc.postMessage({ type: 'request-game-sync' });
    }

    return () => {
      bc.removeEventListener('message', handleSyncMessage);
    };
  }, [announceNumber]);

  // Listen to local BroadcastChannel for HD frames (cross-tab local communication)
  useEffect(() => {
    const streamBc = new BroadcastChannel('bingo-kno-stream-channel');
    const handleStreamFrame = (e: MessageEvent) => {
      setStreamFrame(e.data?.frame ?? null);
    };
    streamBc.addEventListener('message', handleStreamFrame);
    return () => {
      streamBc.removeEventListener('message', handleStreamFrame);
      streamBc.close();
    };
  }, []);

  useEffect(() => {
    if (gameId) {
      setChatMessages(prev => {
        const welcomeText = `¡Bienvenidos al juego de ${gameConfig.gameName}!`;
        const welcomeIdx = prev.findIndex(m => m.id === 'welcome');
        
        if (welcomeIdx >= 0) {
          // Dynamically update the text in real-time when game name changes
          return prev.map(m => m.id === 'welcome' ? { ...m, text: welcomeText } : m);
        } else {
          // Prepend new welcome message
          return [
            {
              id: 'welcome',
              sender: 'Sistema',
              text: welcomeText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isHost: false
            },
            ...prev
          ];
        }
      });
    }
  }, [gameId, gameConfig.gameName]);

  // Authenticated host user actions
  const hostRegister = useCallback(async (user: string, pass: string) => {
    try {
      const username = user.trim().toLowerCase();
      const safeUsername = username.replace(/[^a-z0-9]/g, '');
      if (!safeUsername || !pass.trim()) {
        return { success: false, error: 'Por favor completa todos los campos (solo letras y números para usuario).' };
      }

      // Convert username to a dummy email for Supabase Auth
      const email = `${safeUsername}@bingokno.com`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
      });

      if (error) {
        if (error.message.includes('already registered')) {
          return { success: false, error: 'El nombre de usuario ya existe.' };
        }
        return { success: false, error: error.message };
      }

      if (data.user) {
        // Insert into profile table
        const { error: profileError, data: profileData } = await supabase
          .from('host_profiles')
          .insert({ id: data.user.id, username, status: 'requesting_access' })
          .select()
          .single();
          
        if (profileError) {
           console.error('Error creating profile:', profileError);
        } else if (profileData) {
           setHostProfile({
             id: profileData.id,
             status: profileData.status,
             subscription_end_date: profileData.subscription_end_date
           });
        }
      }

      const initialConfig: GameConfig = {
        gameName: 'Mi Gran Bingo',
        cardPrice: '',
        paymentDetails: 'Yappy Panamá: @bingokno / Banco General',
        winningMechanic: 'full',
        customLogo: null,
        qrCode: null,
        payoutAmount: '$150.00',
        startDate: '',
        startTime: ''
      };

      setHostUser(username);
      setGameConfigState(initialConfig);
      return { success: true };
    } catch (e) {
      return { success: false, error: 'Error inesperado al registrar el usuario.' };
    }
  }, []);

  const hostLogin = useCallback(async (user: string, pass: string) => {
    try {
      const username = user.trim().toLowerCase();
      const safeUsername = username.replace(/[^a-z0-9]/g, '');
      const email = `${safeUsername}@bingokno.com`;
      
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });

      if (error) {
        return { success: false, error: 'Usuario o contraseña incorrectos.' };
      }
      
      setHostUser(username);
      
      if (authData.user) {
        const { data: profile } = await supabase
          .from('host_profiles')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (profile) {
          setHostProfile({
            id: profile.id,
            status: profile.status,
            subscription_end_date: profile.subscription_end_date
          });
          setGameConfigState(prev => ({
            ...prev,
            gameName: profile.game_name || prev.gameName,
            cardPrice: profile.card_price !== null ? profile.card_price : prev.cardPrice,
            paymentDetails: profile.payment_details || prev.paymentDetails,
            winningMechanic: profile.winning_mechanic || prev.winningMechanic,
            customLogo: profile.custom_logo || null,
            qrCode: profile.qr_code || null,
            payoutAmount: profile.payout_amount || prev.payoutAmount
          }));
        }
      }
      
      return { success: true };
    } catch (e) {
      return { success: false, error: 'Error al iniciar sesión.' };
    }
  }, []);

  const hostLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setHostUser(null);
    setHostProfile(null);
    setRole('select');
    setGameId('');
  }, []);

  const superAdminRegister = useCallback(async (user: string, pass: string) => {
    try {
      const username = user.trim().toLowerCase();
      const safeUsername = username.replace(/[^a-z0-9]/g, '');
      if (!safeUsername || !pass.trim()) {
        return { success: false, error: 'Por favor completa todos los campos (solo letras y números para usuario).' };
      }

      const email = `${safeUsername}@superadmin.com`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
      });

      if (error) {
        if (error.message.includes('already registered')) {
          return { success: false, error: 'El superadmin ya existe.' };
        }
        return { success: false, error: error.message };
      }

      if (data.user) {
        const { error: profileError } = await supabase
          .from('super_admins')
          .insert({ id: data.user.id, username });
          
        if (profileError) {
           console.error('Error creating super admin profile:', profileError);
           return { success: false, error: 'Error interno guardando perfil.' };
        }
      }

      setSuperAdminUser(username);
      setRole('superadmin');
      return { success: true };
    } catch (e) {
      return { success: false, error: 'Error inesperado al registrar el super admin.' };
    }
  }, []);

  const superAdminLogin = useCallback(async (user: string, pass: string) => {
    try {
      const username = user.trim().toLowerCase();
      const safeUsername = username.replace(/[^a-z0-9]/g, '');
      const email = `${safeUsername}@superadmin.com`;
      
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });

      if (error) {
        return { success: false, error: 'Credenciales inválidas de Super Admin.' };
      }
      
      if (authData.user) {
        const { data: profile } = await supabase
          .from('super_admins')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (profile) {
          setSuperAdminUser(profile.username);
          setRole('superadmin');
          return { success: true };
        } else {
          // If not a superadmin, sign out
          await supabase.auth.signOut();
          return { success: false, error: 'No tienes permisos de Super Admin.' };
        }
      }
      
      return { success: false, error: 'Error desconocido.' };
    } catch (e) {
      return { success: false, error: 'Error al iniciar sesión de Super Admin.' };
    }
  }, []);

  const superAdminLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setSuperAdminUser(null);
    setRole('select');
  }, []);

  const createGame = useCallback(async () => {
    const newId = `BINGO-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Insert new room in Supabase
    const { error } = await supabase.from('rooms').insert({
      id: newId,
      host_id: (await supabase.auth.getUser()).data.user?.id,
      game_name: gameConfigRef.current.gameName,
      card_price: gameConfigRef.current.cardPrice,
      payment_details: gameConfigRef.current.paymentDetails,
      winning_mechanic: gameConfigRef.current.winningMechanic,
      custom_logo: gameConfigRef.current.customLogo,
      qr_code: gameConfigRef.current.qrCode,
      payout_amount: gameConfigRef.current.payoutAmount,
      start_date: gameConfigRef.current.startDate,
      start_time: gameConfigRef.current.startTime,
      game_status: 'idle',
      drawn_numbers: []
    });
    
    if (error) {
      console.error('Error creating room in Supabase:', error);
    }
    
    setGameId(newId);
    setGameStatus('idle');
    setDrawnNumbers([]);
    setLastDrawn(null);
    setPendingTransactions([]);
    setPendingClaims([]);
    setIsStreaming(false);
    return newId;
  }, []);

  const regenerateRoom = useCallback(async () => {
    const newId = `BINGO-${Math.floor(1000 + Math.random() * 9000)}`;
    
    const { error } = await supabase.from('rooms').insert({
      id: newId,
      host_id: (await supabase.auth.getUser()).data.user?.id,
      game_name: gameConfigRef.current.gameName,
      card_price: gameConfigRef.current.cardPrice,
      payment_details: gameConfigRef.current.paymentDetails,
      winning_mechanic: gameConfigRef.current.winningMechanic,
      custom_logo: gameConfigRef.current.customLogo,
      qr_code: gameConfigRef.current.qrCode,
      payout_amount: gameConfigRef.current.payoutAmount,
      start_date: gameConfigRef.current.startDate,
      start_time: gameConfigRef.current.startTime,
      game_status: 'idle',
      drawn_numbers: []
    });

    if (error) console.error('Error regenerating room:', error);

    setGameId(newId);
    setDrawnNumbers([]);
    setLastDrawn(null);
    setGameStatus('idle');
    setPendingClaims([]);
    setPendingTransactions([]);
    bc.postMessage({ type: 'reset-game' });
    
    bc.postMessage({ type: 'update-config', config: gameConfigRef.current });
    return newId;
  }, []);

  const joinGame = useCallback(async (id: string) => {
    const formattedId = id.trim().toUpperCase();
    if (formattedId.startsWith('BINGO-')) {
      // Check if room exists in Supabase
      const { data, error } = await supabase.from('rooms').select('*').eq('id', formattedId).single();
      
      if (error || !data) {
        console.error('Sala no encontrada:', error);
        return false;
      }
      
      // Sync game state from DB
      setGameId(formattedId);
      setGameStatus(data.game_status as any);
      setDrawnNumbers(data.drawn_numbers || []);
      if (data.drawn_numbers && data.drawn_numbers.length > 0) {
        setLastDrawn(data.drawn_numbers[data.drawn_numbers.length - 1]);
      } else {
        setLastDrawn(null);
      }
      
      let customLogo = data.custom_logo || null;
      let qrCode = data.qr_code || null;
      
      if ((!customLogo || !qrCode) && data.host_id) {
        try {
          const { data: profile } = await supabase
            .from('host_profiles')
            .select('custom_logo, qr_code')
            .eq('id', data.host_id)
            .single();
          if (profile) {
            if (!customLogo) customLogo = profile.custom_logo || null;
            if (!qrCode) qrCode = profile.qr_code || null;
          }
        } catch (e) {
          console.error('Error fetching host profile fallback on join:', e);
        }
      }

      // 1. Fetch historical transactions to know which lines are sold/reserved
      const { data: txList } = await supabase
        .from('transactions')
        .select('*')
        .eq('room_id', formattedId);
      
      if (txList) {
        setPendingTransactions(txList.map((tx: any) => ({
          id: tx.id,
          playerName: tx.player_name,
          quantity: tx.quantity,
          amount: tx.amount,
          status: tx.status,
          paymentReceipt: tx.payment_receipt,
          timestamp: new Date(tx.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })));
      }

      const { bingoPrize, ternaPrize } = parsePayoutAmount(data.payout_amount || '');

      setGameConfigState({
        gameName: data.game_name,
        cardPrice: data.card_price,
        paymentDetails: data.payment_details,
        winningMechanic: data.winning_mechanic as any,
        customLogo,
        qrCode,
        payoutAmount: data.payout_amount,
        startDate: data.start_date,
        startTime: data.start_time,
        bingoPrize,
        ternaPrize
      });
      
      setPlayerCards([]);
      
      // Request state catch-up immediately after joining (legacy for now)
      setTimeout(() => {
        bc.postMessage({ type: 'request-game-sync' });
      }, 100);
      return true;
    }
    return false;
  }, []);

  const leaveGame = useCallback(() => {
    setGameId('');
    setGameStatus('idle');
    setDrawnNumbers([]);
    setLastDrawn(null);
    setPlayerCards([]);
    setRole('select');
  }, []);

  const drawNumber = useCallback(async (specificNum?: number) => {
    if (drawnNumbers.length >= 75 || !gameId) {
      if (drawnNumbers.length >= 75) setGameStatus('finished');
      return null;
    }

    let num: number;
    if (specificNum !== undefined) {
      if (drawnNumbers.includes(specificNum) || specificNum < 1 || specificNum > 75) {
        return null;
      }
      num = specificNum;
    } else {
      do {
        num = Math.floor(Math.random() * 75) + 1;
      } while (drawnNumbers.includes(num));
    }

    const updatedNumbers = [...drawnNumbers, num];
    
    const { error } = await supabase.from('rooms').update({
      drawn_numbers: updatedNumbers,
      game_status: 'active'
    }).eq('id', gameId);

    if (error) {
       console.error('Error updating drawn numbers:', error);
       return null;
    }

    setDrawnNumbers(updatedNumbers);
    setLastDrawn(num);
    setGameStatus('active');

    // Announce vocals locally
    announceNumber(num);

    // Sync to all other open tabs (Temporary until full Realtime replacement)
    bc.postMessage({ type: 'draw-number', number: num });

    // Also send through Supabase Realtime Broadcast (faster than DB changes)
    supabase.channel(`room-${gameId}`).send({
      type: 'broadcast',
      event: 'draw-number',
      payload: { number: num }
    });

    return num;
  }, [drawnNumbers, announceNumber, gameId]);

  const resetGame = useCallback(async () => {
    if (!gameId) return;

    // Reset room state
    await supabase.from('rooms').update({
      drawn_numbers: [],
      game_status: 'idle'
    }).eq('id', gameId);

    // Clear related data for the room
    await supabase.from('chat_messages').delete().eq('room_id', gameId);
    await supabase.from('transactions').delete().eq('room_id', gameId);
    await supabase.from('claims').delete().eq('room_id', gameId);

    setDrawnNumbers([]);
    setLastDrawn(null);
    setGameStatus('idle');
    setChatMessages([]);
    setPendingTransactions([]);
    setPendingClaims([]);

    supabase.channel(`room-${gameId}`).send({
      type: 'broadcast',
      event: 'reset-game',
      payload: {}
    });

    bc.postMessage({ type: 'reset-game' });
  }, [gameId]);

  const sendChatMessage = useCallback(async (text: string, senderName?: string) => {
    if (!text.trim() || !gameId) return;

    const isUserHost = role === 'host';
    const sender = senderName || (isUserHost ? 'Organizador' : 'Jugador');
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    const { error } = await supabase.from('chat_messages').insert({
      id: msgId,
      room_id: gameId,
      sender,
      text,
      is_host: isUserHost
    });

    if (error) {
      console.error('Error sending chat message:', error);
      return;
    }

    const newMsg: ChatMessage = {
      id: msgId,
      sender,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isHost: isUserHost
    };

    setChatMessages(prev => {
      if (prev.some(m => m.id === newMsg.id)) return prev;
      return [...prev, newMsg];
    });

    // Simulated response for demonstration
    if (isUserHost && text.toLowerCase().includes('inici')) {
      setTimeout(() => {
        const replyText = '¡Excelente! Ya tengo mis cartones listos.';
        const replyId = `msg-sim-${Date.now()}`;
        supabase.from('chat_messages').insert({
          id: replyId,
          room_id: gameId,
          sender: 'Carlos Perez',
          text: replyText,
          is_host: false
        }).then(({error: replyError}) => {
          if (!replyError) {
             setChatMessages(prev => [...prev, {
               id: replyId,
               sender: 'Carlos Perez',
               text: replyText,
               timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
               isHost: false
             }]);
          }
        });
      }, 1000);
    }
  }, [role, gameId]);

  // Payment integration with Yappy QR
  const buyCards = useCallback(async (quantity: number, pName: string, paymentReceipt?: string) => {
    if (!gameId) return '';
    const txId = `YAP-${Math.floor(100000 + Math.random() * 900000)}`;
    const amount = quantity * (Number(gameConfigRef.current.cardPrice) || 0);

    const newTx: YappyTransaction = {
      id: txId,
      playerName: pName,
      quantity,
      amount,
      status: 'pending',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      paymentReceipt
    };

    const { error } = await supabase.from('transactions').insert({
      id: txId,
      room_id: gameId,
      player_name: pName,
      quantity,
      amount,
      status: 'pending',
      payment_receipt: paymentReceipt
    });

    if (error) {
      console.error('Error creating transaction:', error);
      return '';
    }

    setPendingTransactions(prev => [...prev, newTx]);

    // Send a system message to chat
    const sysMsgText = `💸 ${pName} solicitó ${quantity} cartón(es) ($${amount.toFixed(2)}). Comprobante de pago adjunto.`;
    await supabase.from('chat_messages').insert({
      id: `sys-tx-${txId}`,
      room_id: gameId,
      sender: 'Yappy Pay',
      text: sysMsgText,
      is_host: false
    });

    return txId;
  }, [gameId]);

  const approveTransaction = useCallback(async (id: string, assignedLines?: number[]) => {
    const tx = pendingTransactionsRef.current.find(t => t.id === id);
    if (!tx || !gameId) return;

    // Extract original receipt from existing data if possible
    let originalReceipt: string | undefined = tx.paymentReceipt;
    const parsedReceipt = parseReceiptData(tx.paymentReceipt);
    if (parsedReceipt.receipt) originalReceipt = parsedReceipt.receipt;

    const receiptData = JSON.stringify({
      lines: assignedLines || [],
      receipt: originalReceipt
    });

    const { error } = await supabase.from('transactions').update({
      status: 'approved',
      payment_receipt: receiptData
    }).eq('id', id);

    if (error) {
      console.error('Error approving transaction:', error);
      return;
    }

    // Generate local cards representing purchased lines for the player IF the player is on this tab
    if (playerNameRef.current === tx.playerName) {
      const cards: BingoCard[] = [];
      (assignedLines || []).forEach(lineNum => {
        cards.push(generateLineCard(lineNum));
      });
      setPlayerCards(prevCards => [...prevCards, ...cards]);
    }

    supabase.channel(`room-${gameId}`).send({
      type: 'broadcast',
      event: 'approve-tx',
      payload: { id, playerName: tx.playerName, quantity: tx.quantity, lines: assignedLines || [] }
    });

    // Send confirmation message to chat
    setTimeout(async () => {
      await supabase.from('chat_messages').insert({
        id: `sys-app-${id}-${Date.now()}`,
        room_id: gameId,
        sender: 'Yappy Pay',
        text: `✅ Pago Aprobado. ${tx.playerName} recibió la(s) línea(s): ${(assignedLines || []).join(', ')}.`,
        is_host: true
      });
    }, 100);

    setPendingTransactions(prev => 
      prev.map(t => t.id === id ? { ...t, status: 'approved', paymentReceipt: receiptData } : t)
    );
  }, [gameId]);

  const rejectTransaction = useCallback(async (id: string, reason: string) => {
    const tx = pendingTransactionsRef.current.find(t => t.id === id);
    if (!tx || !gameId) return;

    const { error } = await supabase.from('transactions').update({
      status: 'rejected',
      rejection_reason: reason
    }).eq('id', id);

    if (error) {
      console.error('Error rejecting transaction:', error);
      return;
    }

    supabase.channel(`room-${gameId}`).send({
      type: 'broadcast',
      event: 'reject-tx',
      payload: { id, playerName: tx.playerName, reason }
    });

    setTimeout(async () => {
      await supabase.from('chat_messages').insert({
        id: `sys-rej-${id}-${Date.now()}`,
        room_id: gameId,
        sender: 'Yappy Pay',
        text: `❌ Pago de Yappy Rechazado para ${tx.playerName}. Motivo: ${reason}`,
        is_host: true
      });
    }, 100);

    setPendingTransactions(prev => 
      prev.map(t => t.id === id ? { ...t, status: 'rejected', rejectionReason: reason } : t)
    );
  }, [gameId]);

  // Validation algorithms for Lines (horiz, vert, diag) and full Bingo (25 markings)
  const claimBingo = useCallback((cardId: string, pName: string) => {
    let card = playerCards.find(c => c.id === cardId);
    if (!card) return { won: false, type: null };

    const isNumberValid = (val: number | null) => {
      if (val === null) return true; // Free space
      return drawnNumbers.includes(val);
    };

    // Check rows
    let rowsWon = 0;
    for (let r = 0; r < 5; r++) {
      let completed = true;
      for (let c = 0; c < 5; c++) {
        const val = card.matrix[r][c];
        if (!isNumberValid(val) || !card.marked[r][c]) {
          completed = false;
          break;
        }
      }
      if (completed) rowsWon++;
    }


    // Check Full Bingo (all elements marked, except the center free spaces if not marked)
    let totalCellsToWin = 24; // 25 - free center
    let markedCellsCorrect = 0;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (r === 2 && c === 2) continue; // Skip free space
        const val = card.matrix[r][c];
        if (val !== null && drawnNumbers.includes(val) && card.marked[r][c]) {
          markedCellsCorrect++;
        }
      }
    }
    const hasBingo = markedCellsCorrect === totalCellsToWin;

    // Check Terna (3 matches in any horizontal row)
    let ternaWon = false;
    for (let r = 0; r < 5; r++) {
      let count = 0;
      for (let c = 0; c < 5; c++) {
        const val = card.matrix[r][c];
        if (isNumberValid(val) && card.marked[r][c]) {
          count++;
        }
      }
      if (count >= 3) {
        ternaWon = true;
        break;
      }
    }

    // Check Cajón (outer border completed)
    let cajonWon = true;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (r === 0 || r === 4 || c === 0 || c === 4) {
          const val = card.matrix[r][c];
          if (!isNumberValid(val) || !card.marked[r][c]) {
            cajonWon = false;
            break;
          }
        }
      }
      if (!cajonWon) break;
    }

    // Horizontal Line only
    const hasHorizontalLine = rowsWon > 0;

    let winType: 'Bingo' | 'Línea' | 'Terna' | 'Cajón' | null = null;
    let won = false;

    const currentMechanic = gameConfigRef.current.winningMechanic;

    if (currentMechanic === 'full' && hasBingo) {
      winType = 'Bingo';
      won = true;
    } else if (currentMechanic === 'line' && hasHorizontalLine) {
      winType = 'Línea';
      won = true;
    } else if (currentMechanic === 'terna' && ternaWon) {
      winType = 'Terna';
      won = true;
    } else if (currentMechanic === 'cajon' && cajonWon) {
      winType = 'Cajón';
      won = true;
    } else {
      // Fallback: If for some reason the mechanic is not matched, check anyway
      if (hasBingo) {
        winType = 'Bingo';
        won = true;
      } else if (hasHorizontalLine) {
        winType = 'Línea';
        won = true;
      }
    }

    if (won && winType) {
      setPlayerCards(prev => prev.map(c => {
        if (c.id === cardId) {
          return { ...c, isWinner: true, type: winType };
        }
        return c;
      }));

      // Broadcast victory so all tabs speak the winner's name and post!
      bc.postMessage({ type: 'claim-victory', playerName: pName, winType });
      speakText(`¡Atención! ¡El jugador ${pName} canta ${winType}! Repito. ¡El jugador ${pName} canta ${winType}!`);

      // Post in chat
      const sysMsg: ChatMessage = {
        id: `sys-win-${cardId}-${Date.now()}`,
        sender: 'Bingo Kno',
        text: `🏆 ¡JUGADA GANADORA! ${pName} cantó ${winType.toUpperCase()} con el cartón ${cardId.substr(-4)} 🎉`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isHost: true
      };
      setChatMessages(prev => [...prev, sysMsg]);
      bc.postMessage({ type: 'chat-message', message: sysMsg });
    }

    return { won, type: winType };
  }, [playerCards, drawnNumbers]);

  const updateGameConfig = useCallback((newConfig: Partial<GameConfig>) => {
    setGameConfigState(prev => {
      const updated = { ...prev, ...newConfig };
      if (newConfig.bingoPrize !== undefined || newConfig.ternaPrize !== undefined) {
        updated.payoutAmount = JSON.stringify({ bingo: updated.bingoPrize, terna: updated.ternaPrize });
      }
      bc.postMessage({ type: 'update-config', config: updated });
      
      if (hostUserRef.current) {
        if (updateConfigTimeoutRef.current) clearTimeout(updateConfigTimeoutRef.current);
        updateConfigTimeoutRef.current = setTimeout(async () => {
          // 1. Update the active room settings
          if (gameIdRef.current) {
            await supabase.from('rooms').update({
              game_name: updated.gameName,
              card_price: updated.cardPrice,
              payment_details: updated.paymentDetails,
              winning_mechanic: updated.winningMechanic,
              custom_logo: updated.customLogo,
              qr_code: updated.qrCode,
              payout_amount: updated.payoutAmount,
              start_date: updated.startDate,
              start_time: updated.startTime
            }).eq('id', gameIdRef.current);
          }
          
          // 2. Update the host profile for permanent storage of their settings
          await supabase.from('host_profiles').update({
            game_name: updated.gameName,
            card_price: updated.cardPrice,
            payment_details: updated.paymentDetails,
            winning_mechanic: updated.winningMechanic,
            custom_logo: updated.customLogo,
            qr_code: updated.qrCode,
            payout_amount: updated.payoutAmount
          }).eq('username', hostUserRef.current);

        }, 1000);
      }
      
      // Persist to localStorage under hostUser profile
      if (hostUserRef.current) {
        try {
          const hosts = JSON.parse(localStorage.getItem('bingo_kno_hosts') || '{}');
          if (hosts[hostUserRef.current]) {
            hosts[hostUserRef.current].config = updated;
            localStorage.setItem('bingo_kno_hosts', JSON.stringify(hosts));
          }
        } catch (e) {
          console.error('Error persisting config to localStorage:', e);
        }
      }
      return updated;
    });
  }, []);

  const submitClaim = useCallback(async (cardId: string, pName: string) => {
    const card = playerCards.find(c => c.id === cardId);
    if (!card || !gameId) return;

    const winTypeString = 
      gameConfig.winningMechanic === 'full' ? 'Cartón Lleno' :
      gameConfig.winningMechanic === 'cajon' ? 'Cajón' :
      gameConfig.winningMechanic === 'terna' ? 'Terna' : 'Línea Horizontal';

    const claimId = `claim-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    const { error } = await supabase.from('claims').insert({
      id: claimId,
      room_id: gameId,
      player_name: pName,
      card_id: card.id,
      matrix: card.matrix,
      marked: card.marked,
      win_type: winTypeString,
      status: 'pending',
      payout_status: 'pending'
    });

    if (error) {
      console.error('Error submitting claim:', error);
      return;
    }

    const claim: BingoClaim = {
      id: claimId,
      playerName: pName,
      cardId: card.id,
      matrix: card.matrix,
      marked: card.marked,
      winType: winTypeString,
      status: 'pending'
    };

    setPendingClaims(prev => {
      if (prev.some(c => c.id === claim.id)) return prev;
      return [...prev, claim];
    });

    // Speak announcement locally
    speakText(`¡El jugador ${pName} canta ${winTypeString}!`);

    // Post system message to chat
    await supabase.from('chat_messages').insert({
      id: `sys-claim-${claim.id}`,
      room_id: gameId,
      sender: 'Salas de Juegos K-NO',
      text: `📢 ${pName} cantó ${winTypeString.toUpperCase()} (Cartón ${cardId.substr(-4)}). Verificación del administrador de sala pendiente.`,
      is_host: false
    });
  }, [playerCards, gameConfig, gameId]);

  const resolveClaim = useCallback(async (claimId: string, status: 'approved' | 'rejected') => {
    const claim = pendingClaimsRef.current.find(c => c.id === claimId);
    if (!claim || !gameId) return;

    const { error } = await supabase.from('claims').update({
      status: status,
      payout_status: status === 'approved' ? 'pending' : undefined
    }).eq('id', claimId);

    if (error) {
      console.error('Error resolving claim:', error);
      return;
    }
    
    supabase.channel(`room-${gameId}`).send({
      type: 'broadcast',
      event: 'resolve-claim',
      payload: { claimId, status, cardId: claim.cardId, playerName: claim.playerName, winType: claim.winType }
    });
    
    if (status === 'approved') {
      speakText(`¡Felicidades! ¡El bingo de ${claim.playerName} ha sido aprobado!`);
      
      await supabase.from('chat_messages').insert({
        id: `sys-claim-app-${claimId}`,
        room_id: gameId,
        sender: 'Salas de Juegos K-NO',
        text: `🎉 ¡BINGO APROBADO! La jugada de ${claim.playerName} (${claim.winType.toUpperCase()}) ha sido verificada y es CORRECTA. ¡Tenemos un ganador! 🏆`,
        is_host: true
      });
    } else {
      speakText(`El bingo de ${claim.playerName} ha sido rechazado.`);
      
      await supabase.from('chat_messages').insert({
        id: `sys-claim-rej-${claimId}`,
        room_id: gameId,
        sender: 'Salas de Juegos K-NO',
        text: `❌ BINGO RECHAZADO. La jugada de ${claim.playerName} (${claim.winType.toUpperCase()}) fue verificada y contiene marcas INCORRECTAS.`,
        is_host: true
      });
    }

    setPendingClaims(prev => 
      prev.map(c => c.id === claimId ? { ...c, status, payoutStatus: status === 'approved' ? 'pending' : undefined, privateChat: [] } : c)
    );
  }, [gameId]);

  const submitPayoutDetails = useCallback(async (claimId: string, details: PayoutDetails) => {
    if (!gameId) return;

    const { error } = await supabase.from('claims').update({
      payout_status: 'submitted',
      payout_details: details
    }).eq('id', claimId);

    if (error) {
      console.error('Error submitting payout details:', error);
      return;
    }

    supabase.channel(`room-${gameId}`).send({
      type: 'broadcast',
      event: 'submit-payout-details',
      payload: { claimId, details }
    });

    setPendingClaims(prev => 
      prev.map(c => c.id === claimId ? { ...c, payoutDetails: details, payoutStatus: 'submitted' } : c)
    );
  }, [gameId]);

  const sendPayoutChatMessage = useCallback(async (claimId: string, text: string, senderName: string) => {
    if (!text.trim() || !gameId) return;
    const isUserHost = roleRef.current === 'host';
    const msgId = `pmsg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    const { error } = await supabase.from('private_messages').insert({
      id: msgId,
      claim_id: claimId,
      sender: senderName,
      text,
      is_host: isUserHost
    });

    if (error) {
      console.error('Error sending private message:', error);
      return;
    }

    const newMsg: PrivateMessage = {
      id: msgId,
      sender: senderName,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isHost: isUserHost
    };

    setPendingClaims(prev => 
      prev.map(c => {
        if (c.id === claimId) {
          const chat = c.privateChat || [];
          if (chat.some(m => m.id === msgId)) return c;
          return { ...c, privateChat: [...chat, newMsg] };
        }
        return c;
      })
    );
  }, [gameId]);

  const completePayout = useCallback(async (claimId: string, receiptBase64?: string) => {
    if (!gameId) return;

    const { error } = await supabase.from('claims').update({
      payout_status: 'completed',
      payout_receipt: receiptBase64
    }).eq('id', claimId);

    if (error) {
      console.error('Error completing payout:', error);
      return;
    }

    supabase.channel(`room-${gameId}`).send({
      type: 'broadcast',
      event: 'complete-payout',
      payload: { claimId, receipt: receiptBase64 }
    });

    setPendingClaims(prev => 
      prev.map(c => c.id === claimId ? { ...c, payoutStatus: 'completed', payoutReceipt: receiptBase64 } : c)
    );
 
    // Send a system message to the main chat that the payout is completed
    const claim = pendingClaimsRef.current.find(c => c.id === claimId);
    if (claim) {
      setTimeout(async () => {
        await supabase.from('chat_messages').insert({
          id: `sys-payout-comp-${claimId}-${Date.now()}`,
          room_id: gameId,
          sender: 'Salas de Juegos K-NO',
          text: `💸 PAGO PROCESADO EXITOSAMENTE. El administrador de sala ha completado el pago del premio a ${claim.playerName}. ¡Felicidades! 🏆🎉`,
          is_host: true
        });
      }, 200);
    }
  }, [gameId]);

  return (
    <BingoContext.Provider value={{
      role,
      setRole,
      gameId,
      setGameId,
      gameStatus,
      drawnNumbers,
      lastDrawn,
      chatMessages,
      playerCards,
      setPlayerCards,
      pendingTransactions,
      voiceEnabled,
      setVoiceEnabled,
      isStreaming,
      setIsStreaming,
      streamFrame,
      setStreamFrame,
      playerName,
      setPlayerName,
      
      hostUser,
      hostProfile,
      hostRegister,
      hostLogin,
      hostLogout,
      
      superAdminUser,
      superAdminRegister,
      superAdminLogin,
      superAdminLogout,
      
      createGame,
      joinGame,
      leaveGame,
      drawNumber,
      resetGame,
      regenerateRoom,
      sendChatMessage,
      buyCards,
      approveTransaction,
      rejectTransaction,
      claimBingo,
      gameConfig,
      updateGameConfig,
      pendingClaims,
      submitClaim,
      resolveClaim,
      submitPayoutDetails,
      sendPayoutChatMessage,
      completePayout
    }}>
      {children}
    </BingoContext.Provider>
  );
};

export const useBingo = () => {
  const context = useContext(BingoContext);
  if (context === undefined) {
    throw new Error('useBingo must be used within a BingoProvider');
  }
  return context;
};

// Utilities for converting binary ArrayBuffer to/from base64 for network transmission

// Chime sound for incoming chat messages (3-note ascending pattern, louder)
const playChatBeep = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const playNote = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playNote(880, now, 0.12);        // A5
    playNote(1046.5, now + 0.13, 0.12); // C6
    playNote(1318.5, now + 0.26, 0.2);  // E6 (longer)
  } catch (e) {
    // Silently ignore — browser audio policy may block this
  }
};
