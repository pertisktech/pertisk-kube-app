import { FormEvent, useState } from 'react';
import { Moon, Shield, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { setAuth } from '../utils/auth';
import { APP_VERSION } from '../utils/version';
import styles from './LoginPage.module.css';

interface LoginPageProps {
  onLogin: () => void;
}

export const LoginPage = ({ onLogin }: LoginPageProps) => {
  const theme = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setError('Invalid username or password');
        return;
      }

      const data = await response.json() as { success: boolean; token?: string };
      
      if (data.success && data.token) {
        setAuth(data.token, username);
        onLogin();
      } else {
        setError('Login failed');
      }
    } catch {
      setError('Unable to login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.topBar}>
        <span className={styles.topBarSpacer} />
        {theme && (
          <button
            type="button"
            className={styles.themeToggle}
            onClick={theme.toggleTheme}
            title={theme.isDark ? 'Light mode' : 'Dark mode'}
            aria-label={theme.isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme.isDark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
            <span className={styles.themeToggleLabel}>{theme.isDark ? 'Light' : 'Dark'}</span>
          </button>
        )}
      </header>

      <div className={styles.brand}>
        <img src="/favicon.svg" alt="" className={styles.brandLogo} width={48} height={48} />
        <span className={styles.brandName}>Pertisk Kube</span>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h1 className={styles.title}>
            <Shield size={20} aria-hidden /> Welcome Back
          </h1>
          <p className={styles.subtitle}>Sign in to manage your Kubernetes dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Username
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={styles.input}
              placeholder="Enter username"
              required
            />
          </label>

          <label className={styles.label}>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={styles.input}
              placeholder="Enter password"
              required
            />
          </label>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} className={styles.button}>
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>
      </div>

      <footer className={styles.footer}>
        <p className={styles.version}>Pertisk Kube v{APP_VERSION}</p>
      </footer>
    </div>
  );
};
