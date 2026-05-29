import React, { useEffect, useState, useRef } from 'react';
import { BingoProvider, useBingo } from './context/BingoContext';
import { HostView } from './components/HostView';
import { PlayerView } from './components/PlayerView';
import { SuperAdminView } from './components/SuperAdminView';
import { 
  Users, Wifi, PlusCircle, Lock, LogIn, KeyRound, ArrowLeft, Menu, LogOut, ChevronDown
} from 'lucide-react';
import appLogo from './logo.png';

const BingoAppContent: React.FC = () => {
  const {
    role,
    setRole,
    gameId,
    createGame,
    joinGame,
    gameConfig,
    hostUser,
    hostRegister,
    hostLogin,
    hostLogout,
    superAdminLogin,
    superAdminRegister,
    leaveGame
  } = useBingo();

  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  const [hostAuthMode, setHostAuthMode] = useState<'none' | 'login' | 'register'>('none');
  const [superAdminAuthMode, setSuperAdminAuthMode] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Easter egg for Super Admin Login
  const [, setLogoClicks] = useState(0);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Prevent the URL ?room= auto-join from running more than once
  const hasJoinedFromURLRef = useRef(false);

  const handleLogoClick = () => {
    setLogoClicks(prev => {
      const newClicks = prev + 1;
      if (newClicks >= 5) {
        setRole('superadmin-login');
        return 0;
      }
      return newClicks;
    });

    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    clickTimeoutRef.current = setTimeout(() => setLogoClicks(0), 1000);
  };

  // Handle URL Room parameters for auto-join link generation!
  // Only fires ONCE on mount — prevents host from being switched to player on re-renders
  useEffect(() => {
    if (hasJoinedFromURLRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    // Never auto-join if already logged in as host or super admin
    const currentRole = sessionStorage.getItem('bingo_role') || 'select';
    if (roomParam && currentRole !== 'host' && currentRole !== 'superadmin') {
      hasJoinedFromURLRef.current = true;
      joinGame(roomParam).then(success => {
        if (success) {
          setRole('player');
        }
      });
    } else if (roomParam && (currentRole === 'host' || currentRole === 'superadmin')) {
      // Mark as handled so we don't keep trying
      hasJoinedFromURLRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleHostClick = async () => {
    if (hostUser) {
      await createGame();
      setRole('host');
      setHostAuthMode('none');
    } else {
      setHostAuthMode('login');
      setAuthError('');
      setAuthUsername('');
      setAuthPassword('');
    }
  };

  return (
    <div className="app-container">
      {/* Header bar — hidden on landing, visible inside rooms */}
      <header className="header" style={{ height: '70px', display: role === 'select' ? 'none' : undefined }}>
        <div className="logo-container">
          {role === 'select' ? null : gameConfig.customLogo ? (
            <>
              <img src={gameConfig.customLogo} alt="Logo" className="brand-logo-visible" />
              <span className="logo-text" style={{ fontSize: '1.6rem', letterSpacing: '0.5px' }}>
                {gameConfig.gameName}
              </span>
            </>
          ) : (
            <>
              <div className="logo-icon" style={{
                width: gameConfig.gameName !== 'Mi Gran Bingo' && gameConfig.gameName !== 'Bingo-KNO' ? '48px' : '40px',
                height: gameConfig.gameName !== 'Mi Gran Bingo' && gameConfig.gameName !== 'Bingo-KNO' ? '48px' : '40px',
                fontSize: gameConfig.gameName !== 'Mi Gran Bingo' && gameConfig.gameName !== 'Bingo-KNO' ? '1.2rem' : '1.5rem',
                borderRadius: gameConfig.gameName !== 'Mi Gran Bingo' && gameConfig.gameName !== 'Bingo-KNO' ? '50%' : 'var(--radius-md)'
              }}>
                {gameConfig.gameName !== 'Mi Gran Bingo' && gameConfig.gameName !== 'Bingo-KNO' 
                  ? gameConfig.gameName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() 
                  : 'BK'}
              </div>
              <span className="logo-text" style={{ 
                fontSize: gameConfig.gameName !== 'Mi Gran Bingo' && gameConfig.gameName !== 'Bingo-KNO' ? '1.6rem' : '1.5rem',
                letterSpacing: '0.5px'
              }}>
                {gameConfig.gameName}
              </span>
            </>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          {(hostUser || gameId) && (
            <button 
              onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '0.4rem 0.8rem',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.8rem'
              }}
            >
              <Menu size={16} /> Opciones <ChevronDown size={14} />
            </button>
          )}

          {headerMenuOpen && (hostUser || gameId) && (
            <div style={{
              position: 'absolute',
              top: '120%',
              right: 0,
              background: 'rgba(20, 10, 10, 0.98)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              minWidth: '220px',
              zIndex: 99999,
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(10px)'
            }}>
              {/* Role Indicator */}
              {gameId && (
                <div style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Wifi size={12} style={{ color: '#10b981' }} /> <strong>{gameId}</strong>
                  </span>
                  <span style={{ fontSize: '0.65rem', background: role === 'host' ? 'rgba(139,92,246,0.15)' : 'rgba(245,158,11,0.15)', color: role === 'host' ? 'var(--accent-violet)' : 'var(--accent-gold)', padding: '0.2rem 0.4rem', borderRadius: '4px', border: role === 'host' ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(245,158,11,0.3)', fontWeight: 'bold', display: 'inline-block', width: 'fit-content' }}>
                    {role === 'host' ? 'Admin' : 'Jugador'}
                  </span>
                </div>
              )}

              {/* Host Username */}
              {hostUser && (
                <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  Sesión: <strong style={{ color: 'white' }}>{hostUser}</strong>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.3rem' }}>
                {gameId && (
                  <button 
                    onClick={() => { leaveGame(); setHeaderMenuOpen(false); }}
                    style={{ background: 'transparent', border: 'none', color: '#c084fc', padding: '0.5rem', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(192, 132, 252, 0.1)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <ArrowLeft size={14} /> Salir de la Sala
                  </button>
                )}

                {hostUser && (
                  <button 
                    onClick={() => { hostLogout(); setHeaderMenuOpen(false); }}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', padding: '0.5rem', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <LogOut size={14} /> Cerrar Sesión
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </header>      {/* Main Content Render */}
      {role === 'select' && hostAuthMode === 'none' && (
        <main style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1rem',
          position: 'relative',
          overflow: 'hidden'
        }}>

          {/* Animated background orbs */}
          <div style={{
            position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0
          }}>
            <div style={{
              position: 'absolute', top: '10%', left: '10%', width: '300px', height: '300px',
              borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
              animation: 'floatBall 8s ease-in-out infinite'
            }} />
            <div style={{
              position: 'absolute', bottom: '15%', right: '10%', width: '250px', height: '250px',
              borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 70%)',
              animation: 'floatBall 10s ease-in-out infinite reverse'
            }} />
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '500px', height: '500px',
              borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)',
              animation: 'floatBall 12s ease-in-out infinite'
            }} />
          </div>

          {/* Hero: Logo + Name floating center */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
            marginBottom: '2.5rem', zIndex: 1,
            animation: 'ballPopBig 0.8s cubic-bezier(0.175,0.885,0.32,1.275)'
          }}>
            <div style={{
              position: 'relative',
              filter: 'drop-shadow(0 0 30px rgba(139,92,246,0.5)) drop-shadow(0 0 60px rgba(245,158,11,0.2))',
              animation: 'floatBall 4s ease-in-out infinite'
            }}>
              <img
                src={appLogo}
                alt="Salas de Juegos K-NO"
                onClick={handleLogoClick}
                style={{
                  width: '110px', height: '110px',
                  borderRadius: '24px',
                  border: '2px solid rgba(139,92,246,0.5)',
                  boxShadow: '0 0 0 6px rgba(139,92,246,0.1), 0 20px 60px rgba(0,0,0,0.5)',
                  cursor: 'pointer'
                }}
              />
              <div style={{
                position: 'absolute', top: '-6px', right: '-6px',
                width: '22px', height: '22px', borderRadius: '50%',
                background: 'var(--success)', border: '2px solid var(--bg-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.55rem', fontWeight: 'bold', color: 'white'
              }}>
                ●
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <h1 style={{
                fontSize: 'clamp(2rem, 5vw, 3.2rem)',
                fontWeight: '900',
                margin: 0,
                background: 'linear-gradient(135deg, #fff 0%, #c084fc 40%, #f59e0b 80%, #fff 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: '-0.5px',
                lineHeight: 1.1,
                textShadow: 'none'
              }}>
                Salas de Juegos K-NO
              </h1>
              <p style={{
                margin: '0.5rem 0 0 0',
                fontSize: 'clamp(0.8rem, 2vw, 1rem)',
                color: 'var(--text-secondary)',
                letterSpacing: '0.05em',
                fontStyle: 'italic'
              }}>
                🎱 Juega · Conecta · Gana
              </p>
            </div>
          </div>

          {/* Feature badges */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '0.6rem', justifyContent: 'center',
            marginBottom: '2.5rem', zIndex: 1, maxWidth: '560px'
          }}>
            {[
              { icon: '🎮', label: 'Salas en Vivo' },
              { icon: '📱', label: 'Pagos con Yappy' },
              { icon: '🏆', label: 'Premios Instantáneos' },
              { icon: '🎨', label: 'Marca Personalizada' },
              { icon: '🔒', label: '100% Verificado' },
            ].map(({ icon, label }) => (
              <span key={label} style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '999px',
                padding: '0.3rem 0.85rem',
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                fontWeight: '500',
                backdropFilter: 'blur(8px)',
                transition: 'all 0.2s ease'
              }}>
                <span>{icon}</span> {label}
              </span>
            ))}
          </div>

          {/* Admin login/register card */}
          <div style={{
            zIndex: 1, width: '100%', maxWidth: '400px',
            background: 'rgba(15, 18, 30, 0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(139,92,246,0.35)',
            borderRadius: '16px',
            padding: '2rem',
            boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.08) inset',
            display: 'flex', flexDirection: 'column', gap: '1.5rem',
            animation: 'fadeInOverlay 0.6s ease 0.3s both'
          }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{
                margin: 0, fontSize: '1.15rem', fontWeight: 'bold', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
              }}>
                <KeyRound size={18} style={{ color: '#c084fc' }} />
                Portal de Administradores
              </h2>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Accede o crea tu cuenta para gestionar tus salas de juego
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="btn-primary"
                onClick={handleHostClick}
                style={{ flex: 1, padding: '0.65rem', fontSize: '0.85rem', fontWeight: 'bold', justifyContent: 'center', gap: '0.4rem' }}
              >
                <LogIn size={16} />
                {hostUser ? 'Ir al Dashboard' : 'Iniciar Sesión'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => { setHostAuthMode('register'); setAuthError(''); setAuthUsername(''); setAuthPassword(''); }}
                style={{ flex: 1, padding: '0.65rem', fontSize: '0.85rem', fontWeight: 'bold', justifyContent: 'center', gap: '0.4rem' }}
              >
                <PlusCircle size={16} />
                Registrarse
              </button>
            </div>

            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: '1rem',
              display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
              background: 'rgba(139,92,246,0.05)', borderRadius: '8px',
              padding: '0.75rem', border: '1px solid rgba(139,92,246,0.1)'
            }}>
              <Users size={14} style={{ color: '#c084fc', flexShrink: 0, marginTop: '2px' }} />
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <strong style={{ color: '#c084fc' }}>¿Eres jugador?</strong> Los jugadores solo pueden ingresar a través del enlace de invitación que te comparte tu administrador de sala.
              </p>
            </div>
          </div>
        </main>
      )}

      {/* Super Admin Secret Login View */}
      {role === 'superadmin-login' && (
        <main className="role-selection-wrapper" style={{ maxWidth: '400px', margin: '3rem auto' }}>
          <div className="panel-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', backdropFilter: 'blur(16px)', background: 'rgba(20, 10, 10, 0.95)', border: '1px solid rgba(239, 68, 68, 0.5)', boxShadow: '0 10px 40px rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem' }} onClick={() => setRole('select')}>
              <ArrowLeft size={16} /> Volver al Inicio
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444', margin: 0 }}>Modo Dios</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem', margin: 0 }}>Global Super Admin Portal</p>
            </div>

            {authError && <div style={{ color: '#ef4444', fontSize: '0.8rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.5rem', borderRadius: '4px', textAlign: 'center' }}>{authError}</div>}

            <form onSubmit={async (e) => {
              e.preventDefault();
              let res;
              if (superAdminAuthMode === 'register') {
                res = await superAdminRegister(authUsername, authPassword);
              } else {
                res = await superAdminLogin(authUsername, authPassword);
              }
              if (res.success) {
                // Role is set to 'superadmin' inside context
              } else {
                setAuthError(res.error || '');
              }
            }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Usuario Administrador</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={14} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
                  <input type="text" value={authUsername} onChange={e => setAuthUsername(e.target.value)} required placeholder="Usuario Dios" style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem', padding: '0.6rem 0.6rem 0.6rem 2.2rem', color: 'white', outline: 'none' }} />
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Llave de Seguridad</label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={14} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
                  <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required placeholder="••••••••" style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem', padding: '0.6rem 0.6rem 0.6rem 2.2rem', color: 'white', outline: 'none' }} />
                </div>
              </div>

              <button className="btn-primary" type="submit" style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', fontWeight: 'bold', justifyContent: 'center', marginTop: '0.5rem', background: '#ef4444', borderColor: '#b91c1c' }}>
                {superAdminAuthMode === 'register' ? <><PlusCircle size={16} /> Registrar Super Admin</> : <><LogIn size={16} /> Autenticar</>}
              </button>
            </form>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.5rem' }}>
              {superAdminAuthMode === 'login' ? (
                <>¿No hay cuentas? <span onClick={() => { setSuperAdminAuthMode('register'); setAuthError(''); }} style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}>Regístrate como Dios</span></>
              ) : (
                <>¿Ya eres Dios? <span onClick={() => { setSuperAdminAuthMode('login'); setAuthError(''); }} style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}>Inicia Sesión</span></>
              )}
            </div>
          </div>
        </main>
      )}

      {/* Host Auth Forms */}
      {role === 'select' && hostAuthMode === 'login' && (
        <main className="role-selection-wrapper" style={{ maxWidth: '400px', margin: '3rem auto' }}>
          <div className="panel-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', backdropFilter: 'blur(16px)', background: 'rgba(18,20,32,0.85)', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem' }} onClick={() => setHostAuthMode('none')}>
              <ArrowLeft size={16} /> Volver
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', margin: 0 }}>Iniciar Sesión</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem', margin: 0 }}>Accede a tu cuenta de administrador de sala guardada</p>
            </div>

            {authError && <div style={{ color: '#ef4444', fontSize: '0.8rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.5rem', borderRadius: '4px', textAlign: 'center' }}>{authError}</div>}

            <form onSubmit={async (e) => {
              e.preventDefault();
              const res = await hostLogin(authUsername, authPassword);
              if (res.success) {
                await createGame();
                setRole('host');
                setHostAuthMode('none');
              } else {
                setAuthError(res.error || '');
              }
            }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Usuario</label>
                <div style={{ position: 'relative' }}>
                  <Users size={14} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
                  <input type="text" value={authUsername} onChange={e => setAuthUsername(e.target.value)} required placeholder="Escribe tu usuario" style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem', padding: '0.6rem 0.6rem 0.6rem 2.2rem', color: 'white', outline: 'none' }} />
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Contraseña</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={14} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
                  <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required placeholder="••••••••" style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem', padding: '0.6rem 0.6rem 0.6rem 2.2rem', color: 'white', outline: 'none' }} />
                </div>
              </div>

              <button className="btn-primary" type="submit" style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', fontWeight: 'bold', justifyContent: 'center', marginTop: '0.5rem' }}>
                <LogIn size={16} style={{ marginRight: '0.3rem' }} /> Entrar al Dashboard
              </button>
            </form>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.5rem' }}>
              ¿No tienes cuenta? <span onClick={() => { setHostAuthMode('register'); setAuthError(''); }} style={{ color: '#c084fc', cursor: 'pointer', fontWeight: 'bold' }}>Regístrate aquí</span>
            </div>
          </div>
        </main>
      )}

      {role === 'select' && hostAuthMode === 'register' && (
        <main className="role-selection-wrapper" style={{ maxWidth: '400px', margin: '3rem auto' }}>
          <div className="panel-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', backdropFilter: 'blur(16px)', background: 'rgba(18,20,32,0.85)', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem' }} onClick={() => setHostAuthMode('none')}>
              <ArrowLeft size={16} /> Volver
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', margin: 0 }}>Crear Cuenta de Administrador de Sala</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem', margin: 0 }}>Guarda tus configuraciones, marcas y códigos QR</p>
            </div>

            {authError && <div style={{ color: '#ef4444', fontSize: '0.8rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.5rem', borderRadius: '4px', textAlign: 'center' }}>{authError}</div>}

            <form onSubmit={async (e) => {
              e.preventDefault();
              const res = await hostRegister(authUsername, authPassword);
              if (res.success) {
                await createGame();
                setRole('host');
                setHostAuthMode('none');
              } else {
                setAuthError(res.error || '');
              }
            }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Usuario</label>
                <div style={{ position: 'relative' }}>
                  <Users size={14} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
                  <input type="text" value={authUsername} onChange={e => setAuthUsername(e.target.value)} required placeholder="Crea tu usuario" style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem', padding: '0.6rem 0.6rem 0.6rem 2.2rem', color: 'white', outline: 'none' }} />
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Contraseña</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={14} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
                  <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required placeholder="Crea tu contraseña" style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem', padding: '0.6rem 0.6rem 0.6rem 2.2rem', color: 'white', outline: 'none' }} />
                </div>
              </div>

              <button className="btn-primary" type="submit" style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', fontWeight: 'bold', justifyContent: 'center', marginTop: '0.5rem', background: 'linear-gradient(135deg, var(--accent-violet) 0%, var(--accent-fuchsia) 100%)' }}>
                <KeyRound size={16} style={{ marginRight: '0.3rem' }} /> Registrarse y Iniciar
              </button>
            </form>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.5rem' }}>
              ¿Ya tienes una cuenta? <span onClick={() => { setHostAuthMode('login'); setAuthError(''); }} style={{ color: '#c084fc', cursor: 'pointer', fontWeight: 'bold' }}>Inicia sesión aquí</span>
            </div>
          </div>
        </main>
      )}

      {role === 'host' && <HostView />}
      {role === 'player' && <PlayerView />}
      {role === 'superadmin' && <SuperAdminView />}
    </div>
  );
};

function App() {
  return (
    <BingoProvider>
      <BingoAppContent />
    </BingoProvider>
  );
}

export default App;
