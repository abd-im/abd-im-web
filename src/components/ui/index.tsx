import { cva, type VariantProps } from "class-variance-authority";
import clsx from "clsx";
import {
  Popover as PopoverPrimitive,
  Progress as ProgressPrimitive,
  Slot,
  Tooltip as TooltipPrimitive,
} from "radix-ui";
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  forwardRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { twMerge } from "tailwind-merge";

const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      default: "ui-button-default",
      primary: "ui-button-primary",
      ghost: "ui-button-ghost",
    },
    size: { default: "", icon: "ui-button-icon", small: "ui-button-small" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof buttonVariants> & { asChild?: boolean }
>(({ className, variant, size, asChild, type = "button", ...props }, ref) => {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      ref={ref}
      type={type}
      className={twMerge(clsx(buttonVariants({ variant, size }), className))}
      {...props}
    />
  );
});
Button.displayName = "Button";

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={350}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className="ui-tooltip" sideOffset={6}>
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function IconButton({
  label,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size"> & { label: string }) {
  return (
    <Tooltip label={label}>
      <Button variant="ghost" size="icon" aria-label={label} {...props}>
        {children}
      </Button>
    </Tooltip>
  );
}

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  side = "bottom",
  align = "center",
  className,
}: {
  trigger: ReactElement;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className={clsx("ui-popover", className)}
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function CircularProgress({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const normalizedValue = Math.min(100, Math.max(0, value));
  return (
    <ProgressPrimitive.Root
      className={clsx("ui-circular-progress", className)}
      value={normalizedValue}
      aria-label={label}
      style={{ "--ui-progress": normalizedValue / 100 } as CSSProperties}
    >
      <ProgressPrimitive.Indicator className="ui-circular-progress-indicator" />
    </ProgressPrimitive.Root>
  );
}
