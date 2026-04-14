import { useEffect, useRef, useMemo } from "react";
import { Monitor, Apple, Download } from "lucide-react";

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
          Your <span className="text-primary drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)]" style={{ color: 'hsl(32, 80%, 42%)' }}>cozy</span> corner<br />of the internet.
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
      </div>
    </section>
  );
};

export default HeroSection;
