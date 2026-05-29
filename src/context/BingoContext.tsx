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
  createGame: () => string;
  joinGame: (id: string) => boolean;
  leaveGame: () => void;
  drawNumber: (specificNum?: number) => number | null;
  resetGame: () => void;
  regenerateRoom: () => string;
  sendChatMessage: (text: string, senderName?: string) => void;
  buyCards: (quantity: number, playerName: string, paymentReceipt?: string) => string; // Returns transaction ID
  approveTransaction: (id: string) => void;
  rejectTransaction: (id: string, reason: string) => void;
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

  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { drawnNumbersRef.current = drawnNumbers; }, [drawnNumbers]);
  useEffect(() => { lastDrawnRef.current = lastDrawn; }, [lastDrawn]);
  useEffect(() => { gameStatusRef.current = gameStatus; }, [gameStatus]);
  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);
  useEffect(() => { gameConfigRef.current = gameConfig; }, [gameConfig]);
  useEffect(() => { pendingClaimsRef.current = pendingClaims; }, [pendingClaims]);
  useEffect(() => { hostUserRef.current = hostUser; }, [hostUser]);

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
  const hostRegister = useCallback((user: string, pass: string) => {
    try {
      const username = user.trim().toLowerCase();
      if (!username || !pass.trim()) {
        return { success: false, error: 'Por favor completa todos los campos.' };
      }
      const hosts = JSON.parse(localStorage.getItem('bingo_kno_hosts') || '{}');
      if (hosts[username]) {
        return { success: false, error: 'El nombre de usuario ya existe.' };
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
      hosts[username] = { password: pass, config: initialConfig };
      localStorage.setItem('bingo_kno_hosts', JSON.stringify(hosts));
      setHostUser(username);
      setGameConfigState(initialConfig);
      return { success: true };
    } catch (e) {
      return { success: false, error: 'Error inesperado al registrar el usuario.' };
    }
  }, []);

  const hostLogin = useCallback((user: string, pass: string) => {
    try {
      const username = user.trim().toLowerCase();
      const hosts = JSON.parse(localStorage.getItem('bingo_kno_hosts') || '{}');
      if (!hosts[username] || hosts[username].password !== pass) {
        return { success: false, error: 'Usuario o contraseña incorrectos.' };
      }
      setHostUser(username);
      if (hosts[username].config) {
        setGameConfigState(hosts[username].config);
        bc.postMessage({ type: 'update-config', config: hosts[username].config });
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: 'Error al iniciar sesión.' };
    }
  }, []);

  const hostLogout = useCallback(() => {
    setHostUser(null);
    setRole('select');
    setGameId('');
  }, []);

  const createGame = useCallback(() => {
    const newId = `BINGO-${Math.floor(1000 + Math.random() * 9000)}`;
    setGameId(newId);
    setGameStatus('idle');
    setDrawnNumbers([]);
    setLastDrawn(null);
    setPendingTransactions([]);
    setPendingClaims([]);
    setIsStreaming(false);
    return newId;
  }, []);

  const regenerateRoom = useCallback(() => {
    const newId = `BINGO-${Math.floor(1000 + Math.random() * 9000)}`;
    setGameId(newId);
    setDrawnNumbers([]);
    setLastDrawn(null);
    setGameStatus('idle');
    setPendingClaims([]);
    setPendingTransactions([]);
    bc.postMessage({ type: 'reset-game' });
    
    // Broadcast config so new players catch the customized room state
    bc.postMessage({ type: 'update-config', config: gameConfigRef.current });
    return newId;
  }, []);

  const joinGame = useCallback((id: string) => {
    if (id.trim().toUpperCase().startsWith('BINGO-')) {
      setGameId(id.trim().toUpperCase());
      setGameStatus('active');
      setPlayerCards([]);
      // Request state catch-up immediately after joining
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

  const drawNumber = useCallback((specificNum?: number) => {
    if (drawnNumbers.length >= 75) {
      setGameStatus('finished');
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
    setDrawnNumbers(updatedNumbers);
    setLastDrawn(num);
    setGameStatus('active');

    // Announce vocals locally
    announceNumber(num);

    // Sync to all other open tabs!
    bc.postMessage({ type: 'draw-number', number: num });

    return num;
  }, [drawnNumbers, announceNumber]);

  const resetGame = useCallback(() => {
    setDrawnNumbers([]);
    setLastDrawn(null);
    setGameStatus('idle');
    setChatMessages([]);
    bc.postMessage({ type: 'reset-game' });
  }, []);

  const sendChatMessage = useCallback((text: string, senderName?: string) => {
    if (!text.trim()) return;

    const isUserHost = role === 'host';
    const sender = senderName || (isUserHost ? 'Organizador' : 'Jugador');

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      sender,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isHost: isUserHost
    };

    setChatMessages(prev => [...prev, newMsg]);
    bc.postMessage({ type: 'chat-message', message: newMsg });

    if (isUserHost && text.toLowerCase().includes('inici')) {
      setTimeout(() => {
        const reply = {
          id: `msg-sim-${Date.now()}`,
          sender: 'Carlos Perez',
          text: '¡Excelente! Ya tengo mis cartones listos.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isHost: false
        };
        setChatMessages(prev => [...prev, reply]);
        bc.postMessage({ type: 'chat-message', message: reply });
      }, 1000);
    }
  }, [role]);

  const approveTransaction = useCallback((id: string) => {
    setPendingTransactions(prev => 
      prev.map(tx => {
        if (tx.id === id && tx.status === 'pending') {
          // If the host is approving this, generate local cards if host name matches player name (same tab simulation)
          if (playerNameRef.current === tx.playerName) {
            const cards: BingoCard[] = [];
            for (let i = 0; i < tx.quantity; i++) {
              cards.push(generateBingoCard());
            }
            setPlayerCards(prevCards => [...prevCards, ...cards]);
          }

          // Broadcast approval to all tabs so matching player generates cards!
          bc.postMessage({ type: 'approve-tx', id, playerName: tx.playerName, quantity: tx.quantity });

          // Send confirmation message to chat
          setTimeout(() => {
            const sysMsg: ChatMessage = {
              id: `sys-app-${id}`,
              sender: 'Yappy Pay',
              text: `✅ Pago Aprobado. ${tx.playerName} recibió ${tx.quantity} cartón(es) digital(es).`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isHost: false
            };
            setChatMessages(c => [...c, sysMsg]);
            bc.postMessage({ type: 'chat-message', message: sysMsg });
          }, 100);
 
          return { ...tx, status: 'approved' };
        }
        return tx;
      })
    );
  }, []);

  const rejectTransaction = useCallback((id: string, reason: string) => {
    setPendingTransactions(prev => 
      prev.map(tx => {
        if (tx.id === id && tx.status === 'pending') {
          // Broadcast rejection
          bc.postMessage({ type: 'reject-tx', id, playerName: tx.playerName, reason });
          
          // Chat message announcement
          setTimeout(() => {
            const sysMsg: ChatMessage = {
              id: `sys-rej-${id}`,
              sender: 'Yappy Pay',
              text: `❌ Pago de Yappy Rechazado para ${tx.playerName}. Motivo: ${reason}`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isHost: true
            };
            setChatMessages(c => [...c, sysMsg]);
            bc.postMessage({ type: 'chat-message', message: sysMsg });
          }, 100);

          return { ...tx, status: 'rejected', rejectionReason: reason };
        }
        return tx;
      })
    );
  }, []);

  // Payment integration with Yappy QR
  const buyCards = useCallback((quantity: number, pName: string, paymentReceipt?: string) => {
    const txId = `YAP-${Math.floor(100000 + Math.random() * 900000)}`;
    const amount = quantity * gameConfigRef.current.cardPrice; // Dynamic price!

    const newTx: YappyTransaction = {
      id: txId,
      playerName: pName,
      quantity,
      amount,
      status: 'pending',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      paymentReceipt
    };

    setPendingTransactions(prev => [...prev, newTx]);
    bc.postMessage({ type: 'buy-cards', transaction: newTx });

    // Send a system message to chat
    const sysMsg: ChatMessage = {
      id: `sys-tx-${txId}`,
      sender: 'Yappy Pay',
      text: `💸 ${pName} solicitó ${quantity} cartón(es) ($${amount.toFixed(2)}). Comprobante de pago adjunto.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isHost: false
    };
    setChatMessages(prev => [...prev, sysMsg]);
    bc.postMessage({ type: 'chat-message', message: sysMsg });

    return txId;
  }, []);

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
