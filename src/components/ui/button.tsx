import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-hover",
        secondary: "border-2 border-primary bg-surface text-primary hover:bg-tint-primary hover:text-primary-hover",
        outline: "border border-border-strong bg-surface text-text hover:bg-bg",
        ghost: "text-primary-hover hover:bg-tint-primary",
        danger: "border-2 border-emergency bg-surface text-emergency hover:bg-tint-emergency",
        emergency: "bg-emergency text-white hover:bg-emergency-hover",
        positive: "bg-accent-strong text-white hover:bg-[#095f5b]",
      },
      size: {
        sm: "min-h-touch px-3 text-sm",
        md: "min-h-touch px-4 text-base",
        lg: "min-h-emergency px-6 text-lg",
        xl: "min-h-glove px-6 text-xl",
        icon: "min-h-touch min-w-touch p-2",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild, loading, disabled, children, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : null}
          {children}
        </>
      )}
    </Comp>
  );
});
