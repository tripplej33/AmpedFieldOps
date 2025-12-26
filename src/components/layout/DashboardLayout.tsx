import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import FloatingActionButton from '@/components/ui/FloatingActionButton';

export default function DashboardLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
      <FloatingActionButton />
    </div>
  );
}
