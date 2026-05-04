import { useNavigate } from "react-router-dom";
import { useCoins } from "@/contexts/CoinsContext";
import coinStack from "@/assets/coins/coin-stack.png";

/** Compact coin balance pill — clicking jumps to the shop. */
const CoinPill = ({ size = "md" }: { size?: "sm" | "md" }) => {
  const { balance, loading } = useCoins();
  const navigate = useNavigate();
  const isSm = size === "sm";

  return (
    <button
      onClick={() => navigate("/@me/shop")}
      title="Open shop"
      className={`group flex items-center gap-1.5 rounded-full transition-all hover:brightness-110 ${
        isSm ? "px-1.5 py-0.5" : "px-2 py-1"
      }`}
      style={{
        backgroundColor: "var(--app-bg-tertiary, #1e1f22)",
        border: "1px solid var(--app-border, #3f4147)",
      }}
    >
      <img
        src={coinStack}
        alt=""
        className={`shrink-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-transform group-hover:scale-110 ${
          isSm ? "h-4 w-4" : "h-5 w-5"
        }`}
      />
      <span
        className={`font-extrabold tabular-nums ${isSm ? "text-[11px]" : "text-[13px]"}`}
        style={{ color: "#facc15" }}
      >
        {loading ? "—" : balance.toLocaleString()}
      </span>
    </button>
  );
};

export default CoinPill;
