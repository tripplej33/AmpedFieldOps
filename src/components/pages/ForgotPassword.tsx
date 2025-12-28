import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap, Loader2, ArrowLeft, Mail } from 'lucide-react';
import { toast } from 'sonner';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Check if we have a token in URL
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('token');

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await api.forgotPassword(email);
      setIsSubmitted(true);
      toast.success('If an account exists, a reset link will be sent');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = resetToken || tokenFromUrl;
    
    if (!token) {
      toast.error('Reset token is required');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    
    setIsResetting(true);
    try {
      await api.resetPassword(token, newPassword);
      toast.success('Password reset successful. You can now log in.');
      navigate('/login');
    } catch (error: any) {
      toast.error(error.message || 'Failed to reset password');
    } finally {
      setIsResetting(false);
    }
  };

  // If we have a token, show reset form
  if (tokenFromUrl || resetToken) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 bg-card border-border">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-xl bg-electric flex items-center justify-center mb-4">
              <Zap className="w-10 h-10 text-background" />
            </div>
            <h1 className="text-2xl font-bold text-electric">Reset Password</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your new password</p>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-4">
            {!tokenFromUrl && (
              <div>
                <Label htmlFor="token" className="font-mono text-xs uppercase tracking-wider">
                  Reset Token
                </Label>
                <Input
                  id="token"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Enter reset token from email"
                  className="mt-2 font-mono text-sm"
                  required
                />
              </div>
            )}

            <div>
              <Label htmlFor="newPassword" className="font-mono text-xs uppercase tracking-wider">
                New Password
              </Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="mt-2"
                required
                minLength={8}
              />
            </div>

            <div>
              <Label htmlFor="confirmPassword" className="font-mono text-xs uppercase tracking-wider">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-2"
                required
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive mt-1">Passwords do not match</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isResetting || !newPassword || !confirmPassword}
              className="w-full bg-electric text-background hover:bg-electric/90"
            >
              {isResetting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset Password'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-electric hover:underline flex items-center justify-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Show forgot password form
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 bg-card border-border">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-xl bg-electric flex items-center justify-center mb-4">
            <Zap className="w-10 h-10 text-background" />
          </div>
          <h1 className="text-2xl font-bold text-electric">Forgot Password</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter your email to receive a reset link</p>
        </div>

        {isSubmitted ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-voltage/10 border border-voltage/20">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-voltage" />
                <div>
                  <p className="text-sm font-semibold">Check your email</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    If an account exists with that email, you'll receive a password reset link.
                  </p>
                </div>
              </div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                Note: In development mode, the reset token is logged to the console.
              </p>
              <Button
                onClick={() => {
                  setIsSubmitted(false);
                  setEmail('');
                }}
                variant="outline"
                className="w-full"
              >
                Send another email
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <Label htmlFor="email" className="font-mono text-xs uppercase tracking-wider">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="mt-2"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-electric text-background hover:bg-electric/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm text-electric hover:underline flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>
        </div>
      </Card>
    </div>
  );
}

