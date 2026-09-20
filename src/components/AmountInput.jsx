import { useState } from 'react';
import { parseSmartAmount, formatIDR } from '../utils/currency';

export default function AmountInput({ value, onChange, placeholder = 'Masukkan jumlah (cth: 10rb, 2jt)' }) {
  const [raw, setRaw] = useState(value ? String(value) : '');
  const [preview, setPreview] = useState(value ? formatIDR(value) : '');

  const handleChange = (e) => {
    const input = e.target.value;
    setRaw(input);
    const parsed = parseSmartAmount(input);
    setPreview(parsed > 0 ? formatIDR(parsed) : '');
    onChange(parsed);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={raw}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full text-lg font-semibold pr-4"
        inputMode="text"
        autoComplete="off"
      />
      {preview && (
        <div className="text-xs text-primary-400 mt-1 font-medium">{preview}</div>
      )}
    </div>
  );
}
