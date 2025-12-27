import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { Client } from '@/types';
import { Search, Plus, Phone, Mail, MapPin, Clock, Briefcase, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    contact_name: '',
    email: '',
    phone: '',
    location: '',
    notes: '',
  });

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const data = await api.getClients({ search: searchQuery || undefined });
      setClients(data);
    } catch (error) {
      console.error('Failed to load clients:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateClient = () => {
    setCreateModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.email) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createClient(formData);
      toast.success('Client created successfully');
      setCreateModalOpen(false);
      setFormData({
        name: '',
        contact_name: '',
        email: '',
        phone: '',
        location: '',
        notes: '',
      });
      loadClients();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create client');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredClients = clients.filter((client) =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (client.contact_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (client.location || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <>
        <Header title="Client Directory" subtitle="Manage client relationships and contacts" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-electric" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Client Directory" subtitle="Manage client relationships and contacts" />

      <div className="p-8 max-w-[1400px] mx-auto">
        {/* Search & Actions */}
        <div className="mb-6 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search clients by name, contact, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted/50 border-border focus:border-electric focus:glow-primary"
            />
          </div>
          <Button 
            className="bg-electric text-background hover:bg-electric/90 glow-primary"
            onClick={handleCreateClient}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Client
          </Button>
        </div>

        {/* Clients Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map((client) => (
            <Card
              key={client.id}
              className="p-6 bg-card border-border hover:border-electric transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg text-foreground group-hover:text-electric transition-colors">
                    {client.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">{client.contact_name}</p>
                </div>
                <Badge
                  variant={client.status === 'active' ? 'default' : 'secondary'}
                  className={client.status === 'active' ? 'bg-voltage/20 text-voltage border-voltage/30' : ''}
                >
                  {client.status}
                </Badge>
              </div>

              <div className="space-y-3 mb-5">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground truncate">{client.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground font-mono">{client.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground">{client.location}</span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/30">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Briefcase className="w-3 h-3 text-electric" />
                  </div>
                  <p className="text-lg font-bold font-mono text-foreground">{client.active_projects || 0}</p>
                  <p className="text-xs text-muted-foreground">Projects</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Clock className="w-3 h-3 text-electric" />
                  </div>
                  <p className="text-lg font-bold font-mono text-foreground">{client.total_hours || 0}</p>
                  <p className="text-xs text-muted-foreground">Hours</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Last Contact</p>
                  <p className="text-xs font-mono text-foreground">
                    {client.last_contact ? new Date(client.last_contact).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    }) : '-'}
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs">
                  View Details
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-xs">
                  New Project
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {filteredClients.length === 0 && (
          <Card className="p-12 text-center bg-card border-border">
            <p className="text-muted-foreground">No clients found matching your search.</p>
          </Card>
        )}
      </div>

      {/* Create Client Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-[600px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Create New Client</DialogTitle>
            <DialogDescription>Add a new client to your directory</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="client_name" className="font-mono text-xs uppercase tracking-wider">
                Company Name *
              </Label>
              <Input
                id="client_name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="ABC Construction Ltd"
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="contact_name" className="font-mono text-xs uppercase tracking-wider">
                Contact Name
              </Label>
              <Input
                id="contact_name"
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                placeholder="John Smith"
                className="mt-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email" className="font-mono text-xs uppercase tracking-wider">
                  Email *
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contact@company.com"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="phone" className="font-mono text-xs uppercase tracking-wider">
                  Phone
                </Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="555-1234"
                  className="mt-2"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="location" className="font-mono text-xs uppercase tracking-wider">
                Location
              </Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Auckland, New Zealand"
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="notes" className="font-mono text-xs uppercase tracking-wider">
                Notes
              </Label>
              <Textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional information..."
                className="mt-2 min-h-[100px]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => setCreateModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-electric text-background hover:bg-electric/90"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Client'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
