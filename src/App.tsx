import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { VoiceProvider } from "@/contexts/VoiceContext";
import { GroupCallProvider } from "@/contexts/GroupCallContext";
import { ActivityProvider } from "@/contexts/ActivityContext";
import { GamingModeProvider } from "@/contexts/GamingModeContext";
import { CoinsProvider } from "@/contexts/CoinsContext";
import { NameColorsProvider } from "@/contexts/NameColorsContext";
import { UserBadgesProvider } from "@/contexts/UserBadgesContext";
import { NameColorsStyles } from "@/components/app/UserDisplayName";
import CoinTrackingBridge from "@/components/app/CoinTrackingBridge";
import EquippedThemeBridge from "@/components/app/EquippedThemeBridge";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Register from "./pages/Register.tsx";
import AppLayout from "./pages/AppLayout.tsx";
import NotFound from "./pages/NotFound.tsx";
import UpdateModal from "./components/app/UpdateModal";
import WhatsNewModal from "./components/app/WhatsNewModal";
import GlobalCallIndicator from "./components/app/GlobalCallIndicator";
import { GroupIncomingCallOverlay } from "./components/app/GroupCallPanel";
import SpaceBackground from "./components/app/SpaceBackground";

const queryClient = new QueryClient();

const isElectron = typeof window !== 'undefined' && navigator.userAgent.includes('Electron');
const Router = isElectron ? HashRouter : BrowserRouter;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Router>
        <AuthProvider>
          <VoiceProvider>
            <GroupCallProvider>
            <ActivityProvider>
              <GamingModeProvider>
              <CoinsProvider>
              <NameColorsProvider>
              <NameColorsStyles />
              <CoinTrackingBridge />
              <EquippedThemeBridge />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route
                  path="/@me/*"
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
              <UpdateModal />
              <WhatsNewModal />
              <GlobalCallIndicator />
              <GroupIncomingCallOverlay />
              <SpaceBackground />
              </NameColorsProvider>
              </CoinsProvider>
              </GamingModeProvider>
            </ActivityProvider>
            </GroupCallProvider>
          </VoiceProvider>
        </AuthProvider>
      </Router>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
