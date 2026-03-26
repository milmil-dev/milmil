import { createFileRoute, redirect } from '@tanstack/react-router';
import { LoginPage } from '../pages/LoginPage';
import { useAuthStore } from '../store/auth-store';

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    if (useAuthStore.getState().token) throw redirect({ to: '/' });
  },
  component: LoginPage,
});
