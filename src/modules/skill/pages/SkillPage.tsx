import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { cancelJob, type ClaudeOpenMode, JOB_LABEL, OPEN_MODE_KEY, openClaudeForDuty, promptDuty, useDuty, useJobs, useOpenMode } from '@/modules/agent';
import { clearHandoffDir, dirPermission, fsSupported, getHandoffDir, pickHandoffDir } from '@/modules/handoff';
import { settingsRepo } from '@/db/repositories';
import { copyText, PageHeader, Section } from '@/shared/components/ui';
import { toast } from '@/shared/components/toast';
import { formatDateTime } from '@/shared/utils/text';
import skillMeta from '../../../../skill/skill-meta.json';

const zipName = `${skillMeta.name}-${skillMeta.version}.zip`;

function cmp(a: string, b: string) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export default function SkillPage() {
  const reported = useLiveQuery(() => settingsRepo.get<string>('skillVersionReported'), []);
  const reportedAt = useLiveQuery(() => settingsRepo.get<number>('skillReportedAt'), []);
  const zipUrl = `${import.meta.env.BASE_URL}skill/${zipName}`;
  const studioUrl = `${location.origin}${location.pathname}#/claude`;
  const checkPrompt = `Dùng skill ${skillMeta.name}, kiểm tra kết nối với Template Studio tại ${studioUrl}.`;
  const outdated = reported && cmp(reported, skillMeta.version) < 0;

  return (
    <>
      <PageHeader title="Claude trực & cài đặt" sub="Bộ skill dạy Claude cách làm việc với Studio và EasyHRM. Quy tắc và danh mục vẫn nằm trong Studio." />
      <div className="mb-7 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))' }}>
        <div className="card">
          <div className="label">Bản mới nhất</div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums">{skillMeta.version}</div>
          <div className="text-xs text-mut">Giao thức {skillMeta.protocol}</div>
        </div>
        <div className="card" data-testid="skill-connection">
          <div className="label">Claude đang dùng</div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums" style={{ color: outdated ? '#c77700' : reported ? '#1b7f3a' : undefined }}>{reported ?? 'Chưa kết nối'}</div>
          <div className="text-xs text-mut">{reportedAt ? `Báo lúc ${formatDateTime(reportedAt)}` : 'Chạy “Kiểm tra kết nối” sau khi cài'}</div>
        </div>
      </div>
      {outdated && <div className="panel panel-warn mb-6"><b>Skill trong Claude cũ hơn bản mới nhất.</b> Tải bản mới và tải lên lại (thay bản cũ).</div>}

      <DutySection />
      <HandoffDirSection />

      <Section title="Cài đặt — làm một lần">
        <ol className="grid gap-3">
          <Step n={1} title="Tải skill">
            <a className="btn" href={zipUrl} download={zipName} data-testid="skill-download">Tải {zipName}</a>
          </Step>
          <Step n={2} title="Tải lên Claude">Trên Claude: <b>Customize › Skills</b> → bấm <b>+</b> → <b>Create skill</b> → <b>Upload a skill</b> → chọn tệp ZIP vừa tải. Nếu không thấy mục Skills, bật tính năng chạy code trong Settings › Capabilities.</Step>
          <Step n={3} title="Cho phép trình duyệt và đăng nhập một lần">Dùng <b>một</b> trình duyệt cho Claude (trình duyệt của Claude desktop, hoặc Claude in Chrome). Cho phép hai nơi: domain của Studio này và Link dự án EasyHRM. Mở EasyHRM trong trình duyệt đó và <b>đăng nhập một lần</b>: Claude dùng lại phiên này, không cần mật khẩu.</Step>
          <Step n={4} title="Kiểm tra kết nối">
            <div className="mb-2">Chép câu lệnh và dán vào Claude. Claude mở trang này và báo phiên bản skill.</div>
            <code className="mb-2 block border-2 border-black bg-soft p-2 text-xs">{checkPrompt}</code>
            <button className="btn btn-ghost btn-sm" onClick={async () => ((await copyText(checkPrompt)) ? toast.ok('Đã chép câu lệnh') : toast.warn('Hãy chép thủ công'))}>Chép câu lệnh</button>
          </Step>
        </ol>
      </Section>

      <Section title="Điều skill cấm Claude làm">
        <div className="panel text-[13px]">
          <b>Không gõ mật khẩu</b> · <b>không tự duyệt</b> bảng ghép · <b>không sang EasyHRM</b> khi phiên chưa duyệt · <b>chỉ bấm Lưu khi câu lệnh bạn dán đã đồng ý</b> (câu lệnh "Giao Claude tạo trên EasyHRM" có sẵn câu đồng ý) · <b>không Xóa / Đổi trạng thái / Đổi tên</b> mẫu có sẵn · <b>không bật Hiệu lực</b> (mẫu mới để Không hiệu lực) · dừng khi domain EasyHRM khác hồ sơ dự án.
        </div>
      </Section>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="card flex gap-4">
      <span className="grid h-8 w-8 shrink-0 place-items-center bg-black text-sm font-extrabold text-white" style={{ clipPath: 'polygon(7px 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%,0 7px)' }}>{n}</span>
      <div className="min-w-0 flex-1"><div className="mb-2 text-[12px] font-extrabold uppercase tracking-[.14em]">{title}</div><div className="text-[13px]">{children}</div></div>
    </li>
  );
}

const JOB_STATUS = { cho: ['Chờ', 'tag-warn'], dang_lam: ['Đang làm', 'tag-ink'], xong: ['Xong', 'tag-ok'], huy: ['Đã huỷ', ''] } as const;
const OPEN_MODES: { id: ClaudeOpenMode; label: string }[] = [
  { id: 'desktop', label: 'Ứng dụng Claude desktop' },
  { id: 'web', label: 'claude.ai trên trình duyệt' },
  { id: 'copy', label: 'Chỉ chép câu lệnh' },
];

/** CR-2026-003 Y3: one prompt per shift, then every "Giao Claude" click goes straight to Claude. */
function DutySection() {
  const { onDuty, duty } = useDuty();
  const jobs = useJobs();
  const mode = useOpenMode();
  const prompt = promptDuty();
  return (
    <Section title="Claude trực — giao việc không cần dán lệnh" right={<span className={`tag ${onDuty ? 'tag-ok' : ''}`} data-testid="duty-status">{onDuty ? 'Đang trực' : 'Chưa trực'}</span>}>
      <div className="panel mb-3 text-[13px]">
        Mỗi ca làm việc chỉ cần <b>gửi một lần câu lệnh trực</b> cho Claude. Sau đó mỗi lần bạn bấm <b>Giao Claude</b>, Studio đưa việc vào hàng việc và Claude đang trực tự nhận trong vòng 30 giây — không chép, không dán.
        Câu lệnh trực có sẵn sự đồng ý <b>tạo mẫu và bấm Lưu</b> cho các phiên <b>bạn đã duyệt và giao</b> trong ca. Claude tự dừng khi hết giờ hoặc 30 phút không có việc.
        <div className="mt-2 text-mut">Cần mở Studio trong <b>cùng trình duyệt Claude điều khiển</b> (Claude in Chrome dùng chính Chrome của bạn; hoặc mở Studio trong trình duyệt của Claude desktop) — hàng việc nằm trong bộ nhớ của trình duyệt đó.</div>
      </div>
      {onDuty && duty && <div className="panel panel-ok mb-3 text-[13px]"><b>Claude đang trực</b> tới {new Date(duty.until).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}{duty.consentSave ? ' · đã có đồng ý bấm Lưu' : ' · chưa có đồng ý bấm Lưu (Claude sẽ hỏi trước khi Lưu)'}.</div>}
      <code className="mb-3 block border-2 border-black bg-soft p-2 text-xs" data-testid="duty-prompt">{prompt}</code>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button className="btn" onClick={() => void openClaudeForDuty()} data-testid="open-duty">Mở Claude với câu lệnh trực</button>
        <label className="flex items-center gap-2 text-[13px]">Mở bằng
          <select className="select !w-auto !py-1.5" value={mode} onChange={(e) => void settingsRepo.set(OPEN_MODE_KEY, e.target.value)} aria-label="Cách mở Claude">
            {OPEN_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      </div>
      <div className="label mb-2">Hàng việc gần đây</div>
      {!jobs?.length ? <div className="text-mut text-[13px]">Chưa có việc nào.</div> : (
        <div className="overflow-x-auto">
          <table className="tbl" data-testid="job-table">
            <thead><tr><th>Việc</th><th>Loại</th><th>Phiên</th><th>Trạng thái</th><th>Lúc giao</th><th /></tr></thead>
            <tbody>{jobs.map((j) => (
              <tr key={j.id}>
                <td className="font-mono text-xs">{j.id}</td><td>{JOB_LABEL[j.kind]}</td><td className="text-xs">{j.sessionIds.join(', ')}</td>
                <td><span className={`tag ${JOB_STATUS[j.status][1]}`}>{JOB_STATUS[j.status][0]}</span>{j.note && <div className="text-xs text-mut">{j.note}</div>}</td>
                <td className="whitespace-nowrap text-mut">{formatDateTime(j.createdAt)}</td>
                <td>{(j.status === 'cho' || j.status === 'dang_lam') && <button className="chip !px-2" onClick={() => void cancelJob(j.id)}>Huỷ</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/** CR-2026-003 FR-47: optional folder on the computer that receives every approved package. */
function HandoffDirSection() {
  const handle = useLiveQuery(() => getHandoffDir(), []);
  const [perm, setPerm] = useState<string>('');
  useEffect(() => {
    let alive = true;
    if (handle) void dirPermission(handle, false).then((p) => alive && setPerm(p)); else setPerm('');
    return () => { alive = false; };
  }, [handle]);
  const supported = fsSupported();
  return (
    <Section title="Thư mục giao việc (lưu tệp đã duyệt ra máy)">
      <div className="panel mb-3 text-[13px]">
        Mỗi lần <b>Duyệt phiên</b>, Studio luôn lưu một <b>gói giao việc</b> (tệp .docx có key + thông tin ghép trường) trong bộ nhớ trình duyệt để Claude tự lấy và nạp vào EasyHRM.
        Chọn thêm một thư mục để Studio ghi bản sao ra máy: <code>EasyHRM-Studio/&lt;dự án&gt;/&lt;thứ tự&gt;-&lt;mã phiên&gt;/</code> và danh sách <code>EasyHRM-Studio/hang-doi.json</code>.
        Claude dùng thư mục này khi trình duyệt của Claude không có dữ liệu Studio, và ô "Chọn tệp tin mẫu" luôn có tệp thật để chọn.
      </div>
      {!supported ? <div className="panel panel-warn text-[13px]">Trình duyệt này không ghi được thư mục (cần Chrome hoặc Edge). Kho tệp trong trình duyệt vẫn dùng được.</div> : (
        <div className="flex flex-wrap items-center gap-3" data-testid="handoff-dir">
          {handle ? <span className="text-[13px]">Đang dùng: <b>{handle.name}</b> {perm === 'granted' ? <span className="tag tag-ok">được ghi</span> : <span className="tag tag-warn">cần cấp lại quyền</span>}</span> : <span className="text-[13px] text-mut">Chưa chọn thư mục.</span>}
          <button className="btn btn-sm" onClick={async () => { const r = await pickHandoffDir(); if (r.ok) toast.ok('Đã chọn thư mục giao việc', r.name); else if (r.message) toast.warn('Thư mục giao việc', r.message); }}>{handle ? 'Đổi thư mục' : 'Chọn thư mục'}</button>
          {handle && perm !== 'granted' && <button className="btn btn-ghost btn-sm" onClick={async () => setPerm(await dirPermission(handle, true))}>Cấp lại quyền</button>}
          {handle && <button className="btn btn-ghost btn-sm" onClick={() => void clearHandoffDir()}>Bỏ thư mục</button>}
        </div>
      )}
    </Section>
  );
}
