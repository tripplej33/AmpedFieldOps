// This file is no longer used - all setup options are now in Settings page
// Redirect to settings if anyone visits /setup
import { Navigate } from 'react-router-dom';

export default function Setup() {
  return <Navigate to="/settings" replace />;
}
