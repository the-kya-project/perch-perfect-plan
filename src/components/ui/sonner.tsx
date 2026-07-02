import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // Every toast auto-dismisses on sonner's timer; the close button lets the
      // user clear one early. One shared Toaster, so this covers all toasts.
      closeButton
      toastOptions={{
        closeButtonAriaLabel: "Dismiss",
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          // Adequate tap target (sonner's default X is ~20px). Keep it always
          // visible on touch (sonner only reveals on hover, which touch lacks)
          // and match the toast's border/foreground tokens.
          closeButton:
            "!size-6 !left-auto !right-2 !top-1/2 !-translate-y-1/2 opacity-100 group-[.toast]:border-border group-[.toast]:bg-background group-[.toast]:text-foreground [&>svg]:size-3.5",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
