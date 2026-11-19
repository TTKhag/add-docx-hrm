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
