import { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { Plus, User, Sparkles, Zap, Settings as SettingsIcon } from 'lucide-react';
import { db, seedDatabase, resetDatabase } from './db/database';
import { ThemeProvider } from './context/ThemeContext';
import { TemplateProvider, DEFAULT_TEMPLATE } from './context/TemplateContext';
import { runBudgetScheduler } from './utils/budgetScheduler';
import { runAssetScheduler } from './utils/assets';
import { checkAndApplyUpdate, getCurrentVersion } from './utils/appUpdater';
import BottomNav from './components/BottomNav';
import TopNav from './components/TopNav';
import TemplatePicker from './components/TemplatePicker';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Wallets from './pages/Wallets';
import SavingsTargets from './pages/SavingsTargets';
import Assets from './pages/Assets';
import Settings from './pages/Settings';
import BudgetPlans from './pages/BudgetPlans';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [dbReady, setDbReady] = useState(false);
  const [openTransactionModal, setOpenTransactionModal] = useState(false);
  const [openWalletModal, setOpenWalletModal] = useState(false);
  const [openSavingsModal, setOpenSavingsModal] = useState(false);
  const [openAssetModal, setOpenAssetModal] = useState(false);
  const [openBudgetModal, setOpenBudgetModal] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupAnimating, setSetupAnimating] = useState(false);
  const [setupStep, setSetupStep] = useState('template');
  const [templateChoice, setTemplateChoice] = useState(DEFAULT_TEMPLATE);
  
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

  // Run budget + subscription schedulers on startup and every 60 seconds
  useEffect(() => {
    if (!dbReady || !profileLoaded) return;

    // Run once immediately on startup
    runBudgetScheduler().then((results) => {
      if (results.length > 0) {
        console.log(`[BudgetScheduler] Auto-paid ${results.length} budget(s)`);
      }
    });

    runAssetScheduler().then((results) => {
      if (results.length > 0) {
        console.log(`[AssetScheduler] Auto-charged ${results.length} subscription(s)`);
      }
    });

    // Check periodically (every 60s)
    const interval = setInterval(() => {
      runBudgetScheduler();
      runAssetScheduler();
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
    // Persist the template chosen during onboarding
    await db.settings.put({ key: 'template', value: templateChoice });
    setTimeout(() => {
      setUserProfile(profile);
      setSetupAnimating(false);
    }, 600);
  };

  const handleNavigate = useCallback((p) => {
    setPage(p);
    setOpenWalletModal(false);
    setOpenSavingsModal(false);
    setOpenAssetModal(false);
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
    // Step 1: pick a UI template, Step 2: enter a name
    if (setupStep === 'template') {
      return (
        <TemplateProvider>
          <TemplatePicker
            onContinue={(id) => {
              setTemplateChoice(id);
              setSetupStep('name');
            }}
            heading="Pilih Tampilan"
            subheading="Pilih gaya tampilan aplikasi. Anda bisa mengubahnya kapan saja di Pengaturan."
            continueLabel="Lanjut"
          />
        </TemplateProvider>
      );
    }

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
    <TemplateProvider>
      <ThemeProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 2500,
            style: {
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              fontSize: '13px',
              padding: '12px 16px',
            },
          }}
        />

        <TopNav onNavigate={handleNavigate} />

      <main className="app-main">
        {page === 'dashboard' && <Dashboard onNavigate={handleNavigate} userProfile={userProfile} />}
        {page === 'transactions' && <Transactions openModal={openTransactionModal} onModalStateChange={setOpenTransactionModal} />}
        {page === 'wallets' && <Wallets openModal={openWalletModal} onModalStateChange={setOpenWalletModal} />}
        {page === 'savings' && <SavingsTargets openModal={openSavingsModal} onModalStateChange={setOpenSavingsModal} />}
        {page === 'assets' && <Assets openModal={openAssetModal} onModalStateChange={setOpenAssetModal} />}
        {page === 'budget' && <BudgetPlans openModal={openBudgetModal} onModalStateChange={setOpenBudgetModal} />}
        {page === 'settings' && <Settings />}
      </main>

      {/* Floating quick actions, stacked above the bottom nav */}
      {page !== 'settings' && (
        <div className="quick-actions">
          <button
            onClick={() => handleNavigate('settings')}
            className="quick-action-btn quick-action-btn--settings"
            aria-label="Pengaturan"
          >
            <SettingsIcon size={22} />
          </button>

          <button
            onClick={() => {
              if (page === 'wallets') {
                setOpenWalletModal(true);
              } else if (page === 'budget') {
                setOpenBudgetModal(true);
              } else if (page === 'savings') {
                setOpenSavingsModal(true);
              } else if (page === 'assets') {
                setOpenAssetModal(true);
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
            aria-label="Tambah"
          >
            <Plus size={24} />
          </button>
        </div>
      )}

      <BottomNav active={page} onNavigate={handleNavigate} />
      </ThemeProvider>
    </TemplateProvider>
  );
}
