import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";

const Index = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#313338]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/@me" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
    </div>
  );
};

export default Index;
