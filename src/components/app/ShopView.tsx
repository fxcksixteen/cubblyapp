import { ShoppingBag } from "lucide-react";

const ShopView = () => {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center px-8">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#5865f2]/10">
        <ShoppingBag className="h-10 w-10 text-[#5865f2]" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Shop</h2>
      <p className="text-sm text-[#949ba4] max-w-md">
        The Cubbly Shop is coming soon. Stay tuned for profile decorations, themes, and more!
      </p>
    </div>
  );
};

export default ShopView;
