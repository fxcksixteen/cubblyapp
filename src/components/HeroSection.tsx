import { useEffect, useRef, useState, useMemo } from "react";
import { Monitor, Apple, Download } from "lucide-react";

const HeroSection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Video ping-pong: play forward, then reverse, loop
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      if (video.playbackRate > 0) {
        // Just finished forward — reverse
        // playbackRate negative isn't universally supported,
        // so we'll use a different approach: seek backward manually
        reversePlay(video);
      }
    };

    video.addEventListener("ended", handleEnded);
    video.playbackRate = 1;
    video.play().catch(() => {});

    return () => video.removeEventListener("ended", handleEnded);
  }, []);

  const reversePlay = (video: HTMLVideoElement) => {
    const fps = 30;
    const interval = 1000 / fps;
    const timer = setInterval(() => {
      if (video.currentTime <= 0.05) {
        clearInterval(timer);
        video.currentTime = 0;
        video.playbackRate = 1;
        video.play().catch(() => {});
        return;
      }
      video.currentTime = Math.max(0, video.currentTime - interval / 1000);
    }, interval);
  };

  const osInfo = useMemo(() => {
    const ua = navigator.userAgent;
    if (ua.includes("Win")) return { name: "Windows", icon: <Monitor className="w-4 h-4" /> };
    if (ua.includes("Mac")) return { name: "macOS", icon: <Apple className="w-4 h-4" /> };
    if (ua.includes("Linux")) return { name: "Linux", icon: <Monitor className="w-4 h-4" /> };
    return { name: "Desktop", icon: <Download className="w-4 h-4" /> };
  }, []);

  return (
    <section className="relative w-full h-screen overflow-hidden">
      {/* Video Background */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
        preload="auto"
      >
        <source src="/hero-bg.webm" type="video/webm" />
      </video>

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-[hsl(var(--background)/0.4)]" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full gap-10 px-4">
        <h1 className="font-display text-7xl md:text-8xl lg:text-9xl tracking-tight text-foreground drop-shadow-2xl select-none">
          Cubbly
        </h1>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <a
            href="#"
            className="flex items-center gap-2.5 rounded-full bg-foreground px-7 py-3.5 text-base font-bold text-background transition-all hover:scale-105 hover:shadow-xl hover:shadow-[hsl(var(--hero-glow)/0.3)] font-body"
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
