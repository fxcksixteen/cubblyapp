import shopIcon from "@/assets/icons/shop.svg";

const ShopView = () => {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center px-8">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#5865f2]/10">
        <img src={shopIcon} alt="Shop" className="h-10 w-10" style={{ filter: "brightness(0) saturate(100%) invert(39%) sepia(52%) saturate(2878%) hue-rotate(222deg) brightness(101%) contrast(91%)" }} />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Shop</h2>
      <p className="text-sm text-[#949ba4] max-w-md">
        The Cubbly Shop is coming soon. Stay tuned for profile decorations, themes, and more!
      </p>
    </div>
  );
};

export default ShopView;
