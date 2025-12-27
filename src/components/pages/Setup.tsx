import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  SelectValue 
} from '@/components/ui/select';
import { Zap, User, Building2, Link2, CheckCircle, Upload, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const timezones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const steps = [
  { id: 1, title: 'Admin Account', icon: User },
  { id: 2, title: 'Company Setup', icon: Building2 },
  { id: 3, title: 'Xero Integration', icon: Link2 },
  { id: 4, title: 'Complete', icon: CheckCircle },
];

export default function Setup() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Admin
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [adminName, setAdminName] = useState('');

  // Step 2: Company
  const [companyName, setCompanyName] = useState('AmpedFieldOps');
  const [timezone, setTimezone] = useState('America/New_York');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Step 3: Xero
  const [xeroConnected, setXeroConnected] = useState(false);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const status = await api.getSetupStatus();
      if (status.completed) {
        navigate('/');
      } else if (status.step) {
        setCurrentStep(status.step);
      }
    } catch (error) {
      // Setup not started, stay on step 1
    }
  };

  const handleStep1Submit = async () => {
    if (adminPassword !== adminConfirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (adminPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await api.setupAdmin({
        email: adminEmail,
        password: adminPassword,
        name: adminName,
        company_name: companyName,
        timezone
      });
      setCurrentStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to create admin account');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStep2Submit = async () => {
    setError('');
    setIsLoading(true);

    try {
      if (logoFile) {
        await api.uploadLogo(logoFile);
      }
      await api.setupCompany({ company_name: companyName, timezone });
      setCurrentStep(3);
    } catch (err: any) {
      setError(err.message || 'Failed to save company details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleXeroConnect = async () => {
    try {
      const { url, configured } = await api.getXeroAuthUrl();
      if (configured && url) {
        window.location.href = url;
      } else {
        setError('Xero is not configured. Please add XERO_CLIENT_ID and XERO_CLIENT_SECRET to your environment.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    setError('');
    try {
      await api.completeSetup();
      // Force navigation to dashboard after marking setup complete
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-xl bg-electric flex items-center justify-center mb-4">
            <Zap className="w-10 h-10 text-background" />
          </div>
          <h1 className="text-3xl font-bold text-electric">AmpedFieldOps Setup</h1>
          <p className="text-sm text-muted-foreground mt-2">Let's get you started</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                currentStep > step.id 
                  ? "bg-voltage border-voltage text-background" 
                  : currentStep === step.id 
                    ? "bg-electric border-electric text-background"
                    : "border-muted text-muted-foreground"
              )}>
                {currentStep > step.id ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <step.icon className="w-5 h-5" />
                )}
              </div>
              {index < steps.length - 1 && (
                <div className={cn(
                  "w-16 h-0.5 mx-2",
                  currentStep > step.id ? "bg-voltage" : "bg-muted"
                )} />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <Card className="p-8 bg-card border-border">
          {/* Error */}
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Step 1: Admin Account */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-xl font-bold mb-2">Create Admin Account</h2>
              <p className="text-sm text-muted-foreground mb-6">Set up your administrator credentials</p>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="name" className="font-mono text-xs uppercase tracking-wider">
                    Full Name
                  </Label>
                  <Input
                    id="name"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="John Smith"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="email" className="font-mono text-xs uppercase tracking-wider">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@company.com"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="password" className="font-mono text-xs uppercase tracking-wider">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="confirmPassword" className="font-mono text-xs uppercase tracking-wider">
                    Confirm Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-2"
                  />
                </div>

                <Button
                  onClick={handleStep1Submit}
                  disabled={isLoading || !adminEmail || !adminPassword || !adminName}
                  className="w-full bg-electric text-background hover:bg-electric/90"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Continue <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Company Setup */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-xl font-bold mb-2">Company Setup</h2>
              <p className="text-sm text-muted-foreground mb-6">Customize your workspace</p>

              <div className="space-y-6">
                {/* Logo Upload */}
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider">
                    Company Logo (Optional)
                  </Label>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="w-20 h-20 rounded-lg bg-muted/30 border-2 border-dashed border-muted flex items-center justify-center overflow-hidden">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <Upload className="w-8 h-8 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <input
                        type="file"
                        id="logo"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('logo')?.click()}
                      >
                        Upload Logo
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG, or SVG. Max 5MB.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="companyName" className="font-mono text-xs uppercase tracking-wider">
                    Company Name
                  </Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Your Company Name"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider">
                    Timezone
                  </Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timezones.map((tz) => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(1)}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button
                    onClick={handleStep2Submit}
                    disabled={isLoading || !companyName}
                    className="flex-1 bg-electric text-background hover:bg-electric/90"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Continue <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Xero Integration */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-xl font-bold mb-2">Xero Integration</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Connect to Xero for invoicing and accounting integration (optional)
              </p>

              <div className="space-y-6">
                {xeroConnected ? (
                  <div className="p-4 rounded-lg bg-voltage/10 border border-voltage/30">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-voltage" />
                      <span className="font-medium text-voltage">Xero Connected</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-lg bg-muted/30 border border-border text-center">
                    <Link2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground mb-4">
                      Connect your Xero account to sync invoices, quotes, and contacts
                    </p>
                    <Button
                      onClick={handleXeroConnect}
                      variant="outline"
                      className="border-electric text-electric hover:bg-electric/10"
                    >
                      Connect to Xero
                    </Button>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(2)}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button
                    onClick={() => setCurrentStep(4)}
                    className="flex-1 bg-electric text-background hover:bg-electric/90"
                  >
                    {xeroConnected ? 'Continue' : 'Skip for now'} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {currentStep === 4 && (
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-voltage/20 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-voltage" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Setup Complete!</h2>
              <p className="text-muted-foreground mb-8">
                You're all set to start using AmpedFieldOps. Let's get to work!
              </p>

              <Button
                onClick={handleComplete}
                disabled={isLoading}
                className="bg-electric text-background hover:bg-electric/90 glow-primary"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Go to Dashboard'
                )}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
