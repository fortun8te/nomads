import { CampaignProvider } from './context/CampaignContext';
import { ThemeProvider } from './context/ThemeContext';
import { Dashboard } from './components/Dashboard';
import ForzaXLanding from './components/ForzaXLanding';
import { OllamaConnectionManager } from './components/OllamaConnectionManager';
import { useOllamaDiscovery } from './hooks/useOllamaDiscovery';

const SHOW_FORZAX = new URLSearchParams(window.location.search).has('forzax');

function AppContent() {
  // Auto-discover Ollama on mount
  useOllamaDiscovery();

  if (SHOW_FORZAX) {
    return <ForzaXLanding />;
  }
  return (
    <ThemeProvider>
      <CampaignProvider>
        <Dashboard />
        <OllamaConnectionManager />
      </CampaignProvider>
    </ThemeProvider>
  );
}

function App() {
  return <AppContent />;
}

export default App;
