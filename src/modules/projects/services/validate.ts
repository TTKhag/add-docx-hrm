import { z } from 'zod';

/** MST: 10 digits, or 10 digits + "-" + 3 digits for a branch. */
export const MST_RE = /^\d{10}(-\d{3})?$/;

export function normalizeProjectUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên dự án').max(100, 'Tối đa 100 ký tự'),
  url: z
    .string()
    .trim()
    .min(1, 'Nhập Link dự án')
    .refine((v) => normalizeProjectUrl(v) !== null, 'Link phải bắt đầu bằng https:// và là địa chỉ hợp lệ'),
  mst: z
    .string()
    .trim()
    .refine((v) => v === '' || MST_RE.test(v), 'MST gồm 10 chữ số, hoặc 10 chữ số + "-" + 3 chữ số'),
  username: z.string().trim().min(1, 'Nhập tài khoản').max(100, 'Tối đa 100 ký tự'),
  hrmVersion: z.string().trim().min(1, 'Chọn phiên bản EasyHRM'),
  note: z.string().trim().max(500, 'Tối đa 500 ký tự'),
  // v2: optional contract signer defaults (FR-14)
  companySignerName: z.string().trim().max(120, 'Tối đa 120 ký tự').default(''),
  signMethod: z.string().trim().max(120, 'Tối đa 120 ký tự').default(''),
  digitalSignMethod: z.string().trim().max(120, 'Tối đa 120 ký tự').default(''),
  otpMethod: z.string().trim().max(120, 'Tối đa 120 ký tự').default(''),
});

export type ProjectInput = z.input<typeof projectInputSchema>;

export type FieldErrors = Partial<Record<keyof ProjectInput, string>>;

export function validateProjectInput(input: ProjectInput): { ok: true; value: z.output<typeof projectInputSchema> } | { ok: false; errors: FieldErrors } {
  const r = projectInputSchema.safeParse(input);
  if (r.success) return { ok: true, value: { ...r.data, url: normalizeProjectUrl(r.data.url)! } };
  const errors: FieldErrors = {};
  for (const issue of r.error.issues) {
    const k = issue.path[0] as keyof ProjectInput;
    if (!errors[k]) errors[k] = issue.message;
  }
  return { ok: false, errors };
}
