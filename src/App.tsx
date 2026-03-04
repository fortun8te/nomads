import { CampaignProvider } from './context/CampaignContext';
import { ThemeProvider } from './context/ThemeContext';
import { OllamaProvider } from './context/OllamaContext';
import { Dashboard } from './components/Dashboard';
import ForzaXLanding from './components/ForzaXLanding';
import { OllamaConnectionManager } from './components/OllamaConnectionManager';

const SHOW_FORZAX = new URLSearchParams(window.location.search).has('forzax');

function AppContent() {
  if (SHOW_FORZAX) {
    return <ForzaXLanding />;
  }
  return (
    <OllamaProvider>
      <ThemeProvider>
        <CampaignProvider>
          <Dashboard />
          <OllamaConnectionManager />
        </CampaignProvider>
      </ThemeProvider>
    </OllamaProvider>
  );
}

function App() {
  return <AppContent />;
}

export default App;
