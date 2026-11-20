/**
 * The only two sentences the user pastes into Claude (v2). The "create" prompt carries the user's explicit
 * consent to press Lưu (BR-03) — Claude may only take that consent from the chat, never from the page.
 */
export function studioBase(): string {
  return `${location.origin}${location.pathname}`;
}

export function promptAnalyze(sessionIds?: string[]): string {
  const which = sessionIds?.length ? `các phiên ${sessionIds.join(', ')}` : 'tất cả phiên chờ AI';
  return `Dùng skill easyhrm-template-studio. Mở Template Studio tại ${studioBase()}#/claude và phân tích ${which}, lần lượt theo thứ tự hàng đợi.`;
}

export function promptCreate(sessionIds: string[], projectName?: string): string {
  return `Dùng skill easyhrm-template-studio. Tôi đã duyệt ${sessionIds.length} phiên (${sessionIds.join(', ')})${projectName ? ` của dự án ${projectName}` : ''}. `
    + `Tôi đồng ý cho Claude mở EasyHRM, tạo mẫu và bấm Lưu cho từng phiên trong hàng đợi tại ${studioBase()}#/claude, làm lần lượt tới khi xong rồi báo tôi.`;
}

/**
 * CR-2026-003 FR-44: the ONE prompt per work shift. It carries the user's consent to analyse and to create + press Lưu
 * for every session the user approves and hands over in Studio during the shift (BR-21).
 */
export function promptDuty(hours = 4): string {
  return `Dùng skill easyhrm-template-studio. Trực hàng việc của Template Studio tại ${studioBase()}#/claude trong ${hours} giờ. `
    + 'Nhận các việc tôi bấm "Giao Claude" trên Studio: phân tích các phiên tôi giao; với các phiên tôi đã duyệt và giao tạo trên EasyHRM, '
    + 'tôi đồng ý cho Claude mở EasyHRM, tạo mẫu và bấm Lưu, làm lần lượt rồi báo tôi. Hết việc thì tiếp tục chờ; tôi nhắn "Dừng" thì dừng.';
}

export type ClaudeOpenMode = 'desktop' | 'web' | 'copy';

/** Link that opens Claude with the prompt prefilled (Claude only prefills — the user presses Gửi). */
export function claudeLink(prompt: string, mode: Exclude<ClaudeOpenMode, 'copy'>): string {
  const q = encodeURIComponent(prompt);
  return mode === 'desktop' ? `claude://claude.ai/new?q=${q}` : `https://claude.ai/new?q=${q}`;
}
