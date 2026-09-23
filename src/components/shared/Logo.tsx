import Image from "next/image"
import { cn } from "@/lib/utils"

/** Shyam Ahuja wordmark (705×125, black on transparent). */
const LOGO_URL = "https://www.shyamahuja.com/cdn/shop/files/IMG_4698.png"
const ASPECT_RATIO = 705 / 125

interface LogoProps {
  /** Rendered height in px; width is derived from the wordmark aspect ratio. */
  height?: number
  /** Invert to white for dark backgrounds (the source art is black). */
  invert?: boolean
  className?: string
  priority?: boolean
}

export default function Logo({ height = 28, invert = false, className, priority }: LogoProps) {
  const width = Math.round(height * ASPECT_RATIO)
  return (
    <Image
      src={LOGO_URL}
      alt="Shyam Ahuja"
      width={width}
      height={height}
      priority={priority}
      className={cn(invert && "invert", className)}
    />
  )
}
