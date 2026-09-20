import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, footer, size = 'default' }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timer;
    if (isOpen) {
      setShow(true);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      timer = setTimeout(() => setShow(false), 200);
    }
    return () => { 
      document.body.style.overflow = ''; 
      if (timer) clearTimeout(timer);
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setShow(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  if (!isOpen && !show) return null;

  return (
    <div
      className={`modal-overlay transition-opacity duration-200 ${show && isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className={`modal-content animate-slideUp ${size === 'large' ? 'sm:max-w-2xl' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-surface-800/50 flex-shrink-0">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-white transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>
        <div className="modal-body-wrapper">
          <div className="modal-body">
            {children}
          </div>
        </div>
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
