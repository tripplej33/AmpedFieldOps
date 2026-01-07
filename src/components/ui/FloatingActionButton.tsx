import { useState } from 'react';
import { Plus, Clock, FolderKanban, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MobileTimesheetModal from '@/components/modals/MobileTimesheetModal';
import { useNavigate } from 'react-router-dom';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export default function FloatingActionButton() {
  const [timesheetModalOpen, setTimesheetModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleNewProject = () => {
    setMenuOpen(false);
    navigate('/projects?action=create');
  };

  const handleNewTimesheet = () => {
    setMenuOpen(false);
    setTimesheetModalOpen(true);
  };

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-electric text-background hover:bg-electric/90 glow-primary shadow-lg hover:shadow-xl transition-all z-40"
          >
            {menuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Plus className="w-6 h-6" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          side="top" 
          align="end" 
          className="w-56 p-2 mb-2 mr-2"
        >
          <div className="space-y-1">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-auto py-3"
              onClick={handleNewTimesheet}
            >
              <Clock className="w-5 h-5 text-electric" />
              <div className="flex flex-col items-start">
                <span className="font-semibold">New Timesheet</span>
                <span className="text-xs text-muted-foreground">Log hours worked</span>
              </div>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-auto py-3"
              onClick={handleNewProject}
            >
              <FolderKanban className="w-5 h-5 text-electric" />
              <div className="flex flex-col items-start">
                <span className="font-semibold">New Project</span>
                <span className="text-xs text-muted-foreground">Create a project</span>
              </div>
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <MobileTimesheetModal open={timesheetModalOpen} onOpenChange={setTimesheetModalOpen} />
    </>
  );
}
