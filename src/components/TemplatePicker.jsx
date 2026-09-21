import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { useTemplate, TEMPLATES } from '../context/TemplateContext';

/**
 * Miniature preview of a template so the choice is visual rather than a label.
 * Renders a tiny app skeleton using the template's own preview palette.
 */
export function TemplatePreview({ preview, className = 'w-full h-24' }) {
  return (
    <div
      className={`${className} rounded-lg overflow-hidden relative`}
      style={{ backgroundColor: preview.bg }}
    >
      {/* fake top bar */}
      <div className="flex items-center gap-1 px-2 py-1.5" style={{ backgroundColor: preview.card }}>
        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: preview.accent }} />
        <div className="w-8 h-1.5 rounded-full" style={{ backgroundColor: preview.muted, opacity: 0.5 }} />
      </div>

      <div className="p-2 space-y-1.5">
        {/* fake card */}
        <div
          className="p-1.5 space-y-1"
          style={{
            backgroundColor: preview.card,
            borderRadius: preview.radius,
            border: `1px solid ${preview.muted}44`,
          }}
        >
          <div className="w-10 h-1.5 rounded-full" style={{ backgroundColor: preview.muted, opacity: 0.6 }} />
          <div className="w-14 h-2.5 rounded" style={{ backgroundColor: preview.text, opacity: 0.85 }} />
        </div>
        {/* fake accent bar */}
        <div
          className="h-2"
          style={{ backgroundColor: preview.accent, borderRadius: preview.radius }}
        />
        <div className="flex gap-1">
          <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: preview.muted, opacity: 0.4 }} />
          <div className="w-4 h-1.5 rounded-full" style={{ backgroundColor: preview.accent }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Template chooser. Used both during onboarding and in Settings.
 *
 * `onContinue` is only supplied during onboarding, where it turns the picker
 * into a step with a confirm button. In Settings the choice applies instantly
 * and `onDone` (if any) is called after selecting.
 */
export default function TemplatePicker({ onContinue, onDone, heading, subheading, continueLabel = 'Lanjut' }) {
  const { template, setTemplate } = useTemplate();
  const [selected, setSelected] = useState(template);

  const handleSelect = async (id) => {
    setSelected(id);
    // Apply immediately so the user sees the real look, not just a swatch.
    await setTemplate(id);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <Sparkles size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">{heading}</h1>
          <p className="text-sm text-surface-400">{subheading}</p>
        </div>

        <div className="space-y-3">
          {TEMPLATES.map((t) => {
            const isActive = selected === t.id;
            return (
              <button
                key={t.id}
                onClick={() => handleSelect(t.id)}
                className={`w-full text-left card transition-all ${
                  isActive ? 'border-primary-500/60 ring-1 ring-primary-500/40' : 'hover:border-primary-500/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{t.name}</h3>
                      <span className="text-[10px] text-surface-500">{t.tagline}</span>
                      {isActive && (
                        <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-primary-400">
                          <Check size={11} /> Dipilih
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-surface-400 mt-1 leading-relaxed">
                      {t.description}
                    </p>
                  </div>
                  <div className="w-24 shrink-0">
                    <TemplatePreview preview={t.preview} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {onContinue && (
          <button
            onClick={() => onContinue(selected)}
            className="btn-primary w-full py-3 text-sm font-semibold mt-6"
          >
            {continueLabel}
          </button>
        )}

        {!onContinue && onDone && (
          <button onClick={onDone} className="btn-ghost w-full py-3 text-sm font-semibold mt-4">
            Selesai
          </button>
        )}
      </div>
    </div>
  );
}
