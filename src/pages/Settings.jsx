import { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { exportData, importData, validateImportData } from '../utils/exportImport';
import { testWebhook } from '../utils/webhook';
import { formatDateTime } from '../utils/currency';
import { useTheme } from '../context/ThemeContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import toast from 'react-hot-toast';
import {
  Download,
  Upload,
  Webhook,
  Tags,
  FileText,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronRight,
  Shield,
  Info,
  Moon,
  Sun,
  User,
  Copy,
} from 'lucide-react';

const CATEGORY_ICONS = ['💰', '🎁', '📈', '📥', '🍕', '🚗', '📄', '🛍️', '🎬', '🏥', '📚', '📦', '🏠', '💡', '📱', '🎮', '🍔', '☕', '🚌', '✈️', '🎵', '💊', '🐕', '👶', '🏋️'];
const CATEGORY_COLORS = ['#ef4444', '#f97316', '#eab308', '#10b981', '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#64748b'];

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const logs = useLiveQuery(() => db.logs.orderBy('createdAt').reverse().limit(50).toArray()) || [];
  const webhookUrl = useLiveQuery(() => db.settings.get('webhookUrl'));
  const webhookEnabled = useLiveQuery(() => db.settings.get('webhookEnabled'));
  const userProfileSetting = useLiveQuery(() => db.settings.get('userProfile'));

  // Section toggles
  const [activeSection, setActiveSection] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    if (userProfileSetting?.value?.name) {
      setProfileName(userProfileSetting.value.name);
    }
  }, [userProfileSetting]);

  const saveProfileName = async () => {
    if (!profileName.trim()) return;
    const profile = { ...userProfileSetting.value, name: profileName.trim() };
    await db.settings.put({ key: 'userProfile', value: profile });
    setEditingName(false);
    toast.success('Nama profil diperbarui');
  };

  const copyUserId = () => {
    if (userProfileSetting?.value?.userId) {
      navigator.clipboard.writeText(userProfileSetting.value.userId);
      toast.success('User ID disalin');
    }
  };

  // Webhook state
  const [whUrl, setWhUrl] = useState('');
  const [whEnabled, setWhEnabled] = useState(false);
  const [whTesting, setWhTesting] = useState(false);

  // Initialize webhook fields from DB using useEffect
  useEffect(() => {
    if (webhookUrl && webhookEnabled) {
      setWhUrl(webhookUrl.value || '');
      setWhEnabled(webhookEnabled.value || false);
    }
  }, [webhookUrl, webhookEnabled]);

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [deleteCatId, setDeleteCatId] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', type: 'expense', icon: '📦', color: '#6366f1' });

  // Import modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importData_, setImportData] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importMode, setImportMode] = useState('replace');
  const fileRef = useRef(null);

  // --- Webhook ---
  const saveWebhook = async () => {
    await db.settings.put({ key: 'webhookUrl', value: whUrl });
    await db.settings.put({ key: 'webhookEnabled', value: whEnabled });
    toast.success('Webhook settings disimpan');
  };

  const handleTestWebhook = async () => {
    if (!whUrl) {
      toast.error('Masukkan webhook URL');
      return;
    }
    setWhTesting(true);
    const result = await testWebhook(whUrl);
    setWhTesting(false);
    if (result.success) {
      toast.success(`Webhook OK (${result.statusCode})`);
    } else {
      toast.error(`Webhook gagal: ${result.error || result.statusCode}`);
    }
  };

  // --- Categories ---
  const openCatCreate = () => {
    setEditCat(null);
    setCatForm({ name: '', type: 'expense', icon: '📦', color: '#6366f1' });
    setCatModalOpen(true);
  };

  const openCatEdit = (cat) => {
    setEditCat(cat);
    setCatForm({ name: cat.name, type: cat.type, icon: cat.icon, color: cat.color });
    setCatModalOpen(true);
  };

  const saveCat = async () => {
    if (!catForm.name.trim()) {
      toast.error('Nama kategori harus diisi');
      return;
    }
    const now = new Date().toISOString();
    if (editCat) {
      await db.categories.update(editCat.id, {
        name: catForm.name.trim(),
        type: catForm.type,
        icon: catForm.icon,
        color: catForm.color,
        updatedAt: now,
      });
      toast.success('Kategori berhasil diupdate');
    } else {
      await db.categories.add({
        id: crypto.randomUUID(),
        name: catForm.name.trim(),
        type: catForm.type,
        icon: catForm.icon,
        color: catForm.color,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      });
      toast.success('Kategori berhasil ditambahkan');
    }
    setCatModalOpen(false);
  };

  const deleteCat = async () => {
    if (!deleteCatId) return;
    const cat = categories.find((c) => c.id === deleteCatId);
    if (cat?.isDefault) {
      toast.error('Kategori default tidak dapat dihapus');
      setDeleteCatId(null);
      return;
    }
    await db.categories.delete(deleteCatId);
    toast.success('Kategori berhasil dihapus');
    setDeleteCatId(null);
  };

  // --- Export ---
  const handleExport = async () => {
    try {
      const result = await exportData();
      toast.success(`Data diekspor: ${result.filename}`);
    } catch (e) {
      toast.error('Gagal mengekspor data');
    }
  };

  // --- Import ---
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const validation = validateImportData(data);
        if (!validation.valid) {
          toast.error(`File tidak valid: ${validation.errors.join(', ')}`);
          return;
        }
        setImportData(data);
        setImportPreview(validation.preview);
        setImportModalOpen(true);
      } catch {
        toast.error('File JSON tidak valid');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!importData_) return;
    try {
      await importData(importData_, importMode);
      toast.success(`Data berhasil diimpor (${importMode})`);
      setImportModalOpen(false);
      setImportData(null);
      setImportPreview(null);
    } catch (e) {
      toast.error('Gagal mengimpor data');
    }
  };

  // --- Sections ---
  const incomeCategories = categories.filter((c) => c.type === 'income');
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  const sections = [
    { id: 'profile', label: 'Profil', icon: User, desc: 'Informasi akun Anda' },
    { id: 'categories', label: 'Kategori', icon: Tags, desc: 'Kelola kategori transaksi' },
    { id: 'theme', label: 'Tema', icon: Moon, desc: 'Pengaturan tampilan' },
    { id: 'webhook', label: 'Webhook', icon: Webhook, desc: 'Integrasi webhook' },
    { id: 'data', label: 'Data', icon: Shield, desc: 'Import & Export data' },
    { id: 'logs', label: 'Activity Log', icon: FileText, desc: 'Riwayat aktivitas' },
  ];

  const actionLabel = (action) => {
    const labels = {
      wallet_created: '💳 Wallet dibuat',
      wallet_updated: '💳 Wallet diupdate',
      wallet_deleted: '💳 Wallet dihapus',
      transaction_created: '📝 Transaksi dibuat',
      transaction_updated: '📝 Transaksi diupdate',
      transaction_deleted: '📝 Transaksi dihapus',
      transfer_created: '↔️ Transfer dibuat',
      data_imported: '📥 Data diimpor',
      budget_plan_created: '📋 Budget plan dibuat',
      budget_plan_updated: '📋 Budget plan diupdate',
      budget_plan_paid: '💳 Budget plan dibayar',
      budget_plan_cancelled: '❌ Budget plan dibatalkan',
      budget_plan_deleted: '🗑️ Budget plan dihapus',
      debt_settled: '✅ Hutang dilunasi',
      webhook_sent: '🌐 Webhook dikirim',
      webhook_failed: '⚠️ Webhook gagal',
    };
    return labels[action] || action;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <p className="text-sm text-surface-400 mb-1">⚙️ Pengaturan</p>
          <h1 className="page-title">Settings</h1>
        </div>
      </div>

      {/* Section List — each section content renders right below its button */}
      <div className="space-y-2 mb-6">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <div key={section.id}>
              <button
                onClick={() => setActiveSection(isActive ? null : section.id)}
                className={`w-full flex items-center gap-3 p-4 rounded-xl transition-all ${isActive
                  ? 'bg-primary-500/10 border border-primary-500/30'
                  : 'bg-surface-800/50 hover:bg-surface-800 border border-transparent'
                  }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? 'bg-primary-500/20' : 'bg-surface-700/50'
                  }`}>
                  <Icon size={18} className={isActive ? 'text-primary-400' : 'text-surface-400'} />
                </div>
                <div className="flex-1 text-left">
                  <p className={`text-sm font-semibold ${isActive ? 'text-primary-400' : 'text-surface-300'}`}>
                    {section.label}
                  </p>
                  <p className="text-[11px] text-surface-500">{section.desc}</p>
                </div>
                <ChevronRight
                  size={16}
                  className={`text-surface-500 transition-transform ${isActive ? 'rotate-90' : ''}`}
                />
              </button>

              {/* Profile */}
              {section.id === 'profile' && isActive && userProfileSetting?.value && (
                <div className="card animate-scaleIn mt-2">
                  <div className="flex flex-col items-center mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mb-3">
                      <User size={28} className="text-white" />
                    </div>
                    {editingName ? (
                      <div className="flex items-center gap-2 w-full max-w-xs">
                        <input
                          type="text"
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveProfileName()}
                          className="w-full text-center text-sm"
                          autoFocus
                          maxLength={30}
                        />
                        <button onClick={saveProfileName} className="btn-primary btn-sm shrink-0">
                          <CheckCircle size={14} />
                        </button>
                        <button onClick={() => { setEditingName(false); setProfileName(userProfileSetting.value.name); }} className="btn-ghost btn-sm shrink-0">
                          <XCircle size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingName(true)}
                        className="flex items-center gap-2 group"
                      >
                        <h3 className="text-lg font-bold text-white group-hover:text-primary-400 transition-colors">
                          {userProfileSetting.value.name}
                        </h3>
                        <Pencil size={12} className="text-surface-500 group-hover:text-primary-400 transition-colors" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-surface-800/50">
                      <div>
                        <p className="text-[10px] text-surface-500 mb-0.5">User ID</p>
                        <p className="text-sm font-mono font-bold text-primary-400">{userProfileSetting.value.userId}</p>
                      </div>
                      <button
                        onClick={copyUserId}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-800 hover:bg-primary-500/20 text-surface-400 hover:text-primary-400 transition-colors"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-800/50">
                      <p className="text-[10px] text-surface-500 mb-0.5">Bergabung Sejak</p>
                      <p className="text-sm text-surface-300">
                        {new Date(userProfileSetting.value.createdAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Categories */}
              {section.id === 'categories' && isActive && (
                <div className="card animate-scaleIn mt-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white">Kategori</h3>
                    <button onClick={openCatCreate} className="btn-primary btn-sm">
                      <Plus size={12} /> Baru
                    </button>
                  </div>
                  <div className="mb-4">
                    <p className="text-xs font-medium text-emerald-400 mb-2 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" /> Income
                    </p>
                    <div className="space-y-1">
                      {incomeCategories.map((cat) => (
                        <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-800/50 group">
                          <span className="text-base">{cat.icon}</span>
                          <span className="flex-1 text-sm text-surface-300">{cat.name}</span>
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                          {!cat.isDefault && (
                            <div className="flex gap-1">
                              <button onClick={() => openCatEdit(cat)} className="p-1 hover:text-primary-400 text-surface-500"><Pencil size={12} /></button>
                              <button onClick={() => setDeleteCatId(cat.id)} className="p-1 hover:text-red-400 text-surface-500"><Trash2 size={12} /></button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-400" /> Expense
                    </p>
                    <div className="space-y-1">
                      {expenseCategories.map((cat) => (
                        <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-800/50 group">
                          <span className="text-base">{cat.icon}</span>
                          <span className="flex-1 text-sm text-surface-300">{cat.name}</span>
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                          {!cat.isDefault && (
                            <div className="flex gap-1">
                              <button onClick={() => openCatEdit(cat)} className="p-1 hover:text-primary-400 text-surface-500"><Pencil size={12} /></button>
                              <button onClick={() => setDeleteCatId(cat.id)} className="p-1 hover:text-red-400 text-surface-500"><Trash2 size={12} /></button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Theme */}
              {section.id === 'theme' && isActive && (
                <div className="card animate-scaleIn mt-2">
                  <h3 className="text-sm font-semibold text-white mb-4">Tema Tampilan</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-surface-800/50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-surface-700/50 flex items-center justify-center">
                          {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">Mode {theme === 'dark' ? 'Gelap' : 'Terang'}</p>
                          <p className="text-[11px] text-surface-500">Ubah warna latar belakang</p>
                        </div>
                      </div>
                      <button
                        onClick={toggleTheme}
                        className={`w-12 h-7 rounded-full transition-all relative ${theme === 'dark' ? 'bg-primary-500' : 'bg-surface-700'}`}
                      >
                        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${theme === 'dark' ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Webhook */}
              {section.id === 'webhook' && isActive && (
                <div className="card animate-scaleIn mt-2">
                  <h3 className="text-sm font-semibold text-white mb-4">Webhook Integration</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-surface-800/50">
                      <div>
                        <p className="text-sm font-medium text-white">Enable Webhook</p>
                        <p className="text-[11px] text-surface-500">Kirim notifikasi ke URL webhook</p>
                      </div>
                      <button
                        onClick={() => setWhEnabled(!whEnabled)}
                        className={`w-12 h-7 rounded-full transition-all relative ${whEnabled ? 'bg-primary-500' : 'bg-surface-700'}`}
                      >
                        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${whEnabled ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                    <div className="input-group">
                      <label className="input-label">Webhook URL</label>
                      <input
                        type="url"
                        value={whUrl}
                        onChange={(e) => setWhUrl(e.target.value)}
                        placeholder="https://your-webhook-url.com/hook"
                        className="w-full text-sm"
                        disabled={!whEnabled}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleTestWebhook} disabled={!whUrl || whTesting} className="btn-ghost btn-sm flex-1">
                        {whTesting ? <Loader2 size={14} className="animate-spin" /> : <Webhook size={14} />} Test
                      </button>
                      <button onClick={saveWebhook} className="btn-primary btn-sm flex-1">Simpan</button>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-800/30 border border-surface-700/30">
                      <p className="text-xs font-medium text-surface-400 mb-2 flex items-center gap-1">
                        <Info size={12} /> Payload Format
                      </p>
                      <pre className="text-[10px] text-surface-500 overflow-x-auto">
                        {`{
  "event": "transaction_created",
  "timestamp": "ISO_DATE",
  "data": {
    "id": "uuid",
    "type": "income/expense/transfer",
    "amount": 100000,
    "wallet": "Cash",
    "category": "Makan",
    "note": "Lunch",
    "date": "ISO_DATE"
  }
}`}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Data */}
              {section.id === 'data' && isActive && (
                <div className="card animate-scaleIn mt-2">
                  <h3 className="text-sm font-semibold text-white mb-4">Import & Export</h3>
                  <div className="space-y-3">
                    <button onClick={handleExport} className="w-full flex items-center gap-3 p-4 rounded-xl bg-surface-800/50 hover:bg-surface-800 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                        <Download size={18} className="text-emerald-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-white">Export Data</p>
                        <p className="text-[11px] text-surface-500">Download semua data sebagai JSON</p>
                      </div>
                    </button>
                    <button onClick={() => fileRef.current?.click()} className="w-full flex items-center gap-3 p-4 rounded-xl bg-surface-800/50 hover:bg-surface-800 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                        <Upload size={18} className="text-blue-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-white">Import Data</p>
                        <p className="text-[11px] text-surface-500">Restore dari file backup JSON</p>
                      </div>
                    </button>
                    <input ref={fileRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
                  </div>
                </div>
              )}

              {/* Logs */}
              {section.id === 'logs' && isActive && (
                <div className="card animate-scaleIn mt-2">
                  <h3 className="text-sm font-semibold text-white mb-4">Activity Log</h3>
                  {logs.length === 0 ? (
                    <div className="empty-state py-6">
                      <FileText size={24} className="mb-2 text-surface-600" />
                      <p className="text-sm">Belum ada aktivitas</p>
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-80 overflow-y-auto">
                      {logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-surface-800/50">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-2 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-surface-300">{actionLabel(log.action)}</p>
                            <p className="text-[10px] text-surface-500">{formatDateTime(log.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* App Info */}
      <div className="text-center py-4">
        <p className="text-xs text-surface-600">FinanceTracker v1.9.0</p>
        <p className="text-[10px] text-surface-700 mt-1">Offline-first PWA • Data stored locally</p>
      </div>

      {/* Category Modal */}
      <Modal
        isOpen={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title={editCat ? 'Edit Kategori' : 'Kategori Baru'}
      >
        <div className="space-y-4">
          <div className="input-group">
            <label className="input-label">Nama Kategori</label>
            <input
              type="text"
              value={catForm.name}
              onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
              placeholder="cth: Groceries"
              className="w-full"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Tipe</label>
            <div className="flex gap-2">
              <button
                onClick={() => setCatForm({ ...catForm, type: 'income' })}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${catForm.type === 'income'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-surface-800/50 border-surface-700/50 text-surface-400'
                  }`}
              >
                Income
              </button>
              <button
                onClick={() => setCatForm({ ...catForm, type: 'expense' })}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${catForm.type === 'expense'
                  ? 'bg-red-500/15 border-red-500/30 text-red-400'
                  : 'bg-surface-800/50 border-surface-700/50 text-surface-400'
                  }`}
              >
                Expense
              </button>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Icon</label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {CATEGORY_ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setCatForm({ ...catForm, icon })}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${catForm.icon === icon
                    ? 'bg-primary-500/20 border border-primary-500 scale-110'
                    : 'bg-surface-800 hover:bg-surface-700'
                    }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Warna</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setCatForm({ ...catForm, color })}
                  className={`w-7 h-7 rounded-full transition-all ${catForm.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-900 scale-110' : ''
                    }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="modal-footer">
            <div className="flex gap-3">
              <button onClick={() => setCatModalOpen(false)} className="btn-ghost flex-1">Batal</button>
              <button onClick={saveCat} className="btn-primary flex-1">
                {editCat ? 'Update' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Import Preview Modal */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import Data"
      >
        {importPreview && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-surface-800/50">
              <h4 className="text-sm font-semibold text-white mb-3">Preview</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-surface-400">Version:</div>
                <div className="text-white font-medium">{importPreview.version}</div>
                <div className="text-surface-400">Exported:</div>
                <div className="text-white font-medium">{formatDateTime(importPreview.exportedAt)}</div>
                <div className="text-surface-400">Wallets:</div>
                <div className="text-white font-medium">{importPreview.counts.wallets}</div>
                <div className="text-surface-400">Transaksi:</div>
                <div className="text-white font-medium">{importPreview.counts.transactions}</div>
                <div className="text-surface-400">Kategori:</div>
                <div className="text-white font-medium">{importPreview.counts.categories}</div>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Mode Import</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setImportMode('replace')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${importMode === 'replace'
                    ? 'bg-red-500/15 border-red-500/30 text-red-400'
                    : 'bg-surface-800/50 border-surface-700/50 text-surface-400'
                    }`}
                >
                  Replace All
                </button>
                <button
                  onClick={() => setImportMode('merge')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${importMode === 'merge'
                    ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                    : 'bg-surface-800/50 border-surface-700/50 text-surface-400'
                    }`}
                >
                  Merge
                </button>
              </div>
              <p className="text-[10px] text-surface-500 mt-1">
                {importMode === 'replace'
                  ? '⚠️ Semua data saat ini akan dihapus dan diganti'
                  : 'Data baru akan ditambahkan tanpa duplikasi (berdasarkan UUID)'}
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setImportModalOpen(false)} className="btn-ghost flex-1">Batal</button>
              <button onClick={handleImport} className="btn-primary flex-1">
                Import
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteCatId}
        onClose={() => setDeleteCatId(null)}
        onConfirm={deleteCat}
        title="Hapus Kategori?"
        message="Kategori yang dihapus tidak dapat dikembalikan."
      />
    </div>
  );
}
