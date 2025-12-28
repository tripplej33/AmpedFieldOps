import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, X, Briefcase, Users, Clock, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import NotificationsPanel from '@/components/modals/NotificationsPanel';
import ErrorLogPanel from '@/components/modals/ErrorLogPanel';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (searchQuery.length < 2) {
      setSearchResults(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await api.search(searchQuery);
        setSearchResults(results);
        setShowResults(true);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setShowResults(false);
  };

  const hasResults = searchResults && (
    searchResults.clients?.length > 0 ||
    searchResults.projects?.length > 0 ||
    searchResults.timesheets?.length > 0
  );

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <div className="flex items-center justify-between px-4 lg:px-8 py-4">
        <div className="pl-12 lg:pl-0">
          <h1 className="text-xl lg:text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2 lg:gap-4">
          {/* Search with dropdown results */}
          <div className="relative hidden md:block" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search projects, clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults && setShowResults(true)}
              className="pl-9 pr-9 w-60 lg:w-80 bg-muted/50 border-border focus:border-electric focus:glow-primary"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
            )}
            {searchQuery && !isSearching && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Search Results Dropdown */}
            {showResults && searchResults && (
              <Card className="absolute top-full left-0 right-0 mt-2 max-h-96 overflow-y-auto bg-card border-border shadow-lg z-50">
                {!hasResults ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    No results found
                  </div>
                ) : (
                  <div className="p-2">
                    {/* Clients */}
                    {searchResults.clients?.length > 0 && (
                      <div className="mb-2">
                        <p className="px-2 py-1 text-xs font-mono text-muted-foreground uppercase">Clients</p>
                        {searchResults.clients.slice(0, 3).map((client: any) => (
                          <button
                            key={client.id}
                            onClick={() => {
                              navigate(`/clients?id=${client.id}`);
                              handleClearSearch();
                            }}
                            className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-muted/50 text-left"
                          >
                            <Users className="w-4 h-4 text-electric" />
                            <div>
                              <p className="text-sm font-medium">{client.name}</p>
                              <p className="text-xs text-muted-foreground">{client.contact_name}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Projects */}
                    {searchResults.projects?.length > 0 && (
                      <div className="mb-2">
                        <p className="px-2 py-1 text-xs font-mono text-muted-foreground uppercase">Projects</p>
                        {searchResults.projects.slice(0, 3).map((project: any) => (
                          <button
                            key={project.id}
                            onClick={() => {
                              navigate(`/projects?id=${project.id}`);
                              handleClearSearch();
                            }}
                            className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-muted/50 text-left"
                          >
                            <Briefcase className="w-4 h-4 text-electric" />
                            <div>
                              <p className="text-sm font-medium">{project.name}</p>
                              <p className="text-xs text-muted-foreground">{project.code} • {project.client_name}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Timesheets */}
                    {searchResults.timesheets?.length > 0 && (
                      <div>
                        <p className="px-2 py-1 text-xs font-mono text-muted-foreground uppercase">Timesheets</p>
                        {searchResults.timesheets.slice(0, 3).map((entry: any) => (
                          <button
                            key={entry.id}
                            onClick={() => {
                              navigate(`/timesheets?id=${entry.id}`);
                              handleClearSearch();
                            }}
                            className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-muted/50 text-left"
                          >
                            <Clock className="w-4 h-4 text-electric" />
                            <div>
                              <p className="text-sm font-medium">{entry.project_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {entry.date} • {entry.hours}h
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Notifications */}
          <NotificationsPanel />

          {/* Error Logs (Admin only) */}
          {user?.role === 'admin' && <ErrorLogPanel />}

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <User className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user?.name || 'User'}</p>
                  <p className="text-xs text-muted-foreground font-mono">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings')}>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={logout}>
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
