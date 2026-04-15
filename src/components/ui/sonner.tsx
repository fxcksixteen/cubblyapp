import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-xl group-[.toaster]:border group-[.toaster]:shadow-2xl group-[.toaster]:backdrop-blur-sm group-[.toaster]:font-['Nunito',sans-serif]",
          title: "group-[.toast]:text-sm group-[.toast]:font-semibold",
          description: "group-[.toast]:text-xs group-[.toast]:opacity-80",
          actionButton: "group-[.toast]:rounded-lg group-[.toast]:text-xs group-[.toast]:font-semibold group-[.toast]:px-3 group-[.toast]:py-1.5",
          cancelButton: "group-[.toast]:rounded-lg group-[.toast]:text-xs group-[.toast]:font-semibold group-[.toast]:px-3 group-[.toast]:py-1.5",
        },
        style: {
          backgroundColor: "var(--app-bg-secondary, #2b2d31)",
          borderColor: "var(--app-border, #1f2023)",
          color: "var(--app-text-primary, #dbdee1)",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
