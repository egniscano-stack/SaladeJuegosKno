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
  type?: 'Bingo' | 'Línea' | null;
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
  cardPrice: number;
  paymentDetails: string;
  winningMechanic: 'line' | 'full' | 'cajon' | 'terna';
  customLogo: string | null;
  qrCode: string | null;
  payoutAmount: string;
  startDate: string;
  startTime: string;
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

export type Role = 'select' | 'host' | 'player';

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
  playerName: string;
  setPlayerName: (name: string) => void;
  
  // Auth state & actions
  hostUser: string | null;
  hostRegister: (user: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  hostLogin: (user: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  hostLogout: () => Promise<void>;
  
  // Actions
  createGame: () => Promise<string>;
  joinGame: (id: string) => Promise<boolean>;
  leaveGame: () => void;
  drawNumber: (specificNum?: number) => Promise<number | null>;
  resetGame: () => void;
  regenerateRoom: () => Promise<string>;
  sendChatMessage: (text: string, senderName?: string) => Promise<void>;
  buyCards: (quantity: number, playerName: string, paymentReceipt?: string) => Promise<string>; // Returns transaction ID
  approveTransaction: (id: string) => Promise<void>;
  rejectTransaction: (id: string, reason: string) => Promise<void>;
  claimBingo: (cardId: string, playerName: string) => { won: boolean; type: 'Bingo' | 'Línea' | null };
  gameConfig: GameConfig;
  updateGameConfig: (config: Partial<GameConfig>) => void;
  pendingClaims: BingoClaim[];
  submitClaim: (cardId: string, playerName: string) => void;
  resolveClaim: (claimId: string, status: 'approved' | 'rejected') => void;
  submitPayoutDetails: (claimId: string, details: PayoutDetails) => void;
  sendPayoutChatMessage: (claimId: string, text: string, senderName: string) => void;
  completePayout: (claimId: string, payoutReceipt?: string) => void;
}

const BingoContext = createContext<BingoContextType | undefined>(undefined);

// Initialize BroadcastChannel for cross-tab local communication!
const bc = new BroadcastChannel('bingo-kno-sync-channel');

const checkWinningPattern = (
  matrix: (number | null)[][],
  marked: boolean[][],
  drawnNumbers: number[],
  mechanic: 'line' | 'full' | 'cajon' | 'terna'
): boolean => {
  const isNumberValid = (val: number | null) => {
    if (val === null) return true; // Free space is always drawn
    return drawnNumbers.includes(val);
  };

  if (mechanic === 'full') {
    // All 24 cells (excluding center) must be drawn AND marked
    let completed = true;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (r === 2 && c === 2) continue;
        const val = matrix[r][c];
        if (!isNumberValid(val) || !marked[r][c]) {
          completed = false;
          break;
        }
      }
      if (!completed) break;
    }
    return completed;
  }

  if (mechanic === 'cajon') {
    // Outer perimeter (row 0, row 4, col 0, col 4) must be drawn AND marked
    let completed = true;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (r === 0 || r === 4 || c === 0 || c === 4) {
          const val = matrix[r][c];
          if (!isNumberValid(val) || !marked[r][c]) {
            completed = false;
            break;
          }
        }
      }
      if (!completed) break;
    }
    return completed;
  }

  if (mechanic === 'terna') {
    // At least one horizontal row must have at least 3 numbers drawn AND marked
    for (let r = 0; r < 5; r++) {
      let count = 0;
      for (let c = 0; c < 5; c++) {
        const val = matrix[r][c];
        if (isNumberValid(val) && marked[r][c]) {
          count++;
        }
      }
      if (count >= 3) return true;
    }
    return false;
  }

  if (mechanic === 'line') {
    // Horizontal row
    for (let r = 0; r < 5; r++) {
      let completed = true;
      for (let c = 0; c < 5; c++) {
        const val = matrix[r][c];
        if (!isNumberValid(val) || !marked[r][c]) {
          completed = false;
          break;
        }
      }
      if (completed) return true;
    }

    // Vertical column
    for (let c = 0; c < 5; c++) {
      let completed = true;
      for (let r = 0; r < 5; r++) {
        const val = matrix[r][c];
        if (!isNumberValid(val) || !marked[r][c]) {
          completed = false;
          break;
        }
      }
      if (completed) return true;
    }

    // Diagonals
    let diag1 = true;
    let diag2 = true;
    for (let i = 0; i < 5; i++) {
      if (!isNumberValid(matrix[i][i]) || !marked[i][i]) diag1 = false;
      if (!isNumberValid(matrix[i][4 - i]) || !marked[i][4 - i]) diag2 = false;
    }
    return diag1 || diag2;
  }

  return false;
};

// Helper to generate a classic Bingo 75 card
const generateBingoCard = (): BingoCard => {
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

export const BingoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<Role>('select');
  const [gameId, setGameId] = useState<string>('');
  const [gameStatus, setGameStatus] = useState<'idle' | 'active' | 'finished'>('idle');
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [lastDrawn, setLastDrawn] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [playerCards, setPlayerCards] = useState<BingoCard[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<YappyTransaction[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [isStreaming, setIsStreamingState] = useState<boolean>(false);
  
  // Host user authentication state
  const [hostUser, setHostUser] = useState<string | null>(null);

  const [gameConfig, setGameConfigState] = useState<GameConfig>({
    gameName: 'Bingo-KNO',
    cardPrice: 2,
    paymentDetails: 'Yappy Panamá: @bingokno / Banco General',
    winningMechanic: 'full',
    customLogo: null,
    qrCode: null,
    payoutAmount: '$150.00',
    startDate: '',
    startTime: ''
  });
  const [pendingClaims, setPendingClaims] = useState<BingoClaim[]>([]);

  const setIsStreaming = useCallback((streaming: boolean) => {
    setIsStreamingState(streaming);
    bc.postMessage({ type: streaming ? 'stream-start' : 'stream-stop' });
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

  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { drawnNumbersRef.current = drawnNumbers; }, [drawnNumbers]);
  useEffect(() => { lastDrawnRef.current = lastDrawn; }, [lastDrawn]);
  useEffect(() => { gameStatusRef.current = gameStatus; }, [gameStatus]);
  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);
  useEffect(() => { gameConfigRef.current = gameConfig; }, [gameConfig]);
  useEffect(() => { pendingClaimsRef.current = pendingClaims; }, [pendingClaims]);
  useEffect(() => { hostUserRef.current = hostUser; }, [hostUser]);
  useEffect(() => { pendingTransactionsRef.current = pendingTransactions; }, [pendingTransactions]);

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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${gameId}` }, (payload) => {
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
        const { id, playerName, quantity } = payload.payload;
        // Generate local cards for the matching player tab
        if (roleRef.current === 'player' && playerNameRef.current === playerName) {
          const cards: BingoCard[] = [];
          for (let i = 0; i < quantity; i++) {
            cards.push(generateBingoCard());
          }
          setPlayerCards(prevCards => [...prevCards, ...cards]);
        }
      })
      .subscribe();

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
                  for (let i = 0; i < data.quantity; i++) {
                    cards.push(generateBingoCard());
                  }
                  setPlayerCards(prevCards => [...prevCards, ...cards]);
                }
                return { ...tx, status: 'approved' };
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
      if (!username || !pass.trim()) {
        return { success: false, error: 'Por favor completa todos los campos.' };
      }

      // Convert username to a dummy email for Supabase Auth
      const email = `${username}@bingokno.local`;
      
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
        const { error: profileError } = await supabase
          .from('host_profiles')
          .insert({ id: data.user.id, username });
          
        if (profileError) {
           console.error('Error creating profile:', profileError);
        }
      }

      const initialConfig: GameConfig = {
        gameName: 'Mi Gran Bingo',
        cardPrice: 2,
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
      const email = `${username}@bingokno.local`;
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });

      if (error) {
        return { success: false, error: 'Usuario o contraseña incorrectos.' };
      }
      
      setHostUser(username);
      
      // We'll load config when they join/create a room, for now use default
      return { success: true };
    } catch (e) {
      return { success: false, error: 'Error al iniciar sesión.' };
    }
  }, []);

  const hostLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setHostUser(null);
    setRole('select');
    setGameId('');
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
      
      setGameConfigState({
        gameName: data.game_name,
        cardPrice: data.card_price,
        paymentDetails: data.payment_details,
        winningMechanic: data.winning_mechanic as any,
        customLogo: data.custom_logo,
        qrCode: data.qr_code,
        payoutAmount: data.payout_amount,
        startDate: data.start_date,
        startTime: data.start_time
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

  const resetGame = useCallback(() => {
    setDrawnNumbers([]);
    setLastDrawn(null);
    setGameStatus('idle');
    setChatMessages([]);
    bc.postMessage({ type: 'reset-game' });
  }, []);

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
    const amount = quantity * gameConfigRef.current.cardPrice;

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

  const approveTransaction = useCallback(async (id: string) => {
    const tx = pendingTransactionsRef.current.find(t => t.id === id);
    if (!tx || !gameId) return;

    const { error } = await supabase.from('transactions').update({
      status: 'approved'
    }).eq('id', id);

    if (error) {
      console.error('Error approving transaction:', error);
      return;
    }

    // Generate local cards for the player IF the player is on this tab
    // (We also send a Realtime broadcast to trigger it for the actual player tab)
    if (playerNameRef.current === tx.playerName) {
      const cards: BingoCard[] = [];
      for (let i = 0; i < tx.quantity; i++) {
        cards.push(generateBingoCard());
      }
      setPlayerCards(prevCards => [...prevCards, ...cards]);
    }

    supabase.channel(`room-${gameId}`).send({
      type: 'broadcast',
      event: 'approve-tx',
      payload: { id, playerName: tx.playerName, quantity: tx.quantity }
    });

    // Send confirmation message to chat
    setTimeout(async () => {
      await supabase.from('chat_messages').insert({
        id: `sys-app-${id}-${Date.now()}`,
        room_id: gameId,
        sender: 'Yappy Pay',
        text: `✅ Pago Aprobado. ${tx.playerName} recibió ${tx.quantity} cartón(es) digital(es).`,
        is_host: true
      });
    }, 100);

    setPendingTransactions(prev => 
      prev.map(t => t.id === id ? { ...t, status: 'approved' } : t)
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

    // Check cols
    let colsWon = 0;
    for (let c = 0; c < 5; c++) {
      let completed = true;
      for (let r = 0; r < 5; r++) {
        const val = card.matrix[r][c];
        if (!isNumberValid(val) || !card.marked[r][c]) {
          completed = false;
          break;
        }
      }
      if (completed) colsWon++;
    }

    // Check diagonals
    let diag1Won = true;
    let diag2Won = true;
    for (let i = 0; i < 5; i++) {
      if (!isNumberValid(card.matrix[i][i]) || !card.marked[i][i]) diag1Won = false;
      if (!isNumberValid(card.matrix[i][4 - i]) || !card.marked[i][4 - i]) diag2Won = false;
    }

    const hasLine = rowsWon > 0 || colsWon > 0 || diag1Won || diag2Won;
    
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

    let winType: 'Bingo' | 'Línea' | null = null;
    let won = false;

    if (hasBingo) {
      winType = 'Bingo';
      won = true;
    } else if (hasLine) {
      winType = 'Línea';
      won = true;
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
      bc.postMessage({ type: 'update-config', config: updated });
      
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

  const submitClaim = useCallback((cardId: string, pName: string) => {
    const card = playerCards.find(c => c.id === cardId);
    if (!card) return;

    const isValidClaim = checkWinningPattern(card.matrix, card.marked, drawnNumbers, gameConfig.winningMechanic);
    console.log(`[Bingo-KNO] Submitting claim. Pattern matching locally: ${isValidClaim}`);

    const winTypeString = 
      gameConfig.winningMechanic === 'full' ? 'Cartón Lleno' :
      gameConfig.winningMechanic === 'cajon' ? 'Cajón' :
      gameConfig.winningMechanic === 'terna' ? 'Terna' : 'Línea';

    const claim: BingoClaim = {
      id: `claim-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      playerName: pName,
      cardId: card.id,
      matrix: card.matrix,
      marked: card.marked,
      winType: winTypeString,
      status: 'pending'
    };

    // Broadcast claim so the Host tab receives it in real-time
    setPendingClaims(prev => {
      if (prev.some(c => c.id === claim.id)) return prev;
      return [...prev, claim];
    });
    bc.postMessage({ type: 'submit-claim', claim });

    // Speak announcement
    speakText(`¡El jugador ${pName} canta ${winTypeString}!`);

    // Post system message to chat
    const sysMsg: ChatMessage = {
      id: `sys-claim-${claim.id}`,
      sender: 'Salas de Juegos K-NO',
      text: `📢 ${pName} cantó ${winTypeString.toUpperCase()} (Cartón ${cardId.substr(-4)}). Verificación del administrador de sala pendiente.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isHost: false
    };
    setChatMessages(prev => [...prev, sysMsg]);
    bc.postMessage({ type: 'chat-message', message: sysMsg });
  }, [playerCards, gameConfig]);

  const resolveClaim = useCallback((claimId: string, status: 'approved' | 'rejected') => {
    setPendingClaims(prev => 
      prev.map(c => {
        if (c.id === claimId && c.status === 'pending') {
          // Broadcast resolution to all player tabs
          bc.postMessage({ type: 'resolve-claim', claimId, status, cardId: c.cardId, playerName: c.playerName, winType: c.winType });
          
          if (status === 'approved') {
            speakText(`¡Felicidades! ¡El bingo de ${c.playerName} ha sido aprobado!`);
            
            const sysMsg: ChatMessage = {
              id: `sys-claim-app-${claimId}`,
              sender: 'Salas de Juegos K-NO',
              text: `🎉 ¡BINGO APROBADO! La jugada de ${c.playerName} (${c.winType.toUpperCase()}) ha sido verificada y es CORRECTA. ¡Tenemos un ganador! 🏆`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isHost: true
            };
            setChatMessages(prev => [...prev, sysMsg]);
            bc.postMessage({ type: 'chat-message', message: sysMsg });
          } else {
            speakText(`El bingo de ${c.playerName} ha sido rechazado.`);
            
            const sysMsg: ChatMessage = {
              id: `sys-claim-rej-${claimId}`,
              sender: 'Salas de Juegos K-NO',
              text: `❌ BINGO RECHAZADO. La jugada de ${c.playerName} (${c.winType.toUpperCase()}) fue verificada y contiene marcas INCORRECTAS.`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isHost: true
            };
            setChatMessages(prev => [...prev, sysMsg]);
            bc.postMessage({ type: 'chat-message', message: sysMsg });
          }
          return { ...c, status, payoutStatus: status === 'approved' ? 'pending' : undefined, privateChat: [] };
        }
        return c;
      })
    );
  }, []);

  const submitPayoutDetails = useCallback((claimId: string, details: PayoutDetails) => {
    setPendingClaims(prev => 
      prev.map(c => {
        if (c.id === claimId) {
          return { ...c, payoutDetails: details, payoutStatus: 'submitted' };
        }
        return c;
      })
    );
    bc.postMessage({ type: 'submit-payout-details', claimId, details });
  }, []);

  const sendPayoutChatMessage = useCallback((claimId: string, text: string, senderName: string) => {
    if (!text.trim()) return;
    const isUserHost = roleRef.current === 'host';
    const newMsg: PrivateMessage = {
      id: `pmsg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      sender: senderName,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isHost: isUserHost
    };

    setPendingClaims(prev => 
      prev.map(c => {
        if (c.id === claimId) {
          const chat = c.privateChat || [];
          return { ...c, privateChat: [...chat, newMsg] };
        }
        return c;
      })
    );
    bc.postMessage({ type: 'payout-chat-message', claimId, message: newMsg });
  }, []);

  const completePayout = useCallback((claimId: string, receiptBase64?: string) => {
    setPendingClaims(prev => 
      prev.map(c => {
        if (c.id === claimId) {
          return { ...c, payoutStatus: 'completed', payoutReceipt: receiptBase64 };
        }
        return c;
      })
    );
    bc.postMessage({ type: 'complete-payout', claimId, receipt: receiptBase64 });
 
    // Send a system message to the main chat that the payout is completed!
    const claim = pendingClaimsRef.current.find(c => c.id === claimId);
    if (claim) {
      setTimeout(() => {
        const sysMsg: ChatMessage = {
          id: `sys-payout-comp-${claimId}-${Date.now()}`,
          sender: 'Salas de Juegos K-NO',
          text: `💸 PAGO PROCESADO EXITOSAMENTE. El administrador de sala ha completado el pago del premio a ${claim.playerName}. ¡Felicidades! 🏆🎉`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isHost: true
        };
        setChatMessages(prev => [...prev, sysMsg]);
        bc.postMessage({ type: 'chat-message', message: sysMsg });
      }, 200);
    }
  }, []);

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
      playerName,
      setPlayerName,
      
      hostUser,
      hostRegister,
      hostLogin,
      hostLogout,
      
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
