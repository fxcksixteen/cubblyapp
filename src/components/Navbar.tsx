import cubblyLogo from "@/assets/cubbly-logo.png";
import cubblyWordmark from "@/assets/cubbly-wordmark.png";

const Navbar = () => {
  return (
    <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-5xl">
      <div className="flex items-center justify-between rounded-full bg-[hsl(var(--navbar-bg))] px-4 py-2.5 shadow-lg shadow-black/10 backdrop-blur-sm">
        {/* Logo + Wordmark */}
        <a href="/" className="flex items-center gap-0 select-none">
          <img src={cubblyLogo} alt="Cubbly" className="h-16 w-16 object-contain" />
          <img src={cubblyWordmark} alt="Cubbly" className="h-16 object-contain" />
        </a>

        {/* CTA */}
        <a
          href="https://web.cubbly.app"
          className="rounded-full bg-[hsl(var(--navbar-foreground))] px-8 py-3.5 text-sm font-bold text-[hsl(var(--navbar-bg))] transition-all hover:opacity-90 font-body"
        >
          Open Cubbly
        </a>
      </div>
    </nav>
  );
};

export default Navbar;
