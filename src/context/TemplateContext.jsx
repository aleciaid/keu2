import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db } from '../db/database';

const TemplateContext = createContext();

/**
 * UI templates. Each template is a complete look applied by setting
 * `data-template` on <html>; the CSS in index.css retints every Tailwind theme
 * variable for that template.
 *
 * `classic` is the original design and keeps its Terang/Gelap toggle. `retro`
 * is the warm paper style inspired by Saweria and has a fixed appearance.
 */
export const TEMPLATES = [
  {
    id: 'wattvision',
    name: 'WattVision',
    tagline: 'Dashboard gelap neon',
    description: 'Gaya dashboard energi: latar gelap, aksen cyan neon, angka monospace, aksen hijau "live" dan merah untuk alert.',
    preview: {
      bg: '#121212',
      card: '#1e1e1e',
      accent: '#00e5ff',
      text: '#ffffff',
      muted: '#98989d',
      radius: 16,
    },
    supportsColorMode: false,
  },
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Bersih & modern',
    description: 'Tampilan asli FinTrack. Netral, rapi, dan bisa diganti mode Terang atau Gelap.',
    preview: {
      bg: '#020617',
      card: '#1e293b',
      accent: '#6366f1',
      text: '#ffffff',
      muted: '#94a3b8',
      radius: 12,
    },
    supportsColorMode: true,
  },
  {
    id: 'retro',
    name: 'Retro',
    tagline: 'Kertas hangat & oranye',
    description: 'Gaya retro ala Saweria: latar cream, aksen oranye, garis tegas, sudut kotak.',
    preview: {
      bg: '#f7edd8',
      card: '#fffdf7',
      accent: '#e8590c',
      text: '#2e2118',
      muted: '#8a7358',
      radius: 6,
    },
    supportsColorMode: false,
  },
];

export const DEFAULT_TEMPLATE = 'wattvision';

const MIGRATION_KEY = 'templateMigrationWattVision';

export function isValidTemplate(id) {
  return TEMPLATES.some((t) => t.id === id);
}

export function TemplateProvider({ children }) {
  const [template, setTemplateState] = useState(DEFAULT_TEMPLATE);
  const [loaded, setLoaded] = useState(false);

  // Apply to <html> and remember in localStorage for instant paint next launch
  const applyTemplate = useCallback((id) => {
    const safe = isValidTemplate(id) ? id : DEFAULT_TEMPLATE;
    const root = document.documentElement;
    root.setAttribute('data-template', safe);
    localStorage.setItem('template', safe);
    return safe;
  }, []);

  // Load saved template
  useEffect(() => {
    const load = async () => {
      let saved = null;
      try {
        saved = localStorage.getItem('template');
      } catch {
        // ignore unavailable localStorage
      }

      if (!saved) {
        try {
          const setting = await db.settings.get('template');
          if (setting?.value) saved = setting.value;
        } catch (error) {
          console.error('Failed to load template:', error);
        }
      }

      // One-time migration: WattVision is the new default look, so installs
      // still sitting on `classic` are moved over once. Anyone who deliberately
      // keeps Classic after this can re-pick it in Settings and it will stick.
      try {
        if (!localStorage.getItem(MIGRATION_KEY) && (!saved || saved === 'classic')) {
          saved = DEFAULT_TEMPLATE;
          await db.settings.put({ key: 'template', value: saved });
        }
        localStorage.setItem(MIGRATION_KEY, '1');
      } catch {
        // ignore unavailable storage
      }

      const resolved = applyTemplate(saved || DEFAULT_TEMPLATE);
      setTemplateState(resolved);
      setLoaded(true);
    };
    load();
  }, [applyTemplate]);

  const setTemplate = useCallback(
    async (id) => {
      const resolved = applyTemplate(id);
      setTemplateState(resolved);
      try {
        await db.settings.put({ key: 'template', value: resolved });
      } catch (error) {
        console.error('Failed to save template:', error);
      }
      return resolved;
    },
    [applyTemplate],
  );

  return (
    <TemplateContext.Provider value={{ template, setTemplate, templates: TEMPLATES, loaded }}>
      {children}
    </TemplateContext.Provider>
  );
}

export const useTemplate = () => {
  const context = useContext(TemplateContext);
  if (!context) {
    throw new Error('useTemplate must be used within TemplateProvider');
  }
  return context;
};
