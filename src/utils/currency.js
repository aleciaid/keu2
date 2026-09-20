/**
 * Smart input parser: converts shorthand Indonesian currency notation
 * e.g. 10rb -> 10000, 2jt -> 2000000, 1.5jt -> 1500000
 */
export function parseSmartAmount(input) {
  if (typeof input === 'number') return input;
  if (!input) return 0;

  let str = String(input).trim().toLowerCase().replace(/\s/g, '');
  // Remove Rp prefix
  str = str.replace(/^rp\.?\s*/i, '');
  // Remove dots used as thousands separator (but keep decimal comma/dot)
  // First, let's handle the shorthand
  let multiplier = 1;

  if (str.endsWith('jt') || str.endsWith('juta')) {
    multiplier = 1_000_000;
    str = str.replace(/(jt|juta)$/, '');
  } else if (str.endsWith('rb') || str.endsWith('ribu') || str.endsWith('k')) {
    multiplier = 1_000;
    str = str.replace(/(rb|ribu|k)$/, '');
  } else if (str.endsWith('m')) {
    multiplier = 1_000_000;
    str = str.replace(/m$/, '');
  }

  // Replace comma with dot for decimal
  str = str.replace(/,/g, '.');
  // Remove any remaining non-numeric chars except dot
  str = str.replace(/[^0-9.]/g, '');

  const num = parseFloat(str);
  if (isNaN(num)) return 0;

  return Math.round(num * multiplier);
}

/**
 * Format number to IDR currency string
 */
export function formatIDR(amount, withPrefix = true) {
  if (amount === null || amount === undefined) return withPrefix ? 'Rp 0' : '0';
  const formatted = Math.abs(amount).toLocaleString('id-ID');
  const sign = amount < 0 ? '-' : '';
  return withPrefix ? `${sign}Rp ${formatted}` : `${sign}${formatted}`;
}

/**
 * Format compact IDR (e.g., 1.5jt, 500rb)
 */
export function formatCompactIDR(amount) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp ${(abs / 1_000).toFixed(0)}rb`;
  }
  return `${sign}Rp ${abs}`;
}

/**
 * Format date to locale string
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
