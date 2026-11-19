import { useLiveQuery } from 'dexie-react-hooks';
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
      <PageHeader title="Cài vào Claude" sub="Bộ skill dạy Claude cách làm việc với Studio và EasyHRM. Quy tắc và danh mục vẫn nằm trong Studio." />
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
