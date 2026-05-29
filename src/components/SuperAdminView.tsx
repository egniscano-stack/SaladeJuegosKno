import React, { useEffect, useState } from 'react';
import { useBingo } from '../context/BingoContext';
import { supabase } from '../lib/supabaseClient';
import { LogOut, Users, Settings, Activity, CheckCircle, XCircle, Trash2, Gift, CreditCard } from 'lucide-react';

interface HostProfile {
  id: string;
  username: string;
  status: 'demo' | 'active' | 'suspended' | 'pending_payment' | 'requesting_access' | 'requesting_demo';
  subscription_end_date: string;
  total_usage_seconds: number;
  created_at: string;
}

interface PaymentRequest {
  id: string;
  host_id: string;
  username: string;
  amount: number;
  receipt_image: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export const SuperAdminView: React.FC = () => {
  const { superAdminUser, superAdminLogout } = useBingo();
  const [activeTab, setActiveTab] = useState<'users' | 'payments' | 'settings'>('users');
  
  const [profiles, setProfiles] = useState<HostProfile[]>([]);
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [globalPrice, setGlobalPrice] = useState('80.00');
  const [globalQrCode, setGlobalQrCode] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    // Load Host Profiles
    const { data: hosts } = await supabase.from('host_profiles').select('*').order('created_at', { ascending: false });
    if (hosts) setProfiles(hosts);

    // Load Payments (Joining with host username manually if needed)
    const { data: pays } = await supabase.from('host_payments').select('*, host_profiles(username)').order('created_at', { ascending: false });
    if (pays) {
      setPayments(pays.map((p: any) => ({
        ...p,
        username: p.host_profiles?.username || 'Desconocido'
      })));
    }

    // Load Settings
    const { data: settings } = await supabase.from('platform_settings').select('*').eq('id', 'global').single();
    if (settings) {
      setGlobalPrice(settings.subscription_price);
      setGlobalQrCode(settings.subscription_qr_code);
    } else {
      // Create if missing
      await supabase.from('platform_settings').insert({ id: 'global' });
    }

    setLoading(false);
  };

  const updateHostStatus = async (hostId: string, status: string) => {
    await supabase.from('host_profiles').update({ status }).eq('id', hostId);
    loadData();
  };

  const grantDemo = async (hostId: string) => {
    const daysStr = prompt('¿Cuántos días de Demo deseas otorgar?', '3');
    if (!daysStr) return;
    const days = parseInt(daysStr, 10);
    if (isNaN(days) || days <= 0) {
      alert('Número de días inválido');
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + days);
    await supabase.from('host_profiles').update({ 
      status: 'demo', 
      subscription_end_date: d.toISOString() 
    }).eq('id', hostId);
    loadData();
  };

  const deleteHost = async (hostId: string) => {
    if (confirm('¿Estás seguro de eliminar este administrador permanentemente?')) {
      // NOTE: Because of cascade delete, we delete from auth.users (requires service role normally, but for MVP we might just delete from profiles)
      // We will just suspend them to be safe if auth deletion isn't permitted by RLS
      await supabase.from('host_profiles').update({ status: 'suspended' }).eq('id', hostId);
      loadData();
    }
  };

  const approvePayment = async (paymentId: string, hostId: string) => {
    await supabase.from('host_payments').update({ status: 'approved' }).eq('id', paymentId);
    
    // Add 30 days to subscription
    const d = new Date();
    d.setDate(d.getDate() + 30);
    await supabase.from('host_profiles').update({ 
      status: 'active', 
      subscription_end_date: d.toISOString() 
    }).eq('id', hostId);
    
    loadData();
  };

  const updateSettings = async () => {
    await supabase.from('platform_settings').update({
      subscription_price: parseFloat(globalPrice),
      subscription_qr_code: globalQrCode
    }).eq('id', 'global');
    alert('Configuración guardada');
  };

  const handleQRUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 240; canvas.height = 240;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'white'; ctx.fillRect(0,0,240,240);
          ctx.drawImage(img, 0, 0, 240, 240);
          setGlobalQrCode(canvas.toDataURL('image/jpeg', 0.8));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const formatUsage = (seconds: number) => {
    if (!seconds) return '0h 0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'white' }}>
      {/* Header */}
      <header style={{ padding: '1rem 2rem', background: 'rgba(20,10,10,0.9)', borderBottom: '1px solid #ef4444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 10px #ef4444' }}></div>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold', color: '#ef4444' }}>MODO DIOS: {superAdminUser}</h1>
        </div>
        <button onClick={superAdminLogout} className="btn-secondary" style={{ padding: '0.4rem 1rem', borderColor: '#ef4444', color: '#ef4444' }}>
          <LogOut size={16} /> Salir
        </button>
      </header>

      {/* Tabs */}
      <div style={{ padding: '1rem 2rem', display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <button onClick={() => setActiveTab('users')} style={{ padding: '0.5rem 1rem', background: activeTab === 'users' ? '#ef4444' : 'transparent', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Users size={16} /> Administradores
        </button>
        <button onClick={() => setActiveTab('payments')} style={{ padding: '0.5rem 1rem', background: activeTab === 'payments' ? '#ef4444' : 'transparent', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <CreditCard size={16} /> Solicitudes de Pago
        </button>
        <button onClick={() => setActiveTab('settings')} style={{ padding: '0.5rem 1rem', background: activeTab === 'settings' ? '#ef4444' : 'transparent', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Settings size={16} /> Configuración Global
        </button>
      </div>

      {/* Content */}
      <main style={{ padding: '2rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Cargando datos...</div>
        ) : (
          <>
            {/* USERS TAB */}
            {activeTab === 'users' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h2 style={{ fontSize: '1.2rem', margin: '0 0 1rem 0' }}>Cuentas de Administradores de Sala</h2>
                <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                        <th style={{ padding: '1rem' }}>Usuario</th>
                        <th style={{ padding: '1rem' }}>Estado</th>
                        <th style={{ padding: '1rem' }}>Expira</th>
                        <th style={{ padding: '1rem' }}>Tiempo de Uso</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profiles.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '1rem', fontWeight: 'bold' }}>@{p.username}</td>
                          <td style={{ padding: '1rem' }}>
                            <span style={{ 
                              padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
                              background: p.status === 'active' ? 'rgba(34,197,94,0.2)' : p.status === 'suspended' ? 'rgba(239,68,68,0.2)' : p.status === 'demo' ? 'rgba(59,130,246,0.2)' : p.status === 'requesting_demo' ? 'rgba(168,85,247,0.2)' : 'rgba(245,158,11,0.2)',
                              color: p.status === 'active' ? '#22c55e' : p.status === 'suspended' ? '#ef4444' : p.status === 'demo' ? '#3b82f6' : p.status === 'requesting_demo' ? '#a855f7' : '#f59e0b'
                            }}>
                              {p.status.toUpperCase().replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                            {p.subscription_end_date ? new Date(p.subscription_end_date).toLocaleDateString() : 'Sin fecha'}
                          </td>
                          <td style={{ padding: '1rem' }}>{formatUsage(p.total_usage_seconds)}</td>
                          <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            {p.status !== 'active' && (
                              <button onClick={() => updateHostStatus(p.id, 'active')} title="Activar forzosamente" style={{ background: '#22c55e', color: 'white', border: 'none', padding: '0.4rem', borderRadius: '4px', cursor: 'pointer' }}><CheckCircle size={14} /></button>
                            )}
                            {p.status !== 'suspended' && (
                              <button onClick={() => updateHostStatus(p.id, 'suspended')} title="Suspender" style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.4rem', borderRadius: '4px', cursor: 'pointer' }}><XCircle size={14} /></button>
                            )}
                            <button onClick={() => grantDemo(p.id)} title="Dar Demo" style={{ background: p.status === 'requesting_demo' ? '#a855f7' : '#3b82f6', color: 'white', border: 'none', padding: '0.4rem', borderRadius: '4px', cursor: 'pointer' }}><Gift size={14} /></button>
                            <button onClick={() => deleteHost(p.id)} title="Eliminar (Suspender)" style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '0.4rem', borderRadius: '4px', cursor: 'pointer' }}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PAYMENTS TAB */}
            {activeTab === 'payments' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h2 style={{ fontSize: '1.2rem', margin: '0 0 1rem 0' }}>Solicitudes de Pago de Mensualidad ($80)</h2>
                {payments.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No hay solicitudes de pago registradas.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                    {payments.map(pay => (
                      <div key={pay.id} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>@{pay.username}</h3>
                            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Monto reportado: ${pay.amount}</p>
                            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(pay.created_at).toLocaleString()}</p>
                          </div>
                          <span style={{ 
                            padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
                            background: pay.status === 'approved' ? 'rgba(34,197,94,0.2)' : pay.status === 'rejected' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                            color: pay.status === 'approved' ? '#22c55e' : pay.status === 'rejected' ? '#ef4444' : '#f59e0b'
                          }}>
                            {pay.status.toUpperCase()}
                          </span>
                        </div>
                        {pay.receipt_image && (
                          <img src={pay.receipt_image} alt="Comprobante" style={{ width: '100%', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }} />
                        )}
                        {pay.status === 'pending' && (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => approvePayment(pay.id, pay.host_id)} style={{ flex: 1, padding: '0.5rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Aprobar (Dar 30 días)</button>
                            <button onClick={async () => {
                              await supabase.from('host_payments').update({ status: 'rejected' }).eq('id', pay.id);
                              loadData();
                            }} style={{ flex: 1, padding: '0.5rem', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Rechazar</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '500px' }}>
                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Configuración de la Plataforma SaaS</h2>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Precio Mensual de la Suscripción ($)</label>
                  <input type="number" value={globalPrice} onChange={e => setGlobalPrice(e.target.value)} style={{ padding: '0.6rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Código QR de Yappy (Para recibir pagos de Administradores)</label>
                  {globalQrCode && (
                    <img src={globalQrCode} alt="Global QR" style={{ width: '150px', height: '150px', borderRadius: '8px', border: '2px solid rgba(255,255,255,0.1)' }} />
                  )}
                  <input type="file" accept="image/*" onChange={handleQRUpload} style={{ fontSize: '0.8rem' }} />
                </div>

                <button onClick={updateSettings} className="btn-primary" style={{ padding: '0.8rem', background: '#ef4444', borderColor: '#b91c1c', marginTop: '1rem', fontWeight: 'bold' }}>
                  Guardar Configuración Global
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
