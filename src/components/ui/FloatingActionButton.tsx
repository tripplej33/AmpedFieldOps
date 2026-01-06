import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MobileTimesheetModal from '@/components/modals/MobileTimesheetModal';

export default function FloatingActionButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-electric text-background hover:bg-electric/90 glow-primary shadow-lg hover:shadow-xl transition-all z-40"
      >
        <Plus className="w-6 h-6" />
      </Button>

      <MobileTimesheetModal open={open} onOpenChange={setOpen} />
    </>
  );
}
