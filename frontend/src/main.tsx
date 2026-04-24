import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext';
import { FeatureSettingsProvider } from './context/FeatureSettingsContext';
import { App } from './App';
import { installDesktopBridge } from './utils/desktopBridge';
import './index.css';
import './styles/theme.css';
import 'react-toastify/dist/ReactToastify.css';

installDesktopBridge();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      retry: 1,
      refetchInterval: 10_000,
      refetchIntervalInBackground: true,
    },
  },
});

if (typeof window !== 'undefined') {
  window.addEventListener('cluster:switched', () => {
    queryClient.clear();
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FeatureSettingsProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ThemeProvider>
    </FeatureSettingsProvider>
  </React.StrictMode>
);
