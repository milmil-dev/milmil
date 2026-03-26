import { createFileRoute, redirect } from '@tanstack/react-router';
import { useAuthStore } from '../store/auth-store';
import { LoginPage } from '../pages/LoginPage';

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    if (useAuthStore.getState().token) throw redirect({ to: '/' });
  },
  component: LoginPage,
});
