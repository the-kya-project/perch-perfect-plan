import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Toasts portal to <body>, outside every .setup-frame, so they set DM Sans
// themselves (sonner's own stylesheet would otherwise give them system-ui).
const DM_SANS = '"DM Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // Every toast auto-dismisses on sonner's timer; the close button lets the
      // user clear one early. One shared Toaster, so this covers all toasts.
      closeButton
      style={{ fontFamily: DM_SANS }}
      toastOptions={{
        closeButtonAriaLabel: "Dismiss",
        style: { fontFamily: DM_SANS },
        classNames: {
          // Room on the right for the 44px close button.
          toast:
            "group toast !pr-14 group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          // A 44px tap target (sonner's default X is ~20px). Kept visible on
          // touch (sonner only reveals it on hover, which touch lacks) and
          // matched to the toast's border/foreground tokens.
          closeButton:
            "!size-11 !left-auto !right-1.5 !top-1/2 !-translate-y-1/2 !transform-none opacity-100 group-[.toast]:border-border group-[.toast]:bg-background group-[.toast]:text-foreground [&>svg]:size-4",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
