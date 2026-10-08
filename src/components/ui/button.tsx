import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold tracking-[0.01em] transition-[transform,box-shadow,background-color,border-color,color,filter] duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded-xl bg-primary text-primary-foreground shadow-[0_1px_2px_hsl(var(--primary)/0.24),0_10px_20px_-10px_hsl(var(--primary)/0.42)] hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_2px_6px_hsl(var(--primary)/0.28),0_18px_32px_-14px_hsl(var(--primary)/0.5)]",
        destructive:
          "rounded-xl bg-destructive text-destructive-foreground shadow-[0_1px_2px_hsl(var(--destructive)/0.28),0_8px_20px_-10px_hsl(var(--destructive)/0.34)] hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_2px_6px_hsl(var(--destructive)/0.3),0_16px_28px_-14px_hsl(var(--destructive)/0.4)]",
        outline:
          "rounded-xl border border-input/80 bg-background shadow-[inset_0_1px_0_hsl(var(--background)),0_1px_2px_hsl(var(--foreground)/0.04)] hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent hover:text-accent-foreground hover:shadow-[0_2px_8px_hsl(var(--foreground)/0.08)]",
        secondary:
          "rounded-xl bg-secondary text-secondary-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] hover:-translate-y-0.5 hover:bg-secondary/85 hover:shadow-[0_2px_8px_hsl(var(--foreground)/0.08)]",
        ghost: "rounded-xl hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        premium:
          "rounded-xl bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.3),0_8px_24px_-8px_hsl(var(--primary)/0.36)] hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_2px_8px_hsl(var(--primary)/0.35),0_20px_38px_-14px_hsl(var(--primary)/0.42)]",
        soft:
          "rounded-xl bg-primary/10 text-primary shadow-[0_1px_2px_hsl(var(--primary)/0.08)] hover:-translate-y-0.5 hover:bg-primary/15 hover:shadow-[0_6px_16px_-10px_hsl(var(--primary)/0.26)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-10 rounded-xl px-3.5 text-xs sm:h-9",
        lg: "h-11 rounded-xl px-6 text-sm",
        icon: "h-10 w-10 rounded-xl",
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
