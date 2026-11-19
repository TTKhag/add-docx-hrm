import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { type BridgeOutcome, sendToOpener } from '../services/bridge';

/** `#/cau-noi/:id` — opened by the EasyHRM tab; posts the approved .docx to it, then closes. */
export default function BridgePage() {
  const { id = '' } = useParams();
  const [res, setRes] = useState<BridgeOutcome | null>(null);
  useEffect(() => {
    let alive = true;
    void sendToOpener(id, window.opener as Window | null).then((r) => {
      if (!alive) return;
      setRes(r);
      document.documentElement.dataset.bridge = r.ok ? 'sent' : 'failed';
      if (r.ok) setTimeout(() => window.close(), 1500);
    });
    return () => { alive = false; };
  }, [id]);
  if (!res) return <div className="panel">Đang gửi tệp sang EasyHRM…</div>;
  return res.ok
    ? <div className="panel panel-ok" data-testid="bridge-ok"><b>Đã gửi {res.name}</b> ({(res.size / 1024).toFixed(0)} KB) tới {res.origin}. Cửa sổ sẽ tự đóng.</div>
    : <div className="panel panel-bad" data-testid="bridge-fail"><b>Không gửi được tệp.</b> {res.message}</div>;
}
