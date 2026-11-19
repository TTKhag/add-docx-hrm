import { useState } from 'react';
import { Confirm, download, PageHeader, Section } from '@/shared/components/ui';
import { errorMessage, toast } from '@/shared/components/toast';
import { todayStamp } from '@/shared/utils/text';
import { exportBackup, parseBackup, restoreBackup, wipeAll } from '../services/backup';

export default function BackupPage() {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [wipe, setWipe] = useState(false);

  return (
    <>
      <PageHeader title="Sao lưu" sub="Dữ liệu Studio chỉ nằm trong trình duyệt này. Sao lưu định kỳ hoặc trước khi đổi máy / xóa dữ liệu trình duyệt." />
      <div className="grid gap-[22px] lg:grid-cols-2">
        <Section title="Xuất">
          <div className="panel mb-4 text-[13px]">Tệp gồm hồ sơ dự án (không có mật khẩu), phiên, file gốc và file xuất, bảng ghép, danh mục, nhật ký. <b>File gốc có thể chứa dữ liệu cá nhân</b> — cất tệp sao lưu như tài liệu nội bộ.</div>
          <button className="btn" disabled={busy} data-testid="backup-export" onClick={async () => {
            setBusy(true);
            try { download(new Blob([await exportBackup()], { type: 'application/json' }), `template-studio-${todayStamp()}.json`); toast.ok('Đã xuất sao lưu'); }
            catch (e) { toast.bad('Không xuất được', errorMessage(e)); } finally { setBusy(false); }
          }}>Xuất sao lưu</button>
        </Section>
        <Section title="Khôi phục">
          <div className="panel panel-warn mb-4 text-[13px]"><b>Khôi phục thay toàn bộ dữ liệu hiện tại.</b> Xuất sao lưu trước nếu cần giữ.</div>
          <input type="file" accept=".json,application/json" aria-label="Chọn tệp sao lưu" data-testid="backup-file" className="input" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setPending(parseBackup(await f.text()));
            e.target.value = '';
          }} />
          {pending && !pending.ok && <div className="panel panel-bad mt-3"><b>{pending.message}</b></div>}
        </Section>
      </div>
      <Section title="Xóa toàn bộ">
        <button className="btn btn-ghost" onClick={() => setWipe(true)}>Xóa toàn bộ dữ liệu Studio</button>
      </Section>

      <Confirm open={!!pending?.ok} title="Khôi phục sao lưu" danger confirmLabel="Khôi phục" onClose={() => setPending(null)}
        body={pending?.ok && <>Thay dữ liệu hiện tại bằng sao lưu gồm <b>{pending.summary.projects} dự án</b>, <b>{pending.summary.sessions} phiên</b>, <b>{pending.summary.catalogs} danh mục</b>?</>}
        onConfirm={async () => { if (pending?.ok) { try { await restoreBackup(pending.data); toast.ok('Đã khôi phục'); } catch (e) { toast.bad('Không khôi phục được', errorMessage(e)); } } }} />
      <Confirm open={wipe} title="Xóa toàn bộ" danger confirmLabel="Xóa hết" onClose={() => setWipe(false)}
        body="Xóa mọi dự án, phiên, file, danh mục trong trình duyệt này? Không hoàn tác được."
        onConfirm={async () => { await wipeAll(); toast.ok('Đã xóa toàn bộ'); }} />
    </>
  );
}
