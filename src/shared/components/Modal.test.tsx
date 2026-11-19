import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from './ui';

// Regression: typing in a modal opened with an inline onClose used to move focus to the ✕ button after one key.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const [v, setV] = useState('');
  return (
    <Modal title="Thêm dự án" open onClose={() => undefined}>
      <input id="name" value={v} onChange={(e) => setV(e.target.value)} />
      <input id="other" />
    </Modal>
  );
}

function typeInto(el: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  for (const ch of text) {
    act(() => {
      setter.call(el, el.value + ch);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
}

describe('Modal focus', () => {
  it('focuses the first input, not the close button, and keeps focus while typing', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<Harness />));
    const input = document.getElementById('name') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    typeInto(input, 'Công ty Mẫu A');
    expect(input.value).toBe('Công ty Mẫu A');
    expect(document.activeElement).toBe(input);
    act(() => root.unmount());
  });
});
