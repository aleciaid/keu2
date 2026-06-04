import { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { Plus, User, Sparkles, Zap } from 'lucide-react';
import { db, seedDatabase, resetDatabase } from './db/database';
import { ThemeProvider } from './context/ThemeContext';
import { runBudgetScheduler } from './utils/budgetScheduler';
import { checkAndApplyUpdate, getCurrentVersion } from './utils/appUpdater';
import BottomNav from './components/BottomNav';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Wallets from './pages/Wallets';
import Settings from './pages/Settings';
import BudgetPlans from './pages/BudgetPlans';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [dbReady, setDbReady] = useState(false);
  const [openTransactionModal, setOpenTransactionModal] = useState(false);
  const [openWalletModal, setOpenWalletModal] = useState(false);
  const [openBudgetModal, setOpenBudgetModal] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupAnimating, setSetupAnimating] = useState(false);
  
  // ── Check for app update on first mount ──────────────────────────────────
  useEffect(() => {
    checkAndApplyUpdate().then(({ updated, from, to }) => {
      if (updated) {
        // Tunda sedikit agar Toaster sudah mount
        setTimeout(() => {
          toast(
            (t) => (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <Zap size={16} style={{ color: '#a78bfa', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontWeight: 600, marginBottom: 2 }}>App diperbarui! 🎉</p>
                  <p style={{ fontSize: 11, color: '#94a3b8' }}>
                    v{from} → v{to} · Cache stale otomatis dibersihkan
                  </p>
                </div>
              </div>
            ),
            {
              duration: 4000,
              icon: null,
            }
          );
        }, 1500);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme setup
  useEffect(() => {
    const root = document.documentElement;
    const savedTheme = localStorage.getItem('theme') || 'dark';
    root.classList.remove('dark', 'light');
    root.classList.add(savedTheme);
  }, []);

  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        // Seed the database
        await seedDatabase();
        
        // Set database as ready
        setDbReady(true);
      } catch (error) {
        console.error('Database initialization failed:', error);
        
        // If initial seeding fails, try clearing and resetting
        try {
          console.log('Attempting database reset...');
          await resetDatabase();
          setDbReady(true);
        } catch (resetError) {
          console.error('Database reset also failed:', resetError);
          
          // Last resort: try one more time with a delay
          setTimeout(async () => {
            try {
              await resetDatabase();
              setDbReady(true);
            } catch (finalError) {
              console.error('Final database initialization attempt failed:', finalError);
              // Show a user-friendly message but still try to load the app
              console.warn('Database initialization failed multiple times. App may be unstable.');
              setDbReady(true);
            }
          }, 1000);
        }
      }
    };

    initializeDatabase();
  }, []);

  // Load user profile after DB is ready
  useEffect(() => {
    if (!dbReady) return;
    const loadProfile = async () => {
      const profile = await db.settings.get('userProfile');
      if (profile?.value) {
        setUserProfile(profile.value);
      }
      setProfileLoaded(true);
    };
    loadProfile();
  }, [dbReady]);

  // Run budget scheduler on startup and every 60 seconds
  useEffect(() => {
    if (!dbReady || !profileLoaded) return;

    // Run once immediately on startup
    runBudgetScheduler().then((results) => {
      if (results.length > 0) {
        console.log(`[BudgetScheduler] Auto-paid ${results.length} budget(s)`);
      }
    });

    // Check periodically (every 60s)
    const interval = setInterval(() => {
      runBudgetScheduler();
    }, 60_000);

    return () => clearInterval(interval);
  }, [dbReady, profileLoaded]);

  const generateUserId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  };

  const handleProfileSetup = async () => {
    if (!setupName.trim()) return;
    setSetupAnimating(true);
    const profile = {
      name: setupName.trim(),
      userId: generateUserId(),
      createdAt: new Date().toISOString(),
    };
    await db.settings.put({ key: 'userProfile', value: profile });
    setTimeout(() => {
      setUserProfile(profile);
      setSetupAnimating(false);
    }, 600);
  };

  const handleNavigate = useCallback((p) => {
    setPage(p);
    setOpenWalletModal(false);
    setOpenTransactionModal(false);
    setOpenBudgetModal(false);
  }, []);

  if (!dbReady || !profileLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-2xl animate-pulse">
            💰
          </div>
          <p className="text-sm text-surface-400">Memuat...</p>
        </div>
      </div>
    );
  }

  // Profile setup screen for first-time users
  if (!userProfile) {
    return (
      <ThemeProvider>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className={`w-full max-w-sm transition-all duration-500 ${setupAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                <Sparkles size={36} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Selamat Datang!</h1>
              <p className="text-sm text-surface-400">Siapkan profil Anda untuk mulai mengelola keuangan</p>
            </div>

            <div className="card">
              <div className="space-y-4">
                <div className="input-group">
                  <label className="input-label">Nama Alias</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                    <input
                      type="text"
                      value={setupName}
                      onChange={(e) => setSetupName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleProfileSetup()}
                      placeholder="Masukkan nama alias Anda"
                      className="w-full pl-10"
                      autoFocus
                      maxLength={30}
                    />
                  </div>
                  <p className="text-[10px] text-surface-500 mt-1">Nama ini akan digunakan untuk sapaan</p>
                </div>

                <button
                  onClick={handleProfileSetup}
                  disabled={!setupName.trim()}
                  className="btn-primary w-full py-3 text-sm font-semibold"
                >
                  Mulai Sekarang
                </button>
              </div>
            </div>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 2500,
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: '12px',
            fontSize: '13px',
            padding: '12px 16px',
          },
        }}
      />

      <main className="min-h-screen">
        {page === 'dashboard' && <Dashboard onNavigate={handleNavigate} userProfile={userProfile} />}
        {page === 'transactions' && <Transactions openModal={openTransactionModal} onModalStateChange={setOpenTransactionModal} />}
        {page === 'wallets' && <Wallets openModal={openWalletModal} onModalStateChange={setOpenWalletModal} />}
        {page === 'budget' && <BudgetPlans openModal={openBudgetModal} onModalStateChange={setOpenBudgetModal} />}
        {page === 'settings' && <Settings />}
      </main>

      {/* FAB - Add Transaction / Wallet / Budget */}
      {(page === 'dashboard' || page === 'transactions' || page === 'wallets' || page === 'budget') && (
        <button
          onClick={() => {
            if (page === 'wallets') {
              setOpenWalletModal(true);
            } else if (page === 'budget') {
              setOpenBudgetModal(true);
            } else if (page !== 'transactions') {
              setPage('transactions');
              setTimeout(() => {
                setOpenTransactionModal(true);
              }, 100);
            } else {
              setOpenTransactionModal(true);
            }
          }}
          className="fab"
          aria-label="Add"
        >
          <Plus size={24} />
        </button>
      )}

      <BottomNav active={page} onNavigate={handleNavigate} />
    </ThemeProvider>
  );
}
