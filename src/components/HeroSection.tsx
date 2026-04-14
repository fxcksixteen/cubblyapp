import { useEffect, useRef, useMemo } from "react";
import { Monitor, Apple, Download } from "lucide-react";

const APP_VERSION = "0.1.0";

const HeroSection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.loop = true;
    video.play().catch(() => {});
  }, []);

  const osInfo = useMemo(() => {
    const ua = navigator.userAgent;
    if (ua.includes("Win")) return { name: "Windows", icon: <Monitor className="w-4 h-4" /> };
    if (ua.includes("Mac")) return { name: "macOS", icon: <Apple className="w-4 h-4" /> };
    if (ua.includes("Linux")) return { name: "Linux", icon: <Monitor className="w-4 h-4" /> };
    return { name: "Desktop", icon: <Download className="w-4 h-4" /> };
  }, []);

  return (
    <section className="relative w-full h-screen overflow-hidden bg-background">
      {/* Video Background — no overlay, uncropped */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
        preload="auto"
      >
        <source src="/hero-bg-new.webm" type="video/webm" />
      </video>

      {/* Content — positioned toward top */}
      <div className="relative z-10 flex flex-col items-center pt-56 gap-6 px-4">
        <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground drop-shadow-2xl select-none text-center">
          Your <span style={{ color: 'hsl(32, 80%, 42%)', textShadow: '2px 2px 0px hsl(32, 80%, 25%)' }}>cozy</span> corner<br />of the internet.
        </h1>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <a
            href="#"
            className="flex items-center gap-2.5 rounded-full bg-foreground px-7 py-3.5 text-base font-semibold text-background transition-all hover:scale-105 hover:shadow-xl hover:shadow-[hsl(var(--hero-glow)/0.3)] font-body"
          >
            {osInfo.icon}
            Download for {osInfo.name}
          </a>
          <a
            href="https://web.cubbly.app"
            className="btn-fill relative flex items-center gap-2 rounded-full border border-foreground/30 bg-foreground/10 px-7 py-3.5 text-base font-semibold text-foreground backdrop-blur-sm transition-all overflow-hidden font-body"
          >
            <span className="relative z-10">Open in Browser</span>
          </a>
        </div>

        <p className="text-xs opacity-30 font-light tracking-wide select-none" style={{ fontFamily: "'Poppins', sans-serif" }}>
          v{APP_VERSION} · pre-alpha
        </p>
      </div>
    </section>
  );
};

export default HeroSection;
