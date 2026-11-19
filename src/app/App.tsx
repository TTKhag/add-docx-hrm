import { Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { requestPersistentStorage } from '@/db/schema';
import { BackupPage } from '@/modules/backup';
import { CatalogPage } from '@/modules/catalog';
import { ProjectsPage } from '@/modules/projects';
import { NewSessionPage, SessionPage, SessionsPage } from '@/modules/sessions';
import { SkillPage } from '@/modules/skill';
import { ErrorBoundary, Spinner } from '@/shared/components/ui';
import { installAgentBridge } from './agentBridge';
import { Layout } from './Layout';

const guard = (name: string, el: React.ReactNode) => <ErrorBoundary name={name}>{el}</ErrorBoundary>;

export default function App() {
  useEffect(() => {
    installAgentBridge();
    void requestPersistentStorage();
  }, []);
  return (
    <HashRouter>
      <Layout>
        <Suspense fallback={<div className="py-10"><Spinner label="Đang tải" /></div>}>
          <Routes>
            <Route path="/" element={guard('Phiên làm việc', <SessionsPage />)} />
            <Route path="/phien/moi" element={guard('Tải văn bản', <NewSessionPage />)} />
            <Route path="/phien/:id" element={guard('Phiên', <SessionPage />)} />
            <Route path="/phien/:id/:tab" element={guard('Phiên', <SessionPage />)} />
            <Route path="/du-an" element={guard('Hồ sơ dự án', <ProjectsPage />)} />
            <Route path="/danh-muc" element={guard('Danh mục trường', <CatalogPage />)} />
            <Route path="/claude" element={guard('Cài vào Claude', <SkillPage />)} />
            <Route path="/sao-luu" element={guard('Sao lưu', <BackupPage />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </HashRouter>
  );
}
