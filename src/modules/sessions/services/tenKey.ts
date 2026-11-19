import { removeDiacritics } from '@/shared/utils/text';

/** {{TenKey}}: PascalCase, Latin letters without diacritics and digits, starts with an uppercase letter, 2–50 chars. */
export const TEN_KEY_RE = /^[A-Z][A-Za-z0-9]{1,49}$/;
export const TEN_KEY_MAX = 50;

export function isValidTenKey(key: string): boolean {
  return TEN_KEY_RE.test(key);
}

export function wrapKey(key: string): string {
  return `{{${key}}}`;
}

/**
 * Build a TenKey from a field label.
 * "Họ và tên" → HoVaTen · "Số CCCD" → SoCCCD · "Phụ cấp ăn trưa (cũ)" → PhuCapAnTruaCu
 */
export function toTenKey(label: string): string {
  const words = removeDiacritics(label)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  let key = words
    .map((w) => {
      // Keep known acronyms written fully in uppercase (CCCD, BHXH, MST).
      if (w.length >= 2 && /^[A-Z0-9]+$/.test(w) && /[A-Z]/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join('');
  if (!key) key = 'Truong';
  if (/^[0-9]/.test(key)) key = 'Truong' + key;
  if (key.length < 2) key = 'Truong' + key;
  return key.slice(0, TEN_KEY_MAX);
}

/**
 * Make `key` unique among `taken` (a set of keys already owned by other fields).
 * First tries a group suffix, then a numeric suffix.
 */
export function uniqueKey(key: string, taken: Set<string>, groupLabel?: string): string {
  if (!taken.has(key)) return key;
  if (groupLabel) {
    const withGroup = (key + toTenKey(groupLabel)).slice(0, TEN_KEY_MAX);
    if (!taken.has(withGroup)) return withGroup;
  }
  for (let i = 2; i < 1000; i++) {
    const suffix = String(i);
    const candidate = key.slice(0, TEN_KEY_MAX - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('Không sinh được key duy nhất');
}

/** Turn a key found in an existing file ({{ho_ten}}, {{Họ và tên}}) into a proposed TenKey. */
export function normalizeExistingKey(raw: string): string {
  const t = raw.trim();
  if (isValidTenKey(t)) return t; // already PascalCase: keep as written ({{HoVaTen}} stays HoVaTen)
  return toTenKey(t.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
}
