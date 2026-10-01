import { cva, type VariantProps } from "class-variance-authority";
import clsx from "clsx";
import { LoaderCircle } from "lucide-react";
import {
  Dialog as DialogPrimitive,
  HoverCard as HoverCardPrimitive,
  Popover as PopoverPrimitive,
  Progress as ProgressPrimitive,
  Slot,
  Switch as SwitchPrimitive,
  Tooltip as TooltipPrimitive,
} from "radix-ui";
import {
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  forwardRef,
  type ReactElement,
  type ReactNode,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
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

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;

export const DialogContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ui-dialog-overlay" />
      <DialogPrimitive.Content
        ref={ref}
        aria-describedby={undefined}
        className={clsx("ui-dialog-content", className)}
        onOpenAutoFocus={(event) => {
          previousFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (!event.defaultPrevented && previousFocus.current?.isConnected) {
            event.preventDefault();
            previousFocus.current.focus();
          }
        }}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
});
DialogContent.displayName = "DialogContent";

export const Switch = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root ref={ref} className={clsx("ui-switch", className)} {...props}>
    <SwitchPrimitive.Thumb className="ui-switch-thumb" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";

export const Input = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<"input">>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={clsx("ui-input", className)} {...props} />
  ),
);
Input.displayName = "Input";

export function Spinner({ label, className }: { label?: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 text-muted-foreground",
        className,
      )}
      role="status"
      aria-label={label || t("filePreview.loading")}
    >
      <LoaderCircle
        className="h-5 w-5 animate-spin motion-reduce:animate-none"
        aria-hidden
      />
      {label && <span>{label}</span>}
    </span>
  );
}

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

export function HoverCard({
  trigger,
  children,
  side = "top",
  align = "center",
  className,
}: {
  trigger: ReactElement;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <HoverCardPrimitive.Root openDelay={150} closeDelay={80}>
      <HoverCardPrimitive.Trigger asChild>{trigger}</HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          className={clsx("ui-popover", className)}
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
        >
          {children}
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
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
