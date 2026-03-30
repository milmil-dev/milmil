import * as React from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"

type SpinnerProps = Omit<React.ComponentProps<typeof HugeiconsIcon>, "icon"> & {
  size?: number
}

function Spinner({ className, size = 16, ...props }: SpinnerProps) {
  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      size={size}
      className={cn("animate-spin", className)}
      {...props}
    />
  )
}

Spinner.displayName = "Spinner"

export { Spinner }
