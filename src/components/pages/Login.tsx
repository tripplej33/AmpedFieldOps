import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap, Eye, EyeOff, Loader2, Database, Link2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [branding, setBranding] = useState<{ company_name: string; company_logo: string | null }>({
    company_name: 'AmpedFieldOps',
    company_logo: null
  });
  const [healthStatus, setHealthStatus] = useState<{
    database: { healthy: boolean; status: string };
    xero: { configured: boolean; connected: boolean; status: string };
  } | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const loadBranding = async () => {
      try {
        const data = await api.getBranding();
        setBranding(data);
      } catch (error) {
        // Use defaults
      }
    };
    loadBranding();
  }, []);

  useEffect(() => {
    const loadHealthStatus = async () => {
      try {
        const status = await api.getHealthStatus() as any;
        setHealthStatus({
          database: {
            healthy: status.database === 'connected',
            status: status.database || 'unknown'
          },
          xero: {
            configured: status.xero?.configured || false,
            connected: status.xero?.connected || false,
            status: status.xero?.connected ? 'connected' : status.xero?.configured ? 'not_connected' : 'not_configured'
          }
        });
      } catch (error) {
        // Health check failed, show as unhealthy
        setHealthStatus({
          database: { healthy: false, status: 'unknown' },
          xero: { configured: false, connected: false, status: 'unknown' }
        });
      }
    };
    loadHealthStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 bg-card border-border">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          {branding.company_logo ? (
            <img 
              src={branding.company_logo} 
              alt={branding.company_name}
              className="h-16 w-auto mb-4"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-electric flex items-center justify-center mb-4">
              <Zap className="w-10 h-10 text-background" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-electric">{branding.company_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email" className="font-mono text-xs uppercase tracking-wider">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="mt-2 focus:border-electric focus:glow-primary"
            />
          </div>

          <div>
            <Label htmlFor="password" className="font-mono text-xs uppercase tracking-wider">
              Password
            </Label>
            <div className="relative mt-2">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="pr-10 focus:border-electric focus:glow-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Link 
              to="/forgot-password" 
              className="text-sm text-electric hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-electric text-background hover:bg-electric/90 glow-primary"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>

        {/* Status Indicators */}
        {healthStatus && (
          <div className="mt-6 pt-6 border-t border-border">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Database className="w-3 h-3" />
                  <span className="font-mono uppercase tracking-wider">Database</span>
                </div>
                <div className="flex items-center gap-2">
                  {healthStatus.database.healthy ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-voltage" />
                      <span className="text-voltage font-mono">Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3 text-destructive" />
                      <span className="text-destructive font-mono">Disconnected</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Link2 className="w-3 h-3" />
                  <span className="font-mono uppercase tracking-wider">Xero</span>
                </div>
                <div className="flex items-center gap-2">
                  {healthStatus.xero.status === 'connected' ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-voltage" />
                      <span className="text-voltage font-mono">Connected</span>
                    </>
                  ) : healthStatus.xero.status === 'not_connected' ? (
                    <>
                      <XCircle className="w-3 h-3 text-warning" />
                      <span className="text-warning font-mono">Not Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground font-mono">Not Configured</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Version */}
        <p className="mt-6 text-center text-xs font-mono text-muted-foreground">
          v2.0.0
        </p>
      </Card>
    </div>
  );
}
