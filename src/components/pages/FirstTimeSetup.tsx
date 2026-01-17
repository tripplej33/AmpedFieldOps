import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Zap, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type SetupStep = 'welcome' | 'company' | 'profile' | 'complete';

interface CompanyData {
  name: string;
  timezone: string;
  industry: string;
}

export default function FirstTimeSetup() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [isLoading, setIsLoading] = useState(false);
  const [companyData, setCompanyData] = useState<CompanyData>({
    name: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    industry: '',
  });
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    avatar: '',
  });

  // Redirect if not first-time setup or not authenticated
  useEffect(() => {
    if (!user || !user.isFirstTimeSetup) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleCompanySubmit = async () => {
    if (!companyData.name.trim()) {
      toast.error('Please enter a company name');
      return;
    }

    setIsLoading(true);
    try {
      // Save company data to app_settings or users table
      // For now, we'll store in users table as company context
      const { error } = await supabase
        .from('users')
        .update({ company_name: companyData.name })
        .eq('id', user!.id);

      if (error) throw error;

      toast.success('Company information saved');
      setCurrentStep('profile');
    } catch (error) {
      console.error('Failed to save company data:', error);
      toast.error('Failed to save company information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileSubmit = async () => {
    if (!profileData.name.trim()) {
      toast.error('Please enter your name');
      return;
    }

    setIsLoading(true);
    try {
      // Update user profile
      const { error } = await supabase
        .from('users')
        .update({ 
          name: profileData.name,
          ...(profileData.avatar && { avatar: profileData.avatar })
        })
        .eq('id', user!.id);

      if (error) throw error;

      // Update auth context
      updateUser({
        name: profileData.name,
        avatar: profileData.avatar || undefined,
      });

      toast.success('Profile information saved');
      setCurrentStep('complete');
    } catch (error) {
      console.error('Failed to save profile:', error);
      toast.error('Failed to save profile information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteSetup = async () => {
    setIsLoading(true);
    try {
      // Mark setup as complete via backend (service role)
      await api.request('/api/setup/complete', { method: 'POST' });

      // Update user context
      updateUser({ isFirstTimeSetup: false });

      toast.success('Setup complete! Welcome to AmpedFieldOps');
      navigate('/');
    } catch (error) {
      console.error('Failed to complete setup:', error);
      toast.error('Failed to complete setup');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="font-mono text-electric">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Zap className="w-8 h-8 text-electric" />
            <h1 className="text-3xl font-bold">AmpedFieldOps</h1>
          </div>
          <p className="text-muted-foreground">Let's get your system set up</p>
        </div>

        {/* Progress indicator */}
        <div className="flex gap-2 mb-8 justify-center">
          {(['welcome', 'company', 'profile', 'complete'] as const).map((step, idx) => (
            <div
              key={step}
              className={`h-2 flex-1 rounded-full transition-colors ${
                ['welcome', 'company', 'profile', 'complete'].indexOf(currentStep) >= idx
                  ? 'bg-electric'
                  : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Welcome Step */}
        {currentStep === 'welcome' && (
          <Card className="p-8">
            <h2 className="text-2xl font-bold mb-4">Welcome!</h2>
            <p className="text-muted-foreground mb-6">
              This is your first time here. We'll help you set up AmpedFieldOps in just a few steps.
            </p>
            <div className="space-y-3 mb-8">
              <div className="flex gap-3 items-start">
                <CheckCircle className="w-5 h-5 text-electric flex-shrink-0 mt-0.5" />
                <span>Configure your company details</span>
              </div>
              <div className="flex gap-3 items-start">
                <CheckCircle className="w-5 h-5 text-electric flex-shrink-0 mt-0.5" />
                <span>Set up your admin profile</span>
              </div>
              <div className="flex gap-3 items-start">
                <CheckCircle className="w-5 h-5 text-electric flex-shrink-0 mt-0.5" />
                <span>Start managing your projects</span>
              </div>
            </div>
            <Button 
              onClick={() => setCurrentStep('company')} 
              className="w-full"
              size="lg"
            >
              Get Started <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Card>
        )}

        {/* Company Info Step */}
        {currentStep === 'company' && (
          <Card className="p-8">
            <h2 className="text-2xl font-bold mb-6">Company Information</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCompanySubmit();
              }}
              className="space-y-6"
            >
              <div>
                <Label htmlFor="company-name">Company Name *</Label>
                <Input
                  id="company-name"
                  placeholder="Enter your company name"
                  value={companyData.name}
                  onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                  disabled={isLoading}
                />
              </div>

              <div>
                <Label htmlFor="timezone">Timezone *</Label>
                <Select value={companyData.timezone} onValueChange={(tz) => setCompanyData({ ...companyData, timezone: tz })}>
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">Eastern Time</SelectItem>
                    <SelectItem value="America/Chicago">Central Time</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    <SelectItem value="America/Anchorage">Alaska Time</SelectItem>
                    <SelectItem value="Pacific/Honolulu">Hawaii Time</SelectItem>
                    <SelectItem value="Europe/London">GMT/UK</SelectItem>
                    <SelectItem value="Europe/Paris">CET/Europe</SelectItem>
                    <SelectItem value="Asia/Tokyo">JST/Tokyo</SelectItem>
                    <SelectItem value="Pacific/Auckland">NZST/NZDT (Auckland)</SelectItem>
                    <SelectItem value="Australia/Sydney">AEST/Sydney</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="industry">Industry (Optional)</Label>
                <Select value={companyData.industry} onValueChange={(ind) => setCompanyData({ ...companyData, industry: ind })}>
                  <SelectTrigger id="industry">
                    <SelectValue placeholder="Select your industry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="construction">Construction</SelectItem>
                    <SelectItem value="hvac">HVAC</SelectItem>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="landscaping">Landscaping</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                    <SelectItem value="pest-control">Pest Control</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep('welcome')}
                  className="flex-1"
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Next
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Profile Step */}
        {currentStep === 'profile' && (
          <Card className="p-8">
            <h2 className="text-2xl font-bold mb-6">Admin Profile</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleProfileSubmit();
              }}
              className="space-y-6"
            >
              <div>
                <Label htmlFor="admin-name">Your Name *</Label>
                <Input
                  id="admin-name"
                  placeholder="Enter your name"
                  value={profileData.name}
                  onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                  disabled={isLoading}
                />
              </div>

              <div>
                <Label htmlFor="admin-email">Email (Read-only)</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={user.email}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div>
                <Label htmlFor="avatar-url">Avatar URL (Optional)</Label>
                <Input
                  id="avatar-url"
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  value={profileData.avatar}
                  onChange={(e) => setProfileData({ ...profileData, avatar: e.target.value })}
                  disabled={isLoading}
                />
              </div>

              <div>
                <Label>Your Role</Label>
                <div className="p-3 bg-muted rounded-md text-sm">
                  <span className="font-semibold text-electric">System Administrator</span>
                  <p className="text-muted-foreground mt-1">
                    You have full access to all features and settings
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep('company')}
                  className="flex-1"
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Next
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Complete Step */}
        {currentStep === 'complete' && (
          <Card className="p-8 text-center">
            <div className="flex justify-center mb-6">
              <CheckCircle className="w-16 h-16 text-electric" />
            </div>
            <h2 className="text-2xl font-bold mb-2">You're All Set!</h2>
            <p className="text-muted-foreground mb-8">
              Your AmpedFieldOps system is ready to use. Let's dive in!
            </p>
            <Button 
              onClick={handleCompleteSetup}
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Go to Dashboard
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
