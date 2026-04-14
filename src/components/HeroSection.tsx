import { useEffect, useRef, useMemo } from "react";
import { Monitor, Apple, Download } from "lucide-react";

const HeroSection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Play once then pause near end (bear eyes open)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      // Pause a bit before the end so bear's eyes are open
      if (video.duration && video.currentTime >= video.duration - 0.5) {
        video.pause();
        video.removeEventListener("timeupdate", handleTimeUpdate);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.playbackRate = 1;
    video.play().catch(() => {});

    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, []);

  const osInfo = useMemo(() => {
    const ua = navigator.userAgent;
    if (ua.includes("Win")) return { name: "Windows", icon: <Monitor className="w-4 h-4" /> };
    if (ua.includes("Mac")) return { name: "macOS", icon: <Apple className="w-4 h-4" /> };
    if (ua.includes("Linux")) return { name: "Linux", icon: <Monitor className="w-4 h-4" /> };
    return { name: "Desktop", icon: <Download className="w-4 h-4" /> };
  }, []);

  return (
    <section className="relative w-full h-screen overflow-hidden">
      {/* Video Background — no overlay */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
        preload="auto"
      >
        <source src="/hero-bg.webm" type="video/webm" />
      </video>

      {/* Content — positioned toward top center */}
      <div className="relative z-10 flex flex-col items-center pt-36 gap-8 px-4">
        <h1 className="font-display text-7xl md:text-8xl lg:text-9xl tracking-tight text-foreground drop-shadow-2xl select-none text-center">
          Your cozy corner<br />of the internet.
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
            className="flex items-center gap-2 rounded-full border border-foreground/30 bg-foreground/10 px-7 py-3.5 text-base font-semibold text-foreground backdrop-blur-sm transition-all hover:bg-foreground/20 hover:scale-105 font-body"
          >
            Open in Browser
          </a>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
