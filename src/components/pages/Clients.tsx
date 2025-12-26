import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { Client } from '@/types';
import { Search, Plus, Phone, Mail, MapPin, Clock, Briefcase, Loader2 } from 'lucide-react';

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

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
          <Button className="bg-electric text-background hover:bg-electric/90 glow-primary">
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
    </>
  );
}
