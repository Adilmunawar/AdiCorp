import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold tracking-[0.005em] transition-[box-shadow,background-color,border-color,color,filter] duration-150 ease-out active:translate-y-px focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded-[10px] bg-gradient-to-b from-brand-600 to-brand-700 text-primary-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.18),0_1px_2px_hsl(var(--brand-900)/0.25),0_6px_14px_-6px_hsl(var(--primary)/0.5)] hover:to-brand-800 hover:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.18),0_1px_2px_hsl(var(--brand-900)/0.3),0_10px_20px_-8px_hsl(var(--primary)/0.55)]",
        destructive:
          "rounded-[10px] bg-destructive text-destructive-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.15),0_1px_2px_hsl(var(--destructive)/0.3)] hover:brightness-95 focus-visible:ring-destructive/20",
        outline:
          "rounded-[10px] border border-border bg-card text-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] hover:border-foreground/15 hover:bg-muted/60",
        secondary:
          "rounded-[10px] bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "rounded-[10px] text-foreground/80 hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        premium:
          "rounded-[10px] bg-gradient-to-br from-brand-500 via-brand-700 to-brand-900 text-primary-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2),0_8px_20px_-8px_hsl(var(--primary)/0.6)] hover:brightness-110",
        soft:
          "rounded-[10px] bg-brand-50 text-primary ring-1 ring-inset ring-brand-100 hover:bg-brand-100 dark:bg-primary/10 dark:ring-primary/20",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-10 rounded-[10px] px-3.5 text-[13px] sm:h-9",
        lg: "h-11 rounded-xl px-6 text-sm",
        icon: "h-10 w-10 rounded-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
